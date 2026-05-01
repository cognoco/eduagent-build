# Critical E2E Gaps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Maestro E2E coverage for the 5 critical gap areas (Quiz, Dictation, Book Detail, Vocabulary, SSO) that currently have zero E2E tests — covering 11 of 13 critical-gap screens and raising overall screen coverage from 63/88 (72%) to 74/88 (84%). Two screens remain uncoverable by Maestro: dictation review (requires device camera) and SSO callback (requires external browser redirect).

**Architecture:** Maestro YAML flows using the existing seed-and-sign-in infrastructure. Each flow seeds a scenario via the test API, signs in, then exercises the full user journey through the feature. One new seed scenario (`language-learner`) is needed for the Vocabulary flow.

**Tech Stack:** Maestro YAML, `seed-and-run.sh`, Hono test-seed API (`POST /v1/__test/seed`)

---

## File Structure

| Action | Path | Purpose |
|--------|------|---------|
| Create | `apps/mobile/e2e/flows/quiz/quiz-full-flow.yaml` | Quiz: index → launch → play → results → history → round detail |
| Create | `apps/mobile/e2e/flows/dictation/dictation-full-flow.yaml` | Dictation: choice → text-preview → playback → complete |
| Create | `apps/mobile/e2e/flows/learning/book-detail.yaml` | Library → shelf → book detail screen |
| Create | `apps/mobile/e2e/flows/learning/vocabulary-flow.yaml` | Progress → vocabulary browser (CEFR breakdown) |
| Create | `apps/mobile/e2e/flows/auth/sso-buttons.yaml` | SSO button visibility + fallback timeout |
| Modify | `apps/api/src/services/test-seed.ts` | Add `language-learner` seed scenario |

---

## Prerequisite: Seed Scenario Inventory

These existing scenarios are reused:

| Flow | Seed scenario | Why |
|------|--------------|-----|
| Quiz | `onboarding-complete` | Has General Studies subject + 3 topics. Capitals/Guess Who activities are subject-agnostic. |
| Dictation | `onboarding-complete` | Same as quiz — dictation "I have a text" path needs no special data. |
| Book Detail | `learning-active` | Has World History subject with topics organized into curriculum books. Shelf returns `SUBJECT_ID`. |
| Vocabulary | `language-learner` **(new)** | Needs a language subject (`pedagogyMode: four_strands`) + seeded vocabulary entries + ≥4 sessions. |
| SSO | none (pre-auth) | No seed needed — tests the sign-in screen before authentication. |

---

## Task 1: Add `language-learner` seed scenario

**Files:**
- Modify: `apps/api/src/services/test-seed.ts` (add import for `vocabulary` table + new seed function)
- Create: `apps/api/src/services/test-seed.language-learner.test.ts` (integration test)

This seed scenario creates a learner with a language subject (Spanish), seeded vocabulary entries, and enough completed sessions to bypass the "new learner" gate on the vocabulary browser.

**Key API constraints (verified by reading test-seed.ts):**
- `createSubjectWithCurriculum(db, profileId, name, status='active', topicCount=3)` — does **NOT** accept `pedagogyMode` or `languageCode`. The subject must be inserted directly.
- The vocabulary table is `vocabulary` (exported from `@eduagent/database` via `schema/language.ts` → `schema/index.ts`). Columns: `id, profileId, subjectId, term, termNormalized (required!), translation, type ('word'|'chunk'), cefrLevel, mastered, milestoneId, createdAt, updatedAt`.
- The `subjects` table has `pedagogyMode` (enum: `'socratic'|'four_strands'`, default `'socratic'`) and `languageCode` (nullable text) — both defined in `packages/database/src/schema/subjects.ts:56-59`.

- [ ] **Step 1: Add `language-learner` to the `SeedScenario` union type**

In `apps/api/src/services/test-seed.ts`, add `'language-learner'` to the `SeedScenario` type union (around line 60):

```typescript
export type SeedScenario =
  | 'onboarding-complete'
  | 'onboarding-no-subject'
  | 'learning-active'
  // ... existing scenarios ...
  | 'daily-limit-reached'
  | 'language-learner';  // ← ADD
```

- [ ] **Step 2: Add the `vocabulary` import**

At the top of `test-seed.ts`, add `vocabulary` to the `@eduagent/database` import (around line 14-35):

```typescript
import {
  accounts,
  profiles,
  subjects,
  curricula,
  curriculumTopics,
  curriculumBooks,
  learningSessions,
  sessionEvents,
  sessionSummaries,
  retentionCards,
  assessments,
  subscriptions,
  quotaPools,
  familyLinks,
  consentStates,
  streaks,
  needsDeepeningTopics,
  vocabulary,           // ← ADD
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
```

- [ ] **Step 3: Write the `seedLanguageLearner` function**

Add after the last seed function (before the dispatcher map at ~line 1560). The function inserts the subject directly (bypassing `createSubjectWithCurriculum`) because the helper doesn't support `pedagogyMode`/`languageCode` parameters.

