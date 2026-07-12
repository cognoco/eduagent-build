# WI-1777 — Four Strands speaking slice: repeat-after-me/shadowing + attempt persistence

**Status:** Implemented
**Type:** Feature (bundle absorbing WI-1548 + WI-1549)

## Scope

Whole-bundle AC: a learner in a Four Strands session can complete one
repeat-after-me/shadowing activity end-to-end — hears correct-locale target
audio, speaks, sees transcript-comparison feedback (missing/extra words), can
retry without losing the target, and the attempt is persisted with scores
under the correct profile scope.

Per the 2026-07-10 MVP amendment: ONE activity type wired fully
(`repeat_after_me`); `shadowing` gets the same schema/artifact shape and a
selection hook, but is not yet chosen by server selection logic (documented
scope narrowing, not a gap — see Design §1). Deterministic lexical-match
scoring only. No phoneme scoring, no LLM self-grading, no raw audio stored,
no competency-model fields.

Out of scope (ruled OUT at ratification): phoneme scoring, pronunciation
science, competency-model fields.

## Design

### 1. Schema — new activity types + artifact (`packages/schemas/src/stream-fallback.ts`)

Extend the existing `activityType` enum (currently 4 values, 1:1 with the 4
strands) with two new values, both homed under the `fluency` strand:

```ts
activityType: z.enum([
  'graded_input',
  'free_response',
  'correction_retry',
  'timed_drill',
  'repeat_after_me',
  'shadowing',
]),
```

New optional artifact field, named `speakingPractice` (not `repeatAfterMe`)
because one shape serves both `repeat_after_me` and `shadowing` — mirroring
the pattern where `gradedInput`/`meaningOutput` are each an optional sibling
field on `streamLanguageLearningActivitySchema`:

```ts
export const streamLanguageSpeakingPracticeSchema = z.object({
  type: z.enum(['repeat_after_me', 'shadowing']),
  targetText: z.string().min(1),
  locale: z.string().min(1), // BCP-47 STT/TTS locale, e.g. language.sttLocale
  modality: z.literal('voice'),
  retryGuidance: z.enum(['retry_same_target']),
});
export type StreamLanguageSpeakingPractice = z.infer<
  typeof streamLanguageSpeakingPracticeSchema
>;
```

Add to `streamLanguageLearningActivitySchema`:
`speakingPractice: streamLanguageSpeakingPracticeSchema.optional()`.

`retryGuidance` is a fixed enum (mirroring `meaningOutput`'s
`retryExpectation`/`correctionExpectation` enum fields), not freeform text —
consistent with the existing convention for these guidance fields and avoids
adding new sanitization/i18n surface for server-internal telemetry.

This is purely additive to the schema — existing `gradedInput`/`meaningOutput`
consumers are untouched.

### 2. Server activity selection (`apps/api/src/services/language-session-engine.ts`)

`buildLanguageActivityTelemetry`'s `activityTypeByStrand` map is a strict 1:1
today (`fluency` → `timed_drill` always, no artifact). Make the `fluency`
branch conditional on CEFR level ("beginner speaking practice" per AC):

```ts
const isBeginnerFluency =
  input.strand === 'fluency' &&
  (input.cefrLevel === 'A1' || input.cefrLevel === 'A2');

const activityType: LanguageActivityType = isBeginnerFluency
  ? 'repeat_after_me' // selectSpeakingPracticeMode() hook — always repeat_after_me
                       // in this MVP; shadowing selection is future work, not wired.
  : activityTypeByStrand[input.strand];
```

**Verified against the existing test suite:** `language-session-engine.test.ts`
("maps fluency strands to timed drill telemetry") calls
`buildLanguageActivityTelemetry({ strand: 'fluency', ... })` with no
`cefrLevel` at all and asserts `activityType: 'timed_drill'` with no artifact.
An unset/`null` `cefrLevel` therefore must NOT be treated as beginner —
only an explicit `'A1'`/`'A2'` triggers the new path. B1+ *and* unset-CEFR
fluency both keep today's exact behavior (`timed_drill`, no artifact) —
non-breaking for existing sessions and for this existing test.

