---
layout: post
title: Eliminating the Static Overhead of Ranges
desc: In which I discuss two my pet proposals for the C++ language, and how
    they might benefit ranges.
---

C++20 is slated to receive *Ranges*, which is probably the most significant
library update since the STL itself was introduced.

One of Ranges' most prominent feature is that of *pipeline* style. Suppose we
have an extremely simple task: We want to get the names of every child that is
below the age of 14. Here's the traditional rote implementation:

```c++
vector<string> child_names;
for (auto& person : all_people) {
    if (person.age < 14) {
        child_names.push_back(person.name);
    }
}
```

Looks pretty standard. We declare the vector outside of the loop, then we
iterate over ever person object, and if it matches our criterion we will
append that person's name to our list.

Here is some equivalent code using ranges:

```c++
auto children_names =
    all_people
    | filter([](const auto& person) { return person.age < 14; })
    | transform([](const auto& person) { return person.name; })
    | to_vector;
```

There are a few significant differences, both technical and semantic:

1. Semantically: We are now very *explicit* about what we are doing. It is
   simple to understand this pipeline to be "filter" then "transform," because
   that is literally the order that these operations appear in the source. We
   can consider that almost all of computing activity is about the
   manipulation of sequences. The ranges+pipeline style brings to the
   forefront the primary concepts of dealing with sequences or "ranges."
   1. We can see that we begin with `all_people`
   2. The semantics of `filter` is that of "Allow some of the elements of the
      range, but ignore others."
   1. Feed the filtered elements into `transform`, the semantics of which are
      that of "Replace each element in the sequence with the result of feeding
      it to some mapping/projection."
   1. Take the result of the transform and generate a `std::vector` from every
      element.
2. We use `to_vector` to immediately convert the range into a `std::vector`,
   but this step is not even necessary in some cases. Without `to_vector`, the
   range is "lazy" and individual values are fed from the first step
   (`all_people`) through the pipelines (`filter` -> `transform`) as a user
   walks through the range.

The concept of "feed value `A` into `B`" is not new. We've been doing it since
the creation of the subroutine:

```c++
auto user = get_user();
print_info(user);
```

This is a simple pipeline from `get_user() -> print_info()`. We can, of course,
compose additional operations that act on the intermediate values:

```c++
auto user = get_user();
auto group = get_primary_group(user);
print_info(group);
```

And now have a pipeline from
`get_user() -> get_primary_group() -> print_info()`. You'll also note that the
`print_info` at the final step *isn't the same* as the `print_info` from the
prior sample: In this case, we are `print_info`-ing a "group" object rather
than a "user" object. In this way, the pipeline not only transforms the
*value* of the input but also the *type* of the input.

The intermediate variables can be a bit annoying to see, so perhaps we can
fold the calls together?

```c++
print_info(get_primary_group(get_user()));
```

Err...

That's a bit ugly. We'll get back to this one...

We've used `get_primary_group`, but what if we want to get *all* groups in
which a user belongs?

```c++
auto user = get_user();
auto groups = get_user_groups(user);
for (const auto& grp : groups) {
    print_info(grp);
}
```

We have to introduce a loop here, as the `print_info` object only expects a
single value. We have to "unwrap" the range with our `for` loop.

Ranges has an algorithm for this: The simplest algorithm of all: `for_each`:

```c++
auto user = get_user();
auto groups = get_user_groups(user);
for_each(groups, print_info);
```

We've flattened our code by removing our explicit `for` loop! In fact, I'd say
this is *preferable* to the prior sample. The old `std::for_each` taking
iterator pairs was often too cumbersome to work with when iterating over a
full sequence, so this is a nice alternative.

> (Keen-eyed users: Ignore that `print_info` is an overload set. This is
> ~~slideware~~ blogware, not software.)

Again, we can fold our operations into a single full-expression:

```c++
for_each(get_user_groups(get_user()), print_info);
```

and it looks pretty terrible. Imagine if we had a dozen individual "pipeline"
elements all folded into this single expression. Why would we want to do that
to ourselves? We don't, so we don't write this way. It's hard to understand,
hard to write, hard to debug, and hard one the eyes.

