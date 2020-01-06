---
layout: post
title: A New Decade
desc: In which I present a new tool that I hope will be useful
---

# Looking at the Past

## A Decade of Changes

The past ten years have seen many changes for myself personally. My first
experiences with programming were around the mid-00's, primarily with Python.
I'd used a bit of C++, but found it very difficult and cumbersome, so I had
mostly avoided it.

Everything changed when ~~the Fire Nation attacked~~ I discovered the
``-std=c++0x`` flag to GCC.

My first real explorations with the language were using a GCC 4.x release with
`-std=c++0x`, and it was bumpy yet invigorating (I recall apologetic error
messages from GCC informing me that certain features weren't ready, such as
when I tried to use non-static in-class data-member initializers). I hadn't any
idea about the standardization process, or language versions. I didn't know the
long history behind C++0x and TR1, but I knew that this was a huge change to
this old beast. I read over Bjarne's [*C++11 F
AQ*](http://www.stroustrup.com/C++11FAQ.html) (back then known as the *C++0x
FAQ*, of course) multiple times and kept it bookmarked as a reference.

Despite the rough introduction, I was enamored with this wacky language despite
its many warts. C++11 is the first version of this language that I *really*
learned and used. (I am also spoiled for not having worked years with C++03 and
"C with classes" codebases.)

Over the years, I've watched the language, library, and *community* grow and
change to what it has become today. We've learned hundreds of lessons. We've
found good ideas, we've found bad ideas, and we've found out that some
*presumed good* ideas were actually *bad* ideas. We've even found ideas that
are *so good* that they make *previously good* ideas look silly by comparison.

In the past few months, I've been winding up again to continue my involvement
in the open source community. With CMake Tools no longer taking up my main
focus, I needed to find a new passion project. CMake Tools started primarily as
a personal project, just to give me the functionality that *I* wanted to have
in VSCode, and it eventually grew much greater. I wanted a new project that
would be built for the entire community, not just the small segment that used
CMake and Visual Studio Code. I wanted something that *almost everyone* would
find useful.

I poked around with a few ideas, mostly trying to create useful libraries, but
I always seemed to hit a wall. The same wall that I know hundreds (or maybe
thousands) of other library developers hit frequently.

Not only library developers are affected, of course: There is a corresponding
issue faced by library *consumers*.

In between the library developers and the library consumers we find the
packagers and distributors, and they face issues of their own.

All three groups have their own subset of issues, and they are all closely
related, but no tool that I could find tried to address all three of them in a
single swift blow.


# Identifying the Problem

The changes in the C++ language and standard library over the past decade have
been impressive. The changes in the *non-standard* library ecosystem have
been... mediocre.

That's not to say they have been *absent*: We now have tools like Conan, vcpkg,
and Hunter to distribute and re-use code. We have Meson, **modern** CMake,
build2, and Ninja to build our code. In isolated pairings, these tools all
create a fairly solid ecosystem. However: reception to these tools has been
lukewarm, and trying to cross the boundaries between these tools presents a
challenge.

In late September (2019), I became frustrated when I hit another wall when I
was trying to create a library. I tweeted:

> There have been many times I've written a small C++ library, gotten something
> fairly useful, and then I realize:
>
> The overhead of distributing and using this library is so enormous that no
> one will ever use it. This was a complete waste of time.
>
> We have a serious problem.

This was a bit of a vague-post (one of my social media pet-peeves, sorry), but
I intended to post a better write-up eventually, and this is that posting.

I posted a follow-up thread with the following details, which I'll just
copy-paste mostly unchanged:

**--- Begin paste**

I made (what I consider) a decent abstraction around `epoll`, but the utility
you would gain from it is dwarfed by the hassle involved in obtaining and
incorporating the library into another project.

If it were as simple as "declare intent to use in a single file" and then "just
use it." It would be absolutely worth incorporating it.

Unfortunately, we aren't there. We have a dozen more questions to answer:

1. Where is the source located?
2. How do I download the source?
3. Do I need to install a pre-built binary?
   1.  What about ABI considerations?
   2.  What if I'm cross-compiling?
   3.  Even then, how do I resolve `#include` directives?
4. Do I need to be a privileged user to install?
5. After installing, how do I export it to my library?
6. If building from source, what other dependencies do I need to obtain first?
   1.  (For each dependency, recurse on this list.)
7. Will I be able to install multiple versions of individual libraries on the
   same host?
8. Do any of the transitive dependencies require that I perform some wacky
   out-of-band step?
9.  In some cases: How do I omit platform-specific dependencies?

And my favorite of all: **Now that I've added a dependency, I've thrown an
additional tree of dependencies at my downstream users, and each additional
dependency causes the headaches to grow exponentially. Do I want to force that
inconvenience upon my users?**

Solving these questions is such an arduous task that often the easiest solution
is "Don't even try" unless the library in question is of high enough utility to
jump through these hoops. Think: Boost, Qt, JUCE, json, fmtlib, etc. (Note that
3/5 of these are MASSIVE library *collections*).

**--- End paste**


## A Coincidence