New `buildSpeakingPracticeArtifact()` function (mirrors
`buildGradedInputArtifact`/`buildMeaningOutputArtifact` shape) picks a single
deterministic short target sentence per language code from a small
per-locale sentence table (NOT `buildSeedPassage` — that emits three
sentences, which is too long for a repeat-after-me target and would make
scoring noisy). Sentence choice is `sessionStrandCounts.fluency % sentences.length`
(same "turn index modulo table length" pattern as
`buildMeaningOutputArtifact`'s `meaningOutputTurnIndex`) — deterministic, no
LLM, reproducible in tests. `locale` comes from
`getLanguageByCode(languageCode)?.sttLocale` — the same field the WI-1447
locale fix already threads through `language-prompts.ts` ("Target STT/TTS
locale" line), so this reuses the already-fixed locale source rather than
introducing a second one.

### 3. Four Strands prompt (`apps/api/src/services/language-prompts.ts`)

Add a `speakingPracticeLines` block to `formatLanguageSessionState`, mirroring
`gradedInputLines`/`meaningOutputLines`:

```ts
const speakingPractice = activity.speakingPractice;
const speakingPracticeLines = speakingPractice
  ? [
      'Speaking practice artifact:',
      `- Mode: ${speakingPractice.type}`,
      `- Target sentence (already shown to the learner, do not invent a new one): ${sanitizeXmlValue(speakingPractice.targetText, 200)}`,
      `- Locale: ${speakingPractice.locale}`,
      '- The learner will repeat this sentence aloud. Transcript-comparison feedback is computed and shown by the client — you do not need to grade it. Encourage a retry on the same target if they ask for help.',
    ]
  : [];
```

This is a prompt change → run `pnpm eval:llm` after this edit. Add one
Tier-1 eval fixture that exercises a `repeat_after_me` activity so the new
conditional lines are actually snapshotted (otherwise the block never fires
and the run is a vacuous zero-drift receipt).

### 4. Scoring — deterministic, server-side, source of truth (WI-1549 AC2)

New module `apps/api/src/services/speaking-practice-scoring.ts`. Deliberately
does **not** reuse `tokenizeAnswerTerms`/`evaluatePendingGradedInputAnswer`
(the existing server-side lexical scorer) — that function drops terms under
4 characters, drops a stopword list, dedupes, and matches `[a-z0-9]+` only
(ASCII). Each of those is correct for its purpose (comprehension-answer
term-overlap) and wrong here: dropping short words/stopwords deletes exactly
the function words a beginner must reproduce verbatim ("a", "is", "el"),
dedup breaks a multiset diff, and ASCII-only tokenization yields zero tokens
for non-Latin targets (Japanese is in the conversation-language set) —
silently scoring a non-Latin attempt as "perfect" (100% missing → 0
mismatches, since there's nothing to compare).

Instead, mirror `SpeakingPracticeCard.tsx`'s `normalizeWords` (Unicode-aware
`\p{L}\p{N}`, casefold, keep every word and every repeat):

```ts
function normalizeWords(text: string): string[] {
  return text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritic strip — explicit choice, see below
    .replace(/[^\p{L}\p{N}'\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export interface SpeakingPracticeScore {
  lexicalMatchScore: number; // matchedCount / targetWordCount, 0 if target empty
  missingWords: string[]; // target words with no remaining match in transcript multiset
  extraWords: string[]; // transcript words left over after consuming all target matches
  isComplete: boolean;
}

export function scoreSpeakingPracticeAttempt(
  targetText: string,
  transcript: string,
): SpeakingPracticeScore {
  const targetWords = normalizeWords(targetText);
  const heard = new Map<string, number>();
  for (const word of normalizeWords(transcript)) {
    heard.set(word, (heard.get(word) ?? 0) + 1);
  }
  const missingWords: string[] = [];
  let matched = 0;
  for (const word of targetWords) {
    const count = heard.get(word) ?? 0;
    if (count > 0) {
      heard.set(word, count - 1);
      matched += 1;
    } else {
      missingWords.push(word);
    }
  }
  // Leftover unconsumed heard-word counts are the extra words.
  const extraWords = [...heard.entries()].flatMap(([word, count]) =>
    Array(count).fill(word),
  );
  return {
    lexicalMatchScore: targetWords.length > 0 ? matched / targetWords.length : 0,
    missingWords,
    extraWords,
    isComplete: targetWords.length > 0 && missingWords.length === 0,
  };
}
```

**Diacritics — explicit decision:** strip them (NFD + combining-mark strip)
on both target and transcript before comparing, making matching lenient
(accented/unaccented both pass). `expo-speech-recognition` transcripts
typically preserve diacritics, so a learner who says the correct word but
whose STT output normalizes accents differently than the stored target text
should not be marked wrong — this is the right default for a beginner
repeat-after-me exercise, not a phonetic-precision drill. Documented here so
Phase-4 review evaluates this as a stated decision, not an oversight.

**Order-insensitive:** the multiset diff does not check word order — a
reordered transcript scores as a perfect match. This is the simplest
defensible MVP behavior (repeat-after-me is not testing syntax); it is the
behavior a word-order edge-case test asserts, not left implicit.

**Single scorer — the server's, always (revised post-Phase-4, finding M1).**
The mobile flow is stop-recording → POST → render feedback (§8), not
continuous interim-token scoring, so there is no live-typing UX that needs an
instant client-side estimate. The first implementation kept
`SpeakingPracticeCard.tsx`'s pre-existing `compareSpeakingPracticeTranscript`
as an "internal-compute fallback" for whenever server feedback wasn't
supplied — the Phase-4 adversarial review (fresh-context subagent) proved
this was reachable and demo-visible: `useSpeechRecognition`'s interim results
stream into the card on every keystroke of speech, so the card rendered a
**live client-computed verdict while recording and on POST failure** — and
that client scorer diverges from the server's (no NFD/diacritic strip, no
per-repeat-word multiset correctness). Concretely: a learner saying "Está"
against a target expecting it, with STT transcribing "esta", saw
"missing: está" from the client scorer while the server (which folds
diacritics) would have scored the attempt complete. A co-rendered error
banner and a sub-second flip to the true score do not satisfy the
single-source-of-truth requirement (WI-1549 AC1-3) when a **durably wrong**
verdict is shown on the interim and POST-failure paths.

**Remediation:** `compareSpeakingPracticeTranscript` and its internal call
site were deleted outright from `SpeakingPracticeCard.tsx` (confirmed via
grep that nothing else imported it) — there is no client-side scoring
fallback of any kind. The card now renders a match/missing/extra verdict
**only** when `missingWords` (a new required-together prop group with
`extraWords`/`isComplete`) is explicitly supplied, which `SpeakingPracticeActivity`
(§8) only does after a successful POST response. While listening, while an
interim transcript is streaming, and on POST failure, the card shows the raw
transcript text and nothing else — no "Matched", no missing/extra words. This
is the actual, verified single-scorer invariant: one code path computes a
score (server), one prop group carries it, and the card has no other way to
produce a verdict.

### 5. Database — new table, migration 0144 (additive only)

`packages/database/src/schema/speaking-practice.ts` (new file), modeled on
`sessionEvents`'s triple-FK + cascade-delete + composite-index shape (the
closest existing precedent — profile+subject+session scoping):