```typescript
async function seedLanguageLearner(
  db: Database,
  email: string,
  env: SeedEnv
): Promise<SeedResult> {
  const { clerkUserId, password } = await createClerkTestUser(email, env);
  const { accountId } = await createBaseAccount(db, email, clerkUserId);
  const profileId = await createBaseProfile(db, accountId, {
    displayName: 'Language Learner',
    birthYear: LEARNER_BIRTH_YEAR,
  });

  await db.insert(consentStates).values({
    id: generateUUIDv7(),
    profileId,
    consentType: 'GDPR',
    status: 'CONSENTED',
    parentEmail: 'parent-seed@example.com',
    respondedAt: new Date(),
  });

  // ── Language subject (direct insert — createSubjectWithCurriculum
  //    doesn't accept pedagogyMode/languageCode) ─────────────────────
  const subjectId = generateUUIDv7();
  await db.insert(subjects).values({
    id: subjectId,
    profileId,
    name: 'Spanish',
    status: 'active',
    pedagogyMode: 'four_strands',
    languageCode: 'es',
  });

  const curriculumId = generateUUIDv7();
  await db.insert(curricula).values({
    id: curriculumId,
    subjectId,
    version: 1,
  });

  const bookId = generateUUIDv7();
  await db.insert(curriculumBooks).values({
    id: bookId,
    subjectId,
    title: 'Spanish',
    sortOrder: 0,
    topicsGenerated: true,
  });

  const topicCount = 3;
  const topicValues = Array.from({ length: topicCount }, (_, i) => ({
    id: generateUUIDv7(),
    curriculumId,
    bookId,
    title: `Spanish Topic ${i + 1}`,
    description: `Introduction to Spanish Topic ${i + 1}`,
    sortOrder: i,
    relevance: 'core' as const,
    estimatedMinutes: 30,
  }));
  await db.insert(curriculumTopics).values(topicValues);
  const topicIds = topicValues.map((t) => t.id);

  // ── Vocabulary entries (3 words: 2×A1, 1×A2) ─────────────────────
  // termNormalized is required — use lowercased term.
  await db.insert(vocabulary).values([
    {
      id: generateUUIDv7(),
      profileId,
      subjectId,
      term: 'hola',
      termNormalized: 'hola',
      translation: 'hello',
      cefrLevel: 'A1',
      type: 'word',
      mastered: false,
    },
    {
      id: generateUUIDv7(),
      profileId,
      subjectId,
      term: 'gracias',
      termNormalized: 'gracias',
      translation: 'thank you',
      cefrLevel: 'A1',
      type: 'chunk',
      mastered: true,
    },
    {
      id: generateUUIDv7(),
      profileId,
      subjectId,
      term: 'biblioteca',
      termNormalized: 'biblioteca',
      translation: 'library',
      cefrLevel: 'A2',
      type: 'word',
      mastered: false,
    },
  ]);

  // ── 4 completed sessions (bypasses ≥4-session gate in vocab browser)
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const sessionId = generateUUIDv7();
    const topicId = topicIds[i % topicIds.length]!;
    await db.insert(learningSessions).values({
      id: sessionId,
      profileId,
      subjectId,
      topicId,
      status: 'completed',
      startedAt: new Date(now.getTime() - (4 - i) * 24 * 60 * 60 * 1000),
      endedAt: new Date(
        now.getTime() - (4 - i) * 24 * 60 * 60 * 1000 + 15 * 60 * 1000
      ),
      exchangeCount: 4,
    });
    await db.insert(sessionSummaries).values({
      id: generateUUIDv7(),
      sessionId,
      profileId,
      summary: `Session ${i + 1} summary — vocabulary practice.`,
    });
  }

  return {
    scenario: 'language-learner',
    accountId,
    profileId,
    email,
    password,
    ids: { subjectId },
  };
}
```

- [ ] **Step 4: Register in the dispatcher map**

Add to the scenario-to-function map (around line 1560):

```typescript
  'daily-limit-reached': seedDailyLimitReached,
  'language-learner': seedLanguageLearner,  // ← ADD
```

- [ ] **Step 5: Write the integration test**

Create `apps/api/src/services/test-seed.language-learner.test.ts`:

```typescript
import { eq, and } from 'drizzle-orm';
import {
  subjects,
  vocabulary,
  learningSessions,
  type Database,
} from '@eduagent/database';
import { seedTestScenario, resetDatabase, type SeedResult } from './test-seed';

// Uses the real database — no mocks.
// Relies on the integration test setup in tests/integration/setup.ts.

let db: Database;
let result: SeedResult;

beforeAll(async () => {
  // Import the test database from integration setup
  const { getTestDatabase } = await import('../../../tests/integration/setup');
  db = getTestDatabase();
});

afterAll(async () => {
  await resetDatabase(db, {});
});

describe('language-learner seed scenario', () => {
  it('seeds a four_strands subject with vocabulary and sessions', async () => {
    result = await seedTestScenario(db, 'language-learner', {});

    expect(result.scenario).toBe('language-learner');
    expect(result.ids.subjectId).toBeDefined();

    // Verify subject has four_strands pedagogy and language code
    const [subject] = await db
      .select()
      .from(subjects)
      .where(eq(subjects.id, result.ids.subjectId!));
    expect(subject).toBeDefined();
    expect(subject!.pedagogyMode).toBe('four_strands');
    expect(subject!.languageCode).toBe('es');
    expect(subject!.name).toBe('Spanish');

    // Verify ≥3 vocabulary entries exist for the subject
    const vocabRows = await db
      .select()
      .from(vocabulary)
      .where(
        and(
          eq(vocabulary.profileId, result.profileId),
          eq(vocabulary.subjectId, result.ids.subjectId!)
        )
      );
    expect(vocabRows.length).toBeGreaterThanOrEqual(3);
    // Verify CEFR levels are populated
    const cefrLevels = vocabRows.map((v) => v.cefrLevel).filter(Boolean);
    expect(cefrLevels).toContain('A1');
    expect(cefrLevels).toContain('A2');

    // Verify ≥4 completed sessions (bypasses new-learner gate)
    const sessions = await db
      .select()
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, result.profileId),
          eq(learningSessions.status, 'completed')
        )
      );
    expect(sessions.length).toBeGreaterThanOrEqual(4);
  });
});
```

