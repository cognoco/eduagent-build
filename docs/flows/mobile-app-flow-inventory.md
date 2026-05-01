# Mobile App Flow Inventory

Current-state flow map for the Expo mobile app as of 2026-04-19.

Source of truth used for this inventory:
- `apps/mobile/src/app/**`
- `apps/mobile/src/components/**`
- `apps/mobile/e2e/flows/**`

Notes:
- This is a user-facing flow inventory, not a backend API inventory.
- `Coverage` refers to whether a dedicated Maestro/E2E flow already exists.
- `Code-only` means the flow is clearly present in the app code but does not have its own explicit flow file yet.

## What changed since 2026-04-10

Two large changes reshape the inventory:

1. **Home & navigation IA simplification (commit 55ddcbdb, 2026-04-17/18).**
   - `/(app)/learn-new` and `/(app)/learn` were deleted. Their job is now done by the four IntentCards rendered directly on `/(app)/home` (`LearnerScreen`).
   - Tab bar whitelist is now `home, library, progress, more` (Progress was promoted from a hidden non-tab route to a top-level tab).
   - `FULL_SCREEN_ROUTES` (tab bar hidden) now also covers `dictation` and `quiz` in addition to `session`, `homework`, `onboarding`, `shelf`.
   - A new `AddFirstChildScreen` shows on `/(app)/home` for owners on family/pro plans who have not yet added a child profile.
2. **Quiz, dictation, vision, animation feature drop (commit f6631f4a, 2026-04-16).** New top-level practice activities and the photo-review path that depends on multimodal LLM input.

E2E flows that scripted taps on `/learn-new` are stale — they should be retargeted to the new IntentCard testIDs (`intent-learn`, `intent-ask`, `intent-practice`, `intent-homework`, `intent-continue`).

## What changed since 2026-04-18 (the `improvements` branch)

Three more changes reshape the inventory since the last snapshot:

