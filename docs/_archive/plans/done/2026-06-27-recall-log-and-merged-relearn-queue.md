---
title: Recall Log + Merged Relearn Queue — Implementation Plan
date: 2026-06-27
profile: code
spec: docs/_archive/specs/Done/2026-06-08-memory-task-review-continuity.md
status: shipped
landed: PR #1546 — review-continuity-buildables (a9eee56 + review fixes 27bab0d5, ae1d126, 95f576c6), 2026-06-28
reviews:
  - end-user (learner seat) — 2026-06-27
  - code-vs-plan verification — 2026-06-27
  - /review adversarial fan-out (5 reviewers + Codex) — 2026-06-28
---

# Recall Log + Merged Relearn Queue — Implementation Plan

**Goal:** Ship two slices of the review-continuity spec — **Flow 2 (`retrieval_events` recall log, RR-9, which inherently includes the "stop faking grades" fix)** and **Flow 3 (unified relearn queue, RR-10, dedup + reason-tag, EU-5/EU-6 honored)** — without building the opener (Flow 1) or the promotion fix (R5, deferred per user).

**Approach:** Flow 2 adds one additive migration (`retrieval_events` + 3 enums + EU-3 `redactedAt`), deepens `evaluateRecallQuality` to a structured result that **never fabricates an advancing score on LLM failure**, captures one append-only row per grade at the 3 grade sites via `safeWrite`, caps consecutive grader-failure reschedules (EU-7), and redacts free-text PII on the 37-day clock via a dedicated cron. Flow 3 is read-only/server-side: it merges the overdue queue with `needs_deepening_topics` (status `active`/`pending_review`), dedups by `topicId`, and reason-tags each row (the mobile render is deferred — see review finding L-4).

> **Status: APPROVED for implementation (2026-06-27).** 3 code-blockers fixed, 5 improvements folded in. **Both open decisions ruled by the user: D-1 = (a) build as asked; D-2 = (a) TTL the whole row on the 37-day clock.** D-2=(a) simplifies the schema — the `redactedAt` column is dropped (T1) and the cron deletes rows older than 37 days rather than redacting in place (T8).

## Adversarial review findings (2026-06-27)

### Code-vs-plan verification — blockers (FIXED in this revision)

- **C-1 (wrong throw class).** `app.onError` (`apps/api/src/index.ts:410-605`) does **not** handle `UpstreamError` — it would fall through to HTTP 500 / `INTERNAL_ERROR` + a spurious `captureException`. **Fix:** the sync site throws **`UpstreamLlmError`** (re-exported from `apps/api/src/errors.ts:20`, handled → HTTP 502 / `UPSTREAM_ERROR`, classified retryable by mobile `format-api-error.ts`). Reflected in T5.
- **C-2 (cooldown consumed before grading).** `processRecallTest` pre-claims the card (`lastReviewedAt = claimNow`, `retention-data.ts:836-864`) to serialize the LLM call — committed **before** the grade. On grader failure the learner is told "try again" but is locked out 24h. **Fix:** capture the prior `lastReviewedAt` before the claim and **restore it on grader failure** (release the claim) so retry works immediately. Reflected in T5 + T13.
- **C-3 (PII across the Inngest step boundary).** `handleReviewCalibrationGrade`'s grade step is intentionally typed to return only the non-PII integer (`review-calibration-grade.ts:107-138`); pushing `rationale`/`misconception` across the memoized step boundary would leak PII to third-party step state. **Fix:** `recordRetrievalEvent` is called **inside** the step closure; only `{ quality, verdict }` cross the boundary. Reflected in T6.

### Code-vs-plan verification — risks (resolved in tasks)

- **C-4** redaction belongs in a **separate cron function** on the same `0 5 * * *` schedule (the existing `transcript-purge-cron.ts` is a finder + fan-out, not inline bulk mutation). → T8.
- **C-5** drop the redundant standalone `(profileId)` index on the new table (no migration pre-declares it; the composite indexes cover it). → T1.
- **C-6** `topic-probe-extract.test.ts:68` already carries a legitimate `// gc1-allow` mock of `retention-data` (LLM boundary + retention DB writes, not unit-exercisable). Keep it; adapt to `RecallGrade` — do **not** force a real-DB conversion. → T7.
- **C-7** the `evaluateRecallQuality` fallback describe block is **8 tests** (lines 2125-2351), not 3 — all char-count assertions get rewritten. → Tests.
- **C-8** i18n reason copy (if/when rendered) must use **static ternary `t()` calls**, not a map dispatch, or the orphan-key AST walker flags them. Moot for now — mobile render deferred (L-4).
- Migration number **confirmed 0124** (`0123_pink_lionheart.sql` is highest).