> **Problem 1**: Nested function calls are hard to read.


# Pipelines in Ranges

Ranges generalizes the notion of a "pipeline" to operate on general iterable
objects. Suppose the following pipeline:

```c++
// Pipeline
auto primary_groups = get_all_users() | transform(get_primary_group);
```

Read as: Feed `get_all_users()` into `transform(get_primary_group)`, where
`transform(get_primary_group)` is a pipeline element that maps its inputs
through its operand `get_primary_group()`

For each element of the range returned by `get_all_users()`, transform that
element using `get_primary_group()`, and yield a new range from the results.

This may sound familiar from our prior example. In fact, this pipeline-style
composition is semantically equivalent to the following imperative style:

```c++
// Imperative
auto users = get_all_users();
auto primary_groups = transform(users, get_primary_group);
```

and semantically equivalent to the ugly nested style:

```c++
// Nested
auto primary_groups = transform(get_all_users(), get_primary_group);
```

So we have three roughly equivalent ways of representing the same computation.
We can probably agree that the `Nested` style is pretty ugly, but what's the
benefit of the `Pipeline` style over `Imperative`?

In this snippet, not much. Where ranges really shines is in the ability to
define and compose the pipelines.


## Kingdom of Sequences

You might have noticed that I moved to plurals in the prior section, while the
previous has used singular `user` and `group` objects. This is because ranges
acts on... ranges. A `user` is not a sequence, unless you count it as a
sequence of one element (which is valid, but cumbersome). This means that the
following is invalid:

```c++
auto groups = get_user() | get_user_groups();  // NOPE!
for_each(groups, print_info);
```

Obviously this code won't work. The reason ranges can work with the vertical
bar `|` (or "pipe") operator is through the overloading of `operator|` on the
intermediate types. The `user` object from `get_user()` defines no such
operation, and there is no `get_user_groups` taking zero arguments. The above
code is just nonsense.

> **Problem 2**: "Pipeline" style only works with ranges.


# Some Algorithms are More Equal than Others

So we can't feed `get_user()` into `get_user_groups()` with a pipeline, but
can we at least feed `get_user_groups()` into `for_each()`?

```c++
auto user = get_user();
get_user_groups(user) | for_each(print_info);
```

Nope! This won't work in the current design and implementation of Ranges.

The way `|` works is special. When I call `transform(some_fn)`, what
`transform` does *is not* "transform," but rather return an intermediate value
that has an overloaded `operator|`. So, it must be this `operator|` that
performs the transform? Nope:

```c++
auto f = transform(trim_whitespace) | transform(make_uppercase)
```

In this expression, there is still no actual range object that we have to
operate on. So what is type of `f`?

The overloaded `operator|` *does not* unconditionally perform a transform.
Rather, it must choose whether it should "transform" or "compose" with another
range adaptor. The type of `f` in the above is this new range adaptor created
by the composition of the two `transform`s. It *also* has an overloaded
`operator|`.

```c++
auto g = f | transform(reverse)
```

Again, we have not yet fed a value to our range adaptor. The type of `g` is
*another* composed range adaptor, now composed of three transforms (two are
"stored" in `f`).

```c++
vector<string> s = get_usernames() | g;
```

Now! Now we have actually fed a range into our adaptor, and the actual
computation takes place.

So, going back around, what about this snippet:

```c++
get_user_groups(user) | for_each(print_info);
```

Why does this not work? The answer is simple: Unlike `transform`, there is no
overload of `for_each` that yields a range adaptor. Calling `for_each` with a
single argument is simply invalid. When we design a range adaptor, we must
"opt-in" to the behavior that supports this "partial application" to support
the `operator|` semantics.

Fair warning: the code to support this syntax is not insignificant.

> **Problem 3**: "Pipeline" style is opt-in, and not all algorithms support it.


# Building Reusable Pipelines

I've talked about a few downsides of ranges, but let's talk about one of its
greatest features: Composition.

Suppose we have a `get_middle_name()` function:

```c++
optional<string> get_middle_name(user);
```

Not everyone has a middle name, so we return an `optional`, using `nullopt` to
represent the "absence" of a user's middle name.

