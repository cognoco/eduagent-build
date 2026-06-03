---
title: ADR Register Cleanup — Eliminate the Architecturally-Wrong Decisions — Implementation Plan
date: 2026-06-03
profile: change
spec: docs/ADR-register-draft.md
status: draft
---

# ADR Register Cleanup — Eliminate the Architecturally-Wrong Decisions

**Goal:** Remove the small set of register decisions that bake in real, present duplication or maintenance cost, and bring the register's status labels back in line with code.
**Approach:** A code-verified audit (2026-06-03, 15-agent workflow) confirmed that most flagged tensions are already-fixed or genuinely justified. This plan acts only on the findings that **STAND** against code. Phase 0 is a doc-only status reconciliation (executed immediately, low risk). Phases 1–7 are code changes ranked by leverage; each is independent and can be scheduled separately.

> **Source of truth for every claim below:** the audit findings in the workflow output, each re-verified by an adversarial pass with `file:line` citations. The "ideal" for each item was stress-tested — where the obvious dedup does **not** hold everywhere, the corrected ideal is encoded as the task (see the `⚠ holds-everywhere` notes).

## What this plan deliberately does NOT touch (audit refuted these as wrong)

Do not "fix" these — the obvious consolidation breaks a real constraint:

- **Two language enums** (I18N-12) — intentional UI⊆conversation superset, protected by a working `safeParse` clamp + DB CHECK. Collapsing drops cs/fr/it tutor-prose.
- **SM-2 algorithm** — already single-sourced in `packages/retention/src/sm2.ts`. Only the *table/adapter glue* is duplicated (Phase 6a/6b), never the math.
- **Three SM-2 *tables*** — keep them split (divergent FK chains: `curriculum_topics` vs `vocabulary` vs text-hash key). Do not merge.
- **Quiz questions JSONB blob** (QUIZ-06), **flat recap columns** (QUIZ-20) — both correct as-is (`nextTopicId` must stay a real FK).
- **`masteryVerificationState`** — the reference-correct server-derive→typed-schema→consume-once pattern; copy this pattern, don't change it.
- **Server vs client "Up Next"** — not actually duplicated; they answer different questions (only the register *wording* is wrong → fixed in Phase 0 T3).

## Scope

In scope:
- `docs/ADR-register-draft.md` (Phase 0, doc only)
- `packages/schemas/src/llm-envelope.ts`, `apps/api/src/services/assessments.ts`, `apps/api/src/services/summaries.ts` (Phase 1)
- `apps/mobile/src/hooks/**` + `apps/mobile/src/**/use-api-query.guard.test.ts` (Phase 2)
- `packages/schemas/src/` (new session-status predicates), `apps/api/src/services/**` + `apps/mobile/src/lib/progressive-disclosure.ts` (Phase 3)
- `apps/api/src/services/safe-non-core.ts` consumers / practice-activity ledger emit paths (Phase 4)
- `apps/api/src/routes/retention.ts`, `apps/api/src/routes/notes.ts` + `route-context.guard.test.ts` (Phase 5)
- `packages/retention/`, `packages/database/src/schema/quiz-mastery.ts` + migration, `apps/mobile/src/lib/parent-vocab.ts` + two list components, `packages/database/src/schema/progress.ts` (`learning_modes`) + migration (Phase 6)
- `apps/api/src/services/exchange-prompts.ts` + its golden-master test (Phase 7)

Out of scope:
- The refuted items listed above.
- `MODE_NAV_V0_ENABLED` / nav-contract V0 helpers (unrelated hard constraint).
- Any LLM prompt *behavior* change (Phase 1 is envelope plumbing + Phase 7 is a no-output-change refactor; both must leave rendered prompts/scores byte-identical except for the JSON envelope wrapper).

## Execution environment (read before any code phase)

