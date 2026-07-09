# MMT-ADR-0005 — Book mastery is stamped by an atomic conditional `UPDATE`, never a read-then-write

**Status:** Accepted (Topic-mastery three-states, 2026-05-30) · **Formalized:** 2026-06-03 (Phase-C seed) · **Scope:** Retention / mastery data model · **Deciders:** PM + Claude · **aka** `docs/plans/2026-05-30-topic-mastery-three-states.md` §"Key design decisions" #7

> **Provenance note:** this is one of the three Phase-C seed ADRs. It is the clearest case for *why* the decisions layer matters: a **correctness constraint** that prevents a permanent data bug, documented in exactly **one plan** and **enforced by no test and no type**. Promoting it to an ADR makes the constraint addressable and attaches the regression-test obligation it never had (see Consequences).

## Context

Topic mastery and book mastery are modelled as **sticky flags** (`retention_cards.mastered_at`, `curriculum_books.mastered_at`) — set once, never cleared — kept orthogonal to the SM-2 review schedule (a topic can be both *mastered* and *review-due*). A book is **Mastered** when **every non-skipped topic in it is topic-Mastered**.

The hazard is in *how* the book flag gets stamped. Stamping happens as a side effect of the verify that masters a topic: "if this verify just mastered the last outstanding topic, stamp the book." The naive implementation reads the sibling topics, checks them all in application (JS) code, then writes `curriculum_books.mastered_at`.

**That read-then-write races.** Two sibling topics verifying concurrently each read the *other* as still unmastered, each concludes "the book isn't done yet," and **neither stamps it** — so the book is **permanently never marked Mastered**, even though all its topics are. It is a lost-update race with a permanent, silent failure mode (the repo's banned "false confidence" class).

## Decision

**`curriculum_books.mastered_at` is stamped by a single atomic conditional SQL `UPDATE`** that sets the flag **only if `NOT EXISTS` an unmastered, non-skipped topic** in the book, evaluated inside the database in the same statement — never by an application-layer read-then-write.

```sql
UPDATE curriculum_books
SET mastered_at = now()
WHERE id = $bookId
  AND mastered_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM retention_cards rc
    JOIN curriculum_topics ct ON ct.id = rc.topic_id
    WHERE ct.book_id = curriculum_books.id
      AND ct.skipped = false
      AND rc.mastered_at IS NULL
  );
```

The `NOT EXISTS` predicate is evaluated atomically against committed state, so concurrent sibling verifies cannot each see a stale "still unmastered" view. Whichever transaction commits the last topic-master stamps the book; the other is a no-op (`mastered_at IS NULL` already false, or the predicate still true and it stamps — idempotent either way).

## Consequences

- **The stamp logic cannot live in the application layer.** Any JS/TS path that reads sibling state then writes the book flag reintroduces the race; this is a hard rule, not a preference.
- **This constraint carries a standing regression-test obligation.** Per the repo's "correctness constraint requires a break test" rule: any change to the stamp path must ship with (or be covered by) a concurrency test that stamps the last two sibling topics **concurrently** and asserts the book ends Mastered — a test that fails against a read-then-write implementation and passes against the atomic `UPDATE`. Until such a test exists, this ADR is the only guard.
- **No chapter/section header derives an "X of Y mastered" count from sticky memory** — section progress is the current topic set only; "fully done" is expressed solely by `mastered_at`. (Prevents a second, drifting source of truth for book completion.)
- Topic-level mastery (`retention_cards.mastered_at`) uses the same sticky-flag discipline; this ADR is specifically about the **composition** race at the book level.

## Alternatives considered

1. **Application-layer read-then-write** (read sibling topics, check in JS, write the flag). Rejected — the lost-update race permanently prevents book mastery under concurrent sibling verifies.
2. **A derived/computed `isMastered` (no stored flag), recomputed on read.** Rejected — defeats the *sticky* semantics (mastery must survive later `xpStatus` regression) and pushes the all-topics-mastered scan onto every read.
3. **Serialize topic verifies (a per-book lock).** Rejected — adds contention and a lock-management surface to avoid a race the database already resolves atomically in one statement.
