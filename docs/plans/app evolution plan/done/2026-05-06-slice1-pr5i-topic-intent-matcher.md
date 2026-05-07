# Slice 1 PR 5i — Match First Topic To Learner Intent

**Date:** 2026-05-06
**Status:** Shipped (revised after adversarial review — collapsed onto existing infra)
**Branch:** `app-ev` (next on top of 5a/5b/5g)
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § J and Slice 1 row 5i
**Wave:** Wave 2 (parallel-safe with 5c, 5e)
**Size:** S (was M — see "Size revision" at bottom)

---

## Goal (from audit)

> When a learner creates a subject with a topic-grain prompt ("how are chemical reactions created", "verb conjugation in Italian", "the Battle of Hastings"), the first turn lands on a topic that matches that prompt — not on whichever topic ended up first by sort order.

Without this PR, the audit's teach-first win unravels for any topic-grain learner: a learner who typed "chemical reactions" gets taught about something else first because the server picks `sortOrder=1`.

**Design rule (from review):** reuse what already exists. `subjects.rawInput` is already persisted on subject create (`schemas/subjects.ts:56`, also surfaced on `subjectSchema`). The matcher reads it directly. No new column, no resolver-prompt change, no mobile pass-through, no schema additions to `subjectResolveResultSchema` or `subjectCreateSchema`.

## Acceptance

- `firstCurriculumSessionStartSchema` accepts an optional `topicId` (explicit pick beats inferred). No `topicHint` field — the server reads `subjects.rawInput` directly when it needs the learner's intent.
- Server-side: a new intent-aware matcher runs **exactly once** per `startFirstCurriculumSession` call, after pre-warm completes, scores materialized topics against `subjects.rawInput` via a single small LLM call, selects the best match if confidence clears a floor; falls back to the existing `sortOrder=1` pick otherwise.
- Ambiguous / non-topic-grain inputs ("Chemistry", "Italian", "History") still land on the curriculum's intended starting point — the matcher returns null match for broad inputs (rule embedded in matcher prompt).
- Eval-harness coverage: ~10 representative `rawInput` strings against a known curriculum.
  - **Tier 1** snapshots the prompt response shape.
  - **Tier 2 (live) is included** — the value of this feature is matcher correctness, not response shape; Tier 1 alone cannot detect a model regression where indices map wrong. [HIGH-6]
- Regression test asserts the matcher LLM call count is **exactly 1** per `startFirstCurriculumSession` invocation (prevents the loop-call disaster described in step 2 below). [HIGH-7]
- Relearn path is explicitly out of scope — `retention-data.ts:858-873` already has `topicId` at entry, matcher does not run there.

---

## Current state (verified 2026-05-06)

### Schema — `packages/schemas/src/subjects.ts:34-63`

`subjectCreateSchema` already accepts `rawInput: z.string().trim().min(1).max(200).optional()`. `subjectSchema` already exposes `rawInput: z.string().nullable().optional()`. The DB column already exists. **No schema additions on the subjects side.**

### Schema — `packages/schemas/src/sessions.ts:246-253`

```ts
export const firstCurriculumSessionStartSchema = sessionStartSchema
  .omit({ subjectId: true, topicId: true, metadata: true, rawInput: true })
  .extend({
    bookId: z.string().uuid().optional(),
  });
```

The `omit` strips `topicId`. We add it back as optional so an explicit caller pick (deep-link, retry from a paused state, future product flows) wins over the matcher.

### API — `apps/api/src/services/session/session-crud.ts:251-292`

```ts
async function findFirstAvailableTopicId(
  db: Database, profileId: string, subjectId: string, bookId?: string
): Promise<string | undefined> {
  ...
  const [topic] = await db.select(...).orderBy(asc(curriculumTopics.sortOrder), ...).limit(1);
  return topic?.id;
}
```

Pure sort-order pick. Called from `startFirstCurriculumSession:324-367` inside the pre-warm poll loop. The matcher is a separate function that runs **once after** the loop exits, never inside it.

### LLM stack — `apps/api/src/services/subject-resolve.ts:72-89`

The existing prompt-injection pattern is `<named_tag>${escapeXml(rawInput)}</named_tag>` (`[PROMPT-INJECT-3]`). The matcher reuses this pattern — see step 2 below. `routeAndCall(messages, 1)` is the existing LLM call helper.

