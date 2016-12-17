---
layout: post
title: Ruminations on std::string
comments: true
---

# Ruminations On `std::string`

`std::string` isn't perfect. In fact, I would dare to say it is fatally flawed.
In order to understand some of the problems that arise from `std::string`, it
is important to understand a little history on strings in C++ and see just what
kind of problems `std::string` was meant to solve.

# A Brief and Hideously Incomplete History of C++ Strings

## Sadness: C-strings

C has a string type, and it is spelled a few different ways: `char*`,
`const char*`, `char[N]`, `const char[N]`, or any myriad ways you can put them
in a `struct`, along with the size of the string itself. C strings have a size
(length) associated with them (usually the number of `char`s being pointed to),
but this "size" value is not stored with the pointer/array itself, and must
usually be passed around as a second argument to functions, or by building some
kind of string `struct` which holds the size of the string along with the
pointer to the actual contents. There's also the concept of the
`NUL`-terminated string (formally know as a `NUL`-terminated character array),
where determining the size of the string requires iterating over the values
being pointed to until you find a zero character. This works well enough, but
can lead to issues when the `NUL` terminator is missing.

Along with the simple C-string comes many string manipulation and
observation functions. `strcmp`, `strlen`, `strcpy`, `strcat`, and the
hideously hard to use `strtok`, to name a few. All of them operate on
`NUL`-terminated strings and therefore inherit many of the problems intrinsic
to having un-sized strings.

Also, who allocates these things? If I call a function and it returns a
`const char*` to a `NUL`-terminated string, do I need to call `free` on it? Is
it allocated in static storage? Does the library manage it? What do I do? If
I pass a `const char*` to a function, do I need to keep that string alive past
the call site? Is it safe to write to that string? So many problems!

The concept of the `NUL`-terminated character array is so intrinsic to C that
it is specifically baked into the language: A character array literal, which is
a sequence of characters enclosed in double quotes, is defined to have an
implicit `NUL` character added to the end inserted by the compiler.

We cannot forget about `char*`'s evil twin: `wchar_t*`!

Actually, let's pretend that didn't happen and move on...

## Along Came a `std::string`

