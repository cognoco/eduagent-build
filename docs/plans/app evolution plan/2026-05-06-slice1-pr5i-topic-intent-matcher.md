# Slice 1 PR 5i — Match First Topic To Learner Intent

**Date:** 2026-05-06
**Status:** Draft plan, ready to implement
**Branch:** `app-ev` (next on top of 5a/5b/5g)
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § J and Slice 1 row 5i
**Wave:** Wave 2 (parallel-safe with 5c, 5e)
**Size:** M

---

## Goal (from audit)

> When a learner creates a subject with a topic-grain prompt ("how are chemical reactions created", "verb conjugation in Italian", "the Battle of Hastings"), the first turn lands on a topic that matches that prompt — not on whichever topic ended up first by sort order.

Without this PR, the audit's teach-first win unravels for any topic-grain learner: a learner who typed "chemical reactions" gets taught about something else first because the server picks `sortOrder=1`.

## Acceptance

- A new optional `topicHint` field on `SubjectResolveResult` carries the resolver's best guess at a topic-grain hint extracted from `rawInput`.
- `firstCurriculumSessionStartSchema` accepts an optional `topicId` OR `topicHint`. The mobile client passes whichever is most specific.
- Server-side: a new intent-aware matcher scores materialized topics against `topicHint` (or the original `rawInput` when no `topicHint`) and selects the best match if confidence clears a floor; falls back to the existing `sortOrder=1` pick otherwise.
- Ambiguous / non-topic-grain inputs ("Chemistry", "Italian", "History") still land on the curriculum's intended starting point — i.e., when the matcher has no high-confidence match, behavior is unchanged.
- Eval-harness snapshot covers the matcher: ~10 representative `rawInput` strings against a known curriculum, asserting expected matches.
- **Relearn path is explicitly extended** so it doesn't silently miss the matcher (see "Relearn anomaly" below).

---

## Current state (verified 2026-05-06)

### Schema — `packages/schemas/src/subjects.ts:95-106`

```ts
export const subjectResolveResultSchema = z.object({
  status: subjectResolveStatusSchema,
  resolvedName: z.string().nullable(),
  focus: z.string().nullable().optional(),
  focusDescription: z.string().nullable().optional(),
  suggestions: z.array(subjectSuggestionSchema),
  displayMessage: z.string(),
  isLanguageLearning: z.boolean().optional(),
  detectedLanguageCode: languageCodeSchema.nullable().optional(),
  detectedLanguageName: z.string().nullable().optional(),
});
```

No `topicHint`. The resolver already extracts `focus` (book-grain, e.g. "Egypt" from "Geography of Egypt") — `topicHint` is one level finer.

### Schema — `packages/schemas/src/sessions.ts:246-253`

```ts
export const firstCurriculumSessionStartSchema = sessionStartSchema
  .omit({ subjectId: true, topicId: true, metadata: true, rawInput: true })
  .extend({
    bookId: z.string().uuid().optional(),
  });
```

The `omit` strips topic-grain inputs. We need to add them back as optional.

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

Pure sort-order pick. Called from `startFirstCurriculumSession` at line 326 with no intent hint.

### Subject resolve — `apps/api/src/services/subject-resolve.ts`

The resolver's LLM prompt already extracts `focus` and `focusDescription`. Adding `topicHint` is a structurally similar extraction — same prompt schema, additional optional field. The classifier mode is `direct_match | corrected | ambiguous | resolved | no_match`. `topicHint` is most useful for `resolved` (and possibly `corrected` when the original input had topic-grain detail).

### Relearn anomaly — `apps/api/src/services/retention-data.ts:858-873`

```ts
const [session] = await db.insert(learningSessions).values({
  profileId, subjectId, topicId: input.topicId,
  sessionType: 'learning', status: 'active',
  metadata: { effectiveMode: 'relearn' },
}).returning();
```

Direct insert. **Does not call `startSession` or `findFirstAvailableTopicId`.** It already has `input.topicId` because relearn always knows the topic at entry. This means the matcher cannot affect relearn — but more important: any future logic added to `startSession` must explicitly extend this path or be deliberately scoped to the first-curriculum-session call site only. **For 5i specifically, this is benign: relearn already has a topic, the matcher only runs when the caller does not. But the next contributor must be told.** Document this constraint in the PR description.

---

## Files to change