### Subject resolve — `apps/api/src/services/subject-resolve.ts`

**Unchanged in this PR.** The resolver still extracts `focus`/`focusDescription`. We do not introduce a `topicHint` field.

### Relearn anomaly — `apps/api/src/services/retention-data.ts:858-873`

Direct insert; does not call `startSession` or `findFirstAvailableTopicId`. Already has `input.topicId` because relearn always knows the topic at entry. The matcher cannot affect relearn — and is not supposed to. Documented in the PR description for the next contributor (see step 5). Inventory reference: `docs/flows/mobile-app-flow-inventory.md` LEARN-15. [LOW-1]

---

## Files to change

### Schemas
- `packages/schemas/src/sessions.ts` — extend `firstCurriculumSessionStartSchema` with `topicId: z.string().uuid().optional()`. **One field, one file.** No subject-side schema changes.

### API
- `apps/api/src/services/session/session-crud.ts` — add a new `matchTopicByIntent(...)` function and refactor `startFirstCurriculumSession` so the matcher runs once after the pre-warm loop exits. See step 2.
- `apps/api/src/routes/sessions.ts` — `firstCurriculumSession` route handler at line 133 already validates against `firstCurriculumSessionStartSchema`. With the schema extension, no route changes beyond passing `topicId` through.

### Mobile
- **No mobile changes.** The matcher's signal (`subjects.rawInput`) is already on the row by the time `startFirstCurriculumSession` runs. `interview.tsx:transitionToSession()`, `language-setup.tsx`, and `create-subject.tsx` all stay untouched.
  - `language-setup.tsx` — confirmed skip: language subjects use CEFR-A1 first-topic heuristic, not intent matching. [MEDIUM-5]

### Eval harness
- `apps/api/eval-llm/scenarios/topic-intent-matcher.test.ts` — new scenario file with ~10 (rawInput, expected matched topic) pairs against a fixed curriculum fixture. **Both Tier 1 and Tier 2.** Tier 2 asserts matched-topic-title from `expectedResponseSchema`. [HIGH-6]

---

## Implementation steps

1. **Schema change.** Add optional `topicId` to `firstCurriculumSessionStartSchema`. Run `pnpm exec nx run @eduagent/schemas:typecheck`, then mobile + API typechecks.

