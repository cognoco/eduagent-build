# Epic 6: Language Learning — Design Spec

**Date:** 2026-04-04
**Status:** Draft
**FRs:** FR96–FR107, FR146
**Dependencies:** Epics 0–3 (learning infrastructure), Epic 8 (voice infrastructure — complete)

---

## 1. Core Concept

When a learner creates a language subject (e.g., "Spanish", "Learn French"), the system detects it's a language and switches from Socratic teaching to **Nation's Four Strands methodology** — a research-backed approach where session time splits roughly 25% across four activities:

| Strand | Purpose | Teaching style |
|--------|---------|---------------|
| **Meaning-Focused Input** | Read/listen to comprehensible passages at 95–98% known words | Immersive, minimal interruption |
| **Meaning-Focused Output** | Speak and write in the target language | Direct correction, not Socratic hints |
| **Language-Focused Learning** | Explicit grammar and vocabulary instruction | Direct teaching ("In Spanish, adjectives come after nouns") |
| **Fluency Development** | Timed drills for automatic retrieval | Speed-focused, scored |

**Key pedagogical shift:** No Socratic escalation for languages. The AI teaches directly, corrects directly, and explains grammar explicitly. This is the opposite of the default Socratic ladder used for math/science.

**Voice from day one:** Language learning requires speaking. The Epic 8 voice infrastructure (`expo-speech-recognition`, `expo-speech`) is already complete. All four strands use voice where appropriate — output practice is spoken, fluency drills support voice input, and input strand can use TTS for listening comprehension.

---

## 2. Learner Flow

### 2.1 Language Detection & Onboarding

**Detection — three-layer approach:**

1. **Keyword match:** ~200 known languages with aliases ("Spanish", "Español", "Castellano") checked against the raw subject input. Instant, no LLM cost.
2. **LLM confirmation:** The existing `classifySubject()` call adds one boolean field (`isLanguageLearning`) to its response schema. No extra API call.
3. **Learner confirmation card:** "Looks like you're learning Spanish! We'll use a language-focused approach with vocabulary tracking and speaking practice." One tap to confirm, one to override.

**Onboarding steps after confirmation:**

1. Ask native language → stored on `teachingPreferences` (new `nativeLanguage` field)
2. Ask current level (self-assessed): "Complete beginner" / "I know some basics" / "Conversational" / "Advanced"
3. Generate CEFR-aligned curriculum starting from the assessed level
4. Set `pedagogyMode = 'four_strands'` on the subject

### 2.2 Session Experience

A language session rotates through the four strands. The LLM manages the rotation within a session, spending roughly equal time on each. The system prompt dictates the current strand focus and the LLM transitions naturally between them.

**Input strand:** LLM generates a short passage using mostly known words + a few new ones. Learner reads (or listens via TTS). LLM asks comprehension questions. New vocabulary is highlighted and added to the vocabulary tracker.

**Output strand:** LLM prompts the learner to speak or write. Uses speech recognition for spoken input. Gives direct, specific corrections: "You said 'yo soy bueno' — the correct form is 'yo soy bien' because…" No Socratic hinting.

**Grammar strand:** Explicit instruction. LLM teaches a grammar point relevant to the current micro-milestone. Uses native language for explanations. Follows with practice exercises.

**Fluency strand:** Timed drills — translate phrases, fill blanks, rapid-fire vocabulary recall. Scored on speed and accuracy. Voice input supported for spoken drills.

### 2.3 CEFR Micro-Milestones (Progress System)

**Instead of FSI hour estimates (demotivating), progress is shown as small, achievable milestones.**

Each CEFR level (A1, A2, B1, B2, C1, C2) is divided into micro-milestones:

- **A1.1:** "Greetings & Introductions" — 50 words, 12 chunks, 3 grammar points
- **A1.2:** "Numbers, Days & Time" — 45 words, 8 chunks, 2 grammar points
- **A1.3:** "Ordering Food & Drinks" — 55 words, 15 chunks, 4 grammar points
- etc.

**What the learner sees:**
- Current milestone name and progress: "A1.3: Ordering Food — 38/55 words, 9/15 chunks"
- A small progress bar that's always close to filling
- Celebration on milestone completion (reuses Epic 13 celebration system)
- Next milestone preview: "Up next: A1.4 — Directions & Transport"
- Overall CEFR level badge: "Level A1" with visual progress toward A2

**What we do NOT show:** FSI hour estimates. Those stay as internal calibration data only (useful for analytics, not for the learner).

**Milestone generation:** The LLM generates micro-milestones during curriculum creation, following CEFR-aligned vocabulary and grammar expectations for the target language. Each milestone maps to a `curriculumTopic` with additional language metadata.

---

## 3. Data Model Changes

### 3.1 Subject: Add `pedagogyMode`

New enum on `subjects` table:

```
pedagogy_mode enum: 'socratic' (default) | 'four_strands'
```

