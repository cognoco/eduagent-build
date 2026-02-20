# Homework Camera Capture — Design Document

**Date:** 2026-02-19
**Story:** 2.5 (Homework Entry, Camera Capture & OCR)
**Scope:** Camera UI + on-device OCR. No server-side fallback (deferred).
**FRs:** FR30, FR32, FR33 | **UX:** UX-1, UX-2 | **ARCH:** ARCH-14

---

## Overview

Full-screen camera component for photographing homework problems. Captures image, runs on-device OCR via Google ML Kit v2, presents extracted text for user confirmation/editing, then navigates to a homework session with the problem text.

Lives at `apps/mobile/src/app/(learner)/homework/camera.tsx` as a hidden tab route (same pattern as `session` and `onboarding`).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Camera library | `expo-camera` (`CameraView`) | Custom overlay for Snapchat-style full-screen capture. UX spec requires capture guide, custom controls. |
| OCR library | `@react-native-ml-kit/text-recognition` v2.0.0 | On-device, actively maintained (published 5mo ago), wraps ML Kit v2 (handwriting support). Replaces `react-native-mlkit-ocr` which is 3yr unmaintained and uses v1. |
| Route location | `(learner)/homework/camera.tsx` | Hidden tab with `href: null` + `tabBarStyle: { display: 'none' }`. Full-screen, no navigation chrome. Same pattern as session screen. |
| State management | `useReducer` (local) | Pure state machine, no external state library. Testable as pure function. |
| Subject selection | Per-subject homework button on home screen (Option A) | Fewer taps, subject pre-selected. Aligns with "speed is survival" (UX Decision 7). |
| Image stability | Copy to `cacheDirectory` before navigation | iOS temp URIs from `takePictureAsync()` may not survive navigation. `FileSystem.cacheDirectory` is app-scoped and survives across screens. |
| Problem text delivery | Auto-sent as first user message in session | Avoids awkward math-in-conversation quoting. AI sees raw problem text as input. User sees it as their own message. |

## New Dependencies

| Package | Purpose | Notes |
|---------|---------|-------|
| `expo-camera` | Camera viewfinder + capture | Requires Expo config plugin for permissions. EAS dev client only (no Expo Go). |
| `@react-native-ml-kit/text-recognition` | On-device OCR (ML Kit v2) | Native module, EAS dev client only. Not supported in iOS simulator — device testing required. |
| `expo-image-manipulator` | Resize image before OCR | Already available in Expo SDK 54. |
| `expo-file-system` | Copy image to stable cache path | Already available in Expo SDK 54. |

## State Machine

Six states managed by a pure reducer:

```
permission → viewfinder → preview ⇄ processing → result → (navigate to session)
                ↑            ↑           ↓
                │            │         error
                │            │           ↓
                │            ├─ retry (same image, < 2 fails)
                │            │           ↓
                │            └─ type-instead (≥ 2 fails)
                │
                └──────── retake (from preview, result, or error)
```

### States

| State | Renders | Transitions |
|-------|---------|-------------|
| `permission` | Permission request screen with rationale | → `viewfinder` (granted) or show denied message with Settings link |
| `viewfinder` | Live camera feed + capture guide overlay + capture/flash/close buttons | → `preview` (photo taken) |
| `preview` | Frozen captured image + Retake / Use buttons | → `processing` (confirm) or → `viewfinder` (retake) |
| `processing` | Dimmed image + skeleton shimmer (3 lines: 100%/80%/60% width) + "Reading your homework..." | → `result` (OCR success) or → `error` (OCR failure) |
| `result` | Extracted text in immediately-editable TextInput + Retake / Let's go buttons | → session navigation (confirm) or → `viewfinder` (retake) |
| `error` | Error message + retry/retake options. After ≥ 2 failures: TextInput fallback ("type it out instead") | → `preview` (retry same image) or → `viewfinder` (retake) or → session navigation (typed text) |

### Reducer Actions

```ts
type CameraAction =
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'PHOTO_TAKEN'; uri: string }
  | { type: 'CONFIRM_PHOTO' }
  | { type: 'RETAKE' }
  | { type: 'OCR_SUCCESS'; text: string }
  | { type: 'OCR_ERROR'; message: string }
  | { type: 'RETRY_OCR' };
```

## UI Layout

### Viewfinder

Full-bleed camera, no safe area insets at top. Controls overlay the feed.

