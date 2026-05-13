# Learning Path Clarity Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve five learner-facing friction points in the learning paths (mode terminology conflict, age-inappropriate copy, verification overlay transitions, missing conversational diagnostic in review sessions) using the smallest viable code change in each case, reusing existing infrastructure.

**Architecture:** Three-file mechanical rename for the mode terminology; copy + i18n update for home labels; prompt-only updates for verification overlays; one new session-orchestrator hook that pipes review-session turn-1 answers into the existing `evaluateRecallQuality` → `processRecallResult` → `retention_cards` pipeline. No schema changes. No new UI surfaces.

**Tech Stack:** TypeScript, React Native (Expo Router), Hono (API), Drizzle ORM, Jest, Maestro (e2e), `pnpm eval:llm` harness.

**Spec:** `docs/specs/2026-05-06-learning-path-clarity-pass.md`

---

## Task Order (dependency-driven)

1. **Task 1: Mode rename `practice` → `review`** (unblocks Task 4)
2. **Task 2: Home quick action label updates** (independent)
3. **Task 3: Verification overlay preambles** (independent)
4. **Task 4: Review-session conversational diagnostic** (depends on Task 1)
5. **Task 5: Filing-prompt rule documentation** (independent, doc-only)

Tasks 2, 3, and 5 can run in parallel after Task 1 completes. Task 4 must wait for Task 1.

---

## Task 1: Mode Rename `practice` → `review`

**Files:**
- Modify: `apps/mobile/src/components/session/session-types.ts:294` (union narrowing)
- Modify: `apps/mobile/src/components/session/session-types.test.ts:9-11` (DELETE the existing `'returns teaching for practice mode'` test — see Step 2)
- Modify: `apps/mobile/src/components/session/sessionModeConfig.ts` (lines 22-30, 92, 103, 113 — see Step 4b)
- Modify: `apps/mobile/src/components/session/sessionModeConfig.test.ts:10` (test mode list)
- Modify: `apps/mobile/src/app/(app)/topic/[topicId].tsx:215` (route param)
- Modify: `apps/mobile/src/app/(app)/session/index.test.tsx:813` (test fixture)

The `'review'` mode value already exists in the type union and in `SESSION_MODE_CONFIGS` (`sessionModeConfig.ts:49-57`). The API does not branch on the literal `'practice'` — schema-side `effectiveMode` is `z.string().optional()` (`packages/schemas/src/sessions.ts:221`), no enum validation. This is a mobile-only change.

> **Backward-compat (CHALLENGE-HIGH-2):** `learning_sessions.metadata.effectiveMode` is free-form text in the DB. Production rows may already have `effectiveMode: 'practice'`. Resumed sessions hit `getConversationStage(...)` and `getOpeningMessage(...)` after the rename — both must keep working. The chosen path is **code-side back-compat:** treat `'practice'` as a synonym for `'review'` for one release in the two functions that read it (see Step 4a fallback). No data migration. Documented in the Failure Modes table.

- [ ] **Step 1: Verify the audit before changing anything**

Run:
```bash
grep -rn "'practice'" apps/mobile/src/ apps/api/src/ packages/
```
Expected output (6 matches — all addressed in this task except the last):
```
apps/mobile/src/app/(app)/session/index.test.tsx:813:      mode: 'practice',                                            <-- Step 6 (rename)
apps/mobile/src/app/(app)/topic/[topicId].tsx:215:          params: { mode: 'practice', subjectId, topicId, topicName }, <-- Step 5 (rename)
apps/mobile/src/components/session/session-types.test.ts:10:    expect(getConversationStage(0, false, 'practice')).toBe('teaching'); <-- Step 2 (DELETE test)
apps/mobile/src/components/session/session-types.ts:294:    ['practice', 'review', 'relearn', 'homework', 'recitation'].includes(  <-- Step 4 (narrow union, keep 'practice' in fallback per HIGH-2)
apps/mobile/src/components/session/sessionModeConfig.test.ts:10:  const modes = ['homework', 'learning', 'practice', 'freeform']; <-- Step 4b (replace with 'review')
apps/api/src/services/adaptive-teaching.test.ts:292:    expect(prompt).toContain('practice');                            <-- LEAVE (substring of 'practice_problems', unrelated to session mode)
```

If grep returns more than these 6, the audit needs re-doing — sweep the new sites before editing.

- [ ] **Step 2: Replace the existing `'practice'` test in `session-types.test.ts`** (CHALLENGE-CRITICAL-1)

Open `apps/mobile/src/components/session/session-types.test.ts`. The existing test at lines 9-11 documents the OLD behavior:

```ts
it('returns teaching for practice mode regardless of other inputs', () => {
  expect(getConversationStage(0, false, 'practice')).toBe('teaching');
});
```

**Delete this test entirely.** It tests behavior we are removing. Then immediately above the existing `'returns teaching for review mode'` test (line 13), add a forward-only guard that documents the back-compat fallback chosen for HIGH-2:

```ts
it("treats the legacy 'practice' literal as a synonym for 'review' (back-compat)", () => {
  // Resumed sessions may still carry metadata.effectiveMode === 'practice'
  // from rows created before the rename (spec 2026-05-06, CHALLENGE-HIGH-2).
  // The synonym fallback in session-types.ts:294 keeps them in 'teaching'.
  expect(getConversationStage(0, false, 'practice' as never)).toBe('teaching');
});
```

- [ ] **Step 3: Run the test — the new test should currently FAIL only if you removed `'practice'` from the union without keeping the back-compat fallback. If you keep both edits in Step 4 atomic, expect the test to PASS after Step 4.**

Run:
```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/session-types.test.ts --no-coverage
```

Expected after Step 4: PASS for the back-compat assertion plus the existing `'review'` assertion.

- [ ] **Step 4: Narrow the union in `session-types.ts` and keep `'practice'` as a back-compat synonym** (CHALLENGE-HIGH-2)

Open `apps/mobile/src/components/session/session-types.ts` at line 294 and change:

```ts
if (
  ['practice', 'review', 'relearn', 'homework', 'recitation'].includes(
    effectiveMode
  )
) {
  return 'teaching';
}
```

To:

```ts
// 'practice' is the legacy literal for 'review' (renamed 2026-05-06).
// Kept in the includes() list as a back-compat synonym for resumed sessions
// whose metadata.effectiveMode was written before the rename.
// Remove after one release window. Tracked: CHALLENGE-HIGH-2.
if (
  ['review', 'practice', 'relearn', 'homework', 'recitation'].includes(
    effectiveMode
  )
) {
  return 'teaching';
}
```