- Do all code work on a **dedicated branch** created with `git checkout -b` — **not** a worktree. Mobile/jest phases (2, 3, 6c) hit the worktree jest haste-map pathology. Per repo rule, do not switch off `main` until you start; create the branch then.
- After any `apps/api/` change, run integration tests: `pnpm exec nx test:integration api` (pre-commit/pre-push skip `.integration.test.`).
- After any LLM-prompt-emitting change (Phase 1), run the eval harness: `pnpm eval:llm` (snapshot) and `pnpm eval:llm --live` (Tier-2 schema validation). The pre-commit hook does **not** run it.
- Dev schema iteration uses `pnpm run db:push:dev` + `pnpm run db:generate:dev`; committed migration SQL is required for staging/prod. Any column rename ships a `## Rollback` note.
- Subagents in the coordinator tree must not run git; the coordinator commits via `/commit`.

---

## Phase 0 — Register status reconciliation (doc only; execute first)

The dominant maintenance hazard is that the register mislabels shipped consolidations as `Designed` and describes two `Implemented` entries that have drifted from code. This misleads every downstream planner. All edits are in `docs/ADR-register-draft.md`; locate each entry by its `**ID**` marker (line numbers shift as you edit). Each relabel must be backed by re-confirming the cited code anchor before editing.

- [ ] **T1 — Relabel shipped consolidations `Designed → Implemented`.** Set status to *Implemented* for: PRACTICE-05, PRACTICE-06, PRACTICE-08, PRACTICE-09, PRACTICE-10 (ledger system is fully shipped — schema `packages/database/src/schema/practice-activity.ts:27-122`, migrations `apps/api/drizzle/0072_practice_activity_events.sql` / `0074` / `0081`, read path `practice-activity-summary.ts:100-124`, cron `weekly-progress-push.ts:211-227`, UI `PracticeActivitySummaryCard.tsx`); REF-01 (`findOwnedCurriculumTopic` in `curriculum-topic-ownership.ts:26`, ~80 refs), REF-03 (`assertOwnerProfile` in `family-access.ts:145-157`, ~26 sites), REF-05 (`format-relative-date` gold-standard ratchet). *Done when:* each listed entry reads `Implemented`, and each carries a one-line code anchor; a reviewer re-confirms every relabel against the cited file before it is committed (no relabel without a confirming `file:line`).

- [ ] **T2 — Rewrite PRACTICE-07 to match the inverted reality.** The decision text currently claims ledger inserts "must be atomic with their source write." Code does the opposite by design. Replace with: *"Practice-activity ledger inserts are intentionally NON-atomic best-effort (`safeWrite` post-commit, deduped by `(profileId,dedupeKey)` `onConflictDoNothing`) so a reporting-ledger failure never aborts the user action; `dictation/result.ts:82`, `retention-data.ts:956-983`, `session-exchange.ts:2681-2697`, `quiz/complete-round.ts:843`, `vocabulary.ts:360`. Only `celebration_events` is transactionally atomic (`celebrations.ts:116-145`, path already owns a SELECT-FOR-UPDATE tx). KNOWN GAP: `safeWrite` failure is Sentry-only — see Phase 4 / cross-ref the silent-recovery-ban."* Status: *Implemented (was inverted in the register)*. *Done when:* PRACTICE-07 describes the implemented behavior and names the Phase-4 gap.

- [ ] **T3 — Correct the two drifted `Implemented` descriptions.**
  - ASSESS-05 (currently "hard-overrides passed = masteryScore≥0.7"): replace with *"the invariant `passed === rawScore >= 0.7` is enforced by the schema refine (`llm-envelope.ts:122-133`), threshold from `LLM_ASSESSMENT_PASS_THRESHOLD` (`:105`); the parser trusts the post-parse boolean (`assessments.ts:613-616`), it does not recompute. `masteryScore` is the depth-capped score (recall 0.5 / explain 0.8 / transfer 1.0 via `calculateMasteryScore`), computed separately."* Cross-link LLM-P2.
  - STAB-40 (currently "identical backend + frontend-fallback rule"): replace with *"client-only 4-rule book-scoped precedence (`apps/mobile/src/lib/up-next-topic.ts:40-128`); the server resume-target (`progress.ts:1633-1747`) is a separate, broader cross-subject continuity rule — they are NOT identical and must not be forced to parity."*
  *Done when:* both entries match current code 1:1; no `masteryScore≥0.7` / "identical … rule" phrasing remains.