- Close button: 48x48 pressable area, **top-left** with semi-transparent background (`bg-black/40`). Follows iOS/Android camera app convention — separates dismiss from capture action to prevent accidental close.
- Capture guide: dashed `border-primary/60` rectangle centered on screen
- Helper text: "Center your homework" inside guide
- Capture button: 64px circle, `bg-primary`, centered bottom
- Flash toggle: 48x48 pressable area (icon 24px + padding), bottom-left
- All touch targets minimum 48px per Android accessibility guidelines

### Preview

- Captured image displayed full-width
- Two action buttons bottom-aligned: "Retake" (secondary) and "Use this" (primary, `bg-primary`)

### Processing

- Captured image dimmed (opacity overlay)
- Skeleton shimmer: 3 lines of varying width (100%, 80%, 60%) using `bg-surface-elevated` with animated opacity
- Status text: "Reading your [subjectName] homework..." using `text-text-secondary`

### Result

- Header: `← Back` (left-aligned, no Edit button)
- Label: "Here's what I see:" in `text-text-secondary`
- TextInput: immediately editable, `bg-surface` `rounded-card`, multiline. No read-only gate — OCR errors on math content are expected.
- Two action buttons: "Retake" (secondary) and "Let's go" (primary)

### Error (≥ 2 failures)

- Message: "Hmm, I'm having trouble reading that." (learner tone — direct, solution-focused)
- TextInput fallback: "Type your problem here..."
- Two actions: "Try camera again" and "Continue →"

### Styling Rules

- All colors via NativeWind semantic classes (`bg-background`, `bg-surface`, `text-primary`, `bg-primary`)
- Persona-unaware — theming via CSS variables at root layout
- `rounded-button` and `rounded-card` tokens for border radius
- No hardcoded hex values

## OCR Integration

### Hook: `useHomeworkOcr`

Isolated hook that wraps ML Kit text recognition. Component calls the hook; hook manages OCR lifecycle.

```
camera.tsx (UI + state machine)
  └── useHomeworkOcr() → { text, status, error, failCount, retry, process }
        └── @react-native-ml-kit/text-recognition
```

#### API

| Return | Type | Purpose |
|--------|------|---------|
| `text` | `string \| null` | Extracted text, null until ready |
| `status` | `'idle' \| 'processing' \| 'done' \| 'error'` | Current OCR state |
| `error` | `string \| null` | Error message if failed |
| `failCount` | `number` | Consecutive failures (drives ≥ 2 fallback logic) |
| `retry` | `() => void` | Re-run OCR on **same image**. Does NOT reset failCount. |
| `process` | `(uri: string) => void` | Trigger OCR on a **new image**. Resets all state including failCount. |

#### Pipeline

1. Receive image URI from `CameraView.takePictureAsync()`
2. Copy to stable cache path via `expo-file-system` (`cacheDirectory/homework-{timestamp}.jpg`)
3. Resize to max 1024px width via `expo-image-manipulator` (saves memory, improves ML Kit performance)
4. Call `TextRecognition.recognize(resizedUri)`
5. If result text is empty string or whitespace-only → treat as failure
6. Otherwise → return extracted text

#### failCount Semantics (Critical Invariant)

- `retry()` re-runs OCR on the same image. **Does NOT reset `failCount`**. This ensures consecutive failures accumulate toward the ≥ 2 threshold even across retries.
- `process(newUri)` processes a new image. **Resets all state including `failCount`**. A new photo is a fresh attempt.
- On component unmount (navigate away), hook state is destroyed. Next camera visit starts fresh.

#### Error Handling

| Scenario | Hook behavior | User sees |
|----------|---------------|-----------|
| OCR returns text | status → `done`, text populated | Result state with editable text |
| OCR returns empty/whitespace | status → `error`, failCount++ | "Couldn't make that out" + retry or retake |
| OCR throws exception | status → `error`, failCount++ | "Something went wrong reading that" |
| failCount ≥ 2 | error state includes typing fallback | "Want to type it out instead?" + TextInput |
| Camera permission denied | Stays in permission state | Rationale + Settings link |

#### No Timeout

ML Kit v2 on-device is sub-second for printed text, 1-2s for handwriting. A timeout would only trigger on a genuine crash, and `try/catch` handles that. **Revisit if cloud OCR fallback is added** — network calls need timeouts.

### Handwriting & Math Limitations

ML Kit v2 handles printed text and basic handwriting well. Mathematical notation (fractions, exponents, Greek letters, complex expressions) is its weak point. The "type it out instead" fallback is not just error recovery — it's an **expected path for equations**. Design and test flows assuming some percentage of homework will be typed manually.

