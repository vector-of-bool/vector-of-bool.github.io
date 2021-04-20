---
layout: post
title: A Macro-Based Terse Lambda Expression
desc: Using C++20 for my Dream C++ Feature
---

If you've read my past post,
[Now I Am Become Perl](/2018/10/31/become-perl.html), you know that my wildest
dream feature for C++ would be an expression-lambda expression: That is: A
concise lambda expression that consists of a single expression that is used as
the return value of that lambda expression, plus some extras. Imagine a syntax
like this:

```c++
void foo(range auto people) {
    range auto young_people_names =
        people
      | filter([] = _1.age() < 15)
      | transform([] = _1.name());
    // ...
}
```

In this imagined syntax, the syntax `[<capture-list>] "=" <expression>`
creates an expression-lambda expression roughly equivalent to the following:

```c++
[<capture-list>] (<magic>) mutable
        noexcept(noexcept(<expression>))
    -> decltype(<expression>)
        requires requires { <expression> }
    { return <expression>; }
```

For example, the above expression-lambda `[] = _1.age() < 15` is roughly
equivalent to the following long-form lambda expression:

```c++
[] (auto&& _1) mutable
        noexcept(noexcept(_1.age() < 15))
    -> decltype(_1.age() < 15)
        requires requires { _1.age() < 15; }
    { return _1.age() < 15; }
```

That's quite a lot of typing saved!

Can we simulate such a feature using only a preprocessor macro? Kind of.

