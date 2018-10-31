---
layout: post
title: Now I Am Become Perl —
comments: true
---

Destroyer of verbosity.

## A Defence of Terseness

Perl gets picked on for its syntax. It is able to represent very complex
programs with minimalist tokens. A jumble of punctuation can serve to represent
an intricate program. This is trivial terseness in comparison to programming
languages like APL (or its later ASCII-suitable descendants, such as J), where
not a single character is wasted.

### The Learning Curb

Something can be said for terseness. Rust, having chosen `fn` to denote
functions, seems to have hit a balance in that regard. There is very little
confusion over what `fn` means these days, and a simple explanation can
immediately alleviate any confusion. **Don't confuse *initial* confusion with
permanent confusion.** Once you get over that initial "curb" of confusion, we
don't have to worry any more.

### Foreign != Confusing

You'll also find when encountering a new syntax that you will immediately not
understand, and instead wish for something much simpler. Non-C++ programers,
for example, will raise an eyebrow at the following snippet:

```c++
[&, =foo](auto&& item) mutable -> int { return item + foo.bar(something); }
```

I remember my first encounter with C++ lambdas, and I absolutely *hated* the
syntax. It was foreign and unfamiliar, but other than that, my complaints
stopped. I could have said "This is confusing," but after having written C++
lambda expressions for years the above syntax has become second nature and very
intuitive. **Do not confuse familiarity with simplicity.**

### Explicit is Better than Implicit...

...except when it needlessly verbose.

Consider the following code:

```c++
template <typename T, typename U, int N>
class some_class {};
```

Pretty straightforward, right?

Now consider this:

```c
class<T, U, int N> some_class {};
```

Whoa... that's not C++!

Sure, but *it could be,* if someone were convinced enough that it warranted a
proposal, but I doubt it will happen any time soon.

So, you _know_ it isn't valid C++, but do you know *what the code means?* I'd
wager that the second example is quite clear to almost all readers. It's
semantically identical to the former example, but *significantly terser*. It's
visually distinct from any existing C++ construct, yet when shown the two
"equivalent" code samples side-by-side you can immediately cross-correlate them
to understand what I'm trying to convey.

There's a lot of bemoaning the verbosity of C++ class templates, especially in
comparison to the syntax of generics in other languages. While they don't map
identically, a lot of the `template` syntax is visual noise that was inserted
to be "explicit" about what was going on, so as not to confuse a reader that
didn't understand how template syntax works.

The `template` syntax, *despite being an expert-friendly feature*, uses *a
beginner-friendly syntax.* As someone who writes a lot of C++ templates, I've
often wished for terseness in this regard.

### `foo` and `bar` considered harmful.

Consider this:

```c++
auto foo = frombulate();
std::sort(
    foo.begin(),
    foo.end(),
    [](auto&& lhs, auto&& rhs) {
        return lhs.bar() < rhs.bar();
    }
);
```

... What?

What does the code even *do*? Obviously `auto` is harmful. It's completely
obscuring the meaning of our code! Let's fix that by adding explicit types:

```c++
std::vector<data::person> foo = frombulate();
std::sort(
    foo.begin(),
    foo.end(),
    [](const data::person& lhs, const data::person& rhs) {
        return lhs.bar() < rhs.bar();
    }
);
```

Looking at the API for `data::person`, we can see that `bar()` is a deprecated
alias of `name()`, and `frombulate()` is deprecated in favor of `get_people()`.
And using the name `foo` to refer to a sequence of `data::person` seems silly.
We have an English plural `people`. Okay, let's fix all those things too:

```c++
std::vector<data::person> people = get_people();
std::sort(
    people.begin(),
    people.end(),
    [](const data::person& lhs, const data::person& rhs) {
        return lhs.name() < rhs.name();
    }
);
```

Perfect! We're now know exactly what we're doing: Sorting a list of people by
name.

Crazy idea, though... Let's put those `auto`s back in and see what happens:

```c++
auto people = get_people();
std::sort(
    people.begin(),
    people.end(),
    [](auto&& lhs, auto&& rhs) {
        return lhs.name() < rhs.name();
    }
);
```

Oh no! Our code has suddenly become unreadable again and... oh.

Oh wait.

No, it's just fine. We can see that we're sorting a list of people by
their name. No explicit types needed. We can see perfectly well what's going on
here. **Using `foo` and `bar` while demonstrating why some syntax/semantics are
bad is muddying the water. No one writes `foo` and `bar` in real
production-ready code.** (If you do, please don't send me any pull requests.)

### Even Terser?

`std::sort` in the above example takes an iterator pair to represent a "range"
of items to iterate over. Iterators are pretty cool, but the common case of
"iterate *the whole thing*" is common enough to warrant "we want ranges."
Dealing with iterables should be straightforward and simple. With ranges, the
iterator pair is extracted implicitly, and we might write the above code like
this:

```c++
auto people = get_people();
std::sort(
    people,
    [](auto&& lhs, auto&& rhs) {
        return lhs.name() < rhs.name();
    }
);
```

That's cool! And we could even make it shorter (even fitting the whole `sort()`
call on a single line) using an expression lambda:

```c++
auto people = get_people();
std::sort(people, [][&1.name() < &2.name()]);
```

What? You haven't seen this syntax before? Don't worry, you're not alone: I
made it up. The `&1` means "the first argument", and `&2` means "the second
argument."

> Note: I'm going to be using range-based algorithms for the remainder of this
> post, just to follow the running theme of terseness.

# A Modest Proposal: Expression Lambdas