- [ ] **T4 — Document the real open debt as such.**
  - C-10 (line ~57): add a paragraph naming **assessment evaluation** (`parseAssessmentEvaluation`/`llmAssessmentEvaluationSchema`) and **summary evaluation** (`parseSummaryEvaluation`/`llmSummaryEvaluationSchema`) as **state-driving flows currently outside the envelope — deferred LLM-05 debt, NOT sanctioned carve-outs**, pointing to Phase 1 of this plan. This stops reviewers reading them as either silent violations or legitimate exceptions.
  - PROF-27: soften "web client must replicate mapping" to a forward-looking note ("no web client exists today; if one is added, lift only the numeric thresholds into `@eduagent/schemas`, not the copy").
  - CR-01 and REF-06/REF-07: append an explicit deferral marker (the burn-down/rename has no tracked WI yet → see Phases 2/5/6d). Keep REF-06/REF-07 status as-is but add *"ratchet frozen; burn-down not scheduled — see plan 2026-06-03-adr-register-cleanup."*
  *Done when:* C-10 lists the two deferred-debt flows, PROF-27 is forward-looking, and CR-01/REF-06/REF-07 carry a deferral pointer.

---

## Phase 1 — Migrate assessment + summary LLM evaluations onto the envelope

The cleanest "design is wrong" finding: two **state-driving** LLM evaluations parse bespoke JSON outside `parseEnvelope()`, violating the LLM-05 non-negotiable and maintaining two parallel parser/validation/telemetry/eval surfaces. Feasibility is proven by the existing `evaluate_assessment`/`teach_back_assessment` signals. **⚠ holds-everywhere:** the bespoke parser cannot be deleted first — no envelope signal models these shapes today, so the order is **extend → migrate → delete**. *Profile note: code (red-green) tasks.*

- [ ] **T5 — Add a `depth_assessment` signal to the envelope.** In `packages/schemas/src/llm-envelope.ts` `signalsSchema` (~`:222-260`), add an optional `depth_assessment` object whose fields are the **verbatim field set of the current `llmAssessmentEvaluationSchema`** (read it first; do not invent fields — `raw_score`, `quality_rating`, `passed`, `should_escalate_depth`, `weak_areas: string[].max(8)`), carrying the **existing `.refine`** `passed === raw_score >= LLM_ASSESSMENT_PASS_THRESHOLD` (mirror the shape/placement of `evaluate_assessment` at `:144-198`). *Done when:* a new case in the envelope schema test asserts the refine **rejects** a `passed`/`raw_score` mismatch and accepts a matching pair (write it red against the absent field first).

- [ ] **T6 — Add a `summary_evaluation` signal to the envelope.** Same file: optional `summary_evaluation` with the verbatim field set of `llmSummaryEvaluationSchema` (`is_accepted`, `has_understanding_gaps`, `gap_areas: string[].max(8)`) and the existing "accepted excludes gaps" invariant (mirror `:96-102`). *Done when:* the schema test asserts `is_accepted && has_understanding_gaps` is rejected.

- [ ] **T7 — Switch assessment evaluation to the envelope.** Change `ASSESSMENT_EVAL_SYSTEM_PROMPT` (`assessments.ts:89-118`) to instruct the model to emit the standard envelope with `signals.depth_assessment`. Replace `parseAssessmentEvaluation`'s `extractFirstJsonObject + llmAssessmentEvaluationSchema.safeParse` body (`:565-677`) with `parseEnvelope()` reading `signals.depth_assessment`; keep `calculateMasteryScore` depth-cap and `resolveAssessmentStatus` (`:222-248`) server-side and unchanged. *Done when:* existing assessment service + route tests pass against the new parse path; `MAX_ASSESSMENT_EXCHANGES=4` cap (ASSESS-07) still terminates the flow; integration suite green.