2. **Matcher implementation in `session-crud.ts`.**

   **CRITICAL structural constraint:** The matcher must run **once**, outside the poll loop — not inside it. The current poll loop (`startFirstCurriculumSession:324-367`) calls `findFirstAvailableTopicId` on every 750ms iteration. If the matcher replaced that inner call with an LLM call, a 25s pre-warm window would fire up to ~33 LLM calls per session start. [CRITICAL-1]

   Required loop restructure:
   - Keep the existing inner poll exactly as-is — `findFirstAvailableTopicId` + `loadLatestCompletedDraftSignals` in parallel. **No LLM call in the loop.**
   - The poll loop exits unchanged when `topicId && extractedSignals` are both ready.
   - **After exiting the loop successfully**, run `matchTopicByIntent(...)` exactly once before calling `startSession`. If the matcher returns a topicId, use that; otherwise keep the sort-order pick from the loop. [CRITICAL-2]

   Regression test (required before merge): unit test in `session-crud.test.ts` that mocks the matcher and asserts call count is exactly 1 across a poll loop simulating multiple iterations. Without this guard, a future contributor moving the matcher back into the loop will not be caught by review. [HIGH-7]

   `matchTopicByIntent` logic (called once, NOT inside the loop):

   - **If `input.topicId` is provided**: verify ownership via the **full 4-table chain** — `profileId → subjects → curricula → curriculumTopics` with `eq(subjects.profileId, profileId)` — matching the guard at `startSession:172-189`. If the check fails, throw `Error('Topic not found in this subject')` (same as `startSession`). Do not silently fall through to sort-order for a supplied `topicId`. [HIGH-2]

   - **Else**, read `subjects.rawInput` for this subject. If empty/null, fall back to sort-order (`fallbackReason: 'no-input'`). Otherwise:
     - Pull all materialized topics for `(subjectId, bookId?)` via **direct `db.select()` with parent-chain `profileId` enforcement** — same pattern as `findFirstAvailableTopicId:276-291`. Do **not** use `createScopedRepository` here; the join requires the parent chain. [MEDIUM-9]
     - **No minimum topic count.** The matcher handles 1..N topics fine; for tiny topic lists it just returns null match more often. [MEDIUM-8]
     - Construct messages reusing the existing prompt-injection pattern — `<learner_input>${escapeXml(rawInput)}</learner_input>` and topics as `<topic id="…">${escapeXml(title)}</topic>`. Same `escapeXml` import as `subject-resolve.ts:72-89` and `language-detect.ts:49`. [MEDIUM-6]
     - Send to `routeAndCall(messages, 1)` (existing LLM stack — no new infra). System prompt asks for `{ matchTopicId: string | null, confidence: number }` in 0..1, with the boundary rule: "If the input is a broad subject name with no topic-grain phrase ('Chemistry', 'Italian', 'History', 'Geography of Egypt'), return `null`."
     - **Hard timeout `MATCHER_TIMEOUT_MS = 1500`** via `Promise.race` — on timeout, fall back to sort-order with `fallbackReason: 'timeout'`. [HIGH-5]
     - Select the matched topic only if `confidence >= MATCH_CONFIDENCE_FLOOR` (default `0.6`). Otherwise fall back with `fallbackReason: 'low-confidence'`.

   - Telemetry on every matcher decision — log `{ selectedTopicId, confidence, fallbackReason, matcherLatencyMs, firstSessionTotalMs }` as a structured log entry. `fallbackReason` is an enum: `'no-input' | 'no-match' | 'low-confidence' | 'timeout' | 'flag-off' | 'matcher-error' | null`. `firstSessionTotalMs` (poll-wait + matcher latency) is logged alongside so post-deploy we can see end-to-end first-session-start p95 across the flag flip without joining log streams. [MEDIUM-3] [HIGH-5] [MEDIUM-7]

   Feature flag: `MATCHER_ENABLED` — add to the **typed config module** (not raw `process.env` — required by eslint G4 in CLAUDE.md). Doppler key: `MATCHER_ENABLED`. Off by default for first deploy; flip in staging, soak ≥24h with telemetry visible, then prod. (No percent-rollout helper exists in the codebase; binary flag with a soak window is the existing pattern.) [MEDIUM-1]

3. **Eval scenarios.** Create `apps/api/eval-llm/scenarios/topic-intent-matcher.test.ts` with a fixture curriculum (e.g., a Chemistry subject with topics: "Atoms", "Periodic Table", "Chemical Reactions", "Acids and Bases", "Stoichiometry") and ~10 test inputs:
   - "how are chemical reactions created" → "Chemical Reactions"
   - "what is an atom" → "Atoms"
   - "I want to learn chemistry" → no match (low confidence) → falls back to sort-order
   - "verb conjugation in Italian" → tested against an Italian fixture, → "Verb conjugation"
   - "battle of hastings" → tested against a History fixture, → "Battle of Hastings"
   - 5 more covering edge cases (single-topic curricula, two-topic curricula, broad inputs, non-English inputs)

   Tier 1 snapshots the LLM response shape; **Tier 2 asserts the matched topic title** via `expectedResponseSchema`. Tier 2 must pass locally before merge; CI cadence for Tier 2 follows the existing eval-harness convention. [HIGH-6]

4. **Regression test for "matcher runs once outside the loop"** — see [HIGH-7] above; co-located in `session-crud.test.ts`.

5. **Document the relearn anomaly** in the PR description: relearn does not flow through `startSession` and is not affected by this PR, but any future centralized session-start logic must explicitly extend `retention-data.ts:858-873`. Reference: `docs/flows/mobile-app-flow-inventory.md` LEARN-15. [LOW-1]

---

## Out of scope (other PRs)