- [ ] **Step 4b: Add `review` entries to `sessionModeConfig.ts` early-session greeting maps** (CHALLENGE-HIGH-1)

Open `apps/mobile/src/components/session/sessionModeConfig.ts`. The file has a full `review` `SessionModeConfig` at lines 49-57 (good — `getOpeningMessage` falls back to `config.openingMessage` for experience ≥ 5). But the cold-start greeting maps `FIRST_SESSION` (line 87), `EARLY_SESSIONS` (line 100), `FAMILIAR_SESSIONS` (line 109) only have `practice`, no `review`. After the rename, learners with sessions 1-5 of experience would get the freeform fallback `"Hi! I'm your learning mate. Feel free to ask me anything…"` — wrong tone for a review.

Add `review` keys to all three maps. Suggested copy (tune to match the calibration intent of Task 4):

```ts
const FIRST_SESSION: Record<string, string> & { freeform: string } = {
  // ...existing entries...
  review:
    "Welcome back! Let's see what stuck — tell me what you remember about this topic.",
  // ...
};

export const EARLY_SESSIONS: Record<string, string> & { freeform: string } = {
  // ...existing entries...
  review: "Quick refresh — what comes to mind when you think about this?",
  // ...
};

export const FAMILIAR_SESSIONS: Record<string, string> & { freeform: string } = {
  // ...existing entries...
  review: "Let's see what's still fresh — what do you remember?",
  // ...
};
```

**Keep the existing `practice` entries in all three maps** — they serve the same back-compat purpose as Step 4 (resumed sessions with `effectiveMode='practice'` still render correct copy). Tracked under CHALLENGE-HIGH-2 for cleanup after one release.

Also update `apps/mobile/src/components/session/sessionModeConfig.test.ts:10` — the test mode list:

```ts
const modes = ['homework', 'learning', 'practice', 'freeform'];
```

Replace `'practice'` with `'review'` (this test asserts greeting messages exist for each canonical mode — `'review'` is now canonical, `'practice'` is legacy).

Run the test to confirm:
```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/sessionModeConfig.ts --no-coverage
```
Expected: PASS.

- [ ] **Step 5: Update the topic-detail route param at `topic/[topicId].tsx:215`**

Open `apps/mobile/src/app/(app)/topic/[topicId].tsx` at line 215 and change:

```ts
router.push({
  pathname: '/(app)/session',
  params: { mode: 'practice', subjectId, topicId, topicName },
} as never);
```

To:

```ts
router.push({
  pathname: '/(app)/session',
  params: { mode: 'review', subjectId, topicId, topicName },
} as never);
```

- [ ] **Step 6: Update the test fixture at `session/index.test.tsx:813`**

Open `apps/mobile/src/app/(app)/session/index.test.tsx` at line 813 and change `mode: 'practice'` to `mode: 'review'`.

- [ ] **Step 7: Run the affected test files — all should now PASS**

Run:
```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/session-types.test.ts src/app/\(app\)/topic/\[topicId\].tsx src/app/\(app\)/session/index.test.tsx --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 8: Run mobile typecheck**

Run:
```bash
cd apps/mobile && pnpm exec tsc --noEmit
```

Expected: clean exit. The two intentional remaining `'practice'` literals (the back-compat synonym in `session-types.ts:294` and the back-compat key in the three `sessionModeConfig.ts` maps) are loose-typed (`string` lookups), so typecheck does not flag them.

If errors mention `'practice'`, you missed a call site OR you accidentally re-introduced it where the new canonical name is `'review'` — `grep -rn "'practice'" apps/mobile/src/` and reconcile against the 6-match expected list in Step 1.

- [ ] **Step 9: Commit**

Use the `/commit` skill.

---

## Task 2: Home Quick Action Label Updates

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.json` (lines 125–138)
- Modify: `apps/mobile/src/i18n/locales/nb.json` (matching keys)
- Modify: `apps/mobile/src/i18n/locales/de.json`
- Modify: `apps/mobile/src/i18n/locales/es.json`
- Modify: `apps/mobile/src/i18n/locales/pl.json`
- Modify: `apps/mobile/src/i18n/locales/pt.json`
- Modify: `apps/mobile/src/i18n/locales/ja.json`
- Modify: `apps/mobile/src/components/home/LearnerScreen.test.tsx`

Current state verified — `studyNew.title` is already `"Learn something new"` (no change). Only `homework.title` and `practice.title` need updates.

| Key | Current (en) | New (en) |
|---|---|---|
| `home.learner.intentActions.homework.title` | "Homework help" | "Help with an assignment" |
| `home.learner.intentActions.practice.title` | "Practice for a test" | "Test yourself" |
| `home.learner.intentActions.studyNew.title` | "Learn something new" | (no change) |

- [ ] **Step 1: Update the LearnerScreen test to assert new label strings**

Open `apps/mobile/src/components/home/LearnerScreen.test.tsx`. Search for existing assertions on the old label strings (`grep -n "Homework help\\|Practice for a test"` in this file). For each, update to the new string.

If the existing tests check only testIDs (not label text), add one new test asserting the rendered title text for each of the 3 actions:

```tsx
it('renders the updated home action labels', () => {
  // ... existing render setup ...
  expect(screen.getByText('Help with an assignment')).toBeTruthy();
  expect(screen.getByText('Test yourself')).toBeTruthy();
  expect(screen.getByText('Learn something new')).toBeTruthy();
});
```

- [ ] **Step 2: Run the test — it should FAIL**

Run:
```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.test.tsx --no-coverage
```

Expected: FAIL — the rendered text is still the old strings from `en.json`.

- [ ] **Step 3: Update `en.json`**

Open `apps/mobile/src/i18n/locales/en.json` at lines 125–138 and change:

```json
"homework": {
  "title": "Homework help",
  "subtitle": "Take a photo or type the problem"
},
"practice": {
  "title": "Practice for a test",
  "subtitle": "Review what is fading or quiz yourself"
},
```

To:

```json
"homework": {
  "title": "Help with an assignment",
  "subtitle": "Take a photo or type the problem"
},
"practice": {
  "title": "Test yourself",
  "subtitle": "Review what is fading or quiz yourself"
},
```