- [ ] **T8 — Switch summary evaluation to the envelope.** Same transformation for `SUMMARY_EVAL_SYSTEM_PROMPT` (`summaries.ts:69-89`) and `parseSummaryEvaluation` (`:145-222`) → `parseEnvelope()` reading `signals.summary_evaluation`. *Done when:* `evaluateSummary` callers see identical `{isAccepted, hasUnderstandingGaps, gapAreas}`; summary service tests green.

- [ ] **T9 — Delete the bespoke schemas + add a LLM-09 break test.** Remove `llmAssessmentEvaluationSchema` and `llmSummaryEvaluationSchema` and the two "mirrors the pattern" comments (`assessments.ts:37`, `summaries.ts:146`); move any cross-field invariant onto the new signal refines (done in T5/T6). Add a break test per signal: feed a wrong/contradictory signal and assert the server falls back to the conservative closed state (per LLM-P2). *Done when:* `grep -r 'llmAssessmentEvaluationSchema\|llmSummaryEvaluationSchema'` returns only deletions; typecheck green; both break tests pass, and reverting the refine makes them fail (red-green confirmed).

- [ ] **T10 — Forward-only guard against the pattern returning.** Add a guard test (sibling to `safe-non-core.guard.test.ts`) that fails CI when any `apps/api/src/services/**/*.ts` combines `extractFirstJsonObject(` with a private `*EvaluationSchema` for a state-driving flow. *Done when:* the guard fails on a synthetic offender and passes on the cleaned tree.

- [ ] **T11 — Eval-harness validation + register update.** Run `pnpm eval:llm` and `pnpm eval:llm --live`; update snapshots (staged, per the pre-commit check). Flip the C-10 note (Phase 0 T4) and the assessment/summary entries to *Implemented (on envelope)*. *Done when:* `--live` validates real responses against `expectedResponseSchema`; snapshots staged; register reflects the migration.

---

## Phase 2 — `useApiQuery` ratchet: make it merge-safe and start the burn-down (REF-06)

`useApiQuery` has 3 adopters but ~93–98 inline `combinedSignal(` read-query sites are frozen by a ratchet that has never decremented (baseline drifted `91→93` via merge conflict). The hazard is a ratchet that manufactures false confidence while ~90 sites stay duplicated. **⚠ holds-everywhere:** a handful of streaming/paginated hooks legitimately don't fit the wrapper — allowlist them explicitly; do not force-migrate.

- [ ] **T12 — Make the baseline strictly decreasing and merge-safe.** In `use-api-query.guard.test.ts`, change the assertion so any value **above** the recorded baseline fails, and add a header comment mandating "on merge conflict, take the LOWER baseline value." *Done when:* the guard fails when `BASELINE` is artificially raised by 1; passes at the current count.

- [ ] **T13 — Migrate the highest-leverage hook file.** Convert `use-progress.ts` (~24 `combinedSignal(` sites) to `useApiQuery<TResp,TData>`; lower `BASELINE` by exactly the number migrated. *Done when:* `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-progress.ts --no-coverage` green; ratchet green at the lowered baseline.

- [ ] **T14 — Migrate the next batch.** Convert `use-settings.ts` (7), `use-dashboard.ts` (6), `use-sessions.ts` (6), `use-notes.ts` (5), decrementing `BASELINE` per file. Streaming/paginated/`useInfiniteQuery` hooks that cannot use the wrapper go into an explicit `STREAMING_ALLOWED` set in the guard with a one-line reason each. *Done when:* per-file jest green; baseline reflects every migration; allowlist documents each exception.

