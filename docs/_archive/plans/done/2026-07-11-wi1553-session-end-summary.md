# WI-1553 — Language session-end learning summary

## Scope

Add a `four_strands`-gated session-end learning summary: practiced scenario/theme,
new/strengthened words, grammar patterns, comprehension result, speaking attempts,
fluency result, and a next-practice recommendation. Additive to the existing
`session_summaries` / `SessionSummary` contract; no LLM calls (derive-from-events
per binding ruling in the WI, 2026-07-10 amendment). Builds on top of WI-1552
(`subjects.next_language_practice_pointer`, `computeNextPracticePointer`,
`getLanguageStrandCounts` in `apps/api/src/services/language-session-engine.ts`)
and WI-1756 (meaning-output artifacts in `session_events.metadata.languageLearning`).
WI-1550/1551 (competency model) are out of scope — nothing here reads from them.

## Data model (additive only — no destructive migration)

New nullable jsonb column on `session_summaries`, mirroring the existing
`llm_summary` jsonb + `db-jsonb.ts` parser pattern (`parseSessionSummaryLlmSummary`):

```sql
-- apps/api/drizzle/0140_wi1553_session_summaries_language_learning_summary.sql
ALTER TABLE "session_summaries" ADD COLUMN "language_learning_summary" jsonb;
```

`packages/database/src/schema/sessions.ts`: add
`languageLearningSummary: jsonb('language_learning_summary').$type<LanguageSessionSummaryData | null>()`
next to the existing `llmSummary` column.

`packages/schemas/src/language.ts` (or a new co-located block — reuse existing
strand/pointer types from `stream-fallback.ts` via re-export, do not redefine):

```ts
export const languageSessionSummarySchema = z.object({
  practicedScenario: z.string().min(1).nullable(),
  newWords: z.array(z.object({ term: z.string(), type: vocabTypeSchema })),
  strengthenedWords: z.array(z.object({ term: z.string(), type: vocabTypeSchema })),
  grammarPatterns: z.array(z.string()),
  comprehension: z
    .object({ correct: z.number().int(), total: z.number().int() })
    .nullable(),
  speakingAttempts: z.number().int(),
  fluency: z
    .object({ correct: z.number().int(), total: z.number().int() })
    .nullable(),
  nextRecommendationStrand: languageStrandSchema.nullable(),
});
export type LanguageSessionSummaryData = z.infer<typeof languageSessionSummarySchema>;
```

