---
layout: post
title: "Fun with Concepts: Do You Even Lift, Bool?"
desc: In which I write a stronger boolean type
---

> Sorry to anyone expecting another novel-length blog post. This one will be
> "relatively short" (Read: Still very long).

Arthur O'Dwyer recently wrote
[a blog post about function overloading in C++](https://quuxplusone.github.io/blog/2020/10/11/overloading-considered-harmful/).
I recommend giving it a read, as it can spell out some of the pitfalls involved
with providing function overloads with significantly disparate behavior. (I'll
assume that the slug "overloading-considered-harmful" is simply a tough-in-cheek
nod to the infamous "considered harmful" meme.)

The example in Arthur's post specifically involves a "refactoring gone wrong,"
wherein a benign-looking refactoring of the code causes overload selection to
subtly choose a different overload. Specifically, it looks something like this:

```c++
void foo(std::string);  // [1]
void foo(bool);         // [2]

void meow() {
    foo(std::string("I am a string")); // Calls [1]
    foo("lol nope");  // Calls [2] !!
}
```

The basic explanation is that overload resolution ranks overload candidates to
determine the "best match."

- The first call to `foo` passes a `std::string` that is explicitly constructed
  from a character array, thus we get no surprise that we call the string
  overload of `foo`.
- The second call to `foo` passes a *character array directly*. There is no
  overload of `foo` that accepts a character array, so we need to choose which
  of the candidates is the "best match."
  - The first overload of `foo` takes a `std::string`. The compiler checks if we
    can do a conversion from the character array to `std::string`, and finds
    that *yes, we can* by decaying the array to a pointer and passing that
    pointer to the constructor of `std::string`.
  - The second overload of `foo` takes a `bool`. The compiler sees that there's
    a conversion from any pointer type to `bool`. The character array will
    eagerly decay to a pointer, and we can convert that pointer to `bool`.
  - *Both overloads* are valid candidates, but which one is a *better match?*
    - In the face of these two possible conversions, one is *program-defined*:
      The conversion from the character pointer to a `std::string`
    - The other conversion is *language-defined*: The conversion from a pointer
      to a `bool`
    - When given a program-defined conversion and a language-defined conversion,
      the language-defined conversion is a *preferred*.
    - Thus, the call `foo("lol nope")` will call `foo(bool)` as-if we had
      written `foo(true)`.

I'll fall into the stereotype of the C++ programmer and blame this **wat** on C
legacy, wherein many types happily convert between each other.


# Typing

Like the `foo` written above, the word "typing" has also been overloaded:

- *Static* typing is opposed to *dynamic* typing. This means that declarations
  have *types* that are fixed. C and C++ are *statically* typed programming
  languages. Other examples include Java, C#, TypeScript, and Haskell.
- *Dynamic* typing is the opposite of static typing, and means that the types of
  a declaration can vary at runtime. Examples include Python, JavaScript, Ruby,
  and Erlang.
- *Strong* typing is opposed to *weak* typing. It refers to a type system that
  strictly enforces type compatibility.
- *Weak* typing is opposed to strong typing, and refers to a type system that
  allows some intermixing and implicit converting between types.


## Not So Binary

For any type system, it is generally impossible to declare "Language X is
strongly typed," because most languages fall along a spectrum between
weak/strong typing and static/dynamic typing. It is important to also recognize
that the relationship between being type *strong* versus being type *static*
is completely orthogonal.

For example, Python is dynamically typed, but it is also very *strongly* typed.
Python will not implicitly convert types in a "best guess" to make things work.
It will instead yell at you:

```py
v = 12
s = 'There are ' + v + ' monkeys jumping on the bed.'
```

results in an exception:

> `TypeError: must be str, not int`

On the other hand, JavaScript is dynamically typed *and* weakly typed. Giving
the above Python code to a JavaScript interpreter results in a valid value for
`s`:

> `"There are 12 monkeys jumping on the bed."`

JavaScript will happily see you attempting to add a string to a number, and will
implicitly convert that number to a string in order to perform the
concatenation.
[This can lead to some strange (and amusing) results](https://www.destroyallsoftware.com/talks/wat).


## C ?

So, does C have a *weak* type system, or a *strong* type system?

As noted, there is no "either/or" answer. The following example is a hard-error:

```c
struct foo {};
struct bar {};

void bark(struct foo p);

void meow() {
    struct foo f;
    struct bar b;
    bark(b);  /* <-- Error: Incompatible type for argument one */
}
```

The compiler will not convert the `bar` instance into a `foo` instance, as such
a mechanical conversion is nonsensical. However, if we change the parameter to
`bark` to be a pointer:

```c
struct foo {};
struct bar {};

void bark(struct foo* p);

void meow() {
    struct foo f;
    struct bar b;
    bark(&b);  /* <-- Okay! */
}
```

The compiler will happily convert the `bar*` into a `foo*`. Any decent compiler
will issue a warning, but it is otherwise required to accept the above code.


## C++ ?

While C++ inherits a lot from C, it decided to *stengthen* its type checking,
and the prior C code will actually be *rejected* by a C++ compiler.

However, there are a few places where C's implicit conversions remain, and (as
we saw in the first example and in Arthur's blog post) they can still come back
to bite us.


### Why Pointer to Bool?

Note that the first example involved a conversion of a pointer to a `bool`. This
is inherited from C, and comes from this common idiom:

```c
void foo(struct bar* ptr) {
  if (ptr) {  /* Is 'ptr' a NULL pointer? */
    do_something(ptr);
  } else {
    do_other_thing();
  }
}
```

The "implicit bool" is such a pervasive idiom that it permeates most programming
languages today. Even Python's otherwise strong type system inherits this
implicit-conversion behavior:

```py
def foo(val: int) -> None:
  if val:  # Is 'val' non-zero?
    do_something(val)
  else:
    do_other_thing()

def bar(name: str) -> None:
  if name:  # Is 'name' non-empty?
    do_something(name)
  else:
    do_other_thing()
```


# Controlling Type Conversions

C++ offers the ability to define conversions between class types and any other
type by way of two special member functions, (1) the *conversion constructor*
and (2) the *conversion operator*:

```c++
class widget {
    // 1: Implicitly convert from 'gadget' to a 'widget'
    widget(gadget);
    // 2: Implicitly convert from 'widget' to a 'gadget'
    operator gadget();
};
```

With these two functions defined, we could say there is "weak typing" between
`widget` and `gadget`. Weak typing is not inherently bad, but must be used with
*extreme care*. If you have any doubts, *do not write the implicit conversion
functions*.

While we have *implicit* conversion methods, C++ also offers us a way to provide
*explicit* conversion methods:

```c++
class widget {
    // 1: Explicitly convert from 'gadget' to a 'widget'
    explicit widget(gadget);
    // 2: Explicitly convert from 'widget' to a 'gadget'
    explicit operator gadget();
};
```

The explicit variants should always be the first choice.

> **NOTE:** Be especially aware that *any constructor* callable with a single
> argument becomes an *implicit converting constructor!*
>
> ```c++
> class user {
>   user(string name, optional<address> addr = nullopt);
> };
> ```
>
> In the above, *even though* the constructor accepts two arguments, since it is
> callable with one argument, it will *implicitly convert* a `string` into a
> `user`!
>
> I have all too often seen developers unwittingly write a class constructor
> accepting a single argument, not knowing just how dangerous it is.
>
> This is how C++ has been since the beginning, and is now "widely regarded as
> a bad move." If we could do it all over again, we'd drop the `explicit`
> specifier for an `implicit` keyword that has the inverse behavior.


# Building a Better `bool`, using... *Concepts?*

C++ has a difference from many other languages in that program-defined types
play in the type system almost identically to the language's builtin types.
There is no additional overhead (e.g. garbage collection, boxing, dynamic
dispatch) involved unless it is requested.

We also get to define how we interconvert between other types. This leads to a
question: *Can we make a better `bool`?*

The answer has been "yes" for a long time, but with C++ Concepts, we can write
one more concise, more simple, and better behaved than ever before. I present, a
better `bool`:

```c++
struct boolean {
  bool _val;

  // [1]
  template <convertible_to<bool> T>
    explicit(!same_as<T, bool>)
  constexpr boolean(T b) noexcept
        : _val(b) {}

  // [2]
  template <constructible_from<bool> T>
    explicit(!same_as<bool, T>)
  constexpr operator T() const noexcept
    { return T(_val); }

  // [3]
  constexpr boolean operator!() const noexcept
    { return !_val; }

  // [4]
  constexpr boolean operator==(bool other) const noexcept
    { return bool(*this) == other; }
  constexpr boolean operator!=(bool other) const noexcept
    { return bool(*this) != other; }

  // [5]
  constexpr auto operator<=>(bool other) const noexcept
    { return bool(*this) <=> other; }
};
```

Let's walk through this thing.


## 1: The *converting constructor*:

```c++
template <convertible_to<bool> T>
  explicit(!same_as<T, bool>)
constexpr boolean(T b) noexcept;
```

This is a function template constrained to accept any type that is convertible
to `bool`, with a *conditional* `explicit` depending on whether the argument is
a `bool`. If the argument is a `bool`, we allow the conversion to be implicit,
otherwise it must be an explicitly requested conversion.

This begs the question: Why not a *non-template* constructor with parameter type
`bool`? The answer is that we would then be allowing any type that implicit
converts to `bool` to implicitly convert to `boolean`.

For example, if the constructor were `boolean(bool b)`, then attempting to
`boolean v = 12` would see the compiler simply implicitly converting the literal
`12` to a `bool`, then converting that `bool` to a `boolean`.


## 2: The Conversion Operator

```c++
template <constructible_from<bool> T>
  explicit (!same_as<T, bool>)
constexpr operator T() const noexcept;
```

This member function handles requests to explicitly convert the `boolean` to
another type. It also has a conditional `explicit`: If the requested type is
`bool`, we will allow the implicit conversion, otherwise the conversion must be
explicit.

This avoids the following issue:

```c++
void eat_cookies(int count, bool leave_crumbs);

void santa(int num_cookies) {
    bool leave_crumbs = num_cookies > 4;
    eat_cookies(leave_crumbs, num_cookies);  // !!
}
```

The above code compiles without error, but is almost certainly not what we
intended. Built-in `bool` will implicitly convert to `int`, with value `0` for
`false` and `1` for `true`.

On the other hand, `boolean` will fail:

```c++
void eat_cookies(int count, boolean leave_crumbs);

void santa(int num_cookies) {
    boolean leave_crumbs = num_cookies > 4;
    eat_cookies(leave_crumbs, num_cookies);  // Error!
}
```

```py
<source>:43:17: error: cannot convert 'boolean' to 'int'
   43 |     eat_cookies(leave_crumbs, num_cookies);  // Error
      |                 ^~~~~~~~~~~~
      |                 |
      |                 boolean
<source>:39:22: note:   initializing argument 1 of 'void eat_cookies(int, bool)'
   39 | void eat_cookies(int count, bool leave_crumbs);
      |                  ~~~~^~~~~
```
```py
<source>:43:31: error: could not convert 'num_cookies' from 'int' to 'boolean'
   43 |     eat_cookies(leave_crumbs, num_cookies);  // Error
      |                               ^~~~~~~~~~~
      |                               |
      |                               int
```

And we are forced to fix our code or insert a cast if it is what we *really*
meant to do.

The templated-ness of this operator means that we can explicitly convert to
*anything* that is explicitly constructible from `bool`. This means that a type
with an explicit constructor taking `bool` as its only parameter is fair game,
and the conversion will work just as-if the constructor were given a plain
`bool`.


### 3: Negation

```c++
constexpr boolean operator!() const noexcept;
```

This is a simple negation operator. It will negate the `boolean`, but keep the
type as `boolean`.


### 4: Equality Checks

```c++
constexpr boolean operator==(bool) const noexcept;
constexpr boolean operator!=(bool) const noexcept;
```

These define equality and inequality between `boolean` objects. One may note
that we have only provided versions that accept `bool` on the right-hand side.
We are able to do this for two reasons:

1. A `boolean` on the right-hand side will implicitly convert to `bool`,
   satisfying `boolean == boolean`
2. With C++20, the compiler is allowed to assume that `operator==` and
   `operator!=` are reflexive, so it is allowed to treat this as an expression
   with the operands reversed. Thus, `bool == boolean` will also resolve with
   `boolean == bool`.

Those aware of the operator-rewrite rules may also note that the compiler is
allowed to rewrite `a != b` into `!(a == b)`, meaning that we only need to
provide a single `operator==` to provide all four of `a == b`, `b == a`,
`a != b`, and `b != a` (A drastic improvement from C++17 and earlier!).

However, we can't get away with that here. The compiler will only rewrite
`boolean != boolean` in terms of `!(boolean == boolean)` if `operator==` returns
`bool`. Ours returns `boolean`, which breaks that assumption. Thus, we must
provide our own `operator!=`. (We *could* just have `operator==` return plain
`bool`, but I want to keep things in terms of `boolean` for as much as
possible.)


## 5: Ordering Operator

```c++
constexpr auto operator<=>(bool other) const noexcept;
```

The three-way-comparison operator allows us to provide all four relational
operators (`<`, `>`, `<=`, and `>=`) with only a single member function! Mighty
convenient!

There are actually two ways we could define the comparison operator for
`boolean`: The first is the one we've written above, and the second is to
provide each individual comparison operator individually.

The reason we might want to provide them individually is that
`boolean [relop] boolean` defined as in terms of `<=>` will have type `bool`,
not type `boolean`. Thus, comparing to `boolean` objects will actually drop us
back to regular `bool`. For laziness reasons, I've just gone with `<=>`, since
it is quite rare to use comparison operators on boolean values directly.


# Another Solution

I've often heard people use "concepts give us better error messages" as the
compelling reason for the feature. I was skeptical beforehand, but now I'm
definitively *not* in that camp. The error messages from concepts are *at least*
as verbose as those of SFINAE-abuse, but certainly more intuitive to the
average programmer.

To me, the compelling use for concepts is all about constraining overloads and
specializations. Never before has it been so easy to do so.

I've written all about this "better bool" that doesn't implicitly convert, but
we can actually solve the initial problem from this post in a *much* simpler
fashion, also using concepts and constraints:

```c++
void foo(std::string);
void foo(same_as<bool> auto b);

void meow() {
    foo(std::string("I am a string")); // Calls [1]
    foo("lol nope");  // Calls [1]
    foo(true);  // Calls [2]
}
```

Done.

Of course, this has its own downsides, as `foo(same_as<bool> auto)` is now a
function template and must be defined inline. `foo(boolean)` could remain
defined in another translation unit. It's up to you to decide what's appropriate
in your codebase.