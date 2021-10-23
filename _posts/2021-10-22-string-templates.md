---
layout: post
title: Stringy Templates
desc: Combining strings and templates. What could go wrong?
---

C++20 introduces many new features, but I want to focus on one in particular in
this post.


# Non-Type Template Parameters

C++ has long supported non-type template parameters:
```c++
template <int I>
struct foo {};
```

We can then instantiate this class with any `int`:

```c++
foo<1729> f;
```

This is very unsurprising. One extremely important aspect of template
specializations is that any two specializations that have equal template
arguments refer to the same entity, and two specializations with any inequal
template arguments refer to separate entities. That is: `foo<1>` and `foo<2>`
are *separate types*, but `foo<1>` in one point in a program is *the same type*
as any other mention of `foo<1>`, even if that template argument is not a
literal `1`, but any constant expression that evaluates to `1`:

```c++
constexpr int square(int n) {
    return n * n;
}

foo<49>        a;
foo<square(7)> b;
foo<49>& ref = b; // Okay!
```

Here, `foo<square(7)>` is the same type as `foo<49>`, because the template
arguments have the same value as constant expressions.


## Classes Types as Template Parameters?

Suppose I have a simple class:

```c++
struct point {
    int x;
    int y;
};
```

Can I use a `point` as a template parameter?

```c++
template <point P>
struct location {};
```

Before C++20, the answer was a resounding *no*. The issue lies in having a
compile-time definition of whether any two `point` objects are "equal." It is
the job of the compiler and linker together to enforce this one-definition rule,
and until C++20 we were unable to come up with a good way to define equivalence
in such a case. While we could provide a `constexpr operator==`, it is possible
to create a `constexpr bool operator==(point) { return true; }`, which would
tell the compiler that all `point`s are equal, but this is confusing and
nonsensical, and would require that we load a `constexpr`-evaluator at the link
phase.

Instead, in C++20, we allow class-type non-type template parameters if such a
type meets certain constraints. I won't elaborate on those here, but we can use
(among other things) any class-type whose members are either (1) valid as
non-type template parameters, or (2) an array of such types. This very simple
rule gives us enough lee-way to define `fixed_string`.


# Meet `fixed_string`

`fixed_string` is a type that has been invented and re-invented repeatedly. In
short, it is a class type that has the following basic representation:

```c++
template <size_t Length>
struct fixed_string {
    char _chars[Length+1] = {}; // +1 for null terminator
};
```

The "fixed" in `fixed_string` refers to the fixed-length nature of such a string
class. A `fixed_string` can have a similar API to a regular string class, with
an important caveat: Growing or shrinking the string generates a new type of
`fixed_string`. That is: concatenating a `fixed_string<N>` with a
`fixed_string<M>` will result in an object of type `fixed_string<N + M>`.

I will omit the implementation of of `fixed_string`'s string-like API, as it
isn't particularly interesting. I *will* however note this important deduction
guide:

```c++
template <size_t N>
fixed_string(const char (&arr)[N])
    -> fixed_string<N-1>;  // Drop the null terminator
```

This allows us to do something pretty important:

```c++
fixed_string str = "Hello!";
```

In the above, we omit the length template argument to `fixed_string`, and
instead rely on the deduction guide. When initialized with a string literal, the
deduction guide accepting the reference-to-array will see `N` of `7`, and thus
the type of `str` is `fixed_string<6>`.

Because `fixed_string<N>` meets our criteria for a non-type template parameter,
we can use it as such:

```c++
template <fixed_string<6> Str>
struct foo;

foo<"Hello!"> hello;
foo<"world!"> world;
```

Wow! Finally: We can use strings as template arguments! And the original
same-ness rules still apply: the type of `hello` is `foo<"Hello!">`, and the
type of `world` is `foo<"world!">`. `hello` and `world` have different types!
Also:

```c++
constexpr fixed_string first = "Hel";
constexpr fixed_string second = "lo!";

foo<first + second> another;
```

In the above case, `another` has type `foo<"Hello!">`, exactly the same type as
the `hello` variable in the prior example.

But there are limitations here:

```c++
foo<"nope"> b;  // FAIL!
```

The issue here is that `"nope"` is 4-char string literal, whereas `foo` is
templatized on a *6-char* fixed string. As such, the `constexpr` constructor for
`fixed_string<6>` will fail, preventing us from specializing `foo` with anything
except string literals that are 6 chars long. Pretty useless, right?

In order to fix this quirk, along with class-type non-type template parameters,
C++20 allows us to use class-template argument deduction in the declaration of a
template parameter:

```c++
template <fixed_string S>
struct ctad_foo {};
```

Here, `fixed_string` is the name of a class template, and not yet of a
particular type. This is very weird to think about, but it combines nicely to
allow us to specialize `ctad_foo` with *any* string we want:

```c++
ctad_foo<"Hello"> h
ctad_foo<"user"> u;
```

The type of `h` and `u` are different, and they are both using `fixed_string`s
of different length.

<div class="aside note" markdown="1"> NOTE: I told a small lie when I said
`hello` has type `foo<"Hello!">`. It *actually* has type
`foo<fixed_string<6>{"Hello!"}>`. This is actually how GCC will render the type
in diagnositcs, so you should be aware. This also applies in the case of
`ctad_foo`. The last time I checked, MSVC renders the `char[]` as a list of
integral values, which is pretty nasty when looking at diagnostics.
</div>


# Stringy Templates

Using strings as non-type template parameters opens up Pandora's Box of
possibilities. Look at this:

```c++
template <fixed_string> // [1]
struct named_type {};

template <> // [2]
struct named_type<"integer"> { using type = int; };

template <> // [2]
struct named_type<"boolean"> { using type = bool; };

template <fixed_string S> // [3]
using named_type_t = named_type<S>::type;
```

What's going on here??

1. First, we declare an empty primary definition of a class template
   `named_type`.
2. Declare an explicit specialization of `named_type` for the fixed string
   `"integer"`, and another for `"boolean"`.
3. Create an alias that grabs the nested `type` from a particular specialization
   of `named_type`.

Now, the madness:

```c++
named_type_t<"integer"> v = 42;
named_type_t<"boolean"> b = false;
```

wat.

The above code compiles and behaves exactly as one would expect, and `v` is of
type `int`, while `b` is of type `bool`.

What happens if we use `named_type_t` with some other string?

```c++
named_type_t<"widget"> w;
```

This produces an error, just as you might expect:

```c++
test.cpp: In substitution of ‘template<fixed_string<...auto...> S> using named_type_t = typename named_type::type [with fixed_string<...auto...> S = neo::fixed_string<6>{"widget"}]’:
test.cpp:112:22:   required from here
test.cpp:110:7: error: no type named ‘type’ in ‘struct named_type<fixed_string<6>{"widget"}>’
   110 | using named_type_t = named_type<S>::type;
       |       ^~~~~~~~~~~~
```

`named_type_t` is also SFINAE-friendly.

We can use it in even more useful contexts:

```c++
template <fixed_string Name>
concept names_a_type = requires {
    // Require that `named_type_t<Name>` produces a valid type
    typename named_type_t<Name>;
};

static_assert(names_a_type<"integer">);
static_assert(!names_a_type<"widget">);

template <fixed_string S>
auto do_something() {
    static_assert(
        names_a_type<S>,
        "The given string must name a registered type!");
}
```

Perhaps this all seems a bit pointless, but we can take this further.

*Much further.*

***To be continued...***
