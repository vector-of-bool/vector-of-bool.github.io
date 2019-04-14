---
layout: post
title: Are C++ Modules Dead-on-Arrival?
desc: In which I check the vitals of C++ Modules
---

We can deduce the answer from Betteridge's law of headlines: *No*

But it's a bit more subtle than that.

> This is a follow-up to my prior post: [*C++ Modules might be
> Dead-on-Arrival*](/2019/01/27/modules-doa.html)


# Some Background

My last post had quite a sensational title, but it was neither an accident
nor a lie: I wanted to draw as much attention as I could, and I really do
fear for C++ Modules.

First and foremost, let me get this out of the way: I do not want C++
modules to fail. I do not know of anyone who wishes for them to crash and
burn. I *do* know people with serious concerns about modules. The purpose
of these posts is not to shoot down the modules work, but to make our
skeptical voices heard.

I cannot take sole credit for my prior DOA post. It's composition was a
collaborative effort and written in the span of only a few hours after
several SG15 participants felt a renewed panic about modules.

In particular, I'd like to shout out Isabella Muerte, Corentin Jabot, and
Rene Rivera for giving me continual feedback, proof-readings, and
corrections. Not only were they instrumental in formulating the post, they
are the people who made me privy to the Modules concerns circulating SG15.
They, Ben Craig, Mathias Stearn, Peter Bindels, and many others that I
haven't mentioned should be credited for leading the charge in SG15. All I
did was get lucky and formulate their concerns in a way that resonated with
people. In fact, several of the points I touched on were blogged about by
Isabella back in [October of 2017](https://izzys.casa/2017/10/millennials-are-killing-the-modules-ts/)! Other issues (especially ABI
concerns that I didn't even mention in the prior post) were discussed by
Corentin in [October of 2018](https://cor3ntin.github.io/posts/modules/).

The only newly mentioned work in my prior post was Rene's investigation on
the performance of modules. I wasn't even involved in this: I am just an
observer.

So what are *my* contributions to the Modules discussion? On a technical
level: virtually *nil*. All I could do was hope to spread awareness about
technical issues that I perceived as potentially fatal to the Modules
design. Why did my post get so much attention where Corentin and Isabella
saw lukewarm reception? I don't know. Maybe it was timing. Maybe it was the
provoking title. Maybe it was blind luck.

Bottom line is: I wrote the post **not** because I *hate* Modules, but
because I want to see Modules succeed! The post was to spread awareness
and hopefully urge others to action.

And it worked!

The post was published on January 27th and, within hours, Bryce Lelbach had
swooped into the middle of the action and began polling for times for an
SG15 teleconference. On January 31st, at 11AM PST, dozens of concerned
parties joined the first official SG15 teleconference.

I joined the meeting as a passive listener. I had nothing to bring that
others hadn't already begun spearheading prior to my involvement.

In addition to the regulars that I had been talking to for months, we saw
participation from many new parties. Much of the first teleconference was
spent getting everyone up-to-speed.


# The State of the ~~Union~~ Modules

Just a few days ago, the ISO WG21 Kona meeting concluded. I, unfortunately,
was not in attendance. I stayed back home with the rest of the ~~peasants~~
community, biting my nails `co_await`ing what would become of C++ Modules.

As someone not in attendance, I may not be the best authority to discuss
the results. I don't know all that happened in the meetings: I only know
what the end results were and have discussed them at length with people
that *were* actually present. Nevertheless, I felt it my obligation to
follow up on my prior post to make clear where we stand with regards to C++
Modules. I've collected a reasonable amount of information such that I feel
that can now make a well-informed post on the subject.

The headliners of Kona were clear: *Coroutines* and *Modules*. Both have
been approved for the IS (International Standard), and we will almost
certainly see them in C++20.

So what tweaks were made to Modules before merging them? As far as I have
been able to ascertain: *Almost nothing*.

Am I happy about this? No. Am I upset? No. Am I worried? *A little.* Am I
hopeful? *Yes.*

[Corentin wrote about Modules in his Kona trip
report.](https://cor3ntin.github.io/posts/kona2019/#modules). I encourage
all to read it.

So why am I be worried but not upset? Why am I hopeful? Well, there was
another big change done at Kona for which I am very excited and pleased:

> SG15 will be creating the *C++ Ecosystem Technical Report*.


## The *Technical Report*

So what is a "technical report" anyway? It may sound familiar: This
document type was used to introduce, experiment with, and standardize much
of the C++11 library additions prior to their official inclusion in the IS.

After C++11, *Technical Report* documents were replaced with *Technical
Specifications* for proposed features, and have been used to experiment
with many library and language proposals: Filesystem TS, Coroutines TS,
Network TS, Modules TS, etc.

So what is the intent of the Ecosystem TR? Unlike a TS, it is not destined
or intended to be merged into the IS. This gives additional flexibility to
all parties involved. Revisions to the TR can be performed and published on
a much shorter timescale than the main IS.

**Importantly,** the Ecosystem TR will be a normative document rather than a
jumble of "good ideas" that someone throws up on GitHub Pages. Build
systems, tools, and C++ implementations may opt-in to meet the requirements
outlined in the Ecosystem TR to claim additional compliance to a formal
standard beyond the requirements outlined in the IS.

So why might we want a TR over changes to the IS? In addition to moving
faster, we are not constrained by the IS scope, and implementers are not
required to follow it. This may sound like it defeats the purpose of a
standard, but it gives lenience to parties whose implementations might not
be able to meet the requirements of the TR while they can also to implement
the IS.


## The Scope of the Technical Report

I'm particular happy with going down the TR road as it allows SG15 more
legroom to work. Language like:

> If the platform supports `<ABC>`, then do `<XYZ>` else `<UVW>`

or:

> Implement one of `<Q>`, `<R>`, or `<S>`

will not fly in the international standard, but is fair game for the TR
(within reason: The TR must still be approved by formal vote).

So what aspects will be addressed by the TR? Well, potentially *anything*
that SG15 would like to include (and the governing body is willing to
approve). Most likely it will encompass various concepts related to tooling
around the language.

The C++ tooling ecosystem has been ignored by the IS for decades (for
better or worse), which has resulted in the proliferation of dozens of
incompatible tools and informal community conventions. With the TR, we will
be able to address things that have been deemed "out-of-scope" for the
IS such as the filesystem, shared libraries, build systems, package
managers, and binary distribution. Large projects like my [libman](https://api.csswg.org/bikeshed/?force=1&url=https://raw.githubusercontent.com/vector-of-bool/libman/develop/data/spec.bs), smaller aspects like Isabella
Muerte's [Module Partition Lookup](https://wg21.link/p1302r1), or
Corentin's desire for [filesystem-oriented module mapping](https://cor3ntin.github.io/posts/modules_mapping/) can all be included. All three
of these projects might be deemed beyond the scope of the IS since they
specifically discuss filesystem layouts and directory structures.

SG15 will not be going too far down the rabbit hole of TR possibilities
before C++20 is finalized. In the TR presentation given at Kona, the
following points were called out as candidates for inclusion in the TR
before/with C++20:

- Module name <-> Module header unit name mapping
- Module name <-> BMI mapping
- Module naming
- Guidelines for BMI implementations strategies
- Guidelines (maybe format) for shipping modularized closed source libraries
- Guidelines for linux distributions (maybe)
- Guidelines/format for handling legacy header units
- Guidelines for using modules:
  - ABI concerns/hashing
  - Not authoring modules for 3rd party code


## The TR and Modules

There have been several proposed fixes and tweaks to C++ Modules that would
address many of the concerns SG15 has raised. Two things make the proposals
prime candidates for inclusion in the ecosystem TR:

1. The work addresses aspects of the platform beyond the "abstract
   machine," which often makes things "out-of-scope" for the language and
   library standard.
2. *None of the proposals create fundamental changes to the C++
   language*.

Point #2 is the real kicker here: Proposals to "fix" Modules for tooling
have rarely focused on changing the C++ language itself. Instead, they
focus on specifying what is *implementation defined* behavior in the
language standard.

For example, `import foo.bar;` causes the `foo.bar` module to be loaded,
but there are absolutely zero guarantees or restrictions in the IS on
*how* that import is resolved. The Ecosystem TR can specify *exactly* how
that import is resolved. An implementation conforming to the TR will
perform as specified by the TR, but an implementation can still implement
C++ and provide some other method of looking up the module.

Imagine `meow.cpp`:

```c++
module;

import animals;

export module dog;
```

We have module `dog` defined in `meow.cpp`! That's crazy, but completely
allowed by the IS! The TR can't declare the code itself broken, but can
request that implementations and tools not support such use cases.


# Why Worry?

I said that I'm still somewhat worried about Modules. With an Ecosystem TR,
we have a good chance of formalizing the tweaks and restrictions we'd like
to see for the most common C++ Modules implementations. As I mentioned, the
TR is normative, but not *mandatory* for C++ conformance. Its up to tools,
compilers, linkers, build systems, operating systems, and even C++ *users*
to play ball and honor the TR within the constraints of their platform.

Given the aforementioned spread of mutually incompatible tools and
conventions, I can't say I'm certain people will concede to the TR
document. We'll have to wait and see.

Nevertheless, (I am told that) the proposal for the TR was very well
received by parties present in the Kona meetings, including implementers of
tools and compilers alike.

I have hope. I have worry. A bit of both.

I believe the Ecosystem TR is one of the biggest developments in years for
C++. I believe **it could be at least as significant as the merging of
Coroutines and Modules**, as long as SG15 is able to produce good work and
the community participates.


# What Else?

In my prior post I also expressed my concern (and a concern shared by many)
about the effectiveness of SG15. I'm happy to say that we will now be
seeing regular SG15 meetings via teleconference! I also fear for Bryce
Lelbach, who is now acting as SG15 chair. All that work can't be good for
one's mental health!

[So: are C++ Modules dead?](https://www.youtube.com/watch?v=Sh8mNjeuyV4)