3. **Quiz history + round detail screens (PR #121 / commit 1e50b6ea, 2026-04-19).** Two new routes were added under `/(app)/quiz` so that completed rounds become discoverable after the results screen is dismissed:
   - `/(app)/quiz/history` — a list of completed rounds grouped by date (Today / Yesterday / locale long date) with an empty state that deep-links back to the quiz index.
   - `/(app)/quiz/[roundId]` — a per-round detail view showing each question's correct answer and accepted aliases, reached from the history list (and useful as a share-link target).
4. **Parent Narrative Phase 1 (commit 68a2288c, 2026-04-19).** Parent-facing screens shift from raw metric dumps toward plain-English narratives. Three surfaces change:
   - Parent child-topic detail replaces the "Mastery" card with an "Understanding" card that maps mastery percent to plain labels ("Just starting" → "Mastered"). Retention is now gated on data presence and uses parent-facing retention phrasing.
   - Parent child-session detail gains a **Session recap** block (narrative + highlight + conversation prompt with copy-to-clipboard + `EngagementChip`). The recap block renders only when at least one of the four fields is populated, so pre-backfill sessions render the old metric strip alone.
   - Parent child-subject detail gates retention badges on data presence so empty/unknown subjects no longer show misleading "At risk" chips.
5. **Quiz completion hardening + web stack stacking (commits 68a2288c + 1316619e, 2026-04-19).**
   - Quiz results now wraps the streak-recording API call in try/catch so a streak failure cannot block the celebration screen (code-review finding C2).
   - All 14 `Stack`/`Tabs` `_layout.tsx` files were given opaque `contentStyle`/`sceneStyle` backgrounds to fix web-only screen bleed-through (F-003/F-006/F-016/F-017/F-055). This is a cross-cutting polish rather than a user-visible flow.

## Auth and Access

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| AUTH-01 | App launch and auth gate | `/`, `index.tsx`, `/(auth)/_layout.tsx`, `/(app)/_layout.tsx` | `e2e/flows/app-launch.yaml`, `e2e/flows/app-launch-devclient.yaml`, `e2e/flows/app-launch-expogo.yaml` |
| AUTH-02 | Sign up with email and password | `/(auth)/sign-up` | `e2e/flows/onboarding/sign-up-flow.yaml`, `e2e/flows/auth/sign-up-screen-devclient.yaml` |
| AUTH-03 | Sign-up email verification code | `/(auth)/sign-up` verification state | Partial: covered inside `e2e/flows/onboarding/sign-up-flow.yaml` |
| AUTH-04 | Sign in with email and password | `/(auth)/sign-in` | `e2e/flows/auth/sign-in-navigation.yaml`, `e2e/flows/auth/sign-in-validation-devclient.yaml` |
| AUTH-05 | Additional sign-in verification | `/(auth)/sign-in` email code / phone code / TOTP branches | Code-only |
| AUTH-06 | Forgot password and reset password | `/(auth)/forgot-password` | `e2e/flows/auth/forgot-password.yaml`, `e2e/flows/auth/forgot-password-devclient.yaml` |
| AUTH-07 | Auth screen navigation | Sign in -> sign up -> forgot password -> back to sign in | `e2e/flows/auth/sign-in-navigation.yaml`, `e2e/flows/auth/sign-in-navigation-devclient.yaml` |
| AUTH-08 | OAuth sign in / sign up with Google, Apple, or OpenAI | `/(auth)/sign-in`, `/(auth)/sign-up`, `sso-callback.tsx` | Code-only |
| AUTH-09 | SSO callback completion and fallback return to sign in | `/sso-callback` | Code-only |
| AUTH-10 | Sign out | More screen sign-out button, consent gates sign-out buttons | Partial: setup uses `e2e/flows/_setup/sign-out.yaml`; no dedicated user-facing sign-out flow |
| AUTH-11 | Session-expired forced sign-out | Root app auth-expiry handler in `_layout.tsx` | Code-only |
| AUTH-12 | First-time vs returning sign-in copy | `/(auth)/sign-in` welcome state | `e2e/flows/auth/welcome-text-first-time.yaml` |

## Profiles, Family, Consent, and Account

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| ACCOUNT-01 | Create first profile | `/create-profile` from first-time setup | `e2e/flows/onboarding/create-profile-standalone.yaml` |
| ACCOUNT-02 | Create additional profile | `/profiles` -> `/create-profile` | Partial: profile creation is covered, but the generic add-profile journey is mostly code-only |
| ACCOUNT-03 | Add child profile from More or Profiles | `/(app)/more`, `/profiles`, `/create-profile` | `e2e/flows/parent/add-child-profile.yaml`, `e2e/flows/regression/bug-239-parent-add-child.yaml` |
| ACCOUNT-04 | Profile switching | `/profiles`, `ProfileSwitcher` from learner and parent home | `e2e/flows/account/profile-switching.yaml` |
| ACCOUNT-05 | Family-plan gating and max-profile gating for adding children | `/(app)/more`, `/profiles`, `/(app)/subscription` | Partial: behavior is in code; upgrade path is covered by billing flows |
| ACCOUNT-06 | More tab navigation | `/(app)/more` | `e2e/flows/account/more-tab-navigation.yaml` |
| ACCOUNT-07 | Settings toggles for push notifications and weekly digest | `/(app)/more` | `e2e/flows/account/settings-toggles.yaml` |
| ACCOUNT-08 | Learning mode and celebration preferences | `/(app)/more` | Partial: settings toggles flow covers parts of this surface |
| ACCOUNT-09 | Change password | `AccountSecurity` -> `ChangePassword` on `/(app)/more` | Code-only |
| ACCOUNT-10 | Export my data | `/(app)/more` -> export action | Code-only |
| ACCOUNT-11 | Delete account with 7-day grace period | `/delete-account` | `e2e/flows/account/delete-account.yaml`, `e2e/flows/account/account-lifecycle.yaml` |
| ACCOUNT-12 | Cancel scheduled account deletion | `/delete-account` scheduled state | Partial: covered inside `e2e/flows/account/account-lifecycle.yaml` |
| ACCOUNT-13 | Privacy policy | `/privacy` | Partial: exercised in account lifecycle and navigation flows |
| ACCOUNT-14 | Terms of service | `/terms` | Partial: exercised in account lifecycle and navigation flows |
| ACCOUNT-15 | Self mentor memory | `/(app)/mentor-memory` | Code-only |
| ACCOUNT-16 | Child mentor memory | `/(app)/child/[profileId]/mentor-memory` | Code-only |
| ACCOUNT-17 | Child memory consent prompt | Child mentor-memory and child detail surfaces | Code-only |
| ACCOUNT-18 | Subject analogy preference after setup | `/(app)/subject/[subjectId]` | Code-only |
| ACCOUNT-19 | Consent request during underage profile creation | `/create-profile` -> `/consent` | Partial: profile creation and consent flows both exist in E2E |
| ACCOUNT-20 | Child handoff to parent consent request | `/consent` | `e2e/flows/consent/hand-to-parent-consent.yaml` |
| ACCOUNT-21 | Parent email entry, send consent link, resend, and change email | `/consent`, consent pending gate in `/(app)/_layout.tsx` | `e2e/flows/consent/profile-creation-consent.yaml`, `e2e/flows/consent/consent-pending-gate.yaml` |
| ACCOUNT-22 | Consent pending gate | `/(app)/_layout.tsx` | `e2e/flows/consent/consent-pending-gate.yaml` |
| ACCOUNT-23 | Consent withdrawn gate | `/(app)/_layout.tsx` | `e2e/flows/consent/consent-withdrawn-gate.yaml` |
| ACCOUNT-24 | Post-approval landing after consent is granted | post-approval surface from app layout | `e2e/flows/consent/post-approval-landing.yaml` |
| ACCOUNT-25 | Parent consent management for a child | `/(app)/child/[profileId]` withdraw / restore consent | `e2e/flows/parent/consent-management.yaml` |
| ACCOUNT-26 | Regional consent variants | COPPA, GDPR, and above-threshold create-profile branches | `e2e/flows/consent/consent-coppa-under13.yaml`, `e2e/flows/consent/consent-gdpr-under16.yaml`, `e2e/flows/consent/consent-above-threshold.yaml`, `e2e/flows/consent/coppa-flow.yaml` |

## Home, Navigation, and Subject Setup

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| HOME-01 | Learner home with intent cards (Continue, Learn, Ask, Practice, Homework) | `/(app)/home` via `LearnerScreen`; intent cards rendered directly (the old `/learn-new` two-step pattern is gone) | Covered indirectly by many learning and subject flows |
| HOME-02 | Parent gateway home | `/(app)/home` via `ParentGateway` | `e2e/flows/parent/parent-tabs.yaml`, `e2e/flows/parent/parent-dashboard.yaml` |
| HOME-03 | Parent tabs and parent-mode navigation | `/(app)` tab shell, `/(app)/home`, `/(app)/library`, `/(app)/progress`, `/(app)/more` | `e2e/flows/parent/parent-tabs.yaml` |
| HOME-04 | Animated splash and initial shell | root `_layout.tsx` splash / launch experience | `e2e/flows/edge/animated-splash.yaml` |
| HOME-05 | Empty first-user state | no-subject / first-run learner state | `e2e/flows/edge/empty-first-user.yaml` |
| HOME-06 | Resume interrupted session | `LearnerScreen` "Continue" intent card (driven by SecureStore session-recovery marker + `useContinueSuggestion`) | Code-only |
| HOME-07 | Add-first-child gate for owners on family/pro plans | `/(app)/home` -> `AddFirstChildScreen` -> `/create-profile` | Code-only (added 2026-04-17) |
| HOME-08 | Home loading-timeout fallback | `/(app)/home` after 10s of profile load | Code-only — testIDs `home-loading-timeout`, `home-loading-retry`, `timeout-library-button`, `timeout-more-button` |
| SUBJECT-01 | Create subject from learner home | `/(app)/home` "Learn" intent card -> `/create-subject` | Covered by subject onboarding flows |
| SUBJECT-02 | Create subject from library empty state | `/(app)/library` -> `/create-subject` | Partial: library flows cover it indirectly |
| SUBJECT-03 | Create subject from chat when classifier cannot match an existing subject | session screen -> `/create-subject?returnTo=chat` | `e2e/flows/regression/bug-234-chat-subject-picker.yaml`, `e2e/flows/regression/bug-236-subject-returns-to-chat.yaml` |
| SUBJECT-04 | Create subject from homework | homework camera screen -> `/create-subject` when needed | Partial: homework flows cover this branch indirectly |
| SUBJECT-05 | Subject resolution and clarification suggestions | `/create-subject` resolve / suggest / use-my-words flow | `e2e/flows/onboarding/create-subject-resolve.yaml`, `e2e/flows/regression/bug-233-chat-classifier-easter.yaml` |
| SUBJECT-06 | Broad subject flow: create a broad subject, then pick a book | `/create-subject` -> `/(app)/pick-book/[subjectId]` | `e2e/flows/subjects/practice-subject-picker.yaml`, `e2e/flows/regression/bug-237-focused-book-generation.yaml` |
| SUBJECT-07 | Focused subject or focused-book flow | `/create-subject` -> `/(app)/onboarding/interview` | `e2e/flows/onboarding/create-subject.yaml` |
| SUBJECT-08 | Language learning setup | `/(app)/onboarding/language-setup` | Covered by onboarding flows; language branch is route-backed |
| SUBJECT-09 | Interview onboarding | `/(app)/onboarding/interview` | `e2e/flows/onboarding/create-subject.yaml` |
| SUBJECT-10 | Analogy-preference onboarding | `/(app)/onboarding/analogy-preference` | `e2e/flows/onboarding/analogy-preference-flow.yaml` |
| SUBJECT-11 | Curriculum review | `/(app)/onboarding/curriculum-review` | `e2e/flows/onboarding/curriculum-review-flow.yaml` |
| SUBJECT-12 | View curriculum without committing to a learning session | curriculum screen and library/book entry routes | `e2e/flows/onboarding/view-curriculum.yaml` |
| SUBJECT-13 | Challenge curriculum, skip topics, add topics, and ask why topics are ordered this way | `/(app)/onboarding/curriculum-review` | Partial: curriculum review flow covers the main surface, but not every mutation branch explicitly |
| SUBJECT-14 | Placement / knowledge assessment | `/assessment` | `e2e/flows/assessment/assessment-cycle.yaml` |
| SUBJECT-15 | Accommodation-mode onboarding step (none / dyslexia / adhd / etc.) | `/(app)/onboarding/accommodations` (new step inserted between interview and curriculum review) | Code-only — added with FR255 accommodation work |

## Learning, Chat, Library, Retention, and Progress

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| LEARN-01 | Freeform chat: "Just ask anything" | `/(app)/home` "Ask" intent card -> `/(app)/session?mode=freeform` (entry was previously `/learn-new`) | `e2e/flows/learning/freeform-session.yaml` |
| LEARN-02 | Guided learning session from a subject or topic | `/(app)/session`, `/(app)/topic/[topicId]`, book routes | `e2e/flows/learning/start-session.yaml`, `e2e/flows/learning/core-learning.yaml` |
| LEARN-03 | First session experience | first guided session | `e2e/flows/learning/first-session.yaml` |
| LEARN-04 | Core learning loop | standard live tutoring session | `e2e/flows/learning/core-learning.yaml` |
| LEARN-05 | Coach bubble visual variants | live session persona/theme variants | `e2e/flows/learning/coach-bubble-light.yaml`, `e2e/flows/learning/coach-bubble-dark.yaml` |
| LEARN-06 | Voice input and voice-speed controls | live session voice toggle / controls | `e2e/flows/learning/voice-mode-controls.yaml` |
| LEARN-07 | Session summary: submit summary or skip summary | `/session-summary/[sessionId]` | `e2e/flows/learning/session-summary.yaml` |
| LEARN-08 | Library root with shelves, books, and topics tabs | `/(app)/library` | `e2e/flows/learning/library-navigation.yaml` |
| LEARN-09 | Subject shelf -> book selection | `/(app)/shelf/[subjectId]`, `/(app)/pick-book/[subjectId]` | `e2e/flows/subjects/practice-subject-picker.yaml`, `e2e/flows/subjects/multi-subject.yaml` |
| LEARN-10 | Book detail and start learning from a book | `/(app)/shelf/[subjectId]/book/[bookId]` | Covered by library and core-learning flows |
| LEARN-11 | Manage subject status: active, paused, archived | library manage-subject modal | Code-only |
| LEARN-12 | Topic detail | `/(app)/topic/[topicId]` | `e2e/flows/retention/topic-detail.yaml`, `e2e/flows/retention/topic-detail-adaptive-buttons.yaml` |
| LEARN-13 | Recall check | `/(app)/topic/recall-test` | `e2e/flows/retention/recall-review.yaml` |
| LEARN-14 | Failed recall remediation | recall flow -> remediation card | `e2e/flows/retention/failed-recall.yaml` |
| LEARN-15 | Relearn flow: same method or different method | `/(app)/topic/relearn` | `e2e/flows/retention/relearn-flow.yaml`, `e2e/flows/retention/relearn-child-friendly.yaml` |
| LEARN-16 | Retention review from library or review surfaces | library / retention routes | `e2e/flows/retention/retention-review.yaml`, `e2e/flows/retention/library.yaml` |
| LEARN-17 | Progress overview (now a top-level tab) | `/(app)/progress` | Code-only |
| LEARN-18 | Subject progress detail | `/(app)/progress/[subjectId]` | Code-only |
| LEARN-19 | Streak display | progress / reward surfaces | `e2e/flows/edge/streak-display.yaml` |
| LEARN-20 | Milestones list | `/(app)/progress/milestones` | Code-only — empty/error fallbacks via `ErrorFallback` |
| LEARN-21 | Cross-subject vocabulary browser | `/(app)/progress/vocabulary` | Code-only — has `vocab-browser-new-learner` empty state |
| LEARN-22 | Per-subject vocabulary list (delete words, view CEFR + word/phrase badges) | `/(app)/vocabulary/[subjectId]` | Code-only |

## Practice Hub and Practice Activities

The Practice hub is the new top-level surface for activities that are not full tutoring sessions. It is reached from the Home "Practice" intent card. The hub itself is **not** a tab — it is a non-tab route under `/(app)/practice` that hides the tab bar at the route level.

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| PRACTICE-01 | Practice hub menu (Review topics, Recite, Dictation, Quiz) | `/(app)/practice` reached from Home "Practice" IntentCard | Code-only — see `apps/mobile/src/app/(app)/practice.test.tsx` |
| PRACTICE-02 | Review topics shortcut (jumps directly into the next overdue topic relearn flow) | `/(app)/practice` -> `/(app)/topic/relearn` with `topicId/subjectId/topicName` params | Partially via existing relearn flows |
| PRACTICE-03 | Recitation session (recite a poem / text from memory) | `/(app)/practice` -> `/(app)/session?mode=recitation` | Code-only — new session mode wired through Session screen |
| PRACTICE-04 | "All caught up" empty state with next-review countdown | `/(app)/practice` review section when `totalOverdue === 0` | Code-only — testID `review-empty-state` + `review-empty-browse` deep-link to library |

### Quiz Activities

Quiz flow uses a React context (`useQuizFlow` from `(app)/quiz/_layout`) to pass round state across the four screens. Mid-round prefetch starts at the halfway point so "Play Again" feels instant on the results screen.

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| QUIZ-01 | Quiz activity picker (Capitals, Vocabulary per language, Guess Who) | `/(app)/quiz` (index) | Code-only |
| QUIZ-02 | Round generation loading screen with rotating "shuffling / picking a theme" copy and 20-second "still trying" hint | `/(app)/quiz/launch` | Code-only — testIDs `quiz-launch-loading`, `quiz-launch-cancel`, `quiz-launch-timed-out`, `quiz-launch-error` |
| QUIZ-03 | Round play screen — multiple choice (Capitals / Vocabulary) | `/(app)/quiz/play` with `currentQuestion.type === 'capitals' \| 'vocabulary'` | Code-only — server checks each answer (`POST /quiz/rounds/:id/check`) |
| QUIZ-04 | Round play screen — Guess Who clue reveal | `/(app)/quiz/play` with `currentQuestion.type === 'guess_who'` (clues unlock progressively, score scaled by `cluesUsed`) | Code-only |
| QUIZ-05 | Mid-round quit with confirm-style escape (close icon top-left) | `/(app)/quiz/play` -> `goBackOrReplace('/(app)/quiz')` | Code-only |
| QUIZ-06 | Round complete error retry | `/(app)/quiz/play` `completeError` inline card with Retry / Exit | Code-only — testIDs `quiz-play-error`, `quiz-play-retry`, `quiz-play-exit` |
| QUIZ-07 | Results screen with celebration tier (perfect / great / nice), score, theme, XP earned, Play Again, Done. Streak recording is soft-failed via try/catch so API errors cannot block the celebration screen | `/(app)/quiz/results` | Code-only — `BrandCelebration` only on perfect/great; results hardening verified by `apps/mobile/src/app/(app)/quiz/results.test.tsx` |
| QUIZ-08 | Quiz quota / consent / forbidden errors render typed-error message + suppress Retry | `/(app)/quiz/launch` (classifies `QUOTA_EXCEEDED`, `FORBIDDEN`, `CONSENT_*` from `apiClient`'s typed `ApiResponseError.code`) | Code-only |
| QUIZ-09 | Quiz history: list of completed rounds grouped by Today / Yesterday / locale date, with empty state that deep-links back to the quiz index | `/(app)/quiz/history` reached from the quiz index | Code-only — testIDs `quiz-history-loading`, `quiz-history-empty`, `quiz-history-try-quiz`, `quiz-history-screen` |
| QUIZ-10 | Quiz round detail: drill into a completed round and see each question with correct answer + accepted aliases | `/(app)/quiz/[roundId]` reached from the history list | Code-only — testIDs `round-detail-loading`, `round-detail-error`; data via `GET /quiz/rounds/:id` typed as `CompletedRoundDetail` |

### Dictation

Dictation is a five-screen flow under `/(app)/dictation` with its own React context (`useDictationData` from `(app)/dictation/_layout`). All five screens hide the tab bar.

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| DICT-01 | Dictation choice screen ("I have a text" vs "Surprise me") | `/(app)/dictation` (index) | Code-only — testIDs `dictation-homework`, `dictation-surprise`, `dictation-error-retry` |
| DICT-02 | OCR text preview + edit before starting (homework path) | `/(app)/dictation/text-preview` (entered from camera-OCR pipeline; receives `ocrText` param) | Code-only |
| DICT-03 | "Surprise me" LLM-generated dictation (`POST /dictation/generate`) | `/(app)/dictation` index -> `/(app)/dictation/playback` | Code-only — surfaces typed errors via `formatApiError` Alert |
| DICT-04 | Playback screen (TTS reads each sentence; pace + punctuation + skip + repeat controls; tap-to-pause; countdown in target language) | `/(app)/dictation/playback` | Code-only — preferences stored per profile in SecureStore (`dictation-pace-${profileId}`, `dictation-punctuation-${profileId}`) |
| DICT-05 | Mid-dictation exit confirm dialog ("Are you sure?") on hardware back | `/(app)/dictation/playback` `BackHandler` listener | Code-only |
| DICT-06 | Completion screen (Well done! Check my writing / I'm done / Try another dictation) | `/(app)/dictation/complete` | Code-only |
| DICT-07 | Photo review of handwritten dictation via multimodal LLM | `/(app)/dictation/complete` "Check my writing" -> camera capture -> `POST /dictation/review` (image base64 + sentences) -> `/(app)/dictation/review` | Code-only — depends on homework image vision feature |
| DICT-08 | Sentence-level remediation (rewrite each mistake; autocorrect disabled; accepts whatever child types) | `/(app)/dictation/review` | Code-only — testIDs `review-remediation-screen`, `review-mistake-card`, `review-correction-input`, `review-submit-correction` |
| DICT-09 | Perfect-score celebration screen | `/(app)/dictation/review` short-circuit when `mistakes.length === 0` | Code-only — testID `review-celebration` |
| DICT-10 | Recording dictation result on "I'm done" or after review (`POST /dictation/results`) with retry alert if save fails | `/(app)/dictation/complete` and `/(app)/dictation/review` `useRecordDictationResult` | Code-only |

## Homework and Parent Experience

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| HOMEWORK-01 | Start homework from learner home or More screen | learner home "Homework" intent card, `/(app)/more` -> `/(app)/homework/camera` | `e2e/flows/homework/homework-from-entry-card.yaml`, `e2e/flows/homework/homework-flow.yaml` |
| HOMEWORK-02 | Camera permission, capture, preview, and OCR | `/(app)/homework/camera` | `e2e/flows/homework/camera-ocr.yaml` |
| HOMEWORK-03 | Manual fallback when OCR is weak or fails | camera fallback and manual text entry | Covered inside `e2e/flows/homework/camera-ocr.yaml` |
| HOMEWORK-04 | Homework tutoring session with multi-problem navigation | `/(app)/session?mode=homework` | `e2e/flows/homework/homework-flow.yaml` |
| HOMEWORK-05 | Gallery import (pick existing photo instead of camera capture) | `/(app)/homework/camera` gallery picker | Code-only — see `2026-04-10-homework-gallery-import-design.md` |
| HOMEWORK-06 | Image pass-through to multimodal LLM (vision) for richer help | session route after homework capture; same image path used by dictation review | Code-only — see `2026-04-16-homework-image-vision-design.md` |
| PARENT-01 | Parent dashboard (live or demo) | `/(app)/dashboard` | `e2e/flows/parent/parent-dashboard.yaml`, `e2e/flows/parent/demo-dashboard.yaml` |
| PARENT-02 | Multi-child dashboard | dashboard with multiple linked children | `e2e/flows/parent/multi-child-dashboard.yaml` |
| PARENT-03 | Child detail drill-down | `/(app)/child/[profileId]` | `e2e/flows/parent/child-drill-down.yaml` |
| PARENT-04 | Child subject -> topic drill-down | `/(app)/child/[profileId]/subjects/[subjectId]`, `topic/[topicId]` | Covered inside `e2e/flows/parent/child-drill-down.yaml` |
| PARENT-05 | Child session / transcript drill-down | `/(app)/child/[profileId]/session/[sessionId]` | Covered inside `e2e/flows/parent/child-drill-down.yaml` |
| PARENT-06 | Child monthly reports list and report detail | `/(app)/child/[profileId]/reports`, `report/[reportId]` | Code-only |
| PARENT-07 | Parent library view | `/(app)/library` while parent profile is active | `e2e/flows/parent/parent-library.yaml` |
| PARENT-08 | Subject raw-input audit for parents | parent drill-down / raw input review surfaces | `e2e/flows/parent/subject-raw-input-audit.yaml` |
| PARENT-09 | Guided label tooltip | parent dashboard or parent report surfaces | `e2e/flows/parent/guided-label-tooltip.yaml` |
| PARENT-10 | Parent child-topic "Understanding" card (plain-English mastery label) with data-gated Retention card | `/(app)/child/[profileId]/topic/[topicId]` | Code-only — testIDs `topic-understanding-card` (replaces `topic-mastery-card`), `topic-retention-card`; labels from `getUnderstandingLabel` and `getParentRetentionInfo` in `apps/mobile/src/lib/parent-vocab.ts` |
| PARENT-11 | Parent child-session recap: narrative block, highlight block, Conversation prompt with copy-to-clipboard (Copied! / Copy failed states), and `EngagementChip` (curious / stuck / breezing / focused / scattered) | `/(app)/child/[profileId]/session/[sessionId]` | Code-only — block renders only when `narrative \|\| highlight \|\| conversationPrompt \|\| engagementSignal` is populated; pre-backfill sessions render metrics only |
| PARENT-12 | Parent child-subject detail retention badges gated on data presence | `/(app)/child/[profileId]/subjects/[subjectId]` | Code-only — uses `RetentionSignal parentFacing` labels; unknown retention no longer surfaces as "At risk" |

## Billing and Monetization

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| BILLING-01 | Subscription screen and current-plan details | `/(app)/subscription` | `e2e/flows/billing/subscription-details.yaml` |
| BILLING-02 | Upgrade plan purchase flow | `/(app)/subscription` -> RevenueCat purchase | `e2e/flows/billing/subscription.yaml` |
| BILLING-03 | Trial / plan usage / family-pool detail states | `/(app)/subscription` | `e2e/flows/billing/subscription-details.yaml` |
| BILLING-04 | Restore purchases | `/(app)/subscription` restore action | `e2e/flows/billing/subscription-details.yaml` |
| BILLING-05 | Manage billing deep link | `/(app)/subscription` -> App Store / Play subscriptions | Partial: surfaced in subscription-details flow |
| BILLING-06 | Child paywall and notify-parent action | child profile with no entitlement | `e2e/flows/billing/child-paywall.yaml` |
| BILLING-07 | Daily quota exceeded paywall | subscription / quota limit handling | `e2e/flows/billing/daily-quota-exceeded.yaml` |
| BILLING-08 | Family pool visibility | family usage details in subscription screen | Partial: surfaced in subscription-details flow |
| BILLING-09 | Top-up question credits | subscription top-up section | Code-only |
| BILLING-10 | BYOK waitlist | subscription BYOK waitlist CTA | Code-only |

## Regression and System Flows Already Captured in E2E

These are not always standalone product flows, but they are already tracked as explicit regression/smoke journeys and are useful to keep in the map.

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| QA-01 | Quick smoke check | launch / sign-in / home smoke | `e2e/flows/quick-check.yaml` |
| QA-02 | Post-auth comprehensive smoke | broad post-login sweep | `e2e/flows/post-auth-comprehensive-devclient.yaml` |
| QA-03 | Chat classifier regression: easter / suggestion resolution | chat -> create subject resolution | `e2e/flows/regression/bug-233-chat-classifier-easter.yaml` |
| QA-04 | Chat subject picker regression | chat -> subject picker handoff | `e2e/flows/regression/bug-234-chat-subject-picker.yaml` |
| QA-05 | Return to chat after creating a subject | `/create-subject?returnTo=chat` | `e2e/flows/regression/bug-236-subject-returns-to-chat.yaml` |
| QA-06 | Focused-book generation regression | create-subject focused-book branch | `e2e/flows/regression/bug-237-focused-book-generation.yaml` |
| QA-07 | Tab-bar leak regression | app tab shell | `e2e/flows/regression/bug-238-tab-bar-no-leak.yaml` |
| QA-08 | Parent add-child regression | parent add child branch | `e2e/flows/regression/bug-239-parent-add-child.yaml` |
| QA-09 | Consent email URL regression | consent link handling | `e2e/flows/regression/bug-240-consent-email-url.yaml` |

## Cross-Cutting Behaviors Worth Calling Out

These are not single-screen flows, but they shape user experience across multiple screens and were added/changed in the recent feature drop.

| ID | Behavior | Where it activates |
| --- | --- | --- |
| CC-01 | Conversation-stage-aware chips and feedback gating in tutoring sessions | `SessionMessageActions` reads `conversationStage` and shows quick chips (`Give me a hint`, `Show an example`, etc.) only after the AI has moved past the greeting (`isGreeting` regex detector). See spec `2026-04-15-conversation-stage-chips-design.md`. |
| CC-02 | Greeting-aware subject classification | `useSubjectClassification` skips classification while the conversation stage is still "greeting", preventing the classifier from misfiring on a hello. |
| CC-03 | Animation polish (icon transitions, intent card press, celebrations) | `BrandCelebration`, `IntentCard` (now uses left accent border + icon), session message animations. See `docs/_archive/plans/2026-04-16-animation-improvements-design.md`. |
| CC-04 | `goBackOrReplace(router, fallback)` is mandatory on every back button | Replaces direct `router.back()`. Prevents dead-end when there is no back history (deep link, web reload). Sweep applied to all 33 screens. |
| CC-05 | Continue-where-you-left-off card | Driven by `useContinueSuggestion` API + a SecureStore session-recovery marker. The marker takes priority when fresh; otherwise the API suggestion is used; otherwise the next overdue review topic is offered. |
| CC-06 | Top-up purchase confidence | Two-stage polling progress message in the top-up flow with a confident timeout copy. See `2026-04-10-topup-purchase-confidence-design.md`. |
| CC-07 | Accommodation badge surfaces | Non-deletable accommodation badge on child mentor-memory; accommodation mode selector on parent child detail and self-managed learner settings (FR255). |
| CC-08 | Parent-facing metric vocabulary canon | `apps/mobile/src/lib/parent-vocab.ts` centralises understanding labels, parent retention mapping, and tooltip copy. Shared by PARENT-10, PARENT-11, PARENT-12 so wording stays consistent across parent surfaces. |
| CC-09 | Opaque web layout backgrounds to prevent screen bleed-through | All 14 `Stack`/`Tabs` `_layout.tsx` files declare `contentStyle`/`sceneStyle` with a solid background. Fixes web-only visual regressions when navigators nest (e.g. `(app)` tabs containing a `quiz/` stack). Non-visible on native, so Maestro flows are unaffected — dedicated web visual coverage is the outstanding gap. |
| CC-10 | Soft-fail side effects on completion screens | Quiz results wraps streak recording in try/catch so the celebration screen is never blocked by an API failure. Pattern candidate for dictation/homework/session completion surfaces. |

## Best Next Candidates for Dedicated Flow Docs or E2E Coverage

These flows are clearly present in the code and worth documenting or automating next because they are user-visible but not yet called out by their own dedicated Maestro flow files:

- OAuth sign in and sign up happy paths
- Additional sign-in verification branches: email code, phone code, and TOTP
- Session-expired forced sign-out and re-authentication
- Change password
- Export my data
- Self mentor memory
- Child mentor memory and memory consent
- Subject analogy preference after onboarding
- Resume interrupted session via the new Home "Continue" intent card (recovery marker + API suggestion)
- Manage subject status in the library
- Progress overview and per-subject progress
- Milestones list and cross-subject vocabulary browser (LEARN-20, LEARN-21)
- Per-subject vocabulary management with delete (LEARN-22)
- Child monthly reports list and report detail
- Subscription top-up flow
- BYOK waitlist flow
- Accommodations onboarding step (SUBJECT-15)
- Practice hub navigation (PRACTICE-01..04)
- Quiz happy path: index -> launch -> play -> results, including Play Again with prefetched round (QUIZ-01..07)
- Quiz error classification: quota exceeded, consent required, forbidden suppress Retry (QUIZ-08)
- Quiz history list: grouping, empty state, deep-link back to index (QUIZ-09)
- Quiz round detail: per-question review with correct answers and aliases (QUIZ-10)
- Parent child-topic "Understanding" card + gated retention (PARENT-10)
- Parent session recap block: narrative, conversation prompt copy-to-clipboard, engagement chip (PARENT-11) — needs both the populated and empty-recap variant
- Parent subject detail gated retention badges (PARENT-12)
- Dictation "Surprise me" path end-to-end including TTS playback controls (DICT-01..06)
- Dictation photo-review remediation loop (DICT-07..10)
- Recitation session mode (PRACTICE-03)
- Add-first-child gate for parent owners with no children yet (HOME-07)
- Home loading-timeout fallback (HOME-08)
