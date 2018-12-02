---
layout: post
title: Smart Pointers Make Bad APIs
comments: true
---

Smart pointers are pretty cool, don't you think? You can easily represent the
lifetime semantics of an object in its type (and have it checked by the
compiler to some extent).

Nevertheless, I will assert that smart pointers are *bad* as part of an API.
I can easily make that statement, but what about an example? And how might an
API be better expressed?


# A Logging API

Imagine I'm making a logging API, and I have a logger type that I want to
create lazily. It'll be implemented as a singleton-ish, where I create it
based on the parameters a user has given me, and I return a reference to it
when they ask for the same logger instance based on the parameters. I also want to destroy the logger object when they no longer refer to it. Here's what an implementation might look like:

```c++
namespace {
// All the loggers we might create
map<logger_params, weak_ptr<logger>> loggers;
mutex loggers_mutex;
}

/**
 * Get a shared_ptr to a logger instance. It may already exist, or it may need
 * to be created within this call.
 */
shared_ptr<logger> logging::logger::get_or_create(logger_params params) {
    unique_lock map_lock{loggers_mutex};
    // Find an existing entry
    auto existing = loggers.find(params);
    if (existing == loggers.end()) {
        // Create a new instance from the parameters
        auto ret = make_shared<logger>(params, logger::create_cookie{});
        // Insert it in our map
        loggers.emplace(params, ret);
        // Return the shared_ptr to the caller
        return ret;
    }
    // We found an entry. Lock the weak_ptr to get a shared_ptr
    shared_ptr<logger> ret = existing->second.lock();
    if (!ret) {
        // The weak_ptr expired, so we need to recreate the logger.
        ret = make_shared<logger>(params, logger::create_cookie{});
        // Fill the entry with the new instance
        existing->second = ret;
    }
    return ret;
}
```

This is a pretty common design. It could be optimized in a few places, but
don't worry about that for the purpose of this post. The idea is that we
ensure our logger object will only live as long as people need to hold on to
it.

What does `class logger` look like? It's not hugely interesting, but maybe
something like this:

```c++
namespace logging {

class logger {
    struct create_cookie {};

    enum class level {
        debug,
        info,
        warning,
        error,
    };

    void _log(level, string);

public:
    logger(logger_params params, create_cookie);

    void debug(string str)   { _log(level::debug, str); }
    void info(string str)    { _log(level::info, str); }
    void warning(string str) { _log(level::warning, str); }
    void error(string str)   { _log(level::error, str); }

    static shared_ptr<logger> get_or_create(logger_params);
};

}
```

The `create_cookie` type prevents others from creating logger instance
directly, but allows us to use `make_shared` by passing through a
`create_cookie`.

And using our logging API:

```c++
int main() {
    // Get a logger
    auto log = logging::logger::get_or_create(create_main_logger_params());
    // Write some output
    log.info("Hello, world!");
    // The logger will automatically close at the end of this scope
}
```

Looks good, but...

```
main.cpp:9:8: error: no member named 'info' in 'std::shared_ptr<logging::logger>'; did you mean to use '->' instead of '.'?
    log.info("Hello, world!");
       ^
       ->
```

Clang is pretty helpful, and swapping `->` for `.` does indeed fix the issue,
but an unfamiliar user will wonder "Why is this a `shared_ptr`?"

It's not a hard question to answer. We've answered it in the comment above,
and the name `shared_ptr` gives a hint: This is a logger that other people
may be sharing with us, and it will live as long as all references to it.


## OOF

Maybe we want to be clever and close our logger early to release some
resources? Well, we know that the destructor will close the logger, and that
we call the destructor when we release references to it. How do you drop a
reference in a `shared_ptr`?

```c++
int main() {
    shared_ptr<logger> log = ...;

    /**
     * Do some stuff
     */

    // We're done with the logger. Free those resources!
    log.reset();

    /**
     * Do more stuff
     */
}
```

This works perfectly.

... For a few hours/days/weeks/months/years.

Then a new developer comes around (long after you have been hit by a bus), and
they add this:

```c++
// [Ignore the new name. It's been a few years.]
int FooBuilder::BeanRegistrySingletonFramer::SuperBeanFactoryBuilder() {
    shared_ptr<logger> log = ...;

    /**
     * Same stuff from years ago
     */

    // 300 lines later, or perhaps 3 modules diagonally
    log->info("We've done something!");
}
```

Oops. Now you are dereferencing a null pointer. Best case scenario:
You build with a non-null assertion in `shared_ptr` and you'll get a `"You
dereferenced a null pointer"` message at runtime. Next best case: You get
a crash with little information. Worst case: The compiler sees you doing this
and knows that you cannot reach this line, elides all `noexcept` code
immediately prior to this call, and appends a `ud2` instruction to the
function.


# It's All About Invariants

A type system is meant to encode *invariants* that can be ensured by the
language. Once you introduce *nullability* to a type, you introduce a little
asterisk to all of your invariants of "Not with a null pointer." Some
languages have *implicit* nullability, and that can become an absolute
nightmare, where all code in all places has invariants contingent upon the
precondition of "The thing you gave me isn't `null`, I hope."

C++ does not have implicit nullability. Value types are never null, and
references are never null. C++ has *explicit* nullability via `T*`, smart
pointers, and constructs like `optional<T>`. When you introduce nullability
to a type, all logic working with it must now work with the assumption that
`null` is now a *valid* state for the object. If you do not assume this, you
are treading on thin ice. Unfortunately, the C++ type system is not yet aware
of `null`-checks (A "flow" type system), so we must use our own human hearts
and hands to ensure we do these checks.

