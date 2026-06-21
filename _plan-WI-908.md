# WI-908 Plan

## Goal

Dictation playback must not silently fail or speak with the wrong voice when the device lacks a TTS voice for the dictation target language.

## Root Cause Hypothesis

`useDictationPlayback` sends `language` to `expo-speech` without checking `Speech.getAvailableVoicesAsync()`. On devices without a matching voice, Expo/native TTS may fall back to a different language voice or fail without a user-visible explanation.

## Acceptance Checks

1. Add a regression test that mocks no matching Speech voice for the dictation language, asserts no `Speech.speak()` call, and exposes a translated user-facing availability message.
2. Keep playback available when a matching voice exists, using the current chunking, pace, and navigation behavior.
3. Route new copy through `apps/mobile/src/i18n/locales/en.json`, then run the repo i18n checks required for new mobile copy.
4. Run focused mobile tests for the changed hook/screen and relevant lint/type checks before commit.

## Implementation Sketch

1. Extend `useDictationPlayback` with voice availability state and an async preflight before countdown/playback.
2. Match voices by exact BCP-47 language or base language prefix, case-insensitive.
3. Surface the unavailable state to the playback screen as translated copy and keep tap/repeat/skip controls from invoking speech while unavailable.
4. Add tests first, confirm the new regression fails, then implement the minimal hook/screen/i18n changes.
