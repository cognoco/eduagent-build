---
title: S0-R Retention Gate — applyRetentionUpdate() core-SRS chokepoint — Implementation Plan
date: 2026-06-10
profile: change
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
status: draft
---

# S0-R Retention Gate — `applyRetentionUpdate()` core-SRS chokepoint — Implementation Plan

**Goal:** Introduce a single new chokepoint function `applyRetentionUpdate()` in
`apps/api/src/services/` that all ~9–10 existing writers into `retention_cards`
route through, so the `GET /now` feed's due-work ranking reads one consistent
source of truth — **behavior-preserving** (a consolidation, not a policy change).

**Approach:** First pin every current writer's exact effect on `retention_cards`
with break-tests (red-green: assert today's behavior, observe green). Then build
`applyRetentionUpdate()` as a thin, fully-parameterized wrapper over the existing
`db.update(retentionCards)`/`insert` statements — reproducing each writer's
column set, optimistic-lock predicate, cooldown predicate, and mastery/XP side
effects exactly. Finally re-point each writer at the chokepoint, re-running the
same break-tests (still green) plus a negative test per writer that fails if a
column write is dropped. No SM-2 math, no quality mapping, no rung policy, and no
mastery/XP rule changes — those stay in their current pure modules
(`services/retention.ts`, `services/evaluate.ts`, `@eduagent/retention`,
`services/retention-mastery.ts`, `services/xp.ts`).

## Scope

In scope:
- `apps/api/src/services/apply-retention-update.ts` — **NEW** chokepoint (the
  consolidation surface) + co-located `apply-retention-update.test.ts`.
- `apps/api/src/services/retention-data.ts` — re-point `ensureRetentionCard`,
  recall-test cooldown-claim + post-LLM SM-2 write (`processRecallTest`),
  `updateRetentionFromSession`.
- `apps/api/src/inngest/functions/review-calibration-grade.ts` — re-point the
  `persist-retention-update` step write.
- `apps/api/src/services/verification-completion.ts` — re-point the
  `evaluateDifficultyRung` write in `processEvaluateCompletion`.
- `apps/api/src/services/evaluate-data.ts` — re-point the `evaluateDifficultyRung`
  writes in `advanceEvaluateRung` and `processEvaluateFailureEscalation`.
- `apps/api/src/services/retention-mastery.ts` — re-point the `masteredAt` write
  in `stampMasteryOnVerify` (the `retention_cards` UPDATE only; the
  `curriculum_books` book-mastery UPDATE stays in this file, out of the
  chokepoint — it is not a `retention_cards` write).
- `apps/api/src/inngest/functions/topic-probe-extract.ts` — re-point the seed
  write in `seedRetentionCard`.
- Co-located `*.test.ts` for each writer above (extend, do not weaken existing
  assertions) + one new integration test asserting cross-writer consistency.

Out of scope (MUST NOT change):
- Any read-side / feed / `GET /now` / UI code. The feed reads `retention_cards`
  as-is in the interim (spec §8.3: S0-R "does not block S1/S2").
- Any **new** SRS policy: SM-2 constants, quality→SM-2 mapping
  (`mapEvaluateQualityToSm2`, `mapTeachBackRubricToSm2`), rung escalation rules
  (`handleEvaluateFailure`), cooldown duration (`RETEST_COOLDOWN_MS`), mastery
  rule (`xpChange === 'verified'`), or seed thresholds (`buildRetentionSeed`).
  These are inputs to the chokepoint, not changed by it.
- `packages/database/src/schema/assessments.ts` — no schema change; no migration.
  The chokepoint writes the existing columns only.
- `services/retention.ts`, `services/evaluate.ts`, `services/teach-back.ts`,
  `@eduagent/retention`, `services/xp.ts` internals — used as-is.
- The `needs_deepening_topics` writers in `retention-data.ts`
  (`startRelearn`, `updateNeedsDeepeningProgress`) — different table, not
  in the retention-card chokepoint.

---

## The `retention_cards` schema (write surface)

From `packages/database/src/schema/assessments.ts:112-161`. Columns a writer may
set (excluding `id`, `profileId`, `topicId` which are identity/keys, and
`createdAt` which is insert-only `defaultNow()`):

| Column | Type | Default | Written by |
|---|---|---|---|
| `easeFactor` | numeric(4,2) | 2.5 | SM-2 writers, seed |
| `intervalDays` | int (≥1 CHECK) | 1 | SM-2 writers, seed |
| `repetitions` | int | 0 | SM-2 writers, seed |
| `lastReviewedAt` | timestamptz null | — | cooldown-claim, SM-2 writers |
| `nextReviewAt` | timestamptz null | — | SM-2 writers, seed |
| `masteredAt` | timestamptz null | — | `stampMasteryOnVerify` (verify only) |
| `failureCount` | int | 0 | SM-2 recall/calibration writers |
| `consecutiveSuccesses` | int | 0 | SM-2 recall/calibration writers |
| `xpStatus` | enum pending\|verified\|decayed | pending | SM-2 recall/calibration writers |
| `evaluateDifficultyRung` | int null (1–4 semantically) | null | EVALUATE writers |
| `updatedAt` | timestamptz | defaultNow() | **every** writer |

Uniqueness: `unique(profileId, topicId)` — used by `onConflictDoNothing` in
`ensureRetentionCard`.

---

## Writer → columns map (verified against source)

Ten distinct write sites across the 7 files. Each row = one write site, the
columns it sets today, its WHERE/guard predicate, and its trigger.

| # | Writer (file:line) | Op | Columns written today | Guard predicate (WHERE beyond id+profileId) | Trigger |
|---|---|---|---|---|---|
| W1 | `retention-data.ts:207` `ensureRetentionCard` | INSERT … ON CONFLICT DO NOTHING | `easeFactor=2.5, intervalDays=1, repetitions=0, failureCount=0, consecutiveSuccesses=0, xpStatus='pending'` (defaults) | conflict target `(profileId, topicId)` → DO NOTHING | First encounter of a (profile, topic) card |
| W2 | `retention-data.ts:849` `processRecallTest` cooldown-claim | UPDATE | `lastReviewedAt=claimNow, updatedAt=claimNow` | `lastReviewedAt IS NULL OR lastReviewedAt < cooldownThreshold` | Recall test, before LLM call (atomic cooldown claim), `attemptMode !== 'dont_remember'` |
| W3 | `retention-data.ts:900` `processRecallTest` post-LLM SM-2 write | UPDATE | `easeFactor, intervalDays, repetitions, failureCount, consecutiveSuccesses, xpStatus, nextReviewAt, updatedAt` (NOT `lastReviewedAt`) | for non-`dont_remember`: `updatedAt = claimNow` (optimistic lock vs the W2 claim); for `dont_remember`: `true` | Recall test, after grading |
| W4 | `retention-data.ts:1521` `updateRetentionFromSession` | UPDATE | `easeFactor, intervalDays, repetitions, lastReviewedAt, nextReviewAt, updatedAt` (NO failureCount/consecutiveSuccesses/xpStatus) | for existing cards: `updatedAt = card.updatedAt` (optimistic lock); newly-created: no extra predicate | session-completed Inngest chain, SM-2 from session quality |
| W5 | `review-calibration-grade.ts:105` persist step | UPDATE | `easeFactor, intervalDays, repetitions, failureCount, consecutiveSuccesses, xpStatus, nextReviewAt, lastReviewedAt=eventAt, updatedAt=eventAt` | `lastReviewedAt IS NULL OR lastReviewedAt < cooldownThreshold` | `app/review.calibration.requested` Inngest grade |
| W6 | `verification-completion.ts:147` `processEvaluateCompletion` | UPDATE | `evaluateDifficultyRung, updatedAt` | none beyond id+profileId | EVALUATE session completion (rung up/down/reset) |
| W7 | `evaluate-data.ts:116` `advanceEvaluateRung` | UPDATE | `evaluateDifficultyRung, updatedAt` | none beyond id+profileId | EVALUATE success → advance rung (cap 4) |
| W8 | `evaluate-data.ts:161` `processEvaluateFailureEscalation` | UPDATE | `evaluateDifficultyRung, updatedAt` | none beyond id+profileId | EVALUATE failure escalation (lower/reset rung) |
| W9 | `retention-mastery.ts:26` `stampMasteryOnVerify` | UPDATE | `masteredAt, updatedAt` | `masteredAt IS NULL` (idempotent first-stamp) | recall/calibration verify (`xpChange === 'verified'`) |
| W10 | `topic-probe-extract.ts:115` `seedRetentionCard` | UPDATE | `easeFactor, intervalDays, repetitions, nextReviewAt, updatedAt` (NO lastReviewedAt/failureCount/xpStatus) | `repetitions = 0` (seed only a fresh card) | `app/topic-probe.requested` prior-knowledge seed (quality ≥ 3) |

Cross-cutting observations the chokepoint must preserve:
- **Optimistic-lock variants differ**: W3 locks on `updatedAt = claimNow`; W4 locks
  on `updatedAt = card.updatedAt` (only for existing cards); W2/W5 use a
  **cooldown predicate** (`lastReviewedAt IS NULL OR < threshold`), not an
  `updatedAt` lock; W9 uses a `masteredAt IS NULL` predicate; W10 uses a
  `repetitions = 0` predicate; W6/W7/W8 have no extra predicate.
- **`.returning()` shapes differ**: W2/W3/W5 return `{ id }` and the caller
  branches on empty result (cooldown-lost / lock-lost); W4 returns full rows and
  checks `.length === 0` for the lock-conflict log. The chokepoint must surface
  "did the row update?" so every caller can keep its existing branch.
- **`lastReviewedAt` is split** between W2 (claim) and W3 (SM-2) for the recall
  path on purpose — W3 must NOT re-touch `lastReviewedAt`. The chokepoint must
  allow `lastReviewedAt` to be omitted independently of the SM-2 fields.
- **Mastery (W9) and book-mastery** are a separate side effect inside
  `stampMasteryOnVerify`; only the `retention_cards` UPDATE routes through the
  chokepoint. The `curriculum_books` UPDATE stays in `retention-mastery.ts`.

---

## The `applyRetentionUpdate()` signature + consolidated write contract

The function lives in `apps/api/src/services/apply-retention-update.ts`. Two
entry points: an **upsert** (covers W1) and an **update** (covers W2–W10). The
update takes a discriminated `guard` so each writer keeps its exact predicate,
and an explicit `set` object so omitted columns are never touched.

```ts
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { retentionCards, type Database } from '@eduagent/database';

/** SM-2 / status fields a writer may set. Every field is optional so a writer
 *  only touches the columns it owns (e.g. W3 omits lastReviewedAt; W4 omits
 *  failureCount/consecutiveSuccesses/xpStatus; W10 omits lastReviewedAt). */
export interface RetentionCardSet {
  easeFactor?: number;
  intervalDays?: number;
  repetitions?: number;
  lastReviewedAt?: Date | null;
  nextReviewAt?: Date | null;
  masteredAt?: Date | null;
  failureCount?: number;
  consecutiveSuccesses?: number;
  xpStatus?: 'pending' | 'verified' | 'decayed';
  evaluateDifficultyRung?: 1 | 2 | 3 | 4 | null;
}

/** Per-writer WHERE guard beyond the always-applied id + profileId match.
 *  Reproduces each existing writer's predicate exactly. */
export type RetentionUpdateGuard =
  /** W6/W7/W8: unconditional (id + profileId only). */
  | { kind: 'none' }
  /** W3 (non-dont_remember): updatedAt must still equal the claimed value. */
  | { kind: 'updatedAtEquals'; updatedAt: Date }
  /** W4 (existing card): optimistic lock on the read-time updatedAt. */
  | { kind: 'optimisticLock'; updatedAt: Date }
  /** W2/W5: cooldown claim — lastReviewedAt null OR older than threshold. */
  | { kind: 'cooldownClaim'; cooldownThreshold: Date }
  /** W9: first-stamp only — masteredAt currently null. */
  | { kind: 'masteredAtNull' }
  /** W10: seed only a fresh card — repetitions still 0. */
  | { kind: 'repetitionsZero' };

export interface ApplyRetentionUpdateParams {
  db: Database;
  profileId: string;
  cardId: string;
  set: RetentionCardSet;
  guard: RetentionUpdateGuard;
  /** Value written to updatedAt. Callers pass the exact Date they use today
   *  (claimNow for W2/W3, eventAt for W5, seededAt for W10, masteredAt for W9,
   *  new Date() for the rest) so timestamps are byte-identical to current code. */
  updatedAt: Date;
}

/** Routes one existing UPDATE into retention_cards through the single chokepoint.
 *  Returns whether the guarded row was updated, so callers keep their
 *  empty-result branches (cooldown-lost / lock-lost / no-op).
 *  Behavior-preserving: builds the same SET + WHERE the writer emits today. */
export async function applyRetentionUpdate(
  params: ApplyRetentionUpdateParams,
): Promise<{ updated: boolean }> {
  const { db, profileId, cardId, set, guard, updatedAt } = params;

  // Only the columns the caller actually provided are placed in SET — a missing
  // key never overwrites a column (this is what keeps W3/W4/W10 from clobbering
  // lastReviewedAt / failureCount / etc.).
  const setClause: Record<string, unknown> = { updatedAt };
  if (set.easeFactor !== undefined) setClause.easeFactor = set.easeFactor;
  if (set.intervalDays !== undefined) setClause.intervalDays = set.intervalDays;
  if (set.repetitions !== undefined) setClause.repetitions = set.repetitions;
  if (set.lastReviewedAt !== undefined) setClause.lastReviewedAt = set.lastReviewedAt;
  if (set.nextReviewAt !== undefined) setClause.nextReviewAt = set.nextReviewAt;
  if (set.masteredAt !== undefined) setClause.masteredAt = set.masteredAt;
  if (set.failureCount !== undefined) setClause.failureCount = set.failureCount;
  if (set.consecutiveSuccesses !== undefined)
    setClause.consecutiveSuccesses = set.consecutiveSuccesses;
  if (set.xpStatus !== undefined) setClause.xpStatus = set.xpStatus;
  if (set.evaluateDifficultyRung !== undefined)
    setClause.evaluateDifficultyRung = set.evaluateDifficultyRung;

  const guardPredicate = (() => {
    switch (guard.kind) {
      case 'none':
        return undefined;
      case 'updatedAtEquals':
      case 'optimisticLock':
        return eq(retentionCards.updatedAt, guard.updatedAt);
      case 'cooldownClaim':
        return or(
          isNull(retentionCards.lastReviewedAt),
          lt(retentionCards.lastReviewedAt, guard.cooldownThreshold),
        );
      case 'masteredAtNull':
        return isNull(retentionCards.masteredAt);
      case 'repetitionsZero':
        return eq(retentionCards.repetitions, 0);
    }
  })();

  const result = await db
    .update(retentionCards)
    .set(setClause)
    .where(
      and(
        eq(retentionCards.id, cardId),
        eq(retentionCards.profileId, profileId),
        ...(guardPredicate ? [guardPredicate] : []),
      ),
    )
    .returning({ id: retentionCards.id });

  return { updated: result.length > 0 };
}

/** Covers W1: idempotent first-create. Mirrors ensureRetentionCard's insert
 *  with ON CONFLICT DO NOTHING — keeps the read-back + isNew semantics at the
 *  call site (ensureRetentionCard stays the public API; it delegates the insert
 *  here). Defaults match the schema (easeFactor 2.5, intervalDays 1, etc.). */
export async function insertRetentionCardIfAbsent(params: {
  db: Database;
  profileId: string;
  topicId: string;
}): Promise<void> {
  const { db, profileId, topicId } = params;
  await db
    .insert(retentionCards)
    .values({
      profileId,
      topicId,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 0,
      failureCount: 0,
      consecutiveSuccesses: 0,
      xpStatus: 'pending',
    })
    .onConflictDoNothing({
      target: [retentionCards.profileId, retentionCards.topicId],
    });
}
```

Why this shape (the decisions the plan is responsible for):
- **Optional `set` keys, not a full row** — the single most important
  behavior-preserving property. W3 must not write `lastReviewedAt`; W4 must not
  write `failureCount`/`xpStatus`; W10 must not write `lastReviewedAt`. A
  full-row contract would silently introduce those writes. `undefined` ⇒ column
  untouched.
- **Discriminated `guard`, not a freeform predicate** — the five distinct WHERE
  shapes (none / updatedAt-equality / cooldown / masteredAt-null /
  repetitions-zero) are an exhaustive closed set across all ten writers. A
  closed union lets each call site declare exactly its current predicate and
  makes a dropped guard a type error.
- **Explicit `updatedAt` param** — today writers use *different* timestamp
  values for `updatedAt` (claimNow, eventAt, seededAt, masteredAt,
  `new Date()`). Passing it in keeps each write's timestamp identical instead of
  centralizing on `new Date()` (which would break the W3 `updatedAt = claimNow`
  lock and the W5 `updatedAt = eventAt` history).
- **Returns `{ updated }`** — every guarded writer (W2/W3/W4/W5/W9/W10) branches
  on whether the row changed. Returning a boolean preserves each caller's
  cooldown-lost / lock-lost / no-op handling without leaking row internals.
- **W1 stays behind `ensureRetentionCard`** — `ensureRetentionCard` keeps its
  ownership assertion + read-back + `isNew` return; only the raw insert moves
  into `insertRetentionCardIfAbsent`. Callers of `ensureRetentionCard` are
  unchanged.

---

## Writer → chokepoint mapping (after)

| # | Writer | Routes through | `set` keys passed | `guard` | `updatedAt` |
|---|---|---|---|---|---|
| W1 | `ensureRetentionCard` | `insertRetentionCardIfAbsent` (insert) | schema defaults | ON CONFLICT DO NOTHING | n/a (insert) |
| W2 | recall cooldown-claim | `applyRetentionUpdate` | `lastReviewedAt: claimNow` | `cooldownClaim(cooldownThreshold)` | `claimNow` |
| W3 | recall post-LLM SM-2 | `applyRetentionUpdate` | `easeFactor, intervalDays, repetitions, failureCount, consecutiveSuccesses, xpStatus, nextReviewAt` | non-`dont_remember`: `updatedAtEquals(claimNow)`; `dont_remember`: `none` | `new Date()` |
| W4 | `updateRetentionFromSession` | `applyRetentionUpdate` | `easeFactor, intervalDays, repetitions, lastReviewedAt, nextReviewAt` | existing: `optimisticLock(card.updatedAt)`; new: `none` | `new Date()` |
| W5 | calibration persist | `applyRetentionUpdate` | `easeFactor, intervalDays, repetitions, failureCount, consecutiveSuccesses, xpStatus, nextReviewAt, lastReviewedAt: eventAt` | `cooldownClaim(cooldownThreshold)` | `eventAt` |
| W6 | `processEvaluateCompletion` | `applyRetentionUpdate` | `evaluateDifficultyRung: newRung` | `none` | `new Date()` |
| W7 | `advanceEvaluateRung` | `applyRetentionUpdate` | `evaluateDifficultyRung: newRung` | `none` | `new Date()` |
| W8 | `processEvaluateFailureEscalation` | `applyRetentionUpdate` | `evaluateDifficultyRung: newRung` | `none` | `new Date()` |
| W9 | `stampMasteryOnVerify` (card UPDATE only) | `applyRetentionUpdate` | `masteredAt` | `masteredAtNull` | `masteredAt` |
| W10 | `seedRetentionCard` | `applyRetentionUpdate` | `easeFactor, intervalDays, repetitions, nextReviewAt` | `repetitionsZero` | `seededAt` |

Note: W2 and W3 both run in `processRecallTest`; W3's caller still reads the
`{ updated }` boolean to drive the "post-LLM write lost the optimistic-lock race"
cooldown-style response. W4's caller still logs the optimistic-lock conflict when
`updated === false`. W5's caller still returns `skipped: 'cooldown_claim_lost'`
when `updated === false`.

---

## Tasks

- [ ] **T1: Add break-tests pinning each writer's current `retention_cards` effect (RED→GREEN, pre-refactor).** Extend the co-located tests so that, **before any source change**, each of W1–W10 has at least one test that asserts the exact column set written and the exact guard behavior (cooldown-lost, lock-lost, masteredAt-idempotent, repetitions=0 seed-only, rung up/down/reset). — done when: the new/extended assertions in `retention-data.test.ts`, `review-calibration-grade.test.ts`, `verification-completion.test.ts`, `evaluate-data.test.ts`, `retention-mastery.test.ts`, `topic-probe-extract.test.ts` all pass against **unmodified** source (`pnpm exec nx test api` green for those suites), and each writer's column-set assertion is present (see `## Tests`).

- [ ] **T2: Create `apply-retention-update.ts` with `applyRetentionUpdate()`, `insertRetentionCardIfAbsent()`, `RetentionCardSet`, `RetentionUpdateGuard`.** Exactly the signatures above. No writer re-pointed yet. — done when: file compiles (`pnpm exec nx run api:typecheck`), is exported through the service module, and `apply-retention-update.test.ts` unit-tests each `guard.kind` builds the expected WHERE and each `set` key maps 1:1 to a column with `undefined` omitted (see `## Tests` → T2).

- [ ] **T3: Re-point W1 (`ensureRetentionCard`) to `insertRetentionCardIfAbsent`.** Replace the inline insert in `retention-data.ts:207-221` with a call; keep the ownership assert + read-back + `isNew`. — done when: T1's `ensureRetentionCard` tests still green; a negative test (drop a default column from `insertRetentionCardIfAbsent`) makes a T1 assertion fail (see `## Tests` → T3).

- [ ] **T4: Re-point W2 + W3 (`processRecallTest` cooldown-claim and post-LLM SM-2 write).** Replace the two `db.update(retentionCards)` blocks at `retention-data.ts:849` and `:900` with `applyRetentionUpdate` calls using `cooldownClaim` then `updatedAtEquals`/`none`. The cooldown-claim must still bump only `lastReviewedAt` + `updatedAt`; the SM-2 write must still omit `lastReviewedAt`. — done when: T1's recall-test suite (all 111 cases) stays green, including cooldown-lost and post-LLM-lock-lost branches; the negative test (let the SM-2 write also set `lastReviewedAt`) fails a T1 assertion (see `## Tests` → T4).

- [ ] **T5: Re-point W4 (`updateRetentionFromSession`).** Replace `retention-data.ts:1521` with `applyRetentionUpdate` using `optimisticLock(card.updatedAt)` for existing cards and `none` for newly-created. Must still omit `failureCount`/`consecutiveSuccesses`/`xpStatus`. The empty-result optimistic-lock warn log stays, driven by `updated === false`. — done when: T1's `updateRetentionFromSession` tests green (including the concurrent-update skip + the D-01 double-count guard); negative test (route fields that W4 must not write) fails a T1 assertion (see `## Tests` → T5).

- [ ] **T6: Re-point W5 (`review-calibration-grade.ts` persist step).** Replace `:105` inside the `persist-retention-update` step with `applyRetentionUpdate` using `cooldownClaim(cooldownThreshold)`, `updatedAt: eventAt`, and `lastReviewedAt: eventAt`. The `persisted.length === 0` → `cooldown_claim_lost` branch becomes `!updated`. — done when: T1's calibration-grade suite green (cooldown-active skip, cooldown-claim-lost, mastery-stamp, xp-sync steps); negative test (omit `lastReviewedAt` from the set) fails a T1 assertion (see `## Tests` → T6).

- [ ] **T7: Re-point W6/W7/W8 (all three `evaluateDifficultyRung` writers).** Replace the rung UPDATEs in `verification-completion.ts:147`, `evaluate-data.ts:116`, `evaluate-data.ts:161` with `applyRetentionUpdate` using `guard: { kind: 'none' }`, `set: { evaluateDifficultyRung: newRung }`. — done when: T1's evaluate suites green (rung advance cap-at-4, lower, exit-to-1 reset for all three sites); negative test (route a stale rung) fails a T1 assertion (see `## Tests` → T7).

- [ ] **T8: Re-point W9 (`stampMasteryOnVerify` card UPDATE).** Replace the `retention_cards` UPDATE in `retention-mastery.ts:26-38` with `applyRetentionUpdate` using `guard: { kind: 'masteredAtNull' }`, `set: { masteredAt }`, `updatedAt: masteredAt`. **Leave the `curriculum_books` UPDATE in place** (out of chokepoint). The `xpChange !== 'verified'` early-return stays. — done when: T1's `retention-mastery` tests green (first-stamp writes, second-stamp idempotent no-op, non-verify no-op, book-mastery still rolls up); negative test (drop the `masteredAtNull` guard) fails the idempotency assertion (see `## Tests` → T8).

- [ ] **T9: Re-point W10 (`seedRetentionCard`).** Replace `topic-probe-extract.ts:115` with `applyRetentionUpdate` using `guard: { kind: 'repetitionsZero' }`, `set: { easeFactor, intervalDays, repetitions, nextReviewAt }`, `updatedAt: seededAt`. Must still omit `lastReviewedAt`. — done when: T1's `topic-probe-extract` tests green (seed only when fresh + quality≥3, no-op when repetitions>0); negative test (add `lastReviewedAt` to the seed set) fails a T1 assertion (see `## Tests` → T9).

- [ ] **T10: Cross-writer consistency integration test.** New `apps/api/src/services/apply-retention-update.integration.test.ts` (real DB, no internal mocks) that exercises a topic's lifecycle through multiple writers (seed → session SM-2 → recall verify → mastery stamp → evaluate rung) and asserts the final `retention_cards` row is identical to a baseline captured from the pre-refactor writers. — done when: the integration test passes via `pnpm exec nx test:integration api`, and a deliberately broken chokepoint (e.g. centralize `updatedAt` to `new Date()`) makes it fail (see `## Tests` → T10).

- [ ] **T11: Full validation sweep.** — done when: `pnpm exec nx run api:lint`, `pnpm exec nx run api:typecheck`, `pnpm exec nx run api:test`, and `pnpm exec nx test:integration api` all pass; `git grep -n "db.update(retentionCards)\|.insert(retentionCards)" apps/api/src` returns only sites inside `apply-retention-update.ts` (+ the intentional `curriculum_books`/`xp_ledger` writes, which are not `retention_cards`).

---

## Tests

> Test discipline (project rules): co-located, no internal `jest.mock` — use the
> real implementation or `jest.requireActual` with targeted overrides (canonical
> pattern: `apps/api/src/inngest/functions/archive-cleanup.test.ts:1-44`).
> External boundaries only (LLM via `routeAndCall`, Inngest transport) may be
> stubbed with bare specifiers. Each break-test follows the red-green regression
> pattern from `verification-before-completion`: write assertion → confirm green
> on current code → after re-point, confirm still green → the paired negative
> test proves a dropped column/guard goes red.

### T1 — per-writer column-set break-tests (pre-refactor pins)
For each writer, seed a real card (integration suites already do this — see
`retention-data.integration.test.ts:65-160` for the account→profile→subject→
curriculum→book→topic seeding helper) and assert the **exact** post-write row:
- W1: after `ensureRetentionCard` on a fresh topic → `{ easeFactor: 2.5,
  intervalDays: 1, repetitions: 0, failureCount: 0, consecutiveSuccesses: 0,
  xpStatus: 'pending', lastReviewedAt: null, nextReviewAt: null, masteredAt:
  null, evaluateDifficultyRung: null }`; on an existing card → unchanged.
- W2: cooldown-claim bumps `lastReviewedAt` + `updatedAt` only; all SM-2 columns
  unchanged. Second concurrent claim within cooldown → `updated === false`.
- W3: post-LLM write sets the 7 SM-2/status columns and **leaves
  `lastReviewedAt` at the W2 claim value** (assert it equals claimNow, not the
  post-LLM time). For `dont_remember`: no W2 claim, `guard: none`.
- W4: sets `easeFactor/intervalDays/repetitions/lastReviewedAt/nextReviewAt`;
  assert `failureCount`, `consecutiveSuccesses`, `xpStatus` are **byte-identical
  to pre-write**. Concurrent write (mutate `updatedAt` between read and write) →
  `updated === false`, warn logged, no overwrite.
- W5: sets the 8 columns incl. `lastReviewedAt = eventAt`, `updatedAt = eventAt`;
  cooldown predicate honored; second event within cooldown → `cooldown_claim_lost`.
- W6/W7/W8: only `evaluateDifficultyRung` + `updatedAt` change; SM-2 columns
  untouched; advance caps at 4; failure lowers/exits-to-1.
- W9: first verify stamps `masteredAt`; a second verify is a no-op (masteredAt
  unchanged); non-verify `xpChange` writes nothing; book rollup still fires.
- W10: seeds only when `repetitions === 0` and quality ≥ 3; sets
  `easeFactor/intervalDays/repetitions/nextReviewAt`, **not** `lastReviewedAt`;
  no-op when `repetitions > 0`.

### T2 — chokepoint unit tests (`apply-retention-update.test.ts`)
Real `applyRetentionUpdate` against a real DB row (no mock). Assert: (a) each
`guard.kind` produces the documented WHERE behavior (a `cooldownClaim` against a
recently-reviewed card returns `updated:false`; `masteredAtNull` against a
stamped card returns `updated:false`; `repetitionsZero` against a started card
returns `updated:false`; `optimisticLock`/`updatedAtEquals` against a moved
`updatedAt` returns `updated:false`; `none` always updates). (b) An omitted
`set` key never changes that column (write only `evaluateDifficultyRung`, assert
all SM-2 columns unchanged). (c) `insertRetentionCardIfAbsent` is idempotent.

### T3–T9 — per-writer re-point + negative tests
Each re-point task re-runs its T1 suite (must stay green) and adds one negative
test that temporarily breaks the chokepoint call and asserts a T1 pin goes red:
- T3 negative: drop `xpStatus: 'pending'` default → W1 pin fails.
- T4 negative: add `lastReviewedAt` to the W3 `set` → W3 pin (lastReviewedAt ==
  claimNow) fails.
- T5 negative: add `xpStatus` to the W4 `set` → W4 "status unchanged" pin fails.
- T6 negative: omit `lastReviewedAt` from W5 `set` → W5 history pin fails.
- T7 negative: pass a stale `evaluateDifficultyRung` → rung-advance pin fails.
- T8 negative: change W9 guard to `none` → second-stamp idempotency pin fails.
- T9 negative: add `lastReviewedAt` to W10 `set` → seed pin fails.

### T10 — cross-writer consistency integration test
Drive one (profile, topic) through seed → `updateRetentionFromSession` →
`processRecallTest` (verify) → `stampMasteryOnVerify` →
`processEvaluateCompletion`. Snapshot the final row. Compare to a baseline row
produced by running the same sequence on `HEAD~` writers (capture the baseline
as an inline fixture constant in the test, derived from the pre-refactor run, so
the assertion is self-contained). Real DB; no internal mocks.

---

## Rollback

**Is rollback possible?** Yes — this is a code-only refactor. There is **no
migration, no schema change, no data backfill**. Rollback = `git revert` of the
S0-R commit(s); the previous inline writers are restored verbatim and continue
writing the same columns. No `retention_cards` row shape changes, so reverting
forward or backward never strands data.

**What data could be corrupted if the refactor is wrong (not on revert, but if a
behavior drift ships undetected)?** All three of `retention_cards`'s
correctness-bearing axes:
- **SM-2 scheduling** (`easeFactor`, `intervalDays`, `repetitions`,
  `nextReviewAt`, `lastReviewedAt`) — a dropped/extra column or a wrong
  optimistic-lock guard could mis-schedule reviews (too-early/too-late
  `nextReviewAt`) or let a concurrent write clobber a fresh one. Affects every
  learner's due-queue.
- **XP status** (`xpStatus`, plus the downstream `xp_ledger` sync) — if W3/W5
  drift, a verified topic could revert to pending/decayed or vice versa,
  corrupting XP bookkeeping.
- **Mastery stamping** (`masteredAt` + the `curriculum_books` rollup) — if W9's
  `masteredAtNull` guard is dropped, `masteredAt` could be re-stamped to a later
  date, and the book-mastery EXISTS rollup could flip incorrectly.

**Recovery procedure if a drift is detected post-ship:**
1. **Revert the code** (`git revert <S0-R commit>`); deploy. This stops further
   drift immediately — no migration to unwind.
2. **Assess scope** — query rows updated since the S0-R deploy:
   `SELECT id, profile_id, topic_id FROM retention_cards WHERE updated_at >= '<deploy-ts>'`.
   Only rows touched after deploy can carry drift.
3. **`nextReviewAt` mis-schedule** is **self-healing**: the next legitimate
   review through any writer recomputes SM-2 from the current row, re-deriving a
   correct `nextReviewAt`. No manual correction needed for scheduling unless a
   row was hard-corrupted (e.g. `intervalDays` violating the `≥1` CHECK — the DB
   CHECK constraint `retention_cards_interval_days_positive` would have rejected
   that write, so this class cannot persist).
4. **`xpStatus` drift** — re-run `syncXpLedgerStatus` reconciliation is **not**
   automatic; if W3/W5 drift shipped, compare `retention_cards.xpStatus` against
   `xp_ledger.status` for affected (profile, topic) pairs and re-stamp from the
   authoritative SM-2 history (`session_events` structured assessments). Scope is
   bounded to step-2's row set.
5. **`masteredAt` over-stamp** — `masteredAt` is monotonic-by-design
   (`masteredAtNull` guard); a drift that re-stamped it can be corrected by
   recomputing the earliest verify timestamp from `xp_ledger.verifiedAt` /
   calibration history for the affected rows. Bounded to step-2's set.

**Pre-ship guard against ever needing recovery:** the per-writer negative tests
(T3–T9) plus the cross-writer consistency integration test (T10) are the
red-green proof that no column write was dropped or added; the chokepoint cannot
ship green if any writer's column set or guard drifted.

---

## Sequencing note

S0-R runs on its **own track, parallel to S0/S1/S2, and is gated to NOT block
them** (spec §8.3 + §11 S0-R row). The `GET /now` feed (S0/S1) reads
`retention_cards` **as-is in the interim** — it depends only on the *read* shape
(`nextReviewAt` for due-work ranking), which this refactor leaves byte-identical.
S0-R hardens *write* consistency afterward; nothing in S0/S1/S2 imports
`applyRetentionUpdate`. Because there is no schema change and no read-path change,
S0-R can land before, during, or after S1/S2 without coordination. It is
identity-independent (writes the existing `profileId`-keyed table; no
`person`/`edge` columns — consistent with §9's identity-independent-phases-first
guarantee).

## Validation note

This plan touches `apps/api/` and SRS-core write paths. Per CLAUDE.md "Required
Validation", **integration tests are mandatory** before any commit:
`pnpm exec nx test:integration api`. The pre-commit/pre-push hooks intentionally
skip `*.integration.test.` files, so the unit suites alone will not catch
DB/auth-scoping/Inngest-flow regressions on these paths — T10 and the existing
`retention-data.integration.test.ts` / `evaluate-data-cross-profile.integration.test.ts`
must be run explicitly. Full sweep (T11): `api:lint`, `api:typecheck`,
`api:test`, `nx test:integration api` all green.