- [ ] **T15 — Schedule the remainder.** Add a tracked WI ID + owner + target date to the guard-test header for the remaining sites. *Done when:* the header links a Notion WI (Issue Tracker, not Fleet) and the register REF-06 note points to it.

---

## Phase 3 — Unify the two "session counts" definitions (MISC-32/33, STAB-32, PROG-32)

Two semantically-different definitions of "a session that counts" are scattered across ~17 sites with no shared predicate: `status !== 'active'` ("attempted", **includes** paused) at 3 comment-synced sites, and `['completed','auto_closed']` ("terminal", **excludes** paused) inlined at ~14 sites — while the canonical helper `isTerminalSessionStatus` has exactly one caller. **⚠ holds-everywhere:** the two definitions *should* differ (paused is attempted-but-not-terminal); the fix is **two named predicates, not one** — collapsing them is a behavior bug. Drizzle `inArray(...)` WHERE clauses need the constant array, not the boolean.

- [ ] **T16 — Define canonical predicates in one shared module.** In `@eduagent/schemas` (so both api and mobile consume it, as `NEW_LEARNER_SESSION_THRESHOLD` already does), export:
  ```ts
  export const TERMINAL_SESSION_STATUSES = ['completed', 'auto_closed'] as const // for Drizzle inArray
  export function isTerminalSessionStatus(status: string): boolean // completed | auto_closed
  export function countsAsAttempted(status: string): boolean // status !== 'active' (includes paused)
  ```
  Each with a doc comment stating **why** paused is in/out. Re-export `isTerminalSessionStatus` from `topic-completion.ts` for back-compat. *Done when:* unit tests assert `countsAsAttempted('paused') === true`, `isTerminalSessionStatus('paused') === false`, and both agree on `completed`/`active`.

- [ ] **T17 — Sweep the inline terminal-status sites.** Replace inline `['completed','auto_closed']` / `=== 'completed' || === 'auto_closed'` with `TERMINAL_SESSION_STATUSES` (inside `inArray`) or `isTerminalSessionStatus` (boolean) at: `session/session-book.ts:78`, `session-subject.ts:39`, `session-topic.ts:39`, `session-context-builders.ts:239`, `retention-data.ts:662`, `curriculum.ts:488,622`, `solo-progress-reports.ts:43`, `filing-stranded-backfill.ts:79`, `progress.ts:1571,1663`, `family-bridge.ts:334`, `session-exchange.ts:1290`, `packages/database/src/repository.ts:130`. *Done when:* `grep -rn "'completed', 'auto_closed'\|'completed','auto_closed'"` over `apps/api/src` + `packages/database/src` returns only the predicate module; `pnpm exec nx test:integration api` green (no behavior change).

- [ ] **T18 — Replace the comment-synced `!== 'active'` sites.** Swap the inlined predicate at `apps/mobile/src/lib/progressive-disclosure.ts:4-6`, `apps/api/src/services/snapshot-aggregation.ts:330`, `apps/api/src/services/dashboard.ts:411-417` for `countsAsAttempted`, and **delete the `// SYNC:` comments**. *Done when:* `grep -rn "// SYNC:"` in those files returns nothing; progressive-disclosure + snapshot tests still pass (`totalSessions` count unchanged).

- [ ] **T19 — Ratchet against regressions.** Add a forward-only guard test (mirroring `persona-fossil-guard.test.ts`) failing CI on new inline session-status literals or new `status !== 'active'` comparisons outside the predicate module. *Done when:* the guard fails on a synthetic offender, passes clean.

---

## Phase 4 — Close the PRACTICE-07 silent-recovery gap

The non-atomic ledger design is correct, but `safeWrite` failure is Sentry-only (`safe-non-core.ts:111-128` does `captureException` + `logger.error`, no metric/event), so undercounting is not queryable — violating CLAUDE.md "silent recovery without escalation is banned." Mirror the RLS-02 precedent (`db.transaction.fallback.unsupported` structured metric). *Profile note: code (red-green).*

