---
layout: post
title: The Dumbest Allocator of All Time
comments: true
desc: In which a silly joke made in a chatroom becomes a serious contender for
    a good idea
---

Recently, I was casually watching a conversation on the C++ Slack about ways
one might implement the global `::operator new` or `malloc` for a program. I,
being a thoughtful and useful contributor to technical discussions, interjected
with my brilliant idea for implementing `malloc()` and `free()`:

```c++
void* malloc(size_t size) {
    return (void*)rand();
}

void free(void*) {
    // lol
}
```

I am quite proud of my creation, as I believe this is *The Stupidest Allocator
of All Time*. You'll note my use of the word "stupid," but not "dumb" as in
the title of the post: We'll be coming to that shortly.

Does my `rand-malloc()` actually work? Eh... it depends on two big factors:

1. Does your architecture support unaligned access? Using unaligned pointers is
   undefined behavior by the standard, but some architectures support it. There
   is no alignment in the `rand-malloc()` allocator. On architectures with
   alignment requirements, you will get a fault from the CPU and a signal sent
   to your program, terminating it.
2. Have you mapped the entire address space accessible by the lower bits of a
   pointer that are filled by an `int`? If not, you will get a fault when
   `rand()` returns you an integral value corresponding to an unmapped address,
   and your program will be terminated with `SIGSEGV`.

