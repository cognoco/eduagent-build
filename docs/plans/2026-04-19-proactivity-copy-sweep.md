# Proactivity Copy Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite 7 hardcoded client-side greeting/banner strings (C1–C7) plus two adjacent UI copy fixes (U1 Continue card subtitle, U2 Homework camera jargon) in `apps/mobile` so passive moments become concrete invitations or honest state-referencing prompts. Ship in a single small PR with no LLM prompt changes, no API/schema changes, no architectural change.

**Architecture:** Five mobile files are modified. Each edit is a direct string replacement with one exception (C5), which introduces a null-safe template branch. All edits are tested with a mix of **behavior tests** (given-state → rendered-output) and **revert guards** (change detectors on the exact new string, labeled as such). Zero server work, zero Inngest work, zero schema work.

**Tech Stack:** React Native (Expo), TypeScript, Jest + React Testing Library patterns already in the repo. All edits in `apps/mobile/src`.

**Final copy decisions (locked per spec recommendations; do not re-debate during execution):**

| ID | Old | New |
|---|---|---|
| C1 | `"What's on your mind?"` | `"Ask me something"` |
| C2 | `"What's on your mind? I'm ready when you are."` | `"Hi! Ask me anything."` |
| C3 | `"Hey again! What's on your mind today?"` | `"Hey again — what are you curious about?"` |
| C4 | `"What's on your mind? I'm ready when you are."` | `"Hey again — what are you curious about?"` (same as C3) |
| C5 | `"Welcome back - your session is ready."` | Template: `"Welcome back — you were exploring ${topicName}. Keep going?"` / Fallback: `"Welcome back! Ready to keep going?"` |
| C6 new | `"Hey! What would you like to learn about? You can ask me anything."` | `"Hi! Ask me anything."` |
| C6 returning | `"Hey! What's on your mind today?"` | `"Hey again — what are you curious about?"` |
| C7 | `` `Got it, this sounds like ${candidate.subjectName}.` `` | `` `Looks like ${candidate.subjectName}.` `` |
| U1 | `` `${continueSuggestion.subjectName} · ${continueSuggestion.topicTitle}` `` | `` `Pick up ${continueSuggestion.topicTitle}` `` |
| U2 | `"We need your camera to photograph homework problems so your AI tutor can help you work through them step by step."` | `"Snap a picture of your homework and I'll help you solve it step by step."` |

---

## File Structure

### Files modified
| Path | What changes | Risk |
|---|---|---|
| `apps/mobile/src/components/session/sessionModeConfig.ts` | C1 (L68), C2 (L69), C3 (L104), C4 (L112) — 4 string literals | Trivial |
| `apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts` | C6 (L313–L316 ternary), C7 (L364 template literal) | Trivial |
| `apps/mobile/src/app/(app)/session/index.tsx` | C5 (L1005–L1006 ternary branch) — introduces `topicName` reference + null-safe fallback | Medium — branching logic |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | U1 (L170) — Continue card subtitle reformat | Trivial |
| `apps/mobile/src/app/(app)/homework/camera.tsx` | U2 (L558) — camera permission body copy | Trivial |

### Files modified for tests
| Path | What changes |
|---|---|
| `apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.test.ts` | Update existing revert-guard string at L77 (C6 returning); add new revert-guard test for C7 tentative phrasing |
| `apps/mobile/src/components/session/sessionModeConfig.test.ts` | Add revert-guard tests asserting C1/C2/C3/C4 new strings |
| `apps/mobile/src/app/(app)/session/index.test.tsx` | Add behavior tests for C5: template branch, null fallback, undefined-during-hydration fallback |
| `apps/mobile/src/components/home/LearnerScreen.test.tsx` | Add behavior test for U1: Continue card leads with topic, omits subject from primary line |
| `apps/mobile/src/app/(app)/homework/camera.test.tsx` | Add narrow-jargon behavior test: `"AI tutor"` substring not in permission screen text |

