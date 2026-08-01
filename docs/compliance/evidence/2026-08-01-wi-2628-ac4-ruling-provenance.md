# WI-2628 AC-4 — ruling provenance and acceptance-criteria delta

**Date:** 2026-08-01
**Recorded by:** BID-35 delivery shepherd, on a Programme Management ruling of the same date
**Item:** WI-2628 — Fail closed on multilingual clinical inferences in persisted learning text

## Why this note exists

WI-2628's ratified Acceptance Criteria field says one thing about user-authored ambiguous
text. The shipped implementation deliberately does another, because an operator ruling
issued after the criteria were ratified reversed that position. Both are correct: the
criteria are correct as a record of what was agreed on the day they were written, and the
implementation is correct as a record of what was subsequently ruled.

**Ratified acceptance-criteria text is not rewritten after the fact, even when a ruling
dictates the change.** Editing the field would erase the disagreement and, with it, the
evidence that the change was deliberate and authorised. This note is the durable record of
the delta instead, and is referenced from the completion summary so a reviewer meets the
explanation before meeting the discrepancy.

## The exact delta

**AC-4 as ratified** requires, among the fail-closed cases:

> Missing producer, unavailable/malformed judge, user-authored ambiguous, and
> migration/backfill ambiguous all block without external disclosure.

**The operator ruling of 2026-07-26 supersedes the third of those four.** User-authored
ambiguous learning text is referred to the independent judge rather than blocked outright.
The other three fail-closed cases are unchanged and remain in force.

**What moved, precisely:**

| Case | AC-4 as ratified | Governing behaviour after the ruling |
|---|---|---|
| User-authored, ambiguous | block | **refer** — judged, with no producing vendor to exclude |
| User-authored, known-person attribution | block | block (unchanged, deterministic) |
| LLM with a missing or blank producer vendor | block | block (unchanged) |
| Judge unavailable or malformed | block | block (unchanged) |
| Migration / backfill ambiguous | block | block (unchanged) |

Only the first row moved, and it moved to the judge — **not** to allowed.

## Why the ruling was made

Wiring the multilingual gate at user provenance without this change narrowed a capability
the shipped English-only guard deliberately allowed: a learner writing a definitional note
such as a plain statement of what dyslexia is would have received a rejection where the
previous guard permitted it. The guard's own header describes its intent as blocking
Article 9 characterisations "while allowing educational discussion of those terms", so
blocking that text was a genuine loss of learner capability rather than the closing of a
hole. Referral preserves both the multilingual safety gain and the capability.

## Where the ruling is ratified

The ruling is not held only in this note. It is carried in canon:

- `docs/adr/MMT-ADR-0036-mentor-notice-mvp-boundaries-and-server-authority.md` — the
  2026-07-26 amendment, whose sections 2.4 and 4.6 state the current contract rather than
  the superseded 2026-07-22 wording.
- The ruling is recorded on the WI-2628 Cosmo row as an operator comment dated 2026-07-26.

## Where the implementation encodes it

`apps/api/src/services/learning-text-safety/referral.ts` models the referral payload as a
discriminated union on origin, and cites the ruling by date at the type. The two origins
carry different independence declarations: an LLM referral cannot be constructed without a
producing vendor, so the fail-closed rule for an unknown producer is a type-level guarantee
rather than a runtime check; a user referral has no vendor field at all, so it cannot
supply one, because inventing a producer for a learner's own writing would be a falsehood
the judge router would then act on.

## Scope of this note

This note records provenance for a single criterion of a single work item. It does not
amend the Acceptance Criteria field, does not alter canon, and confers no authority beyond
explaining a known and authorised divergence. Should the ruling itself ever be revisited,
this note becomes the record of what was in force between 2026-07-26 and that revision.