### End-user (learner seat) findings folded in

- **L-1 (EU-7 nag-cap was missing).** Reschedule-on-every-failure can trap a mastered topic in a daily re-ask loop. **Fix:** cap consecutive grader-failure reschedules by reading the latest `retrieval_events` row — the log makes this cheap. → T12.
- **L-2 (cold sync failure).** Replace the bare "try again" error with warm, answer-preserving copy; retry must actually work (depends on C-2). → T13.
- **L-3 (no grader-failure metric).** Emit a `safeSend` telemetry event on `fallback_heuristic` so the visible-error rate is tunable against reality, not vibes. → folded into T5/T6.
- **L-4 (reason-tag clutter).** In production every row reads "overdue" until RR-12 → uniform clutter on a 5.8″ screen. **Fix:** ship the server-side union + tags only; **defer the mobile render + 7-locale copy** (former T11) until rows actually differ (post-RR-12). → T11 demoted to "deferred".
- **L-5 / L-6 (scope + minors residue)** → see Open decisions.

## Key decisions (resolved)

- **Honest fallback contract (the "stop faking grades" core):** `evaluateRecallQuality` returns a discriminated `RecallGrade` (below), never a bare number. On LLM failure/unparseable it returns `{ graded:false, gradedBy:'fallback_heuristic' }` — **the char-count `length>100?4:…` advancing score is deleted.**
  - **Sync site** (`processRecallTest`): on `graded:false`, **restore the prior `lastReviewedAt`** (release the cooldown claim, C-2), log a fallback `retrieval_events` row (`nextAction:'reschedule_soon'`), emit the L-3 metric, then **throw `UpstreamLlmError('grader unavailable','UPSTREAM_ERROR')`** (C-1) → mobile shows the warm retry (T13). SM-2 ease/interval/reps/failureCount untouched.
  - **Async calibration** (`review-calibration-grade`): on `graded:false`, unless capped by EU-7 (T12) reschedule the card soon (`nextReviewAt = now + 1 day`, all other SM-2 fields untouched via `applyRetentionUpdate` `set:{nextReviewAt}` `guard:{kind:'none'}`), log a fallback row **inside the step** (C-3), return `{ skipped:'grader_unavailable' }`.
  - **Seed probe** (`topic-probe-extract`): on `graded:false`, **skip seeding** (return null) — never seed SM-2 state from a guess.
- **EU-5 (agency):** learner self-pick stays the default relearn presentation. Band ranking (RR-5) is server-side sort order only.
- **EU-6 (copy):** raw `misconception` text is never surfaced; reason tags map to neutral copy only (and the render is deferred per L-4).

### `RecallGrade` shape (the decision is this interface)

```ts
// apps/api/src/services/retrieval-events.ts
export type RetrievalVerdict = 'solid' | 'partial' | 'missing' | 'misconception';

export type RecallGrade =
  | {
      graded: true;
      quality: number;            // 0–5 SM-2 grade
      gradedBy: 'llm';
      verdict: RetrievalVerdict;
      rationale: string | null;   // grader's one-line reasoning
      misconception: string | null;
      rung: number | null;
    }
  | { graded: false; gradedBy: 'fallback_heuristic' };
```

`evaluateRecallQuality(answer, topicTitle, topicDescription?)` returns `Promise<RecallGrade>`. It requests a small JSON object (`{ quality, verdict, rationale, misconception }`), parses with a zod schema; any parse/timeout/throw → `{ graded:false, gradedBy:'fallback_heuristic' }`. `dont_remember` still bypasses the LLM with `{ graded:true, quality:0, gradedBy:'llm', verdict:'missing', rationale:null, misconception:null, rung:null }` (a real learner signal).

## Decisions (ruled 2026-06-27)

