---
layout: post
title: A Package Manager Manager
comments: true
---

> No, that title isn't a mistake. You read it right.

> Note: If you don't use CMake, you may not be satisfied with the CMake-centric
> tool pertinent to this post.

> If you want to skip a lot of pontificating and bemoaning, jump to the *Get to
> the Point* section below.

C++ developers are stubborn. Me included. For people that write in what may
arguably be the most complex programming language in history, they also seem to
want their tools to "just work" without having to sink a lot of effort.

You know what I'm talking about.

Package management.

C++ developers want a package and dependency management tool that will work
with their existing codebase without them having to make any changes to their
project and build system. Well I have some bad news: They don't, they won't,
and (in my opinion) they shouldn't. But... that's a subject for another post.

# The Basic Hurdles

Adopting a package manager for a project presents a few challenges. I'll talk
about Conan and vcpkg for now (and you'll see why in a moment).

- How do I install it?
  - For Conan, this requires that you have a Python installation, and that you
    use Pip. C++ developers, in their stubbornness, don't want to be required to
    learn another tool.
  - For vcpkg, you need to obtain a particular revision of their Git repository,
    run the bootstrap script, then optionally deploy integrations for it for
    your shell.
- How do I use it?
  - For Conan, you write a `conanfile.txt` or `conanfile.py` and place it in
    your project, then run `conan install` on that directory, then include
    `conanbuildinfo.cmake` from your `CMakeLists.txt`, then call
    `conan_basic_setup(TARGETS)`, then link against the Conan-generated targets
  - For vcpkg, you `vcpkg install [pkg-name [...]]` to install some packages,
    then pass `-DCMAKE_TOOLCHAIN_FILE=<path-to-vcpkg.cmake>` when you run your
    CMake configure, then `find_package()` the requirements you want to import.
    The way you link to those packages depends on the individual pakage
- How do I upgrade the Package Manager?
  - For Conan, you use `pip install conan -U`, or `pip install conan==<version>`
    for a particular version. You need to run this periodically, as Conan won't
    remind you itself when updates are available.
  - For vcpkg, you need to manually re-download and re-bootstrap the repository.
- How do I package my software?
  - This is out of scope for this post, but I'll come back on a future date.

This is actually quite a lot of extra stuff that one needs to do to use these
tools. As such, both Conan and vcpkg support being used as an "optional" tool
for a project. In particular, this is why vcpkg uses `CMAKE_TOOLCHAIN_FILE` to
do its bidding: It's an easy way to shoe-horn arbitrary code into an existing
CMake project, as the toolchain file will be `include()`'d by CMake when it
does compiler checks. The CMake project need not necessarily be aware that
this extra tool is modifying the build process.

To find the root of the problem, let's follow the *5 Whys.* Ask "Why?" a few
times, and you'll eventually find a root cause.

# Fear of Commitment

But *why?* Why do C++ developers avoid committing to these tools? Why not just
put your foot down and *require* these tools? "To work with my project, you
*must* use `{Conan,vcpkg}`!"

I've been watching closely, and I have a hypothesis:

> C++ developers don't want to use to these tools *because no one else uses
> these tools.*

Of course it's an exaggeration to say "no one uses these tools." There are
plenty of projects in the wild with a `conanfile.py` in their repository, *but
not nearly enough to counter the network effects.*

Let's say I run a moderately successful open source library, and I'm tired of
getting bug reports about trouble using the library with dependency versions
that I don't support. I *could* go the route of simply documenting *exactly*
what versions of dependencies are supported, but documentation is to users
as code comments are to compilers. We know how to fix useless comments: Make
them tool-enforced!

So I drop a `conanfile.txt` into my project and update the `CMakeLists.txt` to
check that the user has run `conan install`, and links to the
`CONAN_PKG::SomeLibrary` generated targets. By doing this, I am effectively
dropping support for building my library using `apt-get` as a dependency
manager.

If you're like many C++ developers, you probably just recoiled in horror at the
thought. Let's explore those feelings, and some common objections:

> "`apt` and `yum` are perfectly fine dependency managers for building open
> source libraries!"

I could spend a good few posts just talking about everything wrong with this
sentiment. It's just wrong. I won't even bother explaining it here, but maybe
I'll write another post if I get enough hate-mail.

> "My dependencies aren't available in Conan/vcpkg!"

This is a valid objection, but I can't help but feel it causes the problem to
perpetuate. People don't use the package manager, and therefore their libraries
will not appear in the package repositories, and downstream packages won't use
the package manager either since *their* dependency isn't in the repository, and
*even further downstream packages* won't use the package manager...

The only way to fix this is to start contributing!

> "Conan/vcpkg doesn't work *exactly* how I want it to."

Understandable, and I say the same thing: Conan and vcpkg don't work *exactly*
how *I* want them to either.

The problem is the same, and the solution is the same: Contribute!

> "I don't want to install another tool when I'm already using CMake!"

This objection simply makes no sense. If you have ten dependencies, you're
downloading and managing ten external items (plus any transitive dependencies).
You could instead hand over those 10+ tasks to a single tool dedicated to the
job. It'll probably do the task better than you anyway.

> "I don't need something new. What I have already works."

This sounds very familiar...

> "Conan/vcpkg doesn't support my *very special and unique* codebase."

I've seen some wacky codebases, and I've written several on my own. I can almost
guarantee: *You aren't that special,* and if your code is built in such a
bizarre and abnormal way, I am 98% certain it doesn't need to be.

> "I don't want to force my users to use a single version of `<dependency>`"

This is a common objection to committing to a dependency manager, and it raises
some interesting questions that may warrant its own "5-whys" and another post.
I'll just say here that I feel this fear is unnecessary and detrimental to C++
development. If I get enough hate-mail I'll write some more on the subject.

> "I don't want to force my users to learn and use `<tool>`"

*There it is.*

This is an objection that you can't readily refute, so let's go again: *Why? Why
do you not want to force your users to learn and use `<tool>`?*

## The Cost of Commitment

It boils down to empathy. We do not want to force our user to do something
difficult: It will hurt our adoption. Now *why* do we say that adopting these
tools is difficult? Well, we can go back to *The Basic Hurdles* section above
and see why.

The root problem is not that *we ourselves* refuse to jump these hurdles, but
that we know that our users will prefer a solution which does not require one.
If the onboarding and consumption process of my project is *just slightly more
difficult* than a competing project, users will opt for the easier solution.

To compensate for this additional difficulty of consumption, the product you
offer must be sufficiently superior to the alternatives to justify the
additional work required to use it. This is why header-only libraries are so
popular: *Cost of consumption is (seemingly) very low.*

Unless we can offer something sufficiently superior to the competition, the
cost of commitment [to a packaging tool] is the most important measure of a
(non-commercial) product's success: The size of its userbase.

# Get to the Point

I've blabbered on for a while now, but this has all been to illustrate the
problem that I have set out on solving:

> Adopting package and dependency management tools creates *too much friction*.

I have a few long-term concepts and plans on how that fiction my be reduced,
but those plans require cooperation between build systems and package managers
that is currently absent. So in the meantime I've developed an alternative:
an addition to CMake that makes using a package and dependency manager
drop-dead simple for both developers and consumers.

Why CMake? It's the most popular build system for C++ code these days (for
better or  worse). It is fairly well supported by packaging tools, and it is
the build system in which I have the most expertise. Similar tools could be
created for other build systems, but for now I've implemented one for CMake.

