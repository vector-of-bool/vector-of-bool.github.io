---
layout: post
title: C++ Modules Might Be Dead-on-Arrival
comments: true
desc: In which I discuss a modules problem that is being ignored
---

C++ modules are slated to be the biggest change in C++ since its inception.
The design of modules has several essential goals in mind:

1. **Top-down isolation** - The "importer" of a module cannot affect the content
   of the module being imported. The state of the compiler (preprocessor) in the
   importing source has no bearing on the processing of the imported code.
2. **Bottom-up isolation** - The content of a module does not affect the state
   of the preprocessor in the importing code.
3. **Lateral isolation** - If two modules are imported by the same file, there
   is no "cross-talk" between them. The ordering of the import statements is
   insignificant.
4. **Physical encapsulation** - Only entities which are explicitly declared as
   exported by a module will be visible to consumers. Non-exported entities
   within a module will not affect name lookup in other modules (barring some
   possible strangeness with ADL. Long story...)
5. **Modular interfaces** - The current module design enforces that for any
   given module, the entire public interface of that module is declared in a
   single TU called the "module-interface unit" (MIU). The implementation of
   subsets of the module interface may be defined in different TUs called
   "partitions."

If you've been hoping for modules for as long as many have, you'll note that
"compilation speed" is missing from this list. Nevertheless, this is one of the
biggest promises of modules. The possible speedup from modules is merely a
consequence of the above design aspects.

This author can identify several aspects of C++ compilation that can greatly
benefit from the design of modules. In order of most-to-least-obvious:

1. **Tokenization caching** - Because of TU isolation, tokenizing a TU can be
   cached when the module is later imported into another TU.
2. **Parse-tree caching** - Same as above. Tokenization and parsing are some of
   the most expensive operations in compiling C++. In my own tests, parsing can
   consume up to 30% of compilation time for files with a large preprocessed
   output.
3. **Lazy re-generation** - If `foo` imports `bar`, and we later make changes to
   the *implementation* of `bar`, we may be able to omit recompilation of `foo`.
   Only changes to *the interface* of `bar` necessitate recompilation of `foo`.
4. **Template specialization memoization** - This one is a bit more subtle and
   may take more work to implement, but the potential speedups are *enormous*.
   In short: A specialization of a class or function template appearing in the
   module interface unit can be cached and loaded from disk later.
5. **Inline function codegen caching** - Codegen results for inline functions
   (including function templates and member functions of class templates) can
   be cached and later re-loaded by the compiler backend.
6. **Inline function codegen elision** -  `extern template` allows the compiler
   to omit performing codegen for function and class templates. This is hugely
   beneficial for the *linker* when it performs de-dup. Modules may allow the
   compiler to perform more `extern template`-style optimizations implicitly.

All in all, it's looking pretty good, yeah?

But there's something missing. A horrible, terrible, no-good, very bad flaw.


# Remember the... Fortran?

Fortran implemented a module system that bears a slight resemblance to the
design proposed for C++. A few short months ago, a paper
[p1300](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2018/p1300r0.pdf)
was written by the SG15 group for review in San Diego. As far as I can tell,
the paper was not discussed nor reviewed by any relevant eyes.

The gist of it is this:

1. We have module `foo` and module `bar`, defined by `foo.cpp` and `bar.cpp`
   respectively.
2. `bar.cpp` has an `import foo;` statement.
3. How do we make sure that `import foo` will resolve when compiling `bar.cpp`?
   The current design and implementations require there to exist what is known
   as the "binary module interface" (abbreviated as BMI) defined for `foo`. The
   BMI is a file on the filesystem that describes the exported interface of the
   module `foo`. I'll call that BMI `foo.bmi` for now. The extension isn't
   important.
4. Creation of `foo.bmi` is a byproduct of the compilation of `foo.cpp`. When
   compiling `foo.cpp`, the compiler will emit a `foo.o` and `foo.bmi`.
   As a consequence of this design, `foo.cpp` **must** be compiled *before*
   `bar.cpp`!

If alarm bells aren't ringing already, let me discuss the way we currently work
using header files:

1. We have a "module" `foo` defined by `foo.cpp` and `foo.hpp`, and a "module"
   `bar` defined by `bar.cpp` and `bar.hpp`. Easy to understand.
