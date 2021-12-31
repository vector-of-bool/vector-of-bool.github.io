---
layout: post
title: 'co_resource<T>: An RAII coroutine'
desc: A handy idiom with coroutines, borrowed from Python
---

Python has a syntactic construct known as a `with` statement:

```py
with open('some-file.txt') as f:
  ... # code goes here
```

Code within the `with` block will execute as normal, but if the `with` block is
exited for *any reason*, then some cleanup occurs. It works like this:

1. The operand to `with` is captured as a *context manager* `c`.
2. Upon entering the `with` block, `c.__enter__()` is called, and the result
   assigned to variable named with the `as` specifier (which may be omitted).
3. Upon exiting the `with` block, `c.__exit__(...)` is called (with some
   arguments pertaining to exception handling, but they are not important here).

The `__enter__` and `__exit__` methods can perform arbitrary actions. You can
think of this as a way to capture a `finally` block in an external variable.
`with` supports a variety of objects:

```py
# Files: Automatically calls `.close()` when finished
with open(filepath) as f:
  ...
# Locks: Calls `.acquire` on __enter__, and `.release` on __exit__
with some_mutex:
  ...
# Databases: Begins a transaction on __enter__, and commits or rolls
#   back on __exit__, depending on whether an exception occurred.
with some_db_client:
  ...
```

C++ developers will see this and understand that we have *destructors* to manage
these kinds of things: Regardless of how the scope is exited (`throw`, `return`,
or even `goto`), the destructors of our local variables will be invoked
deterministically.