(Subtitles unchanged — they're still accurate.)

- [ ] **Step 4: Update each non-en locale**

For each of `nb.json`, `de.json`, `es.json`, `pl.json`, `pt.json`, `ja.json` — open the file, find the matching `home.learner.intentActions.homework.title` and `home.learner.intentActions.practice.title` keys (same line region as en.json), and replace the title strings with locale-appropriate translations of:

- "Help with an assignment"
- "Test yourself"

Translation guide (use the spirit, not literal):

| Locale | "Help with an assignment" | "Test yourself" |
|---|---|---|
| nb (Norwegian Bokmål) | "Hjelp med en oppgave" | "Test deg selv" |
| de (German) | "Hilfe bei einer Aufgabe" | "Teste dich selbst" |
| es (Spanish) | "Ayuda con una tarea" | "Pon a prueba tus conocimientos" |
| pl (Polish) | "Pomoc z zadaniem" | "Sprawdź się" |
| pt (Portuguese) | "Ajuda com uma tarefa" | "Teste-se" |
| ja (Japanese) | "課題のヘルプ" | "力試し" |

If the project uses LLM-powered i18n (per memory `project_implementation_phase.md`), regenerate via the existing translation pipeline instead of hand-editing.

- [ ] **Step 5: Run the LearnerScreen test — should now PASS**

Run:
```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.test.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 6: Sweep e2e flows for the old label strings**

Run:
```bash
grep -rn "Homework help\|Practice for a test" apps/mobile/e2e/
```

For each match, update the assertion to use the new label OR (preferred) switch to a testID-based assertion (the testIDs `home-action-homework` / `home-action-practice` are unchanged).

- [ ] **Step 7: Run the LearnerScreen-related test suite again to confirm clean state**

Run:
```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/components/home/LearnerScreen.tsx --no-coverage
```

Expected: PASS.

- [ ] **Step 8: Commit**

Use the `/commit` skill.

---

## Task 3: Verification Overlay Preambles (Devil's Advocate + Feynman)

**Files:**
- Modify: `apps/api/src/services/exchange-prompts.ts:685–704` (EVALUATE / Devil's Advocate block)
- Modify: `apps/api/src/services/exchange-prompts.ts:706–723` (TEACH_BACK / Feynman block)
- Modify: `apps/api/src/services/exchanges.test.ts:496` (existing TEACH_BACK prompt test)
- Test: `apps/api/eval-llm/` (Tier-2 eval scenario for each mode)

The current prompts include a "Session type: ..." header and the JSON assessment instruction, but no conversational transition phrase for the learner. Add a one-line transition instruction at the start of each block so the LLM opens the verification turn with a learner-facing handoff phrase.

> **EVAL-MIGRATION coordination (CHALLENGE-MEDIUM-1):** Both prompt blocks have an existing `TODO: EVAL-MIGRATION` comment at `exchange-prompts.ts:686-689` and `:707-710` flagging that the embedded JSON assessment block contradicts the envelope contract (CLAUDE.md → "LLM Response Envelope") and must move to `signals.evaluate_assessment` / `signals.teach_back_assessment`. Decision for this PR: **ship the transition-phrase prose now and absorb the small extra cost at envelope-migration time.** When the EVAL-MIGRATION work lands, the transition phrase migrates with the rest of the block — no separate refactor. Update the existing TODO comments in Step 4/5 to mention the transition-phrase line so it isn't lost.

- [ ] **Step 1: Add a forward-only assertion in `exchanges.test.ts` for the EVALUATE preamble** (CHALLENGE-MEDIUM-4)

Open `apps/api/src/services/exchanges.test.ts`. The canonical fixture is `baseContext: ExchangeContext` declared at line 29. Add a new test using it:

```ts
it('includes a learner-facing transition phrase in EVALUATE prompt section', () => {
  const prompt = buildSystemPrompt({
    ...baseContext,
    verificationType: 'evaluate',
  });
  expect(prompt).toMatch(/transition phrase/i);
  expect(prompt).toMatch(/begin your reply with/i);
});
```

- [ ] **Step 2: Add the same forward-only assertion for TEACH_BACK**

```ts
it('includes a learner-facing transition phrase in TEACH_BACK prompt section', () => {
  const prompt = buildSystemPrompt({
    ...baseContext,
    verificationType: 'teach_back',
  });
  expect(prompt).toMatch(/transition phrase/i);
  expect(prompt).toMatch(/begin your reply with/i);
});
```

- [ ] **Step 3: Run the new tests — both should FAIL**

Run:
```bash
pnpm exec nx run api:test --testPathPattern=exchanges.test.ts
```

Expected: both new tests FAIL with no match for the regex.

- [ ] **Step 4: Update the EVALUATE prompt section in `exchange-prompts.ts:690`**

Open `apps/api/src/services/exchange-prompts.ts`. Update the `TODO: EVAL-MIGRATION` block at lines 686-689 to mention the transition phrase added below, so the eventual envelope migration carries it along. Append: `// Note (2026-05-06): includes a TRANSITION PHRASE block added for the learning-path-clarity-pass spec — must migrate with the rest of this section.` to the existing TODO comment.

The current EVALUATE section (lines 690–703) reads:

```ts
if (context.verificationType === 'evaluate') {
  const rung = context.evaluateDifficultyRung ?? 1;
  const rungDescription = getEvaluateRungDescription(rung);
  sections.push(
    "Session type: THINK DEEPER (Devil's Advocate)\n" +
      'Present a plausibly flawed explanation of the topic.\n' +
      'The student must identify and explain the specific error.\n' +
      `Difficulty rung ${rung}/4: ${rungDescription}\n` +
      'After the student responds, assess whether they correctly identified the flaw.\n' +
      'Output TWO sections:\n' +
      '1. Your conversational response (visible to student)\n' +
      '2. A JSON assessment block on a new line:\n' +
      '{"challengePassed": true/false, "flawIdentified": "description of what they found", "quality": 0-5}'
  );
}
```

Insert a transition-phrase instruction immediately after the "Session type" line:

```ts
if (context.verificationType === 'evaluate') {
  const rung = context.evaluateDifficultyRung ?? 1;
  const rungDescription = getEvaluateRungDescription(rung);
  sections.push(
    "Session type: THINK DEEPER (Devil's Advocate)\n" +
      'TRANSITION PHRASE: Begin your reply with a brief one-line handoff that signals the mode shift to the learner. Examples (vary; do not repeat verbatim across sessions):\n' +
      '- "Quick check — let me try to trip you up."\n' +
      '- "Let\'s see if you can spot the catch in this..."\n' +
      '- "Here\'s a thought — tell me if you see the flaw."\n' +
      'After the transition phrase, on the same conversational turn, present the flawed explanation.\n' +
      'Present a plausibly flawed explanation of the topic.\n' +
      'The student must identify and explain the specific error.\n' +
      `Difficulty rung ${rung}/4: ${rungDescription}\n` +
      'After the student responds, assess whether they correctly identified the flaw.\n' +
      'Output TWO sections:\n' +
      '1. Your conversational response (visible to student)\n' +
      '2. A JSON assessment block on a new line:\n' +
      '{"challengePassed": true/false, "flawIdentified": "description of what they found", "quality": 0-5}'
  );
}
```

- [ ] **Step 5: Update the TEACH_BACK prompt section in `exchange-prompts.ts:711`**

Update the `TODO: EVAL-MIGRATION` block at lines 707-710 the same way (append the transition-phrase note).

Apply the same pattern — insert a transition-phrase instruction after the "Session type" line:

```ts
if (context.verificationType === 'teach_back') {
  sections.push(
    'Session type: TEACH BACK (Feynman Technique)\n' +
      'TRANSITION PHRASE: Begin your reply with a brief one-line handoff that signals the mode shift to the learner. Examples (vary; do not repeat verbatim across sessions):\n' +
      '- "Want to try something? Pretend I haven\'t learned this yet."\n' +
      '- "Let\'s flip it — explain it to me as if I\'m new to this."\n' +
      '- "Quick switch — you teach me this one."\n' +
      'After the transition phrase, on the same conversational turn, ask your first naive question.\n' +
      'You are a curious but clueless student who wants to learn about the topic.\n' +
      'The learner is the teacher — they must explain the concept to you.\n' +
      'Ask naive follow-up questions. Probe for gaps in the explanation.\n' +
      'Never correct the learner directly — they are the teacher.\n' +
      'Output TWO sections:\n' +
      '1. Your conversational follow-up question (visible to student)\n' +
      '2. A JSON assessment block on a new line:\n' +
      '{"completeness": 0-5, "accuracy": 0-5, "clarity": 0-5, "overallQuality": 0-5, "weakestArea": "completeness"|"accuracy"|"clarity", "gapIdentified": "description or null"}'
  );
}
```

- [ ] **Step 6: Run the prompt tests — both should now PASS**

Run:
```bash
pnpm exec nx run api:test --testPathPattern=exchanges.test.ts
```

Expected: PASS for both new tests + all existing exchanges tests.

- [ ] **Step 7: Snapshot the prompt change with the eval harness (Tier 1)**

Run:
```bash
pnpm eval:llm
```

Expected: snapshot updates for the EVALUATE and TEACH_BACK scenarios. Stage the updated snapshot files.

- [ ] **Step 8: Run a Tier-2 live LLM verification to confirm the model emits a transition phrase**

Run:
```bash
pnpm eval:llm --live
```

Expected: live LLM responses for `evaluate` and `teach_back` scenarios begin with a short transition phrase before the verification content. If the LLM drops the transition consistently, tighten the prompt instruction (move the transition line ABOVE the "Session type" line, or rephrase as a hard constraint rather than examples).

- [ ] **Step 9: Commit**

Use the `/commit` skill. Include the updated eval snapshot in the commit.

---

## Task 4: Review-Session Conversational Diagnostic

**Files:**
- Create: `apps/api/src/services/session/review-calibration.ts` (substantive-answer helper — locale-aware)
- Create: `apps/api/src/services/session/review-calibration.test.ts`
- Create: `apps/api/src/inngest/functions/review-calibration-grade.ts` (Inngest function: grade + persist) (CHALLENGE-HIGH-3)
- Modify: `apps/api/src/inngest/index.ts` (register the new function)
- Modify: `apps/api/src/services/exchange-prompts.ts` (review-mode opener — new `effectiveMode === 'review'` branch)
- Modify: `apps/api/src/services/session/session-exchange.ts` (orchestrator — atomic latch + Inngest dispatch between `prepareExchangeContext` and `processExchange`)
- Test: integration test at `tests/integration/review-session-calibration.integration.test.ts` (waits for Inngest function to settle, mirrors `retention-lifecycle.integration.test.ts`)

This is the only meaningful new behavior in the spec. The change pipes the learner's first substantive answer in a review-mode session through the existing `evaluateRecallQuality` → `processRecallResult` pipeline.

**Architecture (revised after CHALLENGE pass):**
- The session orchestrator currently calls `prepareExchangeContext` then `processExchange` (LLM) then `persistExchangeResult`. Insert a calibration-dispatch hook **between `prepareExchangeContext` and `processExchange`** at `apps/api/src/services/session/session-exchange.ts:1450-1462` (CHALLENGE-HIGH-4). The user message is still in `input.message` at this point, not yet persisted — that is fine, the calibration grades the raw text.
- The hook fires only when:
  - `session.metadata.effectiveMode === 'review'` AND
  - `session.topicId !== null` AND
  - `isSubstantiveCalibrationAnswer(input.message, conversationLanguage)` AND
  - `metadata.reviewCalibrationFiredAt` is not yet set AND
  - `metadata.reviewCalibrationAttempts < 2` (one retry per spec § 3 — CHALLENGE-MEDIUM-3)
- **Atomic latch** (CHALLENGE-HIGH-5): inside a `db.transaction(...)` (per `project_neon_transaction_facts.md` — neon-serverless gives genuine ACID), SELECT the session metadata `FOR UPDATE`, re-check the latch, then UPDATE `metadata.reviewCalibrationFiredAt` AND `metadata.reviewCalibrationAttempts`. Only after the transaction commits, send `inngest.send({ name: 'app/review.calibration.requested', data: { profileId, sessionId, topicId, learnerMessage, topicTitle } })`. If the Inngest send fails the latch is still set — acceptable: we tried, that turn does not re-grade. The next session can retry.
- **Async grading** (CHALLENGE-HIGH-3): the new Inngest function `review-calibration-grade.ts` runs `evaluateRecallQuality` + `canRetestTopic` + `processRecallResult` + retention-card UPDATE in `step.run` blocks. The orchestrator does NOT block the LLM turn on grading. CLAUDE.md: "Durable async work goes through Inngest. Do not fire-and-forget background work from route handlers."
- **Non-substantive turns**: do not set the latch, do increment `reviewCalibrationAttempts`. After 2 attempts the latch is set with no grade — calibration window closed (per spec § 3 "extend by one more turn before falling back to existing prior `retention_cards` state").

- [ ] **Step 1: Write the helper test FIRST — confirm it fails (TDD red phase, CHALLENGE-MEDIUM-5)**

Create `apps/api/src/services/session/review-calibration.test.ts` BEFORE creating the helper file:

```ts
import { isSubstantiveCalibrationAnswer } from './review-calibration';

describe('isSubstantiveCalibrationAnswer', () => {
  describe('English (default)', () => {
    it('rejects empty and whitespace-only', () => {
      expect(isSubstantiveCalibrationAnswer('', 'en')).toBe(false);
      expect(isSubstantiveCalibrationAnswer('   ', 'en')).toBe(false);
    });

    it('rejects single common non-answers', () => {
      expect(isSubstantiveCalibrationAnswer('idk', 'en')).toBe(false);
      expect(isSubstantiveCalibrationAnswer('IDK', 'en')).toBe(false);
      expect(isSubstantiveCalibrationAnswer("I don't know", 'en')).toBe(false);
      expect(isSubstantiveCalibrationAnswer('no', 'en')).toBe(false);
    });

    it('rejects very short answers (< 3 tokens)', () => {
      expect(isSubstantiveCalibrationAnswer('not sure', 'en')).toBe(false);
      expect(isSubstantiveCalibrationAnswer('the cell', 'en')).toBe(false);
    });

    it('accepts a 3+ token substantive explanation', () => {
      expect(
        isSubstantiveCalibrationAnswer('photosynthesis converts sunlight into energy', 'en')
      ).toBe(true);
    });
  });

  describe('Non-English locales (CHALLENGE-MEDIUM-2)', () => {
    it('rejects Norwegian non-answers', () => {
      expect(isSubstantiveCalibrationAnswer('vet ikke', 'nb')).toBe(false);
      expect(isSubstantiveCalibrationAnswer('nei', 'nb')).toBe(false);
    });
    it('rejects German non-answers', () => {
      expect(isSubstantiveCalibrationAnswer('weiß nicht', 'de')).toBe(false);
      expect(isSubstantiveCalibrationAnswer('keine ahnung', 'de')).toBe(false);
    });
    it('rejects Japanese non-answers', () => {
      expect(isSubstantiveCalibrationAnswer('わからない', 'ja')).toBe(false);
      expect(isSubstantiveCalibrationAnswer('いいえ', 'ja')).toBe(false);
    });
    it('falls back to English tokens when language is undefined or unknown', () => {
      expect(isSubstantiveCalibrationAnswer('idk', undefined)).toBe(false);
      expect(isSubstantiveCalibrationAnswer('idk', 'xx' as never)).toBe(false);
    });
  });
});
```

Run:
```bash
pnpm exec nx run api:test --testPathPattern=review-calibration.test.ts
```

Expected: FAIL — `Cannot find module './review-calibration'` (helper does not exist yet). This is the TDD red phase.

- [ ] **Step 2: Implement the helper — confirm tests PASS (TDD green phase)**

Create `apps/api/src/services/session/review-calibration.ts`:

```ts
import type { ConversationLanguage } from '@eduagent/schemas';

/**
 * Locale-aware non-answer token sets. English is the fallback for any
 * language we don't have a list for. Tokens are matched against the lowercased
 * trimmed full-message text; multi-word entries like "vet ikke" stay as one
 * entry. Spec: docs/specs/2026-05-06-learning-path-clarity-pass.md (Q3).
 */
const NON_ANSWER_TOKENS_BY_LANG: Record<string, Set<string>> = {
  en: new Set(['idk', "i don't know", 'dunno', 'no', 'yes', 'maybe', 'pass', 'skip', 'next', 'not sure']),
  nb: new Set(['nei', 'ja', 'vet ikke', 'aner ikke', 'kanskje', 'hopp', 'neste']),
  de: new Set(['nein', 'ja', 'weiß nicht', 'keine ahnung', 'vielleicht', 'überspringen']),
  es: new Set(['no', 'sí', 'no sé', 'no lo sé', 'tal vez', 'siguiente']),
  pt: new Set(['não', 'sim', 'não sei', 'talvez', 'próximo']),
  pl: new Set(['nie', 'tak', 'nie wiem', 'może', 'następne']),
  ja: new Set(['いいえ', 'はい', 'わからない', '分からない', 'たぶん']),
};

export function isSubstantiveCalibrationAnswer(
  text: string,
  conversationLanguage?: ConversationLanguage | string
): boolean {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.length === 0) return false;
  const tokens =
    NON_ANSWER_TOKENS_BY_LANG[conversationLanguage ?? 'en'] ??
    NON_ANSWER_TOKENS_BY_LANG.en;
  if (tokens.has(trimmed)) return false;
  // Token-count heuristic does not transfer cleanly to Japanese (no spaces),
  // so for ja we accept any non-token-set answer with > 3 characters.
  if (conversationLanguage === 'ja') return trimmed.length > 3;
  const tokenCount = trimmed.split(/\s+/).length;
  return tokenCount > 2;
}
```

Run the test again:
```bash
pnpm exec nx run api:test --testPathPattern=review-calibration.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Add a review-mode opener prompt block in `exchange-prompts.ts`** (CHALLENGE-CRITICAL-2)

Open `apps/api/src/services/exchange-prompts.ts`. Note: `ExchangeContext` does NOT have a `userMessageCount` field. The correct gate is `exchangeCount` — comment at `exchanges.ts:170-171`: *"Number of completed exchanges in this session — 0 means the LLM's first turn"*. The recitation cache pattern at `exchange-prompts.ts:270` is the closest example of a per-mode boolean cache (`isRecitation`).

After the existing mode-specific blocks (anywhere after line 270 but before the verification-type blocks at 685+), add:

```ts
if (
  context.effectiveMode === 'review' &&
  (context.exchangeCount ?? 0) === 0 // LLM's first turn — learner has not spoken yet
) {
  sections.push(
    'Session type: REVIEW (calibrated relearning).\n' +
      'TRANSITION PHRASE: Begin your reply with a brief one-line handoff that signals you are checking what stuck before re-teaching. Examples:\n' +
      '- "Last time we worked on this — let\'s see what comes back to you."\n' +
      '- "Quick recap before we dive back in — what do you remember about it?"\n' +
      'After the transition, ask one open calibration question that invites the learner to recall the topic in their own words. ' +
      'Do NOT ask a yes/no or multiple-choice question. Do NOT introduce new content yet — that comes after you see what they remember.'
  );
}
```

- [ ] **Step 4: Add a forward-only test for the review opener prompt**

Open `apps/api/src/services/exchanges.test.ts`. Use the canonical `baseContext` fixture at line 29:

```ts
it('includes a calibration opener in REVIEW mode on turn 1', () => {
  const prompt = buildSystemPrompt({
    ...baseContext,
    effectiveMode: 'review',
    exchangeCount: 0,
  });
  expect(prompt).toMatch(/REVIEW \(calibrated relearning\)/);
  expect(prompt).toMatch(/calibration question/i);
});

it('does NOT include the calibration opener after turn 1 in REVIEW mode', () => {
  const prompt = buildSystemPrompt({
    ...baseContext,
    effectiveMode: 'review',
    exchangeCount: 1,
  });
  expect(prompt).not.toMatch(/REVIEW \(calibrated relearning\)/);
});
```

- [ ] **Step 5: Run the prompt tests — should PASS**

Run:
```bash
pnpm exec nx run api:test --testPathPattern=exchanges.test.ts
```

Expected: PASS for both new review-opener tests + existing tests.

- [ ] **Step 6: Write the integration test for the calibration hook (red phase)**

Create `tests/integration/review-session-calibration.integration.test.ts` modeled after the existing `processRecallTest` integration test (find it via `grep -rn "processRecallTest" tests/integration/`).

```ts
/**
 * Integration test: review-mode session turn-1 calibration feeds retention_cards.
 * Spec: docs/specs/2026-05-06-learning-path-clarity-pass.md (Q3).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
// ... (match the existing integration-test setup imports) ...

describe('review-session calibration hook', () => {
  // ... (match the seed pattern: profile, subject, topic, retentionCard) ...

  it('updates retention_cards after a substantive turn-1 learner answer in review mode', async () => {
    // 1. Seed a profile + topic + existing retention_cards row (easeFactor 2.5, repetitions 0)
    // 2. POST a session start with mode=review, topicId=<seeded topic>
    // 3. POST a turn-1 learner answer that's substantive
    //    (e.g. "Photosynthesis converts sunlight into glucose using chlorophyll")
    // 4. CHALLENGE-HIGH-3: the orchestrator now dispatches an Inngest event;
    //    grading + retention update run async. Wait for the inngest function
    //    to settle — mirror the wait pattern from
    //    `apps/api/src/inngest/functions/interview-persist-curriculum.integration.test.ts`
    //    (poll the row, or use the test helper that drains the Inngest queue).
    // 5. SELECT the retention_cards row and assert easeFactor / repetitions / lastReviewedAt
    //    have moved.
    // 6. Also assert metadata.reviewCalibrationFiredAt is set on the session row.

    // Assertion shape (model after retention-lifecycle.integration.test.ts):
    const updatedCard = await db.query.retentionCards.findFirst({
      where: and(
        eq(retentionCards.profileId, profileId),
        eq(retentionCards.topicId, topicId)
      ),
    });
    expect(updatedCard).toBeDefined();
    expect(updatedCard!.repetitions).toBeGreaterThan(0);
    expect(updatedCard!.lastReviewedAt).not.toBeNull();
  });

  it('does NOT update retention_cards for a non-substantive turn-1 answer', async () => {
    // Same seed, but turn-1 answer = "idk"
    // Assert retention_cards row is unchanged from seed values.
    // Assert session metadata.reviewCalibrationAttempts === 1 (incremented).
    // Assert session metadata.reviewCalibrationFiredAt is NOT set (window still open).
  });

  it('extends the calibration window by one turn after a non-substantive first answer (CHALLENGE-MEDIUM-3)', async () => {
    // Seed + non-substantive turn 1 ("idk") + substantive turn 2 ("photosynthesis converts...").
    // Wait for inngest queue.
    // Assert retention_cards updated on turn 2.
    // Assert metadata.reviewCalibrationAttempts === 2 and reviewCalibrationFiredAt is set.
  });

  it('closes the calibration window after two non-substantive answers (no grading)', async () => {
    // Seed + "idk" turn 1 + "no" turn 2.
    // Assert retention_cards unchanged.
    // Assert metadata.reviewCalibrationFiredAt set with no card movement.
  });

  it('does not double-grade a session — second substantive answer does not re-dispatch (CHALLENGE-HIGH-5)', async () => {
    // Seed + send substantive turn-1 + wait for inngest + capture retention state +
    // send substantive turn-2.
    // Assert retention state did not move further on turn 2 (latch held by FOR UPDATE).
  });

  it('rejects locale-aware non-answers (CHALLENGE-MEDIUM-2)', async () => {
    // Seed with profile.conversationLanguage = 'nb'. Turn-1 answer = "vet ikke".
    // Assert retention_cards unchanged. Assert attempts incremented.
  });
});
```

- [ ] **Step 7: Run the integration test — should FAIL**

Run:
```bash
pnpm exec nx run api:test --testPathPattern=review-session-calibration.integration.test.ts
```

Expected: FAIL — the orchestrator hook doesn't exist yet.

- [ ] **Step 8: Implement the orchestrator dispatch (atomic latch + Inngest event) in `session-exchange.ts`** (CHALLENGE-HIGH-3, HIGH-4, HIGH-5, LOW-1)

Open `apps/api/src/services/session/session-exchange.ts`. Insert the dispatch hook **between `prepareExchangeContext` (line 1451) and `processExchange` (line 1462)**, and again at the parallel call site at line 1570. The user message is in `input.message` at this point (not yet persisted — that happens in `persistExchangeResult` after the LLM call). Grading the raw text is fine; persistence is independent.

```ts
import { isSubstantiveCalibrationAnswer } from './review-calibration';
import { inngest } from '../../inngest';
import { learningSessions } from '../../db/schema';
import { eq, sql, and } from 'drizzle-orm';

/**
 * Review-mode calibration dispatch.
 * Spec: docs/specs/2026-05-06-learning-path-clarity-pass.md (Q3).
 * CHALLENGE notes: HIGH-3 (Inngest, not inline LLM), HIGH-4 (insertion site),
 * HIGH-5 (atomic latch via db.transaction), MEDIUM-3 (one retry per spec).
 *
 * Atomically claims the calibration latch on the session metadata, then fires
 * an Inngest event. The grading + retention update happens async in the
 * `review-calibration-grade` function. Idempotent — concurrent dispatches lose
 * the FOR UPDATE race and return without re-firing.
 */
const MAX_CALIBRATION_ATTEMPTS = 2; // first turn + one retry (spec § 3)

async function maybeFireReviewCalibration(
  db: Database,
  profileId: string,
  session: {
    id: string;
    topicId: string | null;
    metadata: Record<string, unknown> | null;
  },
  effectiveMode: string,
  conversationLanguage: string | undefined,
  learnerMessageText: string,
  topicTitle: string | undefined
): Promise<void> {
  if (effectiveMode !== 'review') return;
  if (!session.topicId || !topicTitle) return;
  if (session.metadata?.reviewCalibrationFiredAt != null) return;

  const isSubstantive = isSubstantiveCalibrationAnswer(
    learnerMessageText,
    conversationLanguage
  );
  const priorAttempts =
    typeof session.metadata?.reviewCalibrationAttempts === 'number'
      ? (session.metadata.reviewCalibrationAttempts as number)
      : 0;

  if (!isSubstantive && priorAttempts + 1 >= MAX_CALIBRATION_ATTEMPTS) {
    // Window closes after one retry per spec § 3 — set the latch with no grade.
    await db
      .update(learningSessions)
      .set({
        metadata: sql`jsonb_set(
          jsonb_set(
            COALESCE(${learningSessions.metadata}, '{}'::jsonb),
            '{reviewCalibrationFiredAt}',
            ${JSON.stringify(new Date().toISOString())}::jsonb,
            true
          ),
          '{reviewCalibrationAttempts}',
          ${JSON.stringify(priorAttempts + 1)}::jsonb,
          true
        )`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(learningSessions.id, session.id),
          eq(learningSessions.profileId, profileId)
        )
      );
    return;
  }

  if (!isSubstantive) {
    // Increment attempt counter only; allow next turn to retry.
    await db
      .update(learningSessions)
      .set({
        metadata: sql`jsonb_set(
          COALESCE(${learningSessions.metadata}, '{}'::jsonb),
          '{reviewCalibrationAttempts}',
          ${JSON.stringify(priorAttempts + 1)}::jsonb,
          true
        )`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(learningSessions.id, session.id),
          eq(learningSessions.profileId, profileId)
        )
      );
    return;
  }

  // Substantive answer — atomically claim the latch then dispatch.
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ metadata: learningSessions.metadata })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.id, session.id),
          eq(learningSessions.profileId, profileId)
        )
      )
      .for('update');

    if (!row) return false;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.reviewCalibrationFiredAt != null) return false; // lost the race

    await tx
      .update(learningSessions)
      .set({
        metadata: sql`jsonb_set(
          jsonb_set(
            COALESCE(${learningSessions.metadata}, '{}'::jsonb),
            '{reviewCalibrationFiredAt}',
            ${JSON.stringify(new Date().toISOString())}::jsonb,
            true
          ),
          '{reviewCalibrationAttempts}',
          ${JSON.stringify(priorAttempts + 1)}::jsonb,
          true
        )`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(learningSessions.id, session.id),
          eq(learningSessions.profileId, profileId)
        )
      );
    return true;
  });

  if (!claimed) return;

  // Latch held — dispatch the grading event. If send fails, the latch is still
  // set and we will not re-grade this session: acceptable. The next session
  // can retry.
  await inngest.send({
    name: 'app/review.calibration.requested',
    data: {
      profileId,
      sessionId: session.id,
      topicId: session.topicId,
      learnerMessage: learnerMessageText,
      topicTitle,
    },
  });
}
```

Call site (insert at both `~1453` and `~1572`, after `prepareExchangeContext` returns):

```ts
const { session, context, effectiveRung, hintCount, lastAiResponseAt } =
  await prepareExchangeContext(db, profileId, sessionId, input.message, {
    ...options,
    homeworkMode: input.homeworkMode,
  });