Now, what if we want to collect users' middle names?

```c++
vector<string> middle_names;
for (const auto& user : get_users()) {
    auto mid_name_opt = get_middle_name(user);
    if (mid_name_opt) {
        middle_names.push_back(*mid_name_opt);
    }
}
```

Er... That's gross. Can we use ranges?

```c++
vector<string> middle_names = get_users()
                            | transform(get_middle_name);
```

Not so fast! The range returned by our pipeline is a range of
`optional<string>`, *not* a range of `string`. We need to encapsulate the body
of the loop in the prior example into a new range adaptor. We *could* write
all the boilerplate of a completely new range algorithm, or we could simply
use what is existing in the Ranges library:

```c++
// dereferencable<T> ➞ T
auto deref_item = [](const auto& item) { return *item; };
// range<dereferencable<T>> ➞ range<T>
auto deref_each = transform(deref_item);
```

We've defined a small function that dereferences values, and we've made a
range that passes each element through our dereferencing function. Ready to
use?

```c++
vector<string> middle_names = get_users()
                            | transform(get_middle_name)
                            | deref_each;
```

Of course not!! We're just blindly dereferencing each `optional`! That'll
never do. We need to "filter" out `nullopt` objects:

```c++
// optional<T> ➞ bool
auto is_engaged = [](const auto& opt) { return opt.has_value(); };
// range<optional<T>> ➞ range<optional<T>>
auto only_engaged = filter(is_engaged);
```

Now we can glue our pieces together:

```c++
vector<string> middle_names = get_users()
                            | transform(get_middle_name)
                            | only_engaged
                            | deref_each;
```

Excellent! Any downstream element of `only_engaged` has a guarantee that each
`optional` it receives is engaged.

Actually, these two pieces together are pretty useful. Could we save them for
later? Of course!

```c++
// range<optional<T>> ➞ range<T>
auto unopt_each = only_engaged | deref_each;
```

Our new `unopt_each` range adaptor is generic for any `optional`-like thing.
It doesn't even mention `std::optional`: Any type that supplies both
`has_value()` and `operator*` can be used with `unopt_each`.


# The Static Overhead

While ranges may be a zero-runtime-overhead abstraction (provided you have
even a basic inliner running), it has great compile-time, write-time,
read-time, and debug-time overhead. I'll collect these into a term "static
overhead."

The range code, despite being beautifully easy to understand and read, has a
large amount of complexity buried within. When all is well, we don't have to
worry much about this. Unfortunately, the "happy path" is very often the path
less travelled by.

You'll also note my qualification that you need a inliner to have the ranges
boilerplate evaporate at runtime. When working with unoptimized builds, all of
that boilerplate needs to be walked through at runtime (and especially at
debug time!).


## Zero-Overhead Composition

You'll remember our straightforward imperative style of composition:

```c++
auto a = foo();
auto b = bar(a);
auto c = baz(b);
```

This is incredibly easy to debug, and has zero overhead, both at runtime or
"static" overhead.

At the apex of the range-v3 library is the Calendar example. At the apex of
the Calendar Example is the `format_calendar` function:

```c++
// In:  range<date>
// Out: range<string>, lines of formatted output
auto
format_calendar(std::size_t months_per_line)
{
    return
        // Group the dates by month:
        by_month()
        // Format the month into a range of strings:
      | layout_months()
        // Group the months that belong side-by-side:
      | views::chunk(months_per_line)
        // Transpose the rows and columns of the size-by-side months:
      | transpose_months()
        // Ungroup the side-by-side months:
      | views::join
        // Join the strings of the transposed months:
      | join_months();
}
```

Understanding the individual elements of the above pipeline isn't necessary,
but a few things to note:

1. The *function* `format_calendar` accepts a `size_t` specifying how many
   months we want on an output line, and returns a range adaptor.
2. The range adaptor returned by `format_calendar` accepts a `range<date>` as     input and yields a `range<string>` as output.
3. The type of the range adaptor is not specified in the function. A violation
   of the input constraints of the adaptor will be reported somewhere
   seemingly unrelated to `format_calendar`. Ouch.