- **D-1 — table scope → (a) build as asked.** Full table + capture + EU-3 retention cron + merged queue. Rationale: pre-launch = cheapest/lowest-risk migration window (test-only data, trivial rollback); the log's value is accumulated history, so starting capture now begins the clock for the future opener/eval-reader; honors the user's deliberate foundation-first choice; the grade-honesty win ships regardless. The mobile reason-tag render (T11) stays deferred per L-4.
- **D-2 — minors retention → (a) TTL the whole row on the 37-day clock.** Nothing durable on a minor; the eval corpus becomes a rolling 37-day window. **Implementation consequence:** the row-level TTL is simpler than redact-in-place — **drop the `redactedAt` column** (T1) and make the cron a `DELETE ... WHERE createdAt <= now-37d` (T8). No partial-redaction state to manage.

## Scope

In scope (D-1 = a, ruled):
- **Flow 2 (recall log):**
  - `packages/database/src/schema/retrieval-events.ts` (new), `packages/database/src/schema/index.ts` (export)
  - `apps/api/drizzle/0124_*.sql` (generated)
  - `apps/api/src/services/retrieval-events.ts` (new — `recordRetrievalEvent` + `RecallGrade` + `RetrievalVerdict`)
  - `apps/api/src/services/retention-data.ts` (`evaluateRecallQuality` deepen; `processRecallTest` capture + C-2 cooldown-restore + honest throw)
  - `apps/api/src/inngest/functions/review-calibration-grade.ts` (in-step capture + EU-7 cap + reschedule)
  - `apps/api/src/inngest/functions/topic-probe-extract.ts` (skip-seed on `graded:false`)
  - `apps/api/src/inngest/functions/retrieval-events-retention-cron.ts` (new — EU-3 whole-row TTL)
  - eval: `apps/api/eval-llm/flows/` (recall-grader scenario)
- **Flow 3 (merged queue, server-side only):**
  - `apps/api/src/services/overdue-topics.ts` (merge + reason-tag + band rank)
  - `packages/schemas/src/progress.ts` (`overdueTopicSchema` += optional `reason`, `concept`)
- Mobile copy: `apps/mobile/src/.../recall-test.tsx` + i18n (T13 warm fallback only)
- Tests co-located (no `__tests__/`).

Out of scope (do not change):
- **Flow 1 opener** (unless D-1 = c).
- **`promotePendingDeepening` / R5** — deferred (zero callers; union reads `pending_review` directly).
- **Mobile relearn reason-tag render + 7-locale reason copy** (former T11 — deferred per L-4 until rows differ post-RR-12).
- `retrieval_events` `conceptId` seam; SM-2 scheduling semantics; any production flag flip (RR-12 stays off); eval-harness DB corpus reader (launch checklist).

## Tasks — Flow 2 (recall log + stop faking grades)

