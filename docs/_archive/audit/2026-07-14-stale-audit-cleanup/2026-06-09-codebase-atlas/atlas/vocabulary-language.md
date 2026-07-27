# Vocabulary & Language Learning — Functional Atlas

## Screens (route → purpose)

### 1. Language Setup / Calibration
- **Route:** `/(app)/onboarding/language-setup` (param: `subjectId`, `subjectName`, `languageName`, `returnTo`)
- **Source:** `apps/mobile/src/app/(app)/onboarding/language-setup.tsx`
- **Purpose:** One-time wizard that fires when the user creates a language subject. Collects native language (14 options + free-text "Other") and starting CEFR level (A1–B2 only; C1/C2 excluded from UI). On submit, calls `PUT /subjects/:id/language-setup` which runs `configureLanguageSubject` → `setNativeLanguage` + `regenerateLanguageCurriculum`, then immediately launches the first curriculum session.
- **Secondary entry:** accessible again via `More → Mentor Language → /more/account` when `returnTo=settings`; same screen, same API.
- **Gating:** `navigationContract.isParentProxy` → all controls disabled, read-only banner shown. No `isOwner` gate — any profile can reach this if they own a language subject.
- **Nav depth from tab root:** Progress tab → subject card → (create flow routes here) = 3 taps minimum; or via More tab → Account → Mentor Language → language-setup = 4 taps.

### 2. Vocabulary Browser (cross-subject)
- **Route:** `/(app)/progress/vocabulary`
- **Source:** `apps/mobile/src/app/(app)/progress/vocabulary.tsx:95`
- **Purpose:** Lists all language subjects with vocabulary counts, broken down by CEFR level. Each subject card is tappable → pushes to `/vocabulary/[subjectId]`. Shows total word count in header. Four distinct empty-state branches: no-language-subject, new-learner, has-language-subject-but-zero-words, and error.
- **Gating:** `navigationContract.canEnter('progress/vocabulary')` is `!familyShape` — **guardian/family mode profiles cannot enter this route** (`navigation-contract.ts:418-419`). Redirects to `/(app)/progress` if denied.
- **Nav depth from Progress tab root:** Progress tab → Vocabulary chip (in ProgressStatsChips) = **2 taps** (chip only shown if `hasLanguageSubject && isViewingSelf`).

### 3. Vocabulary List (per-subject)
- **Route:** `/(app)/vocabulary/[subjectId]`
- **Source:** `apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx:120`
- **Purpose:** Flat list of all vocabulary items for one subject, ordered by `mastered ASC, termNormalized ASC`. Shows term, translation, type badge (word/chunk), CEFR badge, mastered checkmark. Only action available: delete (with confirm dialog). No add, no edit, no review.
- **Cross-tab stack note:** This route lives in the `vocabulary/` stack (separate from `progress/`). Pushed from `progress/vocabulary` (cross-stack push); the layout seeds `initialRouteName='index'` so back-navigation returns to progress/vocabulary rather than Home tab (`_layout.tsx:7-9`). The `vocabulary/index` redirect itself is a navigation guard, never rendered to the user (`index.tsx:17-33`).
- **Nav depth:** Progress tab → Progress/vocabulary → [subject card] → Vocabulary list = **3 taps** (buried level).

### 4. Subject Progress Detail (inline CEFR milestone + inline vocab summary)
- **Route:** `/(app)/progress/[subjectId]`
- **Source:** `apps/mobile/src/app/(app)/progress/[subjectId]/index.tsx:52`
- **Purpose:** Subject-level progress page. Contains:
  - Inline vocabulary summary card (term counts by mastered/learning/new + byCefrLevel breakdown) — shown only if `subject.vocabulary.total > 0` (`index.tsx:410`)
  - "View all vocabulary" link → pushes `/(app)/vocabulary/[subjectId]`
  - CEFR milestone card — shown if `isLanguageSubject` (pedagogyMode=four_strands or languageProgress data exists). Displays currentLevel, milestone title, word/chunk progress bar, and nextMilestone preview. Backed by `GET /subjects/:subjectId/cefr-progress` via `useLanguageProgress`.
