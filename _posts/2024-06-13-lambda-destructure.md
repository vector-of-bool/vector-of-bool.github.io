---
layout: post
title: Destructuring Lambda Expression Parameters
---

C++17 added a feature known as *structured bindings*, which look like this:

```c++
auto [a, b, c] = some_aggregate;
```

in this case, the names `a`, `b`, and `c` are bound to members of the
initializer. The particular details on *how* this occurs are not important here,
but we can consider the case of `std::tuple`:

```c++
int sum(tuple<int, int, int> triple) {
  auto [a, b, c] = triple;
  return a + b + c;
}
```

This is particularly handy when inspecting the elements of a container of pairs:

```c++
int foo(map<string, int> mp) {
  for (auto [key, value] : mp) {
    // ...
  }
}
```


# Lambda Expressions

It wasn't long before people realized that it'd be mighty handy if we could declare
structured bindings within the parameter lists of lambda expressions:

```c++
extern bool is_good(string s, int v);

auto foo(map<string, int> items) {
  return views::filter(
    items,
    // DOES NOT WORK!
    [](auto [key, value]) {
      return is_good(key, value);
    });
}
```

The above snippet does not work, but it'd be cool if it did, right?


# Making It Work

It is important to consider the fact that any function that accepts an N-tuple
as a single argument is isomorphic to a function that accepts N arguments. That
is: We can create a 1-to-1 mapping between functions on N-tuples to
functions of arity N.

In fact, we can define this using a simple adapter object [^1]:

[^1]: The choice of using `operator%` is entirely arbitrary. I chose it here
    because it is an uncommon infix operator with very high precedence.

    A more robust implementation would also require something more than a simple
    lambda expression closure, since it would need to forward the CVR-qualifiers
    onto the invocable object and maintain the `noexcept` and constraints of the
    wrapped invocable.

```c++
inline constexpr struct {
  template <typename F>
  constexpr auto operator%(F&& fn) const {
    return [fn](auto&& tpl) {
      return std::apply(fn, FWD(tpl));
    };
  }
} spread_args;
```

Used like this:

```c++
auto foo(map<string, int> items) {
  return views::filter(
    items,
    // Works!
    spread_args % [](auto key, auto value) {
      return is_good(key, value);
    });
}
```

In this particular case, our lambda expression can be ditched for the inner
function directly:

```c++
auto foo(map<string, int> items) {
  return views::filter(items, spread_args % is_good);
}
```


# Downsides

The main downside to this approach is that it doesn't support *all* of the types
that would work with structured bindings (i.e. aggregate types), but in the case
of aggregates, the named subobjects will be much easier to work with than a
dance involving `std::get<N>`.

This also doesn't work if you want to mix your "destructured" parameters with
other parameters. The returned closure object will always accept only a single
tuple-like argument.
