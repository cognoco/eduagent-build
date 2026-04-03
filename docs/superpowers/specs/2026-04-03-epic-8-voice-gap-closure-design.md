# Epic 8 Voice Mode — Gap Closure Design

Date: 2026-04-03
Status: Approved
Source: Code review findings in `docs/analysis/epic-7-8-code-review-findings.md`

## Scope

Close 4 of 5 open Epic 8 gaps identified in the code review. VoiceOver/TalkBack coexistence (Gap 5) is deferred — requires a physical-device spike.

| # | Gap | FR | Solution |
|---|-----|----|----------|
| 1 | Session `inputMode` persistence | FR144 | DB column + schema + API + mobile |
| 2 | Session-start voice choice UI | FR144 | Inline toggle on session screen |
| 3 | Pause/resume TTS | FR147 | Extend `useTextToSpeech` hook + VoicePlaybackBar |
| 4 | Haptic feedback on voice interactions | FR147, FR149 | Install `expo-haptics`, add to voice components |
| 5 | VoiceOver/TalkBack coexistence | FR149 | **DEFERRED** — needs physical device spike |

## Non-Goals

- Voice Activity Detection (VAD) — FR148, stretch goal, not in scope
- Streaming TTS (Option B) — documented upgrade path, not in scope
- Language/voice selection — English-only launch
- Rate persistence across sessions — session-scoped is sufficient per FR147

---

## Gap 1: Session `inputMode` Persistence

### Data Model

Add `inputMode` text column to `learningSessions` table, defaulting to `'text'`.

```sql
ALTER TABLE learning_sessions ADD COLUMN input_mode text NOT NULL DEFAULT 'text';
```

Valid values: `'text'` | `'voice'`

Using a text column (not a pgEnum) matches the existing pattern for `verificationType` — simple, no migration headache for adding future modes.

### Schema Changes

**`packages/schemas/src/sessions.ts`:**

```ts
export const inputModeSchema = z.enum(['text', 'voice']);
export type InputMode = z.infer<typeof inputModeSchema>;
```

Add `inputMode` to:
- `sessionStartSchema` — optional, defaults to `'text'`
- `learningSessionSchema` — required in response (always present on session record)

### Database Changes

**`packages/database/src/schema/sessions.ts`:**

Add to `learningSessions` table definition:
```ts
inputMode: text('input_mode').notNull().default('text'),
```

### API Changes

**`apps/api/src/services/session.ts`:**
- `startSession()` — pass `input.inputMode ?? 'text'` into `.values()`
- `mapSessionRow()` — include `inputMode` in returned `LearningSession`

**`apps/api/src/routes/sessions.ts`:**
- No changes needed — `sessionStartSchema` validation handles it automatically via `zValidator`

### Mobile Changes

**`apps/mobile/src/app/(learner)/session/index.tsx`:**
- Pass `inputMode` when calling `startSession.mutateAsync()` or the direct API client call
- Value comes from new voice mode toggle state (Gap 2)

---

## Gap 2: Session-Start Voice Choice UI

### Design

Add an inline "Text / Voice" segmented toggle directly in the session screen, visible before the first message is sent. Once the session has exchanges, the toggle is hidden (mid-session switching remains via the header VoiceToggle).

### Implementation

**`apps/mobile/src/app/(learner)/session/index.tsx`:**
- Add `inputMode` state: `useState<'text' | 'voice'>('text')`
- Render a `SessionInputModeToggle` component above the chat area when `messages.length <= 1` (only the opening AI message)
- Pass `inputMode` to `startSession` call
- Pass `inputMode === 'voice'` as the initial voice state to `ChatShell`

**New component: `apps/mobile/src/components/session/SessionInputModeToggle.tsx`:**

```tsx
interface SessionInputModeToggleProps {
  mode: 'text' | 'voice';
  onModeChange: (mode: 'text' | 'voice') => void;
}
```

- Two-segment pill: Text (keyboard icon) | Voice (mic icon)
- Active segment uses `bg-primary` with `text-text-inverse`
- Inactive uses `bg-surface-elevated` with `text-text-secondary`
- Min 44px touch targets, proper accessibility labels
- testID: `session-input-mode-toggle`

### ChatShell Integration

**`apps/mobile/src/components/session/ChatShell.tsx`:**
- Add `initialVoiceEnabled?: boolean` prop (replaces the `verificationType`-based default)
- Initialize `isVoiceEnabled` from `initialVoiceEnabled ?? false`
- Keep `verificationType` prop for badge display only

This decouples voice mode from verification type — voice can be used with any session type (FR144: "voice mode can be toggled at session start for any session type").

---

## Gap 3: Pause/Resume TTS

### expo-speech API

`expo-speech` (v55+) exposes `Speech.pause()` and `Speech.resume()`. These are native iOS/Android APIs that work correctly with `expo-speech`.

### Hook Changes

**`apps/mobile/src/hooks/use-text-to-speech.ts`:**

Add to the exported interface:
```ts
isPaused: boolean;
pause: () => void;
resume: () => void;
```

