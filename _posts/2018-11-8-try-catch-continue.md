---
layout: post
title: Levelling the try/catch Mountain
comments: true
desc: In which I informally propose a radical C++ language addition
---

> Level - *verb* (used with object). *levelled, levelling*
> > To make even or flat

> Brace yourself. This post ends with an informal language-addition proposal.

Exceptions have a usability problem. I'm not speaking anything of their
performance characteristics, but purely in the *semantic* and *syntactic*
sense. To illustrate, let's write an example.

# May I Interest You in Some Tee?

`tee` is a program that, at the most general sense, reads from a stream, then
writes that data to both `stdout` and a file. I won't implement all of `tee`,
but I'll make a minimal `tee`-like function that reads from a file, then
streams that file to both `stdout` and a file on another path. Ignore any
questions of performance or optimization, those are beside the point. I've
omitted some namespace qualifiers to keep it short.

Here's some pre-defined code we are working with:

```c++
/**
 * Open the given file.
 * @throws `std::system_error`
 */
fstream open_file(path filepath, std::ios::openmode mode);

/**
 * Copy from the given input stream to the given output stream.
 * @throws `std::runtime_error`, `std::system_error`
 */
void copy_stream(std::istream& input, std::ostream& output);
```

And here is the important code:

```c++
/**
 * Tee the given file to `stdout` and to `out_path`.
 *
 * Returns an error code.
 */
error_code tee_file(path in_path, path out_path) noexcept {
    // Open the input and output files
    auto in_file = open_file(in_path, std::ios::in);
    auto out_file = open_file(out_path, std::ios::out);
    // Copy the file to the output file
    copy_stream(in_file, out_file);
    // Copy the file to stdout
    in_file.seekg(0);
    copy_stream(in_file, std::cout);
    // No error
    return error_code{};
}
```

Looks alright, *except* we are a `noexcept` function. We know that `open_file`
and `copy_stream` might throw, so we need to handle these cases.

> You may ask, "Why mark this `noexcept`, rather than let exceptions keep
> going?"
>
> That's a valid option *in many cases*. But pretend that our caller doesn't
> want exceptions, or mentally replace `tee_file` with a `main()` function that
> needs to handle possible exceptions, or maybe we want to re-`throw` the
> exceptions with additional information about what step in the tee-ing process
> went wrong.
>
> One of the best reasons to use exceptions is to let errors propagate upwards
> to whoever cares while we code against the "happy path." **But**: *Someone,*
> *somewhere,* needs to actually catch the exceptions. For the purpose of this
> post, assume that we are that "someone."

We'll need to catch those exceptions and convert them to a `std::error_code`:

```c++
/**
 * Tee the given file to `stdout` and to `out_path`.
 *
 * Returns an error code.
 */
error_code tee_file(path in_path, path out_path) noexcept {
    try {
        // Open the input and output files
        auto in_file = open_file(in_path, std::ios::in);
        auto out_file = open_file(out_path, std::ios::out);
        // Copy the file to the output file
        copy_stream(in_file, out_file);
        // Copy the file to stdout
        in_file.seekg(0);
        copy_stream(in_file, std::cout);
        // No error
        return error_code{};
    } catch (system_error e) {
        return e.code();
    } catch (runtime_error e) {
        return make_error_code(io_errc::stream);
    }
}
```

Great!

That's the end of this blog post. Hope to see you next time.

Support me on Patreon.

Buy my merch.

# Okay, There's Room for Improvement...

The above example is very primitive. Perhaps our caller is fine with having
only a single `std::error_code` to work with, but maybe not. I know *I*
wouldn't be. Imaging if we were communicating directlyy with the user, and all
we'd be able to say to them was "*No such file or directory*" with no
additional information or context.

We need to be able to return more information about errors that we might
encounter. Let's add some simple helper types:

```c++
/**
 * The phases in which we might have failed to tee the data.
 */
enum class fail_phase {
    open_input,
    open_output,
    copy_to_stdout,
    copy_to_output,
    none,
};

/**
 * Failure information
 */
struct tee_failure {
    // When we failed:
    fail_phase phase = fail_phase::none;
    // How we failed:
    std::error_code ec;
};
```

Nice. Now we need to return that from our `tee_file` function. Unfortunately,
to implement this properly with exceptions requires that we first summit the
`try/catch` mountain:

```c++
tee_failure tee_file(path in_path, path out_path) noexcept {
    try {
        // Open the input and output files
        auto in_file = open_file(in_path, std::ios::in);
        try {
            auto out_file = open_file(out_path, std::ios::out);
            try {
                // Copy the file to the output file
                copy_stream(in_file, out_file);
            } catch (system_error e) {
                return tee_failure{fail_phase::copy_to_file, e.code()};
            } catch (runtime_error) {
                return tee_failure{fail_phase::copy_to_file, make_error_code(io_errc::stream)};
            }
        } catch (system_error e) {
            return tee_failure{fail_phase::open_output, e.code()};
        }
        try {
            // Copy the file to stdout
            in_file.seekg(0);
            copy_stream(in_file, std::cout);
        } catch (system_error e) {
            return tee_failure{fail_phase::copy_to_stdout, e.code()};
        } catch (runtime_error) {
            return tee_failure{fail_phase::copy_to_stdout, make_error_code(io_errc::stream)};
        }
    } catch (system_error e) {
        return tee_failure{fail_phase::open_input, e.code()};
    }
    // No error
    return error_code{};
}
```

oh

oh no

Say hello to *The `try/catch` Mountain*. It emerges when we want to handle
exceptions differently while maintaining the same variable scopes. We need to
open the new `try/catch` pair for the output file *within* the `try/catch` pair
for the input file, because we need both of the file stream objects be in scope
*at the same *time*.

> *But Vector! We don't need that level of granularity when dealing with
> errors!*

To which I respond with a question:

> Have you ever had a bug report with a screenshot of a dialog box that says
> "Error: Permission denied." With *no other context?*

Even if not for our users' sake, consider the following issues with the
`try/catch` mountain:

- Error handling is in *reverse order* of the main logic. Handling for the
  input stream is pushed to the bottom of the function, as far away from the
  actual exception-`throw`ing code as possible.
- We're indenting a bunch of code for no reason other than to satisfy having
  three separate error handling blocks with proper scoping.
- You must wade through all of the `catch` blocks to get to the code executed
  *after* all the exception handling.
- If code within an inner `catch` block `throw`s an exception (either
  explicitly or implicitly), it could be caught by an outer `catch` block
  accidentally and produce bogus error information. Inner `catch` blocks *must
  not* `throw` exceptions of any type handled by the enclosing `try/catch`
  pairs (unintentionally).

# A Tale of Two Stacks

We all know about the call stack. But within a single function there are at
least two other stacks of particular interest to the `try/catch` mountain.

C++ functions have an implicit stack of *object lifetimes*. Every object is
guaranteed to be destroyed in reverse order of construction within two `{}`
braces (A *block scope*). If variable `a` is visible during the declaration
of `b`, then `a` is guaranteed to be visible *at least* as long as `b` is
visible.

C++ functions also have an *explicit* stack of *exception handlers*. The `{`
brace after a `try` create a new exception handling stack "element," which
defines new exception handlers for the code within the `try` block. The
exception handlers are "popped" from this stack when the `}` brace after a
`try` is reached.

The trouble is this: C++ chose for the braces `{}` of a `try` block to also
correspond *directly* to the block scoping for local variable names and
object lifetimes.

Of course this is an intuitive first decision, but it has proven... troublesome.

# The "Workaround"

Here's a common workaround to the scoping issues by using `std::optional`:

```c++
optional<string> read_file(path p) {
    optional<ifstream> file;
    try {
        file = open_file(p, std::ios::in);
    } catch (system_error) {
        return nullopt;
    }
    try {
        // Read from the file
        return read_ifstream(*file);
    } catch (runtime_error) {
        return nullopt;
    }
}
```

Before `std::optional` was available, you could use `boost::optional`. In the
case of neither, you might use `std::unique_ptr` to extend the lifetime, but it
required a heap allocation. Ouch.

The above code might not look too bad, but imagine that we had *many* objects
to initialize that might throw. We'll have dozens of `try/catch` pairs that
just initialize an `optional`. Furthermore, the type of `file` does not
accurately represent its purpose: If we successfully pass through the
`try/catch` pair, it is not `optional` at all.

# Finding Inspiration

What we really need is a way to manipulate the "exception handler stack"
distinct from the block scope ("lifetime stack").

This post (and the enclosed informal proposal) were inspired after looking at
some of Python.

Much like C++, Python has an "exception handling stack" via `try/except` pairs,
but it also supports this additional syntax:

```python
def read_file(path: Path) -> Optional[bytes]:
    try:
        fd = path.open('rb')
    except IOError:
        return None
    except OSError:
        return None
    else:
        return fd.read()
```

The above syntax, for those who are unfamiliar, defines the exception
handler for `IOError` and `OSError` to apply *only* to the content of the
preceding `try` block, and the `else` block will only execute *if no exception
was raised* (ie, no `except` block was entered). There are no exception
handlers in scope for the `else` block. Execution after an `else` block will
continue off the block to the remainder of the function (Unless the `else`
block `return`s or `raise`s, as in the example above).

> Note: The above example isn't really a good use case for `try/except/else`.
> It is meant to be illustrative of the syntax, not a recommendation of when to
> use `try/except/else`.