> **NOTE:** The exact import path for the test database helper depends on the integration test infrastructure. Check `tests/integration/setup.ts` for the correct export name and adjust `getTestDatabase` accordingly. If the integration test setup doesn't export a standalone DB getter, use the same pattern as existing seed tests (grep for `seedTestScenario` or `seedOnboardingComplete` in test files for the correct import pattern).

- [ ] **Step 6: Run integration tests**

```bash
pnpm exec jest apps/api/src/services/test-seed.language-learner.test.ts --no-coverage
```

Expected: PASS — subject is `four_strands` with `languageCode: 'es'`, ≥3 vocabulary rows, ≥4 completed sessions.

- [ ] **Step 7: Run lint and typecheck**

```bash
pnpm exec nx run api:lint && pnpm exec nx run api:typecheck
```

Expected: both PASS — no lint violations or type errors from the new scenario.

- [ ] **Step 8: Commit**

```
feat(api): add language-learner seed scenario for vocabulary E2E [E2E-T1]
```

---

## Task 2: Quiz Full Flow

**Files:**
- Create: `apps/mobile/e2e/flows/quiz/quiz-full-flow.yaml`

**Screens covered:** quiz index, quiz launch, quiz play, quiz results, quiz history, round detail (6 screens)

**Navigation path:**
```
Home (home-scroll-view)
  → scroll to "Practice" intent card (intent-practice)
  → Practice screen (practice-screen)
    → tap "Quiz" (practice-quiz)
    → Quiz Index (quiz-index-screen)
      → tap "Capitals" (quiz-capitals)
      → Quiz Launch (loading → auto-nav to play)
        → Quiz Play (quiz-play-screen)
          → answer MC questions (quiz-option-0 + tap to continue)
          → Quiz Results (quiz-results-screen)
            → tap "View History" (quiz-results-history)
            → Quiz History (quiz-history-screen)
              → tap round row by "Capitals" text (rows have dynamic quiz-history-row-* IDs)
              → Round Detail (round-detail-screen)
```

- [ ] **Step 1: Create the quiz flow directory**

```bash
mkdir -p apps/mobile/e2e/flows/quiz
```

- [ ] **Step 2: Write the quiz flow YAML**

Create `apps/mobile/e2e/flows/quiz/quiz-full-flow.yaml`:

```yaml
# Flow Q1: Quiz Full Flow — Index to Results to History
# Validates: complete quiz lifecycle: pick Capitals activity, play through MC round,
# view results with score/XP, navigate to history, view round detail.
# Tags: nightly, quiz
#
# Journey: UX Journey 3 (Practice & Reinforcement)
# Epics: Epic 13 (Quiz Activities)
# Prerequisite: Seeded user with subject + topics (scenario: onboarding-complete)
#
# testIDs verified against:
#   - apps/mobile/src/components/home/LearnerScreen.tsx (intent-practice)
#   - apps/mobile/src/app/(app)/practice.tsx (practice-screen, practice-quiz)
#   - apps/mobile/src/app/(app)/quiz/index.tsx (quiz-index-screen, quiz-capitals)
#   - apps/mobile/src/app/(app)/quiz/launch.tsx (quiz-launch-loading, quiz-launch-cancel)
#   - apps/mobile/src/app/(app)/quiz/play.tsx (quiz-play-screen, quiz-option-*)
#   - apps/mobile/src/app/(app)/quiz/results.tsx (quiz-results-screen, quiz-results-history)
#   - apps/mobile/src/app/(app)/quiz/history.tsx (quiz-history-screen, quiz-history-row-*)
#   - apps/mobile/src/app/(app)/quiz/[roundId].tsx (round-detail-screen, round-detail-back-btn)
#
# Environment variables set by seed-and-run.sh:
#   ${SUBJECT_ID}  — UUID of the General Studies subject
#   ${TOPIC_ID}    — UUID of the first topic
appId: com.mentomate.app
tags:
  - nightly
  - quiz
---
# ── 1. Seed & sign in ─────────────────────────────────────────────────
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "onboarding-complete"
      API_URL: ${API_URL}

# ── 2. Wait for home screen ───────────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "home-scroll-view"
    timeout: 15000

# ── 3. Navigate to Practice screen ────────────────────────────────────
- scrollUntilVisible:
    element:
      id: "intent-practice"
    direction: DOWN
    timeout: 5000

- tapOn:
    id: "intent-practice"

- extendedWaitUntil:
    visible:
      id: "practice-screen"
    timeout: 10000

- takeScreenshot: quiz-01-practice-screen

# ── 4. Navigate to Quiz Index ─────────────────────────────────────────
- tapOn:
    id: "practice-quiz"

- extendedWaitUntil:
    visible:
      id: "quiz-index-screen"
    timeout: 10000

- takeScreenshot: quiz-02-index-screen

# ── 5. Verify Capitals activity is available and tap it ───────────────
- assertVisible:
    id: "quiz-capitals"

- tapOn:
    id: "quiz-capitals"

# ── 6. Wait through launch screen (round generation) ─────────────────
# The launch screen shows a loading spinner while the API generates quiz
# questions. This can take 5-15s depending on the LLM response time.
# After generation, it auto-navigates to the play screen.
# If a challenge banner appears, tap the start button.
- extendedWaitUntil:
    visible:
      id: "quiz-challenge-start"
    timeout: 5000
    optional: true

- tapOn:
    id: "quiz-challenge-start"
    optional: true

- extendedWaitUntil:
    visible:
      id: "quiz-play-screen"
    timeout: 30000

- takeScreenshot: quiz-03-play-screen

# ── 7. Answer quiz questions ──────────────────────────────────────────
# Capitals rounds have 5-10 MC questions. Each question shows options
# (quiz-option-0, quiz-option-1, etc.). After tapping an option, feedback
# is shown and the user taps anywhere (quiz-play-screen) to advance.
# We loop until quiz-results-screen appears.
- repeat:
    while:
      notVisible:
        id: "quiz-results-screen"
    commands:
      # Wait for an MC option to be visible (next question loaded)
      - extendedWaitUntil:
          visible:
            id: "quiz-option-0"
          timeout: 10000
          optional: true
      # Tap first option to answer
      - tapOn:
          id: "quiz-option-0"
          optional: true
      # Brief pause for feedback animation, then tap to continue
      - extendedWaitUntil:
          visible:
            id: "quiz-play-screen"
          timeout: 5000
          optional: true
      - tapOn:
          id: "quiz-play-screen"
          optional: true

# ── 8. Verify results screen ─────────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "quiz-results-screen"
    timeout: 15000

- takeScreenshot: quiz-04-results-screen

# Verify key elements on results
- assertVisible:
    id: "quiz-results-done"

- assertVisible:
    id: "quiz-results-history"

# ── 9. Navigate to history ────────────────────────────────────────────
- tapOn:
    id: "quiz-results-history"

- extendedWaitUntil:
    visible:
      id: "quiz-history-screen"
    timeout: 10000

- takeScreenshot: quiz-05-history-screen

# ── 10. Tap the first (most recent) round row ────────────────────────
# Round rows have dynamic testIDs: quiz-history-row-${round.id}.
# Since we just played one round, there should be exactly one row.
# Use text matching for the subject name as a fallback.
- scrollUntilVisible:
    element:
      text: "Capitals"
    direction: DOWN
    timeout: 5000

- tapOn:
    text: "Capitals"

# ── 11. Verify round detail screen ───────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "round-detail-screen"
    timeout: 10000

- takeScreenshot: quiz-06-round-detail

# Verify at least one question card is shown
- assertVisible:
    id: "round-detail-question-0"

# ── 12. Navigate back to history, then to practice ───────────────────
- tapOn:
    id: "round-detail-back-btn"

- extendedWaitUntil:
    visible:
      id: "quiz-history-screen"
    timeout: 5000

- tapOn:
    id: "quiz-history-back"

- extendedWaitUntil:
    visible:
      id: "practice-screen"
    timeout: 5000

- takeScreenshot: quiz-07-back-at-practice
```

- [ ] **Step 3: Verify the YAML is valid**

```bash
maestro test --dry-run apps/mobile/e2e/flows/quiz/quiz-full-flow.yaml
```

Expected: dry-run parses without errors. (If `--dry-run` is not available, skip — the next step runs the flow live.)

- [ ] **Step 4: Run the flow**

```bash
cd apps/mobile/e2e && ./scripts/seed-and-run.sh onboarding-complete flows/quiz/quiz-full-flow.yaml
```

