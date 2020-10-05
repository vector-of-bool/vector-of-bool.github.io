---
layout: post
title: A New Approach to Build-Time Library Configuration
desc:
    In which I present a novel, portable, and nonintrustive approach to
    build-time configuration
---

# Pain

If you've been around the block of C and C++ libraries for more than a brief
glance, you have inevitably seen a `tweakme.h` or two. Maybe a `configure`
script with a few dozen command-line flags? Or maybe you've been told to pop
open `ccmake` and flip some switches? Have you ever juggled command-line flags
in a build script three layers deep just to enable/disable some workaround in
some library thats being pulled in as a dependency of a dependency of a
dependency?

Don't worry. I hear you cry. I too have wrestled with such pains.


# What's the Big Idea?

Why do libraries offer these build-time switches? What do they accomplish?

In the majority of situations, I believe that offering compile-time tweaks are
an *antipattern*. I could write a detailed post on *why*, but that's not the
point I want to focus on.

Instead, I want to focus on the cases where having these dials and switches is
hugely beneficial or essential.

For example, suppose I am designing a 2D graphics library and I want to allow
consumers to specify what rendering backend they want to use (OpenGL, Vulkan,
Metal, OpenCL, DirectX, etc).

Maybe I'm building a cryptography library and I want to allow users to
enable/disable hardware-accelerated algorithms. Perhaps I want users to be able
to completely disable poor algorithms.

Perhaps I have an experimental implementation/feature and I want the user to be
able to opt-in.


# The State of Things

## CMake

If you use CMake regularly, you're familiar with the `-D` command-line argument.
It lets us define variables that may be used by CMake scripts to tweak the
build.

In a CMake script, a snippet like the following may appear:

```cmake
option(ENABLE_EXPERIMENTAL_WIDGETS "Build with widgets" OFF)

target_compile_options(foo-widgets PUBLIC
  FOO_EXPERIMENTAL_WIDGETS=$<BOOL:${ENABLE_EXPERIMENTAL_WIDGETS}>
  )
```

and we can toggle this option *on* or *off* when we configure with cmake:

```sh
$ cmake -D ENABLE_EXPERIMENTAL_WIDGETS=TRUE <src>
```

When we compile `foo-widgets`, each compilation will receive a
`-DFOO_EXPERIMENTAL_WIDGETS` preprocessor definition set to `1` or `0` depending
on the CMake option `ENABLE_EXPERIMENTAL_WIDGETS`.

Unfortunately, the `PUBLIC` options means that *everyone* will receive
`ENABLE_EXPERIMENTAL_WIDGETS` in their preprocessor definitions, regardless of
whether the translation unit makes use of that definition. This can severely
harm incremental compilation, as changing the option's value will invalidate the
stored compilation of *every* TU. Besides this, a large number of library knobs
and toggles will explode the size of our command-line into an unreadable mess.

One possible answer (and the often preferred solution) to these problems is to
instead scribble the value of the configuration into a *generated header*:

```cpp
#define FOO_EXPERIMENTAL_WIDGETS $<BOOL:${ENABLE_EXPERIMENTAL_WIDGETS}>
```

Now, when a TU wants to consult the value of `FOO_EXPERIMENTAL_WIDGETS`, they
must first `#include` the generated header.

This has the downside that the library itself isn't even distributed in its
complete form, and it is *required* that a configuration process be executed
prior to the build. Simply compiling a file cannot be done because the expected
generated configuration header does not yet exist!


## The State of Things: Autotools

Autotools suffers all of the same problems that one finds with CMake, but will
do it slower, with a lot more copy-pasting of arcane shell scripts that no one
really cares about anymore, and with horrible support for non-Unix systems.


## The State of Things: Header-Only Libraries

Header-only libraries, despite looking like a panacea from build woes, do little
to improve our state of affairs.

Our option of using a generated header is gone, as there is no configuration
process in place that could generate one. We now have two options:

1. Have our users pass preprocessor definitions, either through local `#define`
   before `#include`-ing our header library, or on the command-line of their
   compilations. Providing them on the command-line presents all the downsides
   mentioned earlier, and having them `#define` macros before their `#include`
   directives is an ODR-violating minefield.
2. Put a header in our library for the user to modify.

With option #2, the header to modify is often given a name like `config.h` or
`tweakme.h`, to indicate that it contains the knobs, toggles, and switches for
the library. I'll simply call them "tweakme" headers for now.

A large issue with tweakme headers is, of course, the offloading of the
configuration process that the header-only library *would have* onto our users.
Now users need to do one of two things: 1) Embed a version of the library with
the modified tweakme header, or 2) add a step in their own build+configuration
process that will write the modified tweakme header.

Additionally, because the tweakme header needs to be modified in-place, we can
no longer use non-local installs of the library. Each consuming project will
need to have its own copy that it can scribble into without interfering with the
potential tweaks made by other projects on the system.

There is something very compelling about tweakme headers, though: They are a way
to configure a library absent any non-standard tools. The configuration is only
a matter of settings some preprocessor macros or constants. No external
scripting language required!

(This is a hint at a proposed solution.)


## `dds`

I've been working on [`dds`](https://dds.pizza/) for some time, and one question
that has always been outstanding is *how can I allow library authors to provide
knobs, toggles, and switches to their libraries?*

For a long time, I've been planning on a feature to generate configuration
headers, just as one would do with CMake, Autotools, etc. Something about it
didn't *feel right*, though. I want to approach this from an angle where a
project is ready-to-build the moment you open the project directory. I didn't
want the project to become *reliant* on `dds` generating headers for it.


## Dependency Builds?

Whether using generated config headers or using plain command-line preprocessor
macros, the issues scale up as a dependency tree grows.

Suppose framework `A` contains an embedded version of library `B` (I have
disdain for this model, but it has some merits). In order for a consumer of `A`
to tweak the options to `B`, `A`'s build system must expose the options of `B`,
which puts a maintenance burden on `A` and tightly couples the build of `A` to
the build of `B`.


# A "tweakme" header? No: A Tweak-header!

I cannot recall what train of thought led me to this new design. It was the dead
of night, lying in bed at 4AM, staring at the ceiling ~~and filled with
existential dread~~.

Then, *an epiphany*: A way that a library may offer compile-time customizations:

- without requiring:
  - A configuration process,
  - modifying of an embedded tweakme header,
  - bleeding macro definitions across the entire program,
- that works with:
  - CMake,
  - Autotools,
  - Meson,
  - `build2`,
  - `dds`,
  - header-only libraries,
  - or with *any* build system,
- that supports build-time configuration of:
  - preprocessor macros,
  - constants,
  - *function definitions*,
  - *class definitions*,
  - *type aliases*
  - or **any** language construct,
- all using *only standard language features*.

It all revolves around one magic preprocessor token: `__has_include`

To understand *how*, let's consider a library that offers a toggle to enable
"audit mode", wherein the library will heavily check its invariants with
`assert()`:

```c++
/// File: acme/widgets/frombulate.cpp

#include <acme/widgets/config.h>

void acme::frombulate(std::vector<widget> widgets) {
  #if ACME_AUDIT_WIDGETS
  assert(is_sorted(widgets));
  #endif
  do_frombulate(widgets);
}
```

In this case, `ACME_AUDIT_WIDGETS` is a 0/1 boolean macro that determines
whether the library performs the audits.

Traditionally, the user would control this value by tweaking the macro either on
the command line, with an option to the build configuration, or by putting
`#define` before their `#include` directives. (Of these, only passing it at
configure-time works with compiled libraries, and the latter option is horrible
and **should rarely or never be used**).


## Introducing the "Tweak-header"

So how can `__has_include` help us here? As always: *All problems in computer
science can be solved by another level of indirection.*

Instead of offering tweaks through a build system, let's do something that looks
a bit strange in our library's regular config-header:

```c++
/// File: acme/widgets/config.h

// *~*~*~ MAGIC ~*~*~*
#if __has_include(<acme-widgets.tweaks.h>)
  #include <acme-widgets.tweaks.h>
#endif

#ifndef ACME_AUDIT_WIDGETS
#define ACME_AUDIT_WIDGETS 0
#endif
```

(Maybe you've connected the dots already. Let's pace ourselves, though.)

What's happening here? What is `<acme-widgets.tweaks.h>`? In short: It's a
*tweak-header*: A user-provided header file that contains tweaks specific to the
library. A tweak-header is created using a few specific rules:

- A tweak-header must have a library-specific name, so that we can supply
  arbitrarily many tweak-headers to arbitrarily many libraries, and they do not
  collide.
- The library *does not provide the tweak-header*, but publicly documents the
  name(s) it expects for its tweak-header(s).
- *The library user provides* a tweak-header and places it at the root of an
  include-search-dir used by the library when it is compiled. For example, a
  project may have a `data/conf/` directory that is added to the
  include-search-dirs with `-I data/conf/` when the library is compiled.
- For each tweak-header that a library can expect, there should be a library
  config header/module that *conditionally* `#include`s the tweak-header with a
  `__has_include()` check.
- **No one *except*** the library's config header/module should `#include` the
  tweak-header. Anyone that wishes to access the options from the tweak-header
  must do so by `#include`ing or `import`ing the library's config header/module.


## Providing a Tweak-header

Suppose I am building an application upon `acme-widgets` and I want to be able
to control whether `acme-widgets` has audits enabled. Fortunately, the library
offers controls through a tweak-header. Here is how we do it:

1. `acme-widgets` documents that its only tweak-header is named
   `acme-widgets.tweaks.h`.
2. I create a new directory called `conf/` and place a file
   `acme-widgets.tweaks.h` within.
3. When I compile `acme-widgets` *and* when I compile my own project, I add the
   previously created `conf/` directory to the include-search-path, such that
   `acme/widgets/config.h` will be able to find the tweak-header.

That's it!

Now, when I want to enable audits in `acme-widgets`:

```c++
/// File: acme-widgets.tweaks.h
#define ACME_AUDIT_WIDGETS 1
```

And when I recompile `acme-widgets` and my application, auditing is now enabled.
I don't need to tweak options in any build system, or dig within the sources of
`acme-widgets` to modify their own sources: The change will propagate
automatically. Additionally, it will *only* propagate to files that actually
consult `acme/widgets/config.h`, and incremental compilation will leave
everything else alone.

If you are using a build system that builds its dependencies as part of the main
build (which `dds` does by default), you don't even need to worry about building
the library and application separately. *Just rebuild.*


# Tweaking Libraries for the Modern C++ Era

Preprocessor macros are *so* 1988. We can do better for library customization,
yeah?

```c++
/// File: acme/widgets/frombulate.cpp

#include <acme/widgets/config.h>

void acme::frombulate(std::vector<widget> widgets) {
  if (acme::widgets::config::do_audit()) {
     assert(is_sorted(widgets));
  }
  do_frombulate(widgets);
}
```

In the above, `acme::widgets::config::do_audit` is a function that determines
whether we want to audit the widgets. This seems weird, right? Why not use
conditional compilation instead? And how would someone "customize" this? How do
we "conditionally" provide a function definition?

It's not entirely clear how we offer a tweak like this, but it's actually
surprisingly easy:

```c++
/// File: acme/widgets/config.h
namespace acme::widgets::config {
  namespace defaults {
    constexpr bool do_audit() noexcept {
      return false;
    }
  }

  using namespace defaults;
}

// Pull the tweaks:
#if __has_include(<acme-widgets.tweaks.hpp>)
  #include <acme-widgets.tweaks.hpp>
#endif
```

In this case, the "default definition" of `acme::widgets::config::do_audit()`
simply returns `false` unconditionally. When we perform qualified name lookup,
we will *actually* find `acme::widgets::config::defaults::do_audit()`.