While drafting this post, there was a text-post to `/r/cpp` on Reddit entitled
[*Writing c++ is wonderful, compiling and linking it is horrible and glib*](https://www.reddit.com/r/cpp/comments/egrzd0/writing_c_is_wonderful_compiling_and_linking_it/). While the original author
has deleted the body of their post, I can summarize that it was more-or-less a
rehashing of the title itself, with some explanatory examples. The post
received 400pts, with a 97% positive vote: That's incredible, and places it as
one of the most popular posts in `/r/cpp` for *the entire year!*

While reading it, I couldn't help but laugh in a sense of sharing their pain
and despair. Reading the comments is a similar experience. It seems that the
pain points I've presented are widespread, and seeing the effects renewed my
desire to to try and improve the situation.

A while later, another discussion occurred [in the comments on another post to
`/r/cpp`](https://www.reddit.com/r/cpp/comments/ei0zut/c_at_the_end_of_2019/),
and the topic of the build ecosystem reared its head once again. This again
boosted my resolve to fight to improve our ecosystem.

I'm not sure to the expertise of either the former post's author's knowledge of
tooling, nor to the expertise of individual commenters, but I'm certain that
most of them are not primarily tooling developers. It doesn't take a strong
background in the build and integration tooling ecosystem to understand just
how *pitiful* our situation is.


# Disillusion and Frustration

In addition to seeing the above issues, I'm growing tired of software which
insists on presenting their own unique approach to the build/install/
integration process. Such projects will often insist that their problems are
"unique" and warrant the special processes, when (more often than not) there is
a profound and prolific misunderstanding of the tools and a lack of
comprehension of how the (mis)use thereof has a monumental impact on the
usability and quality of their software.

If your project is a library, your build/install/integration process is the
very first API that potential users will have to face: Not your C and C++ types
or functions, and not even the headers: Simply getting ahold of the library is
the first major hurdle presented to new users.

Beyond libraries, the build and test process of a project is the first piece of
code that potential contributors will need to grapple with before they can
submit "useful" code. Whether it is an open source project or a proprietary
platform developed behind closed doors, on-boarding new developers requires
that they get a lesson in the process. As mentioned, these processes are often
needlessly complicated by a misunderstanding of how to use the tools.

<div class="note aside" markdown="1">
Special cases *do exist*, but it is more likely than not that *yours is not one
of them*. Even in the case that you *do* have a special case, this does not
necessitate a complete disregard for convention and best-practices.
</div>

If you have qualms with me saying that "most projects are not special," it is
very likely that *your* project is not special. People that have special
requirements will be able to clearly *know* that their project is special and
could enumerate off-hand their special requirements, and I would bet they have
spent a huge amount of mental resources exhausting the available (yet
unsuitable) options.

With these premises, I will make a bold claim:

It is largely the fault of **false** "special cases" that hold back the build,
integration, and distribution tooling ecosystem. Rather than sitting down and
committing to change the process to be portable and reliable, it will be kept
teetering on the edge of "just working" as long as it can *usually* get a green
light on the CI server (even if it takes a few re-runs).

With the number of special cases that must be handled, our tools continue to
bend over backwards to sate the needs of as many projects as possible. The
result is tools that are built without any "happy path," and oftentimes they
have a pile of tacked-on ad-hoc half-features. They become convoluted, hard to
change, difficult to use, and intractable at even small scales.

Because of the difficulty found in using our existing tools and no clear "happy
path", we find that developers do the *bare minimum* to get their
infrastructure working, and then get out as fast as possible, especially for
beginners or developers who are used to the substantially more uniform tooling
found in other languages' ecosystems. There is a resistance to change the
infrastructure and processes because the infrastructure itself is unwieldy and
ambiguous. With the many special cases, there's often "more than one way" to do
a task, and most of them will be subtly broken in one way or another. Even
worse is the eventual reliance on the mentioned "half-features," cementing the
tool maintainers' requirement to support them for the foreseeable future.

The result of poor usage of existing tools is *more* projects with *more*
special cases, and we have a feedback loop of special cases creating
special-cased tools that cause people to write more special cases.

We've done much to make it as easy as possible for people to discover the
"right" way to do things, and I believe that it should continue. We *should*
continue to teach modern CMake design, and we *should* continue to develop
tools like Meson, Conan, and vcpkg, and we *should* continue to coax potential
Autotools users away from a path of suffering.

I believe that we should also try to break the cycle of special-cases by
offering a path outside of the loop, rather than simply trying to divert it.


## Aside: The Build Quality Reflects Software Quality

I consider the ease of the integration process to often be a reflection of the
overall quality of the software as a whole. If your build process requires
manually installing a dozen different libraries, requires that I install MSYS
to build with MSVC, requires the installation of an additional programming
language interpreter, or silently turns features on/off based on ambient
mutable system state, then I have very low expectations for when I actually get
your `#include` directives to resolve.

Unfortunately, I find that these expectations are often correct, and sometimes
*too high*.

This isn't to say that an improved build process will automatically improve the
actual code API, or that a good code API will always have a good build process.
Instead, I would propose that it is more likely that there is a common third
factor at play: Discipline and rigor.

A good build, install, and usage process is not impossible. It is often more
complex than necessary, but it is within reach, and many of the problems
thereof have been solved for years. A build and usage process that *just
barely* works because it was thrown together until "it works on my machine"
does not lend me faith that the remainder of the software will be built with
much more care and attention.


### Rigorous Quality

The 2010's has seen what I consider to be a gross negligence in consumer
software. Please understand that I am **not** commenting on the state of
highly-regulated software development that you will find in the aerospace and
medicine; I myself do not work in such fields, but I believe there is much to
learn by understanding the discipline that goes into much of the work in those
areas.

I believe that consumer software development could be greatly improved by an
application of rigor and thorough and thoughtful consideration when a system is
designed.

This is not simply being rigorous in preventing crashes and bugs, but also
being rigorous in *helping* the user, whether it be an API, CLI, or GUI.
Software should be designed so that it is difficult to do the incorrect thing,
if not *downright impossible*. There should be *even a slight* amount of rigor
in considering the finite resources that our users have: RAM, ops/s, disk space,
network bandwidth, and -- most importantly -- *their time*.

If a user wants to perform a destructive action, it should require
confirmation. Any other action should retain the user's data, or at least a
clear path to recover it.

If a user makes a mistake, they should be told clearly and concisely the nature
of their mistake, and explained the correct option and/or *why* their attempt
failed.

For your consideration, my favorite four lines from *The Zen of Python*:

> Errors should never pass silently.
>
> Unless explicitly silenced.
>
> In the face of ambiguity, refuse the temptation to guess.
>
> There should be one-- and preferably only one --obvious way to do it.

In the remainder of the post, I won't be addressing *all* aspects of "rigorous
design" that I've mentioned, but I'll address a few that I consider to be
particularly relevant to the problem of project build, test, and package
management, especially with respect to native libraries.

Perhaps I'm playing this up quite a bit, but I'm truly hoping to set a basis
for the C and C++ library ecosystem to grow from its current tangled mess. The
poor ecosystem makes collaboration and cooperation incredibly difficult. It's
the reason we're seeing libraries proposed for standardization that raise loud
and voracious objections from the community.

**When people find it easier to propose a new standard library through the
red-tape of the ISO process than to simply write and distribute one themselves,
we're in a bad place.**

This would be a lofty goal to complete for the new year, but I don't think it
too much to ask of a new *decade*. It will require cooperation, collaboration,
feedback, self-reflection, and ambition.


# A New Decade; A New Approach; A New Tool

> (If you are tempted to say that "The next decade doesn't start until 2021,"
> then I should remind you that we are computer programmers: We start counting
> at zero.)

Over the past few months, I've spent a lot of my time working on a new tool
that addresses many of the pain points of C++ library distribution and
integration in a somewhat novel manner. The solutions presented therein are my
own preferred solutions, and I hope them to be useful to the community at large.

I also put a large focus on *libraries*. Although it does work for some
application development, I believe that setting a strong foundation for library
work should be the basis for ecosystem advancements. In building this tool I've
written several libraries, splitting them out of the main codebase whenever I
felt it appropriate. From the very beginning I've been dogfooding the
development. If I can't at least use my own tool, why should I ever expect
anyone else to use it? Getting it in a usable state was my very first priority.

First, I will clarify that this **is not** a solution for *all* existing
libraries, and not even a *drop-in* solution for a *majority* of existing
libraries.

However, I will claim the following:

- This solution *is* a potential drop-in solution for a growing number of
  modern libraries that play by a certain set of conventions and rules.
- This solution *can be* a solution for many libraries provided that they make
  a few minimally invasive changes to the structure of the library's source.
- Creating a new library based on this solution *is* zero-friction.
- Build systems *can* be made capable of consuming builds generated by this
  solution without expressly acknowledging that the tool even exists.
- Package managers and maintainers *will* be able to produce builds of
  libraries based on this solution with little required effort.
- This solution *is* beginner friendly.
- This solution *is also* expert friendly.
- To the best of my ability, this solution is **maximally discoverable**.

This post will present my new solution, which comes in the form of an
executable tool and a few simple file formats.

A simple motto was kept in mind while building this solution:

> Simple things should be *simple*, and complex things should be *possible*.


## Preface: Creating a Dependency Manager ➔ Build System Bridge

Before we can look at the actual tool I've made, I need to explain an essential
piece of the puzzle that I've had on the back-burner for over a year.

The *fundamental theorem of software engineering* states:

> We can solve any problem by introducing an extra level of indirection.

In late 2018 (before burnout and eventual hiatus) I created a behind-the-scenes
project known as *libman*. I didn't make a big deal out of it, as its primary
audience was build system and packaging system developers rather than average
users.

In short: It's a very small specification of a plain-text file format that
tells a *build system* how to consume a prepared library.

> For many more details that are not immediately relevant, see [the GitHub
> repository](https://github.com/vector-of-bool/libman) and/or [the rendered
> specification document](https://api.csswg.org/bikeshed/?force=1&url=https://raw.githubusercontent.com/vector-of-bool/libman/develop/data/spec.bs).

I consulted with several build system and package manager developers in what
they would like to see for the specifics, but there are a few over-arching
things to understand about how libman understands libraries:

- A *library* is the smallest unit of code that can be "used."
- A library or application may *use* any number of other libraries.
- Library usage is transitive. If *A uses B* and *B uses C*, then *A uses C*.
- When a library or application is built, the *usage requirements* of each
  library that it uses are applied to the invocation of the underlying
  toolchain.

The idea of *usage requirements* is at the core of libman. Usage requirements
are not a new idea: Meson has them, and "modern" CMake has all been centered
around the idea. The earliest mention (and origin, as far as I am aware) of
usage requirements is in Boost.Build (then known as bjam).

Despite the slowly-creeping adoption of usage requirements as a design pattern
for build systems, each build system has its own way to encode them.

Because of this disparity, each package manager must know how to emit the
proper encoding for the build systems, or hope that the package they are
shipping has already provided the properly encoded usage requirements (e.g. a
CMake package emitting a `PackageConfig.cmake` for `find_package()` to use.)

Libman provides a common format that is trivial to emit and trivial to consume.


<div class="aside note" markdown="1">
#### Isn't this just a reinvented `pkg-config`?

Yes and no. libman is designed from the ground-up to be drop-dead-simple to
use. Unlike `pkg-config`, there is no tool to install to consume libman files,
as that functionality should be provided by the build system. There is no
variable expansion, and there is no equivalent of `--static` and friends.
libman does not encode toolchain command-line flags either, rather opting for a
very precisely (and purposefully) limited set of key-value pairs.
</div>

libman is a new *level of indirection* between package management and build
systems. If a package manager can emit libman files, then any build system that
understands them can work with that package manager. If a build system can spit
out a libman-export, then a package manager that understands the format can
collect the build output and distribute it.

If you're an average developer that doesn't spend a lot of time poking and
prodding at build systems and package management tools, this may sound very
abstract. You probably haven't had to take a look behind the curtain and see
just the kinds of hoops that package and build tool developers have to jump
through to "play nice" with existing projects.

> I would highly recommend viewing Robert Schumacher's recent presentation on
> the subject: [How to Herd 1,000 Libraries](https://www.youtube.com/watch?v=Lb3hlLlHTrs), which discusses some reasons of just why package management for
> C and C++ is particularly difficult.

A description of a file format is useless on its own, of course: We need
implementations!

For libman, I have already written an emitter for Conan (a Conan generator),
and a consumer for CMake. Suppose that we have generated a libman filesystem
structure for Boost. Using it from CMake looks like this:

```cmake
include(libman)

import_packages(Boost)

target_link_libraries(my-app PRIVATE Boost::filesystem)
```

<div class="aside note" markdown="1">
There are not yet pre-made and distributed libman files for Boost. This is just
an illustrative example.
</div>

The `include(libman)` will import the libman CMake module if it is available.
The `import_packages()` call is the real meat-and-potatoes of the whole
process. It will look for an `INDEX.lmi` file (the head of the libman structure)
and use it to make the libraries defined in the `Boost` package available as
`IMPORT`ed targets in the CMake project. This is a similar result as if one had
written `find_package(Boost REQUIRED ...)`, but with a few significant
differences:

1. `import_packages()` will hard-fail if any of the requested packages are not
   available.
2. There are no "components" with libman. This feature has been intentionally
   omitted, with no plans to add it. When we `import_package(Boost)`, we
   generate `IMPORT` targets for *everything* in the Boost package.
3. There is no way to specify a `VERSION` of the package to import. This has
   also been intentionally omitted, as version management is left up to the
   package manager outside of CMake.

Perhaps all of these differences sound like misfeatures. After all, don't we
*want* to specify versions? What if I want a package to be "optional"? How do I
specify what subset of the package to import?

These are good questions that deserve good answers. Here is what and why libman
and `import_packages` fixes with `find_package`, in order:

1. The "optional-ness" of a package **should not** rely on ambient mutable
   system state. This makes build processes difficult to reproduce and
   confusing when the build results are different between two different
   machines that otherwise appear "identical" but incidentally have different
   packages installed externally. Instead, the build should detect attributes
   about the system *unrelated* to whether a given packages is incidentally
   installed, and/or it should offer an option that the user must set
   explicitly to enable/disable the feature. If a users wants the `Widgets`
   feature and that feature requires `Gadgets`, then tell the user that they
   must either disable `Widgets` or install `Gadgets`. Don't silently change
   your build based on whether `Gadgets` is present: The user might not even be
   aware of this dependency and will need to dig through your build to
   understand why `Widgets` is built on some systems but not on others.
2. The `COMPONENTS` feature of `find_package()` is not worth the trouble, and
   can be replaced by other existing features. With Boost, it used to be that
   one would link with `${Boost_LIBRARIES}`, which was a variable populated
   with the appropriate linker arguments based on the `COMPONENTS` given to
   `find_package()`, but now we use imported targets and we already get
   piece-wise selection of dependencies. If we wish to check if the
   `Boost.System` library is available, we can simply look for the appropriate
   target. `COMPONENTS` introduces needless complexity for very little gain.
3. `find_package()`'s version resolution and "dependency" finding is untenable
   for any mildly complex use case. Individual `PackageConfig.cmake` and
   `FindPackage.cmake` modules must implement their own versioning and
   dependency tracking. They most often do this incorrectly or not at all. It
   is far better to place the burden of version resolution on a dedicated
   package and dependency manager. A libman structure allows only one version
   of any library within it at once, although there can be an arbitrary amount
   of libman structures. The dependency manager can create libman structures
   on-the-fly, and these structures will encode the interdependencies of
   packages within the structure *by name only*. The structure is guaranteed to
   be generated without version conflicts (according to the versioning rules of
   the dependency manager). `import_packages()` will transitively import any
   dependencies automatically.

(There are corresponding `export_*()` functions in the libman CMake module, but
that is not pertinent to this post.)


# A New Tool

Anyone taking a look at my GitHub activity chart will find that I've been
pretty busy for the past few months:

<div class="image-frame" markdown="1">
![GitHub Activity Chart. Much activity from October to December](/res/gh_activity_2019_12.png)
</div>

This hasn't all been focused on a single repository either, but it *is* all
leading to a single new repository.

After several months of heads-down work, I'm happy to finally announce my new
project: `dds`

These past few months have been spent getting `dds` into a state where it is
reliable, understandable, and (most importantly) *useful*.

Not only is the tool *itself* in a usable state, but so is the new
*documentation*.

It should be noted that `dds` is still in *alpha* state. It is missing a lot of
features that I would like to see before it reaches stability, and there are a
few corner cases where it won't play nice. Nevertheless, I believe it to be in
a place that it is ready to get poked and prodded by a wider audience.


# A Few Up-Front Questions

Of course, I'll get the most important parts out of the way first before
getting into the details that I think make my approach *interesting*.


## *Whatsit?*

`dds` is the *Drop-Dead-Simple* build and library management tool. It is a
hybrid build system and package manager with a few distinguishing design
decisions that set it apart from current offerings.

None of the design decisions are, by themselves, particularly ground-breaking.
We've seen a lot of tools come and go. I have chosen a combination of designs
and paradigms that I believe can make a truly *great* system.

> For a much lengthier rundown on the background and reasoning behind `dds`,
> refer to [the `dds` Design and Rational page of the documentation](https://vector-of-bool.github.io/docs/dds/design.html).


## *How is it used?*

To build a project with `dds`, there is no separate configure and build steps:
Simply run `dds build`. (A toolchain will need to be specified of course. Read
on.)

The build process for every `dds`-based project is identical.


## *How is a project set up?*

`dds` relies on the project following a set of layout conventions to find and
compile source files and libraries (the layout requirements are a subset of the
Pitchfork rules). There are no mandatory `dds`-specific files to get started
with a build, but a few become necessary when one wishes to do more complex
operations.

> Refer: [Packages and Layout](https://vector-of-bool.github.io/docs/dds/guide/packages.html)


## *How do I declare dependencies?*

`dds` tracks two forms of dependencies: *package* dependencies and *library*
dependencies.

A *package* dependency is declared in a `package.dds` file, which is placed in
the root directory of a project. Such a file might look like this:

```yaml
Name: acme-widgets
Namespace: ACME
Version: 1.5.1

Depends: acme-gadgets ^1.2.2
Depends: acme-utils ^2.2.1
```

Library dependencies are known as *usages*, and are written in a `library.dds`
file, which is placed in the root of each library. It looks like this:

```yaml
Name: Widgets

Uses: ACME/Gadgets
Uses: ACME/Utils
```

The `Foo/Bar` syntax of the `Uses` key is inherited directly from libman, and
represents a `<namespace>/<name>` pair that identifies a library. The
`<namespace>` field is declared as part of the package which contains the
library, and the `<name>` field belongs to the individual library itself. In
the above example, we are creating a library named `ACME/Widgets`, which is a
combination of the `Namespace` field from `package.dds` and the `Name` field of
`library.dds`.

> Refer: [Library and Package Dependencies](https://vector-of-bool.github.io/docs/dds/guide/interdeps.html)


## *How do I setup `#include` and linker paths?*

`dds` implements the semantics defined by libman. Simply declaring that a
library is *used* (via the `Uses` key) will ensure that the compilation of the
**using**-library will be able to resolve the `#include` directives of the
**used**-library. When `dds` links runtime binaries, it will add the
appropriate linker inputs for all dependencies of that runtime binary.


## *How do I perform "conditional" compilation?*

As of right now: Using `#if` preprocessor directives that wrap an entire file.
This may sound absurd, but it is remarkably effective and keeps the
"conditionality" of a source file local to that file. Additional methods of
conditional compilation may be considered in the future.


# Non-Use-Cases

Before proceeding further, I think it best to set a clear boundary of tasks
that `dds` *does not* (and *might never*) address:

- Building projects that rely on on-the-fly code generation.
- Building projects that rely on configure-time platform and feature detection.
  (e.g. `__has_include` works, but `check_include()` a-la CMake is not possible).
- Building projects that provide a large number of pre-build user-tweakable
  parameters. (Any build tweaks should be done through preprocessor definitions,
  but should be generally avoided).
- Being used *at all* on platforms that do not support the filesystem structure
  mandated by `dds`.

**Importantly,** one will note that most of the above points are qualified with
"building projects that...": This is carefully and intentionally worded. Just
because `dds` cannot build your project **does not** mean that it is useless
within that project!


# Use Cases

Having gotten the non-uses, let's cover the main use-cases for `dds`:

1. Building, testing, and dependency resolution for a project that is not
   excluded by the non-use-cases above.
2. Obtaining and building dependencies that are `dds`-aware, from within *any*
   project, including non-`dds` ones.

Each point deserves further discussion and clarification.


## `dds` as a Project Manager

For many projects, `dds` is suitable to be their primary build, test, and
dependency provisioning system. In this case, `dds` is a build system in the
same role of tools like CMake, Meson, Autotools, and MSBuild; and it is
simultaneously a package management tool like Conan, vcpkg, and Hunter.

**However,** `dds` is not a *direct* competitor to CMake, Meson, Conan, vcpkg,
or MSBuild. For some projects, `dds` will work as a drop-in replacement without
much effort. In other cases, the project will need to be adapted to work with
`dds`. For some projects, `dds` may not be suitable to be the primary build
tool but can still be used as a dependency manager within another build system.

Instead of *competing*, `dds` strives to *cooperate* with other build systems
and package managers. For example: `dds build` will, by default, download and
build the dependencies of a project. Alternatively, a packager (like a Conan
recipe or vcpkg port) can invoke `dds build --lm-index=<path>` to provide a
path to the libman structure that exposes the project's dependencies. In this
way, the *package* dependency resolution of `dds` can be completely bypassed
and outsourced to a separate dependency manager, while the *library* dependency
resolution (which is intrinsic to the build process itself) will be performed
using the dependencies provided by the external packager.


## `dds` as a Package Manager

The libman concepts are not tied to `dds`, nor are they specific to any exact
build system or package manager. Any package manager that can export libman
files can be used with any build system that can import libman files. `dds` is
*both*.

A CMake project can use the `libman` CMake module to import a set of libman
files to `IMPORT` targets. Since `dds` can emit libman files, the build results
from `dds` can be imported directly into CMake.

`dds` has a specific subcommand for it to be used as a dependency manager:
`build-deps`. Usage is simple:

```
$ dds build-deps neo-sqlite3^0.2.2
```

(A toolchain file must be provided.)

The above command will emit an `INDEX.lmi` file and directory structure
containing the build results. This result can be imported into any build system
that understands libman files.

For example, in CMake, an `import_packages(neo-sqlite3)` call will find the
`INDEX.lmi` and use it to generate `IMPORT` targets corresponding to the build
results.

In this use case, `dds` can be used to manage dependencies for a project that
is not necessarily aware of `dds` *at all*. (It will need to be libman aware,
however).


# Offering a Helping Hand

Almost every exception in `dds` is tagged with an enum, and that enum is mapped
to two important strings: A small summary, and a documentation link.

Every time `dds` encounters something incorrect, it will provide a small
paragraph that describes the error and possible solutions. Additionally, a link
referring to a hand-written documentation page will be provided, which often
contains additional cross-references.

`dds` is built to be maximally *discoverable*. If you omit a required field in
a `package.dds`, it won't just tell you that you've made a mistake: It will
tell you *why* it is a mistake.

Getting started with C and C++ development can also be difficult. For this
reason, `dds` also documents several things that may go awry in the course of
development. Often these things would be a complete head-scratcher to beginners,
but I hope that the documentation can offer an obvious path forward:

<div class="image-frame" markdown="1">
![Link error with help link](/res/dds_link_failure.png)
</div>

([Clickable link to the docs page mentioned above](https://vector-of-bool.github.io/docs/dds/err/link-failure.html))

> Refer: [Runtime Error References](https://vector-of-bool.github.io/docs/dds/err/index.html)


# Uncompromising and Opinionated

`dds` follows the rule of *convention over configuration*. In many cases where
many systems would *ask* the user about the preferred behavior, `dds` will
*prescibe a convention* that will obtain the desired behavior.

For example:

- A library's compilable files go in `src/`: **No exceptions**.
- If an `include/` directory exists, it is the public header directory,
  otherwise it is `src/`: **No exceptions**.
- Library consumers will have visibility to the public header directory, but
  not any other directory in the library: **No exceptions**.
- The include-search-paths for a library are `src/`, `include/`, the public
  header directories of the libraries it uses, and the compiler's built-ins:
  **No exceptions**.
- Every compilable file will be compiled: **No exceptions**.
- Every header in the public-include directory will be exposed to clients: **No
  exceptions**.
- Every application entrypoint file must match `*.main.<ext>`: **No
  exceptions**.

It should be noted that just because *the tool* is uncompromising does not mean
that *the author(s)* of the tool are uncompromising! Support for alternative
workflows can be added and existing workflows can be tweaked, but there should
be sufficiently motivating reasoning behind making such changes. "Because I've
always done it that way" is not a convincing reason, but "because it is
impossible to do `XYZ` in any other way" **is** a valid reason.

I *want* to help people develop better software. To the best of my knowledge, I
have captured a generic-enough set of prescriptions to cover the vast majority
of the target use cases, even if it will take some learning new paradigms on
the part of the user. If the conventions set forth render certain design idioms
or patterns *completely impossible*, I would very much like to know.

> Refer: [Design and Rationale > The Rules](https://vector-of-bool.github.io/docs/dds/design.html#the-rules)


# Toolchains at the Core

`dds` is especially different in that it performs *absolutely zero* platform
and compiler detection. Instead, `dds` requires that the user explicitly name
the toolchain that `dds` should use. Additionally, the toolchain can be changed
by the user on a whim *within the same build directory* (no confusion required).

`dds` comes with several "built-in" toolchains that are ready to be used. They
are embedded into the executable and contain a set of default "happy path"
options. Further customizations to the toolchain will require the authoring of
a toolchain file.

`dds` is unique in its extremely broad definition of "toolchain." Whereas most
tools will use this to describe the compiler, linker, and runtime binaries that
are used to build source code, `dds` includes individual compile and link
flags. This includes the language version, debug-info options, and optimization
level. The only exemption is warning flags: Only the root project will be
compiled with warnings enabled, while dependencies are compiled without.

`dds` also enforces an extremely strict requirement upon builds: *Everything*
in a dependency tree must compile with the same toolchain down to individual
compile flags and preprocessor macros. If you change the toolchain after
performing a build, *everything* in the dependency tree will rebuild.

There are some important implications and effects. To identify just a small
selection:

- Everything will compile with the same language version. One *cannot* compile
  dependency `A` as C++14 and dependency `B` as C++03. One *cannot* compile
  dependencies with C++03 and the main project at C++20. *Everyone* must agree.
- If you need GCC's `-fconcepts` option, *everyone* will be compiled with that
  option.
- If you want address-sanitizer, *everyone* must build with address sanitizer.
- If you pass `-DNDEBUG` to disable `assert()`, *everyone* will see `NDEBUG`
  and *every* `assert()` will be disabled.

> Refer: [Toolchains](https://vector-of-bool.github.io/docs/dds/guide/toolchains.html)


# Dependency Resolution is Strict

`dds` allows version ranges on dependencies, but they are intended to be used
for compatibility purposes when solving dependency diamonds in downstream
packages. `dds` implements the Pubgrub dependency resolution algorithm.

If your project declares a dependency on `foo ^1.2.8`, the `^` symbol means
that anything greater with the "same major version" is compatible. If versions
`1.2.4`, `1.2.8`, `1.2.22`, `1.3.0`, `1.3.2`, and `2.0.1` are available for
`foo`, then `1.2.8`, `1.2.22`, `1.3.0` and `1.3.2` are considered *compatible*.
However: Unlike some dependency managers, `dds` will always select the *lowest*
compatible version that matches the expression. This means that, effectively,
the version ranges of a project are not used when the dependent project is
being built itself.

This behavior is chosen for a few reasons:

- Determinism: Even if a dependency has released a newer version that is
  compatible with the specified range, `dds` will not use it unless the version
  range's base is increased. A single commit of a `dds` project will always
  pull and build against the same dependencies regardless of whether newer
  upstream packages have become available in the interim. The only exception is
  if an older version is *removed* from the catalog, which forces `dds` to
  select the next compatible version.
- Compatibility honesty: If you are writing a library that depends on
  `foo^1.5.2`, you *must not* depend on anything from `foo` after `1.5.2`. Even
  though `1.6.0` is *compatible*, you have offered your users a guarantee that
  `1.5.2` is *sufficient*. If you make use of a feature or bugfix from `1.6.0`,
  then your compatibility declaration of `foo^1.5.2` has become a *lie*. `dds`
  helps catch these "accidental lies" early by building the project with the
  lowest versions that satisfy its dependency ranges.

> Refer: [Package Dependencies](https://vector-of-bool.github.io/docs/dds/guide/interdeps.html#package-dependencies)


# Introductory Examples

I think it easiest to see the intended workflow by seeing some examples.


## Example: A Simple Application

Suppose we want to create a very simple application with `dds`. We start by
creating a source file:

```c++
// File: src/my-app.main.cpp

#include <iostream>

int main() {
    std::cout << "Hello, world!\n";
}
```

To build this application with GCC:

```
$ dds build -t :gcc
```

(Pass `-t :clang` to build with Clang.)

To build with MSVC, run the command from a VC-enabled console:

```
> dds build -t :msvc
```

`dds` will generate an executable in `_build/` named `my-app`. The name is
derived from the source file path that contains the entrypoint. The key is the
`.main.cpp` in the filename, which tells `dds` that the corresponding
translation unit is an application entrypoint rather than a library source file.

> Refer: [Applications and Tests](https://vector-of-bool.github.io/docs/dds/guide/packages.html#applications-and-tests)


## Example: More Source Files

We can move our string into a different source file by simply adding additional
files:

```c++
// File: src/example/strings.hpp

#include <string>

namespace example {

std::string get_greeting_string();

}
```

```c++
// File: src/example/strings.cpp
#include <example/strings.hpp>

std::string example::get_greeting_string() {
    return "Hello, world!";
}
```

and modify the main file to use them:

```c++
// File: src/my-app.main.cpp
#include <example/strings.hpp>

#include <iostream>

int main() {
    std::cout << example::get_greeting_string() << '\n';
}
```

Now when we run `dds build`, it will generate a static library containing all
non-entrypoint sources and link it into the executable. Note that we do not
need to enumerate our source files. Instead, `dds` will discover them
automatically.

> Refer: [Libraries](https://vector-of-bool.github.io/docs/dds/guide/packages.html#libraries)


## Example: Exporting a Library

Let's remove our `my-app.main.cpp` and just generate a library containing the
strings. We'll then export that library and import it into another project. To
make this work, we'll need to add two new files:

```yaml
# File: package.dds
Name: example-strings
Version: 1.0.0
Namespace: example
```

```yaml
# File: library.dds
Name: strings
```

Now we are ready to export the library into the *local repository*. This is
done with a single command:

```
$ dds sdist export
```

You'll notice that we didn't actually perform any build tasks. The way `dds`
stores packages in the local repository is always in plain source form. The
word `sdist` stands for "source distribution," and the `sdist export` command
tells `dds` to "export a source distribution of the given project into the
local repository."

The *local repository* is a collection of source distributions of packages.
Packages in this repository are available to be used by other projects. When we
`sdist export` our project, it becomes available to other projects we build
locally.

> Refer: [The Local Package Repository](https://vector-of-bool.github.io/docs/dds/guide/repo.html)


## Example: Using a Library

Let's create a new project directory and a new application within it. We'll
call it `greeter`:

```c++
// File: src/greeter.main.cpp

#include <example/strings.hpp>

#include <iostream>

int main() {
    std::cout << example::get_greeting_string() << '\n';
}
```

The source appears identical, but we've moved to a new project. If we try to
build this program, it will fail because the compiler doesn't know how to find
`example/strings.hpp`. We need to tell `dds` about the dependency. This new
project will require a `package.dds` that declares this dependency:

```yaml
# File: package.dds
Name: greeter/greeter
Namespace: greeter
Version: 1.0.0

Depends: example-strings ^1.0.0
```

This will only declare the *package* dependency. We also need to tell `dds`
that the root library (and its applications, i.e. `greeter`) want to *use* a
library declared in `example-strings`. Add a `library.dds` file to declare this
usage:

```yaml
# File: library.dds
Name: greeter

Uses: example/strings
```

The key `example/strings` is derived from the `Namespace` of the package that
contains the dependency and the `Name` of the library within that package,
joined with a slash `/`. The `Namespace` of `example-strings` is `example` (as
we declare in its `package.dds`), and the `Name` of the library containing the
code we need is `strings`. Thus, the usage-key is `example/strings`.

If we build our library now, we will see it compile and link successfully!

A keen eye might also notice that `dds` compiled `example/strings.cpp` as part
of the build. This is an important facet of `dds`: it will compile all
dependencies as part of a project's build, rather than compiling them up-front
as a separate phase.

> Refer: [Library Dependencies](https://vector-of-bool.github.io/docs/dds/guide/interdeps.html#library-dependencies)


## Example: Pulling a Remote Dependency

`dds` stores a local database of every package available for it to pull. This
includes various metadata about the packages themselves, which allows `dds` to
perform full dependency resolution without an authoritative server. This
package database is known as the *catalog*. We can add packages to the catalog
from the command line and then use those packages in our own local project.

Some libraries are able to be used without any additional work on behalf of
their author, simply by the library incidentally satisfying conventions that
`dds` prescribes for library's to be exported. One such examples is [the
`range-v3` library](https://github.com/ericniebler/range-v3/).

We can add the latest version of *range-v3* (as of the time of writing) to our
catalog with a single command:

```
$ dds catalog add range-v3@0.10.0 \
    --git-url=https://github.com/ericniebler/range-v3.git \
    --git-ref=0.10.0 \
    --auto-lib=range-v3/range-v3
```

The package ID format used by `dds` is the common `<name>@<version>`. In this
case, we are creating a package for `range-v3@0.10.0` to pull the `0.10.0`
release of the `range-v3` library.

The `--git-url`, `--git-ref`, and `--auto-lib` are all *acquisition* parameters,
and they tells `dds` how to obtain a source distribution for the give package
ID. `--git-ref` should name a tag to clone. The `--auto-lib` parameter is
required to automatically generate a `package.dds` and `library.dds` for the
source distribution since `range-v3` does not already provide them.
`--auto-lib` can be omitted if the package provides the `dds` files itself.

Now we can modify the our `greeter` to use `range-v3`:

```yaml
# File: package.dds
Name: greeter
Namespace: greeter
Version: 1.0.0

Depends: example-strings ^1.0.0
Depends: range-v3 ~0.10.0
```

```yaml
# File: library.dds
Name: greeter

Uses: example/strings
Uses: range-v3/range-v3
```

```c++
// File: src/greeter.main.cpp

#include <example/strings.hpp>
#include <range/v3/algorithm/for_each.hpp>

#include <iostream>

int main() {
    ranges::for_each(
        example::get_greeting_string(),
        [](auto c) { std::cout.put(c); });
    std::cout.put('\n');
}
```

If we `dds build`, we see `dds` clone the `range-v3` repository at the correct
tag, and then compile and link our simple `greeter` program with no trouble.

If `dds` needs to use a package that is not in the local repository but *is*
available in the catalog, then `dds` will acquire the package on-the-fly and
generate a source distribution thereof, placing the result in the repository
for future use.

> Refer: [The Package Catalog](https://vector-of-bool.github.io/docs/dds/guide/catalog.html)

<div class="aside warning" markdown="1">
At the time of writing, there are a few important caveats:
- `dds` does not yet have a centralized repository of packages that it can pull
  from.
- `dds` currently only supports the *Git* acquisition method.
- Packages generated with `--auto-lib` cannot have further dependencies.
</div>


## Example: Using it from CMake

Before I was ready to release anything, I wanted to make sure it was useful to
existing projects without requiring them to rewrite everything. Seeing as CMake
is very popular, I have a strong CMake background, I have a [Package Manager
Manager](https://github.com/vector-of-bool/pmm), and `dds` is kind of a package
manager, I felt this a strong basis for an initial integration story.

Like other package managers, `dds` can be used with PMM:

```cmake
pmm(
    DDS DEPENDS "neo-sqlite3 ^0.2.2"
    CMakeCM ROLLING
)
```

The first line, `DDS DEPENDS "neo-sqlite3 ^0.2.2"` will use `dds` to download
and build the named dependencies. `dds` will then generate a libman filesystem
structure for the build results, ready to be imported.

The `CMakeCM ROLLING` line enables the [CMake Community Modules](https://github.com/vector-of-bool/CMakeCM) (a project I haven't made a fuss about
either). The `libman` module is defined here, so we can just `include` it:

```cmake
include(libman)
```

and then simply import and use the library:

```cmake
import_packages(neo-sqlite3)

# The `neo/sqlite3` library is exposed as `neo::sqlite3`
target_link_libraries(my-app PRIVATE neo::sqlite3)
```


### Sub-example: `dds`-agnostic Import

We can remove mention of `dds` from our CMake project:

```cmake
pmm(CMakeCM ROLLING)
include(libman)
import_packages(neo-sqlite3)
target_link_libraries(my-app PRIVATE neo::sqlite3)
```

To make this work, we'll simply need to generate the libman structure before
we configure the CMake project:

```bash
> dds build-deps -t $toolchain "neo-sqlite3 ^0.2.2"
```

This will generate an `INDEX.lmi`, which `import_packages()` will be able to
find without consulting `dds` (it checks in the build directory and source
directory).

The design of the libman structure is not tied to any particular tool.
`import_packages()` does not care if it comes from `dds` or any other package
manager, only that it be well-formed.

(My greatest hope is that, if this approach becomes popular enough, we can see
the `import_packages` function become a built-in, negating the need for `pmm()`
and `CMakeCM`, but that is a *very* high hope.)


# Not Yet There:

There's a few important features and auxiliary components to `dds` that I plan
on developing in the future:


### IDE and Tooling Integration Features

`dds` knows about your project, and it will *already* spit out a
`compile_commands.json`. This isn't enough, though! `dds` is being built from
the ground-up to "play nice" with other tools. Asking `dds` to spit out its
information about a project isn't difficult, but it isn't ready yet.


### A VSCode Plugin

I have experience writing plugins for VSCode, and VSCode is my primary editor.
*Of course* I'll be creating an official plugin for `dds`!

You'll already get some niceties just be `dds` emitting a
`compile_commands.json`, but with a proper plugin you'll get full source code
browsing and IntelliSense support.


### Package "Features"

A package would often like to offer toggles for features/behaviors. Doing this
in a way that is stable, extensible, fast, and usable is a tough challenge. I
have a possible design in mind already, but it'll be a while.


### Remote Catalog Support

Having a local catalog database is cool. It'd be cooler if that catalog could
be sourced from a remote server. It'd be even cooler if it was drop-dead-simple
to host your own source distribution repository and catalog for your
organization. It's be excellent if we had a place to host these repositories
and share them around the world.


### Header Checks

`dds` has all the information it needs to run checks over your headers to
ensure that they are well-formed when `#include`'d at the head of another file.
Let's do that!


### C++20 Modules

C++20 is getting a new modules feature. The changes on the tooling ecosystem
will be profound. There's a lot of aspects that are still up-in-the-air, so
I've refrained from committing to any C++ Modules work in `dds`.

Once the Ecosystem TR is ready and Modules is looking ready in compilers, this
feature will be near the top of the to-do list.


### Other Long-Term Goals:

- Package signing and validation
- Additional test layout options
- Additional test drivers


# An Alpha Release

At the time of posting, `dds@0.1.0-alpha.2` is available as the first public
alpha release. I refer to this as an "alpha" release, because it is still very
incomplete. Despite the missing features, it is stable and usable on Windows,
macOS, and Linux. Pre-built binaries are available in the GitHub *releases* tab,
and building from source is otherwise very straightforward. I would encourage
those interested to give it a try and submit feedback, especially those
interested in creating reusable cross-platform libraries.


## Links

- [The GitHub Repository](https://github.com/vector-of-bool/dds)
- [The GitHub *Releases* page](https://github.com/vector-of-bool/dds/releases) (includes ready-to-use executable binaries)
- [The documentation](https://vector-of-bool.github.io/docs/dds/index.html)


## Who Should Try It?

I'd *like* to say "everyone," but I believe the current feature-set will be of
greatest interest to library developers-- particularly anyone who has a "cool
idea" that they want to try for a new library. Starting a new library from
scratch or migrating a young library will be easier than trying to migrate a
well-established library.

If you want to try and make a new command line application, `dds` will also be
up to that task.

**Also note** that `dds` does **not** yet have a large catalog of libraries
ready to be used. In fact, the current alpha of `dds` does not ship with any
libraries available *at all*. For now, the catalog must be populated manually.


## A Word of Warning

The "alpha" should be taken seriously: There are no forward/
backward-compatibility guarantees until a beta version. Any aspect could be
changed before moving to a beta release, so no alpha release should be used in
any critical environment. Feel free to experiment and collaborate, but do so
with the understanding that you will likely need to make changes in the future.


# The New Decade

C++20 is looking to be the single largest change to the language and library
since its inception. It's about time that we sorted out the library
distribution ecosystem.

This project is ambitious, and I already hear the complaints of having [another
build system to worry about](https://xkcd.com/927/). I won't pretend that it is
a panacea, but I will hope that it can set in motion a desire to completely
break off from the vicious cycle we've been fighting for years.