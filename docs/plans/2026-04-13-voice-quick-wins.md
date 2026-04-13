# Voice Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two targeted improvements to the voice experience that are independently implementable, low-risk, and high-impact. Each can be committed separately.

**Architecture:** Both changes are confined to existing files. No new packages, no schema changes, no migrations, no new routes. Item 1 touches one mobile screen. Item 2 touches one API service plus its test file.

**Spec context:** Epic 17 Phase B (Voice Output) explicitly includes "voice-optimised LLM prompts" (FR256-FR257) as a planned story. Item 2 here is the minimal version of that story — a single conditional block — appropriate to ship now without waiting for full Phase B. Item 1 (voice persistence) is a gap not yet addressed anywhere in the epic 17 plan.

**Tech Stack:** Expo / React Native (SecureStore via `src/lib/secure-storage.ts`), TypeScript, Jest + React Native Testing Library.

---

## PART 1 — Voice Mode Persistence Across Sessions

**Problem:** `inputMode` is initialised to `'text'` every time the session screen mounts (line 405 of `index.tsx`). Users who prefer voice must re-select it every session. This creates attrition — voice-preferring users revert to text.

**Solution:** On mount, read the last-saved `inputMode` from SecureStore and use it as the initial value. On every mode change, persist the new value.

**Scope:** One modified file + one co-located test file.

---

### Task 1: Persist and restore voice mode preference

**Files:**
- Modify: `apps/mobile/src/app/(app)/session/index.tsx`
- Modify: `apps/mobile/src/app/(app)/session/index.test.tsx`

#### Storage key

```typescript
// Key is profile-scoped. Uses only Expo-safe characters: letters, numbers, hyphens, dots.
const inputModeKey = (profileId: string) => `voice-input-mode-${profileId}`;
```

`voice-input-mode-{profileId}` — letters, numbers, and hyphens only. Safe for SecureStore on all platforms.