```ts
export const speakingPracticeAttempts = pgTable(
  'speaking_practice_attempts',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => learningSessions.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull(), // 'repeat_after_me' | 'shadowing'
    targetText: text('target_text').notNull(),
    transcript: text('transcript').notNull(),
    locale: text('locale').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    lexicalMatchScore: real('lexical_match_score').notNull(),
    missingWords: jsonb('missing_words').$type<string[]>().notNull(),
    extraWords: jsonb('extra_words').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('speaking_practice_attempts_session_id_idx').on(table.sessionId),
    index('speaking_practice_attempts_profile_created_idx').on(
      table.profileId,
      table.createdAt,
    ),
  ],
);
```

No raw audio column anywhere in this table (WI-1549 AC4) — verified by grep
in Phase-4.

New file must be re-exported from `packages/database/src/schema/index.ts`
(`export * from './speaking-practice';`) — `client.ts` builds `db.query.*`
from `import * as schema from './schema/index'`, so a table only exists at
`db.query.speakingPracticeAttempts` once this barrel export is added; without
it the repository sub-factory (§6) fails at runtime, not at typecheck.

`lexicalMatchScore` is stored as `real`; read-back tests must assert it with
`toBeCloseTo`, not `toBe` (float equality on a division result, e.g. `2/3`,
is not exact).

