---
layout: post
title: A Successful Project Structure Model
comments: true
---

<div class="aside warning" markdown="1">
This is a work in progress. Send me questions, comments, concerns, and
hatemail.
</div>

All the kool kids are doing it. The newest languages and tools have (semi-)standard project layouts. C and C++? No such a thing.

> Why not? Well, us C++ programmers are quite egotistical. **Your**
> project layout isn't good enough for _my_ project. **My project** has
> special requirements.

Eh... I'm sure there are projects out there unique enough to warrant
very... unique... layouts. I would contend that they are few and far
between, especially for libraries. Most projects have a few components:

- The public headers
- The library's compilable source files
- The private headers
- Executable entry points (`main.cpp` files)
- Documentation
- Tests
- External libraries that have been nested within the project structure
- Build files

What are we to do other than throw these things all over the place in
hopes that we end up with some semblance of sanity?

# A Sane Project Structure

The C++ community has been slowly converging, whether from network
effects, or independent discovery of similar sane project structures.
We're due for some kind of convention. Not an ISO standard, mind you:
Just an informal, de-facto standard.

I'm going to write here what I think can be a good candidate as the
de-facto standard.

I didn't conceive of this structure all on my own. I've learned and
adapted to what I've seen in the wild: What works, what doesn't, and what
is truly irrelevant.

## Starting from the Top!

- **Repository**: At the top of the project structure you will have your
  repository, of course! The `.git`, `.svn`, `.hg`, or whatever else you
  might have.
- **The `build` Directory**: In your repository's ignored files will
  always be `build/`. This is an extremely common subdirectory used for
  building the source tree. It should not contain any files checked in or
  modified as part of the main codebase. The presence or absence of the
  file should not have a significant effect on the project's behavior.
- **Your root build files**: `CMakeLists.txt`, `Makefile`, `SConstruct`,
  `build.sh`, or whatever you might have. Always at the root! Never in a
  subdirectory!
- A `README` file, any format.
- A `LICENSE` file, as a plaintext file with the license text.
- The following **subdirectories** may or may not be present, as
  necessary:
  - `include/`
  - `lib/`
  - `src/`
  - `test/`
  - `util/`
  - `contrib/`
  - `deps/`
  - `doc/`
  - `res/`
  - `cmake/` (CMake only)
- You may also have tool configuration files, such as `.clang-format`,
  `.clang-tidy`, `.gitignore`, `.hgignore`, and similar.

Now for each subdirectory:

---

## Subdirectory: `cmake/`

This directory is only required if you are using CMake and have
additional modules or toolchain files.

In this directory, place `FindFoo.cmake` find-modules, `Foo.cmake` CMake
modules, `MyToolchain.cmake` toolchain files, `ConfigSomething.cmake`
cache-init files, and subdirectories required to support them. At the top
of your `CMakeLists.txt`, **before your call to `project()`**, place this
line:

```cmake
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/")
```

This will ensure that the `cmake/` subdirectory is included in the CMake
module search path.

---

## Subdirectory: `deps/`

If you embed and distribution external projects in your source structure,
place them in here. **Each external dependency should receive its own
subdirectory.**

For example, to embed *Catch2* for testing, a subdirectory `deps/Catch2`
will appear. In there will be the code for the embedded library.

### CMake User Notes:

Add a `deps/CMakeLists.txt` to the project structure. Call
`add_subdirectory(deps)` from your root `CMakeLists.txt`.

If an external library supports using `add_subdirectory()` on it, add a
call to `add_subdirectory()` in the `deps/CMakeLists.txt` for that
project.

If a project _does not_ support CMake embedding, or you prefer to import
the dependency in a different manner, for a dependency `FooPackage`,
write a `deps/FooPackage.cmake` file that does the import, and
`include(FooPackage.cmake)` from the `deps/CMakeLists.txt`.

**DO NOT MODIFY EMBEDDED EXTERNAL PROJECTS BEYOND WHAT IS _NECESSARY_**.

---

## Subdirectory: `contrib/`

This contains "add-ons" to the main source code. A library consumer
should have the option to enable/disable these components as necessary at
build time. Each contribution must occupy another subdirectory of
`contrib/` with an appropriate name.

Each subdirectory of `contrib/` should also have its own project structure
mirroring the layout proposed in this document.

This directory is entirely optional.

### CMake User Notes:

Add a `contrib/CMakeLists.txt`. Unconditionally
`add_subdirectory(contrib)` from the root `CMakeLists.txt`.

The `contrib/CMakeLists.txt` file should contain the relevant cache
variable/option declarations for enabling/disabling each subdirectory.

After each enablement option should be a conditional
`add_subdirectory(<foo>)` for the corresponding `contrib/<foo>`
subdirectory.

For example, if you have a project structure like this:

```
<root>/
  CMakeLists.txt
  contrib/
    CMakeLists.txt
    foo/
    bar/
    baz/
```

then the `contrib/CMakeLists.txt` might look like this:

```cmake
# Optionally enable the `foo` extension
option(BUILD_CONTRIB_FOO "Build the 'foo' extension" ON)
# Include if they requested it:
if(BUILD_CONTRIB_FOO)
    add_subdirectory(foo)
endif()

# They can chose either `bar` or `baz`, or disable it with `none`
set(EXTRA_THING_MODE "none"
    CACHE STRING
    "The mode for the extra contribution [none, bar, baz]"
    )
# Declare the options for the cache value:
set_property(CACHE EXTRA_THING_MODE PROPERTY STRINGS none bar baz)

# Include the mode they requested:
if(EXTRA_THING_MODE STREQUAL "bar")
    add_subdirectory(bar)
elseif(EXTRA_THING_MODE STREQUAL "baz")
    add_subdirectory(baz)
elseif(EXTRA_THING_MODE STREQUAL "none")
    # Nothing. It is disabled
else()
    message(WARNING "Unexpected EXTRA_THING_MODE: '${EXTRA_THING_MODE}'")
endif()
```

<div class="admonition" markdown="1">
# Lookout!

**Nothing** from the main source tree should depend on a `contrib/`, but
a `contrib/` sub-project may depend on other `contrib/` sub-projects.
</div>

---

## Subdirectory: `util/`

This directory contains scripts and utilities that are "meta" to the project.
This might include turn-key build scripts, linting scripts, test scripts, or
whatever else might be useful to a developer working on the project. This is
not part of the external-facing user interface for the project.

---

## Subdirectory: `test/`

This is what it says on the tin: Tests. This document does not prescribe a
specific structure for this subdirectory. Just put your tests here.

### CMake User Notes:

Add a `test/CMakeLists.txt` file and **conditionally** `add_subdirectory(test)`
toward the end of your root `CMakeLists.txt`.

**DO NOT UNCONDITIONALLY INCLUDE THIS DIRECTORY.**

The condition should be the logical conjunction of two things: A `BUILD_TESTING`
option (the CMake convention) and whether
`PROJECT_SOURCE_DIR STREQUAL CMAKE_SOURCE_DIR`.

Your root `CMakeLists.txt` should look something like this:

```cmake
project(MyProject VERSION 1.0.0)

# ...

option(BUILD_TESTING "Build the testing tree" ON)
if(BUILD_TESTING AND (PROJECT_SOURCE_DIR STREQUAL CMAKE_SOURCE_DIR))
    enable_testing()
    add_subdirectory(test)
endif()
```

The `BUILD_TESTING` option is the standard way in CMake to enable/disable the
building of tests. Don't call `enable_testing()` unless this option is enabled.

The check `PROJECT_SOURCE_DIR STREQUAL CMAKE_SOURCE_DIR` is a check that your
project is the _root project_. If your project is included in someone else's
project via `add_subdirectory()`, this check will fail and your tests will not
be added to the includer's tests.

---

## Subdirectory: `include/`

If you separate between private and public headers, the `include/` directory
should contain your _public headers_. That is, the headers which are needed by
your library consumers. If you are not shipping a library to consumers, or all
of your headers are public (you have no private headers), this directory is
optional.

If you want to ship headers, but do not have a private/public header
distinction, put all of your headers in the `lib/` directory.

### CMake User Notes:

This directory _does not_ contain a `CMakeLists.txt`.

---

## Subdirectory: `lib/`

This directory should contain all of the main source files for you project,
except those containing any entry points (`main()` functions).

If you have separate private and public headers, place private headers in this
directory. If you do not have any private headers, place headers in this
directory.

Always place header files alongside their respective source file, if applicable.

### CMake User Notes:

This directory will contain a top-level `lib/CMakeLists.txt`, but shouldn't
contain any subdirectory CMake list files. The `lib/CMakeLists.txt` should
declare and define the libraries that will be built for the project.

---

## Subdirectory: `src/`

This directory should be flat, and contain one source file for every executable
in your project. Each source file will be compiled and linked into an
executable, consuming the content of `lib/` and `include/` as necessary.

### CMake User Notes:

This directory will contain a single `src/CMakeLists.txt`. It should define an
executable for every source file in that directory, and link them to the
required libraries.

---

## Subdirectory: `doc/`

This directory should contain documentation for the project. The documentation
engine and methodology is not defined by this document.

---

## Subdirectory: `res/`

This directory should contain other resources used by the project, such as
icons and graphics. These are usually not edited as code, but by another
external program.

---

> The title is an homage to
> [A successful Git branching model](https://nvie.com/posts/a-successful-git-branching-model/),
> the blog post that gave birth to GitFlow.