#### Implementation steps

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/app/(app)/session/index.test.tsx` inside the existing `describe('SessionScreen')` block (or at top-level if the file uses flat `it` blocks):

```typescript
describe('voice mode persistence', () => {
  it('defaults to voice when SecureStore has voice preference', async () => {
    // Pre-seed the store with a saved voice preference
    secureStore['voice-input-mode-profile-1'] = 'voice';

    // Render without a routeSessionId — new session flow
    const { getByTestId } = render(<SessionScreen />, { wrapper: Wrapper });

    // The voice button in the SessionInputModeToggle should be selected
    await waitFor(() => {
      const voiceBtn = getByTestId('input-mode-voice');
      expect(voiceBtn.props.accessibilityState?.selected).toBe(true);
    });
  });

  it('defaults to text when SecureStore has no preference', async () => {
    // No entry in store

    const { getByTestId } = render(<SessionScreen />, { wrapper: Wrapper });

    await waitFor(() => {
      const textBtn = getByTestId('input-mode-text');
      expect(textBtn.props.accessibilityState?.selected).toBe(true);
    });
  });

  it('persists voice preference when mode changes to voice', async () => {
    const { getByTestId } = render(<SessionScreen />, { wrapper: Wrapper });

    await act(async () => {
      fireEvent.press(getByTestId('input-mode-voice'));
    });

    await waitFor(() => {
      expect(secureStore['voice-input-mode-profile-1']).toBe('voice');
    });
  });

  it('persists text preference when mode changes to text', async () => {
    secureStore['voice-input-mode-profile-1'] = 'voice'; // start in voice

    const { getByTestId } = render(<SessionScreen />, { wrapper: Wrapper });

    await act(async () => {
      fireEvent.press(getByTestId('input-mode-text'));
    });

    await waitFor(() => {
      expect(secureStore['voice-input-mode-profile-1']).toBe('text');
    });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/session/index.tsx --no-coverage 2>&1 | tail -30
```

Expected: FAIL — voice mode tests do not pass yet.

- [ ] **Step 3: Add import for SecureStore**

In `apps/mobile/src/app/(app)/session/index.tsx`, the file already imports from `'../../../lib/session-recovery'` which uses `SecureStore`. Add the direct import alongside it:

```typescript
import * as SecureStore from '../../../lib/secure-storage';
```

Note: `secure-storage.ts` is the platform-aware wrapper at `apps/mobile/src/lib/secure-storage.ts`. Do NOT import `expo-secure-store` directly.

- [ ] **Step 4: Add the storage key constant**

Add near the top of the file, after the existing utility functions (around line 100, after `computePaceMultiplier`):

```typescript
/** SecureStore key for persisting voice/text input mode preference per profile. */
const getInputModeKey = (profileId: string) =>
  `voice-input-mode-${profileId}`;
```

- [ ] **Step 5: Load the persisted preference on mount**

The current `inputMode` state is initialised synchronously to `'text'` (line 405):

```typescript
const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
```

Replace it with an async bootstrap effect. Add a `useEffect` that reads from SecureStore immediately after mount — before any session activity. Insert it after the state declaration:

```typescript
const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');

// Restore the user's last-used input mode from SecureStore on mount.
// Only runs once — a resumed session (routeSessionId) overrides this at line 658.
useEffect(() => {
  if (!activeProfile?.id) return;
  let cancelled = false;
  void SecureStore.getItemAsync(getInputModeKey(activeProfile.id)).then(
    (stored) => {
      if (cancelled) return;
      if (stored === 'voice' || stored === 'text') {
        setInputMode(stored);
      }
    }
  );
  return () => {
    cancelled = true;
  };
}, [activeProfile?.id]);
```

**Important:** The effect depends only on `activeProfile?.id`. The resumed-session path (around line 658) already calls `setInputMode(transcript.data.session.inputMode ?? 'text')` — that overrides this preference correctly when resuming an existing session. The preference restore runs first, and the transcript hydration effect runs second (it depends on `transcript.data` being non-null), so there is no race.

- [ ] **Step 6: Persist the preference when mode changes**

The existing `handleInputModeChange` callback (around line 919) already saves the mode to the server via `setSessionInputMode`. Add a SecureStore write here too:

```typescript
const handleInputModeChange = useCallback(
  (nextInputMode: 'text' | 'voice') => {
    const previousInputMode = inputMode;
    setInputMode(nextInputMode);

    // Persist preference so next session restores it.
    if (activeProfile?.id) {
      void SecureStore.setItemAsync(
        getInputModeKey(activeProfile.id),
        nextInputMode
      );
    }

    if (!activeSessionId) {
      return;
    }
    void setSessionInputMode
      .mutateAsync({ inputMode: nextInputMode })
      .catch(() => {
        setInputMode(previousInputMode);
        showConfirmation("Couldn't save that mode just now.");
      });
  },
  [activeProfile?.id, activeSessionId, inputMode, setSessionInputMode, showConfirmation]
);
```

**Also** persist when the `SessionInputModeToggle` calls `setInputMode` directly (around line 2715). The toggle is shown only before the first exchange (`userMessageCount === 0`). At that point `handleInputModeChange` is not wired — `onModeChange={setInputMode}` is passed directly. Change this to use `handleInputModeChange` so persistence fires there too:

```tsx
{userMessageCount === 0 && (
  <SessionInputModeToggle
    mode={inputMode}
    onModeChange={handleInputModeChange}
  />
)}
```

- [ ] **Step 7: Run the test to confirm it passes**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/session/index.tsx --no-coverage 2>&1 | tail -30
```

Expected: PASS — all four persistence tests green.

- [ ] **Step 8: TypeCheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

Expected: no new errors.

---

## PART 2 — Voice-Optimized LLM Prompting (50-word cap)

**Problem:** When `inputMode === 'voice'`, the LLM gives paragraph-length responses. At ~150 words per minute for TTS, a 100-word response takes ~40 seconds to speak. This kills conversational rhythm. Voice sessions should feel like talking, not listening to a lecture.

**Solution:** Add a conditional block in `buildSystemPrompt()` that, when `inputMode === 'voice'`, instructs the LLM to keep responses under 50 words and favour a spoken-word register.

**Scope:** Two modified files — `exchanges.ts` (service) and `exchanges.test.ts` (tests). No schema change needed: `ExchangeContext` does not yet carry `inputMode`, so we add the optional field there too (this was already noted as a prep item in the Epic 17 Phase A plan, modified file #25).

---

### Task 2: Voice-optimized prompt in buildSystemPrompt

**Files:**
- Modify: `apps/api/src/services/exchanges.ts`
- Modify: `apps/api/src/services/exchanges.test.ts`

#### Exact prompt text

```
VOICE MODE: The learner is using voice. Keep every response under 50 words. Use natural spoken language — no bullet lists, no markdown, no headers. One idea at a time. Ask one question max per turn. Write as you would speak aloud.
```

The cap of 50 words is calibrated for ~20 seconds of TTS at a comfortable 140–150 wpm, which keeps conversational turn-taking fast enough for children to stay engaged.

#### Implementation steps

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/services/exchanges.test.ts` inside the `describe('buildSystemPrompt')` block:

```typescript
it('includes voice-mode brevity constraint when inputMode is voice', () => {
  const prompt = buildSystemPrompt({ ...baseContext, inputMode: 'voice' });
  expect(prompt).toContain('VOICE MODE');
  expect(prompt).toContain('50 words');
  expect(prompt).toContain('spoken language');
});

it('does not include voice-mode constraint when inputMode is text', () => {
  const prompt = buildSystemPrompt({ ...baseContext, inputMode: 'text' });
  expect(prompt).not.toContain('VOICE MODE');
});

it('does not include voice-mode constraint when inputMode is undefined', () => {
  const prompt = buildSystemPrompt(baseContext); // baseContext has no inputMode
  expect(prompt).not.toContain('VOICE MODE');
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
pnpm exec nx run api:test --testPathPattern=exchanges 2>&1 | tail -20
```

Expected: FAIL — `VOICE MODE` not found in prompt.

- [ ] **Step 3: Add `inputMode` to `ExchangeContext`**

In `apps/api/src/services/exchanges.ts`, add the optional field to the `ExchangeContext` interface after `rawInput`:

```typescript
/** Original free-text input the learner typed when starting this session (CFLF) */
rawInput?: string | null;
/** Input mode for this session — controls voice-optimized brevity in the system prompt */
inputMode?: 'text' | 'voice';
```

- [ ] **Step 4: Add the voice-mode prompt block in `buildSystemPrompt`**

In `buildSystemPrompt`, add the voice brevity block immediately before `return sections.join('\n\n')` (currently at line 464). Insert after the "Not Yet" framing block:

```typescript
// Voice-mode brevity constraint — shorter responses for spoken output (FR256)
if (context.inputMode === 'voice') {
  sections.push(
    'VOICE MODE: The learner is using voice. Keep every response under 50 words. ' +
      'Use natural spoken language — no bullet lists, no markdown, no headers. ' +
      'One idea at a time. Ask one question max per turn. ' +
      'Write as you would speak aloud.'
  );
}

return sections.join('\n\n');
```

- [ ] **Step 5: Wire `inputMode` into `ExchangeContext` in session.ts**

In `apps/api/src/services/session.ts`, the `ExchangeContext` is built at line 1194. Add `inputMode` to the context object:

```typescript
const context: ExchangeContext = {
  sessionId,
  profileId,
  // ... existing fields ...
  rawInput: session.rawInput,
  inputMode: session.inputMode as 'text' | 'voice' | undefined,
};
```

`session.inputMode` is already stored on the DB row and retrieved in `mapSession` (line 522-530). No migration needed.

- [ ] **Step 6: Run the test to confirm it passes**

```bash
pnpm exec nx run api:test --testPathPattern=exchanges 2>&1 | tail -20
```

Expected: PASS — all three new voice prompt tests green, all existing tests still green.

- [ ] **Step 7: Run full API tests to check for regressions**

```bash
pnpm exec nx run api:test --no-coverage 2>&1 | tail -30
```

Expected: no failures introduced.

- [ ] **Step 8: TypeCheck the API**

```bash
pnpm exec nx run api:typecheck 2>&1 | grep "error TS" | head -20
```

Expected: no errors.

---

## Verification Summary

| Item | Change | Verified by |
|------|--------|-------------|
| 1 — Voice persistence | `inputMode` read from SecureStore on mount | `test: index.test.tsx:"voice mode persistence"` — 4 test cases |
| 1 — Toggle wires to handleInputModeChange | `SessionInputModeToggle.onModeChange` → `handleInputModeChange` | included in persistence tests above |
| 2 — `inputMode` on `ExchangeContext` | New optional field | `test: exchanges.test.ts:"includes voice-mode brevity..."` |
| 2 — Prompt block injected | Voice brevity section in prompt | same test file, 3 cases |
| 2 — `inputMode` wired in `session.ts` | Context carries session's inputMode | manual: no typecheck errors, existing session tests pass |

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| SecureStore read fails (Item 1) | Device storage error or permission issue | Silent — preference defaults to `'text'` | User re-selects voice; `getItemAsync` errors are swallowed (non-critical preference only) |
| Preference not yet written (first session) | New install / cleared storage | Defaults to `'text'` (current behaviour) | User selects voice once; it persists for all future sessions |
| Resumed session overrides preference (Item 1) | User resumes a text session after a voice session | Mode switches to text — expected | If user wants voice, they tap the toggle; it persists going forward |
| Voice prompt makes LLM ignore 50-word cap (Item 2) | LLM does not follow system prompt instruction | Response may be longer than 50 words | LLM instructions are best-effort; cap is a strong hint, not a hard truncation. Future work can add server-side truncation at ~80 words as a safety net |
| LLM omits structured markers under 50-word cap (Item 2) | `[NEEDS_DEEPENING]`, `[PARTIAL_PROGRESS]`, note prompt JSON stripped by brevity | Markers may be omitted from short responses | These markers are already optional (detect with `includes` not asserted). No user-visible impact. |
| `inputMode` is null in DB (Item 2) | Pre-Epic 8 sessions or DB rows without the column | `inputMode` is `undefined`, prompt block skipped | `undefined` correctly skips the voice block; text prompt is returned (safe default) |

---

## Commit Order

Commit these as two separate commits to make revert clean:

1. `fix(mobile): persist voice input mode preference across sessions [EP17-QUICK-1]`
2. `fix(api): add voice-mode brevity constraint to LLM system prompt [EP17-QUICK-2]`

Both are independently revertable and independently deployable.
