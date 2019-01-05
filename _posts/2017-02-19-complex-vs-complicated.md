---
layout: post
title: Complex != Complicated
comments: true
desc: >
    In which I make a small rant trying to distinguish two (seemingly)
    equivalent terms
---

<div class="aside note" markdown="1">
# What's This?

This is an excerpt from a guide to CMake I am writing and hope to someday
finish. With "real life" getting in the way, finishing such a project could
take an inordinate amount of time. Until then, here's a blip that I wanted to
get out into the wilds of the internet for scrutiny.
</div>

# "Complex" != "Complicated"

I'd like to take an aside to discuss two commonly interchanged words: "complex"
and "complicated". I'd assert that the two words, while commonly considered
equivalent, are - in fact - quite different.

## What is "Complex"?

Something *complex* is something composed of many interconnected interacting
components. Having a *full* understanding of a *complex* system requires
having at least a high-level understanding of its constituent components, but
having a high-level understanding of such a system rarely requires
understanding each underlying component in detail.

This is the primary idea behind *abstraction*. When we wish to hide the
complexity associated with a system we make the components of the system opaque
and reliable. Still, this does not remove the fact that the underlying problem
or corresponding solution may be *complex*.

As an example, most high-level languages feature garbage collection, which is a
very *complex* solution to a very *complex* problem. Still, we do not bemoan
a garbage collector for being *complex* (unless you have the delightful task of
*implementing* garbage collection, then you have a free pass to bemoan its
complexity while you struggle with the intricacies involved with building that
complex system).

We can attribute a quality of *complexity* to a problem or system, and when it
surpasses some arbitrary threshold, we say that it is *complex* problem or
system.

One thing to keep in mind is that *complexity* is not intrinsically *bad*. For
this reason, I avoid saying something is "too complex" as too imply that its
complexity should be reduced below some arbitrary threshold. When I wish for
something to be less complex, I prefer another word:

## What is "Complicated"?

Here, when I say "complicated", I use it as the past-tense form of the verb
"complicate". When we *complicate* something, we introduce *complexity* which
was not already there, and we often imply that such additional complexity was
not required. A system that is *complicated* is also *complex*, but that
complexity has been introduced by some other person or system (usually
unnecessarily).

Being *complex* is an intrinsic property of a problem or system, but
being *complicated* means something that has been added (for the worse).

For this reason I prefer to keep a distinction between "complex" and
"complicated", and will avoid using the one term when I really mean the other.

## How Does this Affect Me?

Here is an aphorism taken from Tim Peters's *The Zen of Python*:

>*Simple is better than complex.* \
>*Complex is better than complicated.*

We should strive for simplicity. Abstractions are meant to make complex things
simpler, and a good abstraction will succeed in doing so, even if some
complexity remains. Just because some complexity remains in an abstraction
doesn't mean the abstraction has failed: it may mean that the underlying
problem is too complex to allow trivial solutions. Complex problems demand
complex solutions.

Too often we will throw up our hands a decry something as "unnecessarily
complex," when such complexity is demanded by the underlying problem. Instead,
we should learn to recognize when something has been *complicated* and work to
remove (and avoid adding) any unneeded complexity.