---
layout: post
title: An iterator_facade in C++20
desc: In which I remake an old library in a new era
---

The Boost distribution ships a very useful library known as *Boost.Iterator*.
Inside of which, it contains a class template `iterator_facade`:

```c++
template <typename Derived,
          typename Value,
          typename CategoryOrTraversal,
          typename Reference = Value&,
          typename Difference = std::ptrdiff_t>
class iterator_facade;
```

The gist of `iterator_facade` is that it allows you to create
standard-conforming iterator types sans boilerplate. Normally, when you
create an iterator, you require a large amount of boilerplate that is often
redundant (i.e. operations defined in terms of each other). For example, to
support the baseline of `incrementable`, you must supply *two* increment
operators:

```c++
iter& my_iter::operator++() { /* ... */ }
iter  my_iter::operator++(int) {
  auto copy = *this;
  ++*this;
  return copy;
}
```

To support `random_access_iterator`, you require all of these operators:

```c++
reference       iter::operator*();
pointer         iter::operator->(); // Not required, but expected by many
reference       iter::operator[](difference_type);
iter&           iter::operator++();
iter            iter::operator++(int); // May return `void`
iter&           iter::operator--();
iter            iter::operator--(int);
iter&           iter::operator+=(difference_type);
iter&           iter::operator-=(difference_type);
iter            iter::operator+(iter, difference_type);
iter            iter::operator+(difference_type, iter);
iter            iter::operator-(iter, difference_type);
difference_type iter::operator-(iter, iter);
bool            iter::operator==(iter, iter);  // required
bool            iter::operator!=(iter, iter);  // [note]
bool            iter::operator<(iter, iter);   // [note]
bool            iter::operator<=(iter, iter);  // [note]
bool            iter::operator>(iter, iter);   // [note]
bool            iter::operator>=(iter, iter);  // [note]
```

(Operators marked `[note]` can be dropped by C++20 changes that automatically
rewrite certain missing binary operators in terms of existing ones, which may
require an `operator<=>`).

If we wish to support iterator sentinels, we need additional operators:

```c++
bool iter::operator==(iter, sentinel);
bool iter::operator!=(iter, sentinel);
bool iter::operator==(sentinel, iter);
bool iter::operator!=(sentinel, iter);
difference_type iter::operator-(sentinel, iter); // Not required, but useful
```

Additionally, we must provide some typedefs:

```c++
using value_type = ...;
using reference  = ...;  // Optional
using difference_type = ...;
using pointer = ...;   // Optional
using iterator_category = ...; // Make sure you get this right!
using iterator_concept = ...;  // ~*~Fancy~*~ (Optional-ish)
```

The `reference`, `pointer`, and `iterator_concept` types can be deduced from
the other typedefs as part of standard `iterator_traits` machinery, so they
can often be omitted, but if your `operator*` and `operator[]` return
something other than `value_type&`, you *must* set `reference` correctly.
Same goes for `operator->` and `pointer`.


# Boost.Iterator `iterator_facade` to the Rescue!

Instead of defining the dozens of members ourselves, we can have our iterator
class inherit from a specialization of `iterator_facade`, and
`iterator_facade` will provide the full interface of a standard iterator
defined in terms of a few simple member functions we supply on the derived
class:

- `dereference()` returns a `reference` to the iterator's current value.
  **Required in all cases**
- `equal(other_it)` returns `true` if `*this` and `other_it` are at the same
  position in the range. **Required in all cases**
- `increment()` moves the iterator forward one position. **Required in all
  cases**
- `decrement()` moves the iterator backward one position. **Required for
  `bidirectional_iterator`**
- `advance(offset)` moves the iterator `offset` from its current location.
  **Required for `random_access_iterator`**
- `distance_to(other_it)` determines the "distance" to `other_it`, which is
  the number of times we would need to `++it` in order for `equal(other_it)`
  to return `true`. **Required for `random_access_iterator`**

Only six member functions, and only three of them are actually required!
That's a massive improvement! Not only is it simpler to implement an
iterator, there are far fewer places to make mistakes, as `iterator_facade`
implements all operations in terms of these six basis operations.


# An `iterator_facade` in C++20