### Schemas
- `packages/schemas/src/subjects.ts` — add optional `topicHint: z.string().nullable().optional()` to `subjectResolveResultSchema`; also add optional `topicHint: z.string().max(200).nullable().optional()` to `subjectCreateSchema` (the mobile create mutation must send it — see Mobile section). [HIGH-1]
- `packages/schemas/src/sessions.ts` — extend `firstCurriculumSessionStartSchema` with optional `topicId: z.string().uuid().optional()` and `topicHint: z.string().max(200).optional()`.

### API
- `apps/api/src/services/subject-resolve.ts` — extend the resolver LLM prompt to extract `topicHint` (the topic-grain phrase from the input, or null). Update the JSON schema in the system prompt and the parsing logic. Snapshot tests need re-running.
- `apps/api/src/services/session/session-crud.ts` — replace `findFirstAvailableTopicId` with an intent-aware version that:
  1. If `input.topicId` is provided and verifies as belonging to the subject, use it directly (highest precedence — explicit beats inferred).
  2. Else, if `input.topicHint` (or, as fallback, the subject's stored `rawInput` from creation) is non-empty, run the matcher: load all materialized topics for `(subjectId, bookId?)`, score them against the hint via embedding similarity (Postgres `pgvector` if available, else cosine on cached embeddings) OR a single cheap LLM call with the topic list + hint; select the best match if confidence clears `MATCH_CONFIDENCE_FLOOR` (default `0.6`).
  3. Else, fall back to the existing sort-order pick.
- `apps/api/src/routes/sessions.ts` — `firstCurriculumSession` route handler at line 133 already validates against `firstCurriculumSessionStartSchema`. With the schema extension, no route changes needed except passing the new fields through.

### Mobile
- `apps/mobile/src/app/create-subject.tsx` — this is the screen that holds the resolver result. After `resolveSubject.mutateAsync()` returns, read `result.topicHint` and pass it to `createSubject.mutateAsync(...)` alongside `name`, `rawInput`, `focus`, `focusDescription`. **Without this change, `topicHint` never reaches the API and option (b) below is a no-op.** [HIGH-1]
- `apps/mobile/src/app/(app)/onboarding/interview.tsx` — `transitionToSession()` does NOT have the resolver result in scope (dependency array is `[bookId, safeSubjectId]`, confirmed). No change needed here — `topicHint` reaches the session-start call via the subject row (option b), not via route params.
- `apps/mobile/src/app/(app)/onboarding/language-setup.tsx` — **confirmed skip**: `startFirstCurriculumSession.mutateAsync` at line 193 has no resolver result in scope (language-setup is navigated to from interview.tsx, not from create-subject.tsx). Language subjects use CEFR-A1 first-topic heuristic, not intent matching. Do not wire `topicHint` here. [MEDIUM-5]

### Subject persistence (probably needed)
- The mobile screen that creates the subject knows `topicHint` from the resolver response, but the screen that starts the first session is `interview.tsx` — different page. The session-start call doesn't have access to the resolver response unless we either (a) pass it as a route param all the way through, or (b) persist `topicHint` on the `subjects` row at create time.
- Recommend (b): `subjects.topicHint: text NULL` column. The migration is small and additive (no rollback risk). Pre-warm and the matcher both read from the row, so the matcher can fire even if the user reloads between subject creation and interview completion.

### Eval harness
- `apps/api/eval-llm/scenarios/topic-intent-matcher.test.ts` (or similar) — new scenario file with ~10 (rawInput, expected matched topic) pairs against a fixed curriculum fixture. Tier 1 only — Tier 2 not required for this PR.

---

## Implementation steps

1. **Schema PR-tier change first.** Add the new fields to both schema files. Run `pnpm exec nx run @eduagent/schemas:typecheck` to confirm the package builds, then run mobile + API typechecks to confirm the optional new fields don't break callers.

2. **Migration for `subjects.topicHint`.**
   - Generate via `pnpm run db:generate` against dev.
   - Verify the migration is additive (NOT NULL not allowed on existing data — must be NULL with default NULL).
   - `pnpm run db:migrate:dev` to apply.
   - Document rollback: drop the column. Data loss = the cached hint, which is reproducible from `rawInput`. No user-impact.

3. **Resolver extension.** Update `subject-resolve.ts` system prompt (add `topicHint` to the JSON schema example, add 1–2 examples showing topic-grain extraction). Update the parsing logic to surface the field. Run `apps/api/src/services/subject-resolve.test.ts`; expect snapshot diffs on the LLM response shape.
   - **Boundary rule to add to the system prompt** (required — without this the LLM conflates `focus` and `topicHint`): "topicHint is the topic-grain phrase *within* the focus/book — it must never repeat the focus itself. If the input names a broad subject or focus without specifying a topic ('Chemistry', 'Italian', 'Egypt'), topicHint is null." Add examples: "how are chemical reactions created" → `focus: null, topicHint: "chemical reactions"`; "verb conjugation in Italian" → `focus: "Italian", topicHint: "verb conjugation"`. [HIGH-4]

4. **Pre-warm path: persist `topicHint` on subject create.**
   - `apps/api/src/services/subject.ts` `createSubjectWithStructure` accepts the `topicHint` from the route input and writes it to the new column. Route handler (`apps/api/src/routes/subjects.ts`) accepts it on the create payload (`subjectCreateSchema` already extended in step 1).
   - Mobile `apps/mobile/src/app/create-subject.tsx`: read `topicHint` from the resolver result (which is in `resolveState.result` when `resolveState.phase === 'suggestion'`) and include it in `createSubject.mutateAsync(...)`. The field is available at creation time; no route-param threading needed. [HIGH-1]

5. **Matcher implementation in `session-crud.ts`.**

   **CRITICAL structural constraint:** The matcher must run **once**, outside the poll loop — not inside it. The current poll loop (`startFirstCurriculumSession:324-367`) calls `findFirstAvailableTopicId` on every 750ms iteration. If the matcher replaced that inner call with an LLM call, a 25s pre-warm window would fire up to ~33 LLM calls per session start. [CRITICAL-1]

   Required loop restructure:
   - Keep the inner poll query lightweight (the existing `findFirstAvailableTopicId` or an equivalent count query — no LLM call here).
   - The poll loop exits when `topicId && extractedSignals` are both ready **and** at least `MIN_TOPICS_FOR_MATCHER = 3` topics are materialized (select `COUNT(*)` in the same query). If the deadline expires before this threshold, fall back: run `findFirstAvailableTopicId` as before and skip the matcher.
   - After exiting the loop successfully, run the matcher exactly once as a final step before calling `startSession`. [CRITICAL-2]

   Matcher logic (called once):
   - If `input.topicId` is provided: verify ownership via the **full 4-table chain** — `profileId → subjects → curricula → curriculumTopics` with `eq(subjects.profileId, profileId)` — matching the guard at `startSession:172-189`. If the check fails, throw `Error('Topic not found in this subject')` (same as `startSession`). Do not silently fall through to sort-order for a supplied topicId. [HIGH-2]
   - Else, if `topicHint` (from `input.topicHint`, or read from `subjects.topicHint` when `input.topicHint` is absent): pull all materialized topics for `(subjectId, bookId?)`, send the list + hint to a small model via the existing `routeAndCall` LLM stack. Ask for `{ matchIndex: number | null, confidence: number }` in 0..1. Hard timeout of ~2s — on timeout, fall back to sort-order. Select the best match only if `confidence >= MATCH_CONFIDENCE_FLOOR` (default `0.6`). Log `{ selectedTopicId, confidence, fallback, matcherLatencyMs }` as a structured log entry. [MEDIUM-3]
   - Else, fall back to the existing sort-order pick.

   Feature flag: `MATCHER_ENABLED` — add to the **typed config module** (not raw `process.env` — required by eslint G4 in CLAUDE.md). Doppler key: `MATCHER_ENABLED`. Off by default for first deploy. [MEDIUM-1]

6. **No mobile pass-through changes to interview.tsx or language-setup.tsx needed.**
   - `interview.tsx:transitionToSession()` — confirmed no change required. The `topicHint` flows server-side via the `subjects.topicHint` column written in step 4. `transitionToSession()` only passes `bookId` + session type; the API reads the stored hint itself.
   - `language-setup.tsx` — confirmed skip. It calls `startFirstCurriculumSession.mutateAsync` with no resolver data in scope, and language subjects use CEFR-A1 ordering, not intent matching. [MEDIUM-5]
   - The only mobile change is in `create-subject.tsx` (step 4 above).

7. **Eval scenarios.** Create `apps/api/eval-llm/scenarios/topic-intent-matcher.test.ts` with a fixture curriculum (e.g., a Chemistry subject with topics: "Atoms", "Periodic Table", "Chemical Reactions", "Acids and Bases", "Stoichiometry") and ~10 test inputs:
   - "how are chemical reactions created" → "Chemical Reactions"
   - "what is an atom" → "Atoms"
   - "I want to learn chemistry" → no match (low confidence) → falls back to sort-order
   - "verb conjugation in Italian" → tested against an Italian fixture, → "Verb conjugation"
   - "battle of hastings" → tested against a History fixture, → "Battle of Hastings"
   - 5 more covering edge cases
   Snapshot the matcher output. Tier 1 only.

8. **Document the relearn anomaly** in the PR description: relearn does not flow through `startSession` and is not affected by this PR, but any future centralized session-start logic must explicitly extend `retention-data.ts:858-873`. Reference: inventory LEARN-15.

---

## Out of scope (other PRs)

- Adding a numeric `confidence` field to `SubjectResolveResult` for the lighter-confirmation copy (PR 5a's deferred follow-up). Different field, different concern.
- Removing the `MATCHER_ENABLED` flag — separate small PR after the matcher proves itself in staging traffic.
- Tier 2 live-eval for the matcher — Tier 1 snapshot is sufficient for this PR.
- Topic-intent matcher for relearn — relearn already has a topic; matcher does not apply.
- Updating `language-setup` to use `topicHint` — language subjects use a different first-topic heuristic; revisit later.

---

## Verification

- Schema typecheck: `pnpm exec nx run @eduagent/schemas:typecheck`
- API: `pnpm exec nx run api:typecheck` and `pnpm exec nx run api:test --testPathPattern='session-crud|subject-resolve|subject\.'`
- Mobile: `cd apps/mobile && pnpm exec tsc --noEmit` and `pnpm exec jest --findRelatedTests src/app/(app)/onboarding/interview.tsx --no-coverage`
- Lint: `pnpm exec nx run-many -t lint --projects=api,mobile,@eduagent/schemas`
- Eval harness Tier 1: `pnpm eval:llm` with the new scenarios — snapshots committed.
- Migration: `pnpm run db:migrate:dev` against dev DB; verify the column exists.
- Integration tests (required — CLAUDE.md rule: "Run integration tests when changing DB behavior or cross-package contracts"; blast radius is medium-high): `pnpm exec nx run api:test --testPathPattern='integration'` [HIGH-3]

---

## Risk and rollback

- **Blast radius:** medium-high. The matcher fires on every first-curriculum-session start. A bad matcher (e.g., picking topics that don't align with `rawInput`) regresses the very feature the audit aims to fix.
- **Mitigations:**
  - `MATCHER_ENABLED` flag, off by default for first deploy. Flip it on for staging, observe, then prod.
  - Confidence floor (`0.6` default) keeps low-confidence matches from overriding sort-order. Tune with telemetry.
  - Telemetry: log every matcher decision (`selectedTopicId`, `confidence`, `fallback`, `matcherLatencyMs`) so both correctness regressions and latency regressions are visible in structured logs without needing to recreate. [MEDIUM-3]
- **Rollback paths (in order of speed):**
  1. Set `MATCHER_ENABLED=false` in Doppler — instant.
  2. Revert this PR — slower; recovers full state.
  3. Drop `subjects.topicHint` column — only if data integrity issues arise. Data loss = recomputable.

---

## Wave dependencies

- **Depends on:** PR 5d (already merged) — the matcher needs materialized topics to score against. Without pre-warm, the matcher would fire against an empty topic list and always fall back to sort-order. With 5d, the topic list exists by the time `startFirstCurriculumSession` polls.
- **Parallel-safe with:** 5c (different file — `feature-flags.ts`), 5e (different file — `interview.tsx` mobile vs API session-crud).
- **Blocks:** none directly. Wave 3 E2E (5f) does not require 5i — that's about whether fast-path + language-setup + first session works mechanically. 5i is product polish on top.

---

## Why this is M (not S)

Five small touches plus a migration plus an LLM call plus an eval scenario file. Each piece is small but the surface area is real: schemas (2), API services (3), routes, mobile mutation, migration, eval. M is the right size — not because any one piece is hard, but because verifying all of them together against a real subject-creation flow has multiple moving parts.