- **Nav depth:** Progress tab → subject card = **2 taps** for the milestone card; + 1 tap for full vocabulary list.

### 5. Progress Home (vocabulary chip entry point)
- **Route:** `/(app)/progress` (index)
- **Source:** `apps/mobile/src/app/(app)/progress/index.tsx:574-582`
- **Purpose:** Contains the `ProgressStatsChips` component which renders a tappable vocabulary count chip when `hasLanguageSubject && isViewingSelf`. Chip text: "N words" (if >0) or "Vocabulary". Pressing it pushes `/(app)/progress/vocabulary`.
- **Nav depth:** Progress tab = **1 tap** to see the chip; **2 taps** total to reach the vocabulary browser.

### 6. Vocabulary Quiz (practice → quiz flow)
- **Route:** `/(app)/quiz` (index, launch, play, results)
- **Source:** `apps/mobile/src/app/(app)/quiz/index.tsx:89`; `apps/mobile/src/app/(app)/practice/index.tsx:380-859`
- **Purpose:** Multiple-choice vocabulary quiz. One `LanguageVocabCard` per active language subject (filtering `pedagogyMode === 'four_strands' && languageCode && status === 'active'`). Shows "Starter words" copy when user has fewer than 5 recorded vocabulary items, otherwise "Personalised" copy.
- **Two entry points:**
  1. Practice tab → Practice screen → vocabulary card for each language subject
  2. Practice tab → Quiz menu → vocabulary card for each language subject
- **Nav depth:** Practice tab → Practice screen → vocabulary card → launch → round = **4 taps** minimum.
- **Gating:** No explicit isOwner gate; family-shape restriction via nav contract on `progress/vocabulary` does not apply to the quiz flow.

### 7. Fluency Drill (in-session)
- **Route:** Inside `/(app)/session`
- **Source:** `apps/mobile/src/app/(app)/session/index.tsx:390` + `apps/mobile/src/components/session/FluencyDrillStrip.tsx`
- **Purpose:** Language-specific timed fluency drill embedded in the session UI. Activated when LLM emits `ui_hints.fluency_drill.active=true` in the structured envelope. Shows a countdown timer and a score strip after the drill. Not a separate route — an overlay strip in the session screen.
- **Nav depth:** Any route that starts a session = session screen = **inline** (no additional tap).

---

## Capabilities (user task → backend process file:line)

### A. Create a language subject (automatic language detection)
- **User action:** Types a subject name (e.g. "Spanish", "Learn French") in `create-subject.tsx`
- **API:** `POST /subjects` → `routes/subjects.ts:108` → `createSubjectWithStructure` → `createSubject` (`services/subject.ts:231`)
- **Language detection:** `detectLanguageSubject(rawInput)` (`services/subject.ts:242`) → `services/language-detect.ts:39` — runs LLM via `routeAndCall(messages, 1)` to confirm intent and extract `languageCode`; falls back to `detectLanguageHint` (name-matching in `data/languages.ts:149`) if LLM fails
- **After creation:** if `pedagogyMode === 'four_strands'`, `create-subject.tsx:364` routes to language-setup screen
- **Data written:** `subjects` row with `pedagogyMode='four_strands'`, `languageCode`

### B. Configure native language + starting CEFR level
- **User action:** On language-setup screen, selects native language + level, taps Continue
- **API:** `PUT /subjects/:id/language-setup` → `routes/subjects.ts:116` → `configureLanguageSubject` (`services/subject.ts:549`)
- **Steps:** `setNativeLanguage(db, profileId, subjectId, nativeLanguage)` (`services/retention-data.ts:1394`) then `regenerateLanguageCurriculum(db, profileId, subjectId, languageCode, startingLevel)` (`services/language-curriculum.ts:348`)
- **Curriculum generation:** Inserts curriculum row + curriculum topics from `MILESTONE_LIBRARY` static data (`language-curriculum.ts:23-245`). For startingLevel L, generates all milestones for L plus 2-4 preview milestones from L+1. Each milestone has `cefrLevel`, `cefrSublevel`, `targetWordCount`, `targetChunkCount`.
- **Data written:** `curricula`, `curriculum_topics`, `teaching_preferences.nativeLanguage`