- [ ] **T1: Schema + enums for `retrieval_events`.** `packages/database/src/schema/retrieval-events.ts` mirroring `assessments.ts`: `generateUUIDv7` PK; FK cascade `profileId`/`subjectId`/`topicId`; `sessionId` FK **`set null`** (permanent log, not session-owned); `answerEventId` uuid **no FK**; `promptText`/`learnerAnswer` text notNull; `quality` smallint; `verdict`/`nextAction`/`gradedBy` pgEnums; `rubricRationale`/`misconception` text null; `evidenceUsed` jsonb default `[]`; `llmRoutingRung` smallint null; `createdAt` defaultNow. **No `redactedAt`** (D-2=a → whole-row TTL, not in-place redaction). Enums: `retrieval_verdict('solid','partial','missing','misconception')`, `retrieval_next_action('advance','reschedule_soon','relearn','redirect_to_library')`, `retrieval_grader('llm','fallback_heuristic')`. Indexes: `(profileId,topicId)`, `(profileId,createdAt)` only — **no standalone `(profileId)` index** (C-5). Export from `schema/index.ts`. — **done when:** `tsc -b packages/database` green; `db.query.retrievalEvents` resolves.
- [ ] **T2: Generate migration 0124.** `pnpm db:generate:dev` → additive `0124_*.sql` (3 `CREATE TYPE` + 1 `CREATE TABLE` + 2 indexes; no drops). — **done when:** `pnpm db:migrate:dev` applies cleanly; immutability guard passes (only the new file added).
- [ ] **T3: `recordRetrievalEvent` writer + types.** New `apps/api/src/services/retrieval-events.ts` exporting `RecallGrade`, `RetrievalVerdict`, and `recordRetrievalEvent(db, fields)`. — **done when:** `retrieval-events.test.ts` round-trips a row with all enum/text/jsonb fields (real DB, no internal mocks).
- [ ] **T4: Deepen `evaluateRecallQuality`; delete the fabricating fallback.** Return `RecallGrade`; request structured JSON from the rung-1 call; parse with zod; **remove** both `answer.length>100?4:…` returns → `{ graded:false, gradedBy:'fallback_heuristic' }`. Eval-gate the prompt. — **done when:** T5 tests pass; `pnpm eval:llm` snapshot regenerated + staged; `pnpm eval:llm --live` returns a schema-valid grade.
- [ ] **T5: Sync site `processRecallTest` (capture + C-1 + C-2 + L-3).** Consume `RecallGrade`. `graded:true`: existing SM-2 path with `grade.quality` + `safeWrite(recordRetrievalEvent, 'retrieval.recall', …)` (`gradedBy:'llm'`, `nextAction` from the SM-2 decision; `sessionId`/`answerEventId` null — confirmed not in scope). `graded:false`: **restore the prior `lastReviewedAt`** captured before the cooldown claim (C-2), `safeWrite` a fallback row, emit the L-3 telemetry event, then `throw new UpstreamLlmError('recall grader unavailable','UPSTREAM_ERROR')` (C-1). — **done when:** `retention-data.test.ts` (8-test rewrite, see Tests) asserts: graded → one `llm` row + SM-2 advance; ungraded → one `fallback_heuristic` row, `easeFactor/intervalDays/repetitions/failureCount` **and** `lastReviewedAt` unchanged (claim restored), throws `UpstreamLlmError`; `safeWrite` failure does not throw out of grading (break test).
- [ ] **T6: Async site `handleReviewCalibrationGrade` (in-step capture, C-3, + EU-7 hook).** Keep the step return non-PII: call `recordRetrievalEvent` **inside** the step closure; cross the boundary with only `{ quality, verdict }` (C-3). `graded:true`: `processRecallResult` + capture (full population — `sessionId`, `answerEventId=learnerMessageEventId`, `subjectId=topic.subjectId`, `learnerAnswer=learnerMessageRow.content`). `graded:false`: apply the EU-7 cap (T12); if not capped, `applyRetentionUpdate({set:{nextReviewAt: now+1d}, guard:{kind:'none'}})`, capture fallback row, emit L-3 event, return `{skipped:'grader_unavailable'}`. Update the existing partial-state comment (lines 73-78) to cover this second case. — **done when:** `review-calibration-grade.test.ts` asserts both arms + that no PII field crosses the step boundary (assert the step's resolved value shape).
- [ ] **T7: Seed site `topic-probe-extract` (skip seed on fail).** Update `seedRetentionCard`: `const grade = await evaluateRecallQuality(...)`; on `graded:false` return null (no `buildRetentionSeed`); on `graded:true` use `grade.quality` (`buildRetentionSeed(grade.quality, …)`, `if (!seed) return grade.quality`). Keep the existing `// gc1-allow` mock (C-6); adapt its return to `RecallGrade`. — **done when:** `topic-probe-extract.test.ts` asserts an injected `graded:false` leaves the new card unseeded (`repetitions:0`, no `nextReviewAt`).
- [ ] **T12: EU-7 consecutive-fallback cap (L-1).** Before an async fallback reschedule (T6), read the most-recent `retrieval_events` row for `(profileId, topicId)`; if its `gradedBy === 'fallback_heuristic'`, **do not reschedule again** (leave the card's existing schedule) so a flaky grader can't trap a mastered topic in a daily loop. Still log the new fallback row. — **done when:** `review-calibration-grade.test.ts` asserts a second back-to-back fallback does **not** move `nextReviewAt`.
- [ ] **T13: Warm sync fallback copy + answer preservation (L-2).** In the recall-test screen, on the `UPSTREAM_ERROR`/grader-unavailable case render warm, answer-preserving copy ("Got your answer — I couldn't check it just now. Try again, or come back to it") with retry that re-submits the preserved answer (works because of C-2) and a graceful "come back later" secondary. Add the i18n key(s) via static `t()` (C-8). — **done when:** a recall-test screen test renders the warm copy on a 502 grader error and the typed answer survives a retry; i18n guards pass.
- [ ] **T8: EU-3 retention cron (C-4 + D-2=a).** New `retrieval-events-retention-cron.ts` (`inngest.createFunction`, cron `0 5 * * *`): bulk `DELETE FROM retrieval_events WHERE createdAt <= now-37d` (whole-row TTL per D-2=a — both free text and structured fields expire together; nothing durable on a minor). Standalone cron (not folded into `transcript-purge-cron.ts`, which is a finder + fan-out — C-4). — **done when:** `retrieval-events-retention-cron.test.ts` asserts a >37-day row is deleted and a <37-day row untouched.

## Tasks — Flow 3 (merged relearn queue, server-side)

- [ ] **T9: Schema — reason tag.** `packages/schemas/src/progress.ts`: `overdueTopicSchema` += `reason: z.enum(['overdue','flagged_weak','both']).optional()`, `concept: z.string().optional()`. — **done when:** `tsc -b packages/schemas` green; existing consumers still typecheck (optional → backward-compatible).
- [ ] **T10: Merge + reason-tag in `getOverdueTopicsGrouped`.** Add a `needs_deepening_topics` read (status `IN ('active','pending_review')`) via the sanctioned parent-chain join enforcing `subjects.profileId = profileId`, joining `curriculum_topics`/`subjects` for title/name. Union with overdue; dedup by `topicId` (`both`/`overdue`/`flagged_weak`); attach `concept` when present. Extend the overdue SELECT with `lastReviewedAt`,`intervalDays`; order by `getRetentionStatus()` band (RR-5), flagged-only rows by needs-deepening recency. Self-pick default unchanged (EU-5). — **done when:** `overdue-topics.test.ts` asserts both-tagged dedup, flagged-only tag, band order, and a second-profile scoped-read break test.
- [ ] **T11 (DEFERRED per L-4):** mobile relearn reason-line render + 7-locale `relearn.reason*` copy — NOT built this slice; revisit post-RR-12 when rows differ. Recorded here so the server-side `reason` tag has a known consumer later.

## Tests (keyed by task)

- **T5 (rewrite of `retention-data.test.ts:2125-2351` — 8 tests, C-7):** the ~5 char-count fallback assertions (`toBe(3)`/`toBe(2)` at lines 2220/2241/2262/2283/2304/2325) test behavior we delete — case (b) "behavior genuinely changed": rewrite to the new contract (grader failure → `UpstreamLlmError` at the sync site; `RecallGrade` from `evaluateRecallQuality`), never weakened. Add the graded/ungraded/`lastReviewedAt`-restored/`safeWrite`-failure arms.
- **T6/T12/T7/T8:** real-DB arms where exercisable; external LLM mocked at the provider boundary only (T7 keeps its `gc1-allow`). T6 additionally asserts the non-PII step-boundary shape (C-3).
- **T10:** scoped-read break test mandatory.

## Migration & Rollback

- **Forward:** one additive migration 0124 (3 enums + `retrieval_events` + 2 indexes). No drops. Apply before deploying read/write code.
- **Rollback:** drop `retrieval_events`, then the 3 enums. Pre-launch data is test-only → no production loss. Grade-site + cron + queue changes are pure code (revert by deploy).

## Verification (before any commit)

- `nx run api:typecheck` + `api:lint`; `tsc -b packages/database packages/schemas`.
- `nx run api:test` (touched suites); `nx test:integration api` (api/db-schema/shared-schemas classes triggered).
- `pnpm eval:llm` (staged) + `pnpm eval:llm --live` for the T4 grader-prompt change.
- Mobile: `jest --findRelatedTests <recall-test files> --no-coverage` + `tsc --noEmit`; i18n guards.
- `bash scripts/check-change-class.sh --branch`.

## Sequencing

Flow 2 first (T1→T2→T3→T4 → T5/T6/T12/T13 → T7 → T8), then Flow 3 (T9→T10). Commit at phase boundaries (schema+migration; grader+capture; EU-7+warm-fallback; redaction; queue read). Nothing flips a production flag.
