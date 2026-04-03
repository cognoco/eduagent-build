# Epic 7 + Epic 8 Code Review Findings

Date: 2026-04-02
Updated: 2026-04-03
Source: extracted from the retired mixed gap-analysis document on 2026-04-02

## Status

This is a review snapshot, not an active gap tracker.

### Epic 7

Epic 7 is deferred to v1.1. All findings remain open — no code has been written.

- Prerequisite graph persistence is still missing. The current curriculum model is flat and does not store prerequisite edges, edge state, or prerequisite context.
- Curriculum sequencing is still `sortOrder`-based rather than prerequisite-aware.
- Skip/restore still works at whole-topic level instead of soft-skipping prerequisite edges.
- Graph-aware coaching and unlock-specific celebration/card behavior are still absent.
- The learner-facing concept-map, per-edge feedback, and prove-it override flows are still doc-only.

### Epic 8

**Addressed (2026-04-03, branch `fix/review-round-7`):**

- **Session `inputMode` persistence** — `inputMode` text column added to `learningSessions` table, `inputModeSchema` added to `@eduagent/schemas`, wired through `sessionStartSchema` (input) and `learningSessionSchema` (response), API `startSession()` and `mapSessionRow()` updated.
- **Session-start voice choice UI** — `SessionInputModeToggle` component (text/voice segmented pill) shown in message area before first exchange. `inputMode` state in session screen, passed to `startSession` and to `ChatShell` via `initialVoiceEnabled` prop.
- **Pause/resume TTS** — `useTextToSpeech` hook extended with `pause()`, `resume()`, `isPaused` state via `expo-speech` native API. `VoicePlaybackBar` updated with pause/resume button (icon toggles between pause/play).
- **Haptic feedback** — `expo-haptics` installed. `haptics.ts` utility with `hapticLight`/`hapticMedium`/`hapticSuccess`. Wired into `VoiceRecordButton` (start/stop recording) and `VoiceTranscriptPreview` (send/discard).
- **Speech-to-text wiring** — was already addressed (confirmed in initial review). `useSpeechRecognition` properly updates transcript from `expo-speech-recognition` events.

**Still open:**

- VoiceOver/TalkBack coexistence work remains open. Requires a physical-device spike (Story 8.4). TODO documented in `use-text-to-speech.ts`.

## Notes

- Voice playback, replay, speed controls, pause/resume, and haptics are all materially present.
- Design spec: `docs/superpowers/specs/2026-04-03-epic-8-voice-gap-closure-design.md`
- The original detailed evidence lived in `docs/analysis/epics-vs-code-gap-analysis.md`, which was retired because it had become a stale mixed document.
