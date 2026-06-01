# Identity Foundation — Executive Summary

**For:** Product leadership · **Date:** 2026-06-01 · **Full detail:** `drift-map.md`
**In one line:** The part of the app that decides *who a user is and what they're allowed to do* was
built for an older product vision than the one we're now heading toward — and the gap is wide enough that
we should redefine the target before writing more code. Being pre-launch (no real users) makes this
cheap to fix now and expensive to defer.

---

## The situation

Underneath the app sits a "foundation" that answers a handful of make-or-break questions: who owns an
account, how a family is grouped, who is a parent vs. a child, what each person is allowed to do, who pays,
and how we handle consent for minors. Everything else — billing, privacy, security, the screens people
see — rests on it.

That foundation was designed around one specific picture: **a parent owns the account and manages their
11–15-year-old children, who have no login of their own.** The product is now drifting toward something
broader — children (and tutors) who can have their *own* logins and identities. The foundation has not
kept up, and neither has our documentation. We checked all three things that should agree with each other —
the product intent, the written specs, and the actual code — and found they have quietly drifted apart.

The most important finding is not any single bug. It is that **a capable system was built for a problem
statement nobody ever wrote down.** There is no agreed, ratified product definition for the new direction
to measure against. That missing definition is the real work ahead.

## What we found

- **The old model is baked in everywhere — code *and* documents.** This isn't "the docs are out of date."
  Both describe the same outdated parent-owns-everything world, so a reader has nothing current to trust.
- **A half-built "new foundation" exists but is connected to nothing.** An earlier attempt added new
  database structures (for organizations, memberships, individual logins) but wired none of them in. It is
  dead weight today and should be cleanly removed, not extended.
- **There are four different, overlapping ways the app tracks "who is the owner/role."** They've grown up
  side by side. The rebuild needs to collapse them into one — a bigger job than simply renaming a field.
- **The single biggest risk is child-privacy law** (COPPA / GDPR). See below — it is serious enough to
  call out on its own.

## The one risk to take seriously now: consent for children with their own logins

Today's consent system assumes a **parent owns the account** and approves on a child's behalf by email.
The moment a child can have *their own login*, that assumption collapses, and we have **no design and no
legal position** for it. Concretely, this is already causing real problems we can see in the product
today:

- When a child registers on their own and their parent approves consent by email, **the parent is shown a
  promise that they can withdraw consent "any time from the parent dashboard" — and the system literally
  cannot let them do it.** That is both a broken promise in the UI and a likely GDPR violation.
- In that same situation, the software ends up treating **the child as their own consent authority** — the
  opposite of what the law requires.

This area needs a deliberate product decision *and* a legal review **before** any related code is built.
It is the gate the whole rebuild waits on.

## What's already broken for real users today

These are confirmed, not theoretical:

- **A child using a parent's account cannot actually use the core learning features** — the system blocks
  them from starting a lesson, sending a message, or creating a subject. The one persona the app visibly
  invites is dead-ended.
- **Children (non-owners) cannot export or delete their own data, or leave with it** — gaps in basic data
  privacy rights.
- **"Graduating" a child onto their own account is impossible** in the current code, even though the
  product story assumes it.
- **A child's progress reports silently stop being generated if the parent turns off notifications** — the
  child's progress screen can end up permanently empty, with no way for them to fix it.
- Several smaller dead-ends (e.g. a wrong birth date can never be corrected; removing a child from a plan
  is permanent with no undo).

## The opportunity

We are **pre-launch with zero real users.** That means we can define the right model and **rebuild it
cleanly**, then reset our test data — instead of performing a slow, risky migration on live customer data.
This is the cheapest this problem will ever be to fix. The decision to take this "clean rebuild" path has
already been made; this analysis confirms it is the right one.

## Conclusion and recommendation

The foundation is not lightly broken — it is built for a product we are no longer building. The fix is not
a patch; it is a deliberate, product-led redefinition followed by a clean rebuild. The sequence we
recommend:

1. **Lock the product intent first (your call, with the team).** A short list of decisions only product
   can make — see below. Everything technical flows from these.
2. **Design the new model from that intent**, then build it cleanly and reset test data.
3. **Get a legal read on child consent** in parallel — it is on the critical path.

A small number of genuinely independent fixes (e.g. a silent payment-failure notification, a missing
language setting) can proceed now without waiting. Everything tangled up with identity should wait for the
new model so we don't build twice.

## What we need from you (the decisions only product can make)

1. **Who is the target user now** — still parent-managed 11–15-year-olds, or have we genuinely broadened to
   tutors, co-parents, and teens with their own accounts? Everything depends on this answer.
2. **What each role is allowed to do** — a simple, agreed list of permissions for "owner," "mentor," and
   "student." None exists today.
3. **How consent works when a child has their own login** — the legally load-bearing question above.
4. **A few structural rules** — can a child "graduate" to their own account; can someone belong to two
   families/groups at once; is the ~13 age cutoff a product choice or a legal one.

Until those are answered, no new foundation code should be written.

---

*Confidence note: these findings were produced by a structured, multi-pass review in which every factual
claim was independently re-checked against the actual code and documents. The error rate on those checks
was effectively zero, so the conclusions here are well-grounded, not impressions.*
