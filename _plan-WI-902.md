# WI-902 — Dictation history + full-text persistence

## Problem

`dictation_results` (`packages/database/src/schema/dictation.ts`) persists only
aggregate metadata per session: `sentenceCount`, `mistakeCount`, `mode`,
`reviewed`, `date`. The actual dictated text is never stored, so learners cannot
review the source sentences of past dictation exercises. There is also no
history read endpoint — only `GET /dictation/streak` (count) exists.

## Design decision (conservative, documented)

**Persist the source sentence text** of each dictation exercise as a new
nullable `jsonb` column `sentences` (a `string[]` of the canonical sentence
`text` values). Direction per WI title "full-text persistence" = PERSIST.

Why source sentences specifically:
- The reviewable "full text of the dictation exercise" the WI asks for *is* the
  set of source sentences the learner was dictated / should have written.
- The learner's handwritten attempt is captured only as a **photo** that the
  vision LLM grades transiently into per-mistake `{original, written}` pairs
  (`dictationReviewResultSchema`). There is no full clean transcription of the
  attempt, and persisting the raw image/transcription would add real privacy
  surface for no clear review benefit. So we persist the source sentences only.
- We store just the sentence `text` strings — not the full `DictationSentence`
  objects (`withPunctuation`, `chunks`, TTS artifacts) — because only the text
  is needed to review the exercise. Minimal footprint.

### Privacy / retention
- Source sentences are learner-facing educational content. In `homework` mode
  they derive from the learner's own homework text; in `surprise` mode they are
  LLM-generated. Low sensitivity, profile-scoped.
- The column inherits the table's existing `profile_id` FK
  `onDelete: 'cascade'`, so history is deleted with the profile — no separate
  retention mechanism needed.
- **Pre-launch: ZERO real users; all DB data is disposable test data.** No
  backfill / migration-of-real-data concern. Old rows simply have `sentences =
  NULL` and the history UI falls back to a count-only summary for them.

### Exact columns added
- `dictation_results.sentences` — `jsonb`, **nullable**, typed `string[]`.
  Holds the source sentence texts of the exercise. Nullable + no default →
  additive and safe; pre-existing rows and old clients that omit it read back
  as `null`.

## Migration
- Edit schema, then `pnpm run db:generate:dev` → new numbered migration
  (`0125_*.sql`, next after `0124`). Do NOT hand-author SQL; do NOT edit an
  applied migration. Adds the nullable column only.
- Dev-only. No `drizzle-kit push`/`migrate` against staging or production.

## Changes (file map)
1. **`packages/database/src/schema/dictation.ts`** — add `sentences` jsonb col.
2. **`apps/api/drizzle/0125_*.sql`** — generated migration (add column).
3. **`packages/schemas/src/dictation.ts`**
   - `recordDictationResultInputSchema`: add optional
     `sentences: z.array(z.string().max(500)).max(50).optional()` (reuse
     `DICTATION_REVIEW_MAX_SENTENCE_TEXT_CHARS` / `DICTATION_REVIEW_MAX_SENTENCES`).
   - `dictationResultSchema`: add `sentences: z.array(z.string()).nullable()`.
   - New `dictationHistorySchema = z.object({ entries: z.array(dictationResultSchema) })`.
4. **`packages/database/src/repository.ts`** — `dictationResults.insert` accepts
   optional `sentences`; persist on insert and (when provided) in the
   onConflictDoUpdate `set`.
5. **`apps/api/src/services/dictation/result.ts`**
   - `RecordResultInput`: add `sentences?: string[] | null`; pass to insert.
   - New `getDictationHistory(db, profileId, limit=20)` — scoped repo
     `findMany(undefined, desc(createdAt), limit)`, normalize `date` via
     `toIsoDate`, return `dictationResultSchema`-shaped entries.
6. **`apps/api/src/routes/dictation.ts`**
   - `/dictation/result`: pass `sentences: input.sentences ?? null`.
   - New `GET /dictation/history` → `getDictationHistory`, return
     `dictationHistorySchema.parse({ entries })`. Scoped by `profileId`.
7. **`apps/mobile/src/hooks/use-dictation-api.ts`** — `useDictationHistory`
   query hook (via `useApiQuery`, key `['dictation-history', profileId]`);
   `useRecordDictationResult` invalidates that key onSuccess.
8. **`apps/mobile/src/app/(app)/dictation/complete.tsx`** — pass
   `sentences: sentences.map((s) => s.text)` when recording.
9. **`apps/mobile/src/app/(app)/dictation/history.tsx`** — new read-only screen:
   list recent entries (date, mode, score, source sentences inline). Linked from
   the index screen via a new row.
10. **`apps/mobile/src/app/(app)/dictation/index.tsx`** — add a "See past
    dictations" entry navigating to `history`.
11. **`apps/mobile/src/i18n/locales/en.json`** — new `dictation.history.*` keys.

## Tests
- API: extend `apps/api/src/services/dictation/result.integration.test.ts`
  (REAL DB, no internal mocks) — prove `sentences` is persisted on
  `recordDictationResult` and returned by `getDictationHistory` in recency
  order; null-sentences (old-client) path returns `sentences: null`.
- Mobile: file-scoped jest for `history.tsx` (renders entries + sentences) and
  updated `complete.test.tsx` if it asserts the record payload.

## Acceptance criteria
- New dictation completion persists its source sentences; `GET /dictation/history`
  returns them, newest first, scoped to the caller's profile.
- Mobile history screen shows past exercises with their full source sentences.
- New user-visible copy routed through `t()` + keys added to `en.json`.
- api typecheck/lint/test green; schemas typecheck green; mobile tsc + scoped
  jest + i18n jsx-literal check green.

## Rollback
- The migration only **adds** a nullable `jsonb` column. Rollback = a new forward
  migration `DROP COLUMN dictation_results.sentences` (or leave the column —
  it is inert if unread). **Data loss on rollback:** only the persisted source
  sentences, which are disposable pre-launch test data; aggregate metadata and
  streaks are unaffected. No destructive change to existing columns, so rollback
  is fully safe and reversible.