One of the major differences, though, between Python and C++, and the reason
Python does not suffer from a `try/except` mountain, is that local variables in
Python are *function scoped*, not *block scoped*. This means that the `fd`
variable in the above example is actually visible after execution leaves the
`try/except/else` block. In fact, the `else` block in the example *isn't even
necessary* since the `except` blocks `return` from the function. The purpose of
`else` in `try/except/else` is to conditionally execute some code in the case
of lack-of-exceptions, not to preserve any scoping rules.

So, if Python's scoping is so different from C++, why did `try/except/else`
draw my attention?

Python is probably the most notable language to support this exception handling
construct, but it is otherwise pretty rare. Most languages with exceptions
support `try/catch` pairs (and often a `finally` block), but Python was my
first encounter with a block that is reserved for *exactly* the purpose of the
non-exception case.

People say that C++ gobbles up language features from every other programming
language. How about we take this one? We'll give it a bit of a polish, though...

And we can't use `else`.

# A New Language Feature: `try`, `catch`, and... `continue`?

If C++ were to add support a `try/catch/else` with the same syntax as Python,
the following *valid* code would become ambiguous:

```c++
if (condition)
    try {
        // Do thing
    } catch (...) {
        // Do thing
    }
else {
    // Ouch
}
```

Does the `else` bind to the previous `if`? Or to the `try/catch`? Best to avoid
`else`, then.

Talking around in the Slack, there were additional concerns that the `else`
keyword didn't quite convey its purpose. After throwing around some ideas, like
forcing `else do` and `else try` (neither of which fix the parse issue), or
using `try/catch/register` (`register` is free. We've gotta do *something* with
it), the best option looked to be re-using the `continue` keyword: `continue`
in the context of a loop will be followed immediately by a semicolon `;`, so we
just need to be distinct. `continue {` is not a valid token sequence in C++.

Python uses function scoping, so it doesn't have any special rules about name
visibility in the `else` block. Since C++ uses block scoping, and we want to
fix our scoping woes, we'll need to give `continue {}` some special rules.

Say hello to `try/catch/continue`:

```c++
optional<string> read_file(path p) {
    try {
        auto file = open_file(p, std::ios::in);
    } catch (system_error) {
        return nullopt;
    } continue {
        try {
            // Read from the file
            return read_ifstream(file);
        } catch (runtime_error) {
            return nullopt;
        }
    }
}
```

The `continue {}` block must appear after one or more `catch {}` blocks for
the preceding `try{}`. In addition, the `continue {}` block *inherits the
block scope of the preceding `try {}` block*. This may seem unintuitive, but
remember my favorite adage:

> *Don't confuse familiarity with simplicity*.

You may see some improvement, but it's marginal:

- We've converted `file` from an `optional<ifstream>` to a regular `fstream`,
  better reflecting its purpose. Cool.
- We have moved the exception handling for the `open_file()` call to appear
  immediately after where the `open_file()` call appears. Nice.

But we still have some nested `try/catch`. Let's convert our `tee_file()`
function:

```c++
tee_failure tee_file(path in_path, path out_path) noexcept {
    try {
        // Open the input and output files
        auto in_file = open_file(in_path, std::ios::in);
    } catch (system_error e) {
        return tee_failure{fail_phase::open_input, e.code()};
    } continue {
        try {
            auto out_file = open_file(out_path, std::ios::out);
        } catch (system_error e) {
            return tee_failure{fail_phase::open_output, e.code()};
        } continue {
            try {
                // Copy the file to the output file
                copy_stream(in_file, out_file);
            } catch (system_error e) {
                return tee_failure{fail_phase::copy_to_file, e.code()};
            } catch (runtime_error) {
                return tee_failure{fail_phase::copy_to_file, make_error_code(io_errc::stream)};
            }
        }
        try {
            // Copy the file to stdout
            in_file.seekg(0);
            copy_stream(in_file, std::cout);
        } catch (system_error e) {
            return tee_failure{fail_phase::copy_to_stdout, e.code()};
        } catch (runtime_error) {
            return tee_failure{fail_phase::copy_to_stdout, make_error_code(io_errc::stream)};
        }
    }
    // No error
    return error_code{};
}
```

Okay, so we've just turned our mountain *upside-down*. I mean, I feel that its
already an improvement:

- Exception handling is close to the exception-generating code
- The `catch` blocks are free to `throw` exceptions without worrying about any
  enclosing handlers unintentionally catching it.

But... *we need to go deeper*.

Another syntax: `continue try {}`. What does it do? Well, if `continue {}`
"pops" the exception-handler "stack" without replacing block scope, then
`continue try {}` *replaces* the top of the exception handler stack without
replacing block scope. Here's the small example with `read_file()`:

```c++
optional<string> read_file(path p) {
    try {
        auto file = open_file(p, std::ios::in);
    } catch (system_error) {
        return nullopt;
    }
    // Read from the file
    continue try {
        return read_ifstream(file);
    } catch (runtime_error) {
        return nullopt;
    }
}
```