> Note: This solution is originally based on the macro defined by
> [Quincunx271/TerseLambda](https://github.com/Quincunx271/TerseLambda). This
> version improves upon it by making use of new C++20 features.


# The Naive Solution

Let's declare a very simple macro that implements something akin to an
expression-lambda:

```c++
#define TerseLambda(...)
    [&] (auto&& _1) mutable -> decltype(auto) { return __VA_ARGS__; }
```

> (Note: end-of-line continuations have been omitted from these code samples to
> make syntax highlighting play nice. In the real implementation, all these
> newlines need to be escaped for the preprocessor definition.)

This is... *okay*, but entirely insufficient. Firstly: We are missing the
`noexcept` and `requires` clause. While not *strictly* necessary, having
our call operator constrained only to parameters for which the given expression
is valid is hugely beneficial (and sometimes *mandatory*) when passing such an
expression into generic APIs. This is simple enough to fix:

```c++
#define TerseLambda(...)
    [&] (auto&& _1) mutable
        noexcept(noexcept(__VA_ARGS__))
    -> decltype(auto) { return __VA_ARGS__; }
        requires requires { __VA_ARGS__; }
    { return __VA_ARGS__; }
```

Now our generated terse expression-lambdas will have a correct `noexcept` and a
`requires` clause.

However, we have a major downside: we *must* accept *exactly one* argument. If
we want to make a terse lambda that accepts zero or more than one argument, we
need to get trickier. In the above sample compiler-rewrite, I wrote `<magic>` in
place of the lambda expression's parameter list. This is because we need to
somehow synthesize the placeholder arguments `_1`, `_2`, `_3`, etc. on-demand,
depending on how many arguments the caller has provided, *at the call site* (not
at the lambda definition).


# Variadic Terse Lambdas

It is entirely possible to declare a lambda expression with a variadic parameter
set:

```c++
[](auto&&... _args) ...
```

But how can we make use of this to declare our placeholders? One might think that
we could get away with defaulted parameters:

```c++
struct nothing_t {};

// ...

[](auto&& _1 = nothing_t{},
   auto&& _2 = nothing_t{},
   auto&& _3 = nothing_t{}) ...
```

and a placeholder for an unprovided argument will be an instance of `nothing_t`.
However: This does not work. The compiler is unable to deduce the types of the
parameters from their default values. I am not sure *why* there is a rule that
fails this deduction, but it would be a half-solution anyway. Suppose I wanted a
terse-lambda like this:

```c++
foo(TerseLambda(bar("some string", _args...)));
```

Where we call `bar` with `"some string"` followed by every other argument
passed to the call operator. If we use explicit placeholders in the 
parameter list, there is no `_args` to pass in to `bar()`!

To start, we can note that we never specified that the `return` statement is 
the *only* thing in the lambda body. We can declare our placeholders as 
local variables!

```c++
#define TerseLambda(...)
    [](auto&&... _args) mutable {
        auto&& _1 = nth_arg<0>(FWD(_args)...);
        auto&& _2 = nth_arg<1>(FWD(_args)...);
        auto&& _3 = nth_arg<2>(FWD(_args)...);
        auto&& _4 = nth_arg<3>(FWD(_args)...);
        return (__VA_ARGS__);
    }
```

In the above, within the expansion of `__VA_ARGS__` in the `return` statement,
the `_1`, `_2`, `_3`, and `_4` identifiers will refer to the first, second,
third, and fourth lambda parameters respectively. It takes a bit of magic to
implement `nth_arg`, however:

```c++
struct nothing_t {};

// Base case: No argument provided
template <int>
constexpr nothing_t nth_arg() noexcept { return {}; }

template <int N, typename Head, typename... Tail>
constexpr decltype(auto)
nth_arg(Head&& head, Tail&&... tail) noexcept {
    // If we are asking for the first arg, return that
    if constexpr (N == 0) {
        return FWD(head);
    } else {
        // Recurse
        return nth_arg<N-1>(FWD(tail)...);
    }
}
```

In the above, if no arguments are passed to `nth_arg`, then we call the base
case and `nothing_t` is returned. We'll use `nothing_t` to represent that an
argument has not been provided for the placeholder parameter.

And now, our `TerseLambda` macro works! Kind of.


# Missing `noexcept` and `requires`

Obviously, our `TerseLambda` macro is missing its `noexcept` specifier and 
its constraints. Easy enough to add, right?

```c++
#define TerseLambda(...)
    [](auto&&... _args) mutable
        noexcept(noexcept(__VA_ARGS__))
    -> decltype(auto)
        requires requires { __VA_ARGS__; }
    {
        auto&& _1 = nth_arg<0>(FWD(_args)...);
        auto&& _2 = nth_arg<1>(FWD(_args)...);
        auto&& _3 = nth_arg<2>(FWD(_args)...);
        auto&& _4 = nth_arg<3>(FWD(_args)...);
        return (__VA_ARGS__);
    }
```

Not so fast!

Imagine what happens if we were to use our `TerseLambda`? This:

```c++
TerseLambda(_1.name())
```

Becomes *this*:

```c++
[](auto&&... _args) mutable
    noexcept(noexcept(_1.name()))
-> decltype(auto)
    requires requires { _1.name(); }
{
    auto&& _1 = nth_arg<0>(FWD(_args)...);
    auto&& _2 = nth_arg<1>(FWD(_args)...);
    auto&& _3 = nth_arg<2>(FWD(_args)...);
    auto&& _4 = nth_arg<3>(FWD(_args)...);
    return (_1.name());
}
```

See the problem? Within the `noexcept()` specifier and within the `requires`
clause, we refer to the name `_1`, but at this scope *that doesn't refer to
anything*.

```
tl.test.cpp:23:25: error: ‘_1’ was not declared in this scope; did you mean ‘std::placeholders::_1’?
   23 |    auto l = TerseLambda(_1 + 2);
      |                         ^~
```

It's not entirely clear, but this error message is referring to the `_1` inside
the `noexcept` specifier and the `requires` clause, *not* the actual `_1` within
the lambda body.

Even if we foregoe the `requires` clause from C++20 and just stick to C++17, 
we're still out-of-luck with regards to the `noexcept` specification. In 
C++17, the best we can do is the macro in the prior section, which is never 
`noexcept` and is completely unconstrained. This will work in many cases, but 
can subtly break in case that generic code checks on the invocability of our 
generated closure type.

```c++
auto func = TerseLambda(_1.name());
using FuncType = decltype(func);
static_assert(std::invocable<FuncType, person>);  // Okay: Expected
static_assert(std::invocable<FuncType, int>);     // Passes: What??
```

Even though calling `func(12)` will be a hard compile-time error, inspecting
whether `FuncType(int)` is valid will always yield `true`, because the compile
will not do deep inspection into the lambda body to validate it. The compile
will only check whether it is callable with the given number of arguments and
that the function's constraints are satisfied. In the case of a variadic
`TerseLambda` with *no* constraints, it is *always* invocable with *any*
arguments. This is definitely not what we want!


# C++20 Saves the Day

The C++20 `requires` expression is a magical beast. It will solve both the
`noexcept` and the function constraints. It provides us will a magic ability: We
can introduce new identifiers as if they were variables for the scope of the
requires expression. Since `noexcept` and the `requires` clause expect a
boolean constant expression, and the `requires`-expression evaluates to a
`bool`, we can use `requires` in both cases.

The syntax of a `requires`-expression is mostly straightforward:

```c++
requires (<parameter-list>) {
    <requirement-list>
}
```

where `<parameter-list>` is the same as with any function parameter list. We can
declare variables here that are visible in the scope of the
`<requirement-list>`.

We'll start by solving the constraints on the generated lambda expression, since
it is the most straightforward.

To declare the parameters of the `requires`-expression, we need to have the 
types of those parameters to declare. If we use `auto&&...` as the parameter 
list ot the lambda expression, we can't get at those types so easily. 
Fortunately, C++20 allows us to provide a template parameter list to a lambda 
expression, thus given us a name to the variadic pack of types that have been 
passed to the call operator:

```c++
[&] <typename... TlArgs> (TlArgs&&...) { /* ... */ }
```

For reasons that will be made clear later, I will define the 
`requires`-expression as another macro:

```c++
#define TerseLambda_Requires(...)
    requires ( /* ??? */ )
    { __VA_ARGS__; }
```

So what do we put in `???`? Consider that we need to have the same identifiers
available (with *identical* types) to the identifiers that will be visible in
the expansion of the `return` statement. For our purposes, that is `_args`,
`_1`, `_2`, `_3`, and `_4`. Fortunately, `_args` is already visible in the
scopes that we need it. We only need to find out how to declare the placeholds
`_1`, `_2` etc.

```c++
#define TerseLambda_Requires(...)
    requires (/* ??? */ _1,
              /* ??? */ _2,
              /* ??? */ _3,
              /* ??? */ _4)
    { __VA_ARGS__; }
```

We need to know how `nth_arg` is going to return within the lambda body. 
Fortunately, we have `decltype()`:

```c++
template <int N, typename... Args>
using nth_arg_t = decltype(nth_arg<N>(declval<Args>()...));

#define TerseLambda_Requires(...)
    requires (nth_arg_t<0> _1,
              nth_arg_t<1> _2,
              nth_arg_t<2> _3,
              nth_arg_t<3> _4)
    { __VA_ARGS__; }
```

That's all there is to it!


# Putting it All Together

Here is how we use `TerseLambda_Requires` with our `TerseLambda` macro for 
*both* the constraints and the `noexcept` specifier:

```c++
#define TerseLambda(...)
    [&]<typename... TlArgs>
    (TlArgs&&... args) mutable
        noexcept(TerseLambda_Requires({ __VA_ARGS__ } noexcept))
    -> decltype(auto)
        requires TerseLambda_Requires(__VA_ARGS__)
    {
        auto&& _1 = nth_arg<0>(FWD(_args)...);
        auto&& _2 = nth_arg<1>(FWD(_args)...);
        auto&& _3 = nth_arg<2>(FWD(_args)...);
        auto&& _4 = nth_arg<3>(FWD(_args)...);
        return (__VA_ARGS__);
    }
```

For `TerseLambda(_1.name())`, the above `requires`-clause above expands as:

```c++
requires requires(nth_arg_t<0> _1,
                  nth_arg_t<1> _2,
                  nth_arg_t<2> _3,
                  nth_arg_t<3> _4)
        { _1.name(); }
```

which will only be valid when the first argument to the call operator has a
callable `.name()` method.

As for the `noexcept` specifier, it expands as:

```c++
noexcept(
    requires(nth_arg_t<0> _1,
             nth_arg_t<1> _2,
             nth_arg_t<2> _3,
             nth_arg_t<3> _4)
    { { _1.name() } noexcept; }
)
```

Note the extra `{ ... } noexcept` around the return-value expression: This is a
syntax in `requires`-expressions that specifies that the expression within the
braces be both valid *and `noexcept(true)`*. If any of the requirements listed
in a `requires`-expression fail, then the entire `requires`-expression evaluates
to `false`. Since we are using it as the boolean parameter to a `noexcept`
specifier, if the inner expression `_1.name()` is `noexcept(false)`, then the
closure type's call operator is `noexcept(false)`. Note that this evaluation
happens only at the *call site*:

```c++
class person {
    string name() const noexcept;
};

class location {
    string name() const; // Not noexcept!
};

// ...

person   p;
location loc;

auto func = TerseLambda(_1.name());

// Okay:
static_assert(noexcept(func(p)));
// Also okay:
static_assert(!noexcept(func(loc))); // 'func(loc)' might throw
```

Because our generated closure object has proper constraints, the closure may
also be used with generic APIs:

```c++
auto call_it(invocable<string> auto func) { // [1]
    string s = get_string();
    return func(s);
}

auto call_it(invocable<int> auto func) {  // [2]
    return func(44);
}

// ...

auto get_length = TerseLambda(_1.length());
auto more_than_four = TerseLambda(_1 > 4);

call_it(get_length);     // Calls [1]
call_it(more_than_four); // Calls [2]
```

Without the constraints, the above calls to `call_it()` would be ambiguous since
the lambda would be arbitrarily invocable.


# *Gotchas!*

There are two quirks (of which I am aware) with the expression-lambda macro
defined here:


## Nullary Functions

If you define an expression-lambda that doesn't use any parameters and simply
returns the value of some expression:

```c++
// Creates a function that always returns 42
auto func = TerseLambda(42);
```

then the resulting function object is `std::invocable` with *anything*, because
it doesn't consult the parameters and is still variadic:

```c++
func("egg salad"); // Okay: Returns 42
```

This would make its usage with `call_it` in the prior example ambiguous, since 
it is both `invocable<string>` and `invocable<int>`.

If we want to define a terse lambda that simply returns an unparameterized 
expression, we'd be better off defining a new macro:

```c++
#define TerseLambda_Just(...)
    [&] () mutable
        noexcept(noexcept(__VA_ARGS__))
    -> decltype(auto)
        requires requires { (__VA_ARGS__); }
    { return __VA_ARGS__; }

// ...

auto func = TerseLambda_Just(42);

func();         // Okay.
func("hello");  // Invalid!
```

In this case, we don't need to do any wild dance for the placeholders, since we
don't accept any arguments.


## Reference Return Values

Unlike a regular lambda expression, whose return type is deduced via `auto` 
rules, our expression-lambda deduces via `decltype(auto)`. When deducing as 
`auto`, we strip off reference types and `const`/`volatile` qualifiers:

```c++
struct person {
    const string& name() const;
    static person at_address(address);
};

// ...

person p;

auto           n1 = p.name();
decltype(auto) n2 = p.name();
```

In the above, `n1`, deduced via `auto`, will have type `string`, and the return
value of `p.name()` will be copy-constructed into `n1`. On the other hand, `n2`,
deduced with `decltype(auto)`, will have type `const string&`, and the return
value of `p.name()` will be captured by reference.

Now observe the following:

```c++
auto name_at_address =
    TerseLambda(person::at_address(_1).name());
```

In this code sample, calling `func()` will result in undefined behavior. The
lambda body is effectively:

```c++
[](args...) -> decltype(auto) {
    address& _1 = nth_arg<0>(args...);
    decltype(auto) __tmp = person::at_address(_1);
    decltype(auto) __ret = __tmp.name();
    return __ret;
}
```

The rules of `decltype(auto)` return-type-deduction is that the return type is
the `decltype()` of the return-expression. In this case, `__ret` is like `n2` in
the prior example, and has a declared type of `const string&`. Thus, the return
type of the call, as `decltype(__ret)`, is `const std::string&`.

Note that the lifetime of `__ret` is equivalent to the lifetime of
`__tmp.name()`, which itself is (almost certainly) tied to the lifetime of
`__tmp`, which is declared as a local variable `person __tmp`. Thus, the
lifetime of the returned `const std::string&` is tied to the lifetime of the
local variable `__tmp`, and will *immediately go out of scope!* We are turning a
reference to a subobject of a local variable! Bad!

The C++ specification has a special construct that would help use here:
`DECAY_COPY(x)`. However, `DECAY_COPY(x)` is exposition-only, and does not
actually exist in the language (yet). The semantics of `DECAY_COPY(x)` is to
create a copy of the value-type of `x` by passing the declared-type of `x` as a
sole parameter to a copy constructor, including move constructors.

We can implement a `DECAY_COPY` function template, actually:

```c++
template <typename T,
          typename Ret = std::remove_cvref_t<T>>
constexpr Ret decay_copy(T&& arg) noexcept(Ret(FWD(arg))) {
    return FWD(arg);
}
```

This function is guaranteed to return a value type (not a reference) by copying
or moving the given `arg` as the first parameter of the copy/move constructor of
the underlying type of `arg`.

We can use `decay_copy` with our terse lambda to enforce a non-reference return
type:

```c++
auto name_at_address =
    TerseLambda(decay_copy(person::at_address(_1).name()));

name_at_address(some_address()); // Okay!
```

> **Note** that a future version of C++ may see a language-supported version of
> `DECAY_COPY` in the form of an `auto(x)` expression.


# Other Considerations

As some homework, consider the following:

1. Our `TerseLambda` always uses a default by-reference capture. This may not be
   wanted. Consider how to use an extra level of indirection to allow
   customizing this macro's capture list.
2. Consider how `TerseLambda` might behave *better* than a naively-hand-written
   lambda expression with generic APIs


# Using This

While it isn't as *awesome* as a language-supported version of a terse lambda
syntax, I've found it pretty fun to use myself.

With recent updates to MSVC, this terse lambda macro now works on all major C++
compilers.
[A more thoroughly written version of `TerseLambda` is available in `neo-fun` as `NEO_TL`](https://github.com/vector-of-bool/neo-fun/blob/develop/src/neo/tl.hpp),
and is currently available to pull via [`dds`](https://dds.pizza). Try it out.
See if you can break it. Send me bug reports. Have fun!