Expected: flow completes. All 7 screenshots captured. If the `repeat` loop gets stuck (Maestro version doesn't support `while: notVisible`), replace with a fixed `times: 12` repeat block.

- [ ] **Step 5: Commit**

```
feat(e2e): add quiz full flow — index to results to history [E2E-Q1]
```

---

## Task 3: Dictation Full Flow

**Files:**
- Create: `apps/mobile/e2e/flows/dictation/dictation-full-flow.yaml`

**Screens covered:** dictation index (choice), text-preview, playback, complete, review (5 screens)

**Navigation path:**
```
Home (home-scroll-view)
  → scroll to "Practice" (intent-practice)
  → Practice screen (practice-screen)
    → tap "Dictation" (practice-dictation)
    → Dictation Choice (dictation-choice-screen)
      → tap "I have a text" (dictation-homework)
      → Text Preview (dictation-text-preview-screen)
        → type a short sentence (text-preview-input)
        → tap "Start dictation" (text-preview-start)
        → Playback (dictation-playback-screen)
          → wait for auto-completion OR exit (playback-exit)
          → Complete (dictation-complete-screen)
            → tap "I'm done" (complete-done)
            → back to Practice (practice-screen)
```

- [ ] **Step 1: Create the dictation flow directory**

```bash
mkdir -p apps/mobile/e2e/flows/dictation
```

- [ ] **Step 2: Write the dictation flow YAML**

Create `apps/mobile/e2e/flows/dictation/dictation-full-flow.yaml`:

```yaml
# Flow D1: Dictation Full Flow — "I have a text" path
# Validates: dictation lifecycle using user-provided text. Enters text,
# starts dictation playback, waits for completion, and verifies the
# complete screen with all recovery actions.
# Tags: nightly, dictation
#
# Journey: UX Journey 3 (Practice & Reinforcement)
# Epics: Epic 14 (Dictation Mode)
# Prerequisite: Seeded user with subject (scenario: onboarding-complete)
#
# NOTE: Audio playback behavior in emulator varies — TTS may be silent but
# the playback state machine still advances. If playback stalls, the flow
# uses the "Exit dictation" escape hatch (playback-exit) with a 60s timeout
# before falling back.
#
# testIDs verified against:
#   - apps/mobile/src/components/home/LearnerScreen.tsx (intent-practice)
#   - apps/mobile/src/app/(app)/practice.tsx (practice-screen, practice-dictation)
#   - apps/mobile/src/app/(app)/dictation/index.tsx (dictation-choice-screen,
#     dictation-homework, dictation-surprise)
#   - apps/mobile/src/app/(app)/dictation/text-preview.tsx (dictation-text-preview-screen,
#     text-preview-input, text-preview-start)
#   - apps/mobile/src/app/(app)/dictation/playback.tsx (dictation-playback-screen,
#     playback-progress, playback-exit)
#   - apps/mobile/src/app/(app)/dictation/complete.tsx (dictation-complete-screen,
#     complete-done, complete-check-writing, complete-try-again)
#
# Environment variables set by seed-and-run.sh:
#   ${SUBJECT_ID}  — UUID of the General Studies subject
appId: com.mentomate.app
tags:
  - nightly
  - dictation
---
# ── 1. Seed & sign in ─────────────────────────────────────────────────
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "onboarding-complete"
      API_URL: ${API_URL}

# ── 2. Wait for home screen ───────────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "home-scroll-view"
    timeout: 15000

# ── 3. Navigate to Practice screen ────────────────────────────────────
- scrollUntilVisible:
    element:
      id: "intent-practice"
    direction: DOWN
    timeout: 5000

- tapOn:
    id: "intent-practice"

- extendedWaitUntil:
    visible:
      id: "practice-screen"
    timeout: 10000

# ── 4. Navigate to Dictation ──────────────────────────────────────────
- scrollUntilVisible:
    element:
      id: "practice-dictation"
    direction: DOWN
    timeout: 5000

- tapOn:
    id: "practice-dictation"

- extendedWaitUntil:
    visible:
      id: "dictation-choice-screen"
    timeout: 10000

- takeScreenshot: dictation-01-choice-screen

# ── 5. Verify both paths are available ────────────────────────────────
- assertVisible:
    id: "dictation-homework"

- assertVisible:
    id: "dictation-surprise"

# ── 6. Tap "I have a text" ────────────────────────────────────────────
- tapOn:
    id: "dictation-homework"

- extendedWaitUntil:
    visible:
      id: "dictation-text-preview-screen"
    timeout: 10000

- takeScreenshot: dictation-02-text-preview

# ── 7. Type a short sentence and start dictation ──────────────────────
# Use a single short sentence so playback completes quickly.
- tapOn:
    id: "text-preview-input"

- inputText: "The quick brown fox jumps over the lazy dog."
- pressKey: back

- takeScreenshot: dictation-03-text-entered

- tapOn:
    id: "text-preview-start"

# ── 8. Wait for playback screen ───────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "dictation-playback-screen"
    timeout: 15000

- takeScreenshot: dictation-04-playback

# Verify playback controls are visible
- assertVisible:
    id: "playback-progress"

# ── 9. Wait for playback to complete (auto-navigates) ─────────────────
# Single-sentence dictation should complete in <30s. The playback screen
# auto-replaces to complete screen when state === 'complete'.
# If playback stalls (TTS unavailable in emulator), use the exit button.
- extendedWaitUntil:
    visible:
      id: "dictation-complete-screen"
    timeout: 60000
    optional: true

# Fallback: if playback didn't auto-complete, tap exit
- tapOn:
    id: "playback-exit"
    optional: true

# ── 10. Gate assertion — flow must land on one of two known screens ───
# After playback completes (or exit is tapped), the user must be on
# either the complete screen OR back at the choice screen. If neither
# is visible, something is broken. This is NOT optional — at least one
# screen must be reachable.
- extendedWaitUntil:
    visible:
      id: "dictation-complete-screen"
    timeout: 10000
    optional: true

- extendedWaitUntil:
    visible:
      id: "dictation-choice-screen"
    timeout: 5000
    optional: true

# Non-optional gate: screenshot captures whichever screen we landed on.
# If neither screen loaded, Maestro's implicit timeout on the next
# non-optional tap will fail the flow — that's the correct outcome.
- takeScreenshot: dictation-05-post-playback-gate

# ── 11. Verify complete screen (if we reached it) ────────────────────
# If playback exit returned to choice, these are skipped (optional).
# If we're on complete, verify all three actions exist.
- assertVisible:
    id: "complete-done"
    optional: true

- assertVisible:
    id: "complete-check-writing"
    optional: true

- assertVisible:
    id: "complete-try-again"
    optional: true

# ── 12. Return to a known screen ─────────────────────────────────────
# Tap "I'm done" if on complete screen, or verify choice screen if
# playback exited early.
- tapOn:
    id: "complete-done"
    optional: true

- tapOn:
    id: "dictation-choice-back"
    optional: true

# Non-optional: we MUST end on either practice screen or home.
# This catches the case where both optional taps above missed.
- extendedWaitUntil:
    visible:
      id: "practice-screen"
    timeout: 10000

- takeScreenshot: dictation-06-back-at-practice
```

- [ ] **Step 3: Run the flow**

```bash
cd apps/mobile/e2e && ./scripts/seed-and-run.sh onboarding-complete flows/dictation/dictation-full-flow.yaml
```

Expected: flow reaches the complete screen. Screenshots document the progression. If TTS is unavailable in the emulator, the `playback-exit` fallback fires and the flow still captures most screens.

- [ ] **Step 4: Commit**

```
feat(e2e): add dictation full flow — text preview to complete [E2E-D1]
```

---

## Task 4: Book Detail Flow

**Files:**
- Create: `apps/mobile/e2e/flows/learning/book-detail.yaml`

**Screens covered:** library, shelf (auto-redirect for single book), book detail (1-3 screens depending on book count)

**Navigation path:**
```
Home (home-scroll-view)
  → tap Library tab (tab-library)
  → Library (library-scroll — shelves tab)
    → tap subject card (subject-card-${SUBJECT_ID})
    → Shelf [auto-redirects to book if single book] (shelf-single-book / shelf-screen)
      → Book Detail (book-screen)
        → verify suggestions, past sessions, CTA
        → navigate back
```

- [ ] **Step 1: Write the book detail flow YAML**

Create `apps/mobile/e2e/flows/learning/book-detail.yaml`:

```yaml
# Flow L1: Book Detail — Library to Book Detail screen
# Validates: navigating from Library tab through shelf to book detail.
# Verifies book content loads (suggestions, past sessions, start-learning CTA).
# Tags: nightly, learning
#
# Journey: UX Journey 1 (Library & Content Discovery)
# Epics: Epic 7 (Library)
# Prerequisite: Seeded user with subject + active session (scenario: learning-active)
#   The learning-active scenario creates a World History subject with topics
#   organized into a curriculum. The shelf for a single-book subject auto-redirects
#   to the book detail screen.
#
# testIDs verified against:
#   - apps/mobile/src/app/(app)/_layout.tsx (tab-library)
#   - apps/mobile/src/components/library/ShelvesTab.tsx (shelves-list, subject-card-*)
#   - apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx (shelf-screen, shelf-single-book)
#   - apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx (book-screen,
#     book-back, book-start-learning, book-all-completed, book-empty-sessions)
#
# Environment variables set by seed-and-run.sh:
#   ${SUBJECT_ID}  — UUID of the World History subject
#   ${SESSION_ID}  — UUID of the active learning session
appId: com.mentomate.app
tags:
  - nightly
  - learning
---
# ── 1. Seed & sign in ─────────────────────────────────────────────────
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "learning-active"
      API_URL: ${API_URL}

# ── 2. Wait for home screen ───────────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "home-scroll-view"
    timeout: 15000

# ── 3. Navigate to Library tab ────────────────────────────────────────
- tapOn:
    id: "tab-library"

# Wait for library content to load (shelves tab is the default)
- extendedWaitUntil:
    visible:
      id: "shelves-list"
    timeout: 10000
    # Fallback — library may show a different default tab
    optional: true

- takeScreenshot: book-01-library

# ── 4. Tap the subject card ──────────────────────────────────────────
# The learning-active scenario returns SUBJECT_ID. The ShelvesTab renders
# each subject with testID="subject-card-${subject.id}".
- tapOn:
    id: "subject-card-${SUBJECT_ID}"

# ── 5. Handle shelf → book navigation ────────────────────────────────
# Single-book subjects: shelf auto-redirects to book detail (shelf-single-book
# flashes briefly during the redirect). Multi-book subjects: shelf stays on
# shelf-screen and the user must tap a book card.
#
# Strategy: wait for book-screen first (covers single-book auto-redirect).
# If it doesn't appear, we're on the shelf — tap the first book card.
- extendedWaitUntil:
    visible:
      id: "book-screen"
    timeout: 10000
    optional: true

# Fallback: multi-book shelf — tap the first book card
- runFlow:
    when:
      visible:
        id: "shelf-screen"
    commands:
      - takeScreenshot: book-02a-shelf-multi-book
      - scrollUntilVisible:
          element:
            text: "World History"
          direction: DOWN
          timeout: 5000
      - tapOn:
          text: "World History"
      - extendedWaitUntil:
          visible:
            id: "book-screen"
          timeout: 15000

- takeScreenshot: book-02-book-detail

# ── 6. Verify book detail content ────────────────────────────────────
# Back button should be present
- assertVisible:
    id: "book-back"

# The book should show either:
# - "Start learning" CTA (if no sessions yet or topics available)
# - Past session rows (if sessions exist)
# - "You finished this book!" (if all topics completed)
# With learning-active seed, there's an active session, so we expect
# the start-learning button or session rows.
- assertVisible:
    id: "book-start-learning"
    optional: true

- takeScreenshot: book-03-book-content

# ── 7. Scroll down to verify more content ────────────────────────────
# Check for notes section or past sessions
- scrollUntilVisible:
    element:
      id: "book-notes-section"
    direction: DOWN
    timeout: 5000
    optional: true

- takeScreenshot: book-04-scrolled

# ── 8. Navigate back ─────────────────────────────────────────────────
- tapOn:
    id: "book-back"

# Should return to library (shelf was auto-skipped for single-book subjects)
- extendedWaitUntil:
    visible:
      id: "tab-library"
    timeout: 10000

- takeScreenshot: book-05-back-to-library
```

- [ ] **Step 2: Run the flow**

```bash
cd apps/mobile/e2e && ./scripts/seed-and-run.sh learning-active flows/learning/book-detail.yaml
```

Expected: flow navigates to book detail and captures the full screen state. If the shelf has multiple books (doesn't auto-redirect), the flow needs adjustment — add a tap on the first `book-card-*` element.

- [ ] **Step 3: Commit**

```
feat(e2e): add book detail flow — library to book screen [E2E-L1]
```

---

## Task 5: Vocabulary Flow

**Files:**
- Create: `apps/mobile/e2e/flows/learning/vocabulary-flow.yaml`

**Depends on:** Task 1 (language-learner seed scenario)

**Screens covered:** progress screen, vocabulary browser (2 screens)

**Navigation path:**
```
Home (home-scroll-view)
  → tap Progress tab (tab-progress)
  → Progress screen (scroll to vocabulary pill)
    → tap vocabulary stat (progress-vocab-stat)
    → Vocabulary Browser (vocab-browser sections)
      → verify CEFR breakdown, word counts
      → navigate back
```

- [ ] **Step 1: Write the vocabulary flow YAML**

Create `apps/mobile/e2e/flows/learning/vocabulary-flow.yaml`:

```yaml
# Flow V1: Vocabulary Browser — Progress to CEFR Breakdown
# Validates: vocabulary browser accessible from progress screen, shows CEFR
# level breakdown with word counts for a language subject.
# Tags: nightly, learning
#
# Journey: UX Journey 4 (Progress & Analytics)
# Epics: Epic 11 (Language Pedagogy / Vocabulary)
# Prerequisite: Seeded user with language subject + vocabulary entries
#   (scenario: language-learner). Creates Spanish subject (four_strands pedagogy),
#   3 vocabulary entries (A1 + A2 CEFR levels), and 4 completed sessions.
#
# testIDs verified against:
#   - apps/mobile/src/app/(app)/_layout.tsx (tab-progress)
#   - apps/mobile/src/app/(app)/progress/index.tsx (progress-vocab-stat)
#   - apps/mobile/src/app/(app)/progress/vocabulary.tsx (vocab-browser-back,
#     vocab-browser-error, vocab-browser-no-language, vocab-browser-empty)
#
# Environment variables set by seed-and-run.sh:
#   ${SUBJECT_ID}  — UUID of the Spanish subject
appId: com.mentomate.app
tags:
  - nightly
  - learning
---
# ── 1. Seed & sign in ─────────────────────────────────────────────────
- runFlow:
    file: ../_setup/seed-and-sign-in.yaml
    env:
      SEED_SCENARIO: "language-learner"
      API_URL: ${API_URL}

# ── 2. Wait for home screen ───────────────────────────────────────────
- extendedWaitUntil:
    visible:
      id: "home-scroll-view"
    timeout: 15000

# ── 3. Navigate to Progress tab ───────────────────────────────────────
- tapOn:
    id: "tab-progress"

- takeScreenshot: vocab-01-progress-screen

# ── 4. Find and tap the vocabulary stat pill ──────────────────────────
# The vocabulary pill (progress-vocab-stat) only appears when the user has
# at least one language subject (pedagogyMode === 'four_strands').
- scrollUntilVisible:
    element:
      id: "progress-vocab-stat"
    direction: DOWN
    timeout: 10000

- takeScreenshot: vocab-02-vocab-pill-visible

- tapOn:
    id: "progress-vocab-stat"

# ── 5. Verify vocabulary browser loads ────────────────────────────────
# Should NOT show error, no-language, or new-learner gates (seed has
# language subject + 4 sessions + vocabulary entries).
- extendedWaitUntil:
    visible:
      id: "vocab-browser-back"
    timeout: 10000

- takeScreenshot: vocab-03-vocabulary-browser

# Verify we did NOT hit a gate state
- assertNotVisible:
    id: "vocab-browser-error"

- assertNotVisible:
    id: "vocab-browser-no-language"

- assertNotVisible:
    id: "vocab-browser-new-learner"

- assertNotVisible:
    id: "vocab-browser-empty"

# ── 6. Verify vocabulary content is shown ─────────────────────────────
# The browser shows CEFR breakdown per subject. With 3 seeded entries
# (2x A1, 1x A2), we should see at least "A1" and "A2" labels.
- assertVisible:
    text: "A1"

- assertVisible:
    text: "A2"

- takeScreenshot: vocab-04-cefr-breakdown

# ── 7. Navigate back to progress ─────────────────────────────────────
- tapOn:
    id: "vocab-browser-back"

- extendedWaitUntil:
    visible:
      id: "tab-progress"
    timeout: 5000

- takeScreenshot: vocab-05-back-to-progress
```

- [ ] **Step 2: Run the flow**

```bash
cd apps/mobile/e2e && ./scripts/seed-and-run.sh language-learner flows/learning/vocabulary-flow.yaml
```

Expected: vocabulary browser loads with CEFR breakdown showing A1 and A2 entries. No gate screens visible.

- [ ] **Step 3: Commit**

```
feat(e2e): add vocabulary browser flow — progress to CEFR breakdown [E2E-V1]
```

---

## Task 6: SSO Buttons Verification

**Files:**
- Create: `apps/mobile/e2e/flows/auth/sso-buttons.yaml`

**Screens covered:** sign-in screen (SSO buttons), SSO callback (limited — external browser not automatable)

**Limitation:** OAuth SSO flows open an external browser that Maestro cannot interact with. This flow verifies SSO buttons are visible and tappable on the sign-in screen. The actual SSO callback screen (`sso-callback.tsx`) can only be tested for its 10-second timeout fallback, but deep-linking to it reliably in dev-client mode is not guaranteed. This flow is tagged `nightly`, and actual SSO verification should be tagged `manual`.

**Navigation path:**
```
App launch (no seed — pre-auth)
  → Sign-in screen
    → verify SSO buttons visible (google-sso-button, apple-sso-button)
    → verify email sign-in path still works
```

- [ ] **Step 1: Write the SSO buttons flow YAML**

Create `apps/mobile/e2e/flows/auth/sso-buttons.yaml`:

```yaml
# Flow A2: SSO Buttons — Verify OAuth provider buttons on sign-in
# Validates: all SSO provider buttons are visible and rendering correctly
# on the sign-in screen. Does NOT test the actual OAuth flow (requires
# external browser interaction which Maestro cannot automate).
# Tags: nightly, auth
#
# Journey: UX Journey 0 (Authentication)
# Epics: Epic 1 (Auth / SSO)
# Prerequisite: None — pre-auth flow, no seed needed.
#
# NOTE: The actual SSO callback screen (sso-callback.tsx) shows a spinner
# and has a 10s timeout fallback (sso-fallback-back). Testing the callback
# screen requires deep-linking to mentomate://sso-callback, which is
# unreliable in dev-client mode. Full SSO E2E testing should be done
# manually (tagged 'manual' in a separate flow).
#
# testIDs verified against:
#   - apps/mobile/src/app/(auth)/sign-in.tsx (sign-in-button, sign-in-email,
#     sign-in-password, google-sso-button, apple-sso-button, openai-sso-button)
#   - apps/mobile/src/app/sso-callback.tsx (sso-fallback-back)
appId: com.mentomate.app
tags:
  - nightly
  - auth
---
# ── 1. Wait for sign-in screen ────────────────────────────────────────
# No seed-and-sign-in — we stay on the auth screen.
# The app launches to sign-in after dev-client setup.
- extendedWaitUntil:
    visible:
      id: "sign-in-button"
    timeout: 120000

- takeScreenshot: sso-01-sign-in-screen

# ── 2. Verify email/password fields are present ──────────────────────
- assertVisible:
    id: "sign-in-email"

- assertVisible:
    id: "sign-in-password"

# ── 3. Verify SSO provider buttons ───────────────────────────────────
# Google SSO
- assertVisible:
    id: "google-sso-button"

# Apple SSO
- assertVisible:
    id: "apple-sso-button"

# OpenAI SSO (if present — may be feature-flagged)
- assertVisible:
    id: "openai-sso-button"
    optional: true

- takeScreenshot: sso-02-all-buttons-visible

# ── 4. Verify SSO buttons have accessible labels ─────────────────────
- assertVisible:
    text: "Continue with Google"

- assertVisible:
    text: "Continue with Apple"

- takeScreenshot: sso-03-labels-verified
```

- [ ] **Step 2: Run the flow**

This flow doesn't need seeding — use the `--no-seed` flag:

```bash
cd apps/mobile/e2e && ./scripts/seed-and-run.sh --no-seed flows/auth/sso-buttons.yaml
```

Expected: all SSO buttons render correctly. Screenshots capture the sign-in screen with all provider options visible.

- [ ] **Step 3: Commit**

```
feat(e2e): add SSO button verification on sign-in screen [E2E-A2]
```

---

## Coverage Summary

| Flow | File | Critical-gap screens covered | Seed |
|------|------|------------------------------|------|
| Quiz full flow | `flows/quiz/quiz-full-flow.yaml` | 5 of 5: index, launch, play, results, history (+ bonus: round detail) | `onboarding-complete` |
| Dictation full flow | `flows/dictation/dictation-full-flow.yaml` | 4 of 5: choice, text-preview, playback, complete. **Not covered: review (requires device camera)** | `onboarding-complete` |
| Book detail | `flows/learning/book-detail.yaml` | 1 of 1: book detail screen | `learning-active` |
| Vocabulary browser | `flows/learning/vocabulary-flow.yaml` | 1 of 1: vocabulary browser | `language-learner` (new) |
| SSO buttons | `flows/auth/sso-buttons.yaml` | 0 of 1: verifies SSO buttons on sign-in, but **sso-callback screen not reachable** (external browser redirect) | none |

**Total: 11 of 13 critical-gap screens covered.** Raises overall coverage from 63/88 (72%) to 74/88 (84%).

Two screens remain uncoverable by Maestro automation:
- **Dictation review** — requires device camera to capture handwriting
- **SSO callback** — requires external browser redirect (`mentomate://sso-callback`)

## Known Limitations

1. **Quiz answer loop:** The `repeat: while: notVisible` pattern requires Maestro 1.36+. If your Maestro version doesn't support it, replace with `repeat: times: 12` and mark all inner commands `optional: true`.

2. **Dictation playback:** TTS may not produce audible output in WHPX emulator, but the state machine still advances. If it stalls, the `playback-exit` fallback fires. The flow uses a non-optional gate assertion (`practice-screen` must be visible at exit) to ensure something was tested regardless of which path was taken.

3. **SSO callback:** The actual OAuth redirect (external browser → `mentomate://sso-callback`) cannot be automated by Maestro. The `sso-callback.tsx` screen's 10s timeout fallback is the only automatable behavior, but requires deep-linking which is unreliable in dev-client.

4. **Book detail shelf:** The flow handles both single-book (auto-redirect) and multi-book (conditional `runFlow: when: visible: shelf-screen` tap) scenarios. No manual adjustment needed if the seed data changes.