By creating an API that returns and accepts smart pointers, you are
introducing *nullability* where it is not appropriate.


# Sockets. They're Like Files, but they Talk Back

Let's invent an imaginary socket API:

```c++
class socket {
    struct create_cookie {};
public:

    using native_handle = ...;

    socket(native_handle handle, create_cookie);
    ~socket(); // Closes the handle

    void send(const_buffer);
    void recieve(mutable_buffer);

    static unique_ptr<socket> connect(std::string host, std::string service);
};
```

Let's use it to make a really simplistic HTTP library:

```c++
struct request {
    // Things...
};

struct response {
    // Things...
};

respones send_request(request req) {
    string host = parse_url_host(req.url);
    string port = parse_url_port(req.url);
    auto sock = socket::connect(host, port);

    /**
     * Send the request headers
     */

    // ...

    /**
     * Send the request body
     */

    // ...

    response ret;

    /**
     * Receive the response headers
     */

    // ...

    /**
     * Receive the respones body
     */

    // ...

    return ret;
}
```

Even with just dummy placeholder comments, this is quite a lengthy function!
We want to be a good citizen and refactor this into distinct functions to do
each step:

```c++
void send_headers(request& req, socket) {
```

Wait! We can't pass a `socket` raw. It's a non-copyable type.

```c++
void send_headers(request& req, socket& sock) {
```

Better, but now we're in a really weird place: The API to socket wants us to
use `->` to access the member functions of the socket, but we're passing a
`socket&`, so now all the members are accessed via a plain `.` operator. We
want uniformity:

```c++
void send_headers(request& req, unique_ptr<socket> sock) {
```

Uh... No. Now we won't be able to `send_body` because `send_headers` stole
the socket when we have to `std::move(sock)` to call `send_headers`.

```c++
void send_headers(request& req, unique_ptr<socket>& sock) {
```

Well that's pretty horrible. What even are the semantics of a reference to a
`unique_ptr`? Maybe we should just go back to using `socket&`...


## Semantic Syntax

`socket&` is obviously the most pragmatic, clean, and useful type to use
here. The trouble is the question of "Why do we use `->` in one place and `.`
in another? And why do we say `send_headers(req, *sock)`? Why the `*sock`?"

The useless answer is "because in one place it's a pointer, and the other it
is a reference." This may be *true*, but it's not *helpful*. The real answer
is "The API is bad."

The arrow `->` is usually interpreted to mean "We're doing an indirection
here," but that's not what it *means* intrinsically. It just calls
`operator->` (for smart pointers). The reason pointers use `->` instead of
`.` is a bit more arcane than that. There's no technical reason that raw
pointers (as they are currently defined) cannot use `.`.

In addition, we can just as well understand `.` as an "indirection" of
loading the address of the left hand, and performing an addition to obtain a
reference to the sub-object.

Another point to revive is that we've just brought back the concept of
*nullability* to our socket type. Oh joy.


# No "Raw" Pointers

So, what would my ideal `logger` API look like? I dunno. But I know how I can
make a better one than the one I showed earlier:

```c++
namespace logging {
namespace detail {

enum class log_level {
    debug,
    info,
    warning,
    error,
};

class logger_impl {
    struct create_cookie {};

public:
    logger_impl(logger_params params, create_cookie);

    void _log(level, string);

    static shared_ptr<logger_impl> get_or_create(logger_params);
};
} // namespace detail

class shared_logger {
    shared_ptr<detail::logger_impl> _impl;
    shared_logger(shared_ptr<detail::logger_impl> i) : _impl(i) {}

public:

    static shared_logger get_or_create(logger_params params) {
        return shared_logger(detail::logger_impl::get_or_create(params));
    }

    void debug(string s)   { _impl->log(detail::log_level::debug, s); }
    void info(string s)    { _impl->log(detail::log_level::info, s); }
    void warning(string s) { _impl->log(detail::log_level::warning, s); }
    void error(string s)   { _impl->log(detail::log_level::error, s); }
}
}
```

We now have an API where using `->` to access members is unnecessary, and it
is impossible to "get clever" and "null-out" the logger before it is
destroyed. **No more nullability!**

We still have our singleton-style semantics, though.

What about a better `socket` type?

```c++
class socket {
public:
    using native_handle = ...;
private:
    native_handle _h;
public:
    socket(native_handle handle);
    ~socket(); // Closes the handle

    socket(socket&& s) : _h(std::exchange(s._h, make_null_handle())) {}
    socket& operator=(socket&& s) {
        std::swap(s._h, _h);
        return *this;
    }

    void send(const_buffer);
    void recieve(mutable_buffer);

    static socket connect(std::string host, std::string service);
};
```

This one is a bit more subtle: `connect` now returns a `socket` directly
rather than a `unique_ptr`, and I've defined move operators for the class
that ensure the handle is only owned by one socket at a time. We can now pass
`socket&` objects back-and-forth like the proper types they are.


# Make Libraries Good

Instead of handing off responsibility of lifetimes to a smart pointer and
saying "Here: You deal with it," I've written a bit more code to give my
users a better and more intuitive API (and in the socket example, removed an
allocation).

The C++ toolbox is huge. Choosing the right tool for the right job is of
paramount importance. C++ is also called a language "for library authors,"
and I'm inclined to agree: Much of the language's complexity is aimed at
providing solutions for library authors, not application developers. It's the
job of the library author to hide this complexity so that people can build
great applications.

If you're a library author, make sure you're taking advantage of all the
tools at your disposal.

That *doesn't* mean we can just sprinkle smart pointers everywhere like fairy
dust and expect it to solve all of our lifetime semantics problems.