If I am writing an application and want to customize whether we audit widgets, I
simply provide the tweak-header:

```c++
/// File: acme-widgets.tweaks.hpp

namespace acme::widgets::config {
  constexpr bool do_audit() noexcept {
    return true;
  }
}
```

Now, when anyone (including `acme-widgets`) performs name lookup on
`acme::widgets::config::do_audit()`, the definition from the tweak-header will
be "*preferred*" to the definition that was pulled in via
`using namespace defaults;`

(Note: You can't use an `inline namespace` to contain your defaults, since that
behaves slightly differently with regards to name lookup. You must use a regular
namespace and pull the defaults in via `using namespace`.)


## Getting Fancy

We've injected a tweak to enable widget audits via a function. But *why use a
function?* We could just as well have used a namespace-scope constant.

Well, there's a significant advantage over using simple 0/1 boolean macros. A
function can *vary* its return value!

```c++
/// File: acme-widgets.tweaks.hpp

#include <cstdlib>
#include <string_view>

namespace acme::widgets::config {
  inline bool do_audit() noexcept {
    auto ev = std::getenv("AUDIT_ACME_WIDGETS");
    return ev && std::string_view(ev) != "0";
  }
}
```

With the above customization, now we can enable/disable the `assert()` *at
runtime!*


## Getting Fancier

What if we want to go further?

```c++
/// File: acme-widgets.tweaks.hpp

namespace my_app { extern bool audit_acme_widgets; }

namespace acme::widgets::config {
  inline bool do_audit() noexcept {
    return my_app::audit_acme_widgets;
  }
}
```

Now *our own application* can dynamically enable/disable the `assert()` *within
the library*. We didn't need to insert any special hooks or modify the library's
sources: We just provided a custom tweak to the library in a way that it
officially supports.

Try doing *that* with a `./configure` script!

Of course, its entirely up to the library to decide whether the above is allowed
or not. It could instead intend `acme::widgets::config::do_audit` to be a
`constexpr bool`, and that's entirely fine: It's simply up to `acme-widgets` to
document these tweaks.


## Getting Fanciest

Suppose I am building a library that *might* be threadsafe, but a downstream
user may want to disable synchronization primitives if they know that they are
creating a single-threaded application. Here's a simple way that might be done:

```c++
/// File: acme/gadgets/config.hpp

#include <mutex>

namespace acme::gadgets::config {
  namespace defaults {
    using lock_type = std::mutex;
  }
  using namespace defaults;
}

// Pull the tweaks:
#if __has_include(<acme-gadgets.tweaks.hpp>)
  #include <acme-gadgets.tweaks.hpp>
#endif
```

And a user can simply replace the lock type with a no-op lock:

```c++
/// File: acme-gadgets.tweaks.hpp

namespace acme::gadgets::config {
  struct lock_type {
    void lock() {}
    void unlock() {}
  };
}
```

and now anyone who references `acme::gadgets::config::lock_type` would receive a
no-op lock instead of a `std::mutex`.


## A Word on Modules

What does a tweak-header look like in a C++ Modules world? Surprisingly, near
exactly the same. The only difference is how we pull in the library
configuration. Whereas we previously wrote:

```c++
#include <acme/widgets/config.h>
```

we now write:

```c++
import <acme/widgets/config.h>;
```

and that's all there is to it!


# A Small Real-World Example

A prime example of a library that ships with several compile-time options is
SQLite. (For example, SQLite changes its thread-safety guarantees based on the
value of the `SQLITE_THREADSAFE` preprocessor macro, which must be defined when
compiling SQLite.) Rather than expecting the user to pass the macro on the
command line, the SQLite config-header might contain an incantation to pull a
tweak-header:

```c
#if __has_include(<sqlite.tweaks.h>)
  #include <sqlite.tweaks.h>
#endif
```