2. `bar.cpp` contains an `#include <foo.hpp>` preprocessor statement.
3. How do we make sure that `#include <foo.hpp>` resolves when compiling
   `bar.cpp`? It's simple: Make sure `foo.hpp` is present in a directory on the
   header search path list. We do not need to do any additional pre-processing.
4. There is no ordering requirement between the compilation of the "modules"
   `foo` and `bar`. They can be processed in parallel.

Parallelization is probably the single most important aspect of increasing
build performance. At this point, it isn't even something you think about when
you are optimizing your build because *it is already there*.

Modules change that. The importing of a module creates a "happens-before"
dependency where `#include` did not. (I discuss this ordering in my [Building
Like (a) Ninja post](2018/12/20/build-like-ninja-1.html)).

The consequences of this design were explored very recently by Rene Rivera in
[*Are modules fast?*](https://bfgroup.github.io/cpp_tooling_stats/modules/modules_perf_D1441R1.html).

Spoiler alert: No. Or, more accurately: It's subtle, but mostly *no*. The
current module implementation used in that paper is extremely primitive but is
still a valuable benchmark to understand what modules may look like
performance-wise. Expectedly, as hardware parallelism increases, headers' lead
over modules becomes more and more pronounced. There is also a relationship
between the DAG-depth (i.e. The length of the chain of modules that `import`
each other). As this depth increases, modules grow slower and slower, while
headers remain fairly constant for even "extreme" depths approaching 300).


# A Sisyphean Scanning Task

Suppose I have this source file:

```c++
import greetings;
import std.iostream;

int main() {
    std::cout << greeting::english() << '\n';
}
```

This is pretty simple. Since we import some modules, we will need to compile
`greetings` and `std.iostream` *before* we can compile this file.

So, let's do that...

...

Uh...

How?

We've been given a source file with two imports. That's it. We don't have
anything else. Where is `greetings` defined? We need to find a file that
contains a `module greetings;` statement.

This file located on the other side of the galaxy, `talk.cpp`, looks promising:

```c++
module;

#ifdef FROMBULATE
#include <hello.h>
#endif

#ifndef ABSYNTH
export module something.pie;
#endif

import std.string;

export namespace greeting {

std::string english();

}
#endif
```

It defines that `greeting::english` function that we want. But how do we know
that this is the right file? It doesn't contain a `module greetings;` line!

But it does. Sometimes. It turns out when we compile with `-DFROMBULATE`, then
the file `hello.h` is pasted into the source file. What's in there?

```c++
#ifdef __SOME_BUILTIN_MACRO__
# define MODULE_NAME greetings
#else // Legacy module name
# define MODULE_NAME salutations
#endif

export module MODULE_NAME;
```

Oh.

Oh no.

This is fine. This is fine... Don't worry. All we need to do is... *run the
preprocessor* to check if the file comes out as `module salutations` or `module
greetings`.

This is okay, but... There are 4,201 files that could define modules that can
be imported, and any one of them could be `module greetings;`

Also, we can't use our own implementation of the preprocessor: We need to run
*exactly* the preprocessor that will be compiling this code. See that
`__SOME_BUILTIN_MACRO__`? We have no clue what that is. If we don't get it
*exactly* right, the compilation will fail, or, even worse, we may *miscompile*
the file.

So what can we do? We could cache the names of all the modules after
preprocessing all the files, right? Well, where do we store that mapping? And
what happens when we want to compile with a different compiler that results in
a different mapping? What if we add new files that need to be scanned? Do we
need to search every directory that contains these thousands of source files
every time we build, just to check if any modules were added, removed, or
renamed? On systems where process startup and/or filesystem access is not cheap,
these costs will add up.


# Possible Solutions

These two problems are distinct but related in that I (and many others) believe
that one change to the modules design will fix them both: **Module interface
unit locations must be deterministic**.

There are two alternative ideas to enforce this:

1. Force MIU filenames to derive from the module's name. This mimics the design
   of header filenames being directly related to how they are found from an
   `#include` directive.
2. Provide a "manifest" or "mapping" file that describes the filepath to an
   MIU based on the module name. This file will need to be user-provided, or we
   are back in the scanning problem.

With MIU lookup deterministic and easily defined, we can then go to the next
essential step: The BMI of a module must be lazily generated.