### Files NOT touched
- Any file in `apps/api` — no server changes.
- Any file in `packages/` — no contract or schema changes.
- The review-variant Continue card at `LearnerScreen.tsx:192-208` — its subtitle is already action-oriented ("N topics to review"), out of scope.
- Voice-mode flows — text-mode scope only per spec.

---

## Task 1: C1–C4 — sessionModeConfig strings

**Files:**
- Modify: `apps/mobile/src/components/session/sessionModeConfig.ts:68,69,104,112`
- Test: `apps/mobile/src/components/session/sessionModeConfig.test.ts`

- [ ] **Step 1: Read current test file to find the right insertion point**

Run: `cat "apps/mobile/src/components/session/sessionModeConfig.test.ts" | head -40`
Expected: See existing `describe`/`it` blocks. Identify the test suite name used at the top (e.g., `describe('getOpeningMessage', ...)` or similar) so the new revert-guard tests fit the existing structure.

- [ ] **Step 2: Write failing revert-guard tests for C1–C4**

Append these tests inside the appropriate `describe` block (or add a new `describe` if none fits). If `getOpeningMessage` is exported and easier to call, use it; otherwise import `SESSION_MODE_CONFIGS` directly and the `EARLY_SESSIONS`/`FAMILIAR_SESSIONS` const maps (export them if they aren't already, noting the export is a test hook).

```ts
import {
  SESSION_MODE_CONFIGS,
  EARLY_SESSIONS,
  FAMILIAR_SESSIONS,
} from './sessionModeConfig';

describe('freeform greeting revert guards (copy sweep 2026-04-19)', () => {
  it('C1: freeform placeholder is "Ask me something"', () => {
    expect(SESSION_MODE_CONFIGS.freeform?.placeholder).toBe('Ask me something');
  });

  it('C2: freeform base openingMessage is "Hi! Ask me anything."', () => {
    expect(SESSION_MODE_CONFIGS.freeform?.openingMessage).toBe(
      'Hi! Ask me anything.'
    );
  });

  it('C3: EARLY_SESSIONS freeform greeting is the curiosity phrasing', () => {
    expect(EARLY_SESSIONS.freeform).toBe(
      'Hey again — what are you curious about?'
    );
  });

  it('C4: FAMILIAR_SESSIONS freeform greeting matches C3', () => {
    expect(FAMILIAR_SESSIONS.freeform).toBe(
      'Hey again — what are you curious about?'
    );
  });
});
```

**Note on exports:** `EARLY_SESSIONS` and `FAMILIAR_SESSIONS` are currently module-private (declared `const`, not exported). Add `export` to both declarations in `sessionModeConfig.ts` so the test can import them. This is a test hook — acceptable. Alternative: call `getOpeningMessage('freeform', 2)` and `getOpeningMessage('freeform', 10)` with the right `sessionExperience` thresholds, but doing so requires knowing the internal bucket boundaries (sessions 1–5 vs 6+). Explicit const export is clearer.

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/sessionModeConfig.test.ts --no-coverage`
Expected: Four new tests FAIL with assertion errors showing the old strings ("What's on your mind?", etc.) where the new strings were expected.

- [ ] **Step 4: Apply C1–C4 string edits**

Edit `apps/mobile/src/components/session/sessionModeConfig.ts`:

Line 68: change `placeholder: "What's on your mind?",` to `placeholder: 'Ask me something',`
Line 69: change `openingMessage: "What's on your mind? I'm ready when you are.",` to `openingMessage: 'Hi! Ask me anything.',`
Line 104: change `freeform: "Hey again! What's on your mind today?",` to `freeform: 'Hey again — what are you curious about?',`
Line 112: change `freeform: "What's on your mind? I'm ready when you are.",` to `freeform: 'Hey again — what are you curious about?',`

Also export the const maps so the tests can import them. Find `const EARLY_SESSIONS` (~L98) and `const FAMILIAR_SESSIONS` (~L107), prepend `export` to each.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/session/sessionModeConfig.test.ts --no-coverage`
Expected: All tests PASS, including the four new revert guards.

- [ ] **Step 6: Run type check**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: Clean — no new errors. Adding `export` to `const` declarations does not break existing callers.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/session/sessionModeConfig.ts \
        apps/mobile/src/components/session/sessionModeConfig.test.ts
git commit -m "feat(mobile): proactivity copy C1-C4 in sessionModeConfig [COPY-SWEEP]"
```

---

## Task 2: C6 + C7 — use-subject-classification strings

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts:313-316,364`
- Test: `apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.test.ts:77` (update existing) + new test for C7

- [ ] **Step 1: Read the existing greeting test to understand the setup**

Run: `sed -n '1,95p' "apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.test.ts"`
Expected: See `createMockOpts`, `useSubjectClassification` import, and the existing revert-guard test that hardcodes `"Hey! What's on your mind today?"` at L77.

- [ ] **Step 2: Update the existing C6-returning revert guard to the new string**

In `apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.test.ts` around L77, replace:
```ts
expect(animateResponse).toHaveBeenCalledWith(
  "Hey! What's on your mind today?",
  opts.setMessages,
  opts.setIsStreaming
);
```
with:
```ts
expect(animateResponse).toHaveBeenCalledWith(
  'Hey again — what are you curious about?',
  opts.setMessages,
  opts.setIsStreaming
);
```

- [ ] **Step 3: Add a behavior test for C7 tentative phrasing**

Append to the same test file, inside an appropriate `describe` (or add a new one). The test should exercise the classification code path (subject classified, message appended). If the existing test setup for classification is non-trivial, mirror its pattern from elsewhere in the file.

```ts
describe('C7 subject classification ack is tentative (copy sweep 2026-04-19)', () => {
  it('uses "Looks like" phrasing and does not use confident "Got it, this is about"', async () => {
    const opts = createMockOpts({
      sessionExperience: 0,
    });
    // Classify returns a single high-confidence candidate so the ack bubble is emitted.
    opts.classifySubject.mutateAsync.mockResolvedValueOnce({
      needsConfirmation: false,
      candidates: [
        { subjectId: 'sub-1', subjectName: 'Geography', confidence: 0.95 },
      ],
      suggestedSubjectName: null,
    });
    const { result } = renderHook(() => useSubjectClassification(opts as any));

    await act(async () => {
      await result.current.handleSend('Where is the Nile?');
    });

    // Find the assistant ack message appended by setMessages updater.
    // setMessages is called with an updater function: (prev) => [...prev, {content, ...}]
    const setMessagesCalls = opts.setMessages.mock.calls;
    const ackCall = setMessagesCalls.find((call: any[]) => {
      const updater = call[0];
      if (typeof updater !== 'function') return false;
      const next = updater([]);
      return next.some(
        (m: any) => typeof m.content === 'string' && m.content.includes('Geography')
      );
    });
    expect(ackCall).toBeDefined();
    const ackMessage = (ackCall![0] as Function)([]).find((m: any) =>
      m.content?.includes('Geography')
    );
    expect(ackMessage.content).toBe('Looks like Geography.');
    expect(ackMessage.content).not.toMatch(/^Got it/);
    expect(ackMessage.content).not.toMatch(/this is about/i);
  });
});
```

**If `createMockOpts` doesn't accept `classifySubject` with a mock mutateAsync**, look at how classification is mocked elsewhere in the file and mirror that approach. The test's goal is: given a single-candidate classification result, assert the appended message content is exactly `"Looks like Geography."` (or whatever subject name) with no "Got it" prefix.

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/session/_helpers/use-subject-classification.test.ts" --no-coverage`
Expected:
- Updated L77 test FAILS with assertion showing old C6 string still in source.
- New C7 test FAILS with assertion showing old `"Got it, this sounds like Geography."`.

- [ ] **Step 5: Apply C6 and C7 edits in source**

Edit `apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts`:

Around L313-316, replace the greeting ternary:
```ts
const greetingResponse =
  sessionExperience === 0
    ? 'Hey! What would you like to learn about? You can ask me anything.'
    : "Hey! What's on your mind today?";
```
with:
```ts
const greetingResponse =
  sessionExperience === 0
    ? 'Hi! Ask me anything.'
    : 'Hey again — what are you curious about?';
```

Around L364, replace the ack content:
```ts
content: `Got it, this sounds like ${candidate.subjectName}.`,
```
with:
```ts
content: `Looks like ${candidate.subjectName}.`,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/session/_helpers/use-subject-classification.test.ts" --no-coverage`
Expected: All tests PASS. If the new C7 test is still failing, it's almost certainly a mock-setup mismatch with `createMockOpts` — iterate on the mock shape until the classification branch actually executes.

- [ ] **Step 7: Commit**

```bash
git add "apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.ts" \
        "apps/mobile/src/app/(app)/session/_helpers/use-subject-classification.test.ts"
git commit -m "feat(mobile): proactivity copy C6-C7 in use-subject-classification [COPY-SWEEP]"
```

---

## Task 3: C5 — Resume banner with topic-name template and null fallback

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/index.tsx:999-1009`
- Test: `apps/mobile/src/app/(app)/session/index.test.tsx`

- [ ] **Step 1: Read the existing session/index.test.tsx to find the right test pattern**

Run: `grep -n "resumedBanner\|Welcome back\|describe(" "apps/mobile/src/app/(app)/session/index.test.tsx" | head -30`
Expected: Identify existing tests that render `<SessionScreen />` or test the subtitle logic, to mirror their setup. If no test covers the resume banner today, the new tests will be the first.

- [ ] **Step 2: Write failing behavior tests for C5 branches**

Append to `apps/mobile/src/app/(app)/session/index.test.tsx`. Mirror the existing render setup from other tests in the file (imports, `renderWithProviders` helper, route-param mocks). The key state to control: `resumedBanner === true` (use whatever test hook or state-force mechanism the file already uses) and `topicName` in `useLocalSearchParams` return.

```tsx
describe('resume banner copy (C5, copy sweep 2026-04-19)', () => {
  it('references the topic when topicName is present', async () => {
    // Arrange: mock useLocalSearchParams to return topicName = "prime numbers"
    // Arrange: cause resumedBanner to be true (mirror the existing approach
    // in this test file; the session resume-dialog path or a test-only prop).
    const { getByText, queryByText } = renderSessionWithResume({
      topicName: 'prime numbers',
      resumedBanner: true,
    });

    expect(getByText(/Welcome back — you were exploring prime numbers/i))
      .toBeTruthy();
    expect(queryByText(/your session is ready/i)).toBeNull();
  });

  it('falls back to generic copy when topicName is null', async () => {
    const { getByText, queryByText } = renderSessionWithResume({
      topicName: null,
      resumedBanner: true,
    });

    expect(getByText('Welcome back! Ready to keep going?')).toBeTruthy();
    expect(queryByText(/you were exploring/i)).toBeNull();
  });

  it('falls back to generic copy when topicName is undefined (hydration)', async () => {
    const { getByText, queryByText } = renderSessionWithResume({
      topicName: undefined,
      resumedBanner: true,
    });

    expect(getByText('Welcome back! Ready to keep going?')).toBeTruthy();
    expect(queryByText(/you were exploring/i)).toBeNull();
  });
});
```

**Implementation note on `renderSessionWithResume`:** This helper does not exist yet. Define it at the top of the new `describe` block (or reuse an existing render helper if one is already in the file). The helper should:
1. Mock `useLocalSearchParams` to return `{ topicName }` from the args.
2. Set initial `resumedBanner` state to `true` — either by forcing it via a test prop, or by triggering the resume flow, or by extracting the subtitle-computing logic into a pure helper and testing that. **Preferred:** extract the subtitle logic into a pure helper function (see Step 4); that lets the test call the function directly with known inputs and sidestep the render-setup complexity. See Step 4 for the helper shape.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/session/index.test.tsx" --no-coverage -t "resume banner copy"`
Expected: All three tests FAIL. If they fail because `renderSessionWithResume` doesn't exist, that's expected — it will be added in Step 4.

- [ ] **Step 4: Apply C5 source change + extract helper**

Edit `apps/mobile/src/app/(app)/session/index.tsx`.

Near the top of the file (or at the bottom, after the default export — match the file's existing style for helpers), add a pure helper and export it for test access:

```ts
export function getResumeBannerCopy(topicName: string | null | undefined): string {
  if (topicName && topicName.trim().length > 0) {
    return `Welcome back — you were exploring ${topicName}. Keep going?`;
  }
  return 'Welcome back! Ready to keep going?';
}
```

Replace the L1005–L1006 ternary branch. Currently:
```ts
: resumedBanner
? 'Welcome back - your session is ready.'
```
Change to:
```ts
: resumedBanner
? getResumeBannerCopy(topicName)
```

`topicName` is already in scope as a `useLocalSearchParams` destructured value (confirmed at L247) — no new import or prop is needed.

Now update the test file to import and use this helper directly:

```tsx
import { getResumeBannerCopy } from './index';

describe('getResumeBannerCopy (C5 resume banner, copy sweep 2026-04-19)', () => {
  it('references the topic when topicName is present', () => {
    expect(getResumeBannerCopy('prime numbers')).toBe(
      'Welcome back — you were exploring prime numbers. Keep going?'
    );
  });

  it('falls back to generic copy when topicName is null', () => {
    expect(getResumeBannerCopy(null)).toBe(
      'Welcome back! Ready to keep going?'
    );
  });

  it('falls back when topicName is undefined (hydration)', () => {
    expect(getResumeBannerCopy(undefined)).toBe(
      'Welcome back! Ready to keep going?'
    );
  });

  it('falls back when topicName is empty or whitespace-only', () => {
    expect(getResumeBannerCopy('')).toBe('Welcome back! Ready to keep going?');
    expect(getResumeBannerCopy('   ')).toBe(
      'Welcome back! Ready to keep going?'
    );
  });
});
```

**Replace the full-render tests from Step 2 with these pure-function tests.** The pure helper is easier to test and is the same function the render path uses, so coverage is preserved with less brittleness. This is the Failure-Modes-table "partial-hydration protection" case: if `topicName` is ever falsy (null, undefined, empty), the template is not rendered.

Note: the `index.tsx` file is an Expo Router page (default export = screen component). Named exports are allowed and do not break the route. Confirmed by existing exports elsewhere in the router tree.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/session/index.test.tsx" --no-coverage -t "getResumeBannerCopy"`
Expected: All four tests PASS.

- [ ] **Step 6: Run type check**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: Clean. `topicName` is typed `string | undefined` in the destructuring — our helper handles all nullability.

- [ ] **Step 7: Commit**

```bash
git add "apps/mobile/src/app/(app)/session/index.tsx" \
        "apps/mobile/src/app/(app)/session/index.test.tsx"
git commit -m "feat(mobile): proactivity copy C5 resume banner with topic + fallback [COPY-SWEEP]"
```

---

## Task 4: U1 — Continue card subtitle

**Files:**
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx:170`
- Test: `apps/mobile/src/components/home/LearnerScreen.test.tsx`

- [ ] **Step 1: Read existing LearnerScreen test to find Continue card test pattern**

Run: `grep -n "Continue\|continueSuggestion\|intent-continue" "apps/mobile/src/components/home/LearnerScreen.test.tsx" | head -30`
Expected: Identify how existing tests mock `useContinueSuggestion` and render the screen.

- [ ] **Step 2: Write failing behavior test for U1**

Append to `apps/mobile/src/components/home/LearnerScreen.test.tsx`. Mirror the existing mock setup for `useContinueSuggestion`.

```tsx
describe('Continue card subtitle (U1, copy sweep 2026-04-19)', () => {
  it('leads with the topic via "Pick up {topic}" and omits the subject label', () => {
    // Arrange: mock useContinueSuggestion to return a full suggestion record.
    mockContinueSuggestion({
      subjectId: 'sub-1',
      subjectName: 'Mathematics',
      topicId: 'topic-1',
      topicTitle: 'Addition and Subtraction of Whole Numbers',
      lastSessionId: 'sess-1',
    });

    const { getByTestId } = renderLearnerScreen();

    const card = getByTestId('intent-continue');
    const cardText = card.props.children ?? ''; // or serialize via toJSON()
    const asString = JSON.stringify(card);

    // Assert the new copy is rendered
    expect(asString).toContain(
      'Pick up Addition and Subtraction of Whole Numbers'
    );
    // Assert the old subject · topic format is gone
    expect(asString).not.toContain('Mathematics · Addition');
    expect(asString).not.toContain('Mathematics \u00b7 Addition');
  });
});
```

**Helper `mockContinueSuggestion` / `renderLearnerScreen`:** Use whatever mock/render pattern already exists in the file. If neither exists, look at `jest.mock('../../hooks/use-continue-suggestion', ...)` usage and copy the pattern from the closest existing test. The `intent-continue` testID is set by the card config at `LearnerScreen.tsx:168`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/components/home/LearnerScreen.test.tsx" --no-coverage -t "U1"`
Expected: FAIL — asserts `"Pick up ..."` but source still renders `"Mathematics · ..."`.

- [ ] **Step 4: Apply U1 source edit**

Edit `apps/mobile/src/components/home/LearnerScreen.tsx` at L170.

Replace:
```ts
subtitle: `${continueSuggestion.subjectName} \u00b7 ${continueSuggestion.topicTitle}`,
```
with:
```ts
subtitle: `Pick up ${continueSuggestion.topicTitle}`,
```

Do NOT modify the review-variant card at L195 — its subtitle ("N topics to review") is already action-oriented and explicitly out of U1's scope.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/components/home/LearnerScreen.test.tsx" --no-coverage -t "U1"`
Expected: PASS.

- [ ] **Step 6: Run type check**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: Clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/home/LearnerScreen.tsx \
        apps/mobile/src/components/home/LearnerScreen.test.tsx
git commit -m "feat(mobile): proactivity copy U1 Continue card topic-first [COPY-SWEEP]"
```

---

## Task 5: U2 — Homework camera permission copy

**Files:**
- Modify: `apps/mobile/src/app/(app)/homework/camera.tsx:558`
- Test: `apps/mobile/src/app/(app)/homework/camera.test.tsx`

- [ ] **Step 1: Read existing camera test to find the permission-screen render pattern**

Run: `grep -n "permission\|AI tutor\|photograph homework\|grant-permission-button" "apps/mobile/src/app/(app)/homework/camera.test.tsx" | head -20`
Expected: Find how the test forces the `permission` phase (before the user has granted camera access). Mock `useCameraPermissions` to return `[{ granted: false, canAskAgain: true }, requestPermission]` if not already present.

- [ ] **Step 2: Write failing behavior test for U2**

Append to `apps/mobile/src/app/(app)/homework/camera.test.tsx`:

```tsx
describe('camera permission copy (U2, copy sweep 2026-04-19)', () => {
  it('does not include the "AI tutor" jargon', () => {
    mockCameraPermission({ granted: false, canAskAgain: true });
    const { queryByText, getByText } = renderCameraScreen();

    // New first-person copy is present
    expect(
      getByText(
        /Snap a picture of your homework and I'll help you solve it step by step/i
      )
    ).toBeTruthy();
    // Old jargon is gone
    expect(queryByText(/AI tutor/i)).toBeNull();
    expect(queryByText(/photograph homework problems/i)).toBeNull();
  });
});
```

**If a mocked `useCameraPermissions` helper doesn't already exist in the file**, add one:

```tsx
import { useCameraPermissions } from 'expo-camera';
jest.mock('expo-camera', () => ({
  useCameraPermissions: jest.fn(),
  CameraView: 'CameraView',
}));
const mockCameraPermission = (perm: { granted: boolean; canAskAgain: boolean }) => {
  (useCameraPermissions as jest.Mock).mockReturnValue([perm, jest.fn()]);
};
```

If the test file already mocks `expo-camera` differently, mirror that approach instead of duplicating.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/homework/camera.test.tsx" --no-coverage -t "U2"`
Expected: FAIL — current source still has "AI tutor" string.

- [ ] **Step 4: Apply U2 source edit**

Edit `apps/mobile/src/app/(app)/homework/camera.tsx` at L556–L559. Replace the non-denied branch of the ternary:
```tsx
{denied
  ? 'Camera access was denied. You can enable it in your device settings to photograph homework problems.'
  : 'We need your camera to photograph homework problems so your AI tutor can help you work through them step by step.'}
```
with:
```tsx
{denied
  ? 'Camera access was denied. You can enable it in your device settings to photograph homework problems.'
  : "Snap a picture of your homework and I'll help you solve it step by step."}
```

Leave the `denied` branch unchanged — its copy is already clear and action-forward, and "AI tutor" isn't in it. The spec scopes U2 to the non-denied branch.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/homework/camera.test.tsx" --no-coverage -t "U2"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/src/app/(app)/homework/camera.tsx" \
        "apps/mobile/src/app/(app)/homework/camera.test.tsx"
git commit -m "feat(mobile): proactivity copy U2 camera screen no-jargon [COPY-SWEEP]"
```

---

## Task 6: Full mobile validation

**Files:** none modified — this is a verification task.

- [ ] **Step 1: Run the full mobile test suite for changed areas**

Run:
```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/components/session/sessionModeConfig.ts \
  "src/app/(app)/session/_helpers/use-subject-classification.ts" \
  "src/app/(app)/session/index.tsx" \
  src/components/home/LearnerScreen.tsx \
  "src/app/(app)/homework/camera.tsx" \
  --no-coverage
```
Expected: All tests pass. If any unexpected test fails (e.g., a snapshot or a test elsewhere that asserted one of the old strings we didn't catch), update it in the same PR and note it in the commit message.

- [ ] **Step 2: Run mobile lint**

Run: `pnpm exec nx lint mobile`
Expected: Clean. If the lint cache is stale and complains about module-boundaries spuriously, run `pnpm exec nx reset` and retry (per memory `feedback_nx_reset_before_commit.md`).

- [ ] **Step 3: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: Clean. Adding named exports to a router page file and exporting two const maps does not break any existing consumer.

- [ ] **Step 4: Manual web-preview smoke (optional but recommended)**

Start the preview:
```bash
# Or use the preview_start tool with the 'mobile' launch config per
# .claude/launch.json — the memory `project_expo_web_preview.md` has details.
```
Walk through the Ask flow as "TestKid" and verify:
- Placeholder shows "Ask me something" (C1)
- New-user greeting shows "Hi! Ask me anything." (C2) or classification-ack shows "Looks like {subject}." (C7)
- Returning-user greeting shows "Hey again — what are you curious about?" (C3/C6)
- Background-and-return session with a known topic shows the C5 template: "Welcome back — you were exploring {topic}. Keep going?"
- Home Continue card shows "Pick up {topic}" (U1)
- Homework camera permission screen no longer says "AI tutor" (U2)

Skip this step if no dev server is handy — the automated tests cover the copy assertions.

- [ ] **Step 5: Commit (only if validation produced any fixes)**

If Steps 1-4 required any follow-up fixes (stale snapshots, overlooked asserters), commit them:
```bash
git add -A
git commit -m "chore(mobile): validation fixes for copy sweep [COPY-SWEEP]"
```

If everything passed without changes, no commit needed.

---

## Verification Summary

| Finding ID | Fix | Verified By |
|---|---|---|
| C1 | `placeholder: 'Ask me something'` | `test: sessionModeConfig.test.ts:"C1: freeform placeholder is \"Ask me something\""` |
| C2 | `openingMessage: 'Hi! Ask me anything.'` | `test: sessionModeConfig.test.ts:"C2: freeform base openingMessage is \"Hi! Ask me anything.\""` |
| C3 | `EARLY_SESSIONS.freeform` rewritten | `test: sessionModeConfig.test.ts:"C3: EARLY_SESSIONS freeform greeting is the curiosity phrasing"` |
| C4 | `FAMILIAR_SESSIONS.freeform` rewritten | `test: sessionModeConfig.test.ts:"C4: FAMILIAR_SESSIONS freeform greeting matches C3"` |
| C5 | `getResumeBannerCopy` pure helper + source integration | `test: session/index.test.tsx:"getResumeBannerCopy"` (4 branches) |
| C6 | Both ternary branches rewritten | `test: use-subject-classification.test.ts:"uses the returning-user greeting when sessionExperience > 0"` (updated revert guard) |
| C7 | `Looks like ${subject}.` | `test: use-subject-classification.test.ts:"C7 subject classification ack is tentative"` |
| U1 | `Pick up ${topicTitle}` | `test: LearnerScreen.test.tsx:"leads with the topic via Pick up"` |
| U2 | First-person Snap-a-picture copy | `test: camera.test.tsx:"does not include the AI tutor jargon"` |

**Break tests:** None required — this sweep has no security, auth, or data-integrity surface. The verification-by-test column is correctness tests, not break tests. Per `~/.claude/CLAUDE.md`: break tests are required for CRITICAL/HIGH security fixes. Copy sweep is neither.

---

## Failure Modes Recap

Copied from spec for execution reference. If any of these happen during execution, stop and re-read the spec:

| State | Trigger | Learner sees | Recovery |
|---|---|---|---|
| C5 `topicName` is null | Session state missing topic | Fallback `"Welcome back! Ready to keep going?"` | `getResumeBannerCopy` null guard — tested in Task 3 |
| C5 topicName whitespace-only | Edge case | Fallback copy | Same null guard — tested |
| C7 classifier wrong | "Looks like Literature" when kid asked about rivers | Tentative phrasing invites correction | Tentative phrasing IS the recovery affordance |
| Ask-redesign lands first | C6 code path deleted | C6 edits become dead code | Accepted throwaway per spec's C6 section |

---

## Commits Expected

Five feature commits (one per task), optionally one validation-fix commit. All with `[COPY-SWEEP]` finding tag so `git log --grep='COPY-SWEEP'` reconstructs the sweep cleanly.

1. `feat(mobile): proactivity copy C1-C4 in sessionModeConfig [COPY-SWEEP]`
2. `feat(mobile): proactivity copy C6-C7 in use-subject-classification [COPY-SWEEP]`
3. `feat(mobile): proactivity copy C5 resume banner with topic + fallback [COPY-SWEEP]`
4. `feat(mobile): proactivity copy U1 Continue card topic-first [COPY-SWEEP]`
5. `feat(mobile): proactivity copy U2 camera screen no-jargon [COPY-SWEEP]`
6. *(optional)* `chore(mobile): validation fixes for copy sweep [COPY-SWEEP]`

---

## Out of Scope (do not expand the PR)

- LLM prompt text — belongs in Direction B, requires eval harness.
- `continueHint` natural-language field on `/v1/progress/continue` — API surface, deferred.
- Architectural fix for fake assistant bubbles (`isSystemPrompt: true` injection at `use-subject-classification.ts:364`) — separate spec.
- Book-picker copy (`/pick-book/:subjectId`) — LLM output, Direction B.
- Home-screen intent card label or subtitle copy — out of sweep.
- Any localization or i18n key extraction.
- A CI grep guard for "AI tutor" — spec explicitly rejects this; the durable fix is a copy registry + human review.
- Voice-mode copy — text mode only.

If reviewer asks for any of the above, point to the spec's "Out of Scope" section and the specific reason listed there.