I was recently finding myself often spamming out boilerplate of iterator
classes over and over again, and I found it tiring. Because of self-inflicted
constraints I wasn't able to pull in `boost::iterator_facade`, as much as I
would like to. So I considered: How hard could it be with C++20?

And the answer is: Surprisingly easy.

Granted, it is still a bit tricky to tackle, but it took far less code than
it would have in C++98 (the C++ version targeted by `boost::iterator_facade`).

Let's walk through it.


# Deduce ALL THE THINGS

Firstly, `boost::iterator_facade` takes five template parameters, three of
which are required. What if we could reduce that down to *one*? We can! It
will take a bit of magic, because we'll need to be able to deduce all of the
iterator traits from the six basis operations, but we can absolutely do it.


# Beginning the Class Template

Let's start simple:

```c++
template <typename Derived>
class iterator_facade {
public:
  using self_type = Derived;

private:
  self_type& _self() {
    return static_cast<self_type&>(*this);
  }
  const self_type& _self() const {
    return static_cast<const self_type&>(*this);
  }
};
```

Our class is defined using the [CRTP](https://en.wikipedia.org/wiki/Curiously_recurring_template_pattern) idiom. Since we know that `Derived` is
a subclass of our own class, we can safely `static_cast` ourself *into* that
class. Because it will be used repeatedly, I add the local typedef
`self_type`, which I find easier on the eyes (we could just as well use
`Derived` in its place).

It is also important to keep in mind that, throughout the body of
`iterator_facade`, `self_type` is an incomplete class and cannot be used in a
way that would require a definition as part of a declaration. We can,
however, use `self_type` fully within the body of any member function of the
class.

To go along with this, let's define our custom iterator in lock-step. Our
simple iterator will iterate through the months in a year:

```c++
enum class month : int {
  january, february, march, april,
  may, june, july, august, september,
  october, november, december,
};
std::string to_string(month);

class month_iterator : iterator_facade<month_iterator> {
  month _cur = month::january; // Begin at January

public:
  month_iterator() = default;
  explicit month_iterator(month m) : _cur(m) {}

  // Become a range of months:
  auto begin() const { return *this; }
  auto end() const {
    // Return a "month after december" to represent the end
    auto after_december = int(month::december) + 1;
    return month_iterator(month(after_december));
  }

  // Three minimum-required APIs
  const month& dereference() const {
    return _cur;
  }
  void increment() {
    _cur = month(int(_cur) + 1);
  }
  bool equal_to(month_iterator o) const {
    return _cur == o._cur;
  }
};
```

The first (and most important) API of an iterator is the dereference
operator, `operator*`. We simply implement this in terms of `dereference()`:

```c++
class iterator_facade {
   // ...
public:
  decltype(auto) operator*() const {
    return _self().dereference();
  }
}
```

Ta-da! Our `month_iterator` is now `indirectly_readable`, one of the most
basic concepts in the standard library:

```c++
month_iterator mo_it;
assert(*mo_it == month::january);
```

Note the use of `decltype(auto)` on `operator*`. This is actually
*mandatory*: There is no way to know the return type of
`_self().dereference()` at this point in the class definition, as `self_type`
is still an incomplete class.


# Shooting Arrows

An arrow `->` operator isn't required for most iterator operations, but a lot
of times people will expect it. We can add one:

```c++
  auto operator->() const {
    return std::addressof(**this);
  }
```

**Stop!** You have violated the law!

We are returning a pointer to whatever is returned from `operator*`, but
there is no guarantee that it is actually a reference. Iterators are within
their right to return a value type or a fancy reference. In such a case,
`std::addressof()` will be returning an address to the temporary object
returned by `operator*` and the pointer will be invalid by the time the
function returns.

Fortunately, this is a solved problem, and we can eat our cake and have it
too. We just need to use an [`arrow_proxy`](https://quuxplusone.github.io/blog/2019/02/06/arrow-proxy/). I'll elide the definition here, but here's how
our `operator->` can look:

```c++
  auto operator->() const {
    decltype(auto) ref = **this;
    if constexpr (std::is_reference_v<decltype(ref)>) {
      // `ref` is a true reference, and we're safe to take its address
      return std::addressof(ref);
    } else {
      // `ref` is *not* a reference. Returning its address would be the
      // address of a local. Return that thing wrapped in an arrow_proxy.
      return arrow_proxy(std::move(ref));
    }
  }
```

Like with `operator*`, we *cannot* possibly know the return type of
`operator->` until after we have a complete definition of `self_type`. We
must use a deduced return type.

And thus, we now have a working `operator->` for all iterator types,
regardless of the type of `operator*`.


# More Iterator-ish

That's pretty good, but it could hardly be called an "iterator." The next
important iterator method is to see if two iterators are equivalent:

```c++
  friend
  bool operator==(const self_type& left,
                  const self_type& right) {
    return left.equal_to(right);
  }
```

Here's a first bit of magic: We've added `operator==` as a "hidden friend"
function of the class. This has a two effects:

- This `operator==` will not participate in overload resolution except as
  part of ADL for the enclosing class (or its derived classes).
- We can use `self_type` references directly as opposed to `iterator_facade`
  and invoking `_self()` to get the underlying iterator.

Because of C++20's operator-rewrite rules, this `operator==` will also allow
us to write `it != other_it`, as the compiler will add `!(it == other_it)` to
the set of candidate rewrites for that expression.


# Moving Forward

This is still not quite an iterator. We're missing one more required
interface to become a `forward_iterator`: prefix-increment. This is easy too:

```c++
  self_type& operator++() {
    _self().increment();
    return _self();
  }
```

Not bad! We now have a `forward_iterator`:

```c++
int main() {
  for (auto m : month_iterator()) {
    std::cout << to_string(m) << '\n';
  }
}
```

Our iterator now supports prefix-increment, but people often write
post-increment too. As we would in boilerplate, we can implement that one in
terms of prefix-increment:

```c++
class iterator_facade {
  // ...
  self_type operator++(int) {
    auto copy = _self();
    ++*this;
    return copy;
  }
};
```


# Stepping Back

Forward iterators are cool and all, but what if we want to rewind for a bit?
In order for this to work, we need a `decrement()` on our derived class:

```c++
class month_iterator {
  // ...
  void decrement() {
    _cur = month(int(_cur) - 1);
  }
};
```

Now we need an `operator--` as part of our `interface_facade`, but we only
want it to be available if the subclass as a `decrement` method. Simple
enough, add a constraint to the member function defining the operator:

```c++
template <typename T>
concept impls_decrement = requires(T it) { it.decrement(); };

class iterator_facade {
  // ...
  self_type& operator--()
    requires impls_decrement<self_type>
  {
    _self().decrement();
    return _self();
  }

  // Postfix:
  self_type operator--(int)
    requires impls_decrement<self_type>
  {
    auto copy = *this;
    --*this;
    return copy;
  }
};
```

(Read "impls" as "implements".)

The `impls_decrement` concept is, by itself, not a very good concept.
However, it is useful within in the limited scope of our `iterator_facade`,
and it is less typing that typing the full `requires`-expression every time.

With these changes, we now have a `bidirectional_iterator`:

```c++
int main() {
  month_iterator it;
  print(to_string(*it)); // January
  ++it;
  print(to_string(*it)); // February
  --it;
  print(to_string(*it)); // January
}
```


# I Have Made an Lies

While our iterator *looks* like an iterator, and behaves like an iterator in
a few important ways, there's something missing: `std::iterator_traits`.

If you ask for `std::iterator_traits<month_iterator>::value_type` right now,
you'll get an error because there is no `value_type` type member.
`std::iterator_traits` cannot see through our `iterator_facade` to the actual
iterating capabilities underneath. Usually, we'd just define a type member
`value_type` on our iterator, but we can't do that here: `self_type` is the
only one who knows the `value_type`, and `self_type` is incomplete within
`iterator_facade`. We *can't know* `self_type::value_type` until *after* the
full definition of `self_type` is available.

Luckily, we have an out: We are allowed to specialize `iterator_traits` for
user-defined types! Our specialization will be a partial specialization for
any class that is derived from an `iterator_facade` specialized on itself:

```c++
template <typename Iter>
  requires std::is_base_of_v<iterator_facade<Iter>, Iter>
struct iterator_traits<Iter> {
  // ...
};
```

This partial specialization of `iterator_traits` will be preferred over the
primary definition because it is *more specialized* than the primary
definition by the addition of the `requires`-clause after the template-head.
It will only be selected if `Iter` derives from `iterator_facade<Iter>`.

In order to properly specialize `iterator_traits`, we need five (or six) type
members:

- `reference` is the return type of `operator*` *exactly*, and need not be an
  actual reference.
- `value_type` is the referred-to type of `reference`, minus all top-level
  `const`/`volatile` qualifiers.
- `pointer` is the return type of `operator->` *exactly*, and need not be an
  actual pointer.
- `difference_type` is the type that can represent the distance between two
  iterators.
- `iterator_category` is a type tag representing the capabilities of the
  iterator.
- `iterator_concept` is an extension of `iterator_category` that can
  represent even fancier iterators for C++20 and beyond.

Of the above, two of them are simple enough to define via `decltype()`:

```c++
struct iterator_traits {
  static const Iter& _it;
  using reference = decltype(*_it);
  using pointer   = decltype(_it.operator->());
};
```

The other three, however, will take some trickery:


## Deducing `difference_type`

It'd be simple enough to just slap `std::ptrdiff_t` everywhere, and we'd
probably get away with it for a while, but we can do better and deduce it
correctly, if possible.

Consider the six basic functions. Which of them would give us the information
we need?

`distance_to()` of course! It takes one iterator, and returns the difference
between them. It's return type is the only sensible answer:

```c++
  using difference_type = decltype(_it.distance_to(_it));
```

Simple enough, right? **WRONG**

`distance_to()` is an optional method of the iterator, and doesn't make sense
for things like `input_iterator`. If the iterator does not provide a
`distance_to()`, we need a default. Let's match `boost::iterator_facade` and
the rest of the standard library iterators: Use `ptrdiff_t`.

But how can we tell whether the iterator has a `distance_to`? We use a
`requires` expression:

```c++
requires (const T it) {
  it.distance_to(it);
};
```

This expression will yield `true` if-and-only-if `it` has a member
`.distance_to` that can be invoked with another instance of `const T`. We
check `const` because `distance_to` must be a non-modifying operation. It'd
be preferable if we can wrap this requires-expression in a concept:

```c++
template <typename T>
concept impls_distance_to = requires (const T it) { it.distance_to(it); };
```

By itself, `impls_distance_to` is a very poor concept, but as a utility it
will be remarkably useful. We'll need this one later.

Now, to create an `infer_difference_type_t` based on `impls_distance_to`
using a class template partial specialization:

```c++
// Base case
template <typename>
struct infer_difference_type { using type = std::ptrdiff_t; };

// Case when `T` provides a `distance_to`
template <impls_distance_to T>
struct infer_difference_type<T> {
  static const T& it;
  using type = decltype(it.distance_to(it));
};

template <typename T>
using infer_difference_type_t = infer_difference_type<T>::type;
```

Success! We can now deduce the difference type of an iterator automatically!

```c++
struct std::iterator_traits {
  // ...
  using difference_type = infer_difference_type_t<Iter>;
};
```

Note that because `self_type` is incomplete within `iterator_facade`, we
cannot use `infer_difference_type_t` from `iterator_facade`. By the time we
instantiate `iterator_traits` we'll have the full definition and
`infer_difference_type_t` will work just fine.


## Deducing `value_type`

Getting `value_type` is a bit different. We can have a base case:

```c++
template <typename T>
struct infer_value_type {
  static const T& _it;
  using type = std::remove_cvref_t<decltype(*_it)>;
};
```

This base case will suffice if the iterator always returns a regular
reference or value from its `operator*`, but we must assume that the return
type could be a smart/fancy reference, in which case we will be unable to
infer the actual `value_type`. In those cases, the derived class must give us
a hint and define its own `value_type`. We can detect that hint with a
partial specialization:

```c++
template <typename T>
  requires requires { typename T::value_type; }
struct infer_value_type {
  using type = T::value_type;
};

template <typename T>
using infer_value_type_t = infer_value_type<T>::type;
```

And we use this in `iterator_traits`:

```c++
struct std::iterator_traits {
  // ...
  using value_type = infer_value_type_t<Iter>;
};
```


## Deducing `iterator_category`

We've defined the first four type members, but we'll need `iterator_category`
to finish. How do we know what it should be? We *could* re-implement all of
the iterator concepts, or we could just check the basis APIs we require on
the derived class and use their presence to set our iterator category. That's
much simpler!

```c++
// Check for .decrement
template <typename T>
concept impls_decrement = requires (T t) { t.decrement(); };

// Check for .advance
template <typename T>
concept impls_advance =
  requires (T it, const infer_difference_type_t<T> offset) {
    it.advance(offset);
  };

// Check for .equal_to
template <typename T>
concept impls_equal_to
  requires (const T it) {
    { it.equal_to(it) } -> boolean;
  };

// We can meet "random access" if it provides
// both .advance() and .distance_to()
template <typename T>
concept meets_random_access =
  impls_advance<T> &&
  impls_distance_to<T>;

// We meet `bidirectional` if we are random_access, OR we have .decrement()
template <typename T>
concept meets_bidirectional =
     meets_random_access<T>
  || impls_decrement<T>;

// Detect if the iterator declares itself to be a single-pass iterator.
// (More on this later.)
template <typename T>
concept decls_single_pass = bool(T::single_pass_iterator);
```

With these concepts, we can pick the correct iterator category using
`conditional_t`. This is our final `iterator_traits`:

```c++
template <typename Iter>
  requires std::is_base_of<iterator_facade<Iter>, Iter>
struct std::iterator_traits<Iter> {
  static const Iter& _it;
  using reference       = decltype(*_it);
  using pointer         = decltype(_it.operator->());
  using value_type      = infer_value_type_t<Iter>;
  using difference_type = infer_difference_type_t<Iter>;

  using iterator_category =
    conditional_t<
      meets_random_access<Iter>,
      // We meet the requirements of random-access:
      random_access_iterator_tag,
      // We don't:
      conditional_t<
        meets_bidirectional<Iter>,
        // We meet requirements for bidirectional usage:
        bidirectional_iterator_tag,
        // We don't:
        conditional_t<
          decls_single_pass<Iter>,
          // A single-pass iterator is an input-iterator:
          input_iterator_tag,
          // Otherwise we are a forward iterator:
          forward_iterator_tag
        >
      >
    >;

  // Just set this to the iterator_category, for now
  using iterator_concept = iterator_category;
};
```


# Not a Regular Iterator, an `advance`d Iterator

The next basis operator we want will be `operator+=`, as we can implement
many of the random-access methods in terms of `+=`.

`operator+=` is itself defined in terms of `self_type`'s `advance` method.
The `advance()` method takes a signed integer `offset` and shifts the
iterator by that offset. Here it is in `month_iterator`:

```c++
class month_iterator {
  // ...
  void advance(int offset) {
    _cur = month(int(_cur) + offset);
  }
};
```

And now we can use it in `iterator_facade`:

```c++

class iterator_facade {
  // ...

  friend self_type&
  operator+=(self_type& self, /* ???? */ offset)
    requires impls_advance<self_type>
  {
    self.advance(offset);
    return self;
  }
};
```

We've immediately hit a road-block. For random-access iterators, the type
that is used for the offset operand is the `difference_type` of the iterator.
Can we use our `infer_difference_type_t`?

```c++
  self_type& operator+=(self_type& self,
                        infer_difference_type_t<self_type> offset);
```

Not so fast! This is an immediate context and therefore the type of
`infer_difference_type_t<self_type>` must be immediately known, but that
*cannot* be known because `self_type` is incomplete.

Can we change this to use a deduced argument type?

```c++
  friend self_type& operator+=(self_type& self, auto offset)
    requires impls_advance<self_type>
  {
    self.advance(offset);
    return self;
  }
```

Yes? But it won't be nice, as now our `operator+=` will accept any argument
on the right-hand side, regardless of whether it makes sense:

```c++
month_it += "lolwut?";
```

and we'll get a nasty compile error instead of having the `+=` operator have
no candidates. This was the old way, and it is not "SFINAE"-friendly, and
therefore break's `requires`-expressions that check:

```c++
template <typename T, typename Addend>
concept can_add = requires (T t, Addend a) { t += a; };
```

`can_add` will return `true` *regardless* of the type of `Addend`, because
the `requires` expression isn't going to look into the *definition* of
`operator+=`, it will only see that there is a valid *declaration* of
`operator+=`.

We need to somehow declare a later-deduced parameter type that is still
*constrained* to be a type that we don't *yet* know. Can we do it?

Yes!

```c++
template <typename Arg, typename Iter>
concept difference_type_arg =
  convertible_to<Arg, infer_difference_type_t<Iter>>;
```

This is a poor concept on its own, but we can use it to do
~\*~\*~magic~\*~\*~!

```c++
class iterator_facade {
  // ...
  template <typename D>
    requires (difference_type_arg<D, self_type> &&
              impls_advance<self_type>)
  friend self_type& operator+=(self_type& self, D offset) {
    self.advance(offset);
    return self;
  }
};
```

Or, simplified:

```c++
class iterator_facade {
  // ...
  template <difference_type_arg<self_type> D>
  friend self_type& operator+=(self_type& self, D offset)
    requires impls_advance<self_type>
  {
    self.advance(offset);
    return self;
  }
};
```

Or, simplified again:

```c++
class iterator_facade {
  // ...
  friend self_type&
  operator+=(self_type& self,
             difference_type_arg<self_type> auto offset)
    requires impls_advance<self_type>
  {
    self.advance(offset);
    return self;
  }
};
```


With this, `operator+=` becomes a function template with a deduced right-hand
parameter `offset`. If the type `D` deduced for `offset` does not meet
`difference_type_arg<D, self_type>`, then this function is removed from the
overload set.

What is `difference_type_arg<D, self_type>`? It is satisfied if `D` is
implicitly convertible to `infer_difference_type_t<self_type>`.
`infer_difference_type_t<self_type>` is the return type of
`self_type::distance_to` (if present), or `std::ptrdiff_t`.

With this slight-of-hand, we are able to declare a function that takes a
parameter *of a type that we can't possibly know yet*. The compiler sees this
as a constrained function template, but we can think of it as a function with
a yet-to-be-determined parameter type.

And of course, this is all SFINAE (and `requires`-expression) friendly.

Upon the back of `+=` and with the help of `difference_type_arg`, we can
define the remaining random-access iterator advancing routines:

```c++
  friend self_type
  operator+(self_type left, difference_type_arg<self_type> auto off)
    requires impls_advance<self_type>
  {
    return left += off;
  }

  friend self_type
  operator+(difference_type_arg<self_Type> auto off, self_type right)
    requires impls_advance<self_type>
  {
    return right += off;
  }

  friend self_type
  operator-(self_type left, difference_type_arg<self_type> auto off)
    requires impls_advance<self_type>
  {
    return left + -off;
  }

  friend self_type&
  operator-=(self_type& left, difference_type_arg<self_type> auto off)
    requires impls_advance<self_type>
  {
    return left = left - off;
  }

  decltype(auto) operator[](difference_type_arg<self_type> auto off)
    requires impls_advance<self_type>
  {
    return *(_self() + pos);
  }
```


# Where Am I?

The last requirement of random-access iterators is that you be able to figure
their position relative to each other using the `<` infix operator, and tell
the distance between them with the minus `-` infix operator (as you can with
pointers).

For this, we start with `-`. Given pointers' `operator-`, assuming that the
left-hand has the higher address, we know that the "difference" is the number
of times we would need to increment the right-hand to become equivalent to
the left. If the left-hand is at the lower address, then the "difference" is
the number of times we would *decrement* the right-hand to reach the
left-hand. If we consider a decrement as a "negative increment", then we can
say, that in either case, the "difference" between two pointers is the number
of times the right-hand pointer must be incremented to reach the left-hand
pointer.

```c++
  friend self_type&
  operator-(const self_type& left, const self_type& right)
    requires impls_distance_to<self_type>
  {
    // Many many times must we `++right` to reach `left` ?
    return right.distance_to(left);
  }
```

And we can define `operator<=>` in terms of `-`.

```c++
  friend auto
  operator<=>(const self_type& left, const self_type& right)
    requires impls_distance_to<self_type>
  {
    return (left - right) <=> 0;
  }
```

Thanks to C++20 infix-operator rewrite rules, the entirety of the remaining
comparison operators are automatically available through `<=>` and `==` alone.

With that, our iterator is now a full-fledged `random_access_iterator`.


# Removing Redundancy

In total, here is `month_iterator`:

```c++
class month_iterator : iterator_facade<month_iterator> {
  month _cur = month::january;
public:
  month_iterator() = default;
  explicit month_iterator(month m) : _cur(m) {}

  auto begin() const { return *this; }
  auto end() const { return month_iterator(month(int(month::december) + 1)); }

  void increment()      { _cur = month(int(_cur) + 1); }
  void decrement()      { _cur = month(int(_cur) - 1); }
  void advance(int off) { _cur = month(int(off) + off); }

  const month& dereference() const { return _cur; }

  bool equal_to(month_iterator other) const {
    return _cur == other._cur;
  }

  int distance_to(month_iterator other) const {
    return int(other._cur) - int(_cur);
  }
};
```

Maybe you notice that `increment()`, `decrement()` and `advance()` all look
awfully similar. Of course, `increment()` and `decrement()` can be
implemented in terms of `advance(1)` and `advance(-1)`, respectively. It
would be nice if we could just toss those when we have a perfectly good
`advance()` lying around. We'll need to tweak the definitions of
`operator++()` and `operator--()`, though:

```c++
class iterator_facade {
  // ...
  self_type& operator++() {
    if constexpr (impls_increment<self_type>) {
      // Prefer .increment() if available
      _self().increment();
    } else {
      static_assert(
        impls_advance<self_type>,
        "Iterator subclass must provide either "
        ".advance() or .increment()");
      _self() += 1;
    }
    return _self();
  }
  // ...
  self_type& operator--() {
    if constexpr (impls_decrement<self_type>) {
      // Prefer .decrement() if available
      _self().decrement();
    } else {
      static_assert(
        impls_advance<self_type>,
        "Iterator subclass must provide either "
        ".advance() or .decrement()");
      _self() -= 1;
    }
    return _self();
  }
};
```

We could also toss the requirement of `equal_to(o)` and replace it with
`distance_to(o) == 0` if possible. This takes more changes:

```c++
  friend bool operator==(const self_type& left, const self_type& right) {
    if constexpr (impls_equal_to<self_type>) {
      return left.equal_to(right);
    } else {
      static_assert(impls_distance_to<self_type>,
                    "Iterator must provide `.equal_to()` "
                    "or `.distance_to()`");
      return left.distance_to(right) == 0;
    }
  }
```

With these changes, we can create full `random_access_iterator`s with *only
three* member functions:

- `dereference()` to get the thing out.
- `distance_to(o)` to find the distance to `o`.
- `advance(off)` to move `off` from the current position.


# Sentinel Support

C++20 ranges support the idea of an iterator *sentinel*, a special type of
object that is used to signal the end of a range. A sentinel type is
equality-comparable to the iterator that supports it, and is equivalent to
asking the iterator "are you done yet?"

Suppose we had an "until 7" iterator that would represent the half-open range
`[0, 7)`. While we could implement the `end()` as a regular iterator, that
would require that the end-iterator store some state that represents its
"end"-ness. Whereas a sentinel type represents the "end"-ness as part of its
own type. This allows better type checking by a compiler, and can optimize
better since it is (usually) an empty class type.

```c++
struct until_7_iter : neo::iterator_facade<until_7_iter> {
  int value = 0;

  int  dereference() const { return value; }
  int  distance_to(until_7_iter o) const { return *o - value; }
  void advance(int off) { value += pos; }
};
```

This is a fully-functional `random_access_iterator` with four lines of code
in the class body. Pretty good. But how do we make it stop when we reach `7`?

To support a sentinel for our iterator, we need to add support for it in
`iterator_facade`:

```c++
class iterator_facade {
  // ...
  friend bool operator==(const self_type& self, /* Huh? */ sentinel) {
    /* ??? */
  }
};
```

We need this overload to match when the right-hand is a sentinel type. We've
again hit a snag: How do we know the sentinel type of our derived class, or
whether that class *even has* a sentinel type? If it *does* support a
sentinel type, how how do we check whether we've actually reached the end of
the range?

We need to break out some of the same old tricks we used with
`difference_type` and `value_type`.

Let's add two new customization points:

- `self_type::sentinel_type` can be provided to support sentinels for the
  underlying range.
- `.at_end()` must return a `bool` determining whether the iterator has
  reached the end of the range.

Together, these will indicate that the iterator supports sentinels.

So we have the body of our `operator==`:

```c++
  friend bool operator==(const self_type& self, /* ??? */ sentinel) {
    return self.at_end();
  }
```

To match the `sentinel` parameter, we use the same trick that we used for
`difference_type`:

```c++
template <typename Iter, typename T>
concept iter_sentinel_arg = same_as<T, typename T::sentinel_type>;
```

and:

```c++
  friend bool operator==(const self_type& self,
                         iter_sentinel_arg<self_type> auto) {
    return self.at_end();
  }
```

(We can omit a parameter name because we aren't even using it in the function
body.)

With this overload, we can write four different equality check operators with
the sentinel type.

Here's how we add support to our `until_7_iter`:

```c++
struct until_7_iter : neo::iterator_facade<until_7_iter> {
  // ...
  struct sentinel_type {};
  bool at_end() const { return value == 7; }
};
```

An `until_7_range` could look like this:

```c++
struct until_7_range {
  auto begin() const { return until_7_iter{}; }
  auto end() const { return until_7_iter::sentinel_type{}; }
};
```

And would work just as any normal range:

```c++
for (auto n : until_7_range{}) {
  // ...
}
```

<div class="aside note" markdown="1">
Implementing `operator-` for sentinels is straightforward, but has been left
as an exercise for the reader.
</div>


# Single-Pass Iterators

Some iterators are "single-pass", more often called `input_iterator`s. These
are iterators that yield objects as you advance them, but each advance will
invalidate all prior references obtained through the iterator, and making a
copy of the iterator will not actually retain any state when we advance the
original.

We created a simple concept `decls_single_pass`, which is a simple opt-in for
derived classes to declare that they behave in this fashion. The only
important change we need to make is to tweak postfix-increment. Handing back
a copy of the "unmodified" original iterator from before the increment isn't
meaningful. Instead, we can return `void`:

```c++
class iterator_facade {
  // ...
  auto operator++(int) {
    if constexpr (decls_single_pass<self_type>) {
      ++*this;
    } else {
      auto copy = _self();
      ++*this;
      return copy;
    }
  }
};
```

With that change, we have implemented all of the basic iterator kinds except
`contiguous_iterator` and `output_iterator`, which I will leave as an
exercise to you, dear reader.


# Bonus: Deduced `this`?

All of the above comes standard in C++20. What if we could make
`iterator_facade` a non-template `class` entirely?

There's been a proposal floating around for some time that would permit
template argument deduction for the type of the `this` pointer. That is, when
we invoke a member function template on a class, the type of the object on
the left-hand side of the `.` would be available for template argument
deduction:

```c++
class my_class {
  template <typename SelfType>
  void foo(this SelfType self);
};
```

The member function template `my_class::foo` can deduce the type of the
object on which `foo` was invoked, including if `foo` is invoked through a
reference to a derived class.

If we had this functionality, our `iterator_facade` could implement its
member functions entirely as function templates with deduced-`this`. For
example, three of the member functions rewritten with deduced-`this`:

```c++
// Not a class template
class iterator_facade {
public:
  decltype(auto) operator(this const auto& self) {
    return self.dereference();
  }

  template <typename SelfType>
  decltype(auto) operator[](this const SelfType& self,
                            difference_type_arg<SelfType> auto off) {
    return *(self + off);
  }

  template <typename SelfType>
  SelfType& operator++(this SelfType& self) noexcept {
    if constexpr (detail::iter_has_increment_method<SelfType>) {
      // If there is an increment(), assume it is the most efficient way to
      // advance, even if we have an advance()
      self.increment();
    } else if constexpr (detail::iter_is_random_access<SelfType>) {
      // Just offset by one
      self += 1;
    } else {
      // Bad!
      static_assert(detail::iter_is_random_access<SelfType>,
                    "Iterator subclass must provide an `increment` or `advance(n)` method");
    }
    return self;
  }
  // ...
};
```

(This is just a small sampling of the techniques possible with
deduced-`this`. I recommend checking [the proposal](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2020/p0847r4.html) for more information.)