> **Problem 4**: Without redesigns, naive custom pipelines with input
> constraints will disassociate the point-of-error from point-of-requirement.

Walking through this code in a debugger will be an exercise in pain. The
imperative style, by contrast, is trivial to debug:

```c++
template <range<date> Calendar>
auto format_calendar(const Calendar& cal, size_t months_per_line) {
    // Group the dates by month
    auto months = by_month(cal);
    // Format the months into a range of strings
    auto month_strings = layout_months(months);
    // Group the months that belong side-by-side
    auto chunked_months = chunk(month_strings, months_per_line);
    // Transpose the rows and columns of side-by-side months
    auto transposed = transpose_months(chunked_months);
    // Ungroup the side-by-side months
    auto joined_view = view::join(transposed);
    // Join the strings of the transposed months
    return join_months(joined_view);
}
```

Simple, easy to understand, easy to debug, full of tautological variable
names, incredibly verbose, and most significantly: not API compatible *at
all*. We're now taking the range of dates as an input to `format_calendar`,
rather than returning a range adaptor! `format_calendar` can no longer be
used in a pipeline, as the "input" to this "adaptor" is actually a function
parameter!

> **Problem 5**: Pipeline style is difficult to debug.

Just for fun, let's write the code using the *nested* style:

```c++
template <range<date> Calendar>
auto format_calendar(Calendar&& cal, size_t months_per_line) {
    // Join the strings of the transposed months
    return join_months(
        // Ungroup the side-by-side months
        view::join(
            // Transpose the rows and columns of side-by-side months
            transpose_months(
                // Group the months that belong side-by-side
                chunk(
                    // Format the months into a range of strings
                    layout_months(
                        // Group the dates by month
                        by_month(cal)
                    ),
                    months_per_line
                )
            )
        )
    );
}
```

Okay, I lied about the "fun" part. This is awful, but it gives us a hint at a
possible solution, and not just a solution to the debuggability, but the need
to write boilerplate, the unoptimized runtime overhead, and the ability to
work with non-range values in a "pipeline" style.


# Eliminating the Static Overhead

For reference, the five issues I've outlined:

1. Nested function calls are hard to read. (Not really an issue with Ranges,
   but will be relevant.)
2. Pipeline style only works on range objects and range adaptors.
3. Pipeline style is opt-in, and not all range algorithms have opted-in.
4. Naive custom range adaptors made from pipelines that carry input
   constraints will disassociate the point-of-error from point-of-requirement.
5. Pipeline style is difficult to debug.

And now, let's fix them all with a single feature: The pipeline-rewrite
operator.


## A Unique Operator

Many languages have a "pipe" operator, and they have different semantics
depending on the language. For the spelling, I've chosen `|>`. For the
semantics I've chosen a very specific behavior that will specifically work to
the benefit of solving the above five problems. To understand what `|>` does,
it is best seen with a code sample:

```c++
// Replace all occurrences of `needle` found in `str` with `repl`
string replace(string str, string needle, string repl);

// "sanitize" the given string
string sanitize(string s) {
    return s |> replace("eval", "review");
}
```

The `sanitize` function will replace any occurrence of `eval` with `review`.
It does this by feeding the input string `s` into `replace`.

We call `replace` with two arguments, and that... wait. Where is the overload
of `replace` taking two arguments?

Hint: *It doesn't exist*. There is no overload of `replace` taking two
arguments in this sample. In fact, there is no *invocation* of `replace` with
two arguments. `sanitize` is calling `replace` with *three* arguments: `s`,
`"eval"`, and `"review"`.

The `|>` operator is *not* a runtime operator. It is not overloadable. It does
not produce any changes to the generated code. It has no semantics in the
abstract machine. The `|>` operator manipulates the very syntax of the
language to generate pipeline style *for free*. There is nothing at all
special about `replace` that allows it to support `|>`. There are no changes
to `string` needed support `|>`. It Just Works™ out of the box.

Here are the rules and semantics of the `|>` operator:

1. The right-hand side of `|>` must be a call expression. **Important:** It is
   not a *callable* expression, but a *call* expression.
2. The resulting expression is *as-if* the user has placed the left-hand
   operand as the first argument of the function call expression on the
   right-hand side.