### C. Start a language session (Four Strands pedagogy)
- **User action:** Taps "Continue" after language setup, or resumes from progress
- **API:** Session creation flow → `session-exchange.ts:1904` — fetches up to 60 mastered vocabulary terms (`vocabulary.mastered=true`) for `knownVocabulary`
- **Prompt injection:** `exchange-prompts.ts:845` calls `buildFourStrandsPrompt(context)` (`services/language-prompts.ts:30`) when `context.pedagogyMode === 'four_strands'`
- **Prompt includes:** target language name, native language, Nation Four Strands rules (meaning-focused input/output, language-focused learning, fluency development), known vocabulary list (sanitized, up to 60 terms), direct correction rules, fluency drill instructions
- **Data read:** `vocabulary WHERE mastered=true AND subjectId=X ORDER BY updatedAt DESC LIMIT 60`

### D. Auto-extract vocabulary after session completion (background)
- **Trigger:** Inngest event on session completion (`session-completed.ts`)
- **Step:** `inngest/functions/session-completed.ts:788` → `extractVocabularyFromTranscript(transcript, languageCode, cefrLevel)` (`services/vocabulary-extract.ts:34`)
- **LLM call:** Sends last session transcript to LLM via `routeAndCall(messages, 1)`, requesting JSON `{items:[{term, translation, type, cefrLevel}]}`. Extracts 0–8 items.
- **Upsert:** `upsertExtractedVocabulary(db, profileId, subjectId, items)` (`services/vocabulary.ts:382`) — calls `createVocabulary` (upsert on `termNormalized` unique constraint) then `reviewVocabulary` if `quality` is set (SM-2 initialized)
- **Post-upsert:** Calls `getCurrentLanguageProgress` to update milestone progress
- **Data written:** `vocabulary` (upsert), `vocabulary_retention_cards` (SM-2 initialized), `practice_activity_events`

### E. List vocabulary for a subject
- **User action:** Opens `/vocabulary/[subjectId]`
- **API:** `GET /subjects/:subjectId/vocabulary` → `routes/vocabulary.ts:39` → `listVocabulary(db, profileId, subjectId)` (`services/vocabulary.ts:77`)
- **Auth:** `requireProfileId` + `ensureLanguageSubject` (verifies `subjects.profileId = profileId`)
- **Sort:** `mastered ASC, termNormalized ASC` — unmastered items first, then alphabetical
- **Data read:** `vocabulary WHERE profileId=X AND subjectId=Y`

### F. Delete a vocabulary item
- **User action:** Tap trash icon on a vocabulary row → confirm dialog
- **API:** `DELETE /subjects/:subjectId/vocabulary/:vocabularyId` → `routes/vocabulary.ts:116` → `deleteVocabulary(db, profileId, subjectId, vocabularyId)` (`services/vocabulary.ts:184`)
- **Guard:** `assertNotProxyMode` (proxy/parent-viewing-child blocks writes, `routes/vocabulary.ts:90`)
- **Auth:** WHERE clause requires `vocabulary.profileId=profileId AND vocabulary.subjectId=subjectId AND vocabulary.id=vocabularyId` — triple-scoped
- **Data deleted:** `vocabulary` row; retention card cascades via FK

