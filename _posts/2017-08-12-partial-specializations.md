---
layout: post
title: Partial Specialization and Tags
desc: >
    In which I talk about how to emulate partial specialization of function
    templates and talk about why we actually want to partially specialize
    function templates
---

Recently, in the C++ blog-o-sphere, [a post by Jonathan Baccara](http://www.fluentcpp.com/2017/08/11/how-to-do-partial-template-specialization-in-c/)
made its rounds in the community. [A corresponding reddit thread](https://www.reddit.com/r/cpp/comments/6szojd/template_partial_specialization_in_c/)
featured some discussion on the subject.

An important question was raised by several commenters, along the lines of

> Why would anyone want partial specialization of function templates?

Usually followed up with:

> Overloading is the proper way to get what you want.

This statement is both *correct* and *incorrect*, for a few reasons.

## (Not) An Example of The Problem

First, the simplest example of "unnecessary" partial specialization:

~~~c++
template <typename T, typename U>
void foo(T t, U u);

// Invalid C++ !
template <typename T>
void foo<T, int>(T t, int i);
~~~

Of course, the more correct way to handle this:

~~~c++
template <typename T, typename U>
void foo(T t, U u);

// All good! (Not a specialization, just an overload)
template <typename T>
void foo(T t, int i);
~~~

Great! Problem solved! We can all go home and sleep soundly, rest assured that
we don't need any silly partial specializations.

## Not So Fast!

The above example isn't contrived. It's a very common pattern. Unfortunately,
this doesn't work in all circumstances.

## A Real Use Case

Suppose we want to write a JSON serialization library. We want to support
dumping and loading of custom types to JSON, and we want users of our library
to be able to extend our library to transparently handle their own types.

How can we go about this? The typical past case has looked like this:

~~~c++
namespace json_lib {

template <typename T> struct serialize;

template <typename T>
json_data to_json(T item) {
    return serialize<T>::to_json(item);
}

template <typename T>
T from_json(json_data j) {
    return serialize<T>::from_json(j);
}

}
~~~

It works like this: we ask for a specialization of ``serialize`` for the type
`T`. We leave the primary template undefined, so that an unsupported type just
becomes a compiler error. Our library provides an array of basic definitions
of ``serialize`` for many common types (``int``, ``float``, ``string``,
etc). For a user to support their own type, they open up the ``json_lib``
namespace and provide a specialization of ``serialize`` for their type. This
has been the common pattern for a lot of libraries for quite some time.

Unfortunately:

1. It's ugly
2. It couples tightly.

### The Ugly

In order for users to extend the JSON library, they need quite a bit of
boilerplate. Suppose we have a custom ``my_integer`` class that just wraps an
integer:

~~~c++
namespace my_library {
class my_integer {
    int _value;

public:
    explicit my_integer(int i) : _value(i) {}
    int value() const { return _value; }
};
}
~~~

How do we add support for serializing this?

~~~c++
namespace json_lib {
template<> struct serialize<my_library::my_integer> {
    static json_data to_json(my_library::my_integer i) {
        return json_lib::to_json(i.value());
    }
    static my_library::my_integer from_json(json_data j) {
        return my_library::my_integer{ json_lib::from_json<int>(j) };
    }
};
}
~~~

Ouch! That's quite a bit of boilerplate, just to extend for our little integer
class.

### The Coupling

Now, anyone who ``#include``s our ``my_integer`` header will immediately get the
``json_lib`` headers pulled in. Booo. This means that our users must have
the include paths set up properly, and ``json_lib`` is now polluting their
namespace. Moving the *definition* of the static ``to_json`` and ``from_json``
functions to an implementation file won't help: the declarations must still
be visible to the compiler at all times.

## A Different API?

What if we change the extension API of ``json_lib`` to use function overloads
instead. In this situation, ``json_lib`` only provides a series of ``to_json``
and ``from_json`` specialization, that might look something like this:

~~~c++
json_data to_json(int i) { /* ... */ }
json_data to_json(float i) { /* ... */ }
json_data to_json(string i) { /* ... */ }
template <typename T> T from_json(json_data d);
template <> int from_json<int>(json_data j) {/* ... */}
template <> float from_json<float>(json_data j) {/* ... */}
template <> string from_json<string>(json_data j) {/* ... */}
~~~

Here, we have several ``to_json`` functions, none of which need to be function
templates or template specializations, since they can use overloading on their
parameter types.

The story is different with ``from_json``: it has no parameters to overload,
just the single ``json_data`` parameter. We *cannot* use overloading (*yet*.
Continue on, dear reader).

Our custom integer serialization now looks like this:

~~~c++
namespace my_library {
json_lib::json_data to_json(my_integer i) {
    return json_lib::to_json(i.value());
}
}
namespace json_lib {
template <>
my_library::my_integer from_json<my_library::my_integer>(json_data j) {
    return my_library::my_integer{ from_json<int>(j) };
}
}
~~~

Meh... It's somewhat of an improvement. Here we rely on ADL to find the
``to_json`` for ``my_integer``. This will clean up the call sites, which no
longer need to qualify every call to ``to_json``.

``from_json`` sees a *minor* improvement. It must still be declared within the
``json_lib`` namespace because it is a specialization of a template within that
namespace, but it has less boilerplate. Overall, it is still hideous.

### A Different API Brings a Different Problem

Suppose we have a library with some custom container:

~~~c++
template <typename T>
class my_container {
    /// All that container fluff...
};
~~~

And we want any specialization of ``my_container`` to be serializable to and
from JSON. How do we do that in our new API?

~~~c++
// All good...
template <typename T>
json_data to_json(my_container<T> c) {
    /// Do stuff...
}

namespace json_lib {
// Hold on a minute...
template <typename T>
my_container<T>
from_json<my_container<T>>(json_data j) {
    /// Do other stuff...
}
}
~~~

**NO!** That's a partial specialization of a function template! We can't do
that!

Our prior version, with a ``serialize`` struct template would work in this case,
since we can partially specialize that template. But then we get our old
baggage back...

We can't use overloading here, because the only time the type appears in the
function signature is in the return value, and overloading on a return type
is not only illegal, it's nonsensical.

What if we change up the ``json_lib`` API to use an output parameter instead?

~~~c++
template <typename T> void from_json(json_data j, my_container<T>& out) {
    /// Do stuff...
}
~~~

Pfft. We're programming in C++! We know better than output parameters! /s

In all seriousness: this has a few (potentially serious) problems:

1. Users of `from_json` must now declare their variable before calling
    ``from_json`` on it. Ew. Now users are unable to use ``const``, since the
    initialization of the variable happens after it is declared.
2. All types that want to support serialization must now be
    *default-constructible*. For some types, like ``my_integer``, this is okay:
    Just initialize to zero. For other types, this is completely unacceptable.
    What if default construction is expensive? What about a type
    ``username``, which stores a user's name as a ``string``? What's the
    "default" username? What about ``color``? What's the "default" color?

## A *New* Different API

To solve this problem, what we need is:

1. A type that is default-constructible
2. A type that carries around another type
3. A type that is extremely cheap to copy and move, such that it can be
    completely optimized away
4. A type that enables ADL into the carried type's namespaces

Let's suppose we have such a type (or a template thereof). We can call it
``type_t``.  And we can make a variable template of it called ``type``.
What does ``type`` look like? What does it look like to use ``type``?

~~~c++
template <typename T> struct type_t {};
template <typename T> constexpr auto type = type_t<T>{};

template <typename T>
void other_func(type_t<T>) {
    // ...
}

void foo() {
    other_func(type<int>);
}
~~~

With this, you may be able to see what a new-and-improved ``json_lib`` API
might look like. Here it is:

~~~c++
json_data to_json(int i) { /* ... */ }
json_data to_json(float i) { /* ... */ }
json_data to_json(string i) { /* ... */ }
int from_json(type_t<int>, json_data j) {/* ... */}
float from_json(type_t<float>, json_data j) {/* ... */}
string from_json(type_t<string>, json_data j) {/* ... */}
~~~

Extending that API?

~~~c++
namespace my_library {
json_lib::json_data to_json(my_integer) { /* ... */ }
my_integer from_json(type_t<my_integer>, json_lib::json_data j) { /* ... */ }
}
~~~

And for our custom container?

~~~c++
namespace my_library {
template <typename T>
json_lib::json_data to_json(my_container<T> c) { /* ... */ }
template <typename T>
my_container<T> from_json(type_t<my_container<T>>, json_lib::json_data j) { /* ... */ }
}
~~~

What about using that API?

~~~c++
auto some_json = read_json();
auto some_username = from_json(type<username>, some_json);
~~~

And there you have it. No need to open up the ``json_lib`` namespace. No need
to even include the headers, if you can just forward-declare
``json_lib::json_data``, since return types and reference parameters need not
be complete types.

We can declare our ``to_json`` and even our ``from_json`` within the namespace
of their respective types, since ADL will find them.

The only big problem is with ``type``: who provides it? Does ``json_lib``
provide it? It's a fairly general type. In fact, we could *technically* use just
about any of the unary templates declared in ``type_traits``. The contents
don't matter. It's all about the template arguments.

Another possible definition for ``type_t``:

~~~c++
template <typename T> using type_t = T*;
~~~

Now all users implicitly have the definition of `type_t` without importing
*any* libraries. (Of course this presents problems of its own.)

Maybe if others find this trick useful enough, a ``std::type`` could find
itself part of a future standard library proposal.

## A Bonus: Values as Types

Users familiar with Boost.Hana have probably seen tricks like this, although
carried a lot further and much more fleshed out. I'll only touch on them
lightly here.

One of the common questions from programmers who newly discover ``constexpr``
is why code like this code doesn't compile:

~~~c++
constexpr int do_thing(int i) {
    std::array<int, i> arr = {};
    // ...
    return 12;
}
~~~

The compiler will complain because ``i`` is *not* a constant expression. "But
we're in a ``constexpr`` function!"

The problem is that ``constexpr`` functions must be evaluatable with
*non-constant* arguments at runtime.

The common reponse has been requests for the ability to overload functions with
``constexpr`` arguments, so that a function will *only* evaluate with constexpr
arguments.

With a few tricks, we can get pretty close. Let's make another empty struct
template and corresponding variable template:

~~~c++
template <auto V> struct value_t {};
template <auto V> constexpr auto value = value_t<V>{};
~~~

Here I am using C++17's non-type template argument type deduction for
``auto V``. It allows any parameter to be passed here that may be used as a
non-type template parameter. Now, we can get close to our ``constexpr``-only
argument functions. Look here:

~~~c++
template <auto V>
constexpr int do_thing(value_t<V>) {
    std::array<int, V> arr = {};
    // ...
    return 12;
}
~~~

How do we use it?

~~~c++
do_thing(value<22>);
~~~

#### Let's Get Creative!

Can we use regular operators with our compile-time value types? Of course!

~~~c++
template <auto A, auto B>
auto operator+(value_t<A>, value_t<B>) { return value<A + B>; }
template <auto A, auto B>
auto operator-(value_t<A>, value_t<B>) { return value<A - B>; }
template <auto A, auto B>
auto operator*(value_t<A>, value_t<B>) { return value<A * B>; }
template <auto A, auto B>
auto operator/(value_t<A>, value_t<B>) { return value<A / B>; }
template <auto A, auto B>
auto operator==(value_t<A>, value_t<B>) { return value<A == B>; }
template <auto A, auto B>
auto operator!=(value_t<A>, value_t<B>) { return value<A != B>; }
~~~

No need to use old MPL-style meta-functions a-la:

~~~c++
typedef mpl::int_<12> a;
typedef mpl::int_<22> b;
typedef mpl::add<a, b> sum;
~~~

Just:

~~~c++
auto a = value<12>;
auto b = value<22>;
auto sum = a + b;
~~~

To see the logical conclusion of using values-as-types, take a look at
Boost.Hana.
