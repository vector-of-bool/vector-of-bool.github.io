---
layout: post
title: "Paths: Taxonomy, Terminology, and Myths"
desc: >
    In which I attempt to formalize some of the language used when talking
    about paths
---

What is a _path_? I mean, of course, in the context of computation.

It's a "string" that can be used to find a resource, in the most general sense.

This document is meant as a general introduction and reference to paths. It was
written with beginners in mind. Ambiguity and errors are unintentional, but
should be fixed.

## Let's Start with Some Myths

> A _path_ corresponds to a _file_.

Not necessarily.

> Okay, it can correspond to a _file_ **or** a _directory_.

Not necessarily. A _path_ is still a _path_ even if there is no file nor directory to which it corresponds. Of course we can construct a path to an imaginary file! We need to do so in order to create files, of course. We call `open()` or `mkdir()` with a _path_ to a file that may or _may not_ exist!

> Alright, then: A path corresponds to a location on the filesystem.

Nope. A _path_ need not have any correspondence to a filesystem at all. Examples
might include HTTP resources which correspond to a hierarchical resource-access
API that doesn't have any backing file store. We can still talk about and
manipulate the _path_ component of an HTTP request just as we can work with
paths attached to filesystem resources.

<div class="aside note" markdown="1">
A **path** is a structure that tells a system how to walk a hierarchy.
Almost always represented as a string. Nothing more, nothing less.
</div>

> A filesystem path either exists or does not exist.

This is a semantics problem. A _path_ **is not a file or directory**.
You should think of a filesystem _path_ as "instructions" on how to find a file
or directory.

A path is more like a phone number or a street address. The phone number _is
not the phone_, and the address _is not the building_.

Even if a phone number does not correspond to a phone in the network, the
phone number itself may have the proper form, and can still be talked about and
worked with. The same is true of paths.

<div class="aside note" markdown="1">
A filesystem **path** _corresponds_ to a file which may or may not exist, but
the path itself _is not the file_. Talking about a path _as if it were the file_
can be confusing and ambiguous. Avoid, if at all possible.