### G. Review vocabulary (SM-2 SRS)
- **User action:** Quiz play → answer question → round completion
- **API:** `POST /subjects/:subjectId/vocabulary/:vocabularyId/review` → `routes/vocabulary.ts:85` → `reviewVocabulary(db, profileId, vocabularyId, {quality: 0-5}, subjectId)` (`services/vocabulary.ts:246`)
- **SM-2 logic:** Transaction: read card → compute `sm2({quality, card})` → update `vocabulary_retention_cards` (easeFactor, intervalDays, repetitions, lastReviewedAt, nextReviewAt, failureCount, consecutiveSuccesses) → set `vocabulary.mastered = (consecutiveSuccesses >= 3)`
- **Activity event:** `recordPracticeActivityEvent` via `safeWrite` (non-core dispatch)
- **Data written:** `vocabulary` (mastered flag), `vocabulary_retention_cards` (SM-2 fields)

### H. View CEFR milestone progress
- **User action:** Opens subject progress screen (`/(app)/progress/[subjectId]`)
- **API:** `GET /subjects/:subjectId/cefr-progress` → `routes/language-progress.ts:19` → `getCurrentLanguageProgress(db, profileId, subjectId)` (`services/language-curriculum.ts:423`)
- **Logic:** Queries all curriculum_topics (milestones) + all vocabulary for the subject → counts `mastered` words/chunks per milestoneId → computes `milestoneProgress = (wordRatio + chunkRatio) / 2` → finds current milestone (first where mastered < target) and next milestone
- **Data read:** `subjects`, `curricula`, `curriculum_topics`, `vocabulary` (milestone mastery counts)

### I. Generate vocabulary quiz round
- **User action:** Practice tab → vocabulary quiz → launch
- **API:** `POST /quiz/generate` → quiz route → `generateRound(...)` (`services/quiz/generate-round.ts:530`)
- **Context fetch:** `getVocabularyRoundContext(db, profileId, subjectId)` (`services/quiz/queries.ts:161`) — loads all vocab + retention cards, computes SM-2 due items (libraryItems), computes CEFR ceiling via `getCefrCeilingForDiscovery` (90th-percentile CEFR of mastered items, +1 level)
- **Content plan:** Discovery questions (LLM-generated) + mastery questions (SM-2 due items from bank)
- **LLM call:** `buildVocabularyPrompt({discoveryCount, ageBracket, bankEntries, languageCode, cefrCeiling, themePreference, interests, libraryTopics, learnerNativeLanguage, recentStruggles, recentlyMissedItems})` (`services/quiz/vocabulary-provider.ts:243`) → raw JSON response → `validateVocabularyRound` → injects mastery questions
- **Distractor building:** `pickDistractors` draws from user's vocabulary bank translations, case-insensitively deduped
- **Data read:** `vocabulary`, `vocabulary_retention_cards`, `quiz_missed_items` (recently missed), `quiz_rounds` (recent answers), `curriculum_topics` (library topics), `profiles` (age, interests, nativeLanguage)

### J. Conversation language sync (UI shell → LLM prose language)
- **Trigger:** App load or i18next `languageChanged` event
- **Hook:** `useMentorLanguageSync` (`hooks/use-mentor-language-sync.ts:10`) — runs in `_layout.tsx`
- **Logic:** Clamps `i18next.language` through `conversationLanguageSchema.safeParse` (10 supported languages), compares to `activeProfile.conversationLanguage`, patches via `useUpdateConversationLanguage` mutation if different
- **Prevents:** invalid `conversation_language` DB values (DB CHECK constraint enforced by migration 0087)
- **Data written:** `profiles.conversation_language`

---

## Navigation Depth Map

| Capability | Starting tab | Taps to reach | Depth rating |
|---|---|---|---|
| Vocabulary chip (count) | Progress | 1 | Shallow |
| Vocabulary browser (cross-subject) | Progress | 2 | OK |
| CEFR milestone card | Progress | 2 | OK |
| Per-subject vocab summary (inline) | Progress | 2 | OK |
| **Full vocab list per subject** | Progress | **3** | **Deep** |
| Language setup (initial) | (from create-subject flow) | 3–4 | Deep |
| Language setup (re-entry from More) | More | **4** | **Very Deep** |
| Vocabulary quiz | Practice | 4 | Deep |
| Fluency drill | Any session | Inline | N/A |
| CEFR progress (JSON endpoint) | Progress | 2 (background) | OK |