Implementation:
- `pause()`: calls `Speech.pause()`, sets `isPaused = true` (keeps `isSpeaking = true`)
- `resume()`: calls `Speech.resume()`, sets `isPaused = false`
- `stop()`: also resets `isPaused = false`
- `speak()`: also resets `isPaused = false`

### VoicePlaybackBar Changes

**`apps/mobile/src/components/session/VoicePlaybackBar.tsx`:**

Add props:
```ts
isPaused: boolean;
onPause: () => void;
onResume: () => void;
```

Replace the current stop-only button with a pause/resume toggle:
- When speaking and not paused → show **pause** button (icon: `pause`)
- When paused → show **resume** button (icon: `play`)
- Stop button always visible when speaking or paused (icon: `stop`)

Button layout when speaking: `[Replay] [Pause/Resume] [Stop] [Speed]`

Accessibility labels:
- Pause: `"Pause speaking"`
- Resume: `"Resume speaking"`
- Stop: `"Stop speaking"` (unchanged)

### ChatShell Integration

Wire `isPaused`, `pause`, `resume` from the hook to the VoicePlaybackBar props.

---

## Gap 4: Haptic Feedback

### Package

Install `expo-haptics` — standard Expo package, graceful no-op on unsupported devices and simulators.

### Trigger Points

| Action | Haptic Type | Reason |
|--------|------------|--------|
| Start recording (mic tap) | `impactAsync(ImpactFeedbackStyle.Light)` | Confirm recording started |
| Stop recording (mic tap) | `impactAsync(ImpactFeedbackStyle.Medium)` | Confirm recording stopped |
| Send voice transcript | `notificationAsync(NotificationFeedbackType.Success)` | Confirm message sent |
| Discard transcript | `impactAsync(ImpactFeedbackStyle.Light)` | Acknowledge discard |

### Implementation

Create a small utility to centralize haptic calls:

**`apps/mobile/src/lib/haptics.ts`:**
```ts
import * as Haptics from 'expo-haptics';

export function hapticLight(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticMedium(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticSuccess(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
```

Fire-and-forget (`void`) — haptics should never block UI or throw.

### Integration Points

- **`VoiceRecordButton.tsx`** — `hapticLight()` on press when starting, `hapticMedium()` on press when stopping
- **`VoiceTranscriptPreview`** (in `VoiceRecordButton.tsx`) — `hapticSuccess()` on Send press, `hapticLight()` on Discard press
- **`ChatShell.tsx`** — no changes needed (haptics fire from components, not the shell)

---

## Deferred: VoiceOver/TalkBack Coexistence (Gap 5)

Left as a TODO. The core challenge:
- iOS VoiceOver and Android TalkBack compete for the audio channel with app TTS
- Three documented approaches (defer to screen reader, audio ducking, manual play button)
- Requires physical device testing — simulators don't reproduce the conflict

**TODO location:** Add a comment block in `use-text-to-speech.ts` documenting the open spike.

---

## Files Changed (Summary)

### Packages
| File | Change |
|------|--------|
| `packages/database/src/schema/sessions.ts` | Add `inputMode` column to `learningSessions` |
| `packages/schemas/src/sessions.ts` | Add `inputModeSchema`, extend `sessionStartSchema` + `learningSessionSchema` |

### API
| File | Change |
|------|--------|
| `apps/api/src/services/session.ts` | Pass `inputMode` in `startSession()`, include in `mapSessionRow()` |

### Mobile
| File | Change |
|------|--------|
| `apps/mobile/package.json` | Add `expo-haptics` dependency |
| `apps/mobile/src/lib/haptics.ts` | **NEW** — haptic feedback utilities |
| `apps/mobile/src/hooks/use-text-to-speech.ts` | Add `pause()`, `resume()`, `isPaused` state |
| `apps/mobile/src/components/session/VoicePlaybackBar.tsx` | Add pause/resume button, new props |
| `apps/mobile/src/components/session/VoiceRecordButton.tsx` | Add haptic feedback on record/stop/send/discard |
| `apps/mobile/src/components/session/SessionInputModeToggle.tsx` | **NEW** — text/voice segmented toggle |
| `apps/mobile/src/components/session/ChatShell.tsx` | Add `initialVoiceEnabled` prop, wire pause/resume |
| `apps/mobile/src/app/(learner)/session/index.tsx` | Add input mode state, pass to startSession + ChatShell |

### Tests (update existing, add new)
| File | Change |
|------|--------|
| `apps/mobile/src/hooks/use-text-to-speech.test.ts` | Add pause/resume tests |
| `apps/mobile/src/components/session/VoicePlaybackBar.test.tsx` | Add pause/resume button tests |
| `apps/mobile/src/components/session/SessionInputModeToggle.test.tsx` | **NEW** — toggle component tests |
| `apps/mobile/src/lib/haptics.test.ts` | **NEW** — haptics utility tests |
| `apps/api/src/services/session.test.ts` | Add inputMode tests to startSession |
| `packages/schemas/src/sessions.test.ts` | Add inputMode validation tests |

---

## Migration Strategy

Use `drizzle-kit push` for dev (per project rules). The column has a default value (`'text'`), so it's backward-compatible — existing sessions get `'text'` automatically.

No data migration needed. No breaking API changes (field is optional on input, always present on output).
