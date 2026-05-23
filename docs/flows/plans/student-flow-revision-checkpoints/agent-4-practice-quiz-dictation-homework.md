# Agent 4 Checkpoint - Practice, Quiz, Dictation, Homework

Date: 2026-05-22
Branch: i18n-translations
HEAD: ae5cacc8a
API target: https://api-stg.mentomate.com
Preview: http://127.0.0.1:19006

## Scope

- Batch 5: PRACTICE-01..04, QUIZ-01..13, DICT-01..10
- Batch 6: HOMEWORK-01..07

## Status

- Read the student revision plan, student access inventory, mobile flow inventory, and 2026-05-21 navigation contract.
- Mapped scoped flows to practice, quiz, dictation, homework, session, home, and More source files.
- Used source inspection and existing E2E/Maestro inventory. No full authenticated browser setup or full suites were run because the shared setup had already hit a session-expired return to sign-in and the coordinator requested no parallel full setup/suites.

## Findings To File In Notion

### QUIZ-09 - Quiz history back button ignores Practice return target

Priority: P3
Platform: Mobile Web, iOS, Android
Notion: https://www.notion.so/QUIZ-09-Quiz-history-back-button-ignores-Practice-return-target-3688bce91f7c817e9bf8f113282ff828

Repro:
1. From Study, open Practice.
2. Open quiz history with completed quiz rounds.
3. Tap the history screen back button.

Expected:
- Because Practice opens history with `returnTo=practice`, the user returns to the Practice hub.

Actual:
- The populated history screen always calls `goBackOrReplace(router, '/(app)/quiz')`, sending the user to Quiz instead of Practice.
- Loading, empty, and error states already respect the Practice return target, so this only breaks once history has rows.

Evidence:
- `apps/mobile/src/app/(app)/quiz/history.tsx` computes `backHref` from `returnTo=practice`.
- The loaded list back button ignores that value and hardcodes `/(app)/quiz`.

### HOMEWORK-01 - More screen has no homework entry point

Priority: P2
Platform: Mobile Web, iOS, Android
Notion: https://www.notion.so/HOMEWORK-01-More-screen-has-no-homework-entry-point-3688bce91f7c81a2ae30c90587fbd3bd

Correction 2026-05-22: Product clarified that Homework was never intended to be surfaced from More. This finding is obsolete and should be treated as stale inventory/doc drift, not an app bug.

Repro:
1. Open Study.
2. Go to More.
3. Look for a homework/help-with-assignment entry point.

Expected:
- Per corrected product direction, homework starts from learner home. It is not surfaced from More.

Actual:
- Learner home has a homework quick action. More has no homework row/button, which is expected.

Evidence:
- `apps/mobile/src/components/home/LearnerScreen.tsx` exposes `home-action-homework`.
- `apps/mobile/src/app/(app)/more/index.tsx` renders settings/help/account rows but no homework route.

### HOMEWORK-06 - Homework image attachment can silently fall back to text-only

Priority: P2
Platform: Mobile Web, iOS, Android
Notion: https://www.notion.so/HOMEWORK-06-Homework-image-attachment-can-silently-fall-back-to-text-only-3688bce91f7c812a80e1c7392b0f1e0c

Repro:
1. Start homework from camera/gallery with an image attachment.
2. Hit a slow or failed image-to-base64 conversion path, such as a large image or web URI issue.
3. Let the homework session auto-send the initial problem.

Expected:
- The image pass-through branch either attaches the image to the multimodal homework request or gives the learner a visible recovery path.

Actual:
- After a 2.5s conversion timeout or conversion failure, the auto-send proceeds with `attachImage: false`.
- The learner sees no warning that the photo was dropped, so a photo-based homework request can become a text-only request.

Evidence:
- `apps/mobile/src/app/(app)/session/_hooks/use-image-base64.ts` marks conversion as `timeout` after 2.5s and leaves refs null on timeout/failure.
- `apps/mobile/src/app/(app)/session/index.tsx` only waits while status is `loading`, then sends with `attachImage` true only when status is `ready`.
- `apps/mobile/src/components/session/use-subject-classification.ts` only includes the image attachment when refs are populated.

### DICT-06 - Dictation review timeout can still be overridden by a late response

Priority: P3
Platform: Mobile Web, iOS, Android
Notion: https://www.notion.so/DICT-06-Dictation-review-timeout-can-still-be-overridden-by-a-late-response-3688bce91f7c81f2b289c06b33794163

Repro:
1. Finish a dictation and tap Check my writing.
2. Let the review request exceed the 20s timeout.
3. Wait without tapping Retry or Cancel.

Expected:
- The timeout state remains under learner control, and a late response does not navigate away unless the learner retries.

Actual:
- The timeout only sets `reviewTimedOut`. It does not mark the in-flight request as cancelled.
- A late successful response can still save the review result and navigate to the review screen after the timeout state has appeared.

Evidence:
- `apps/mobile/src/app/(app)/dictation/complete.tsx` sets `reviewTimedOut` on timeout but does not set `reviewCancelledRef.current = true`.
- The success path only suppresses navigation when `reviewCancelledRef.current` is true.
- Dictation generation and text-preview paths already cancel late responses on timeout, so review completion behaves inconsistently.

## Native/Hardware Branches Skipped For Manual Execution

- HOMEWORK-02 camera permission/capture/OCR: native camera and OS permission branch; source and E2E inventory inspected.
- HOMEWORK-05 gallery import: OS gallery branch; source and E2E inventory inspected.
- HOMEWORK-07 OS settings permission recovery: native settings branch; source and E2E inventory inspected.
- DICT-04 playback audio/TTS: audio branch; source inspected, actual audio not verified.
- DICT-05 hardware back confirm: native hardware back branch; source inspected, hardware event not verified.
- DICT-07 photo review capture: camera branch skipped for live execution; source inspected.

## Coverage Notes

- Practice hub routes to relearn, quiz, dictation, and recitation were inspected. No source-level dead-end found in PRACTICE-01..04.
- Quiz generation/play/results/error paths were inspected. Main found navigation break is QUIZ-09.
- Dictation generation, text preview, playback, completion, review, save/retry paths were inspected. Main found safety break is DICT-06.
- Homework home entry, camera/manual/gallery/OCR/session handoff, image pass-through, and permission branches were inspected. HOMEWORK-01 was later invalidated by product clarification; HOMEWORK-06 remains the active bug.