3. Any arguments appearing in the right-hand function call expression are
   "shifted over" to accommodate the left-hand expression begin passed as the
   first argument.
4. The `|>` is left-associative.

Thus the following two snippets are not just semantically *equivalent*, but
semantically *identical*:

```c++
s |> replace("foo", "bar");
```

```c++
replace(s, "foo", "bar");
```


## Solve #1: Nested function calls are hard to read.

Take our `replace` function. Suppose we want to make multiple replacements.
The code would look something like this:

```c++
string replace(string str, string needle, string repl);

string change_string(string s) {
    s = replace(s, "foo", "bar");
    s = replace(s, "baz", "qux");
    s = replace(s, "\r\n", "\n");
    s = replace(s, "\t", "    ");
    s = replace(s, "\x1b", "ESC");
    return s;
}
```

I mean... It doesn't look *horrible*, but it's not very nice. We keep
re-assigning into `s` just to pass it to the next call to `replace`. This
necessitates that `s` cannot be `const`, despite it being used for nothing
other than intermediate storage. We could embed reach `s` into the following
expression in the *nested* style. This gives us a single `return` statement,
and we can `const` the argument `s`:

```c++
string replace(string str, string needle, string repl);

string change_string(const string& s) {
    return replace(
        replace(
            replace(
                replace(
                    replace(
                        s,
                        "foo",
                        "bar"
                    ),
                    "baz",
                    "qux",
                ),
                "\r\n",
                "\n"
            ),
            "\t",
            "    "
        ),
        "\x1b",
        "ESC"
    );
}
```

(I feel like I need to wash my hands after writing that code.)

This is horrible, but it more closely represents the semantics of the what the
function really does. Let's try again, now with the power of `|>`:

```c++
string replace(string str, string needle, string repl);

string change_string(string s) {
    return s
      |> replace("foo", "bar")
      |> replace("baz", "qux")
      |> replace("\r\n", "\n")
      |> replace("\t", "    ")
      |> replace("\x1b", "ESC");
}
```

By the meaning of `|>`, this code is semantically *identical* to the code
using the nested calls, but I'd say it is much more legible, would you agree?

Here is the support code we need to make `replace` work with the `|>` operator:

```c++
// [This space intentionally left blank]
```


## Solve #2: Pipeline style only works on range objects and adaptors

The prior example used `string`s, which haven't opted-in to support any
special semantics, despite being "range-like."

Let's go back to our earlier sample:

```c++
auto groups = get_user() | get_user_groups();
```

This does not work because 1) a `user` is not a range, and 2) `get_user_groups()`
is not callable with zero arguments, and does not return any kind of "adaptor"
type.

We can use pipeline style via `|>` if we add this additional support code:

```c++
// [This space intentionally left blank]
```

and now:

```c++
auto groups = get_user() |> get_user_groups();
```

It all Just Works™! The value of the left-hand expression `get_user()` is
inserted as the first argument to the function call on the right-hand side,
`get_user_groups()`, thus `get_user_groups(get_user())`.

The type of `user` is not tweaked in any way, and there are no ranges involved
(other than the return value of `get_user_groups()`. Speaking of...)


## Solve #3: Pipeline style is opt-in for algorithms

So we got our user's groups, and now we want to send them to `print_info`.
Remember that `for_each()` does not have an overload returning a range
adaptor. It expects a range and a unary function immediately:

```c++
auto groups = get_user() |> get_user_groups();
groups | for_each(print_info());  // NOPE!
```

You can probably tell where this is going. Yadda yadda, additional support
code intentionally blank, skip to the point:

```c++
get_user()
    |> get_user_groups()
    |> for_each(print_info);
```

`for_each` is completely unchanged. In fact, *every function ever written* now
supports `|>` *for free*.

Remember that `transform` has two overloads?

```c++
auto transform(fn);         // [1] Returns a range adaptor
auto transform(range, fn);  // [2] Transforms the given range by `fn`
```

In the first example with `transform`, we used overload `[1]` to produce a
range adaptor. Here's that example rewritten with `|>`:

```c++
// Pipeline
auto primary_groups = get_all_users() |> transform(get_primary_group);
```

