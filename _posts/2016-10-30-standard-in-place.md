---
layout: post
title: The Curious Case of std::in_place [Outdated]
desc: >
    In which I talk about an obscure proposed C++ feature that never came to
    fruition
---

<div class="aside warning" markdown="1">
UPDATE: This post is no longer relevant to the C++ standard as of proposal paper
[p0504r0](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2016/p0504r0.html),
which changed the definitions of the `std::in_place` tag and its friends. This
post will remain in-tact for posterity, but be aware that it no longer
corresponds with the actual contents C++ standard library. Nevertheless, the
information contained herein may be useful to someone some day, and is a good
excersize in understanding some interesting metaprogramming techniques.
</div>

# Preface

I was recently dabbling in implementing `std::variant` and `std::optional`, and
got caught up on the emplacement constructors
(Seen [here](http://en.cppreference.com/w/cpp/utility/optional/optional) and
[here](http://en.cppreference.com/w/cpp/utility/variant/variant)). I did not
have an implementation of `std::in_place` to use, so I needed to build that as
well. I presumed it would be as simple as implementing `std::nullopt` and
`std::nullopt_t`, but it turned out to be quite a bit hairier than that.

What it actually required was some interesting interactions between
alias templates, functions, function references, overload resolution, and
template argument deduction. The resulting implementation techniques are very
enlightening to anyone wishing to understand some of the more subtle - and
powerful - details of the C++ language.

# What is `std::in_place`?

C++17 introduced - among other things - two incredibly useful new class
templates: [`std::variant`](http://en.cppreference.com/w/cpp/utility/variant)
and [`std::optional`](http://en.cppreference.com/w/cpp/utility/optional).

~~~c++
#include <variant>
#include <optional>
#include <string>

int main() {
    using namespace std;
    variant<int, string> v = 12;  // Put an int in the variant
    assert(holds_alternative<int>(v));
    v = "Some string";  // Puts a std::string in the variant
    assert(holds_alternative<string>(v));

    optional<string> maybe_a_string;
    assert(!maybe_a_string);  // By default, there is no string in the optional
}
~~~

These two class templates feature several constructors that would do the
reasonable things that one would expect. When constructed from a `T`, an
`optional<T>` will implicitly become _engaged_ and construct itself by copying
or moving the value from which it is constructed. When constructed from some
value `U`, `variant<T0, T1, ... Tn>` will construct itself to hold a value of
the type in `Ts...` for which the best candidate conversion would take place
if calling a function overloaded with each type in `Ts...`. In the example
above, we assign a `char` array `"Some string"` to the variant. Since the
variant's alternative type `std::string` is constructible from a `char` array,
the variant selects `std::string` as the alternative to store. Sounds good.

This begs the question: What if I want to construct the value in-place with no
copy or move construction taking place? What if I want to construct it using
zero or more than one argument?

The answer is `std::in_place`, which is used to tell `variant` or `optional` to
construct a value _in place_, meaning it performs no copies or moves to get the
value in there.

For example, with `optional`:

~~~c++
optional<string> make_from_chars(const char* ptr, size_t length) {
    if (ptr) {
        return { in_place, ptr, ptr + length };
    } else {
        return nullopt;
    }
}
~~~

Or with `variant`:

~~~c++
using int_or_string = variant<int, string>;
int_or_string get_int_or_string(bool get_int) {
    if (get_int) {
        return int_or_string{ in_place<int>, 42 };
    } else {
        return int_or_string{ in_place<string> }; // Constructs an empty string
    }
}
~~~

Variant also has an index-based constructor, with allows constructing the Nth
type which is available in the `variant`:

~~~c++
using int_or_string = variant<int, string>;
int_or_string get_int_or_string(bool get_int) {
    if (get_int) {
        return int_or_string{ in_place<0>, 42 };
    } else {
        return int_or_string{ in_place<1> }; // Constructs an empty string
    }
}
~~~

`std::in_place` is a construct used for _tag dispatch_, an extremely powerful
C++ idiom.

# Tag Dispatch?

In the tag dispatch idiom, a function is overloaded on a _tag type_, which is
a (usually empty) `class`/`struct` or template thereof. Callers of the overloaded
function will pass in an instance of the tag type which will tell the compiler to
select a particular overload of the function. This is useful because it allows
generic code to call an overload set and pass in some unknown tag instance,
which dispatches to a particular overload without branching or needing to
instantiate (and verify the semantics of) overloads which are not of particular
interest.

One of the most useful cases of tag dispatch is to dispatch to differing
algorithm implementations based on the
[`iterator_category`](http://en.cppreference.com/w/cpp/iterator) of an iterator
given to the algorithm as a parameter.

For example, suppose we are implementing an algorithm `frombulate` which has a
linear complexity for `ForwardIterators` (such as in a linked-list) and
logarithmic complexity for `RandomAccessIterators`. Using tag-dispatch, our code
would resemble something like this:

~~~c++
namespace impl {
    template <typename Iter>
    Iter do_frombulate(forward_iterator_tag, Iter first, Iter last) {
        // Do slow implementation
    }

    template <typename Iter>
    Iter do_frombulate(random_access_iterator_tag, Iter first, Iter last) {
        // Do super fast implementation
    }
}

template <typename Iterator>
Iterator frombulate(Iterator first, Iterator last) {
    // Get the category type
    using category_tag = typename iterator_traits<Iterator>::iterator_category;
    // Dispatch on that tag
    return impl::do_frombulate(category_tag{}, first, last);
}
~~~

Above, we have two overloads for `impl::do_frombulate`. The only difference in
their signatures is the first parameter, which is our tag type. We don't give
the tag parameter a name because we don't really need to do anything with the
object itself. It is solely there to help the compiler select the proper
overload for `frombulate`.

In `frombulate`, we get the iterator category tag type using
[`iterator_traits`](http://en.cppreference.com/w/cpp/iterator/iterator_traits),
then call `do_frombulate`, passing in an instance of the iterator category tag
as the first parameter. The empty braces `{}` call the default constructor of
the tag type. It is idiomatic to construct tag types using the empty braces as
a way to differentiate them from a function call using empty parenthesis `()`.

Could we have used a regular `if` branch to choose between our two
implementations? The answer is _probably not_. For example:

~~~c++
// NOTE: BAD:
template <typename Iterator>
Iterator frombulate(Iterator first, Iterator last) {
    // Get the category type
    using category_tag = typename iterator_traits<Iterator>::iterator_category;
    if (is_convertible<category_tag, random_access_iterator_tag>()) {
        // Do fast implementation
    } else if (is_convertible<category_tag, forward_iterator_tag>()) {
        // Do slow implementation
    } else {
        // ??? (See below)
    }
}
~~~

A regular `if` branch _does not work_ for two primary reasons:

1.  All branches must compile properly for any passed in `Iterator` type. This is
    problematic because not all operations of `RandomAccessIterators` are
    available to `ForwardIterators`. Thus, if we pass in a `ForwardIterator` to
    this branching implementation, we will get a compile error because the
    unused first `if` block is ill-formed, even if that branch can be statically
    proven to never be executed.
2.  What do we put in the final `else` branch? If the user passes in an
    `InputIterator`, which is neither a `RandomAccessIterator` nor a
    `ForwardIterator`, what do we do? We could use a `static_assert`, but a
    naive use of `static_assert(false)` will simply cause the code to
    unconditionally fail even when passed in proper iterator types. We could
    call `terminate`, but that's annoying to callers, since we can statically
    determine when such code is invalid. The only thing to do would be to be
    redundant and check that `is_convertible<Iterator, ForwardIterator>()`, is
    `true`.

All around, this won't work

<div class="aside note" markdown="1">
Note that as-of C++17, we could actually do something like the code above, using
`if constexpr` to branch at compile time:

~~~c++
// NOTE: C++17, GOOD:
template <typename Iterator>
Iterator frombulate(Iterator first, Iterator last) {
    // Get the category type
    using category_tag = typename iterator_traits<Iterator>::iterator_category;
    static_assert(is_convertible<category_tag, forward_iterator_tag>());
    if constexpr (is_convertible<category_tag, random_access_iterator_tag>()) {
        // Do fast implementation
    } else {
        // Do slow implementation
    }
}
~~~

It may be that the code above becomes more idiomatic as compilers start to roll
out support for C++17. It feels a little more verbose that the tag-dispatching
equivalent, but is definitely easier to reason about for someone unfamiliar
with tag dispatch. Time will tell.

Either way, tag dispatch still has its place in C++17, as can be seen by the
addition of `std::in_place`.
</div>

# Something's... Different?

`std::in_place` is different from other tag dispatch code that has been common
in the past. For one we can see that `std::in_place_tag`
[_exists_ in the standard library](http://en.cppreference.com/w/cpp/utility/in_place_tag),
but it seems to be inconstructible (having only a `delete`'d constructor).
Furthermore, we can see that no constructors for [`optional`](http://en.cppreference.com/w/cpp/utility/optional/optional)
nor [`variant`](http://en.cppreference.com/w/cpp/utility/variant/variant)
actually mention either `std::in_place` or `std::in_place_tag`. Instead, they
reference some other constructs: `std::in_place_t`, `std::in_place_type_t<T>`,
and `std::in_place_index_t<I>`. How do these relate to `std::in_place`?

One may initially think that `std::in_place` may be a global tag instance of some
type in the same way that [`nullopt`](http://en.cppreference.com/w/cpp/utility/optional/nullopt)
is a global instance of the [`nullopt_t`](http://en.cppreference.com/w/cpp/utility/optional/nullopt_t)
tag type. The `nullopt_t` constructors for `optional` are also tag-dispatch
based constructors, and `nullopt` is the singleton instance of `nullopt_t` that
is used to initialize an empty `optional`, but this is _not_ what `std::in_place`
is.

The primary reason `std::in_place` is not a tag instance is that we wish to be
able to give it _template arguments_, such as when we use `std::in_place<T>` to
construct a variant holding an instance of `T`. Such syntax is not supported on
variables. Another good guess is that `std::in_place` may be a
[_variable template_](http://en.cppreference.com/w/cpp/language/variable_template)
which, when instantiated, becomes is an instance of some tag type.

Close again, but this presents two problems:

1.  We wish to be able to pass either a type _or_ an index in as a template
    parameter to `std::in_place` for constructing `variant`s. A variable which
    is templated on both a type _and_ a non-type is **not legal**!

    We can specialize variable templates, but not in this manner:

    ~~~c++
    template <typename T>
    int foo = sizeof(T);

    template <int I>
    int foo = I;  // error: redeclaration of 'template<int I> int foo'
    ~~~

2.  We wish to be able to pass `std::in_place` with no template arguments, such
    as with `optional`'s emplacing constructor, but it is not legal to reference
    a variable template without providing template arguments. We could provide
    default template arguments to our variable template, but that would still
    require empty angle brackets to instantiate such a construct. There is also
    the problem of what would be a good default argument? `void`? `monostate`?
    `42`?

There's another oddity about `std::in_place` that you may have noticed: We never
call a constructor on the thing. With the `iterator_category` example above, we
need to construct an instance of the tag type when we pass it to a function,
which I do using the empty braces `{}` to call the default constructor. You will
see that with `std::in_place`, we do not call it or construct it, we simply
write it with or without some template arguments.

So, we need some construct which can be used as a run-time value like a tag
instance, but can also be given template arguments which are either types or
non-types.

Does such a construct exist?

# Function Pointers and References

An unlikely language feature comes to the rescue. Indeed, `std::in_place` is
not a type, not a variable, but _a function_. In fact, `std::in_place` is three
different things: A function, a function template parameterized by a single type,
and a function template parameterized by a `std::size_t`. We can see the signatures
of these functions [here](http://en.cppreference.com/w/cpp/utility/in_place).
It is not immediately obvious: Why is it a function? What arguments can I pass
to it? What is the return value? What does this have to do with `std::in_place_tag`?
How does this work with tag dispatch?

A few can be answered right off the bat:

1.  No, you cannot call `std::in_place`. It is explicitly _undefined behavior_
    to call these functions.
2.  Calling the functions may prove difficult, as the actual parameter types are
    completely unspecified. Obtaining an instance of the unspecified type is not
    portable, and may not even be possible depending on the implementation. The
    parameters are only there to assist the compiler later when it performs
    template argument deduction for `in_place_type_t` and `in_place_index_t`.
    We'll get to that shortly.
3.  The return value of the functions is `std::in_place_tag`. Of course, we
    cannot call the function, and this tag type is completely inconstructible
    anyway.

The remaining questions are _why_ and _how_.

## Why Use a Function?

The _why_ is actually pretty simple. The language allows a non-template function
to be overloaded by templates with disparate template parameters. Like this:

~~~c++
// Non-template function
void foo() {}

// Template parameterized on a type
template <typename T>
void foo() {}

// Template parameterized on an int
template <int I>
void foo() {}
~~~

When we reference the function `foo`, we may provide or omit template parameters
to change which overload is selected by the compiler.

~~~c++
void bar() {
    foo(); // Calls non-template foo
    foo<int>(); // Calls foo with type template parameter
    foo<42>(); // Calls foo with int template parameter
}
~~~

We can also store the function in a function pointer or function reference like so:

~~~c++
void bar() {
    using void_fn_ptr = void(*)();
    void_fn_ptr fn = foo;
    fn(); // Calls non-template foo
    fn = foo<int>;
    fn(); // Calls foo<int>
    fn = foo<42>;
    fn(); // Calls foo<42>
}
~~~

Even though the different `foo` overloads look completely different, once we
provide the template parameters, they all collapse to the same function type:
`void(&)()`. (Note that a function reference with the ampersand `&` will
implicitly convert to a function pointer with the asterisk `*`.)

The ability to capture these overloads as a parameter is important in _how_ this
works.

## How Does This Work?

As I show above, a function template, once specialized, becomes a regular
function, and can be stored and passed via function pointers and references. This
is the basis of `std::in_place`. The difference between `std::in_place` and the
example I wrote above is that _`std::in_place` has a parameter_.

The type of the parameter is unspecified, but is still relevant when forming the
type of pointers or references to the function itself. For exposition, I will
define some imaginary tag types which are not constructible:

~~~c++
namespace magic {
    struct empty_tag { empty_tag() = delete; };
    template <typename T>
    struct type_tag{ type_tag() = delete; };
    template <std::size_t I>
    struct index_tag { index_tag() = delete; };
}
~~~

The default constructors are deleted, and the types themselves cannot be
constructed, but _they can still be referenced_:

~~~c++
// We can declare a function which takes our magic type
void foo(magic::type_tag<int>) {}

void bar() {
    // We can even get a pointer to this function!
    using fn_ptr = void(*)(magic::type_tag<int>);
    fn_ptr foo_ptr = foo;

    // But calling is still not possible!
    // foo_ptr(???) // Where do we get an instance of magic::type_tag<int> ?
}
~~~

We could also declare a function which takes a reference to a function that takes
an instance our magic tag type:

~~~c++
// We use a function reference to prevent users from passing in nullptr
using magic_int_fn = void(&)(magic::type_tag<int>);
void do_thing(magic_int_fn) {}
~~~

Note that the `magic_int_fn` _is constructible_, even if not _callable_. This is
important!

But what if we don't want `type_tag<int>`, but any `type_tag<T>` for any given
`T`? We can do that as well, using type deduction and by making `do_thing` a
function template:

~~~c++
template <typename T>
void do_thing(void(&)(magic::type_tag<T>)) {}
~~~

Now we can pass in any type tag. How would we create these function types? Well,
we aren't actually going to call it, so it doesn't matter what the function
itself does. So we can write a dummy function with the signature that we want:

~~~c++
template <typename T>
void dummy_fn(magic::type_tag<T>) {}
~~~

And now we can just specialize that function to get a reference to it, and pass
that in to `do_thing`:

~~~c++
void bar() {
    do_thing(dummy_fn<int>); // Compiler deduces "int", calls do_thing<int>
    do_thing(dummy_fn<void>); // Compiler deduces "void", calls do_thing<void>
}
~~~

We could also write a `do_thing` which takes a `magic::index_tag<I>` for any `I`:

~~~c++
template <std::size_t I>
void do_thing(void(&)(magic::index_tag<I>)){}
~~~

And we can make a `dummy_fn` function template that is parameterized on a
`std::size_t`:

~~~c++
template <std::size_t I>
void dummy_fn(magic::index_tag<I>) {}
~~~

Usage of this is similar, and doesn't collide with our `dummy_fn` nor `do_thing`
that are parameterized on a type:

~~~c++
void bar() {
    do_thing(dummy_fn<int>);
    do_thing(dummy_fn<void>);

    // Now pass in integers!
    do_thing(dummy_fn<42>); // Compiler deduces "42", calls do_thing<42>
}
~~~

We can also define a non-template `dummy_fn` that takes our `empty_tag`:

~~~c++
void dummy_fn(magic::empty_tag) {}
~~~

Now define a non-template `do_thing` that takes uses this `empty_tag`:

~~~c++
void do_thing(void(&)(magic::empty_tag)) {}
~~~

Again, this plays nicely with all our other overloads:

~~~c++
void bar() {
    do_thing(dummy_fn<int>);
    do_thing(dummy_fn<void>);

    do_thing(dummy_fn<42>);

    // No template parameters at all!
    do_thing(dummy_fn); // Calls non-template dummy_fn
}
~~~

We've got a very flexible way to do tag dispatch based on types, integers, or
the lack of any parameter at all, and the usage doesn't look too bad either.
There's still one problem: Library developers who wish to use our fancy tag
dispatch need to parameterize their functions on a function reference using a
"magic" type that they should not actually need to care about. This is where
_alias templates_ can help us.

We can define an alias template for the three function tag types:

~~~c++
template <typename T>
using type_tag_t = void(&)(magic::type_tag<T>);

template <std::size_t I>
using index_tag_t = void(&)(magic::index_tag<I>);

using empty_tag_t = void(&)(magic::empty_tag);
~~~

Now, library developers can use these tag types which don't live in a magic
namespace, and they don't even need to worry about why these things are function
pointers. See our new declarations of `do_thing`:

~~~c++
// Equivalent to
//   template <typename T>
//   void do_thing(void(&)(magic::type_tag<T>)) {}
template <typename T>
void do_thing(type_tag_t<T>) {}

// Equivalent to
//   template <std::size_t I>
//   void do_thing(void(&)(magic::index_tag<I>)) {}
template <std::size_t I>
void do_thing(index_tag_t<I>) {}

// Equivalent to
//   void do_thing(void(&)(magic::empty_tag)) {}
void do_thing(empty_tag_t) {}
~~~

And we're done! This is how `std::in_place` works and how it might be
implemented.

# Finishing Up
The only thing left is to name things correctly. Our `dummy_fn`? Well, that's
just `std::in_place`. Our alias templates? Those correspond to
`std::in_place_t`, `std::in_place_type_t`, and `std::in_place_index_t`.

Here's a complete implementation of `std::in_place` and it's related aliases:

~~~c++
namespace std {

namespace detail {

// Was: magic::empty_tag
struct in_place_empty_arg { in_place_empty_arg() = delete; };

// Was: magic::type_tag
template <typename T>
struct in_place_type_arg { in_place_type_arg() = delete; };

// Was: magic::index_tag
template <size_t I>
struct in_place_index_arg { in_place_index_arg() = delete; };

}

struct in_place_tag { in_place_tag() = delete; };

// Was: void dummy_fn(magic::empty_tag)
inline in_place_tag in_place(detail::in_place_empty_arg) { terminate(); }

// Was: template <typename T> void dummy_fn(magic::type_tag<T>)
template <typename T>
in_place_tag in_place(detail::in_place_type_arg<T>) { terminate(); }

// Was: template <size_t I> void dummy_fn(magic::index_tag<I>)
template <size_t I>
in_place_tag in_place(detail::in_place_index_arg<I>) { terminate(); }

// Was: empty_tag_t
using in_place_t = in_place_tag(&)(detail::in_place_empty_arg);

// Was: type_tag_t
template <typename T>
using in_place_type_t = in_place_tag(&)(detail::in_place_type_arg<T>);

// Was: index_tag_t
template <size_t I>
using in_place_index_t = in_place_tag(&)(detail::in_place_index_arg<I>);

}
~~~

Above, we can see that the `/* Unspecified */` shown in the standard are
replaced with our `*_arg` tags in the `detail` namespace. The actual types here
are not specified in the API because users should use the alias templates
instead of declaring the function references themselves.

If we want to write our own function that works with `std::in_place`, we use the
alias templates and template argument deduction when we declare our function:

~~~c++
template <typename T>
void discombobulate(std::in_place_type_t<T>) {
    // ...
}
~~~

After alias expansion, our declaration becomes:

~~~c++
template <typename T>
void discombobulate(std::in_place_tag(&)(std::detail::in_place_type_arg<T>)) {
    // ...
}
~~~

When we call `discombobulate` like so:

~~~c++
discombobulate(std::in_place<int>);
~~~

The compiler sees us passing a reference to a function as the first argument,
where the reference type is  written as
`std::in_place_tag(&)(std::detail::in_place_type_arg<int>)`. The compiler will
deduce `T` to be `int` for `discombobulate`, and we're done!

Of course, we don't have to worry about all this magic going on behind the
scenes, and we thus get a terse, flexible, and easy-to-use API for
`std::in_place`.

# Moving Forward

Using these seemingly unrelated rules of the language, we get `std::in_place`,
which helps us do some pretty nice things and build some pretty nice APIs.
What else could we do with these language constructs? Anything similar to
`std::in_place`?

Other than the alias templates, `std::in_place` can be constructed using only
features available in C++03. With the addition of more language features like
`constexpr`, lambdas, variable templates, variadic templates, fold expressions,
etc., it will be exciting to see what delicious new metaprogramming techniques
are discovered in the years to come.

`std::variant`'s converting constructor also requires some very interesting
trickery to make work, and may be the subject of a future post.

Stay tuned, and remember: `'class std::vector<bool>' has no member named 'data'`.