- Set during language subject creation
- Read by `buildSystemPrompt()` to switch prompt assembly
- Orthogonal to existing `teaching_method` enum (which controls explanation style within any pedagogy)

### 3.2 Teaching Preferences: Add `nativeLanguage`

New nullable column on `teachingPreferences`:

```
nativeLanguage: text (nullable) — ISO 639-1 code (e.g., 'en', 'de', 'cs')
```

Used in grammar explanations: "In Spanish, unlike English, adjectives come after the noun."

### 3.3 New Table: `vocabulary`

Per-learner, per-subject vocabulary tracking:

```
vocabulary:
  id: uuid (PK)
  profileId: uuid (FK → profiles)
  subjectId: uuid (FK → subjects)
  term: text — the word or chunk in target language
  translation: text — meaning in native language
  type: vocab_type enum ('word' | 'chunk') — single word vs phrase/collocation
  cefrLevel: text — e.g., 'A1', 'A2' (which level this word belongs to)
  milestoneId: uuid (FK → curriculumTopics, nullable) — which micro-milestone introduced it
  mastered: boolean (default false)
  createdAt: timestamp
  updatedAt: timestamp

  constraint: unique(profileId, subjectId, term)
```

### 3.4 New Table: `vocabularyRetentionCards`

SM-2 spaced repetition per vocabulary item (reuses `packages/retention/` algorithm, separate table from topic-level `retentionCards`):

```
vocabularyRetentionCards:
  id: uuid (PK)
  profileId: uuid (FK → profiles)
  vocabularyId: uuid (FK → vocabulary)
  easeFactor: numeric(4,2) — default 2.5
  intervalDays: integer — default 0
  repetitions: integer — default 0
  lastReviewedAt: timestamp (nullable)
  nextReviewAt: timestamp (nullable)
  failureCount: integer — default 0
  consecutiveSuccesses: integer — default 0
  createdAt: timestamp
  updatedAt: timestamp
```

### 3.5 Curriculum Topics: Language Metadata

Micro-milestones are stored as `curriculumTopics` rows. Additional columns needed:

```
curriculumTopics (new nullable columns):
  cefrLevel: text — e.g., 'A1', 'A2', 'B1' (null for non-language topics)
  cefrSublevel: text — e.g., '1', '2', '3' (null for non-language topics)
  targetWordCount: integer — how many words in this milestone (null for non-language)
  targetChunkCount: integer — how many chunks in this milestone (null for non-language)
```

---

## 4. System Prompt Changes

### 4.1 Pedagogy Mode Fork in `buildSystemPrompt()`

New field on `ExchangeContext`:

```typescript
pedagogyMode?: 'socratic' | 'four_strands'
```

When `pedagogyMode === 'four_strands'`, `buildSystemPrompt()` replaces the Socratic escalation sections with Four Strands instructions:

- **Role:** "You are a language teacher, not a Socratic guide. Teach directly."
- **Error correction:** "Correct errors immediately and explicitly. Explain why using the learner's native language ({nativeLanguage})."
- **Strand rotation:** "Balance time across Input, Output, Grammar, and Fluency activities within each session."
- **Vocabulary extraction:** "When introducing new words or chunks, mark them clearly for the vocabulary tracker."
- **Comprehensible input:** "Generate passages using vocabulary the learner has already mastered, plus 2–5% new words."

The existing Socratic sections (escalation ladder, "Not Yet" framing, worked example levels) are skipped for `four_strands` mode.

### 4.2 Structured Output for Vocabulary Extraction