No new strand enum needed — WI-1552 already added `languageStrandNameSchema` in
`packages/schemas/src/language.ts` for this exact circular-import reason
(stream-fallback.ts imports `cefrLevelSchema` from language.ts, so the reverse
import isn't possible). Reuse `languageStrandNameSchema` for
`nextRecommendationStrand` directly; no new schema file/type needed.
`languageSessionSummarySchema` itself lives in `language.ts` too, so `sessions.ts`
picks up one new import (`./language.ts`) and nothing circular.

Extend `sessionSummarySchema` (`packages/schemas/src/sessions.ts`) additively:

```ts
languageLearningSummary: languageSessionSummarySchema.nullable().optional(),
```

Response picks (`submitSummaryResultSchema`, `skipSummaryResponseSchema`) are
`.pick()`-based and don't enumerate all fields, so they need no change — the new
field only reaches `sessionSummaryGetResponseSchema` (`GET /sessions/:id/summary`),
which is the only response that returns the full object. **AC4 legacy-safety**: the
field is `.nullable().optional()` and the parser (`parseLanguageLearningSummary`,
mirroring `parseSessionSummaryLlmSummary`) returns `null` on parse failure or a
`null` raw column value — a pre-existing summary row (column NULL) or a
non-`four_strands` session (column never written) both parse to
`languageLearningSummary: null`, and `mapSummaryRow` omits it exactly like the
existing `llmSummary` handling. No breaking change to any existing consumer.

`packages/schemas/src/db-jsonb.ts`: add

```ts
export function parseLanguageLearningSummary(
  raw: unknown,
): LanguageSessionSummaryData | null {
  if (raw === null || raw === undefined) return null;
  const parsed = languageSessionSummarySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
```

## Derivation (pure, unit-testable, zero LLM calls)

New file `apps/api/src/services/language-session-summary.ts`:

```ts
export function computeLanguageSessionSummary(input: {
  events: Array<{ eventType: string; content: string; metadata: unknown }>;
  practicedScenario: string | null; // meaningOutput.communicativeGoal, else topic title, else null
  newWords: Array<{ term: string; type: 'word' | 'chunk' }>;
  strengthenedWords: Array<{ term: string; type: 'word' | 'chunk' }>;
  fluencyDrillTotals: { correct: number; total: number } | null; // from practice_activity_events
  nextRecommendationStrand: LanguageStrand | null; // subject.nextLanguagePracticePointer?.strand
}): LanguageSessionSummaryData
```

Internals (all derived from `events`, mirroring existing helpers in
`language-session-engine.ts` — `getLanguageStrandCounts`,
`evaluatePendingGradedInputAnswer`, `computeNextPracticePointer` are imported and
reused, not reimplemented):

- `grammarPatterns`: dedup union of `languageLearning.targetGrammar` across all
  `ai_response` events, capped at 5, preserving first-seen order.
- `comprehension`: walk `events` by index; whenever `events[i]` is an `ai_response`
  with `languageLearning.gradedInput` present and `events[i+1]` is a
  `user_message`, call the existing `evaluatePendingGradedInputAnswer({ events:
  events.slice(0, i + 1), learnerMessage: events[i+1].content })` and count
  `verdict === 'understood'` as correct out of total questions encountered. `null`
  when no graded-input question was ever answered (sparse case — AC2 omission).
- `speakingAttempts`: count of `ai_response` events with
  `languageLearning.modality === 'voice'` immediately followed by a
  `user_message` (an actual attempt, not just an offered prompt).
- `fluency`: passed through from `fluencyDrillTotals` (caller queries
  `practice_activity_events` — see below); `null` when no fluency-drill activity
  occurred this session.
- `nextRecommendationStrand`: straight passthrough of `input.nextRecommendationStrand`.
  The caller (the Inngest step, not this pure function) reads it from the
  already-fetched `subject` row's persisted `nextLanguagePracticePointer.strand`
  (WI-1552's cross-session pointer) — **not recomputed from this session's
  events.** The step already fetches `subject` to gate on
  `pedagogyMode`/`languageCode`, so reading the pointer is free — no extra query.
  This also gives the *correct* cross-session semantics: a session with zero
  strand activity skips `update-next-practice-pointer`'s write (the
  `hadStrandActivity` guard), so the subject still holds the prior session's
  pointer, which is exactly what should surface here. `null` only if the subject
  has never had a pointer computed (brand-new four_strands subject, first
  session). The `pointer.reason` field is debug-only metadata (per its own
  doc-comment in `language-session-engine.ts`) and must never be rendered —
  only `.strand` is stored/passed through.

  Phase-4 adversarial review flagged that reading the pointer *after*
  `update-next-practice-pointer` has already run in the same execution means
  this session's own summary shows the pointer *this session just computed*
  for the *next* session — not a pre-session snapshot. This is deliberate:
  the summary's job is to tell the learner what session N+1 will actually
  open with, and that is exactly the freshly-persisted value. Showing the
  pre-session pointer instead would describe a recommendation this session
  already consumed and acted on. The method constraint — reuse WI-1552's
  canonical `computeNextPracticePointer` via the persisted column, never
  re-derive or call an LLM — is unaffected either way.

`newWords` / `strengthenedWords` / `practicedScenario` / `fluencyDrillTotals` /
`nextRecommendationStrand`'s source pointer are all passed in pre-computed (see
wiring below) rather than re-derived, to avoid a second LLM call and a second DB
round-trip for data already computed/available elsewhere in the same Inngest run.

## Wiring into `session-completed.ts` (Inngest)

