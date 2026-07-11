# WI-1552 — Cross-session next-activity selector for Four Strands sessions

**Status:** Implemented
**Type:** Enhancement (extends existing `chooseNextLanguageStrand` / `buildLanguageSessionState`)

## Scope (per AC rewritten 2026-07-11, supersedes the WI's original description)

1. At session end, a next-practice pointer is persisted for the language subject,
   extending the existing `chooseNextLanguageStrand`/`buildLanguageSessionState`
   output via an additive schema (`apps/api/src/services/language-session-engine.ts`)
   — no breaking change to existing consumers.
2. Every `four_strands` language subject surfaces a visible continue/next-practice
   entry point on mobile, driven by the persisted pointer.
3. Selection reasons for the chosen next practice are logged/persisted as safe
   debug metadata.
4. Tests cover: (a) pointer persisted at session end and read back to seed the
   following session (two-session test); (b) continue/next-practice path renders
   for a language subject and not for a non-language subject; (c) existing
   `chooseNextLanguageStrand` within-session behavior is preserved as the
   fallback when no cross-session pointer exists.

Out of scope: competency-evidence-weighted strand selection (the WI's original
description text) — that framing was superseded by the 2026-07-10 ruling that
narrowed this WI to the cross-session pointer + continue-path mechanics above.

## Design

### 1. Additive schema (`packages/schemas/src/language.ts`)

```ts
languageStrandNameSchema = z.enum(['meaning_input','meaning_output','language_focus','fluency'])

languageNextPracticePointerSchema = z.object({
  strand: languageStrandNameSchema,
  reason: z.string().min(1),           // safe debug metadata — never rendered verbatim on mobile
  sessionStrandCounts: { meaning_input, meaning_output, language_focus, fluency: nonneg int },
  computedAt: isoDateField,
})

languageProgressSchema += nextPractice: languageNextPracticePointerSchema.nullable()
```

`languageProgressSchema` already has three return sites in
`getCurrentLanguageProgress` (no-curriculum, no-milestones, full) — all three
gain `nextPractice`. This is the existing `GET /subjects/:subjectId/cefr-progress`
response, already consumed by mobile's `useLanguageProgress` hook — adding a
nullable field to it is additive; no route/hook signature changes.

Duplicating the four strand-name literals (rather than importing
`LanguageStrand` from `stream-fallback.ts`) avoids a circular import:
`stream-fallback.ts` already imports `cefrLevelSchema` from `language.ts`.

### 2. DB migration (additive)

`subjects.next_language_practice_pointer` — nullable `jsonb`, no default.
Read through `languageNextPracticePointerSchema.nullable().catch(null).parse(...)`
before trusting the shape (repo convention for jsonb columns, see
`onboarding_drafts` comment in `packages/database/src/schema/sessions.ts`).

No rollback section needed — this migration only adds a nullable column with
no default; dropping it back out loses nothing but the pointer itself (a
derived recommendation, trivially recomputed next session-completed run).

### 3. Engine (`apps/api/src/services/language-session-engine.ts`) — additive

- Extract the existing least-used-strand reduce (already inside
  `chooseNextLanguageStrand`'s non-zero-exchange branch) into a small
  `leastUsedStrand(counts)` helper — no behavior change, just DRY so the new
  `computeNextPracticePointer` can reuse it instead of re-deriving.
- `chooseNextLanguageStrand` gains an optional `crossSessionPointer` param.
  `exchangeCount === 0` branch becomes
  `return input.crossSessionPointer?.strand ?? 'meaning_input'` — when no
  pointer is passed this is byte-for-byte the old behavior (AC4c).
- `buildLanguageSessionState` gains the same optional `crossSessionPointer`,
  threaded straight into its `chooseNextLanguageStrand` call.
- New pure function `computeNextPracticePointer(sessionStrandCounts)` →
  `LanguageNextPracticePointer`, using `leastUsedStrand` + a human-readable
  (but non-PII) `reason` string citing the four counts.

### 4. Persistence at session end (durable, not synchronous close)

Per `AGENTS.md` ("Durable async work goes through Inngest"), the pointer is
computed and persisted in the existing `session-completed` Inngest function
(`apps/api/src/inngest/functions/session-completed.ts`), which already runs a
sibling four_strands-gated step (`update-vocabulary-retention`) fetching the
subject row + session events for the same session. A new step
`update-next-practice-pointer` mirrors that pattern:

1. Skip if no `subjectId` on the event.
2. Fetch the subject; skip if not `pedagogyMode === 'four_strands'` or no
   `languageCode` (identical gate to `update-vocabulary-retention`).
3. Fetch the session's events, derive `sessionStrandCounts` via the already-
   exported `getLanguageStrandCounts`.
4. Skip (no write) if all four counts are zero — an empty/degenerate session
   should not clobber a meaningful prior pointer with a default.
5. Otherwise `computeNextPracticePointer` and `UPDATE subjects SET
   next_language_practice_pointer = ..., updated_at = now() WHERE id = ...`.
6. `logger.info` the computed `strand` + `reason` (AC3 — safe debug metadata;
   no learner content, just strand counts).

Wrapped in the function's existing `runIsolated` helper — soft-fails to
Sentry + a `status: 'failed'` outcome, never blocks the rest of the pipeline.

### 5. Read-back at session start (`session-exchange.ts`)

Immediately before the existing `buildLanguageSessionState` call
(four_strands branch), a single lightweight `SELECT next_language_practice_pointer
FROM subjects WHERE id = <effectiveVocabularySubjectId>` — the same subject id
this function already uses for known/target vocabulary in both the explicit-
subject and freeform-silent-classification paths, so both are covered.
Parsed through `languageNextPracticePointerSchema.nullable().catch(null)` and
passed as `crossSessionPointer` into `buildLanguageSessionState`.

### 6. Mobile continue/next-practice entry point

`apps/mobile/src/app/(app)/progress/[subjectId]/index.tsx` already fetches
`useLanguageProgress(subjectId)` and gates a `cefr-milestone-card` block on
`isLanguageSubject` (`subject?.pedagogyMode === 'four_strands' || !!languageProgress`)
— the same screen that differentiates language vs. non-language subjects
already needed for AC4b. Add a "Continue practice" sub-block inside that
existing gated card, rendered only when `languageProgress?.nextPractice` is
present, with an i18n-keyed label derived from `nextPractice.strand` (never
the raw `reason` string — that stays server-side debug metadata, keeping the
i18n-hygiene ratchet clean). Tapping it reuses the screen's existing
`handlePrimarySubjectAction` (resume in-progress session, else open the
shelf) — the actual strand selection happens automatically server-side via
the read-back in step 5, so mobile does not need to pass the strand anywhere.

## Rollback

Additive-only change (new nullable column, new optional schema fields, new
optional function params defaulting to today's behavior). Reverting the PR
is a clean revert; no data migration/backfill was introduced.
