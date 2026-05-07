# Mobile App Flow Inventory

Current-state flow map for the Expo mobile app as of 2026-05-04.

Source of truth used for this inventory:
- `apps/mobile/src/app/**`
- `apps/mobile/src/components/**`
- `apps/mobile/e2e/flows/**`

Notes:
- This is a user-facing flow inventory, not a backend API inventory.
- `Coverage` refers to whether a dedicated Maestro/E2E flow already exists.
- `Code-only` means the flow is clearly present in the app code but does not have its own explicit flow file yet.
- E2E paths in the Coverage column are relative to `apps/mobile/`.

## What changed since 2026-04-10

Two large changes reshape the inventory:

1. **Home & navigation IA simplification (commit 55ddcbdb, 2026-04-17/18).**
   - `/(app)/learn-new` and `/(app)/learn` were deleted. Their job is now done by the four IntentCards rendered directly on `/(app)/home` (`LearnerScreen`).
   - Tab bar whitelist is now `home, library, progress, more` (Progress was promoted from a hidden non-tab route to a top-level tab).
   - `FULL_SCREEN_ROUTES` (tab bar hidden) now also covers `dictation` and `quiz` in addition to `session`, `homework`, `onboarding`, `shelf`.
2. **Quiz, dictation, vision, animation feature drop (commit f6631f4a, 2026-04-16).** New top-level practice activities and the photo-review path that depends on multimodal LLM input.

## What changed since 2026-04-18 (the `improvements` branch)