`attemptNumber` (via `countByTarget` + insert, no unique constraint) is
best-effort ordering, not a gapless/race-proof sequence — two near-simultaneous
submits for the same target could both compute the same `attemptNumber`. The
AC requires an attempt count/number field, not strict gaplessness under
concurrent submission from a single learner tapping record repeatedly (the
UI only allows one recording at a time), so this is accepted as-is rather
than adding a client idempotency key (the dictation `completionKey` pattern)
that the AC doesn't call for.

Migration `apps/api/drizzle/0144_wi1777_speaking_practice_attempts.sql`,
generated via `pnpm run db:generate:dev` (single `CREATE TABLE`, additive,
matching the immutable-forward-migration convention). No `## Rollback`
section needed (create-only, no data-loss surface — matches the WI-1552
precedent for additive-only migrations).

`speaking_practice_attempts` carries a plain `profile_id` FK to `person.id`,
so it is auto-detected by `PROFILE_SCOPED_SCAN_EXCEPTIONS`'s RLS-coverage
scanner — no manual registration needed.

### 6. Repository — new sub-namespace via `createScopedRepository`

New file `packages/database/src/repository.speaking-practice.ts`
(`createSpeakingPracticeRepository(db, profileId, scopedWhere)`), spread into
`createScopedRepository`'s returned object (`packages/database/src/repository.ts`),
alongside the existing six sub-factories:

```ts
export function createSpeakingPracticeRepository(
  db: Database,
  profileId: string,
  scopedWhere: ScopedWhere,
) {
  return {
    speakingPracticeAttempts: {
      async findMany(extraWhere?: SQL, orderBy?: SQL | SQL[]) {
        return db.query.speakingPracticeAttempts.findMany({
          where: scopedWhere(speakingPracticeAttempts, extraWhere),
          ...(orderBy ? { orderBy } : {}),
        });
      },
      async countByTarget(sessionId: string, targetText: string): Promise<number> {
        const rows = await db
          .select({ count: sql<number>`count(*)` })
          .from(speakingPracticeAttempts)
          .where(
            scopedWhere(
              speakingPracticeAttempts,
              and(
                eq(speakingPracticeAttempts.sessionId, sessionId),
                eq(speakingPracticeAttempts.targetText, targetText),
              ),
            ),
          );
        return Number(rows[0]?.count ?? 0);
      },
      async insert(values: {
        sessionId: string;
        subjectId: string;
        mode: 'repeat_after_me' | 'shadowing';
        targetText: string;
        transcript: string;
        locale: string;
        attemptNumber: number;
        lexicalMatchScore: number;
        missingWords: string[];
        extraWords: string[];
      }) {
        const [row] = await db
          .insert(speakingPracticeAttempts)
          .values({ profileId, ...values })
          .returning();
        return row;
      },
    },
  };
}
```