1. **Extend `update-vocabulary-retention`** (existing four_strands-gated step,
   `apps/api/src/inngest/functions/session-completed.ts:749`) to classify
   extracted terms as new vs. strengthened *before* calling
   `upsertExtractedVocabulary`: query
   `db.query.vocabulary.findMany({ where: and(eq(profileId), eq(subjectId),
   inArray(termNormalized, normalizedExtractedTerms)) })` for the pre-existing
   term set, then split `extractedVocabulary` into `newWords` /
   `strengthenedWords` by membership. Add `stepNewWords` / `stepStrengthenedWords`
   closure vars (same pattern as `stepPrevious`/`stepNext`) and thread them through
   `VocabularyRetentionStepResult` (extend the interface) so they survive Inngest
   replay memoization, matching the existing BUG-181 rationale already documented
   on that interface.
2. **New step `compute-language-session-summary`**, placed immediately after
   `write-coaching-card` (so the `sessionSummaries` row exists — same
   find-summaryRow-then-update pattern as `generate-session-insights` /
   `generate-learner-recap`), gated on `subject.pedagogyMode === 'four_strands' &&
   subject.languageCode`, wrapped in `runIsolated` (soft-fail — a missing language
   summary must never block the rest of the pipeline):
   - Fetch `subject` (needed for the gate anyway) and read
     `subject.nextLanguagePracticePointer?.strand` directly — this is WI-1552's
     persisted cross-session pointer; do not recompute from this session's events.
   - Re-fetch `sessionEvents` for `(sessionId, profileId)` ordered by
     `createdAt, id` (matches the established re-fetch-per-step convention already
     used by `update-vocabulary-retention` / `update-next-practice-pointer`).
   - Resolve `practicedScenario`: prefer the most recent
     `languageLearning.meaningOutput.communicativeGoal` found in `events` (already
     walked for other fields — a concrete scenario like "order food at a café"),
     falling back to `topicId ? loadTopicTitle(...) : null` (reuse existing
     `loadTopicTitle` helper already exported in this file). Never fall back to
     `subject.name` (the language name, e.g. "French") — that renders as the
     awkward "Today you practiced French"; `null` (omitted) is preferable (AC2).
   - Query `practiceActivityEvents` where `activityType = 'fluency_drill' AND
     metadata->>'sessionId' = sessionId` (matches the write site at
     `session-exchange.ts:3543`), sum `score`/`total` across rows.
   - Read `newWords`/`strengthenedWords` from `vocabularyOutcome` (already in
     scope from the earlier step — same pattern as
     `previousLanguageProgress`/`nextLanguageProgress` at line 870-871).
   - Call `computeLanguageSessionSummary(...)`, then `UPDATE session_summaries SET
     language_learning_summary = ... WHERE id = summaryRow.id AND profile_id =
     profileId`.
   - **AC5 non-language case**: subject is missing, `pedagogyMode !== 'four_strands'`,
     or `languageCode` is null → step returns `{status: 'skipped'}` without writing
     — column stays `NULL`, `languageLearningSummary` reads back as `null`.

No new Inngest event, no new `safeSend` dispatch — this rides the same
`session-completed` execution as the sibling four_strands steps.

## API read path

`apps/api/src/services/session/session-events.ts` → `mapSummaryRow`: add
`languageLearningSummary: parseLanguageLearningSummary(row.languageLearningSummary)`.
`getSessionSummary` needs no other change — it already spreads `mapSummaryRow`'s
output.

## i18n (mobile)

`apps/mobile/src/i18n/locales/en.json`, new `sessionSummary.languagePractice`
block (structured data in, i18n copy out — the API never returns English strings,
only `nextRecommendationStrand`, so there is exactly one place that turns a strand
into copy):

```json
"languagePractice": {
  "title": "Language practice",
  "scenario": "Today you practiced {{scenario}}",
  "newWords": "New words: {{words}}",
  "strengthenedWords": "You strengthened: {{words}}",
  "grammarPattern": "Grammar focus: {{patterns}}",
  "comprehension": "You answered {{correct}}/{{total}} comprehension questions correctly",
  "speakingAttempts_one": "You spoke {{count}} time",
  "speakingAttempts_other": "You spoke {{count}} times",
  "fluencyResult": "Fluency check: {{correct}}/{{total}}",
  "nextRecommendation": {
    "meaning_input": "Next time: more reading and listening practice",
    "meaning_output": "Next time: more speaking and writing practice",
    "language_focus": "Next time: we'll work on grammar patterns",
    "fluency": "Next time: a quick fluency sprint"
  }
}
```