3. **Quiz history + round detail screens (PR #121 / commit 1e50b6ea, 2026-04-19).** `/(app)/quiz/history` and `/(app)/quiz/[roundId]` make completed rounds discoverable after the results screen is dismissed.
4. **Parent Narrative Phase 1 (commit 68a2288c, 2026-04-19).** Understanding card replaces Mastery; session recap block; gated retention badges.
5. **Quiz completion hardening + web stack stacking (commits 68a2288c + 1316619e, 2026-04-19).** Streak record wrapped in try/catch; opaque `contentStyle`/`sceneStyle` on all 14 layouts.

## What changed since 2026-04-19 (this snapshot)

6. **Library v3 redesign (PR #144, commit 1dd00262, ~2026-04-26; simplified 2026-05-05).** Library is now a subject-first shelf list with search (`LibrarySearchBar` with 300 ms debounce + server-side `useLibrarySearch`) and retention pills. Tapping a subject opens its shelf; books, suggestions, and topics live on the shelf/book screens. The previous shelves/books/topics tab architecture is gone.
7. **Home UI redesign (commit 435a7b89, ~2026-04-26).** The four-IntentCard pattern was replaced with a subject-tint carousel (`home-subject-carousel`), an add-subject tile, an empty-subjects state (`home-empty-subjects` / `home-add-first-subject`), an Ask Anything bar (`home-ask-anything`), a quick-action row (`home-action-study-new`, `home-action-homework`, `home-action-practice`), and an optional CoachBand (gated by `FEATURE_FLAGS.COACH_BAND_ENABLED`). The 2026-04-19 description of "Continue / Learn / Ask / Practice / Homework intent cards" is now obsolete.
8. **Session transcript view (commit 53524c6d, BUG-889).** New `session-transcript/[sessionId]` route registered as `fullScreenModal` — a read-only chat log of a completed session, reachable from the "View full transcript" link on the session-summary screen. Bubble rendering is hardened by `stripEnvelopeJson` (BUG-941).
9. **Bookmarks + saved screen (commit 6e0ffb58).** New `/(app)/progress/saved` route lists bookmarked chat messages with swipe-delete; powered by `useBookmarks` infinite query and `useDeleteBookmark`. Parent-proxy mode disables delete.
10. **Onboarding extras — conversationLanguage and pronouns (Bucket C).** Profile-wide `conversationLanguage` is mandatory; `pronouns` self-skips below `PRONOUNS_PROMPT_MIN_AGE`.
11. **i18n cross-cutting layer (commits b7e478a8 + 61dd2a2e + d0e1efdc + others).** `t()` is wired throughout: error messages, dictation alerts, camera permission copy, sso-callback strings. Locales: en, nb, de, es, pl, pt, ja.
12. **Profile-as-lens phase 1 (commit a72ebfac).** Profile-scoped screens receive the active profile as a navigation lens; `useActiveProfileRole` gates destructive actions in More for impersonated-child sessions.
13. **Weekly progress push + weekly-report screen (commit 7efcc1b6).** New `/(app)/child/[profileId]/weekly-report/[weeklyReportId]` route, push-driven, marks report viewed on mount.
14. **Permission onboarding (commit 22c7c99c + d0e1efdc).** Camera permission screen now has two distinct sub-states (first-request vs permanently-denied/Settings-redirect) and auto-refreshes on app resume. Spec: `docs/plans/2026-04-22-permission-onboarding.md`.
15. **More tab reorganization (commit ea32d358).** Sections reordered to: Learning Mode → Accommodation → Mentor Memory → Family → Celebrations → Notifications → Account → Other. Account split out from Other. App-language picker added inline.
16. **Delete-account three-stage typed-confirmation (commit 1267fbd6, BUG-910).** Native `Alert.alert` replaced with an in-screen warning → typed-confirmation (must type `DELETE`) → scheduled flow with family/subscription warnings.
17. **Subscription trial state + tier comparison cards (BUG-966 / BUG-917).** Trial banner and "Trial" status badge surface when `subscription.status === 'trial'`. Family / Pro tier static comparison cards render in PLANS for existing Family/Pro customers (no purchase action — preserves BUG-899).
18. **New full-flow E2E coverage.** `dictation/dictation-full-flow.yaml`, `quiz/quiz-full-flow.yaml`, `progress/progress-analytics.yaml`, `progress/vocabulary-browser.yaml`, `learning/vocabulary-flow.yaml`, `learning/book-detail.yaml`, `learning/session-summary.yaml`, `learning/voice-mode-controls.yaml`, `parent/child-mentor-memory.yaml` (+ `-populated`), `parent/child-report-detail.yaml`, `parent/child-reports-empty.yaml`, `account/learner-mentor-memory.yaml` (+ `-populated`), `account/more-tab-navigation.yaml`, `account/settings-toggles.yaml`, `auth/sso-buttons.yaml`, `consent/consent-deny-confirmation.yaml`, `onboarding/onboarding-extras-flow.yaml`, `account/tutor-language-edit.yaml` (renamed from `onboarding/settings-language-edit.yaml` — covers ACCOUNT-29 tutor language, not ACCOUNT-28 app locale). Many existing rows were re-promoted from `Code-only` to point at one of these.
19. **Quiz robustness fixes.** BUG-929 / CR-PR129-M4 reset `answerState`, `selectedAnswer`, `freeTextAnswer`, `guessWhoCluesUsed`, and the per-question timer in the same React batch on advance. BUG-932 shows the first clue (truncated) as the Guess Who row prompt in round detail. BUG-891 labels the vocab quiz card as "<lang> basics" when the learner has fewer than 5 personal words. BUG-892 replaces the web `window.confirm` quit with an in-app Modal. BUG-941 stripping is applied at the chat-bubble render boundary.

## Status legend

Each row describes prod-active behavior unless tagged. When a row says **Production behavior** / **Dev/staging behavior**, it is calling out a flag-gated split where the user-facing experience differs by environment. Other tags used inline:

- **shipped** — landed in code and on the prod path.
- **flag-gated** — landed in code, masked by a feature flag in at least one environment.
- **prompt-only** — implemented as an LLM prompt rule with no UI/route surface.
- **data-only** — backend computes/persists, but no UI consumes it yet.

For the planned redesign, see `docs/plans/app evolution plan/2026-05-06-learning-product-evolution-audit.md`.

## Auth and Access

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| AUTH-01 | App launch and auth gate | `/`, `index.tsx`, `/(auth)/_layout.tsx`, `/(app)/_layout.tsx` | `e2e/flows/app-launch.yaml`, `e2e/flows/app-launch-devclient.yaml`, `e2e/flows/app-launch-expogo.yaml` |
| AUTH-02 | Sign up with email and password | `/(auth)/sign-up` | `e2e/flows/onboarding/sign-up-flow.yaml`, `e2e/flows/auth/sign-up-screen-devclient.yaml` |
| AUTH-03 | Sign-up email verification code | `/(auth)/sign-up` verification state | Partial: covered inside `e2e/flows/onboarding/sign-up-flow.yaml` |
| AUTH-04 | Sign in with email and password | `/(auth)/sign-in` | `e2e/flows/auth/sign-in-navigation.yaml`, `e2e/flows/auth/sign-in-validation-devclient.yaml` |
| AUTH-05 | Additional sign-in verification | `/(auth)/sign-in` email code / phone code / TOTP / backup-code branches | Code-only |
| AUTH-06 | Forgot password and reset password | `/(auth)/forgot-password` | `e2e/flows/auth/forgot-password.yaml`, `e2e/flows/auth/forgot-password-devclient.yaml` |
| AUTH-07 | Auth screen navigation | Sign in -> sign up -> forgot password -> back to sign in | `e2e/flows/auth/sign-in-navigation.yaml`, `e2e/flows/auth/sign-in-navigation-devclient.yaml` |
| AUTH-08 | OAuth sign in / sign up — platform-conditional: Google on Android/web, Apple on iOS only, OpenAI if Clerk strategy registered | `/(auth)/sign-in`, `/(auth)/sign-up`, `sso-callback.tsx` | Partial: `e2e/flows/auth/sso-buttons.yaml` (Android/Google button rendering only) |
| AUTH-09 | SSO callback completion and fallback return to sign in | `/sso-callback` | Code-only — i18n via `t()`; 10s timeout reveals a Back-to-sign-in fallback button (testID `sso-fallback-back`) |
| AUTH-10 | Sign out | More screen sign-out button, consent gates sign-out buttons | Partial: setup uses `e2e/flows/_setup/sign-out.yaml`; no dedicated user-facing sign-out flow |
| AUTH-11 | Session-expired forced sign-out and re-entry banner | Root app auth-expiry handler in `_layout.tsx`; banner consumed by `/(auth)/sign-in` via `consumeSessionExpiredNotice` | Code-only |
| AUTH-12 | First-time vs returning sign-in copy | `/(auth)/sign-in` welcome state | `e2e/flows/auth/welcome-text-first-time.yaml` |
| AUTH-13 | Deep-link auth redirect preservation: unauthenticated deep links are stored in `pending-auth-redirect.ts` (5-minute TTL, sessionStorage on web) and restored after sign-in (BUG-530, commit 6f75c488) | `/(auth)/_layout.tsx`, `/(auth)/sign-in.tsx`, `pending-auth-redirect.ts`, `normalize-redirect-path.ts` | Code-only |
| AUTH-14 | Sign-in transition spinner and stuck-state recovery: after `setActive()` succeeds, sign-in shows a "Signing you in…" spinner; if the auth-layout redirect doesn't fire within `SESSION_TRANSITION_MS`, an `ErrorFallback` renders with a Try-again button and a Sign-up escape; phase-2 timeout (+15 s) resets the form with an inline error | `/(auth)/sign-in.tsx` (`isTransitioning`, `transitionStuck` states; `auth-transition.ts`) | Code-only — testIDs `sign-in-transitioning`, `sign-in-transitioning-stuck`, `sign-in-stuck-retry`, `sign-in-stuck-signup` |

## Profiles, Family, Consent, and Account

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| ACCOUNT-01 | Create first profile | `/create-profile` from first-time setup | `e2e/flows/onboarding/create-profile-standalone.yaml` |
| ACCOUNT-02 | Create additional profile | `/profiles` -> `/create-profile` | Partial: profile creation is covered, but the generic add-profile journey is mostly code-only |
| ACCOUNT-03 | Add child profile from More or Profiles | `/(app)/more`, `/profiles`, `/create-profile` | `e2e/flows/parent/add-child-profile.yaml`, `e2e/flows/regression/bug-239-parent-add-child.yaml` |
| ACCOUNT-04 | Profile switching | `/profiles`, `ProfileSwitcher` from learner and parent home | `e2e/flows/account/profile-switching.yaml` |
| ACCOUNT-05 | Family-plan gating and max-profile gating for adding children | `/(app)/more`, `/profiles`, `/(app)/subscription` | Partial: behavior is in code; upgrade path is covered by billing flows |
| ACCOUNT-06 | More tab navigation. Sections reordered by `ea32d358`: Learning Mode → Accommodation → Mentor Memory → Family → Celebrations → Notifications → Account → Other. Account is split out from Other | `/(app)/more` | `e2e/flows/account/more-tab-navigation.yaml` |
| ACCOUNT-07 | Settings toggles for push notifications and weekly digest | `/(app)/more` Notifications section | `e2e/flows/account/settings-toggles.yaml` |
| ACCOUNT-08 | Learning mode, celebration level, and accommodation mode preferences (Accommodation is its own section after `ea32d358`; radio options testID `accommodation-mode-{none|dyslexia|adhd|...}`) | `/(app)/more` | Partial: `e2e/flows/account/settings-toggles.yaml` covers learning-mode and notifications surfaces |
| ACCOUNT-09 | Change password | `AccountSecurity` -> `ChangePassword` on `/(app)/more` | Code-only |
| ACCOUNT-10 | Export my data | `/(app)/more` -> export action | Code-only |
| ACCOUNT-11 | Delete account with 7-day grace period — three-stage flow (warning → typed-confirmation requiring exact "DELETE" + family-pool warning + subscription advisory → scheduled). BUG-910 replaced the native Alert with an in-screen flow | `/delete-account` | `e2e/flows/account/delete-account.yaml`, `e2e/flows/account/account-lifecycle.yaml` |
| ACCOUNT-12 | Cancel scheduled account deletion (testID `delete-account-keep` on the `scheduled` stage) | `/delete-account` scheduled state | Partial: covered inside `e2e/flows/account/account-lifecycle.yaml` |
| ACCOUNT-13 | Privacy policy | `/privacy` | Partial: exercised in account lifecycle and navigation flows |
| ACCOUNT-14 | Terms of service | `/terms` | Partial: exercised in account lifecycle and navigation flows |
| ACCOUNT-15 | Self mentor memory (BUG-918: 'Set by your parent' badge copy hidden for owner profiles) | `/(app)/mentor-memory` | `e2e/flows/account/learner-mentor-memory.yaml`, `e2e/flows/account/learner-mentor-memory-populated.yaml` |
| ACCOUNT-16 | Child mentor memory | `/(app)/child/[profileId]/mentor-memory` | `e2e/flows/parent/child-mentor-memory.yaml`, `e2e/flows/parent/child-mentor-memory-populated.yaml` |
| ACCOUNT-17 | Child memory consent prompt | Child mentor-memory and child detail surfaces | Code-only |
| ACCOUNT-18 | Subject analogy preference after setup (hidden on language subjects per BUG-939) | `/(app)/subject/[subjectId]` | Code-only |
| ACCOUNT-19 | Consent request during underage profile creation | `/create-profile` -> `/consent` | Partial: profile creation and consent flows both exist in E2E |
| ACCOUNT-20 | Child handoff to parent consent request | `/consent` | `e2e/flows/consent/hand-to-parent-consent.yaml` |
| ACCOUNT-21 | Parent email entry, send consent link, resend, and change email. Validates child cannot enter own email as parent (server-side rejection with inline error) | `/consent`, consent pending gate in `/(app)/_layout.tsx` | `e2e/flows/consent/consent-pending-gate.yaml` (parent email entry covered by `consent-coppa-under13.yaml` / `consent-gdpr-under16.yaml`) |
| ACCOUNT-22 | Consent pending gate | `/(app)/_layout.tsx` | `e2e/flows/consent/consent-pending-gate.yaml` |
| ACCOUNT-23 | Consent withdrawn gate | `/(app)/_layout.tsx` | `e2e/flows/consent/consent-withdrawn-gate.yaml` |
| ACCOUNT-24 | Post-approval landing after consent is granted | post-approval surface from app layout | `e2e/flows/consent/post-approval-landing.yaml` |
| ACCOUNT-25 | Parent consent management for a child | `/(app)/child/[profileId]` withdraw / restore consent | `e2e/flows/parent/consent-management.yaml` |
| ACCOUNT-26 | Regional consent variants | GDPR and above-threshold create-profile branches (COPPA-distinct path removed by 11+ floor) | `e2e/flows/consent/consent-coppa-under13.yaml`, `e2e/flows/consent/consent-gdpr-under16.yaml`, `e2e/flows/consent/consent-above-threshold.yaml` |
| ACCOUNT-27 | Parent consent deny confirmation: when the parent declines from the email link, a confirmation dialog gates the deny commit | `/consent` deny path | `e2e/flows/consent/consent-deny-confirmation.yaml` |
| ACCOUNT-28 | App language (UI locale) edit — bottom-sheet language picker on More (gated by `FEATURE_FLAGS.I18N_ENABLED`); rotates `i18next` resource and persists to SecureStore | `/(app)/more` Account section | `e2e/flows/onboarding/settings-language-edit.yaml` |
| ACCOUNT-29 | Tutor language edit from More — opens `/(app)/onboarding/language-picker?returnTo=settings` and returns to More on save (distinct from per-subject native-language in SUBJECT-08) | `/(app)/more` -> `/(app)/onboarding/language-picker` | `e2e/flows/account/tutor-language-edit.yaml` |
| ACCOUNT-30 | Impersonated-child guard on More: when `useActiveProfileRole() === 'impersonated-child'`, Sign out, Delete account, Export my data, and Subscription rows are hidden (profile-as-lens phase 1) | `/(app)/more` | Code-only — covered by `more.test.tsx` |

## Home, Navigation, and Subject Setup

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| HOME-01 | Learner home — redesigned (commit 435a7b89): subject-tint carousel (`home-subject-carousel`, `home-subject-card-{id}`), add-subject tile (`home-add-subject-tile`), empty-subjects state (`home-empty-subjects`, `home-add-first-subject`), Ask Anything bar (`home-ask-anything`), quick-action row (`home-action-study-new`, `home-action-homework`, `home-action-practice`), CoachBand (gated by `FEATURE_FLAGS.COACH_BAND_ENABLED`). Replaces the previous IntentCard pattern | `/(app)/home` via `LearnerScreen` | Covered indirectly by many learning and subject flows |
| HOME-02 | Parent gateway home | `/(app)/home` via `ParentGateway` | `e2e/flows/parent/parent-tabs.yaml`, `e2e/flows/parent/parent-dashboard.yaml` |
| HOME-03 | Parent tabs and parent-mode navigation | `/(app)` tab shell, `/(app)/home`, `/(app)/library`, `/(app)/progress`, `/(app)/more` | `e2e/flows/parent/parent-tabs.yaml` |
| HOME-04 | Animated splash and initial shell | root `_layout.tsx` splash / launch experience | `e2e/flows/edge/animated-splash.yaml` |
| HOME-05 | Empty first-user state (no subjects yet) — surfaced inline on the home redesign via `home-empty-subjects` block; CTA `home-add-first-subject` deep-links into `/create-subject` | `LearnerScreen` empty-subjects branch | `e2e/flows/edge/empty-first-user.yaml` |
| HOME-06 | Resume interrupted session (driven by SecureStore session-recovery marker + `useContinueSuggestion`; surfaced as the active-subject card or a recovery affordance on the home carousel) | `LearnerScreen` continue affordance | Code-only |
| HOME-07 | Add-first-child gate for parent owners on family/pro plans without a child profile yet — "Add a child to get started" branch on parent home; CTA navigates to `/create-profile` | `/(app)/home` parent branch | Code-only |
| HOME-08 | Home loading-timeout fallback | `/(app)/home` after 10s of profile load | Code-only — testIDs `home-loading-timeout`, `home-loading-retry`, `timeout-library-button`, `timeout-more-button` |
| SUBJECT-01 | Create subject from learner home | `/(app)/home` Add-subject tile / "Study new" quick action -> `/create-subject` | Covered by subject onboarding flows |
| SUBJECT-02 | Create subject from library empty state | `/(app)/library` -> `/create-subject` | Partial: library flows cover it indirectly |
| SUBJECT-03 | Create subject from chat when classifier cannot match an existing subject | session screen -> `/create-subject?returnTo=chat` | `e2e/flows/regression/bug-234-chat-subject-picker.yaml`, `e2e/flows/regression/bug-236-subject-returns-to-chat.yaml` |
| SUBJECT-04 | Create subject from homework | homework camera screen -> `/create-subject` when needed | Partial: homework flows cover this branch indirectly |
| SUBJECT-05 | Subject resolution and clarification suggestions | `/create-subject` resolve / suggest / use-my-words flow | `e2e/flows/onboarding/create-subject-resolve.yaml`, `e2e/flows/regression/bug-233-chat-classifier-easter.yaml` |
| SUBJECT-06 | Broad subject flow: create a broad subject, then pick a book | `/create-subject` -> `/(app)/pick-book/[subjectId]` | `e2e/flows/subjects/practice-subject-picker.yaml`, `e2e/flows/regression/bug-237-focused-book-generation.yaml` |
| SUBJECT-07 | Focused subject or focused-book flow | `/create-subject` -> first learning session | `e2e/flows/onboarding/create-subject.yaml` |
| SUBJECT-08 | Per-subject native-language setup for language-learning subjects (four-strands pedagogy). Distinct from the profile-wide `conversationLanguage` set in SUBJECT-16 | `/(app)/onboarding/language-setup` | Covered by onboarding flows; language branch is route-backed |
| SUBJECT-12 | View curriculum without committing to a learning session | curriculum screen and library/book entry routes | `e2e/flows/onboarding/view-curriculum.yaml` |
| SUBJECT-14 | Placement / knowledge assessment | `/assessment` | `e2e/flows/assessment/assessment-cycle.yaml` |
| SUBJECT-16 | Conversation-language picker (mandatory, profile-wide). Sets `conversationLanguage`. First entry: post-create-profile onboarding before pronouns. Settings re-entry via ACCOUNT-29 with `returnTo=settings` | `/(app)/onboarding/language-picker` | `e2e/flows/onboarding/onboarding-extras-flow.yaml`, `e2e/flows/account/tutor-language-edit.yaml` |
| SUBJECT-17 | Pronouns picker (preset options + free-text "Other"). Self-skips when learner age < `PRONOUNS_PROMPT_MIN_AGE` (13) | `/(app)/onboarding/pronouns` | `e2e/flows/onboarding/onboarding-extras-flow.yaml` |

## Learning, Chat, Library, Retention, and Progress

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| LEARN-01 | Freeform chat: "Just ask anything" | `/(app)/home` Ask Anything bar -> `/(app)/session?mode=freeform` | `e2e/flows/learning/freeform-session.yaml` |
| LEARN-02 | Guided learning session from a subject or topic | `/(app)/session`, `/(app)/topic/[topicId]`, book routes (route lives at `(app)/session/index.tsx`) | `e2e/flows/learning/start-session.yaml`, `e2e/flows/learning/core-learning.yaml` |
| LEARN-03 | First session experience | first guided session | `e2e/flows/learning/first-session.yaml` |
| LEARN-04 | Core learning loop | standard live tutoring session | `e2e/flows/learning/core-learning.yaml` |
| LEARN-05 | Coach bubble visual variants | live session persona/theme variants | `e2e/flows/learning/coach-bubble-light.yaml`, `e2e/flows/learning/coach-bubble-dark.yaml` |
| LEARN-06 | Voice input and voice-speed controls | live session voice toggle / controls | `e2e/flows/learning/voice-mode-controls.yaml` |
| LEARN-07 | Session summary: submit summary or skip summary; "View full transcript" CTA navigates to LEARN-23. Includes `session-next-topic-card` (LLM-generated `nextTopicTitle` + `nextTopicReason` + "Continue learning" CTA → opens a guided session at `nextTopicId`); applies to all tutoring paths (freeform, guided, homework, practice, relearn, recitation). `nextTopicReason` is fed into the next session's system prompt via `session-context-builders.ts:324`. Audit Section E + Slice 2 wire `topicOrder` ordered-list rendering and the second-session-open home teaser, both of which are missing today | `/session-summary/[sessionId]` | `e2e/flows/learning/session-summary.yaml` |
| LEARN-08 | Library v3 — subject-first shelf list with retention pills and an inline search bar (LEARN-25). Tapping a subject opens the subject shelf, where books and suggestions live. Replaces the previous shelves/books/topics tab architecture (PR #144) | `/(app)/library` | `e2e/flows/learning/library-navigation.yaml` |
| LEARN-09 | Subject shelf -> book selection. Distinguishes empty-shelf (no books yet) from unstarted-topics (books exist, no progress) per BUG-920 | `/(app)/shelf/[subjectId]`, `/(app)/pick-book/[subjectId]` | `e2e/flows/subjects/practice-subject-picker.yaml`, `e2e/flows/subjects/multi-subject.yaml` |
| LEARN-10 | Book detail and start learning from a book | `/(app)/shelf/[subjectId]/book/[bookId]` | `e2e/flows/learning/book-detail.yaml` |
| LEARN-11 | Manage subject status: active, paused, archived | library manage-subject modal | `e2e/flows/learning/manage-subject-status.yaml` |
| LEARN-12 | Topic detail (redesigned in commit 855a632f) | `/(app)/topic/[topicId]` | `e2e/flows/retention/topic-detail.yaml`, `e2e/flows/retention/topic-detail-adaptive-buttons.yaml` |
| LEARN-13 | Recall check | `/(app)/topic/recall-test` | `e2e/flows/retention/recall-review.yaml` |
| LEARN-14 | Failed recall remediation | recall flow -> remediation card | `e2e/flows/retention/failed-recall.yaml` |
| LEARN-15 | Relearn flow: same method or different method. **Data-layer anomaly:** does not flow through the canonical `startSession` service — `apps/api/src/services/retention-data.ts:858-873` inserts directly into `learning_sessions` with `metadata: { effectiveMode: 'relearn' }`. Any session-start logic added centrally (e.g., topic-intent matching from audit Section J / Slice 1 PR 5i) needs to be extended here too, or relearn sessions will silently miss it | `/(app)/topic/relearn` | `e2e/flows/retention/relearn-flow.yaml`, `e2e/flows/retention/relearn-child-friendly.yaml` |
| LEARN-16 | Retention review from library or review surfaces | library / retention routes | `e2e/flows/retention/retention-review.yaml`, `e2e/flows/retention/library.yaml` |
| LEARN-17 | Progress overview (top-level tab) | `/(app)/progress` | `e2e/flows/progress/progress-analytics.yaml` |
| LEARN-18 | Subject progress detail | `/(app)/progress/[subjectId]` | Partial: `e2e/flows/progress/progress-analytics.yaml` |
| LEARN-19 | Streak display | progress / reward surfaces | `e2e/flows/edge/streak-display.yaml` |
| LEARN-20 | Milestones list | `/(app)/progress/milestones` | Partial: `e2e/flows/progress/progress-analytics.yaml` covers empty state; `ErrorFallback` paths still Code-only |
| LEARN-21 | Cross-subject vocabulary browser | `/(app)/progress/vocabulary` | `e2e/flows/progress/vocabulary-browser.yaml` |
| LEARN-22 | Per-subject vocabulary list (delete words, view CEFR + word/phrase badges; vocab quiz card label per BUG-891) | `/(app)/vocabulary/[subjectId]` | `e2e/flows/learning/vocabulary-flow.yaml` |
| LEARN-23 | Read-only session transcript view (BUG-889). Renders exchange history from `GET /sessions/:sessionId/transcript`, filters out `isSystemPrompt` rows, applies `stripEnvelopeJson` per bubble (BUG-941). Registered as `fullScreenModal` in root `_layout.tsx`. `goBackOrReplace` back navigation. Gated for parent-proxy mode at the LEARN-07 link | `session-transcript/[sessionId]` (top-level, not under `(app)`) | `e2e/flows/learning/session-transcript.yaml`, `e2e/flows/learning/session-transcript-parent-proxy.yaml` |
| LEARN-24 | Saved bookmarks screen — paginated list of bookmarked chat messages with subject name, optional topic title, relative date, and truncated content with expand-on-tap; swipe/trash delete with confirm; parent-proxy mode disables delete | `/(app)/progress/saved` (driven by `useBookmarks` infinite query + `useDeleteBookmark`) | `e2e/flows/progress/saved-bookmarks.yaml`, `e2e/flows/progress/saved-bookmarks-parent-proxy.yaml` |
| LEARN-25 | Library inline search — `LibrarySearchBar` with 300 ms debounce drives `useLibrarySearch`; nested book / topic / note matches keep their parent subject visible, then the subject shelf handles the next level (PR #144) | `/(app)/library` search bar | `e2e/flows/learning/library-search.yaml` |
| LEARN-26 | First-curriculum session entry (the post-onboarding wall — see "Path 0" in `docs/flows/learning-path-flows.md`). `POST /subjects/:subjectId/sessions/first-curriculum` waits for the first materialized topic before creating a `learning_sessions` row. Server picks the first topic by `sortOrder` (`findFirstAvailableTopicId` in `apps/api/src/services/session/session-crud.ts`), so topic-grain learner intent is dropped here. **Audit Section A (pre-warm, PR 5d) shrinks the wait; Section J (topic matching, PR 5i) closes the intent-drop**. Entry comes from create-subject, book detail, and language setup after submit. Error path on topic timeout returns a 504-style "still preparing your subject" error to the screen | API-driven from `/create-subject`, book detail, and `/(app)/onboarding/language-setup` | Code-only — covered indirectly by `onboarding/create-subject.yaml`; no dedicated flow asserts the polling behavior or the topic-grain drop |

## Practice Hub and Practice Activities

The Practice hub is the top-level surface for activities that are not full tutoring sessions. It is reached from the home quick-action row (`home-action-practice`). The hub itself is **not** a tab — it is a non-tab route under `/(app)/practice` that hides the tab bar at the route level.

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| PRACTICE-01 | Practice hub menu (Review topics, Recite, Dictation, Quiz) | `/(app)/practice` reached from home quick-action `home-action-practice` | `e2e/flows/practice/practice-hub-navigation.yaml` |
| PRACTICE-02 | Review topics shortcut (jumps directly into the next overdue topic relearn flow) | `/(app)/practice` -> `/(app)/topic/relearn` with `topicId/subjectId/topicName` params | Partially via existing relearn flows and PRACTICE-01 tap |
| PRACTICE-03 | Recitation session (recite a poem / text from memory) | `/(app)/practice` -> `/(app)/session?mode=recitation` | `e2e/flows/practice/recitation-session.yaml` |
| PRACTICE-04 | "All caught up" empty state with next-review countdown | `/(app)/practice` review section when `totalOverdue === 0` | `e2e/flows/practice/all-caught-up.yaml` |

### Quiz Activities

Quiz flow uses a React context (`useQuizFlow` from `(app)/quiz/_layout`) to pass round state across the four screens. Mid-round prefetch starts at the halfway point so "Play Again" feels instant on the results screen.

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| QUIZ-01 | Quiz activity picker (Capitals, Vocabulary per language, Guess Who). Vocabulary cards dynamically label as "<lang> basics" with a starter-words subtitle when the learner has fewer than `PERSONAL_VOCAB_QUIZ_THRESHOLD` (5) recorded words (BUG-891); locked-vocab card (testID `quiz-vocab-locked`) shown when no four_strands subject exists | `/(app)/quiz` (index) | `e2e/flows/quiz/quiz-full-flow.yaml` |
| QUIZ-02 | Round generation loading screen with rotating "shuffling / picking a theme" copy and 20-second "still trying" hint | `/(app)/quiz/launch` | `e2e/flows/quiz/quiz-full-flow.yaml` — testIDs `quiz-launch-loading`, `quiz-launch-cancel`, `quiz-launch-timed-out`, `quiz-launch-error` |
| QUIZ-03 | Round play screen — multiple choice (Capitals / Vocabulary). When `currentQuestion.freeTextEligible === true`, renders a TextInput + Submit button (testIDs `quiz-free-text-input`, `quiz-free-text-field`, `quiz-free-text-submit`) instead of option buttons. `answerState`, `selectedAnswer`, `freeTextAnswer`, `guessWhoCluesUsed`, and the per-question timer (`elapsedMs`, `questionStartTimeRef`) all reset in the same React batch on advance (BUG-929 + CR-PR129-M4). Server checks each answer via `POST /quiz/rounds/:id/check` | `/(app)/quiz/play` with `currentQuestion.type === 'capitals' \| 'vocabulary'` | `e2e/flows/quiz/quiz-full-flow.yaml` |
| QUIZ-04 | Round play screen — Guess Who clue reveal (clues unlock progressively, score scaled by `cluesUsed`). `guessWhoCluesUsed` reset to 1 and `freeTextAnswer` cleared in the same batch as `answerState` on advance | `/(app)/quiz/play` with `currentQuestion.type === 'guess_who'` | `e2e/flows/quiz/quiz-full-flow.yaml` |
| QUIZ-05 | Mid-round quit with confirm-style escape (close icon top-left). In-app Modal (not `Alert.alert` / `window.confirm`) to avoid web renderer-freeze (BUG-892) | `/(app)/quiz/play` -> `goBackOrReplace('/(app)/quiz')` | `e2e/flows/quiz/quiz-quit-modal.yaml` |
| QUIZ-06 | Round complete error retry | `/(app)/quiz/play` `completeError` inline card with Retry / Exit | Code-only — testIDs `quiz-play-error`, `quiz-play-retry`, `quiz-play-exit` |
| QUIZ-07 | Results screen with celebration tier (perfect / great / nice), score, theme, XP earned, Play Again, Done. Streak recording is soft-failed via try/catch so API errors cannot block the celebration screen | `/(app)/quiz/results` | `e2e/flows/quiz/quiz-full-flow.yaml` — `BrandCelebration` only on perfect/great; results hardening verified by `apps/mobile/src/app/(app)/quiz/results.test.tsx` |
| QUIZ-08 | Quiz quota / consent / forbidden errors render typed-error message + suppress Retry | `/(app)/quiz/launch` (classifies `QUOTA_EXCEEDED`, `FORBIDDEN`, `CONSENT_*` from `apiClient`'s typed `ApiResponseError.code`) | `e2e/flows/quiz/quiz-error-quota.yaml`, `e2e/flows/quiz/quiz-error-consent.yaml`, `e2e/flows/quiz/quiz-error-forbidden.yaml` |
| QUIZ-09 | Quiz history: list of completed rounds grouped by Today / Yesterday / locale date, with empty state that deep-links back to the quiz index | `/(app)/quiz/history` reached from the quiz index | Code-only — testIDs `quiz-history-loading`, `quiz-history-empty`, `quiz-history-try-quiz`, `quiz-history-screen` |
| QUIZ-10 | Quiz round detail: drill into a completed round and see each question with correct answer + accepted aliases. Guess Who rows show the first clue (truncated to 60 chars) as the collapsed-row prompt instead of the literal string "Guess Who" (BUG-932) | `/(app)/quiz/[roundId]` reached from the history list | Code-only — testIDs `round-detail-loading`, `round-detail-error`; data via `GET /quiz/rounds/:id` typed as `CompletedRoundDetail` |
| QUIZ-11 | Malformed-round guard: `capitals`/`vocabulary` questions whose options array dedupes to fewer than 2 unique values render an actionable error screen instead of a dead-end single-button question (BUG-812 / F-015) | `/(app)/quiz/play` malformed branch | `e2e/flows/quiz/quiz-malformed-round.yaml` |
| QUIZ-12 | Wrong-answer dispute: a "Not quite right?" affordance flags the question; the card swaps to "Noted — we'll review this" (BUG-469, restricted to wrong answers per BUG-927) | `/(app)/quiz/play` answer-feedback card | `e2e/flows/quiz/quiz-dispute.yaml` |
| QUIZ-13 | Answer-check failure non-blocking warning: when `POST /quiz/rounds/:id/check` fails, an inline warning ("Answer check failed — result may be inaccurate") renders and the round continues assuming wrong (IMP-7, BUG-799) | `/(app)/quiz/play` `answerCheckFailed` flag | `e2e/flows/quiz/quiz-answer-check-failure.yaml` |

### Dictation

Dictation is a five-screen flow under `/(app)/dictation` with its own React context (`useDictationData` from `(app)/dictation/_layout`). All five screens hide the tab bar.

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| DICT-01 | Dictation choice screen ("I have a text" vs "Surprise me") | `/(app)/dictation` (index) | `e2e/flows/dictation/dictation-full-flow.yaml` — testIDs `dictation-choice-screen`, `dictation-homework`, `dictation-surprise`, `dictation-error` (inline error block), `dictation-error-retry`, `dictation-loading`, `dictation-loading-cancel`, `dictation-timeout-error`, `dictation-timeout-retry`, `dictation-choice-back` |
| DICT-02 | OCR text preview + edit before starting (homework path) | `/(app)/dictation/text-preview` (entered from camera-OCR pipeline; receives `ocrText` param) | Code-only |
| DICT-03 | "Surprise me" LLM-generated dictation (`POST /dictation/generate`). Surfaces typed errors via `formatApiError` Alert. 20s hard timeout shows an inline error with retry (`dictation-timeout-error` / `dictation-timeout-retry`); in-flight generation can be cancelled (`dictation-loading-cancel`); late responses after timeout/cancel are suppressed via `generateCancelledRef` | `/(app)/dictation` index -> `/(app)/dictation/playback` | `e2e/flows/dictation/dictation-full-flow.yaml` |
| DICT-04 | Playback screen (TTS reads each sentence; pace + punctuation + skip + repeat controls; tap-to-pause; countdown in target language) | `/(app)/dictation/playback` | `e2e/flows/dictation/dictation-full-flow.yaml` — preferences stored per profile in SecureStore (`dictation-pace-${profileId}`, `dictation-punctuation-${profileId}`) |
| DICT-05 | Mid-dictation exit confirm dialog ("Are you sure?") on hardware back | `/(app)/dictation/playback` `BackHandler` listener | Code-only |
| DICT-06 | Completion screen (Well done! Check my writing / I'm done / Try another dictation). Includes review-in-progress spinner with cancel and a 20s review timeout; deep-link / stale-context guard renders a recovery CTA. i18n: alert buttons use `t('common.ok')` / `t('errors.generic')` (commit 3d2c373a) | `/(app)/dictation/complete` | `e2e/flows/dictation/dictation-full-flow.yaml` — testIDs `dictation-complete-screen`, `complete-check-writing`, `complete-done`, `complete-try-again`, `review-cancel`, `review-timeout-error`, `review-timeout-retry`, `dictation-complete-missing-data`, `dictation-complete-missing-start` |
| DICT-07 | Photo review of handwritten dictation via multimodal LLM | `/(app)/dictation/complete` "Check my writing" -> camera capture -> `POST /dictation/review` (image base64 + sentences) -> `/(app)/dictation/review` | Partial: `e2e/flows/dictation/dictation-review-flow.yaml` covers review path; camera capture step skipped (hardware dependency) |
| DICT-08 | Sentence-level remediation (rewrite each mistake; autocorrect disabled; accepts whatever child types) | `/(app)/dictation/review` | `e2e/flows/dictation/dictation-review-flow.yaml` |
| DICT-09 | Perfect-score celebration screen | `/(app)/dictation/review` short-circuit when `mistakes.length === 0` | `e2e/flows/dictation/dictation-perfect-score.yaml` |
| DICT-10 | Recording dictation result on "I'm done" or after review (`POST /dictation/results`) with retry alert if save fails | `/(app)/dictation/complete` and `/(app)/dictation/review` `useRecordDictationResult` | Code-only — POST side-effect only, no testID to assert |

## Homework and Parent Experience

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| HOMEWORK-01 | Start homework from learner home or More screen | learner home `home-action-homework`, `/(app)/more` -> `/(app)/homework/camera` | `e2e/flows/homework/homework-from-entry-card.yaml`, `e2e/flows/homework/homework-flow.yaml` |
| HOMEWORK-02 | Camera permission, capture, preview, and OCR. Permission phase has two distinct sub-states: first-request prompt (`grant-permission-button`) and permanently-denied/Settings-redirect (`open-settings-button`); auto-refreshes on app resume (commit 22c7c99c). i18n keys now render translated strings (C-1 fix, commit d0e1efdc); null-safety + fetch-boundary tests added (commit fc8413ed) | `/(app)/homework/camera` | `e2e/flows/homework/camera-ocr.yaml` |
| HOMEWORK-03 | Manual fallback when OCR is weak or fails | camera fallback and manual text entry | Covered inside `e2e/flows/homework/camera-ocr.yaml` |
| HOMEWORK-04 | Homework tutoring session with multi-problem navigation | `/(app)/session?mode=homework` | `e2e/flows/homework/homework-flow.yaml` |
| HOMEWORK-05 | Gallery import (pick existing photo instead of camera capture) | `/(app)/homework/camera` gallery picker | Code-only — see `2026-04-10-homework-gallery-import-design.md` |
| HOMEWORK-06 | Image pass-through to multimodal LLM (vision) for richer help | session route after homework capture; same image path used by dictation review | Code-only — see `2026-04-16-homework-image-vision-design.md` |
| HOMEWORK-07 | Camera permission onboarding — first-request prompt and permanently-denied Settings-redirect state; auto-refreshes permission on return from OS Settings so camera unlocks without a manual restart | `/(app)/homework/camera` permission phase | `e2e/flows/homework/camera-permission-denied.yaml` (permanently-denied state); first-request covered by `homework/camera-ocr.yaml` |
| PARENT-01 | Parent dashboard (parents only — solo accounts without linked children render `LearnerScreen`, not a dashboard). `MetricInfoDot` + `SamplePreview` parent components active across child detail / session / topic surfaces (commit 02e4c519) | `/(app)/dashboard` | `e2e/flows/parent/parent-dashboard.yaml` |
| PARENT-02 | Multi-child dashboard | dashboard with multiple linked children | `e2e/flows/parent/multi-child-dashboard.yaml` |
| PARENT-03 | Child detail drill-down | `/(app)/child/[profileId]` | `e2e/flows/parent/child-drill-down.yaml` |
| PARENT-04 | Child subject -> topic drill-down | `/(app)/child/[profileId]/subjects/[subjectId]`, `topic/[topicId]` | Covered inside `e2e/flows/parent/child-drill-down.yaml` |
| PARENT-05 | Child session / transcript drill-down. Transcript link gated in parent-proxy mode (CR-PR129-M5, commit 3c542326); `as never` cast removed (CR-PR129-M8, commit 6d9a3bc4) | `/(app)/child/[profileId]/session/[sessionId]` | Covered inside `e2e/flows/parent/child-drill-down.yaml` |
| PARENT-06 | Child reports list (weekly snapshots + monthly reports) and report detail. Weekly snapshot cards deep-link into the new `weekly-report/[weeklyReportId]` route (PARENT-13) | `/(app)/child/[profileId]/reports`, `report/[reportId]` | `e2e/flows/parent/child-report-detail.yaml`, `e2e/flows/parent/child-reports-empty.yaml` |
| PARENT-07 | Parent library view | `/(app)/library` while parent profile is active | `e2e/flows/parent/parent-library.yaml` |
| PARENT-08 | Subject raw-input audit for parents | parent drill-down / raw input review surfaces | `e2e/flows/parent/subject-raw-input-audit.yaml` |
| PARENT-09 | Guided label tooltip | parent dashboard or parent report surfaces | `e2e/flows/parent/guided-label-tooltip.yaml` |
| PARENT-10 | Parent child-topic "Understanding" card (plain-English mastery label) with data-gated Retention card | `/(app)/child/[profileId]/topic/[topicId]` | Code-only — testIDs `topic-understanding-card` (replaces `topic-mastery-card`), `topic-retention-card`; labels from `getUnderstandingLabel` and `getParentRetentionInfo` in `apps/mobile/src/lib/parent-vocab.ts` |
| PARENT-11 | Parent child-session recap: narrative block, highlight block, Conversation prompt with copy-to-clipboard (Copied! / Copy failed states), and `EngagementChip` (curious / stuck / breezing / focused / scattered) | `/(app)/child/[profileId]/session/[sessionId]` | `e2e/flows/parent/child-session-recap.yaml` (populated), `e2e/flows/parent/child-session-recap-empty.yaml` |
| PARENT-12 | Parent child-subject detail retention badges gated on data presence | `/(app)/child/[profileId]/subjects/[subjectId]` | `e2e/flows/parent/child-subject-retention.yaml` (badges present), `e2e/flows/parent/child-subject-no-retention.yaml` (suppressed) |
| PARENT-13 | Child weekly report detail — push-notification-driven weekly progress screen (sessions, time on app, topics-mastered metrics for a given week); marks report viewed on mount | `/(app)/child/[profileId]/weekly-report/[weeklyReportId]` | `e2e/flows/parent/child-weekly-report.yaml` |

## Billing and Monetization

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| BILLING-01 | Subscription screen: current-plan card, status badge (Active / Trial / Past due / Cancelling / Expired), trial banner when `status === 'trial'`, usage meter with daily sub-meter for free tier, cancellation notice | `/(app)/subscription` | `e2e/flows/billing/subscription-details.yaml` |
| BILLING-02 | Upgrade plan purchase flow: post-purchase polling indicator (`purchase-polling-indicator`) while webhook confirms new tier; already-purchased error prompts Restore | `/(app)/subscription` -> RevenueCat purchase | `e2e/flows/billing/upgrade-pending-state.yaml` (polling), `e2e/flows/billing/upgrade-confirmed-state.yaml` (post-webhook); RevenueCat IAP happy path remains Code-only |
| BILLING-03 | Trial / plan usage / family-pool detail states — all rendered from a single `/(app)/subscription` screen | `/(app)/subscription` | `e2e/flows/billing/subscription-details.yaml` (seeds `trial-active` and asserts `trial-banner` per BUG-966) |
| BILLING-04 | Restore purchases | `/(app)/subscription` restore action | `e2e/flows/billing/subscription-details.yaml` |
| BILLING-05 | Manage billing deep link | `/(app)/subscription` -> App Store / Play subscriptions | Partial: surfaced in subscription-details flow |
| BILLING-06 | Child paywall and notify-parent action — `ChildPaywall` component is conditionally rendered inside `/(app)/subscription` (not a separate route) | child profile with no entitlement | `e2e/flows/billing/child-paywall.yaml` |
| BILLING-07 | Daily quota exceeded paywall (adult quota path; rendered inline on the same screen as BILLING-06) | subscription / quota limit handling | `e2e/flows/billing/daily-quota-exceeded.yaml` |
| BILLING-08 | Family pool visibility: `family-pool-section` testID rendered when `useFamilySubscription` returns data for `tier === 'family'`. Family static comparison card also added to PLANS for Family users (BUG-917) | family usage details in subscription screen | `e2e/flows/billing/family-pool.yaml` |
| BILLING-09 | Top-up question credits | subscription top-up section | `e2e/flows/billing/top-up.yaml` |
| BILLING-10 | BYOK waitlist | subscription BYOK waitlist CTA | Code-only — UI commented out in source |
| BILLING-11 | Trial state UI (BUG-966): `trial-banner` card above Current Plan with "Trial active" headline + optional `subscription.trialEndsAt`; status badge reads "Trial" | `/(app)/subscription` `status === 'trial'` branch | `e2e/flows/billing/subscription-details.yaml` |
| BILLING-12 | Pro / Family static comparison cards (BUG-917): when a Pro or Family customer views PLANS and RevenueCat offerings are unavailable, `getTiersToCompare(currentTier)` appends a read-only Family or Pro card (preserves BUG-899 — no public upsell for store-unapproved SKUs) | `/(app)/subscription` static PLANS block | `e2e/flows/billing/static-comparison-family.yaml`, `e2e/flows/billing/static-comparison-pro.yaml` |

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
| QA-10 | Dictation full flow regression: choice -> playback -> complete (incl. timeout / cancel branches) | `/(app)/dictation/**` | `e2e/flows/dictation/dictation-full-flow.yaml` |
| QA-11 | Quiz full flow regression: index -> launch -> play -> results, including Play Again with prefetched round | `/(app)/quiz/**` | `e2e/flows/quiz/quiz-full-flow.yaml` |
| QA-12 | Consent deny-confirmation regression: parent deny path with confirmation gate | `/consent` deny path | `e2e/flows/consent/consent-deny-confirmation.yaml` |

## Cross-Cutting Behaviors Worth Calling Out

These are not single-screen flows, but they shape user experience across multiple screens.

| ID | Behavior | Where it activates |
| --- | --- | --- |
| CC-01 | Conversation-stage-aware chips and feedback gating in tutoring sessions | `SessionMessageActions` reads `conversationStage` and shows quick chips (`Give me a hint`, `Show an example`, etc.) only after the AI has moved past the greeting (`isGreeting` regex detector). See spec `2026-04-15-conversation-stage-chips-design.md`. |
| CC-02 | Greeting-aware subject classification | `useSubjectClassification` skips classification while the conversation stage is still "greeting", preventing the classifier from misfiring on a hello. |
| CC-03 | Animation polish (icon transitions, intent card press, celebrations, permission onboarding) | `BrandCelebration`, intent affordances (now using left accent border + icon), session message animations, and the permission onboarding screens added in commit f510b6bd. See `docs/_archive/plans/2026-04-16-animation-improvements-design.md`. |
| CC-04 | `goBackOrReplace(router, fallback)` is mandatory on every back button | Replaces direct `router.back()`. Prevents dead-end when there is no back history (deep link, web reload). Sweep applied to all screens. |
| CC-05 | Continue-where-you-left-off card | Driven by `useContinueSuggestion` API + a SecureStore session-recovery marker. The marker takes priority when fresh; otherwise the API suggestion is used; otherwise the next overdue review topic is offered. |
| CC-06 | Top-up purchase confidence | Two-stage polling progress message in the top-up flow with a confident timeout copy. See `2026-04-10-topup-purchase-confidence-design.md`. |
| CC-07 | Accommodation badge surfaces | Non-deletable accommodation badge on child mentor-memory; accommodation mode selector on parent child detail and self-managed learner settings (FR255). Role-gated copy per BUG-918. |
| CC-08 | Parent-facing metric vocabulary canon | `apps/mobile/src/lib/parent-vocab.ts` centralises understanding labels, parent retention mapping, and tooltip copy. Shared by PARENT-10, PARENT-11, PARENT-12 so wording stays consistent across parent surfaces. |
| CC-09 | Opaque web layout backgrounds to prevent screen bleed-through | All 14 `Stack`/`Tabs` `_layout.tsx` files declare `contentStyle`/`sceneStyle` with a solid background. Fixes web-only visual regressions when navigators nest. |
| CC-10 | Soft-fail side effects on completion screens | Quiz results wraps streak recording in try/catch so the celebration screen is never blocked by an API failure. Applied to quiz; dictation (`useRecordDictationResult`), homework, and session completion surfaces remain candidates. |
| CC-11 | i18n / `t()` cross-cutting string layer (commits b7e478a8 + 61dd2a2e + d0e1efdc) | All user-facing strings flow through `i18next.t()`. Error messages classified at runtime so they reflect the active locale. Locales bundled: en, nb, de, es, pl, pt, ja. Live language switching is intentionally deferred — see `format-api-error.ts` TODO. |
| CC-12 | FeedbackProvider + shake-to-feedback on all gate screens (commit 08cf3749) | `FeedbackProvider.tsx` wraps gate screens; `use-shake-detector.ts` triggers the feedback sheet on device shake. Affects auth/consent/paywall gates and the More screen. |
| CC-13 | Streaming error classification + stream-fallback guard (commits 2a7b08aa, 855a632f) | SSE stream errors are typed and classified via the same `classifyApiError` pipeline as REST errors; fallback guard prevents the UI from hanging on partial-stream failure. Verified by `sse.test.ts`. |
| CC-14 | Envelope-strip render guard at chat-bubble boundary (BUG-941, commit 34b13650) | `strip-envelope.ts` is applied at `MessageBubble` render to prevent leaked `{"type":"message","content":"…"}` JSON from rendering as raw text. Also applied in `session-transcript`. |
| CC-15 | RN Web stale-send block in ChatShell (BUG-886) | `ChatShell.tsx` blocks duplicate Send taps that arrive after submission has already been dispatched on RN Web (rapid pointer events can fire twice). Verified by `ChatShell.test.tsx`. |
| CC-16 | HMR-safe error type guards in `format-api-error.ts` (BUG-947) | All `instanceof` checks for typed API errors (`ForbiddenError`, `QuotaExceededError`, `UpstreamError`, etc.) are replaced with `.name` string + property-shape guards so Metro HMR module reloads do not break class identity. |
| CC-17 | Profile-as-lens navigation pattern (commit a72ebfac) | Profile-scoped screens receive the active profile via a navigation lens (`/(app)/child/[profileId]` and equivalent) rather than re-fetching at the screen level. `(app)/_layout.tsx` is the authority. `useActiveProfileRole()` gates destructive More actions for impersonated-child sessions (ACCOUNT-30). |
| CC-18 | Stable FlatList refs (PERF-10, commit 088640c8) | Hoisted `keyExtractor` / `renderItem` references prevent virtualisation from being defeated by re-render churn. Applied to library, vocabulary, history, and bookmarks lists. |

## Best Next Candidates for Dedicated Flow Docs or E2E Coverage

Stages 1–5 addressed the majority of the original backlog. The following gaps remain as of 2026-05-04:

**Deferred (infrastructure / API blockers):**
- OAuth happy-path beyond button rendering — requires `CLERK_TESTING_TOKEN` (AUTH-05, AUTH-09)
- Session-expired forced sign-out + banner — requires Clerk token expiry hook (AUTH-11)
- Deep-link auth redirect preservation — ADB deep-link unreliable on Maestro 2.2.0 (AUTH-13)
- Sign-in transition stuck-state recovery — controlled slow-network required (AUTH-14)
- Change password full-auth path — requires Clerk testing hooks (ACCOUNT-09)
- Resume interrupted session via Continue — SecureStore manipulation unreliable (HOME-06)
- Home loading-timeout fallback — 10s timeout hard to trigger reliably (HOME-08)
- BYOK waitlist — UI commented out in source (BILLING-10)

**Low-priority code-only surfaces:**
- Milestones `ErrorFallback` paths (LEARN-20) — no seed for that error state
- Shake-to-feedback on gate screens (CC-12) — shake gesture not supported in emulator
- i18n live-switch smoke (CC-11) — deferred per architecture decision
- Streaming error recovery (CC-13) — requires mid-stream failure injection
- Envelope-strip regression (CC-14) — covered by `ChatShell.test.tsx` unit tests
- Profile-as-lens transition (CC-17) — complex multi-profile state; lower risk than session-level flows