We can follow `continue try {}` with more `catch {}` blocks, where the
immediately following `catch {}` blocks apply to the preceding
`continue try {}` block.

[But wait, there's more!](https://www.youtube.com/watch?v=SFmM5CWnmtE)*

We can append *more* `continue [try] {}` blocks!

Finally, let's fulfil the title of this post, and level that mountain:

```c++
tee_failure tee_file(path in_path, path out_path) noexcept {
    try {
        // Open the input file
        auto in_file = open_file(in_path, std::ios::in);
    } catch (system_error e) {
        return tee_failure{fail_phase::open_input, e.code()};
    }
    continue {
        try {
            // Open the output file
            auto out_file = open_file(out_path, std::ios::out);
        } catch (system_error e) {
            return tee_failure{fail_phase::open_output, e.code()};
        }
        continue try {
            // Copy the file to the output file
            copy_stream(in_file, out_file);
        } catch (system_error e) {
            return tee_failure{fail_phase::copy_to_file, e.code()};
        } catch (runtime_error) {
            return tee_failure{fail_phase::copy_to_file, make_error_code(io_errc::stream)};
        }
        try {  /// [NOTE NOTE NOTE: See below]
            // Copy the file to stdout
            in_file.seekg(0);
            copy_stream(in_file, std::cout);
        } catch (system_error e) {
            return tee_failure{fail_phase::copy_to_stdout, e.code()};
        } catch (runtime_error) {
            return tee_failure{fail_phase::copy_to_stdout, make_error_code(io_errc::stream)};
        }
        // No error
        return error_code{};
    }
}
```

And there it is. We have lowered the mountain of `try/catch` to a sequence of
`try/catch/continue` blocks with a slight hill.

Each `continue try {}` block establishes a new set of exception handlers while
maintaining the scope of the prior `[continue] try {}`. Object lifetimes end at
the `}` of the final `continue [try] {}` block, and that brings us to...

# The Biggest Downside

For as long as C++ has existed, we've been able to know *without a doubt* that
the lifetime of an object ends at the closing `}` brace for the block in which
the object is declared. With `try/catch/continue`, we'd be giving up on that
guarantee when we see a `} catch`. One will have to look for a
`continue [try] {` to check.

Take a look at the `NOTE NOTE NOTE` comment in the above sample. You will see
that we do not use a `continue try` but a regular `try`. All previous snippets
have had the lifetime of `out_file` end before we write to stdout, ensuring
that we flush and close the file as soon as we are done with it. If we change
`try` to `continue try`, the lifetime of the `out_file` object will silently
extend even though we don't make use of it in any later blocks.

An earlier draft of this post had `out_file` live during the copy std stdout,
and I was able to get a straight-sequence of `continue try` blocks without
having to indent two levels. In refactoring to close `out_file` as soon as
possible, I found that I had trouble exactly defining how to format and
structure the code. It would seem that `continue try` makes lifetimes more
complicated? Maybe... Or perhaps the lifetime issues are just intrinsic to this
`tee` program and I face them whether I use `continue try` or a `try/catch`
mountain. I can get the same desired effect with a slight refactoring to call
`close()` explicitly:

```c++
tee_failure tee_file(path in_path, path out_path) noexcept {
    try {
        // Open the input file
        auto in_file = open_file(in_path, std::ios::in);
    } catch (system_error e) {
        return tee_failure{fail_phase::open_input, e.code()};
    }
    continue try {
        // Open the output file
        auto out_file = open_file(out_path, std::ios::out);
    } catch (system_error e) {
        return tee_failure{fail_phase::open_output, e.code()};
    }
    // Copy the file to the output file
    continue try {
        copy_stream(in_file, out_file);
    } catch (system_error e) {
        return tee_failure{fail_phase::copy_to_file, e.code()};
    } catch (runtime_error) {
        return tee_failure{fail_phase::copy_to_file, make_error_code(io_errc::stream)};
    }
    // Close the file explicitly
    continue try { out_file.close(); }
    catch (...) { /* Ignore failure to close */ }
    // Copy the file to stdout
    continue try {
        in_file.seekg(0);
        copy_stream(in_file, std::cout);
    } catch (system_error e) {
        return tee_failure{fail_phase::copy_to_stdout, e.code()};
    } catch (runtime_error) {
        return tee_failure{fail_phase::copy_to_stdout, make_error_code(io_errc::stream)};
    }
    // No error
    continue {
        return error_code{};
    }
}
```

We even get to flatten our hill the rest of the way.

All this trouble, and would it be worth it? I think so. But maybe you don't
agree? Tell me what you think, and I might make a more formal proposal.

---

\* In what percentage of my blog posts do you think I use this video?