Anything at depth 3 is unlikely to be discovered without instructions. The vocabulary list screen (`/vocabulary/[subjectId]`) is the main victim — 3 taps from Progress tab, or 4 from any other tab.

---

## Backend Processes & Data Model

### Tables

| Table | Purpose | Key columns |
|---|---|---|
| `subjects` | One row per language (or other) subject | `profileId`, `pedagogyMode` (`four_strands`\|`socratic`), `languageCode`, `status` |
| `vocabulary` | User's accumulated word/phrase bank | `profileId`, `subjectId`, `term`, `termNormalized`, `translation`, `type` (`word`\|`chunk`), `cefrLevel` (nullable), `milestoneId` (nullable FK → `curriculum_topics`), `mastered` |
| `vocabulary_retention_cards` | SM-2 state per vocabulary item | `vocabularyId`, `easeFactor`, `intervalDays`, `repetitions`, `lastReviewedAt`, `nextReviewAt`, `failureCount`, `consecutiveSuccesses` |
| `curricula` | One curriculum version per subject | `subjectId`, `version` |
| `curriculum_topics` | CEFR milestones within a curriculum | `curriculumId`, `bookId`, `cefrLevel`, `cefrSublevel`, `targetWordCount`, `targetChunkCount`, `title` |
| `teaching_preferences` | Per-subject learner preferences | `subjectId`, `profileId`, `nativeLanguage` |

### Schemas (packages/schemas/src/language.ts)

- `pedagogyModeSchema` — `socratic | four_strands` (`language.ts:4`)
- `vocabTypeSchema` — `word | chunk` (`language.ts:7`)
- `cefrLevelSchema` — `A1 | A2 | B1 | B2 | C1 | C2` (`language.ts:10`)
- `vocabularySchema` — full vocabulary row shape including `cefrLevel` nullable and `milestoneId` nullable (`language.ts:49-63`)
- `vocabularyRetentionCardSchema` — SM-2 state (`language.ts:92-104`)
- `languageProgressSchema` — CEFR progress response for a subject including `currentMilestone` and `nextMilestone` (`language.ts:158-174`)
- `languageSetupSchema` — `{nativeLanguage: string, startingLevel: CefrLevel}` (`language.ts:25-31`)

### Supported Languages for Tutoring

13 languages in `apps/api/src/data/languages.ts:18-136`: Spanish, French, Italian, Portuguese, Dutch, Norwegian (Bokmål), Swedish, Danish, Romanian, German, Indonesian, Malay, Swahili. Each carries FSI difficulty category (1 or 2), FSI hours estimate, per-CEFR milestone counts, STT locale, TTS voice.

### API Routes (Hono)
| Method | Path | Handler file | Service |
|---|---|---|---|
| `GET` | `/subjects/:subjectId/vocabulary` | `routes/vocabulary.ts:39` | `services/vocabulary.ts:listVocabulary` |
| `POST` | `/subjects/:subjectId/vocabulary` | `routes/vocabulary.ts:57` | `services/vocabulary.ts:createVocabulary` |
| `POST` | `/subjects/:subjectId/vocabulary/:vocabularyId/review` | `routes/vocabulary.ts:85` | `services/vocabulary.ts:reviewVocabulary` |
| `DELETE` | `/subjects/:subjectId/vocabulary/:vocabularyId` | `routes/vocabulary.ts:116` | `services/vocabulary.ts:deleteVocabulary` |
| `GET` | `/subjects/:subjectId/cefr-progress` | `routes/language-progress.ts:19` | `services/language-curriculum.ts:getCurrentLanguageProgress` |
| `PUT` | `/subjects/:id/language-setup` | `routes/subjects.ts:116` | `services/subject.ts:configureLanguageSubject` |

### Inngest Background Processes
| Function | Trigger | Language-learning action | File |
|---|---|---|---|
| `session-completed` | Session finalized event | Calls `extractVocabularyFromTranscript` → `upsertExtractedVocabulary` | `inngest/functions/session-completed.ts:788-827` |
| (session context) | On each exchange | Reads mastered vocab for `knownVocabulary` context | `services/session/session-exchange.ts:1904-1918` |