- [ ] **T20 — Emit a structured, queryable failure signal on ledger-write failure.** In the practice-activity ledger emit path (`recordPracticeActivityEvent` / `recordSessionPracticeActivityEvent` catch), emit a structured Inngest observability event `app/practice_ledger.write_failed` (IDs only — `profileId`, `sourceType`, `dedupeKey`; never narrative) via `safeSend()` **before** the Sentry capture, so the failure rate is dashboard-queryable. The user action must still succeed. *Done when:* a break test forces the insert to throw and asserts the event fires AND the surrounding request returns success (red-green: revert the emit, watch the assertion fail); register PRACTICE-07 (Phase 0 T2) gap note flipped to "closed."

---

## Phase 5 — Continue the `withProfile` burn-down past 108 (REF-07)

The 199→108 sweep is the good ratchet-with-burndown pattern but stalled: ~108 inline `requireProfileId(c.get('profileId'))` sites remain across 27 files with no scheduled continuation. **⚠ holds-everywhere:** ~12 webhook/health/seed routes have no profile auth (correctly never call `withProfile`), and a minority of handlers unwrap inside a whole-handler `try/catch` where `withProfile`'s throw semantics change error→status mapping (the `dashboard.ts:205-208` carve-out) — review, don't bulk-replace.

- [ ] **T21 — Migrate the next fat targets.** Convert inline `requireProfileId(c.get('profileId'))` → `withProfile(c)` in `routes/retention.ts` (12) and `routes/notes.ts` (10); lower `BASELINE` in `route-context.guard.test.ts` per file, extending its existing decrement-history block. Skip and annotate any try/catch-wrapped handler. *Done when:* per-file baseline decrement; `pnpm exec nx test:integration api` green.

- [ ] **T22 — Schedule the remainder.** Add a tracked WI ID + owner + date to the guard header; point register REF-07 at it. *Done when:* header links the WI.

---

## Phase 6 — Tier-2 quick wins

Independent, cheap, low-risk. Any order.

- [ ] **T23 — Extract one SM-2 card adapter (QUIZ-12 glue, not the tables).** Add `applySm2ToCard(card, quality)` to `packages/retention` that performs the `interval/intervalDays` + `Date↔ISO` mapping once; replace the four copy-shaped call sites: `mastery-provider.ts:48-65`, `vocabulary.ts:282-291`, `retention-data.ts:1508-1519`, `retention.ts:82-91`. Do **not** merge the three card tables. *Done when:* the four sites call the adapter; `packages/retention` unit tests green; SM-2 math untouched (still only in `sm2.ts`).

- [ ] **T24 — Rename `quiz_mastery_items.interval → interval_days`.** End the two-names-one-concept split. Migration: `ALTER TABLE quiz_mastery_items RENAME COLUMN "interval" TO interval_days;` update `packages/database/src/schema/quiz-mastery.ts:30` + Drizzle snapshot; update reads (`mastery-provider.ts`). **## Rollback:** `ALTER TABLE quiz_mastery_items RENAME COLUMN interval_days TO "interval";` — pure rename, no data loss. *Done when:* migration applied to dev (`db:push:dev` + `db:generate:dev`), `grep -rn "\.interval\b"` over quiz-mastery reads is clean, typecheck + retention tests green.

- [ ] **T25 — Extract the parent retention-visibility predicate.** Add `shouldShowParentRetention(retentionStatus, totalSessions, completionStatus): boolean` to `apps/mobile/src/lib/parent-vocab.ts` mirroring the gate; replace the byte-identical inlined predicates at `AccordionTopicList.tsx:129-131` and `child/[profileId]/subjects/[subjectId].tsx:232-234`. **⚠ holds-everywhere:** use a dedicated boolean — NOT `getParentRetentionInfo(...) !== null` (that gates stricter via its switch default and types `completionStatus` as non-optional). *Done when:* both sites call the predicate; `grep` shows no inline copy; `jest --findRelatedTests` for both components green.

