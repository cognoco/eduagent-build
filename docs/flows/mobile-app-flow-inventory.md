# Mobile App Flow Inventory

Current-state flow map for the Expo mobile app as of 2026-04-10.

Source of truth used for this inventory:
- `apps/mobile/src/app/**`
- `apps/mobile/src/components/**`
- `apps/mobile/e2e/flows/**`

Notes:
- This is a user-facing flow inventory, not a backend API inventory.
- `Coverage` refers to whether a dedicated Maestro/E2E flow already exists.
- `Code-only` means the flow is clearly present in the app code but does not have its own explicit flow file yet.

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
| HOME-01 | Learner home with intent cards | `/(app)/home` via `LearnerScreen` | Covered indirectly by many learning and subject flows |
| HOME-02 | Parent gateway home | `/(app)/home` via `ParentGateway` | `e2e/flows/parent/parent-tabs.yaml`, `e2e/flows/parent/parent-dashboard.yaml` |
| HOME-03 | Parent tabs and parent-mode navigation | `/(app)` tab shell, `/(app)/home`, `/(app)/library`, `/(app)/more` | `e2e/flows/parent/parent-tabs.yaml` |
| HOME-04 | Animated splash and initial shell | root `_layout.tsx` splash / launch experience | `e2e/flows/edge/animated-splash.yaml` |
| HOME-05 | Empty first-user state | no-subject / first-run learner state | `e2e/flows/edge/empty-first-user.yaml` |
| HOME-06 | Resume interrupted session | `/(app)/learn-new` recovery marker branch | Code-only |
| SUBJECT-01 | Create subject from learner home | `/(app)/learn-new` -> `/create-subject` | Covered by subject onboarding flows |
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

## Learning, Chat, Library, Retention, and Progress

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| LEARN-01 | Freeform chat: "Just ask anything" | `/(app)/learn-new` -> `/(app)/session?mode=freeform` | `e2e/flows/learning/freeform-session.yaml` |
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
| LEARN-17 | Progress overview | `/(app)/progress` | Code-only |
| LEARN-18 | Subject progress detail | `/(app)/progress/[subjectId]` | Code-only |
| LEARN-19 | Streak display | progress / reward surfaces | `e2e/flows/edge/streak-display.yaml` |

## Homework and Parent Experience

| ID | Flow | Primary routes / entry points | Coverage |
| --- | --- | --- | --- |
| HOMEWORK-01 | Start homework from learner home or More screen | learner home intent card, `/(app)/more` -> `/(app)/homework/camera` | `e2e/flows/homework/homework-from-entry-card.yaml`, `e2e/flows/homework/homework-flow.yaml` |
| HOMEWORK-02 | Camera permission, capture, preview, and OCR | `/(app)/homework/camera` | `e2e/flows/homework/camera-ocr.yaml` |
| HOMEWORK-03 | Manual fallback when OCR is weak or fails | camera fallback and manual text entry | Covered inside `e2e/flows/homework/camera-ocr.yaml` |
| HOMEWORK-04 | Homework tutoring session with multi-problem navigation | `/(app)/session?mode=homework` | `e2e/flows/homework/homework-flow.yaml` |
| PARENT-01 | Parent dashboard (live or demo) | `/(app)/dashboard` | `e2e/flows/parent/parent-dashboard.yaml`, `e2e/flows/parent/demo-dashboard.yaml` |
| PARENT-02 | Multi-child dashboard | dashboard with multiple linked children | `e2e/flows/parent/multi-child-dashboard.yaml` |
| PARENT-03 | Child detail drill-down | `/(app)/child/[profileId]` | `e2e/flows/parent/child-drill-down.yaml` |
| PARENT-04 | Child subject -> topic drill-down | `/(app)/child/[profileId]/subjects/[subjectId]`, `topic/[topicId]` | Covered inside `e2e/flows/parent/child-drill-down.yaml` |
| PARENT-05 | Child session / transcript drill-down | `/(app)/child/[profileId]/session/[sessionId]` | Covered inside `e2e/flows/parent/child-drill-down.yaml` |
| PARENT-06 | Child monthly reports list and report detail | `/(app)/child/[profileId]/reports`, `report/[reportId]` | Code-only |
| PARENT-07 | Parent library view | `/(app)/library` while parent profile is active | `e2e/flows/parent/parent-library.yaml` |
| PARENT-08 | Subject raw-input audit for parents | parent drill-down / raw input review surfaces | `e2e/flows/parent/subject-raw-input-audit.yaml` |
| PARENT-09 | Guided label tooltip | parent dashboard or parent report surfaces | `e2e/flows/parent/guided-label-tooltip.yaml` |

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
- Resume interrupted session from the learn-new screen
- Manage subject status in the library
- Progress overview and per-subject progress
- Child monthly reports list and report detail
- Subscription top-up flow
- BYOK waitlist flow