### SM-2 Mastery Rule
A vocabulary item becomes `mastered=true` when `consecutiveSuccesses >= 3` (i.e. quality ≥ 3 on three consecutive reviews). `services/vocabulary.ts:297-298`.

### CEFR Ceiling for Quiz
The quiz CEFR ceiling is `90th-percentile CEFR of mastered items + 1 level`, computed by `getCefrCeilingForDiscovery` in `services/quiz/vocabulary-provider.ts:156-169`. Fresh learners default to A1.

### Curriculum Milestone Library
Static data in `services/language-curriculum.ts:23-245`. 6 CEFR levels × 6–10 milestone titles each = 44+ milestones total. These are not LLM-generated; they are deterministic. Target word counts scale with CEFR: A1 starts at 45 words, C2 at 140 (`buildTargetCounts`, `language-curriculum.ts:256-283`).

---

## Complexity Signals & Redesign Notes

### 1. Three separate vocabulary "locations" with partial overlap
The user encounters vocabulary data in three different screens, none of which clearly advertises the others:
- **Progress home** (`/(app)/progress`): vocabulary count chip in ProgressStatsChips — shows a number, tappable, routes to vocabulary browser
- **Subject progress** (`/(app)/progress/[subjectId]`): inline card with mastered/learning/new counts and byCefrLevel table, plus "View all" link
- **Vocabulary browser** (`/(app)/progress/vocabulary`): cross-subject listing of subjects with per-subject counts + CEFR breakdown, tappable to vocabulary list

All three draw from the same `vocabulary` table but present different cuts. A user who sees "47 words" on the home chip, then "24 mastered" on the subject page, then a CEFR table on the browser will need to reconcile three different framings of the same data.

### 2. Vocabulary list has only one action: delete
`/vocabulary/[subjectId]` is a pure read+delete screen. Users cannot add, edit, or manually review a word from this screen. The only path to "practice" a specific vocabulary item is through the quiz (which selects items algorithmically) or through a session (passive). This is a notable dead-end for a user who wants to deliberately study a word they see in their list.

### 3. CEFR milestone progress is invisible until the user drills into subject progress
The milestone card (current level + milestone title + progress bar + next milestone) only appears inside `/(app)/progress/[subjectId]` — 2 taps from the Progress tab root. There is no summary of "which CEFR level are you at?" on the Progress home page or in the vocabulary browser. A user with 3 language subjects has to visit 3 separate subject pages to see 3 separate milestone cards.

### 4. Language setup re-entry is buried at 4 taps
If a user wants to change their starting CEFR level or native language, the path is: More tab → Account row (labeled "Mentor Language" in More.tsx:141 but routes to `more/account`) → account screen → the `PUT /subjects/:id/language-setup` endpoint recalculates the curriculum. This route was introduced as a re-entry for settings (`returnTo=settings` in language-setup.tsx:139-141) but is not prominently surfaced.

### 5. Quiz and session vocabulary are two parallel systems
- The **session** (Four Strands tutor) passively extracts and stores vocabulary after each session. The learner cannot see or control what gets extracted during a session.
- The **quiz** actively tests vocabulary via multiple-choice using SM-2 scheduling. Quiz and session SRS scores are both written to `vocabulary_retention_cards` but via different code paths.
- There is no UI that shows "these words are due for review today" or "you practiced this word 3 times." The SRS data exists but is not surfaced to the user.

### 6. Fluency drill is a fully inline modal-like experience inside the session
The `FluencyDrillStrip` (`session/index.tsx:1117`) overlay appears/disappears based on LLM envelope signals, not user intent. Users cannot trigger a fluency drill voluntarily. There is no separate fluency drill screen or explicit drill mode.