// CHALLENGE-HIGH-3/4: dispatch review calibration (async, non-blocking).
// Runs before processExchange so the learner answer text is graded as-typed,
// without waiting for the assistant turn to complete.
const sessionMeta = (session.metadata ?? {}) as Record<string, unknown>;
await maybeFireReviewCalibration(
  db,
  profileId,
  { id: session.id, topicId: session.topicId, metadata: sessionMeta },
  (sessionMeta.effectiveMode as string | undefined) ?? '',
  context.conversationLanguage,
  input.message,
  context.topicTitle
);
```

- [ ] **Step 8b: Create the Inngest grading function** (CHALLENGE-HIGH-3)

Create `apps/api/src/inngest/functions/review-calibration-grade.ts`:

```ts
import { inngest } from '../index';
import { getDb } from '../../db';
import { evaluateRecallQuality } from '../../services/retention-data';
import { processRecallResult, canRetestTopic } from '../../services/retention';
import { rowToRetentionState } from '../../services/retention-data';
import { retentionCards } from '../../db/schema';
import { and, eq } from 'drizzle-orm';

export const reviewCalibrationGrade = inngest.createFunction(
  { id: 'review-calibration-grade', retries: 2 },
  { event: 'app/review.calibration.requested' },
  async ({ event, step }) => {
    const { profileId, sessionId, topicId, learnerMessage, topicTitle } = event.data;
    const db = getDb();

    const card = await step.run('load-card', async () =>
      db.query.retentionCards.findFirst({
        where: and(
          eq(retentionCards.profileId, profileId),
          eq(retentionCards.topicId, topicId)
        ),
      })
    );
    if (!card) return { skipped: 'no_retention_card' };

    const state = rowToRetentionState(card);
    const lastTestAt = card.lastReviewedAt?.toISOString() ?? null;
    if (!canRetestTopic(state, lastTestAt)) {
      return { skipped: 'cooldown_active' };
    }

    const quality = await step.run('grade', async () =>
      evaluateRecallQuality(learnerMessage, topicTitle)
    );
    const result = processRecallResult(state, quality);

    await step.run('persist', async () =>
      db
        .update(retentionCards)
        .set({
          easeFactor: result.newState.easeFactor,
          intervalDays: result.newState.intervalDays,
          repetitions: result.newState.repetitions,
          failureCount: result.newState.failureCount,
          consecutiveSuccesses: result.newState.consecutiveSuccesses,
          xpStatus: result.newState.xpStatus,
          nextReviewAt: result.newState.nextReviewAt
            ? new Date(result.newState.nextReviewAt)
            : null,
          lastReviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(retentionCards.id, card.id),
            eq(retentionCards.profileId, profileId)
          )
        )
    );

    return { quality, passed: result.passed };
  }
);
```

Register in `apps/api/src/inngest/index.ts` (add to the function array exported for serve):

```ts
import { reviewCalibrationGrade } from './functions/review-calibration-grade';
// ...
export const inngestFunctions = [
  // ...existing entries...
  reviewCalibrationGrade,
];
```

Add the event-name type to the Inngest event schema (search for `EventSchemas.fromRecord` or the equivalent type registration in `inngest/index.ts`):

```ts
'app/review.calibration.requested': {
  data: {
    profileId: string;
    sessionId: string;
    topicId: string;
    learnerMessage: string;
    topicTitle: string;
  };
};
```

(`rowToRetentionState` is already exported from `retention-data.ts` — verify with grep; if not, export it.)

- [ ] **Step 9: Run the integration test — should PASS**

Run:
```bash
pnpm exec nx run api:test --testPathPattern=review-session-calibration.integration.test.ts
```

Expected: all 6 tests PASS (substantive grade, non-substantive skip, retry-and-grade, two-non-substantive-close, no-double-grade, locale-aware reject).

- [ ] **Step 10: Run the full retention + session + inngest integration suite to confirm no regressions**

Run:
```bash
pnpm exec nx run api:test --testPathPattern="retention|session-exchange|review-calibration"
```

Expected: all PASS.

- [ ] **Step 11: Run the eval harness to capture the new review-mode opener**

Run:
```bash
pnpm eval:llm
```

Expected: snapshot updates for the review-mode opener scenarios. Stage the updated snapshots.

- [ ] **Step 12: Update the spec Failure Modes table** (CHALLENGE-MEDIUM-2, MEDIUM-3, HIGH-2)

Open `docs/specs/2026-05-06-learning-path-clarity-pass.md` and amend the Failure Modes table to add three rows:

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Resumed session has legacy `effectiveMode='practice'` in metadata | Session created before 2026-05-06 rename, resumed after | Same conversation stage and greeting copy as a `'review'` session | Code-side back-compat: `'practice'` is treated as a synonym for `'review'` in `session-types.ts:294` and the three `sessionModeConfig.ts` greeting maps for one release window. |
| Non-English learner uses native non-answer ("vet ikke", "weiß nicht", "わからない") | `conversationLanguage` is set, learner gives a locale non-answer | Calibration window stays open; no false-positive grade; mentor receives signal to re-teach | `isSubstantiveCalibrationAnswer(text, conversationLanguage)` consults locale-keyed token sets in `review-calibration.ts`. |
| Two consecutive non-substantive turns close the calibration window without grading | Learner answers "idk" then "no" (or any 2 non-substantive) | Session continues normally; SM-2 state is **not** updated for this session | `metadata.reviewCalibrationFiredAt` is set with no card movement after attempt 2; next review session retries calibration. |

- [ ] **Step 13: Commit**

Use the `/commit` skill. Include the new files (`review-calibration.ts`, its test, `review-calibration-grade.ts`, the integration test) and the modifications to `session-exchange.ts`, `exchange-prompts.ts`, `inngest/index.ts`, and the spec's Failure Modes table.

---

## Task 5: Filing-Prompt Rule Documentation

**Files:**
- Modify: `apps/api/src/services/session/session-depth.ts` (header comment)

- [ ] **Step 1: Add a header comment pointer**

Open `apps/api/src/services/session/session-depth.ts`. At the very top of the file (before existing imports/comments), add:

```ts
/**
 * Session-depth evaluation gates the filing prompt for unscoped sessions.
 *
 * The "Add to library?" modal in the mobile session footer
 * (apps/mobile/src/components/session/SessionFooter.tsx) appears ONLY when:
 *   1. Session mode is 'freeform' or 'homework' (scoped sessions are
 *      implicitly filed by their topic linkage), AND
 *   2. This evaluator returns `meaningful: true` for the session transcript.
 *
 * Opt-in default ("No thanks" leaves the session unfiled) is intentional.
 *
 * If you change this evaluator's thresholds, also update the spec:
 * docs/specs/2026-05-06-learning-path-clarity-pass.md (Q4).
 */