But here's a neat trick: Python's standard library contains a decorator called
`contextlib.contextmanager`
([Refer](https://docs.python.org/3/library/contextlib.html#contextlib.contextmanager)).
This function decorator transforms any (generator) coroutine into a context
manager object that can be used as the operand to a `with` statement:

```py
from contextlib import contextmanager

@contextmanager
def printing(msg: str):
  print(f'Entering: {str}')
  # Yield a value, making this into a coroutine function
  yield 1729
  print(f'Exiting: {str}')


with printing('coro context example') as val:
  print(f'Got value: {val}')
```

This program, when executed, will print:

```
Entering: coro context example
Got value: 1729
Exiting: coro context example
```

It works like this:

1. When we call `printing()`, the `@contextmanager` internals will return a
   special context manager object that initializes and manages a new generator
   coroutine created by invoking the decorated coroutine function.
2. When the `with` statement calls `__enter__` on the
   `@contextmanager`-generated value, the context manager performs the initial
   send (initial resume) to get the coroutine started.
3. When the coroutine execution hits the `yield` expression, the coroutine
   suspends and control passes back to the `__enter__` method, which receives
   the yielded value. The yielded value is then returned from `__enter__` and
   bound to the `with-as` variable `val`.
4. We run the inner block and print `val`
5. When we exit the `with` block, the `__exit__` method in the `@contextmanager`
   object resumes the coroutine again, expecting that it will return without yielding further.
6. The coroutine reaches the end of the function, and the `__exit__` method
   resumes again.

Importantly: A coroutine execution managed by a `@contextmanager` *must*
evaluate a single `yield` expression *exactly once*.

> Pedantic aside: A Python function that `yield`s is technically a *generator*,
> which is a Python coroutine of a specific flavor, and a "coroutine" usually
> refers to an `async def` function that `await`s, but this distinction is
> unimportant for our purposes.


# Language Envy

I've been writing a lot of C++ and Python code recently, and the
`@contextmanager` decorator is absolutely one of my favorite things in Python,
and I've found myself on multiple occassions wondered if I could get the same
thing in C++ using C++20's coroutines.

Skeptics may hear this and think this is pointless: We have destructors and RAII
in C++, which allow us to already perform arbitrary deterministic cleanup, so
why would we need something like this?

One important benefit of `@contextmanager` over a constructor-destructor (or
even a `try`/`finally`) pair is "*locality of code*":

```c++
struct file_scope {
  std::FILE* file;

  file_scope(const char* path)
    : file(std::fopen(path, "rb")) {}

  ~file_scope() {
    std::fclose(file);
  }
};
```

This is a fairly small example. but illustrates that there's some amount of
unfortunate separation between the "initialization" and "cleanup" code. A more
complex example might have the constructor and destructor implemented
out-of-line.

Another unfortunate effect would relate to storage of supporting state. Here's a
simple example for a reentrant database transaction guard:

```c++
struct recursive_transaction_guard {
  database_ref db;
  int n_exceptions = std::uncaught_exceptions();
  bool already_in_transaction = db.in_transaction();

  recursive_transaction_guard(database_ref db) : db(db) {
    if (!already_in_transaction) {
      db.begin();
    }
  }

  ~recursive_transaction_guard() {
    if (already_in_transaction) {
      // Do nothing
      return;
    }
    if (std::uncaught_exceptions() > n_exceptions) {
      // We're exiting with an error
      db.rollback();
    } else {
      // We're okay
      db.commit();
    }
  }
};
```

Here the associated state to track the database and exception state is stored as
additional member variables. It isn't intractible, but it feels a bit more
clunky than an equivalent in Python with `@contextmanager`:

```py
@contextmanager
def recursive_transaction(db: Database):
  if db.in_transaction:
    # Do nothing
    yield
    return

  db.begin()
  try:
    yield
    db.commit()
  except:
    db.rollback()
    raise

```

(In Python, the `@contextmanager` will cause the `yield` expression `raise` if
the associated `with` exits with an exception.)

One may also note that we have two `yield` expressionss in the above example,
depending on the state of the parameters. Remember that the requirement of
`@contextmanager` is that a single `yield` expression *evaluates once*, but not
that there only be one `yield` expression in the coroutine body. This is an
important facet of `@contextmanager` that opens up a wealth of possibilities:


```py
@contextmanager
def as_local_file(url: URL):
  'Get a locally-readable copy of the file at the given URL'
  if url.scheme == 'file':
    # The file is already a local file, so just yield that path
    yield Path(url.path)
  elif url.scheme == 'ssh':
    # Mount the parent directory using SSH
    with ssh_mount(url.with_parent_path()) as mount_dir:
      # Yield the path to the file
      yield mount_dir / url.path.filename
      # The SSH host will be unmounted on scope exit
  else:
    # Create a temporary dir that is deleted when we leave scope
    with temp_dir() as td:
      tmp_file: Path = td / 'tmp.bin'
      download_file_to(tmp_file, url)
      yield tmp_file
```

Now we have multiple completely different setup and cleanup behaviors depending
on the scheme of `url`. Could you implement this with C++? One could imagine:

```c++
struct as_local_file {
  variant<local_file_state,
          ssh_mount_state,
          download_tmpdir_state> _state;

  as_local_file(url u); // Initialize the correct state

  fs::path local_path();  // Get the path out of _state
};
```

(The implemenation of the various states is left as an exercise to the reader…
or you can read on…)

Wouldn't it be simpler if we could just do the same thing as in Python?

```c++
co_resource<fs::path>
as_local_file(url u) {
  if (u.scheme == "file") {
    co_yield fs::path(u.path);
  } else if (u.scheme == "ssh") {
    auto mnt = open_ssh_mount(u.parent_path_url());
    co_yield mnt.root / fs::path(u.path).filename();
  } else {
    auto tmpdir = make_tempdir();
    auto tmp = tmpdir.path / "tmp.bin";
    download_into(tmp, u);
    co_yield tmp;
  }
}

void print_content(url u) {
  co_resource<fs::path> local = as_local_file(u);
  fmt::print(read_file(*local));
}
```

In this example, `co_resource<T>` is a class template that implements the
same machinery as `@contextmanager` from Python.

Not only is `co_resource<T>` entirely implementable: It is remarkably simple!


# Implementing `co_resource`

A `co_resource` is the return type of a coroutine function that:

1. Runs the coroutine until the first `co_yield` expression.
2. Captures the operand of `co_yield` and suspends the coroutine.
3. The user of the resource can access the captured value using `operator*` and
   `operator->`.
4. When the `co_resource` is destroyed, the coroutine is resumed and expected to
   return without awaiting or yielding again.
5. The coroutine is destroyed.


## Getting Started with Coroutines

C++20 coroutines are intimidating at first: There seems to be a lot going on
compared to other language's coroutines. In Python all I have to do is call
`yield` and my function suddenly becomes a coroutine! In C++, it is not so easy.

In my opinion, here's a very important preqrequesite to begin understanding C++
coroutines:

You should mentally detach the relationship between the return value and the
body of the coroutine function: Including the return type itself!

Imagine a coroutine function:

```c++
coro_widget
my_lib::do_something(int arg) {
  // Code block containing 'co_await', 'co_yield', and/or 'co_return'
}
```

Traditionally, one would perceive `my_lib::do_something` as "a function that
takes an `int` and returns a `coro_widget`". But with coroutines, this is not
the the full picture. Instead, I recommend approaching with this mental model:

> `my_lib::do_something` is a *coroutine factory* that accepts an `int` and
> generates a coroutine, and then returns a `coro_widget` with a handle to that
> coroutine.

Importantly: The block of code associated with `do_something` is not necessarily
relevant in the creation of the returned `coro_widget` object! The types of the
operands of `co_await`, `co_yield`, and `co_return` are orthogonal to the actual
return value of `coro_widget`. Imagine it more like this:

```c++
struct __do_something {
  using return_type = coro_widget;

  // ... state data ...

  void __impl() {
     // Code block containing 'co_await', 'co_yield', and/or 'co_return'
  }
};

coro_widget my_lib::do_something(int arg) {
  auto co = new __co_magic<__do_something>{arg};
  return co->__create_return_value();
}
```

This omits a ton of important details and is partially psuedo-code (the body of
`__do_something::__impl` requires transforming the original coroutine function
body), but is a closer model of what actually happens. We'll fill in some of the
blanks below.


## The Return Type and the Promise Type

When the coroutine object is being constructed, there are several customization
points attached. The way these customizations are injected is via the declared
return type and parameter types of the coroutine function. In particular, the
compiler asks for the "promise type" via the `std::coroutine_traits` template:

```c++
using __promise_type =
  std::coroutine_traits<
          declared_return_type,
          param_types...>::promise_type;
```

One can specialize `std::coroutine_traits` arbitrarily, or rely on the default
definition, which simply asks for `promise_type` on the declared return type
itself. This gives us a simple beginning for `co_resource`:

```c++
template <typename T>
class co_resource {
public:
  struct promise_type {};
};
```

from here-on-out, the `promise_type` is fully in control of the coroutine, and
the actual return type and parameter types of the initial coroutine function are
not directly consulted again. Everything we want to do to control the coroutine
must be exposed via the `promise_type`.


## The Promise Object and the Coroutine State

The corountine's promise object and the opaque coroutine itself are
intrinsically linked together. The coroutine can be accessed via
`coroutine_handle<promise_type>`, and the promise can be accessed via the
`promise()` method of the coroutine handle. The promise object will live exactly
as long as the coroutine itself, and will not be moved or copied. To obtain the
coroutine handle, one simply calls the static named-constructor
`coroutine_handle<P>::from_promise(P& p)` with `P` as the promise type and `p`
being the generated promise object. Thus the promise object can get a handle to
its associated coroutine at any time:

```c++
void SomePromise::do_something() {
  std::coroutine_handle<SomePromise> my_coro =
    std::coroutine_handle<SomePromise>::from_promise(*this);
}
```

likewise, one can obtain a reference to the associated promise object with the
`.promise()` method of `coroutine_handle`:

```c++
void f(coroutine_handle<SomePromise> coro) {
  SomePromise& p = coro.promise();
}
```

One should think of `coroutine_handle` as a reference to an opaque coroutine
object. For `coroutine_handle<P>`, the coroutine's promise object is of type
`P`. A `coroutine_handle<void>` (a.k.a. `coroutine_handle<>`) is a reference to
a coroutine with an unknown promise type (and therefore the `.promise()` method
is not available).

Because a `coroutine_handle<P>` and the promise object `P` can be easily
obtained from one another, it helps to think of them as interchangeable objects
that provide interfaces to different aspects of the underlying coroutine. So if
your question is "should I use the `coroutine_handle<P>` or `P&` here?" the
answer is "either one," but storing the `coroutine_handle<P>` will often make
the code more concise as it is a trivial type and it is more terse in code to
obtain the promise via the handle than to obtain the handle via the promise.

The promise object is also the bridge between the coroutine and its caller. Any
state that we wish to be accessible outside of the coroutine body should be
declared as data in the promise type.


## Some Boilerplate

Any promise object needs to provide a few methods that control the
setup/teardown of the coroutine. For our case, these are not particularly
interesting, so we can use some simple defaults:

```c++
struct promise_type {
  auto initial_suspend() noexcept { return std::suspend_never{}; }
  auto final_suspend() noexcept { return std::suspend_always{}; }
  void return_void() noexcept {}
  void unhandled_exception() { throw; }
};
```

For the above:

1. On `initial_suspend()`, we tell the compiler that the coroutine should begin
   execution immediately before returning to the caller.
2. On `final_suspend()`, we do nothing interesting and always suspend the
   coroutine when exiting.
3. `return_void` is called in case of `co_return;` or reaching the end of the
   coroutine function body. This is a no-op.
4. If an unhandled exception occurs, immediately re-`throw` it. This will cause
   the exception to throw out of the most recent call to `resume()` on the
   coroutine (including the implicit one inserted by the compiler that may occur
   following `initial_suspend()`).


## Yielding a Value

We need to tell the coroutine machinery what to do when the coroutine evaluates
a `co_yield` expression. This, unsurprisingly, is controlled via the promise
object.

When a `co_yield` expression is evaluated, the operand is passed to the
`yield_value()` method of the promise object. This gives us a chance to send
that information back to the outside world. The return value of `yield_value()`
is then given to a synthesized `co_await` expression, which determines whether
or not to suspend the coroutine as part of that `co_yield`. In our case, we
*always* want to suspend following the yield, so we return `suspend_always`
again.

Because we are always suspending the coroutine after the yield, and the operand
value has a lifetime of the full `co_yield` expression, the operand will live
until the coroutine is resumed, meaning it is safe to store the address of the
operand directly without making any moves or copies. Here's what our
`promise_type` looks like with these changes:

```c++
struct promise_type {
  // ...
  const T* yielded_value_ptr;

  auto yield_value(const T& arg) noexcept {
    yielded_value_ptr = &arg;
    return std::suspend_always{};
  }
};
```

We're almost done. Now we just need to open up the communication channel between
the coroutine caller and the coroutine state. This is done using the *return
object* of the coroutine.


## The Return Object

After constructing the promise object, the next operation inserted by the
compiler is the construction of the "return object."

The return object is *not* the `co_return` value of the coroutine, but rather
the coroutine caller's interface to the coroutine itself. The declared return
type of the coroutine function is the type of the return object. It is the
return value of the coroutine factory's machinery that started the coroutine in
the first place.

The return object is obtained by calling the `get_return_object()` method on the
promise object. The return type of this method must be *convertible* to the
declared return type of the coroutine function. Note that the conversion takes
place *after* the `initial_suspend` (and possible initial-`resume()`): This fact
will be important.

Given that the `coroutine_handle` gives us access to all of the state, the
simplest way to implement the `co_resource<T>` is to store the coroutine
handle:

```c++
template <typename T>
class co_resource {
  // ...
private:
  // The coroutine we are managing
  coroutine_handle<promise_type> _coro;
};
```

Importantly, we want to perform exception handling as part of the construction
of the `co_resource`, but we need this to happen *after* the initial-suspend,
but *before* the coroutine return object is given to the caller. We do this by
taking advantage of the `get_return_object()` being converted to the actual
return object by using a simple intermediate type:

```c++
template <typename T>
class co_resource {
  // ...

public:
   struct init {
     std::coroutine_handle<co_resource::promise_type> coro;
   };

  // Impilcit convert from the intermediate object
  co_resource(init i)
    : _coro{i.coro} {}

  struct promise_type {
    // ...

    auto get_return_object() {
      // Create the intermediate object
      return init{coroutine_handle<promise_type>::from_promise(*this)};
    }
  }
};
```

Now we have a `co_resource` type that can be constructed, but how do we store
and access the managed resource? When do we finish the coroutine to clean up the
resource?

Firstly, to access the managed object: with the address of the yielded value
stored in the promise, and that promise being given to the `co_resource` via the
`coroutine_handle`, we can access that yielded value from the outside:

```c++
template <typename T>
class co_resource {
  // ...

public:
  const T& operator*() const noexcept {
    return *_coro.promise().yielded_value_ptr;
  }

  const T* operator->() const noexcept {
    return _coro.promise().yielded_value_ptr;
  }
};
```

Finally, to clean up: as part of the destructor of `co_resource`, we do the
final `resume()` of the coroutine to run the cleanup code:

```c++
template <typename T>
class co_resource {
  // ...
public:
  ~co_resource() {
    // Resume the coroutine from the co_yield point:
    _coro.resume();
    // Clean up:
    _coro.destroy();
  }
};
```

We now we are ready to use the `co_resource`:

```c++
co_resource<string> greeting() {
  fmt::print("Enter");
  co_yield "Hello!";
  fmt::print("Exit");
}

void foo() {
  co_resource<string> r = greeting();
  cout << *r;
}
```

Here's how `foo()` executes:

1. Enter the setup for `greeting()`
2. Create a coroutine state and `co_resource<string>::promise_type pr` object.
   These are stored in dynamic allocated state by default, but this allocation
   can be elided by a Sufficiently Smart Compiler.
3. Do `init __rv = pr.get_return_object()`
4. Because we asked the coroutine *not to* suspend initially, the coroutine
   begins execution.
5. We hit the `co_yield` in `greeting()`.
6. We pass the operand of `co_yield` to `yield_value()`
7. `yield_value()` stores the address of the argument in a pointer member.
8. We tell the coroutine to immediately suspend and return to the resumer as
   part of the `co_yield`.
9. The `__rv` object is returned from `greeting()`, causing the conversion from
   `init` to `co_resource<string>`, giving management of the coroutine to the
   `co_resource<string>`, now out-of-the-hands of the compiler's machinery. It
   is important that this conversion happens *after* the initial suspend and the
   first `co_yield` is hit, because if there is an exception *before* the
   `co_yield`, we do not want to give ownership of the coroutine to a
   `co_resource`, which would attempt to `resume()` the failed coroutine as part
   of its destructor.

If you run this code, you'll see "Enter" followed by "Hello!", then "Exit", and
that's all there is to it.


# What Else?

There's a few open questions with this simple implementation:

1. What about a `co_resource<void>`?
2. What about a `co_resource<T&>` (with a non-`const` reference)?
3. How can we assert that the coroutine yields *exactly once*?
4. If the user copies or moves the `co_resource` object, that will probably
   be very bad. What would move operations look like?
5. If the coroutine throws during the cleanup phase, this will
   `std::terminate()` since it occurs in the `noexcept` context of
   `~co_resource()`. Is this the best option? Why or why not?

I'll leave these as an exercise for the reader. You can see and use the
fully-finished implementation from `neo-fun`
[here](https://github.com/vector-of-bool/neo-fun/blob/develop/src/neo/co_resource.hpp).