A library/application that contains an embedded copy of SQLite can tweak the
behavior of SQLite by providing their own `sqlite.tweaks.h` in their source tree
rather than setting preprocessor definitions in their build system.


# Interaction with Package Management and Build Systems

Because they necessarily affect the ABI of the generated code, the contents of
any particular tweak-header must be equivalent across the entire build. If a
library is compiled with some given tweak-header content, then that library may
only be consumed by other projects that have the same tweak-header.

The idea of compile-time options isn't novel, and tools already take them into
consideration.


## Conan and Conan's *options*

Conan's "*options*" feature allows a package to declare build-time parameters
that can be set by consumers. When Conan pulls packages, it uses the option
choices provided as part of a dependency statement when it generates a binary
package ID (which also considers the compiler, language version, operating
system, and debug/release mode; the binary package ID effectively represents the
ID of the package's ABI). Options are entirely arbitrarily defined by a package,
and it is up to the package's recipe to convert the given option choices into
build-system settings or generated `tweakme` headers. Changing a choice to any
particular option as part of a dependency statement will cause Conan to rebuild
the library (or download a cached binary) to match the new ABI of the given
choices.

If a library uses tweak-headers to configure itself, and wishes to work with
Conan, then its recipe would need to convert some set of option choices into a
generated tweak-header.


## `vcpkg`

`vcpkg` (as far as I am aware) does not expose a method to tweak compile-time
options of dependencies, and instead recommends overlaying custom portfiles to
tweak the build of individual packages. `vcpkg` supports ABI variance in the
form of triples, but they do not apply individual tweaks to individual packages,
instead encoding more abstract properties of the target platform.


## Build Systems

Tweak-headers are completely portable and will work for any build system or
package manager, but it is necessary that changing a tweak-header will
necessitate a rebuild of the library to which it corresponds.


### Header-Only

For header-only libraries, this is a non-issue, since the library is recompiled
immediately every time it is used, the library will instantly see any changes to
its tweak-headers.

Tweak-headers will also work when these libraries are pulled by Conan/vcpkg/etc,
of course.


### Dependency-Aware Builds

For `dds` and any build system that builds dependencies automatically, including
CMake projects in which dependencies are included via `add_subdirectory()`,
tweak-headers will "just-work", since file-level dependency tracking will see
updates to the tweak-headers as regular updates to compilation inputs.


### Vendored Builds of Third-Party Code

If you and/or your organization maintain from-source builds of a set of external
code, tweak-headers offer a pleasant alternative to wrangling a dozen different
competing build systems. Your hand-written tweak-headers will need to be
embedded in the distribution of your vendored dependencies.


### Everything Else

For any build that relies on stable, immovable, never-changing external
binaries, tweak-headers will not work on those binaries. This isn't unique to
tweak-headers, though. Using someone else's binaries that you have no control
over means that you cannot vary that package's ABI *at all*, regardless of
technique.

(Please don't do this.)


# Limitations and Downsides

Surely there must be downsides to this approach?

At the moment, I consider two primary drawbacks:

1. Adoption: No one is using this yet. Tweak-headers will only work if the
   library has explicitly added support for tweak-headers (or if you inject code
   into the sources at build-time). Of course, missing adoption is going to be
   true with any novel design. Fortunately, adopting tweak-headers is extremely
   easy and can be provided as an alternative to existing library tweaking and
   configuration options without breaking backwards compatibility.
2. Dependency tracking: This is a rarely-encountered but known-issue with how
   build systems currently implement inter-file dependency tracking, but it is
   exacerbated by `__has_include()` in cases where its result could change
   between compilations. I won't go into details here, but it basically means
   this: Adding a tweak-header as part of a build that wasn't previously present
   on the filesystem will require that all cached dependency tracking
   information in the project be completely reset. This is an unfortunate
   edge-case and will require tweaks to compilers to fix properly.

Perhaps new issues may arise as use cases are explored, but for the foreseeable
future I will be exposing all of my build-time switches through tweak-headers
rather than configure-time options.