Each field/row in the mobile screen renders **only if the source value is
present** (AC2 — positive omission, no "0 new words" / "N/A" placeholders): the
whole card is conditional on `persisted?.languageLearningSummary` being non-null,
and each row inside it is conditional on its own field being non-empty/non-null.

After adding keys: `pnpm translate` (6 locales: nb, de, es, pt, pl, ja) then
`node scripts/rebuild-source-baseline.ts` to regenerate
`apps/mobile/src/i18n/source-baseline.json` — required or the "scripts/* tests"
CI step fails on a stale baseline.

## Mobile UI

`apps/mobile/src/app/session-summary/[sessionId].tsx`: new card, placed after the
existing recap card (~line 1123), following the exact `View
className="bg-surface rounded-card p-4 mb-4" testID="..."` convention used by
every sibling card in this screen (milestone-recap, session-next-topic-card,
etc.). New `testID="language-practice-card"`.

## Tests (AC5)

- `apps/api/src/services/language-session-summary.test.ts` (new, no
  `jest.mock`, pure-function unit tests):
  - **rich-data**: full event fixture with graded-input Q&A, voice turns,
    fluency-drill totals, non-empty new/strengthened words → every field
    populated as expected.
  - **sparse-data**: minimal fixture (e.g. only `meaning_input` strand touched,
    no graded-input answered, no voice turns, no fluency drill, no new
    vocabulary) → `comprehension: null`, `speakingAttempts: 0`, `fluency: null`,
    `newWords: []`, `strengthenedWords: []`, `grammarPatterns: []`,
    `nextRecommendationStrand` still populated (there was strand activity).
  - **zero-strand-activity edge**: no `languageLearning` metadata at all on any
    event → `nextRecommendationStrand: null` too.
- `apps/api/src/inngest/functions/session-completed.test.ts`: extend with cases
  for the new step — four_strands subject present → writes
  `language_learning_summary`; **non-language session** (AC5 third case:
  `pedagogyMode` absent/`'socratic'`, or no `subjectId`) → step returns
  `skipped`, no write attempted; step throws → `runIsolated` swallows it
  (outcome `status: 'failed'`, rest of pipeline unaffected).
- `apps/api/src/services/session/session-summary.test.ts` /
  `session-events.test.ts` (wherever `mapSummaryRow` is covered): legacy row
  (`languageLearningSummary: null` column) → `languageLearningSummary: null` in
  the mapped result (AC4); rich row → parses through.
- `packages/schemas/src/sessions.test.ts`: `languageSessionSummarySchema` parse
  tests (accepts full shape, accepts all-null/empty sparse shape).

## Verification checklist

- `pnpm exec nx run api:typecheck`, `pnpm exec nx run api:lint`
- `pnpm exec nx run database:typecheck` (schema change)
- Targeted jest: `language-session-summary.test.ts`,
  `session-completed.test.ts`, `session-summary.test.ts`,
  `sessions.test.ts` (schemas package)
- `pnpm exec nx run mobile:lint` + `pnpm check:i18n:jsx-literals` +
  i18n orphan-key checker (new keys used, no orphans)
- No prompt files touched → `pnpm eval:llm` not required (confirmed: this
  feature makes zero LLM calls, per the DERIVE-FROM-EVENTS ruling)
- `bash scripts/check-change-class.sh` on the branch diff to confirm the
  db-schema / api change classes are covered

## Rollback

Additive-only: a single nullable column add. Rollback (if ever needed) is
`ALTER TABLE session_summaries DROP COLUMN language_learning_summary` — no data
loss for any other field, since this column carries no data other people depend
on. Not expected to be needed; noted per the migration-rollback documentation
rule for completeness even though this is a pure additive change, not a
drop/rename.