If my attempt has been successful, you did not recoil in horror and disgust as
the sight of my made-up "expression lambda" syntax:

```c++
[][&1.name() < &2.name()]
```

Here's what I hope:

- You are over the "learning curb" as you've seen how the syntax corresponds to
  an earlier syntax. (The "expression lambda" is roughly equivalent to the
  lambda in the prior example).
- You have seen how a prior "foreign" example ("terse" templates) can be
  understandable, even if not perfect.
- You know exactly what it means because the example does not simply use
  "dummy" identifiers (`foo`, `bar`, `baz`, etc.) and actually acts in a
  real-world-use-case capacity.

Yes, the lead-in paragraphs were me buttering you up in preparation for me to
unveil the horror and beauty of "expression lambdas."

# Prior Art?

> But Vector, this is just [Abbreviated Lambdas](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2017/p0573r2.html)!

I am aware of the abbreviated lambdas proposals, and I am aware that it was
shot down as (paraphrasing) "they did not offer sufficient benefit for their
added cost and complexity."

Besides that, "expression lambdas" are _not_ abbreviated lambdas. Rather, the
original proposal document cites this style as "hyper-abbreviated" lambdas. The
original authors note that their abbreviated lambda syntax "is about as
abbreviated as you can get, without loss of clarity or functionality." I take
that as a challenge.

For one, I'd note that all their examples use simplistic variables names, like
`a`, `b`, `x`, `y`, `args`, and several others. The motivation for the
abbreviated lambda is to gain the ability to wield terseness where verbosity is
unnecessary. Even in my own example, I named my parameters `lhs` and `rhs` to
denote their position in the comparison, yet there is very little confusion as
to what was going on. I could as well have named them `a` and `b`. We
understood with the context what they were. The naming of parameters when we
have such useful context clues is unnecessary!

I don't want abbreviated lambdas. I'm leap-frogging it and proposing
hyper-abbreviated lambdas, but I'm going to call them "expression lambdas,"
because I want to be different (and I think it's a significantly better name).

## Use-case: Calling an overload-set

C++ overload sets live in a weird semantic world of their own. They are not
objects, and you cannot easily create an object from one. For additional
context, [see Simon Brand's talk on the subject](https://www.youtube.com/watch?
v=L_QKlAx31Pw). There are several proposals floating around to fill this gap,
but I contend that "expression lambdas" can solve the problem quite nicely.

Suppose I have a function that takes a sequence of sequences. I want to iterate
over each sequence and find the maximum-valued element within. I can use
`std::transform` and `std::max_element` to do this work:

```c++
template <typename SeqOfSeq>
void find_maximums(Seq& s) {
    std::vector<typename SeqOfSeq::value_type::const_iterator> maximums;
    std::transform(s,
                   std::back_inserter(maximums),
                   std::max_element);
    return maximums;
}
```

Oops! I can't pass `std::max_element` because it is an overload set, including
function templates. How might an "expression lambda" help us here? Well, take a
look:

```c++
template <typename SeqOfSeq>
void find_maximums(Seq& s) {
    std::vector<typename SeqOfSeq::value_type::const_iterator> maximums;
    std::transform(s,
                   std::back_inserter(maximums),
                   [][std::max_element(&1)]);
    return maximums;
}
```

If you follow along, you can infer that the special token sequence `&1`
represents "Argument number 1" to the expression closure object.

What if we want to use a comparator with our expression lambda?

```c++
template <typename SeqOfSeq, typename Compare>
void find_maximums(Seq& s, Compare&& comp) {
    std::vector<typename SeqOfSeq::value_type::const_iterator> maximums;
    std::transform(s,
                   std::back_inserter(maximums),
                   [&][std::max_element(&1, comp)]);
    return maximums;
}
```

Cool. We capture like a regular lambda `[&]` and pass the comparator as an
argument to `max_element`. What does the equivalent with regular lambdas look
like?

```c++
template <typename SeqOfSeq, typename Compare>
void find_maximums(Seq& s, Compare&& comp) {
    std::vector<typename SeqOfSeq::value_type::const_iterator> maximums;
    std::transform(s,
                   std::back_inserter(maximums),
                   [&](auto&& arg) -> decltype(std::max_element(arg, comp)) {
                       std::max_element(arg, comp)
                   });
    return maximums;
}
```

That's quite a bit more. And yes, that `decltype(<expr>)` is required for
proper SFINAE when calling the closure object. It may not be used in this exact
context, but it is useful in general.

> What about variadics?

Simple:

```c++
[][some_function(&...)]
```

> What about perfect forwarding?

Well... we're still in the boat of using `std::forward<decltype(...)>` on that
one. Proposals for a dedicated "forward" operator have been shot down
repeatedly. As someone who does _a lot_ of perfect forwarding, I would love to
see a dedicated operator (I'll throw up the `~>` spelling for now).

The story isn't much better for current generic lambdas, though:

```c++
[&](auto&&... args) -> decltype(do_work(std::forward<decltype(args)>(args)...)) {
    return do_work(std::forward<decltype(args)>(args)...);
}
```

"Expression lambdas" would face a similar ugliness:

```c++
[&][do_work(std::forward<decltype(&...)>(&...))]
```

At least it can get away from the `-> decltype(...)` part.

If we had a "forwarding operator", the code might look something like this:

```c++
[&](auto&&... args) -> decltype(~>args...)) {
    return do_work(~>args...);
}
```

And this for "expression lambdas":

```c++
[&][do_work(~>&...)]
```

Are we Perl yet?

Tell me if and why you love or hate my "expression lambda" concept.