### 7. Language detection is LLM-backed on every new subject creation
`detectLanguageSubject` fires on every `POST /subjects` call (`subject.ts:242`). If the LLM is unavailable, it falls back to `detectLanguageHint` (name matching). This means subject creation and language detection are coupled — there is no dedicated "set this subject to language learning mode" affordance post-creation except via the language-setup endpoint.

### 8. Guardian/family-mode profiles cannot access the vocabulary browser
`navigationContract.canEnter('progress/vocabulary')` returns `!familyShape` (`navigation-contract.ts:418-419`). Family-mode guardians cannot browse their own vocabulary. If the guardian also learns a language (as a solo learner might), they lose vocabulary browsing when they switch to family mode. This is likely unintentional or at least not user-friendly.

### 9. Vocabulary quiz is accessible from two different entry points with the same UI
Practice tab → Practice screen → language cards OR Practice tab → Quiz → vocabulary cards. Both paths lead to the same `/(app)/quiz/launch` flow. The Practice screen also contains vocabulary cards (`practice/index.tsx:806-859`). This is a second parallel entry to the vocabulary quiz that can confuse discoverability.

### 10. Native language options are hardcoded at 14 values with an "Other" free-text escape
`NATIVE_LANGUAGE_OPTIONS` in `language-setup.tsx:23-38` lists 14 languages. The SM-2 distractor builder uses L1-aware pairs for only 8 language combinations (`vocabulary-provider.ts:204-213`: en-es, es-en, en-fr, fr-en, cs-de, de-cs, en-de, de-en). The quiz benefits from false-cognate distractors only for those pairs.

---

## Overlaps with Other Domains

### Vocabulary data appears in Progress domain (3 surfaces)
The progress domain (`/(app)/progress/**`) renders vocabulary counts in three places simultaneously — the chip on the progress home, the inline card on subject detail, and the vocabulary browser screen. A redesign consolidating these into one surface would significantly reduce the vertical (depth) problem.

### CEFR milestone progress overlaps with the general progress/curriculum domain
`getCurrentLanguageProgress` (`services/language-curriculum.ts:423`) queries `curricula`, `curriculum_topics`, and `vocabulary`. The curriculum/topic data model is shared with the non-language learning (socratic) subject flow. CEFR-level milestones are simply curriculum topics with `cefrLevel` set — there is no separate "language progress" table.

### Quiz domain consumes vocabulary directly
The quiz domain (`services/quiz/`) reads from the `vocabulary` and `vocabulary_retention_cards` tables directly (scoped via `createScopedRepository`). SM-2 review results from quiz play are written back to `vocabulary.mastered` and `vocabulary_retention_cards`, the same tables that language sessions write to. The quiz and the session are both SRS review mechanisms, but they are surfaced in completely different parts of the UI with no unification signal.

### Conversation language (UI language) and vocabulary language are distinct but share `conversationLanguageSchema`
`useMentorLanguageSync` in the More/account flow (`more/account.tsx:43-58`) changes the i18n UI shell language, which `useMentorLanguageSync` then clamps through `conversationLanguageSchema` before patching `profiles.conversation_language`. This affects what language the LLM uses for prose in sessions — it is distinct from the language the user is *learning*. These two concepts (language of the app UI, language of the LLM tutor, language being studied) are three separate settings but surfaced as if they were one.

### Session domain reads vocabulary for LLM context injection
The session exchange service (`session-exchange.ts:1904-1918`) reads mastered vocabulary to inject into the Four Strands LLM prompt. This is a direct cross-domain data dependency: session domain reads language domain's `vocabulary` table. The `knownVocabulary` list (up to 60 terms) shapes which words the LLM introduces in conversation.

### Practice domain hosts vocabulary quiz alongside non-language quizzes
The Practice tab (`/(app)/practice`) shows vocabulary quiz cards alongside capitals, guess-who, and other general quizzes. The vocabulary cards are language-subject-specific but live in the same component tree as non-language practice activities. From the user's perspective, vocabulary practice is just one item on a menu of practice types — its connection to the session-extracted vocabulary bank is invisible.