Despite appearances, this is using overload `[2]`. In fact, if we only use
`|>` with the existing ranges library, we can simply discard the overload
`[1]` altogether. We don't need it! Library maintainers don't need to write
any boilerplate to produce range adaptors. In fact, the "range adaptor"
objects disappear entirely. All we have left are regular functions that
operate on ranges immediately upon invocation.


## Solve #4: Custom range adaptors build from pipelines don't express constraints

The solution to #4 comes as a byproduct of dropping range adaptors. Because
our range operations are now all regular functions, we can express the
constraints and concepts on those functions naturally. Let's bring back our
`format_calendar()` example, now using the pipeline style:

```c++
template <range<date> Calendar>
range<string> format_calendar(const Calendar& cal,
                              std::size_t months_per_line) {
   return
      cal
        // Group the dates by month:
        |> by_month(cal)
        // Format the month into a range of strings:
        |> layout_months()
        // Group the months that belong side-by-side:
        |> views::chunk(months_per_line)
        // Transpose the rows and columns of the size-by-side months:
        |> transpose_months()
        // Ungroup the side-by-side months:
        |> views::join()
        // Join the strings of the transposed months:
        |> join_months();
}
```

Because we are using a constrained template parameter, violations of those
constraints will refer directly to the call site where that violation occurred,
rather than deep within the template machinery of the range adaptor.

We've still broken the interface of `format_calendar` (it now takes the
calendar immediately), but with the help of `|>`, the code that was previously:

```c++
dates_of_year(2020) | format_calendar(3);
```

can be written as

```c++
dates_of_year(2020) |> format_calendar(3);
```

which is minimally disruptive.


## Solve #5: Pipeline style is difficult to debug

With the loss of the boilerplate underlying the work done by range adaptors
and `operator|`, we get debuggability close to that of the imperative style.
We do not need step-in-out-in-out-in-out of the pipeline support code for `|>`,
because *there is none*.

In fact, I could hypothesize a debugger taking advantage of `|>`. We have all
been in that situation where we have a nested call:

```c++
foo(bar());
```

We hit it in the debugger, and we want to see the return value of `bar()`
before it gets passed to `foo()`. How do we do that? Step in? That will just
send us into `bar()`, and if we then step-out we *might* see a "return value"
in the watch window, or we might see nothing. Step over? No: That will just
send us flying across `foo()`. The only reliable way is to step-in to `bar()`,
step-out, then step-in to `foo()`, where we can see the value of the first
argument (assuming you *can* step-in to `foo()`: You might not have the debug
symbols for it). Don't even ask if we have `foo(bar(baz()))`. Uggh.

Imagine a smart compiler generating debug information such that this code:

```c++
baz()
|> bar()
|> foo();
```

Will result in meaningful step-over calls over each step in the pipeline. Such
smart debug information would be difficult to generate with `operator|` and
range adaptors, since the meaning behind such things is completely opaque to a
compiler/debugger.


## Additional Goodies

There are two more great benefits to using `|>`:

1. Compiling code with `|>` is *far* less taxing on a compiler/linker than the
   code required to support the overloaded `operator|`. Reduced compile/link
   time, and smaller codegen.
2. Writing code to support `|>` is the same as writing regular code. There is
   no need to support two overloads of each algorithm when a single one will
   work with both pipeline style and immediate style.


# Solving `unopt_each`

You may recall this code from a prior example:

```c++
vector<user> get_users();
optional<string> get_middle_name(user);

vector<string> all_middle_names() {
    // dereferencable<T> ➞ T
    auto deref_item = [](const auto& item) { return *item; };
    // range<dereferencable<T>> ➞ range<T>
    auto deref_each = transform(deref_item);

    // optional<T> ➞ bool
    auto is_engaged = [](const auto& opt) { return opt.has_value(); };
    // range<optional<T>> ➞ range<optional<T>>
    auto only_engaged = filter(is_engaged);

    // range<optional<T>> ➞ range<T>
    auto unopt_each = only_engaged | deref_each;
    return get_users()
       | transform(get_middle_name)
       | unopt_each;
}
```