So, maybe, under the perfect conditions, we will be able to make
`rand-malloc()` actually usable... for a little while. Eventually (and probably
sooner rather than later), someone will throw you [a surprise birthday
party](https://en.wikipedia.org/wiki/Birthday_problem).

`rand-malloc()` is a fun joke, and even fun to think about as an armchair
experiment, but entirely useless in the end. For this reason, I call
`rand-malloc()` "stupid."

In response to point #2 above, I said "You'd need to map a huge amount of
memory for it to work, but overcommit might help you there."

And then, *a lightbulb.*


# Overcommit!

<div class="aside warning" markdown="1">
Update: It has been pointed out that I am conflating the work of overcommit
and kernel memory page accounting. Overcommit is not *required* for my
"dumbest allocator," but it will still help when you are running low on
memory. Even on modern systems without overcommit enabled, you will still
see physical memory occupied only as your program makes use of it on-demand.
</div>

The trigger word was "overcommit." For those unaware, *memory overcommit* (in
the context of operating systems) is a design of a kernel to grant access to a
process some amount of the memory address space for which it may not actually
have sufficient free space in physical RAM. Combined with  In other words:

1. I have 10MB of free RAM
2. My program asks for 50MB
3. The kernel *doesn't care* that there's not enough space. It "maps" a
   contiguous range of the address space (a range of memory addresses/pointers)
   for that process and gives it permission to use that space. It doesn't even
   reserve any space in physical RAM for the process. If you look at the memory
   usage for the process you won't see it increase at all. The memory is
   "overcommitted."
4. When my program accesses a page in the mapped address space which has been
   "overcommitted," the CPU will signal to the kernel that there is no place in
   RAM corresponding to that address.
5. The kernel will then see that I *do indeed* have the permission to access
   that page, and it will select a *physical* page in *physical* RAM to map the
   *virtual* page to. That page in memory is now "committed" or "resident."
6. Control returns to my program as if nothing happened, and the read/write to
   the address goes uninterrupted.
7. When I attempt to use more than 10MB of pages, the kernel sees that every
   page in phyiscal RAM is now occupied, and it has a limited options. It's too
   late to fail the allocation, since we've already given the address range to
   the process, so there are a few things to try and free pages from RAM:
    1. Begin "paging out" pieces of memory. The kernel will move some parts of
       memory to non-volatile storage (i.e. the Windows *pagefile* or Linux
       *swap*). This can create *massive* performance degradation.
    2. Start killing processes. This isn't necessarily a bad option if you
       really hate swap. If you have your swap/pagefile disabled or full, this
       will probably start happening.

> Note: This description may or may not be 100% accurate, and is simplified
> from the actuality. I'm not an OS developer. Please offer corrections if you
> know better. *However*, it is sufficient to continue on to learn about *The
> Dumbest Allocator of All Time*.

There's one more important thing to note: When you request more memory from the
operating system, it returns you a *contiguous* area. This will be important
later.

# A Dumb Allocator

C++17 introduced the concept of "memory resources." This may sound like a fancy
way of saying "allocator," and you'd be correct. The difference is that in C++,
`Allocator` (with a capital A) is a bit different: [An `Allocator` is an object
that provides a handle to a
_memory resource_](https://www.youtube.com/watch?v=IejdKidUwIg). We give
containers an `Allocator`, but we don't directly give them the *memory
resource* (we give it to them indirectly *via* the `Allocator`).

Amongst the memory resource library is a class called
[`monotonic_buffer_resource`](https://en.cppreference.com/w/cpp/memory/monotonic_buffer_resource). It is a
truly "dumb" allocator. The word "monotonic" in this case means that is just a
*bump pointer* allocator. That is:

1. It starts with a pointer at the beginning of a buffer.
2. Each time you request `N` bytes of memory from the resource, the pointer is
   moved forward `N` bytes (plus some alignment) and the old value of the
   pointer is returned.
3. When you *deallocate* a pointer, *nothing actually happens.*
4. When you are finished with the resource, *then* the buffer is destroyed.

The "monotonic" or "bump pointer" allocation strategy is related to the concept
of *arena* allocation, wherein memory isn't released until all objects within a
single region are deallocated. Although related, they aren't the same thing.

Reading the above description I think you'd agreed that the monotonic
allocation strategy is "dumb," but not "stupid." The performance metrics speak
for themselves: Monotonic allocators are _fast_.

The `monotonic_buffer_resource` isn't the *dumbest*, however: When the bump
pointer reaches the end of the buffer, instead of giving up, the resource will
ask the "upstream" resource for another  buffer to continue its shenanigans.
This has a cost. I think we can do better.

We need to go *dumber.*


# The *Dumbest* Allocator

I mentioned that `monotonic_buffer_resource` will check if it has reached the
end of the buffer, then ask for an additional buffer. What if we could remove
this check? What if we could make a monotonic allocator that *just kept moving
the pointer without checking?* What if we could make a monotonic allocator that
*never needs to ask for additional space?*

Spoiler alert: I made one.

And it is very dumb.

I'm certain I'm not the first to come up with this idea, but I'm the first I've
heard about. Maybe someone out there will tell me why my idea is very *stupid*.

## Let's Start With `::mmap`

In Linux `::mmap` is the system call function used by your standard library
implementation to request memory from the operating system.

> For pedants: Yes, I'm aware of `::sbrk()`. Let's not talk about that one.
> It has hurt me in the past.

An `::mmap` call might look like this:

```c++
void* buffer = ::mmap(nullptr,
                      want_size,
                      PROT_READ | PROT_WRITE,
                      MAP_PRIVATE | MAP_ANONYMOUS,
                      -1,
                      0);
```

These are the arguments:

1. `nullptr` - Give an allocation hint of where we want the kernel to put the
   new pages. We don't care, so we give `nullptr`.
2. `want_size` - Give a number of bytes that we want the kernel to map for us.
3. `PROT_READ | PROT_WRITE` - Set the memory protection levels. Here we request
   read access and write access.
4. `MAP_PRIVATE | MAP_ANONYMOUS` - Mapping attribtues. `MAP_PRIVATE` means we
   are only allocating for our own process (not shared memory). `MAP_ANONYMOUS`
   means we aren't mapping a file. (`::mmap` is also used for memory-mapping
   files).
5. `-1` - A file descriptor to map. We aren't using this, so we pass `-1`
6. `0` - Offset in the file to map. Unused

When we are done with the pages, we tell the kernel to unmap the pages with `::munmap(buffer, want_size)`.

With this knowledge, we can build the first piece of our violently dumb allocator:

```c++
// dumb_allocator.hpp
class mapped_area {
    std::size_t _size = 0;
    void*       _area = nullptr;

public:
    explicit mapped_area(std::size_t size);
    ~mapped_area();

    std::size_t size() const noexcept { return _size; }
    char*       data() const noexcept { return static_cast<char*>(_area); }
}
```

```c++
// dumb_allocator.cpp
mapped_area::mapped_area(std::size_t size_)
    : _size(size_) {
    // Get that memory!
    _area = ::mmap(nullptr,
                   size(),
                   PROT_READ | PROT_WRITE,
                   MAP_PRIVATE | MAP_ANONYMOUS,
                   -1,
                   0);
    if (_area == MAP_FAILED) {
        throw std::bad_alloc();
    }
    // mprotect() the tail so that we can detect running off of it
    auto tail = data() + size() - ::getpagesize();
    auto rc   = ::mprotect(tail, ::getpagesize(), PROT_NONE);
    if (rc) {
        ::munmap(_area, size());
        throw std::system_error(std::error_code(errno, std::system_category()),
                                "mprotect() failed");
    }
}

mapped_area::~mapped_area() {
    if (_area) {
        // Give that memory back...
        ::munmap(_area, _size);
    }
}
```

> Don't worry about the `::mprotect()` stuff. That's just some safety to catch
> running-off-the-end.

It's pretty simple. I've defined `mapped_area` constructor and destructor
out-of-line in a `.cpp` file even though they're very small and simple. This
allows the implementation to be replaced easily on different operating systems
where requesting pages is done differently.


## A Dumb Memory Resource

We can implement a memory resource that builds upon the mapped area.

> I won't implement an exact C++ PMR memory resource, just the minimum I need
> to work with a traditional `Allocator`.

```c++
template <std::size_t Alignment = sizeof(std::max_align_t)>
class bumping_memory_resource {
    std::atomic<char*> _ptr;

public:
    template <typename Area, typename = decltype(std::declval<Area&>().data())>
    explicit bumping_memory_resource(Area& a)
        : _ptr(a.data()) {}

    constexpr static auto alignment = Alignment;

    void* allocate(std::size_t size) noexcept {
        auto under         = size % Alignment;
        auto adjust_size   = Alignment - under;
        auto adjusted_size = size + adjust_size;
        auto ret           = _ptr.fetch_add(adjusted_size);
        return ret;
    }

    void deallocate(void*) noexcept {}
};
```

The `bumping_memory_resource` doesn't take a `mapped_area` directly: Instead it
takes an instance of any object that has a `.data()` method returning a `char*`.

The implementation of `allocate()` is very simple. First we adjust the
requested size to compensate for alignment requirements, then we atomically
increment our "bump pointer" and return the previous pointer value. The atomics
guarantee that multiple threads may allocate from this resource in parallel
safely.

## The Dumbest Allocator

The actual `Allocator` that we define isn't even interesting:

```c++
template <typename T, typename Resource = bumping_memory_resource<>>
class bumping_allocator {
    Resource* _res;

public:
    using value_type = T;

    static_assert(alignof(T) <= Resource::alignment, "Given type cannot be allocator with the given resource");

    explicit bumping_allocator(Resource& res)
        : _res(&res) {}

    bumping_allocator(const bumping_allocator&) = default;
    template <typename U>
    bumping_allocator(const bumping_allocator<U>& other)
        : bumping_allocator(other.resource()) {}

    Resource& resource() const { return *_res; }

    T*   allocate(std::size_t n) { return static_cast<T*>(_res->allocate(sizeof(T) * n)); }
    void deallocate(T* ptr, std::size_t) { _res->deallocate(ptr); }

    friend bool operator==(const bumping_allocator& lhs, const bumping_allocator& rhs) {
        return lhs._res == rhs._res;
    }

    friend bool operator!=(const bumping_allocator& lhs, const bumping_allocator& rhs) {
        return lhs._res != rhs._res;
    }
};
```

Our bumping allocator doesn't use `bumping_memory_resource` directly. It takes
a template parameter to the real resource to use, and just calls `allocate()`
and `deallocate()`. We also `static_assert` that `T` is sufficiently aligned
by the alignment requirements of the memory resource.

Those who have written pre-C++17/14 Allocators will be happy to find that the
C++14/17 Allocator requirements are much easier to satisfy. No longer do you
need to pull teeth and sacrifice goats to get a useful Allocator.

In truth, none of the above classes really represent *The* Dumbest Allocator,
but all three of them together combine their forces to make this:

```c++
// Map some memory
mapped_area             area{1024ull * 1024ull * 1024ull * 20ull};
// Create a resource
bumping_resource<>      mem{area};
// Create the proto-allocator that we will hand out. The Dumbest Allocator.
bumping_allocator<void> proto_alloc{mem};

// How to use our allocator:

// A string type using our allocator:
using string = std::basic_string<char, std::char_traits<char>, bumping_allocator<char>>;
// A std::list using our allocator:
std::list<string, bumping_allocator<string>> my_list{prot_alloc};
// Fill the list:
for (auto& str : {"Hello,", "C++", "World"}) {
    my_list.emplace_back(str, proto_alloc);
}
```

Nothing seems particularly odd about this, but those with a keen eye may have
noticed something strange on the first non-comment line when we initialized our
`mapped_area` at the top above:

> *WE ASKED FOR 20GB OF SPACE*

And here we return to the lightbulb moment: *Overcommit*

Even though I don't have 20GB of available memory on my entire system (I only
have 16GB of physical RAM total and I don't have swap enabled), the kernel
happily and immediately returns a pointer to the space that we requested. In
fact, I am able to request up to *30GB* of contiguous space before the kernel
bawks at me. In addition, I can map 12,872 regions of 28GB without the kernel
minding one bit. That is *360,416GB* of mapped address space, which is a bit
more than the RAM I have available in my desktop.

Because of overcommit, no pages in physical RAM will actually be occupied
until we start making use of the pages we've mapped. In this way, we are able
to allocate impossibly large segments of memory and set a bump pointer at the
beginning and just... go.

As we start using pages, you'll see the memory usage of your process rise. The
memory usage won't return to normal until the destructor of the `mapped_area`
when we call `::munmap` to return those pages to the kernel.

> "*You've just moved memory management to your kernel!*"

I know, but even if we didn't map an enormous size we'd still be relying on
overcommit. The kernel won't allocate phsyical pages until you start using
them. We're going to be paying the penalty of the page fault whether we want it
or not, so why waste it?

> "*This won't work with any **real** programs.*"

Won't it? `malloc()` and `::operator new` are one-size-fits-all allocators.
Sometimes we may want to break out a specialized tool for a specialized task.
Perhaps you have an extremely hot inner loop that performs heavy allocations.
How would that look using our dumb allocator?

```c++
void do_work(workload& work) {
    // Map the area at the top scope
    mapped_area area{16_gb};
    for (auto& work_item : work) {
        // Create the memory resource and allocator
        bumping_resource<>      mem{area}:
        bumping_allocator<void> proto_alloc{mem};
        // Do the inner loop work.
        process_work_item(work_item, proto_alloc);
    }
}
```

The scoping in the above example is important:

1. The `mapped_area` does no allocation work of its own. It simply owns an area
   that we have `::mmap`'d from the kernel.
2. When we construct the `bumping_resource` from the area, it starts its bump
   pointer at the beginning of the region.
3. The `proto_alloc` is passed on to where the real work is done.
4. When the loop body finishes and we go around for another item, we run the
   destructor for `bumping_resource`, which *does nothing.*
5. Because the `mapped_area` lives outside the loop, we don't `::mmap` and
   `::munmap` on each iteration. The same address range is mapped for the
   entire duration of the `do_work()` function.
6. Because we construct a new `bumping_resource` *inside the loop*, each
   iteration of the loop *starts the bump pointer at the beginning of the
   region*.

Because of this scoping, we have the following implications:

1. We only pay the penalty of page faults the first time around the loop
   (assuming each iteration allocates roughly the same amount)
2. We will never actually commit any pages more than are required by the one
   loop iteration that does the most allocations. The size of `work` does not
   effect the amount of physical memory we require.
3. We only pay for the syscall at entry and exit from `do_work()` since we
   allocate the entire address range up-front.


# Wrapping Up

This all started with a really dumb quip about a `rand-malloc()`, a silly and
totally useless idea. Maybe we should have more of those to draw inspiration?

I can definitely say that my allocator is *dumb*, but I can't yet say whether
it is *stupid*. Maybe someone out there will see an immediate use case for
this. Maybe not. Let me know.

Also, Allocators aren't that difficult any more.
