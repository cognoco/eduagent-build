# Playwright Web testID audit

Date: 2026-04-20
Status: audit covers smoke lane + J-04 through J-18

This file records the selectors the first Playwright web slice relies on.
It is intentionally narrower than the full plan matrix: smoke-critical IDs are
covered now, and later journeys can extend this audit as new selectors become
runtime-critical.

| testID | Location | Status | Notes |
| --- | --- | --- | --- |
| `sign-in-email` | `(auth)/sign-in.tsx` | ✅ smoke runtime | Used by auth setup + J-02 |
| `sign-in-password` | `(auth)/sign-in.tsx` | ✅ smoke runtime | Used by auth setup + J-02 |
| `sign-in-button` | `(auth)/sign-in.tsx` | ✅ smoke runtime | Used by auth setup + J-02 |
| `sign-up-link` | `(auth)/sign-in.tsx` | ✅ smoke runtime | J-02 |
| `forgot-password-link` | `(auth)/sign-in.tsx` | ✅ smoke runtime | J-02 |
| `sign-up-email` | `(auth)/sign-up.tsx` | ✅ smoke runtime | J-02 |
| `sign-up-password` | `(auth)/sign-up.tsx` | ✅ smoke runtime | J-02 |
| `sign-in-link` | `(auth)/sign-up.tsx` | ✅ smoke runtime | J-02 |
| `forgot-password-email` | `(auth)/forgot-password.tsx` | ✅ smoke runtime | J-02 |
| `back-to-sign-in` | `(auth)/forgot-password.tsx` | ✅ smoke runtime | J-02 |
| `learner-screen` | `components/home/LearnerScreen.tsx` | ✅ smoke runtime | J-01 |
| `intent-learn` | `components/home/LearnerScreen.tsx` | ✅ smoke runtime | J-01 |
| `intent-ask` | `components/home/LearnerScreen.tsx` | ✅ smoke runtime | J-01 |
| `intent-practice` | `components/home/LearnerScreen.tsx` | ✅ smoke runtime | J-01 |
| `intent-homework` | `components/home/LearnerScreen.tsx` | ✅ smoke runtime | J-01 |
| `intent-continue` | `components/home/LearnerScreen.tsx` | ✅ source audit | Runtime coverage lands with later journeys |
| `intent-quiz-discovery` | `components/home/LearnerScreen.tsx` | ✅ source audit | Runtime coverage lands with later journeys |
| `parent-gateway` | `components/home/ParentGateway.tsx` | ✅ smoke runtime | J-03 |
| `gateway-check-progress` | `components/home/ParentGateway.tsx` | ✅ smoke runtime | J-03 |
| `gateway-learn` | `components/home/ParentGateway.tsx` | ✅ smoke runtime | J-03 |
| `profile-switcher-chip` | `components/common/ProfileSwitcher.tsx` | ✅ source audit | Needed by phase 2 journeys |
| `profile-switcher-menu` | `components/common/ProfileSwitcher.tsx` | ✅ source audit | Needed by phase 2 journeys |
| `profile-option-{id}` | `components/common/ProfileSwitcher.tsx` | ✅ source audit | Dynamic `testID` already implemented |
| `post-approval-landing` | `app/(app)/_layout.tsx` | ✅ smoke runtime | Auth setup — overlay after consent |
| `post-approval-continue` | `app/(app)/_layout.tsx` | ✅ smoke runtime | Auth setup — dismiss overlay |
| `learner-back` | `components/home/LearnerScreen.tsx` | ✅ source audit | J-04 — back from inline learner to parent |
| `dashboard-child-{id}` | `components/coaching/ParentDashboardSummary.tsx` | ✅ source audit | J-07 — per-child dashboard card (dynamic) |
| `dashboard-back` | `app/(app)/dashboard.tsx` | ✅ source audit | J-07 — back from dashboard to home |
| `dashboard-scroll` | `app/(app)/dashboard.tsx` | ✅ source audit | J-07 — dashboard scroll container |
| `child-detail-scroll` | `app/(app)/child/[profileId]/index.tsx` | ✅ source audit | J-07 — child detail content |
| `back-button` | `app/(app)/child/[profileId]/index.tsx` | ✅ source audit | J-07 — back from child detail |
| `chat-input` | `components/session/ChatShell.tsx` | ✅ smoke runtime | J-08, J-09, J-11 — session chat input |
| `send-button` | `components/session/ChatShell.tsx` | ✅ smoke runtime | J-08, J-09 — send message |
| `end-session-button` | `app/(app)/session/index.tsx` | ✅ smoke runtime | J-08 — end session |
| `filing-prompt-dismiss` | `app/(app)/session/_helpers/SessionFooter.tsx` | ✅ smoke runtime | J-08 — dismiss filing prompt |
| `summary-input` | `app/(app)/session-summary.tsx` | ✅ smoke runtime | J-08 — session summary text |
| `submit-summary-button` | `app/(app)/session-summary.tsx` | ✅ smoke runtime | J-08 — submit summary |
| `continue-button` | `app/(app)/session-summary.tsx` | ✅ smoke runtime | J-08 — post-summary continue |
| `create-subject-name` | `app/(app)/create-subject.tsx` | ✅ smoke runtime | J-09, J-13 — subject name input |
| `create-subject-submit` | `app/(app)/create-subject.tsx` | ✅ smoke runtime | J-09 — submit new subject |
| `view-curriculum-button` | `app/(app)/onboarding/interview.tsx` | ✅ smoke runtime | J-09 — view curriculum after interview |
| `analogy-preference-title` | `app/(app)/onboarding/analogy-preference.tsx` | ✅ smoke runtime | J-09 — analogy preference step |
| `analogy-skip-button` | `app/(app)/onboarding/analogy-preference.tsx` | ✅ smoke runtime | J-09 — skip analogy step |
| `accommodation-skip` | `app/(app)/onboarding/accommodation.tsx` | ✅ smoke runtime | J-09 — skip accommodation step |
| `start-learning-button` | `app/(app)/onboarding/curriculum.tsx` | ✅ smoke runtime | J-09 — begin learning CTA |
| `practice-screen` | `app/(app)/practice/index.tsx` | ✅ smoke runtime | J-10 — practice hub |
| `practice-quiz` | `app/(app)/practice/index.tsx` | ✅ smoke runtime | J-10 — quiz entry |
| `quiz-index-screen` | `app/(app)/practice/quiz/index.tsx` | ✅ smoke runtime | J-10 — quiz type selector |
| `quiz-capitals` | `app/(app)/practice/quiz/index.tsx` | ✅ smoke runtime | J-10 — capitals quiz type |
| `quiz-launch-loading` | `app/(app)/practice/quiz/play.tsx` | ✅ smoke runtime | J-10 — quiz loading state |
| `quiz-play-screen` | `app/(app)/practice/quiz/play.tsx` | ✅ smoke runtime | J-10 — quiz play screen |
| `quiz-option-0` | `app/(app)/practice/quiz/play.tsx` | ✅ smoke runtime | J-10 — first answer option |
| `quiz-results-screen` | `app/(app)/practice/quiz/results.tsx` | ✅ smoke runtime | J-10 — quiz results |
| `quiz-results-done` | `app/(app)/practice/quiz/results.tsx` | ✅ smoke runtime | J-10 — exit results |
| `practice-back` | `app/(app)/practice/index.tsx` | ✅ smoke runtime | J-10 — back from practice |
| `tab-library` | `app/(app)/_layout.tsx` | ✅ smoke runtime | J-11 — library tab |
| `subject-card-{id}` | `components/library/SubjectCard.tsx` | ✅ smoke runtime | J-11, J-16, J-17 — dynamic subject card |
| `book-screen` | `app/(app)/book/[subjectId].tsx` | ✅ smoke runtime | J-11 — book/subject detail |
| `book-start-learning` | `app/(app)/book/[subjectId].tsx` | ✅ smoke runtime | J-11 — start learning CTA |
| `create-profile-gate` | `app/(app)/_layout.tsx` | ✅ smoke runtime | J-12 — pre-profile blocker |
| `create-profile-cta` | `app/(app)/_layout.tsx` | ✅ smoke runtime | J-12 — create profile CTA |
| `create-profile-name` | `app/(app)/create-profile.tsx` | ✅ smoke runtime | J-12, J-15 — profile name input |
| `create-profile-birthdate-input` | `app/(app)/create-profile.tsx` | ✅ smoke runtime | J-12 — birthdate input |
| `create-profile-submit` | `app/(app)/create-profile.tsx` | ✅ smoke runtime | J-12 — submit profile form |
| `consent-pending-gate` | `app/(app)/_layout.tsx` | ✅ smoke runtime | J-13, J-14 — consent pending blocker |
| `consent-check-again` | `app/(app)/_layout.tsx` | ✅ smoke runtime | J-13 — re-check consent |
| `profile-loading` | `app/(app)/_layout.tsx` | ✅ smoke runtime | J-14 — loading spinner |
| `add-first-child-screen` | `components/home/ParentGateway.tsx` | ✅ smoke runtime | J-15 — add first child empty state |
| `add-first-child-cta` | `components/home/ParentGateway.tsx` | ✅ smoke runtime | J-15 — add child CTA |
| `subject-topics-scroll` | `app/(app)/child/[profileId]/subject.tsx` | ✅ smoke runtime | J-16 — subject topics list |
| `topic-card-{id}` | `components/coaching/TopicCard.tsx` | ✅ smoke runtime | J-16, J-17 — dynamic topic card |
| `topic-detail-screen` | `app/(app)/child/[profileId]/topic.tsx` | ✅ smoke runtime | J-16, J-17 — topic detail |
| `session-card-{id}` | `components/coaching/SessionCard.tsx` | ✅ smoke runtime | J-17 — dynamic session card |
| `copy-conversation-prompt` | `app/(app)/child/[profileId]/topic.tsx` | ✅ smoke runtime | J-17 — copy conversation button |
| `narrative-unavailable` | `app/(app)/child/[profileId]/topic.tsx` | ✅ source audit | J-17 — asserted count=0 |