If we remove range adaptors and the overloaded `operator|`. This won't work
anymore! Let's take them one at a time.

## `deref_each`

We have `deref_each`, a handle little range transformer:

```c++
auto deref_each = transform(deref_item);
```

Without the overload of `transform` accepting a single argument and returning
a range adaptor, this code is broken. The solution? EZ PZ:

```c++
auto deref_each = [](auto&& range) {
                      return range
                        |> transform(deref_item);
                  };
```

Err... that's a lot more code, but it definitely works! Now, when we use
`deref_each` in a pipeline, we must call it: `rng |> deref_each()`.
Additionally, we get immediate-style for free: `deref_each(rng)`.

Still, it's so *ugly*! We'll come back to this...

## `only_engaged`

`only_engaged` follows a very similar pattern:

```c++
auto only_engaged = filter(is_engaged);
```

becomes:

```c++
auto only_engaged = [](auto&& rng) {
                        return range
                          |> filter(is_engaged);
                    };
```

Noticing a pattern?


## The Composition: `unopt_each`

Our composition of adaptors, `unopt_each`, made use of `operator|`, and we
can't simply convert it to use `|>`. Like `deref_each` and `only_engaged`, we
must wrap it in a lambda expression:

```c++
auto unopt_each = [&](auto&& rng) {
                      return rng
                        |> only_engaged()
                        |> unopt_each();
                  };
```


## The Result

The resulting pipeline expression looks markedly similar to the original:

```c++
    return get_users()
       |> transform(get_middle_name)
       |> unopt_each();
```

We must actually invoke the closure `unopt_each`, but that is not a huge
difference.


## Curing *The Ugly*

Having to wrap our in-situ custom range algorithms with lambda expressions is
a lot of typing and quite an eyesore. What can we do to fix it?

Well: Nobody expects the ~~Spanish Inquisition~~ expression lambdas!

Readers may be familiar with my prior blog post on my informal proposal for
*expression lambdas*, which are lambda expressions that consist of a single
expression that stands in for the return value, using placeholder names for
the implicit arguments:

```c++
// Expression lambda:
auto l1 = [][_1.foo() + baz(_2)];
// Roughly equivalent to:
auto l2 = [](auto&& __1, auto&& __2) { return __1.foo() + baz(__2); };
```

> (In my prior post I used `&N` as the placeholder, but I'm considering
> proposing with `_N` instead, just to be less punctuation-dense.)

If we introduce expression lambdas into our example, this:

```c++
auto deref_item = [](const auto& item) { return *item; };
auto deref_each = [&](auto&& range) {
                      return range
                        |> transform(deref_item);
                  };

auto is_engaged = [](const auto& opt) { return opt.has_value(); };
auto only_engaged = [&](auto&& rng) {
                        return range
                          |> filter(is_engaged);
                    };

auto unopt_each = [&](auto&& rng) {
                      return rng
                        |> only_engaged()
                        |> unopt_each();
                  };
```

can be rewritten:

```c++
auto deref_item = [][*_1];
auto deref_each = [&][_1 |> transform(deref_item)];

auto is_engaged   = [][_1.has_value()];
auto only_engaged = [&][_1 |> filter(is_engaged)];

auto unopt_each = [&][_1 |> only_engaged() |> deref_each()];
```

No magic range adaptor objects, just functions.


# Bringing it Back Around

Ignoring the possibility of `|>` for a moment, remember the two snippets at
the top of this post?

```c++
// Imperative style
vector<string> child_names;
for (auto& person : all_people) {
    if (person.age < 14) {
        child_names.push_back(person.name);
    }
}

// Pipeline style
auto children_names =
    all_people
    | filter([](const auto& person) { return person.age < 14; })
    | transform([](const auto& person) { return person.name; })
    | to_vector;
```

Despite the pipeline style being declarative and very ~fancy~, we'd probably
all agree that it is *way* more verbose, and dare I say... "ugly"? Let's
bring in expression lambdas, and see how they can fit into Ranges without a
`|>` operator involved:

```c++
auto children_names =
    all_people
    | filter([][_1.age < 14])
    | transform([][_1.name])
    | to_vector;
```

This, in my opinion, is *beautiful* code.