- `topicHint` extraction in the resolver — collapsed away; the matcher does its own topic-grain reasoning inline against the materialized topic list, no separate extraction step needed.
- Adding a numeric `confidence` field to `SubjectResolveResult` for the lighter-confirmation copy (PR 5a's deferred follow-up). Different field, different concern.
- Removing the `MATCHER_ENABLED` flag — separate small PR after the matcher proves itself in staging traffic.
- Percent-rollout gating for `MATCHER_ENABLED` — no existing helper in this repo; binary flag + staging soak is the existing pattern. Revisit if/when a rollout helper lands.
- Topic-intent matcher for relearn — relearn already has a topic; matcher does not apply.
- Updating `language-setup` to use the matcher — language subjects use a different first-topic heuristic; revisit later. [MEDIUM-5]

---

## Verification

- Schema typecheck: `pnpm exec nx run @eduagent/schemas:typecheck`
- API: `pnpm exec nx run api:typecheck` and `pnpm exec nx run api:test --testPathPattern='session-crud'`
- Mobile: `cd apps/mobile && pnpm exec tsc --noEmit` (no mobile code changed; this is a guard against schema-package re-export breakage)
- Lint: `pnpm exec nx run-many -t lint --projects=api,@eduagent/schemas`
- Eval harness Tier 1: `pnpm eval:llm` with the new scenarios — snapshots committed.
- Eval harness Tier 2: `pnpm eval:llm --live` for the matcher scenario — assert matched topic titles against `expectedResponseSchema`. [HIGH-6]
- Integration tests (required — CLAUDE.md rule: "Run integration tests when changing DB behavior or cross-package contracts"; blast radius is medium-high): `pnpm exec nx run api:test --testPathPattern='integration'` [HIGH-3]

---

## Risk and rollback

- **Blast radius:** medium-high. The matcher fires on every first-curriculum-session start when the flag is on. A bad matcher (e.g., picking topics that don't align with `rawInput`) regresses the very feature the audit aims to fix.
- **Latency budget:** matcher hard-timeout `MATCHER_TIMEOUT_MS = 1500` ms. Total first-session-start p95 target is +1500 ms over current; `firstSessionTotalMs` is logged on every decision so the actual impact is visible without log-joining. [HIGH-5]
- **Mitigations:**
  - `MATCHER_ENABLED` flag, off by default for first deploy. Flip in staging, soak ≥24h with telemetry visible, then prod.
  - Confidence floor (`0.6` default) keeps low-confidence matches from overriding sort-order. Tunable from telemetry.
  - Telemetry: granular `fallbackReason` enum (`no-input | no-match | low-confidence | timeout | flag-off | matcher-error | null`) + `confidence` + `matcherLatencyMs` + `firstSessionTotalMs` so both correctness regressions and latency regressions are diagnosable without recreating. [MEDIUM-3] [MEDIUM-7]
  - Prompt-injection wrapper on the matcher LLM call — `<learner_input>` + `<topic>` with `escapeXml`, mirroring `[PROMPT-INJECT-3]` at `subject-resolve.ts:79`. Crafted rawInput cannot coerce the matcher output. [MEDIUM-6]
- **Rollback paths (in order of speed):**
  1. Set `MATCHER_ENABLED=false` in Doppler — instant.
  2. Revert this PR — slower; recovers full state. **No migration to roll back** (no schema changes on the DB side).

---

## Wave dependencies

- **Depends on:** PR 5d (already merged) — the matcher needs materialized topics to score against. Without pre-warm, the matcher would fire against an empty topic list and always fall back to sort-order. With 5d, the topic list exists by the time `startFirstCurriculumSession`'s loop exits.
- **Parallel-safe with:** 5c (different file — `feature-flags.ts`), 5e (different file — `interview.tsx` mobile vs API session-crud).
- **Blocks:** none directly. Wave 3 E2E (5f) does not require 5i — that's about whether fast-path + language-setup + first session works mechanically. 5i is product polish on top.

---

## Size revision (M → S)

The original M sizing assumed: schema additions across 2 files, a new DB column + migration, resolver-prompt change with snapshot diffs, and mobile pass-through threading. The review collapsed all of that onto existing infra:

- No new column / no migration (use existing `subjects.rawInput`).
- No resolver-prompt change (matcher does inline topic-grain reasoning).
- No mobile changes (signal is already on the row server-side).
- One schema field (`topicId` on `firstCurriculumSessionStartSchema`).

What remains is one new function in `session-crud.ts`, a loop restructure (one extra call after exit), one eval scenario file (Tier 1 + Tier 2), one regression test, and a feature flag in the typed config. That is S.