This is a single-scoped-table read/write — `createScopedRepository` is the
required path per the non-negotiable engineering rule (the direct-`db.select`
in `countByTarget` is scoped through `scopedWhere`, the same sanctioned
pattern used elsewhere for a count/aggregate the `findFirst`/`findMany` API
can't express — not a deviation).

### 7. API route + service (`apps/api/src/routes/speaking-practice.ts`, new)

Input/response schemas in `packages/schemas` (new file
`packages/schemas/src/speaking-practice.ts`):

```ts
export const recordSpeakingPracticeAttemptInputSchema = z.object({
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  mode: z.enum(['repeat_after_me', 'shadowing']),
  targetText: z.string().min(1).max(500),
  transcript: z.string().min(1).max(2000),
  locale: z.string().min(1).max(20),
});

export const recordSpeakingPracticeAttemptResponseSchema = z.object({
  attemptNumber: z.number().int(),
  lexicalMatchScore: z.number().min(0).max(1),
  missingWords: z.array(z.string()),
  extraWords: z.array(z.string()),
  isComplete: z.boolean(),
});
```

Service `apps/api/src/services/speaking-practice/attempt.ts` —
`recordSpeakingPracticeAttempt(db, profileId, input)`, mirroring
`recordDictationResult`'s ownership-then-transaction shape:

1. Ownership check *before* writing anything: `createScopedRepository(db, profileId).subjects.findFirst(eq(subjects.id, input.subjectId))` and `.sessions.findFirst(eq(learningSessions.id, input.sessionId))` — both must resolve, or throw `SubjectNotFoundError`/a new `SessionNotFoundError` (write-side IDOR guard, same rationale as the dictation precedent's comment).
2. `scoreSpeakingPracticeAttempt(input.targetText, input.transcript)` (§4).
3. Inside `db.transaction`: re-open `createScopedRepository` on the tx handle, `countByTarget(sessionId, targetText)` → `attemptNumber = count + 1`, then `speakingPracticeAttempts.insert({...})`.
4. Return `{ attemptNumber, lexicalMatchScore, missingWords, extraWords, isComplete }` parsed through the response schema.

Route: `POST /language/speaking-practice/attempts`, `zValidator('json', recordSpeakingPracticeAttemptInputSchema, ...)`, `requireProfileId`, `assertNotProxyMode` (matches the dictation-route pattern for a learner-initiated write).

### 8. Mobile — wiring + rendering

**`apps/mobile/src/lib/sse.ts`** — derive, don't hand-redeclare (the exact
WI-1756 rework this repo already paid for once):

```ts
import { type StreamLanguageSpeakingPractice } from '@eduagent/schemas';
export type LanguageSpeakingPracticeEvent = StreamLanguageSpeakingPractice;
```

Add `speakingPractice?: LanguageSpeakingPracticeEvent;` to the existing
hand-declared `LanguageLearningActivityEvent` interface, and extend its
`activityType` union literal list with `'repeat_after_me' | 'shadowing'`
(required now that these values flow over the wire — this is not a drive-by
fix of the pre-existing hand-declaration debt on the wrapper type, just the
minimum extension needed for the new values to type-check; the wrapper
itself stays hand-declared as it is today).

**`apps/mobile/src/components/session/use-session-streaming.ts:901-906`** —
the load-bearing gotcha. Extend the allowlist:

```ts
setLanguageLearning(
  result.languageLearning?.gradedInput ||
    result.languageLearning?.meaningOutput ||
    result.languageLearning?.speakingPractice
    ? result.languageLearning
    : null,
);
```

A regression test proves the gate: a `done` frame carrying only
`speakingPractice` (no `gradedInput`/`meaningOutput`) must set
`languageLearning` non-null — red before this edit, green after (same
pattern as the WI-1756 F1/F2 fix this file already carries scars from).

**New wrapper `apps/mobile/src/components/session/SpeakingPracticeActivity.tsx`**
(parallels `GradedInputCard`/`MeaningOutputCard`): takes
`{ activity: LanguageLearningActivityEvent; textToSpeechLanguage?: string; onDismiss?: () => void }`,
early-returns `null` if `!activity.speakingPractice`. Internally:

- `useTextToSpeech({ language: textToSpeechLanguage })` for `onPlayTarget` (same hook/pattern `GradedInputCard` already uses).
- `useSpeechRecognition({ lang: activity.speakingPractice.locale })` for `isListening`/`transcript`/`onRecordPress` (start/stop toggle).
- On `stopListening()` with a non-empty trimmed transcript: POST to
  `/language/speaking-practice/attempts` with `{ sessionId, subjectId, mode, targetText, transcript, locale }` (sessionId/subjectId threaded down as props from `session/index.tsx`, which already has both in scope — verified: `subjectId` and `activeSessionId`/`routeSessionId` are live component-level values well above the footer-card wiring). Store the response (`{ missingWords, extraWords, isComplete }`) in local state.
- `onRetry`: clear both the transcript and the stored server response — target text is untouched (component prop, not state), satisfying "retry without losing the target" directly (no code path can drop it).
- Renders `<SpeakingPracticeCard targetText={activity.speakingPractice.targetText} transcript={transcript} isListening={isListening} onPlayTarget={...} onRecordPress={...} onRetry={...} missingWords={serverResponse?.missingWords} extraWords={serverResponse?.extraWords} isComplete={serverResponse?.isComplete} />` — the three new optional props are the server's authoritative feedback (§4); the card renders these instead of its own internal computation whenever they are supplied.

Wired in `apps/mobile/src/app/(app)/session/index.tsx` alongside
`gradedInputCard`/`meaningOutputCard` (same `languageLearning?.X ? <Card/> : null` construction, same footer JSX slot).

**`SpeakingPracticeCard.tsx`** (revised post-Phase-4, see §4's M1 remediation)
— three new optional props (`missingWords?: string[]`, `extraWords?: string[]`,
`isComplete?: boolean`). A verdict (match, missing words, extra words) renders
**only** when `missingWords` is supplied; otherwise the card shows the raw
transcript and nothing else. `compareSpeakingPracticeTranscript` and its
internal call site were **deleted**, not kept as a fallback — the original
plan's "existing three tests are unaffected" premise was wrong in exactly the
way Phase-4 caught: an internal-compute fallback IS reachable (via STT
interim results while listening, and on POST failure), so the three original
tests were rewritten to assert the new neutral-state behavior instead. New
`extraWords` i18n key (no plural family — a flat `{{words}}` interpolation
like `retryWithMissingWords`, so no Polish `_few`/`_many` entries needed).

### 9. i18n

New key in `apps/mobile/src/i18n/locales/en.json` under
`session.speakingPractice`: `"extraWords": "Extra: {{words}}"`. Run
`pnpm translate` then `scripts/rebuild-source-baseline.ts` to regenerate the
per-locale baseline hashes (no `_one`/`_other` family, so
`manual-plural-guard.test.ts`'s Polish completeness check does not apply to
this key).

## Tasks

- [x] T1: Schema — `activityType` enum + `streamLanguageSpeakingPracticeSchema` + `speakingPractice` field (`packages/schemas/src/stream-fallback.ts`). Test: schema parse (valid + rejects missing required fields).
- [x] T2: Server selection — `buildLanguageActivityTelemetry`'s conditional fluency branch + `buildSpeakingPracticeArtifact()` (`apps/api/src/services/language-session-engine.ts`). Test: beginner fluency (A1/A2) → `repeat_after_me` artifact; unset-cefrLevel and B1+ fluency → unchanged `timed_drill`/no-artifact behavior (regression — an existing test asserts this for unset cefrLevel specifically, so `null`/`undefined` is explicitly excluded from the beginner gate).
- [x] T3: Prompt — `speakingPracticeLines` block (`apps/api/src/services/language-prompts.ts`). Ran `pnpm eval:llm`: 476 snapshots, zero tracked drift (no existing fixture persona/activity exercises a beginner-fluency repeat_after_me turn, so the new conditional block is inert on current fixtures — a harness-written zero-drift receipt is the accepted outcome per `AGENTS.md`). Correctness of the new block's exact text is covered directly by a `language-prompts.test.ts` unit test instead of a new eval fixture (scope-narrowed from the original plan text below).
- [x] T4: Scoring module — `apps/api/src/services/speaking-practice/scoring.ts`. Tests: punctuation, casing, diacritics, word order, empty transcript, empty target, multiplicity/dedup-regression. (Non-Latin/Japanese target is moot in practice — `apps/api/src/data/languages.ts`'s `SUPPORTED_LANGUAGES` list, the only source of `languageCode` reaching this scorer, has no `ja` entry; the Unicode-aware normalizer is still the right general-purpose choice.)
- [x] T5: DB schema + migration 0144 + repository sub-factory. Test: read-back through `createScopedRepository` (integration test, not run locally — see T6). Discovered during verification: RLS coverage requires the ENABLE + CREATE POLICY statements in the SAME migration (added to `0144_wi1777_speaking_practice_attempts.sql`) and a manifest entry in `apps/api/src/services/database-rls-coverage.ts`'s `PROFILE_SCOPED_TABLES` (a second, API-side RLS guard beyond `packages/database`'s scanner) — both required, neither was "automatic" as originally assumed; both are now green. Renumbered twice during post-PR rebases onto main, each time because a landed PR took the slot first: 0142→0143 (WI-1002's `0142_supporter_contract_fk_indexes_partial`), then 0143→0144 (WI-1844's `0143_wi1844_chip_fk_indexes`). Snapshot regenerated both times via `pnpm run db:generate:dev` against main's cumulative schema.
- [x] T6: Route + service (`speaking-practice.ts` route + service). Tests: ownership/profile-scoping (cross-profile subject AND cross-profile session separately rejected), attempt-number increments across retries, response schema, whole-bundle vertical (select → build artifact → POST → read back via `createScopedRepository` → assert response matches persisted row). Integration test (`attempt.integration.test.ts`) requires `DATABASE_URL`/Doppler; could not run against a real DB in this sandbox (a pnpm/corepack version-resolution mismatch breaks the nested `doppler run` invocation in this environment) — typecheck/lint clean, CI is the authoritative gate for this suite per `AGENTS.md`.
- [x] T7: Mobile — `sse.ts` derivation, `use-session-streaming.ts` gate extension (regression test first, red→green, confirmed), `SpeakingPracticeActivity.tsx` wrapper, `session/index.tsx` wiring (keyed by target text so a new turn's target rotation forces a fresh transcript/feedback state, while retry on the same target never remounts), `SpeakingPracticeCard.tsx` server-feedback props (single scorer — see §4) + i18n keys. Tests: mobile rendering from live session metadata (activity present/absent), submit-once-per-stop, retry preserves target, extraWords display, mutation-failure user-visible error path (added during lint — `local/require-mutate-error-handling`).
- [x] T8: i18n — `en.json` keys (`extraWords`, `attemptError`), `pnpm translate` (6 locales), baseline rebuild. `check:i18n`/`check:i18n:orphans`/`check:i18n:jsx-literals`/`manual-plural-guard.test.ts` all clean.
- [x] T9: Phase-4 adversarial self-review (fresh-context subagent, opus, iteration 1 of cap-3): retry-without-losing-target (clean — target is prop-derived, never local state), no-raw-audio (clean — grepped the whole diff), deterministic-scoring edges (clean — the scoring module itself is correct), profile-scoping/IDOR (clean — subjectId and sessionId checked independently, no TOCTOU gap). One MUST_FIX (M1) and one companion cleanup (C1): the mobile card kept an internal-compute fallback that was reachable via STT interim results and on POST failure, producing a client-computed verdict that could diverge from the server's persisted score (exact scenario: diacritic-differing transcript shows "missing" client-side while the server, which folds diacritics, scores it complete). Remediated: `compareSpeakingPracticeTranscript` deleted outright (confirmed unused elsewhere), card now renders a verdict only when server feedback is explicitly supplied — see §4 and §8 for the full writeup. One iteration was sufficient; no second Phase-4 pass was needed.

**Full verification run (this session):** `@eduagent/schemas` 39/39 suites, `@eduagent/database` 29/29 suites (295 tests) incl. RLS coverage, `api` 439/439 suites (8020 tests), `mobile` 486/486 suites (5772 tests) — all green pre-M1. Post-M1 remediation: `SpeakingPracticeCard.test.tsx` (5→5 tests, rewritten) and `SpeakingPracticeActivity.test.tsx` (6→8 tests) re-run green; full mobile suite re-run green (see below).

T6 includes one test that exercises the whole-bundle AC as a single vertical,
not just the per-layer slices: select a beginner-fluency activity → build its
`speakingPractice` artifact → POST an attempt against it through the route →
read the persisted row back via `createScopedRepository` → assert the
response the learner would see (`missingWords`/`extraWords`/`isComplete`)
matches the persisted row exactly (single-scorer invariant from §4).

## AC cross-reference

- WI-1548 AC1 (telemetry supports both types + targetText/locale/modality/retryGuidance) → T1, T2.
- WI-1548 AC2 (Four Strands prompt can select for beginner speaking) → T2 (selection), T3 (prompt reflects it).
- WI-1548 AC3 (mobile renders from live session metadata, starts TTS/STT) → T7.
- WI-1548 AC4 (retry without losing target) → T7 (`SpeakingPracticeActivity`'s `onRetry`).
- WI-1548 AC5 / WI-1549 AC5 (tests: schema parse, selection, mobile rendering, scoring edges, ownership/scoping, persistence reads/writes) → T1, T2, T4, T5, T6, T7.
- WI-1549 AC1 (persistence model fields) → T5.
- WI-1549 AC2 (deterministic server score, no LLM) → T4, T6.
- WI-1549 AC3 (mobile displays missing/extra + retry success) → T7.
- WI-1549 AC4 (no raw audio) → T5 (schema has none), T9 (grep-verified).

## Rollback

Migration 0144 only creates a new table — no rollback procedure needed; a
revert is `DROP TABLE speaking_practice_attempts` with no data-loss impact on
any other table (nothing else references it).