It is called PMM, The *Package Manager Manager*.

## What Does PMM Do?

PMM does what it says on the tin: It manages *package managers*. Currently it
supports Conan and vcpkg, but other packaging systems could also be supported
in the future.

In particular, PMM is implemented as pure CMake script code that will
automatically download, bootstrap, extract, and control other package managers.

For Conan, all you need is a relatively recent Python installation. Any recent
Linux distribution will be ready to use Conan in PMM. Windows users will need
to install Python 3, if they haven't already.

For vcpkg, Python is not required. All you need is a relatively recent C++
compiler.

## What Does PMM Look Like? How Do I Use It?

To use PMM, you will need to make the following three changes to your project:

1. Download `pmm.cmake` and place it in your project repository. Do not download
   this file automatically. Do not make this file optional for your build. Do
   not install this file externally. Do not embed this file's contents within
   another file.
2. `include()` the `pmm.cmake` file from your root `CMakeLists.txt`.
3. Call the `pmm()` CMake function.

That's it! Of course, there will be additional steps depending on which package
manager you wish to use.

## I Have an Objection to this Tool!

I anticipated a lot of possible objections to PMM, and I've written answers to
many of them in [the project README](https://github.com/vector-of-bool/pmm).
Give it a look before sending me hate-mail.

# But... Why?

PMM addresses a few huge concerns with using an additional tool:

## Keeping your Package Manager Up-To-Date

PMM is able to automatically install and manage the version of your package
manager. It will never automatically update anything, but it will notify you
when there are updates available.

## Ensuring Your Environment

Since PMM automatically obtains and executes the package manager, there is no
need to document or enforce additional setup steps for either your users or
your continuous integration system. Running `cmake` to configure your project
will do all that is needed to ensure your dependencies are available to your
project.

No longer do you need to direct your users to download dependencies manually
and fret about how they might do that depending on their platform. PMM will
ensure the dependency manager will be run and do it for them, and your
dependencies are encoded in your repository as code, rather than hoping and
praying that your user or CI server have the correct version of their
dependencies.

## Enabling Users

You already require your user to execute `cmake` to build your project. Why not
piggy-back off of it and use it to get your dependencies as well?

# Call for Feedback

PMM is still very new, and the posting of this page marks the 1.0.0 release.
Please try it out and tell me what you think!