After each exchange in a language session, the LLM response includes a hidden structured block (similar to TEACH_BACK's `structured_assessment`):

```json
{
  "newVocabulary": [
    { "term": "buenos días", "translation": "good morning", "type": "chunk" },
    { "term": "comer", "translation": "to eat", "type": "word" }
  ],
  "strand": "input",
  "grammarPoint": "present tense regular -ar verbs"
}
```

Parsed in the exchange processing pipeline to update the vocabulary table.

---

## 5. Session Completion Pipeline Changes

### 5.1 New Step: `update-vocabulary-retention`

After existing Step 2 (`update-retention`), a new step processes vocabulary SM-2 updates:

1. Extract vocabulary items practiced during the session (from structured LLM output stored in `sessionEvents`)
2. For each vocabulary item, compute quality rating based on session performance
3. Run SM-2 algorithm via `packages/retention/`
4. Persist updated `vocabularyRetentionCards`
5. Mark items as `mastered` when `consecutiveSuccesses >= 3`

### 5.2 New Step: `check-milestone-completion`

After vocabulary update:

1. Count mastered vocabulary for current milestone
2. If `mastered words >= targetWordCount` and `mastered chunks >= targetChunkCount`:
   - Mark milestone (curriculumTopic) complete
   - Queue celebration (Comet for milestone, OrionsBelt for CEFR level completion)
   - Advance to next milestone

### 5.3 Coaching Card Adaptation

Coaching cards for language subjects show:
- Current milestone progress ("A1.3: 38/55 words")
- Vocabulary due for review today
- Suggested strand focus based on recent balance

---

## 6. Voice Integration

Uses existing Epic 8 infrastructure — no new voice plumbing needed.

### 6.1 Speaking Practice (Output Strand)

- `expo-speech-recognition` captures learner's speech in the target language
- STT language set to target language (not device language)
- LLM receives transcribed text and evaluates pronunciation/grammar
- Direct correction in response

### 6.2 Listening Comprehension (Input Strand)

- `expo-speech` (TTS) reads passages aloud in target language
- Learner listens, then answers comprehension questions (typed or spoken)
- TTS language/voice set to target language

### 6.3 Fluency Drills

- Voice input for rapid-fire responses
- Timer UI for speed scoring
- Both typed and spoken input accepted

### 6.4 STT Language Configuration

New field on language subject config: target language ISO code. Passed to `expo-speech-recognition` as the recognition language. This ensures STT processes the target language, not the device's default language.

---

## 7. Language List & FSI Data

### 7.1 Supported Languages (Launch)

Start with FSI Category I and II languages (most learners, fastest results):

**Category I (~600–750 hrs):** Spanish, French, Italian, Portuguese, Dutch, Norwegian, Swedish, Danish, Romanian
**Category II (~900 hrs):** German, Indonesian, Malay, Swahili

Post-launch expansion: Category III (Russian, Polish, Greek, Hindi, etc.), Category IV (Chinese, Japanese, Korean, Arabic).

### 7.2 Language Registry

Static data file (`apps/api/src/data/languages.ts`):

```typescript
{
  code: 'es',
  names: ['Spanish', 'Español', 'Castellano'],
  fsiCategory: 1,
  fsiHours: 600,
  cefrMilestones: { A1: 6, A2: 6, B1: 8, B2: 8, C1: 10, C2: 10 },
  sttLocale: 'es-ES',
  ttsVoice: 'es-ES'
}
```

Used for: keyword detection, STT/TTS config, milestone generation, internal analytics.

### 7.3 FSI Hours — Internal Only

FSI data drives internal calibration (milestone pacing, analytics). Never shown to the learner as a raw number. The learner only sees CEFR micro-milestones.

---

## 8. Stories (Revised from Placeholder)

### Story 6.1: Language Detection & Onboarding
**FRs:** FR96, FR97
- Keyword match + LLM boolean on subject classification
- Confirmation card UI
- Native language selection
- Self-assessed level picker
- `pedagogyMode` column and enum on subjects
- `nativeLanguage` column on teachingPreferences

### Story 6.2: Four Strands Prompt Assembly & Direct Instruction
**FRs:** FR99, FR100, FR107
- `buildSystemPrompt()` fork for `four_strands` mode
- Four Strands prompt templates (one per strand)
- Direct error correction prompts
- Structured vocabulary extraction output format
- Vocabulary parsing in exchange pipeline

### Story 6.3: Vocabulary & Chunk Tracking with SM-2
**FRs:** FR101, FR102, FR105
- `vocabulary` table and CRUD service
- `vocabularyRetentionCards` table and SM-2 integration
- Vocabulary extraction from session exchanges
- Comprehensible input generation (95–98% known words)
- Chunk/collocation tracking alongside individual words

### Story 6.4: CEFR Micro-Milestones & Progress UI
**FRs:** FR98, FR103, FR106
- `cefrLevel`, `cefrSublevel`, `targetWordCount`, `targetChunkCount` on curriculumTopics
- Milestone generation during curriculum creation
- Progress API: words mastered / target, chunks mastered / target, current CEFR level
- Milestone completion detection in session-completed pipeline
- Celebration queueing on milestone/level completion
- Progress UI on mobile: milestone card, CEFR badge, next milestone preview
- Language registry with FSI data (internal calibration only)

### Story 6.5: Fluency Drills
**FRs:** FR104
- Timed drill UI component (timer, score, streak)
- Voice input for spoken drills
- Speed + accuracy scoring
- Drill types: translation, fill-blank, rapid vocabulary recall
- Difficulty progression within fluency strand

### Story 6.6: Voice Integration for Language Sessions
**FRs:** FR146
- STT language configuration per language subject
- TTS for listening comprehension (input strand)
- Voice input for output strand (speaking practice)
- Voice input for fluency drills
- Pronunciation feedback via LLM (transcribed speech → correction)

---

## 9. Out of Scope

- **RTL languages** (Arabic, Hebrew) — deferred, needs layout work
- **Category III/IV languages** (Chinese, Japanese, Korean, Arabic, Russian) — post-launch expansion, may need character input support
- **Handwriting recognition** — not needed for Category I/II Latin-script languages
- **Curated vocabulary lists** — LLM generates vocabulary within CEFR constraints; no manually curated lists at launch
- **Language placement test** — self-assessment at onboarding is sufficient for v1; formal placement test is a future enhancement
- **UI translations for language learning screens** — screens are in English (or current UI language); only the learning content is in the target language