Old step-by-step telephone switching systems also used a phone number as a
_literal_ path through the switches to route a call, and may be a good analogy.
[Take a look](https://www.youtube.com/watch?v=xZePwin92cI).
</div>

> Paths are strings

Eh... Yes? Paths can be rendered as strings, but if you've never worked with a
language that has a first-class type to represent paths then you are missing
out. Python now has the `pathlib` module, and C++ has `std::filesystem::path`.
Try not to work with paths using string-based APIs. Then you're just working
in a string-ly type language, and no one likes those.

> Paths use the `/` separator

Usually. On most computer systems (not Windows) the `/` character splits the
components of a Path.

> Windows doesn't support `/` as a path separator, so my application shouldn't
> either

Okay. Sit down. Read some docs. Windows has supported `/` as the path separator
in all of its important APIs for many years. If your program does not allow use
of the `/` character as a path separator, you need to take a long hard look at
yourself and fix your software.

On the other hand, if your software doesn't work with `\` as a path separator on
Windows, you also need to get it fixed.

Similarly, if you treat `\` as a path separator in a program running on a POSIX
system, you should just stop. Stop doing that.

Use a decent path processing library (Python's `pathlib` or C++
`std::filesystem::path`) and stop worrying about the path separator so much.

> Parsing paths is easy!

Sorry, it is not. Especially in a cross-platform manner. Handling redundant
separators, normalization and canonicalization, and path re-basing is quite a
handful.

Again, use a path processing library.

> String comparison works for paths

_Sometimes_. This depends on if you want _equality_ or _equivalence_. The paths
`/foo/bar/` and `/foo/bar` are not _equal_, but they are _equivalent_ on most
modern filesystems. Certain tools will treat these paths differently. The paths
`/foo//bar` and `/foo/bar` are not _equal_, but they are _equivalent_ and all
filesystems and tools I am aware of will treat them as equivalent. The redundant
path separators are not significant.

To use string comparison on two paths, you will probably want to pass some
amount of normalization/canonicalization over the paths.

## Path Terminology

Different pieces of software talk about paths in different ways. A lot of libraries and systems have converged on some common terminology in the recent years, and it is essential to know and understand these terms. Let's go:

### Absolute Path

An _absolute_ or _full_ path is a path which is unambiguous. It will include
a root component (Like a `/` or drive letter) and zero or more components to
walk the hierarchy from that root.

### Joining

Two paths can be _joined_ to form a new path. This operation is not commutative,
but is associative. A join is usually performed by gluing the two paths together
with a path separator `/` between them. For this reason, it is common to see
path joins being done with the programming language's binary operator `/`.

An _absolute_ path should not be the right-hand operand of a join operation. In
many implementations, joining with a right-hand of an absolute path will yield
the absolute path, ignoring the left operand.

```
join(/foo/bar,  baz)    -> /foo/bar/baz
join(/foo,      bar)    -> /foo/bar
join(/,         bar)    -> /bar
join(/foo/bar,  /baz)   -> /baz
```

### Relative Path

A _relative_ path is a path which can be joined on the right-hand of another
path to form a _new_ path.

When joined with an _absolute_ path, a relative path forms an _absolute_ path.

When joined with a different _relative_ path, a relative path forms a different
_relative_ path.

```
join(/foo, bar)             -> /foo/bar
join(foo, bar)              -> foo/bar
join(foo/bar/baz, qux/duck) -> foo/bar/baz/qux/duck
join(foo, join(bar, baz))   -> foo/bar/baz
join(join(foo, bar), baz)   -> foo/bar/baz
```

A _relative_ path by itself _cannot_ resolve a resource. We need to join it with
an absolute path (the _base_ path) in order to produce an absolute path to a
resource. For many tools this joining is implicit (using the current working
directory as the left-hand of the join).

### Root Path

The root path is the top-most path. You cannot go above this resource. For
Unix-like systems this is represented as just the path separator `/`. On Windows
this refers to the drive letter plus a separator `C:\` or just the separator
in some cases `\`.

### Filename OR Basename OR Leaf

The "leaf" or "basename" or "filename" of a path is the final component of that
path, ignoring any trailing separators.

```
leaf(/foo/bar) -> bar
leaf(/foo/bar.txt) -> bar.txt
leaf(foo) -> foo
leaf(foo.txt) -> foo
leaf(/foo/bar/) -> bar
```

**NOTE:** The _file extension_ is part of the filename.

A filename is also a path on its own. It is a relative path for which the
filename is the entire path.

### Parent Path OR Dirname

The _parent_ of a path is the components of the path preceding the filename.
This usually entails trimming everything after the final path separator, and
ignoring any trailing separators:

```
parent(/foo/bar)    -> /foo
parent(/foo/bar/)   -> /foo
parent(/foo)        -> /
parent(foo/bar/baz) -> foo/bar
```

Both relative paths and absolute paths have parents. A single-element relative path has no parent.

```
parent(foo) -> ???
```

The return value of getting the parent of a single-element path varies. Often
tools will return `.` to represent "the current path."

For most tools, the parent of a root path is the root path itself.

The parent path is also called the "dirname" of a path, because it is often used
to obtain the path to the directory which _containts_ the file or directory
named by that path.

### Qualified Path

A _qualified_ path is a path which is not just a filename. Absolute paths are
qualified paths by definition. Relative paths may be a qualified path if
it is more than just the leaf of a path.

The distinction between a qualified path and a filename is important to some
tools. For example, a Unix shell will execute a qualified path to an executable,
but for filenames it will instead search for an executable file by joining
that filename with each element of the `PATH` environment variable.

The Windows `cmd.exe` will execute a filename if that filename corresponds to
a file in the working directory.

A qualified path to a file in the current directory can be created by using `.`
as the parent directory: `./foo.exe` is a _qualified relative_ path to `foo.exe`
within the `.` directory.

### Extension OR Extname

The _extname_ of a path is the extension of the filename component, separated
from the rest of the filename with a dot `.`.

```
extname(foo.txt) -> .txt
extname(foo) -> [Empty string]
extname(/foo/bar.txt) -> .txt
extname(/foo/bar) -> [Empty string]
```

### Stem

A _stem_ is the part of the filename that _does not_ include the extname.

```
stem(foo.txt) -> foo
stem(foo) -> foo
stem(/foo/bar.txt) -> bar
stem(/foo/bar) -> bar
```

# Some Implications

1. A _filename_ is also a _relative path_ because it can be used as the right-hand operand of a _join_.
2. A path is a _filename_ if `leaf([path]) == [path]`
3. All paths which are _not_ filenames are _qualified_.
4. A filename can be used as if it were a path in any context that accepts a relative (unqualified) path.
5. A path is _qualified_ if `leaf([path]) != [path]`
6. A path is _absolute_ if `join([root_path], [path]) == [path]`, that is: The path is already joined with the root, and cannot be further qualified.
7. A _root path_ is the only type of path with neither a _filename_ nor _distinct parent_ path.

Many old tools and libraries use different and conflicting terms to refer to
paths. Avoid, if at all possible. When working with these tools, be mindful of
the terms it uses and how they map to the terms outlined here. When developing
new tools and working with paths, be mindful of the terminology.
