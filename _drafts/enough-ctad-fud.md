---
layout: post
title: Stop with the CTAD FUD!
comments: true
---

Among the catalog of features introduced by C++17, you'll find a feature
known as *Class Template Argument Deduction*, often shortened to "CTAD". It
was one of the largest language changes in C++17, and with it comes a new
syntax and a new set of rules to understand.

It's still very early in the game for CTAD, but we're already seeing many
strong opinions about it without seeing its widespread effect on codebases.
In particular, we're seeing a lot of *Fear*, *Uncertainty*, and *Doubt* about
CTAD.

# A CTAD Rundown

Here's a quick rundown of CTAD and how it works. Suppose I want to make a
pair:

```c++
std::pair<int, std::string> items{1, "My String"};
```

Simple enough, by I'm specifying my type when the compiler already knows the
answer. We have a solution in the form of `make_pair`:

```c++
auto items = std::make_pair(1, "My String"s);
```

> We must use the suffix `s` on `"My String"` to force the pair returned by
> `make_pair` to deduce to a `std::string`. This isn't a bug or a misfeature.
> While we *could* be clever here, I'll be talking about why we don't want to
> do that.

That's pretty neat, ain't it? But it's a bit obnoxious that we have a fully
separate function. What if we could make `std::pair` *deduce* its template
arguments? In C++17, we can:

```c++
std::pair items{1, "My String"s};
```

The type of `items` is `std::pair<int, std::string>`, via the magic of CTAD.


## How Does It Work?