The compilation ordering between TUs will kill module adoption dead in its
tracks. Even relatively shallow DAG depths are much slower than the equivalent
with header files. The only answer is that TU compilation *must* be
parallelizable, even in the face of importing other TUs.

In this respect, C++ would be best to mimic Python's `import` implementation:
When a new `import` statement is encountered, Python will first find a source
file corresponding to that module, and then look for a pre-compiled version in
a deterministic fashion. If the pre-compiled version already exists and is
up-to-date, it will be used. If no pre-compiled version exists, the source file
will be compiled and the resulting bytecode will be written to disk. The
bytecode is then loaded. If two interpreter instances encounter the same
un-compiled source file at the same time, they will race to write the bytecode.
The race doesn't matter, though: They will both come to the same conclusion and
write the same file to disk.

In order to facilitate parallel compilation of TUs in the DAG, C++ modules must
be implemented in the same way. Ahead-of-time BMI compilation is a non-starter.
Instead, a compiler should lazily generate the BMI when it first encounters an
`import` statement for the module in question. The build system should not
concern itself with BMIs at all.

All of this can only work if the location of an MIU is deterministic for the
compiler.


# I Have Little Hope

There was a recent upset on the Twitter-verse. The Pre-Kona mailing was posted
on January 25th. Amongst the many papers posted you will find
[p1427, *Concerns about module toolability*](http://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1427r0.pdf).
Amongst its authors and contributors are names of build system and tooling
engineers from around the industry. Am I appealing to authority here?
Yes I am, but I feel that these are some of the most qualified people to
provide feedback on module toolability.

This paper was born from the concerns of many tool authors and collaborators
(more than what is named on the paper itself) who have felt that their concerns
about modules have been ignored for months and years.

People outside of SG15 have been keen to [shoot down
discussion](http://www.open-std.org/pipermail/tooling/2019-January/000269.html)
on the issues with module toolability, claiming that SG15 does not have the
necessary implementation experience to make useful statements regarding modules.

SG15 has only had face-to-face meetings. The last meeting, in San Diego, was
useless as the chair was absent and people were too busy getting caught up
since the prior meetings to have any useful discussions. With no SG15 meetings
outside of those at the official WG21 convenings, the members thereof have
difficulty staying up-to-date and collaborating on work. In addition, many
times that SG15 has attempted to raise issues they have been shot down as their
work is considered "out-of-scope" for the C++ language.

A Tweet about the pre-Kona mailings spawned discussion of C++ modules and p1427.
[Questions were raised about who to
trust](https://twitter.com/horenmar_ctu/status/1089542882783084549) regarding
module toolability.

This discussion culminated in an eventual call for SG15 to
["STFU"](https://twitter.com/rodgertq/status/1089580076729982976?s=19) unless
they can provide code samples that prove the problems they outline. This is a
request for code that cannot be implemented in any current compiler and cannot
be implemented in any current build system. Even if these were to exist, the
request is for proving a negative: A task which cannot be done empirically. As
such, this request for code is a goal that cannot be met.

The issues were not discussed. The issues were not disproven. No one even
mentioned the problems outlined in p1427. We are told to simply
[trust some big names](https://twitter.com/jfbastien/status/1089536692288024576)
to know better than we do (an appeal to authority).

People backing the current modules design have not proven that modules work at
scale, yet also demand proof from SG15 that they *do not* work at scale.
Existing "modules" deployments do not use the current design, and do not use
the automated module scanning that would be required for use with real build
systems in the wild.

If modules are merged and it turns out that they cannot be implemented in a
well-performing and flexible fashion, people will not use modules. If a broken
modules proposal is merged into C++, it may be irrecoverable and C++ will never
see the promises of modules realized.

Is it possible for the current modules proposal to be implemented successfully?
I can't answer with a definitive "no", but me and many others feel that there
are significant issues that need to be addressed.

But, judging by the behavior of others, it may seem that it doesn't matter what
SG15 thinks: They are being shot down at every turn by people with very little
experience in C++ tooling, and the SG15 chair is completely absent through this
entire discussion. Anything SG15 does is declared "unsubstantiated" and
"out-of-scope."

I was afraid to call out this behavior: I'm not keen on interpersonal conflict.
Nevertheless, I'm more afraid that C++ will end up with a permanently useless
modules design.