- [ ] **T26 — Rename the misnamed `learning_modes` table (CR-01).** It holds only `medianResponseSeconds` + `celebrationLevel`. Migration: `ALTER TABLE learning_modes RENAME TO learner_session_settings;` rename the Drizzle binding `learningModes → learnerSessionSettings` (`progress.ts:183-201`) and type `LearningModeRecord → LearnerSessionSettings` (`settings.ts:41-44`); sweep `settings.ts` call sites and the GDPR export (`export.ts:319-320,469`). **⚠ blast radius:** the GDPR export JSON key changes — safe **only** because there are no production users yet (re-verify `project_pre_launch_no_users` before applying). **## Rollback:** rename back; no data loss. *Done when:* `grep -rn "learning_modes\|learningModes\|LearningModeRecord"` returns zero; export test updated; integration + typecheck green; CR-01 marked resolved.

---

## Phase 7 — Decompose the `buildSystemPrompt` monolith (LLM-19)

`buildSystemPrompt` is one 785-line function with 64 inline `sections.push(` (`exchange-prompts.ts:471-1255`) — a real merge-conflict/navigation tax. This is a **no-output-change refactor** gated by the existing 894-line golden-master. **⚠ holds-everywhere:** it must stay an **ordered** composition — order-dependent invariants exist (voice-brevity block before envelope `:1224`; envelope instruction strictly last `:1242`) plus mode gates (`isLanguageMode`/`isRecitation`/`isReviewMode`). Not a flat unordered registry. LLM-23's generic `PromptBuilder<Input>` stays deferred (not load-bearing).

- [ ] **T27 — Confirm the golden master pins output.** Verify `exchange-prompts.test.ts` covers a representative `ExchangeContext` matrix by mutating one section's literal and watching it fail. *Done when:* a deliberate one-character change to a section makes the golden master fail (proving coverage), then is reverted.

- [ ] **T28 — Split into ordered pure section-builders.** Refactor `buildSystemPrompt` into an ordered array of `(ctx: ExchangeContext) => string | null` builders (null = omit) composed by a thin driver that filters nulls and `join('\n\n')`; keep mode gates as guards inside the relevant builders; preserve emission order and the two strict-ordering invariants. *Done when:* the golden master passes **byte-for-byte** (zero output diff); the function body is a driver + N named builders; `pnpm eval:llm` snapshot unchanged.

---

## Sequencing & dependencies

- **Phase 0** is independent and ships first (doc only).
- **Phases 1, 2, 3, 4, 5, 6, 7** are mutually independent — schedule by leverage: **1 → 3 → 2 → 4 → 5 → 6 → 7**. (1 removes a non-negotiable violation; 3 fixes the widest scatter; 2 the largest frozen surface; 7 is highest-effort/lowest-urgency.)
- Phases 2, 3(mobile half), 6c are mobile/jest → run on a branch, not a worktree.
- Phases 1, 3, 4, 5 touch `apps/api` → integration tests gate each.

## Self-review (done)

- **Coverage:** every STANDS finding from the audit maps to a task — bespoke parsers→P1, useApiQuery→P2, session-status split→P3, PRACTICE-07→P0 T2+P4, withProfile→P5, prompt monolith→P7, SM-2 glue→P6a/b, retention predicate→P6c, learning_modes→P6d, ASSESS-05/STAB-40/status mislabels→P0. Refuted findings are explicitly excluded with reasons.
- **No deferred decisions:** envelope signal shapes, predicate signatures, migration SQL, and the rollback notes are all spelled out; "mirror the existing schema field set" points at a concrete source rather than inventing fields.
- **Name consistency:** `countsAsAttempted` / `isTerminalSessionStatus` / `TERMINAL_SESSION_STATUSES` (P3), `applySm2ToCard` (P6a), `shouldShowParentRetention` (P6c), `depth_assessment` / `summary_evaluation` (P1) used consistently across tasks and the §sequencing map.