As long as you understand the function template argument deduction rules,
CTAD works fairly simply, to be honest. The most thorough rundown in [STL's
CppCon talk on the subject](https://www.youtube.com/watch?v=-H-ut6j1BYU). I
will defer to that video, as I would most likely present an incomplete
definition.


# The CTAD "Problem"

Imagine this:

```c++
std::optional maybe_string{"Hello!"s};
std::optional other_thing{maybe_string};
```

What is the type of `my_string`? If you said `optional<string>`, you're
correct! Not a surprising result, actually.

But... What is the type of `other_thing`? If you said
`optional<optional<string>>`, you would be *incorrect*! It is actually *also*
`optional<string>`.

Why does this occur? This isn't a case of the library attempting to be clever
and make a "best guess." To perform deduction, the compiler generates
imaginary function templates called "deduction guides". In the case of the
example above, there are two important ones:

```c++
// [1]
template <typename T> auto __deduce(T) -> optional<T>;
// [2]
template <typename T> auto __deduce(const optional<T>&) -> optional<T>;
```

The compiler acts as if the constructor call is a call to this overload set,
and the return type of the best-matching deduction guide is used in place of
the name of the class template. In the above, the guide `[1]` is an explicitly
provided deduction guide, and `[2]` is an implicit deduction guide generated
from the copy constructor of `optional`.

The simple answer is that the copy constructor `[2]` of `std::optional<T>`
*is a better match* than the unconstrained `[1]`. [Andrzej Krzemieński has a
good post detailing this exact surprise](https://akrzemi1.wordpress.com/2018/12/09/deducing-your-intentions/).


# What Makes this "Surprising"?

It's actually hard to objectively quantify what is surprising about the above
example, but I think a good candidate for doing so is to show a snippet of
code be believe to be *always correct*, that can be broken by corner cases:

```c++
template <typename Something>
void do_a_thing(Something s) {
    std::optional opt{s};
    Something& ref = *opt;
}
```

With the naive understanding of the semantics of `optional`, we'd expect the
above example to be *always correct*. We've been given a `Something`, we wrap
it in an *engaged* `optional`, and then we bind a reference to the wrapped
value. The surprize comes from the fact that the above example break if you
pass an `optional<T>` in for `s`!

```
<source>:9:16: error: non-const lvalue reference to type 'std::optional<int>' cannot bind to a value of unrelated type 'int'
    Something& ref = *opt;
               ^     ~~~~
<source>:15:5: note: in instantiation of function template specialization 'do_a_thing<std::optional<int> >' requested here
    do_a_thing(i);
    ^
1 error generated.
```

One correct answer is to be more verbose:

```c++
template <typename Something>
void do_a_thing(Something s) {
    std::optional opt{s};
    typename decltype(opt)::value_type& ref = *opt;
}
```

Or to simply not rely on CTAD:

```c++
template <typename Something>
void do_a_thing(Something s) {
    std::optional<Something> opt{s};
    Something& ref = *opt;
}
```

So it looks like CTAD has tricked us!

Well... Did it? Or is this a quirk of the way `optional` intermixes with
CTAD?


## More Surprises

Let's look at my namesake: `vector<bool>`. What makes it "surprising"?

```
template <typename T>
void foo(std::vector<T> vec) {
    T& ref = vec.front();
}
```

There we see it again. With a naive understanding of `std::vector`, we'd
expect that a `T&` can bind to the value of `front()`. For many types, *this
works accidentally*. The fatal assumption is that `front()`, `back()`, `at()`,
and `operator[]` return a `T&`. This is not true. This has never been true.
Code which assumes this is wrong and broken. The truth is that
`std::vector<T>::front()` *does not return `T&*`*. It returns
`std::vector<T>::reference`. For an arbitrary `T`, `::reference` is not
guaranteed to be `T&`. The most notable example is that of `bool`

> "Are you trying to excuse `vector<bool>`?"

Not at all. `vector<bool>` is bad, but not because it uses a proxy reference.
That is fully conforming to the interface of `vector<T>`. It is when it
breaks from the interface of `vector<T>` that we must start throwing rocks.

> `vector<bool>` is bad because its cleverness sides-steps the interface of
> the primary definition.


## Moar Surprises

Remember how I started with `std::make_pair`? What if I told you...
`std::make_pair` was also surprising!

But how?

Let me show you an example where it is ***not*** surprising:

```c++
auto pair = std::make_pair(1, "I am a string");
```

The type of `pair` is `std::pair<int, const char*>`. New users will be
appalled that it isn't using `std::string`. Remember what I mentioned earlier?
We *could* "be clever" and force character arrays to `std::string` in
`std::make_pair`, but remember why things would be surprising:

```c++
template <typename First, typename Second>
void do_pair_thing(First f, Second s) {
    auto pair = std::make_pair(f, s);
    First& ref1 = pair.first;
    Second& ref2 = pair.second;
}
```

If we special-cased `make_pair` to change character arrays into
`std::string`s, that would make the above code surprising.

In fact, if `make_pair` did anything tricky to make the above code incorrect,
that would be pretty surprising...

It's a good thing it doesn't, right!

... Right?

...

```c++
do_pair_thing(42, std::ref(something));
```
```
<source>:15:13: error: non-const lvalue reference to type
        'std::reference_wrapper<Something>' cannot bind to a value
        of unrelated type 'Something'
    Second& ref2 = pair.second;
            ^      ~~~~~~~~~~~
<source>:25:5: note: in instantiation of function template specialization
        'do_pair_thing<int, std::reference_wrapper<Something> >'
        requested here
    do_pair_thing(1, std::ref(i));
    ^
```

The correct version of the above looks like this:

```c++
template <typename First, typename Second>
void do_pair_thing(First f, Second s) {
    auto pair = std::make_pair(f, s);
    typename decltype(pair)::first_type& ref1 = pair.first;
    typename decltype(pair)::second_type& ref2 = pair.second;
}
```

or this:

```c++
template <typename First, typename Second>
void do_pair_thing(First f, Second s) {
    std::pair<First, Second> pair(f, s);
    First& ref1 = pair.first;
    Second& ref2 = pair.second;
}
```


# What am I Getting At?

The correct way to program a generic function is this: *Know what you are
doing*.

That is incredibly unhelpful, I'm sure. A more elaborate answer is that one
must understand the exact API and requirements of the types you are dealing
with, and the subtle ways in which they may break from a naive understanding.

I've used "naive" several times in this post, and I don't use it as a
pejorative: I mean it in the literal sense that there is a base understanding
with which most people can be effective, which is the *naive* understanding.
For many cases, the *naive* understanding is sufficient, but when you start
programming with uncontrolled inputs (a generic library), you must now obtain
the *full* understanding if you wish to succeed. This is not a hopeless task.
Simply scrubbing away a feature of the language or library that sometimes
surprises you is not the answer.

This is vaguely reminiscent of the fear of `auto` that plagued (and still
does, to an extent) the C++ community for years. Cries of *`auto` will do the
wrong thing!* have echoed through Internet message boards for nearly a decade
now. I can't provide precise figures, but I would estimate that I've used
`auto` roughly 100,000 times so far. Of those, the number of times it has
done "the wrong thing" is probably 100. Of those, 90 of them were compile
errors and fixed immediately. Of the remaining ten, eight were a bit trickier
to track down, and two of them resulted in spooky behavior that required a
debugger. I've never seen an `auto`-related bug ship. Maybe you have, dear
reader? You have my condolences, but I would never give up this feature just
because it may do the wrong thing in rare instances.

CTAD is actually similar, in a manner: It is deducing the type of a
declaration or expression in-situ, much like `auto`, but it provides the
additional constraint about what class template it is an instantiation of.
We'll see if any real bugs start to show up from CTAD.


# Some Cool CTAD Things

We've dwelled on ways that CTAD is surprising for a while. Let's look at some
uses of CTAD that are actually pretty cool. For example, this tiny "scope
guard":

```c++
template <typename Func>
class scope_guard {
private:
    Func _func;
public:
    scope_guard(Func&& fn) : _func(std::forward<Func>(fn)) {}
    ~scope_guard() {
        _func();
    }
};
```

And using it:

```c++
int do_thing() {
    auto file = ::CreateFile();
    scope_guard close_file = [&] { ::CloseHandle(file); };
    // Do stuff...
}
```

No macro or operator trickery, no helper functions or types, no type erasure,
no `auto`. Just a clear-as-crystal scope guard. And best of all: No surprises!

Here's another one: An "operator" class template that supports partial
application for binary operator `>`:

```c++
// Default with no bound arguments
template <>
struct greater_than<void> {
    greater_than() = default;

    template <typename Left, typename Right>
    decltype(auto) operator()(Left&& l, Right&& r) {
        return std::forward<Left>(l) > std::forward<Right>(r);
    }
};

template <typename Bound>
struct greater_than  {
    Bound _bound;
    template <typename T>
        required ConvertibleTo<T, Bound>
    greater_than(T&& t)
        : _bound(std::forward<T>(t)) {}

    template <typename Left>
    decltype(auto) operator()(Left&& l) {
        return greater_than<void>()(std::forward<Left>(l), _bound);
    }
};

// Some deduction guides
template <typename T>
greater_than(T) -> greater_than<T>;
greater_than() -> greater_than<void>;
```

With it, one class template can be used as both a *unary* and *binary*
predicate:

```c++
// A sequence
int arr[] = { 1, 0, 7, 2, 3, 2, 5 };

// Find the first element "Greater than 4"
auto iter = find_if(begin(arr), end(arr), greater_than(4));

// Sort by "greater than" comparisons
sort(begin(arr), end(arr), greater_than());
```