```

- [ ] **Step 2: Run a quick typecheck to confirm the comment didn't break anything**

Run:
```bash
pnpm exec nx run api:typecheck
```

Expected: clean exit.

- [ ] **Step 3: Commit**

Use the `/commit` skill.

---

## Final Verification (after all tasks)

- [ ] **Step 1: Run the full mobile + API test suites**

Run:
```bash
pnpm exec nx run-many -t test
```

Expected: all PASS.

- [ ] **Step 2: Run mobile + API typecheck**

Run:
```bash
pnpm exec nx run-many -t typecheck
```

Expected: clean.

- [ ] **Step 3: Run lint**

Run:
```bash
pnpm exec nx run-many -t lint
```

Expected: clean.

- [ ] **Step 4: Manual smoke (in emulator if available)**

1. Open Home — verify the three quick action labels read "Learn something new" / "Help with an assignment" / "Test yourself."
2. Tap a topic in Library that's overdue → topic detail shows "Review this topic" CTA → tap it → session opens with a calibration question on turn 1.
3. Answer substantively → wait ~10s for the Inngest grading function to settle → confirm in DB (or via parent dashboard "Understanding") that the retention card moved.
4. Answer with "idk" first, then a real answer → confirm calibration grades the second answer (CHALLENGE-MEDIUM-3 retry path).
5. (If a staging session row already exists with `metadata.effectiveMode='practice'`) resume it and confirm the greeting and conversation stage match the new `'review'` mode (CHALLENGE-HIGH-2 back-compat path).
6. (If feasible) trigger a Devil's Advocate or Feynman session and observe the LLM opens with a transition phrase.

If emulator is unavailable, note "Manual smoke deferred to E2E job" in the PR description.

- [ ] **Step 5: Update the spec status from "Draft spec" to "Implemented"**

Open `docs/specs/2026-05-06-learning-path-clarity-pass.md` and change the `**Status:**` line. Commit with the rest of Task 5 or as a final commit.