Early in C++'s history, there was no standard string type. Along with linked
lists and associative arrays, Bjarne Stroustrup cites this as being one of
the worst omissions from C++ 1.0. The lack of such a string type, and the dire
need for something more manageable than simplistic and error-prone
`char*`-strings led library and application developers around the world to
constantly reinvent and rediscover dozens of (completely incompatible) string
classes, some of which still live on to this day (such as Qt's `QString` or
MFC's `CString`). As such, most large-scale C++ codebases will be peppered with
different string types ranging from `char*`, `QString`, `MBString`, `std::string`,
or that-one-string-type-that-the-intern-down-the-hall-invented-thinking-it-was-
clever-but-it-actually-ended-up-corrupting-the-stack-every-fourth-tuesday-but-
never-when-there-was-a-full-moon (I'm sure you know the one).

Fortunately, `std::string` was included in the first standardized C++ standard
library in C++98.

All of the mentioned C++ string types attempt to solve a few very common
problems with C-style character-array type strings (hereafter refered to as
`char*`-strings).

Trouble with memory management is probably the single greatest advantage all the
above string types have over primitive C-strings. No longer do you need to
question whether you need to copy/free/allocate a string. The compiler will
call the copy constructors and destructors properly at just the right time,
100% of the time. The current memory-management of `std::string` is just
perfect. [Hint: It isn't perfect.]

Another important issue that is addressed by most of the strings is the size
problem. How long is the string? Now you can ask, with a `size()` method. It
even runs in constant time! What more could you ask for? [Hint: There's quite
a lot more to ask for.]

How about comparing strings? Got you covered. Comparing `char*` strings with
the `==` operator sounds like it should do the right thing, yeah? Of course not.
You need to use `strcmp`. Well, in C++ we can overload `operator==` to just
"do the right thing". [Hint: `std::string` maybe _doesn't_ do the right thing].

And sorting strings? Well, lexicographical comparisons just automatically
happen with `operator<`. Now you can binary search your strings, sort your
strings, all just done for you, perfectly! [Hint: Nope.]

`std::string` still supports subscripting, which was supported by `char*`, but
not by any composite C-string type (`struct` with size and pointer). Now you can
get all the goodies plus the familiar array-style access to the characters in
your string. [Hint: Characters are not always as they appear.]

What could possibly be wrong with such a string?

# The Potemkin String

`std::string`, while useful and practical for most applications, hides a dark
and dastardly secret: It doesn't have a text encoding.

Okay, that may not be a "secret", but it's certainly dark and dastardly. It is
important to know that it isn't of malevolence or ignorance that `std::string`
came this way. Text encoding in the nineties was a troublesome topic. I won't
go into great detail here, but James McNellis has given a very enlightening
talk on the subject of text encoding and its status in C++ on several
occasions. [Here's his presentation, recorded from CppCon 2014.](https://www.youtube.com/watch?v=n0GK-9f4dl8).
I'll be discussing some of the problems of `std::string`, most of which are
covered more in-depth in James's presentation. Give it a watch, if you have the
time. I'll first discuss two flaws of `std::string` that are unrelated to the
lack of text encodings.

## Alloc, Alloc, Everywhere, and not a Drop to Drink

It's a common meme in the programming world: C++ likes to copy things. It has a
hint of truth, too: The default action in C++ is to copy objects. This is
inherited from C's value-semantics of `struct`s, which are member-wise copied
around when passed to or returned from functions. When copying certain types,
such as `std::string` or `std::vector`, the copy operation is a linear time
operation, which is _unlike_ C, where copying is always constant time to the
memory size of the copied object. This has led many to be critical of C++'s
predisposition to copy in all cases. Such criticism has led to the adoption of
the `const&` idiom, where expensive-to-copy objects are passed to functions
via a reference to `const`. This brings us back to constant-time argument
passing, which is great. What's not so great is that we don't get this behavior
by default. It would be create if we didn't have to annotate our function
arguments with `const&` just to get the faster speed. Besides being a _O(n)_
operation, copying of strings costs us an allocation. Allocation requires quite
a bit of code to perform. This increases the cost of copying even further.

## Monoliths

C++, especially more recently, has focused largely on making our types _simple_
and _extensible_. A type should only have member functions which offer the basis
operations. For a type `T`, there is some set of "basis" operations and
_salient attributes_ which can describe an instance of `T`. The (possibly
infinite) set of operations and observations you can perform on `T` must be
able to be described in terms of the basis operations and salient attributes.
It is these basis operations and salient attributes that the interface of `T`
must provide.

For example: `std::vector` has a `size` and `operator[]` as salient attributes,
and `insert` and `erase` as basis operations. From these we are able to do
anything imaginable with a vector. For convenience and efficiency, `std::vector`
exposes more methods and attributes, such as `push_back`, `emplace`, `reserve`,
and `capacity`.

`std::string` is the antithesis of this minimalist design. Things like
searching, slicing, and concatenation are all part of `std::string`'s
interface. It would be like mathematicians inventing a new unary operator
'~+~` which adds 5 to any integer because "adding five to an integer is a
pretty common operation". It would be like making `sort()` a member function
of `std::vector`. This isn't Java. We're C++: We can do better.

Despite `std::string` being bloated, there is still push for more bloat. For
every possible thing you can do with a string, I have seen or heard someone
either online or at a workplace or conference suggest that we add a new member
function to `std::string` that performs the feature. `split`, `lower`,
`upper`, `join`. These aren't bad string operations. They just aren't basis
operations for `std::string`. Having a few convenience methods is okay. Having
every conceivable string algorithm as a member function is not.