## Navigation & Data Flow

### Entry Point

Home screen → per-subject homework button → camera.

The home screen (`home.tsx`) already loads and renders subjects. Each subject card gets a homework action icon/button that navigates to:

```
/(learner)/homework/camera?subjectId={id}&subjectName={name}
```

### Params IN (to camera)

| Param | Type | Required | Source |
|-------|------|----------|--------|
| `subjectId` | `string` | Yes | From subject list on home screen |
| `subjectName` | `string` | Yes | **Display only** — shown in processing state. Not canonical, not used for logic. |

### Params OUT (camera → session)

On confirm (OCR text or manually typed):

```ts
router.replace({
  pathname: '/(learner)/session',
  params: {
    mode: 'homework',
    subjectId,
    subjectName,
    problemText,  // OCR result or manually typed
    imageUri,     // Stable cache URI. Undefined if user typed manually.
  },
});
```

**`router.replace`, not `router.push`** — the camera is a transient capture step. Back from session should go to home, not a stale camera screen.

### Session Integration

The session screen receives `problemText` and auto-sends it as the first user message:

```
AI:  "Got it. Let's work through this together."
User (auto-sent): [problemText]
AI:  "I see — a quadratic equation. What do you think the first step is?"
```

This avoids quoting raw math in a conversational wrapper and lets the AI handle the problem text as structured input.

### Layout Registration

Add to `(learner)/_layout.tsx`:

```tsx
<Tabs.Screen
  name="homework"
  options={{
    href: null,
    tabBarStyle: { display: 'none' },
  }}
/>
```

## File Structure

```
apps/mobile/src/
  app/(learner)/
    homework/
      camera.tsx                    # Component — UI + state machine
      camera-reducer.ts             # Pure reducer (extracted for testability)
      camera-reducer.test.ts        # All state transitions
      camera.test.tsx               # Shallow render, navigation, state
  hooks/
    use-homework-ocr.ts             # OCR hook
    use-homework-ocr.test.ts        # Mock ML Kit, test all states
```

## Testing Strategy

### Unit-testable (Jest)

| What | Coverage | File |
|------|----------|------|
| State machine reducer | All 6 states, all transitions, edge cases (retake from result, error→type-instead) | `camera-reducer.test.ts` |
| `useHomeworkOcr` hook | `process()` → success, `process()` → error, `retry()` does NOT reset failCount, `process(newUri)` DOES reset failCount, failCount ≥ 2 triggers fallback, empty OCR result treated as error | `use-homework-ocr.test.ts` |
| Image resize utility | Verify `manipulateAsync` called with max 1024px width, quality 0.8 | Inline in hook test |
| Navigation params | `router.replace` called with correct params on confirm, `router.back` on close | `camera.test.tsx` |

#### Critical Test: failCount Invariant

```
retry() on same image after error:    failCount 1 → 1 (NOT reset)
retry() on same image after 2nd error: failCount 2 → 2 (triggers fallback)
process(newUri) after failures:         failCount → 0 (full reset)
```

This invariant drives the entire fallback logic and is easy to break during refactoring. Explicit test coverage required.

### Not Unit-testable (Device/E2E)

| What | Why | Validation |
|------|-----|------------|
| Actual camera feed | Native module | Manual device testing |
| ML Kit OCR accuracy | Requires real model + images | Device test with sample worksheets (printed + handwritten) |
| Permission flow | OS-level dialog | Manual + Maestro (ARCH-24) |
| Image URI stability | OS file system behavior | Manual iOS + Android verification |

### E2E Priority Flows (for ARCH-24 Maestro spike)

When E2E testing is set up, these two flows give the most confidence:

1. **Permission flow** — deny → rationale shown → grant → camera opens
2. **Capture → OCR → session navigation** — full happy path end-to-end

### What We're NOT Testing

- No snapshot tests (fragile, low value for camera UI)
- No visual regression (no Storybook)
- No E2E in this pass (deferred to ARCH-24)

## Future Enhancements (Not in Scope)

- **Server-side OCR fallback** at `/v1/ocr` (ARCH-14 second path) — add when on-device fails systematically
- **Post-capture subject classification** — OCR text analyzed to auto-suggest subject instead of pre-selecting. Reduces friction for ambiguous worksheets.
- **Mid-session "add photo" button** — take additional photos during an active homework session
- **Cloud OCR timeout** — add when server fallback is wired (on-device needs no timeout)
- **Math notation rendering** — display recognized math in formatted form (KaTeX/MathJax) in the result state
