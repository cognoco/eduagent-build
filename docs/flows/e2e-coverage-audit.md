> **STATUS: SNAPSHOT** taken 2026-05-04. Superseded by `e2e-flow-coverage-audit-2026-05-13.md` which maps the current More-tab shape.

# E2E Coverage Audit

Audit of `docs/flows/mobile-app-flow-inventory.md` against the actual Maestro flow files in `apps/mobile/e2e/flows/` and current source. Snapshot taken **2026-05-04**.

For each flow ID, status is one of:

- **Covered** — dedicated E2E exists and is aligned with current source.
- **Partial** — flow is exercised only as a side-effect of a broader test, or only one branch of a multi-state flow is tested.
- **Outdated** — a dedicated E2E exists but the underlying flow has changed (testIDs renamed/removed, screen redesigned, new sub-states added). Test will silently pass-through (`optional: true`) or fail in non-English locales.
- **Missing** — no dedicated E2E. Code-only or unit-test-only.

The "Outdated" category is what motivated this audit — many tests were written against pre-redesign UIs (Library v3, Home redesign, More reorganization, BUG-910 delete-account three-stage, BUG-966 trial banner) and still pass either because their assertions are loose or because failing taps are flagged `optional`.

---

## Auth and Access

| ID | Flow | Status | Notes |
|---|---|---|---|
| AUTH-01 | App launch and auth gate | Covered | 3 launch YAMLs aligned. |
| AUTH-02 | Sign up with email + password | Covered | `sign-up-flow.yaml` + `sign-up-screen-devclient.yaml`. |
| AUTH-03 | Sign-up email verification code | Partial | Sub-step inside `sign-up-flow.yaml`; no isolated test. |
| AUTH-04 | Sign in with email + password | Covered | `sign-in-navigation.yaml` + validation. |
| AUTH-05 | Additional sign-in verification (email/phone/TOTP/backup) | Partial | Stage 4: `sign-in-mfa-email-code.yaml`, `sign-in-mfa-phone.yaml`, `sign-in-mfa-totp.yaml`, `sign-in-mfa-backup-code.yaml` — flow stubs present; CLERK_TESTING_TOKEN required for full real-auth run (blocked). |
| AUTH-06 | Forgot password | Covered | Two YAMLs aligned. |
| AUTH-07 | Auth screen navigation chain | Covered | Full chain exercised. |
| AUTH-08 | OAuth sign in/up (Google/Apple/OpenAI) | Partial | `sso-buttons.yaml` only checks Android Google button render. |
| AUTH-09 | SSO callback completion + 10s fallback | Partial | Stage 4: `sso-callback-fallback.yaml` — asserts `sso-fallback-back` on 10s timeout path; happy-path sign-in still requires CLERK_TESTING_TOKEN (blocked). |
| AUTH-10 | Sign out | Partial | Only as setup helper / final step of `more-tab-navigation.yaml`. |
| AUTH-11 | Session-expired forced sign-out + banner | **Missing** | Deferred — requires controlled token expiry; not feasible without Clerk testing hooks. |
| AUTH-12 | First-time vs returning sign-in copy | Covered | `welcome-text-first-time.yaml`. |
| AUTH-13 | Deep-link auth redirect preservation | **Missing** | Deferred — ADB deep-link injection unreliable on Maestro 2.2.0 (Issue 13); unit-tested only. |
| AUTH-14 | Sign-in transition stuck-state recovery | **Missing** | Deferred — stuck-state requires controlled slow network; unit-tested only. |

## Profiles, Family, Consent, Account

| ID | Flow | Status | Notes |
|---|---|---|---|
| ACCOUNT-01 | Create first profile | Covered | `create-profile-standalone.yaml`. |
| ACCOUNT-02 | Create additional profile (generic) | Partial | Tested via ACCOUNT-01/03; no generic add-profile journey. |
| ACCOUNT-03 | Add child profile from More/Profiles | Covered | `add-child-profile.yaml` + `bug-239`. |
| ACCOUNT-04 | Profile switching | Covered | `profile-switching.yaml`. |
| ACCOUNT-05 | Family-plan / max-profile gating | Partial | Indirect via billing flows. |
| ACCOUNT-06 | More tab navigation | Covered | Stage 1 (1.1): `more-tab-navigation.yaml` updated to include Accommodation section header scroll and assertion. |
| ACCOUNT-07 | Push notif + weekly digest toggles | Covered | `settings-toggles.yaml`. |
| ACCOUNT-08 | Learning-mode / celebration / accommodation prefs | Partial | Accommodation + Celebrations sections never asserted. |
| ACCOUNT-09 | Change password | Partial | Stage 4: `change-password.yaml` — asserts screen opens and field is present; actual password change requires CLERK_TESTING_TOKEN (blocked). |
| ACCOUNT-10 | Export my data | Covered | Stage 4: `export-data.yaml` — navigates to export, taps action, asserts confirmation. |
| ACCOUNT-11 | Delete account (7-day grace, three-stage) | Covered | Stage 1 (1.2): `delete-account.yaml` now exercises warning + typed-confirmation stage (`delete-account-confirm-input` / `delete-account-confirm-final`). Scheduled stage covered by `delete-account-scheduled.yaml` (1.2 Step 2). |
| ACCOUNT-12 | Cancel scheduled account deletion | Covered | Stage 1 (1.2 Step 2): `delete-account-scheduled.yaml` seeds `deletion-scheduled` state and asserts `delete-account-keep`. |
| ACCOUNT-13 | Privacy policy | Partial | Reached only via More-nav. |
| ACCOUNT-14 | Terms of service | Partial | Reached only via More-nav. |
| ACCOUNT-15 | Self mentor memory | Covered | Empty + populated YAMLs. |
| ACCOUNT-16 | Child mentor memory | Covered | Empty + populated YAMLs. |
| ACCOUNT-17 | Child memory consent prompt | Covered | Stage 4: `parent/child-memory-consent-prompt.yaml`. |
| ACCOUNT-18 | Subject analogy preference after setup | Covered | Stage 4: `account/subject-analogy-preference.yaml` + `account/subject-analogy-preference-language.yaml` (language subject hidden variant). |
| ACCOUNT-19 | Consent during underage profile creation | Partial | Two flows exist separately; combined handoff not exercised. |
| ACCOUNT-20 | Child handoff to parent consent | Covered | `hand-to-parent-consent.yaml`. |
| ACCOUNT-21 | Parent email entry / send / resend / change | Covered | Server-side own-email rejection not asserted. |
| ACCOUNT-22 | Consent pending gate | Covered | Dedicated YAML. |
| ACCOUNT-23 | Consent withdrawn gate | Covered | Dedicated YAML. |
| ACCOUNT-24 | Post-approval landing | Covered | Dedicated YAML. |
| ACCOUNT-25 | Parent consent management | Covered | Dedicated YAML. |
| ACCOUNT-26 | Regional consent variants | Covered | COPPA / GDPR / above-threshold. |
| ACCOUNT-27 | Parent consent deny confirmation | Covered | Dedicated YAML. |
| ACCOUNT-28 | App language (UI locale) edit via More | Covered | Stage 2: `account/app-language-edit.yaml` — asserts `settings-app-language` bottom sheet and language selection. Separate from Tutor language (ACCOUNT-29). |
| ACCOUNT-29 | Tutor language edit from More | Covered | `account/tutor-language-edit.yaml` (renamed from `onboarding/settings-language-edit.yaml` in Stage 1, 1.14). |
| ACCOUNT-30 | Impersonated-child guard on More | Covered | Stage 4: `account/more-impersonated-child.yaml` — asserts Sign out / Delete / Export / Subscription rows hidden when `useActiveProfileRole() === 'impersonated-child'`. |

## Home, Navigation, and Subject Setup

| ID | Flow | Status | Notes |
|---|---|---|---|
| HOME-01 | Learner home (redesigned: carousel + Ask + quick actions) | Partial | All sub-pieces exercised across other flows; no dedicated test of the full new layout. |
| HOME-02 | Parent gateway home | Covered | `parent-dashboard.yaml` + `parent-tabs.yaml`. |
| HOME-03 | Parent tabs / parent-mode navigation | Covered | `parent-tabs.yaml` aligned. |
| HOME-04 | Animated splash | Covered | `animated-splash.yaml` (release-build only). |
| HOME-05 | Empty first-user state | Covered | `empty-first-user.yaml` uses `home-add-subject-tile` / `home-empty-subjects`. |
| HOME-06 | Resume interrupted session via Continue | **Missing** | Deferred — `useContinueSuggestion` state requires controlled completed-session timing; SecureStore marker manipulation via ADB not reliable on Maestro 2.2.0. |
| HOME-07 | Add-first-child gate (parent owners) | Covered | Stage 5: `parent/add-first-child-gate.yaml` — seeds `parent-solo` scenario and asserts "Add a child" CTA. |
| HOME-08 | Home loading-timeout fallback | **Missing** | Deferred — 10s timeout not feasible to trigger reliably in E2E without network throttling. |
| SUBJECT-01 | Create subject from home | Covered | Aligned with redesigned home (`home-action-study-new`). |
| SUBJECT-02 | Create subject from library empty state | Partial | Indirect only. |
| SUBJECT-03 | Create subject from chat | Covered | Two regression YAMLs. |
| SUBJECT-04 | Create subject from homework | Partial | Indirect only. |
| SUBJECT-05 | Subject resolve / clarification | Covered | Aligned with current home. |
| SUBJECT-06 | Broad subject → pick-book | Covered | Stage 1 (1.3): `subjects/practice-subject-picker.yaml` updated to use `home-action-study-new` entry and `YOUR SUBJECTS` uppercase header. |
| SUBJECT-07 | Focused subject → interview | Covered | `create-subject.yaml`. |
| SUBJECT-08 | Per-subject native-language setup | Partial | Reached implicitly; no dedicated assertion on language-setup screen. |
| SUBJECT-09 | Interview onboarding (→ interests-context) | Partial | interests-context branch only via deep-link in `onboarding-extras-flow.yaml`, never via live interview exit. |
| SUBJECT-10 | Analogy-preference onboarding | Covered | Aligned. |
| SUBJECT-11 | Curriculum review | Covered | Aligned. |
| SUBJECT-12 | View curriculum without committing | Covered | Stage 1 (1.6): `view-curriculum.yaml` updated to use Library v3 `library-screen` entry instead of removed `library-tab-shelves`. |
| SUBJECT-13 | Challenge / skip / add / why-ordered | Partial | Main surface only, no per-mutation assertions. |
| SUBJECT-14 | Placement / knowledge assessment | Covered | `assessment-cycle.yaml`. |
| SUBJECT-15 | Accommodation-mode onboarding | Partial | Implicit via analogy chain; no explicit assertion. |
| SUBJECT-16 | Conversation-language picker (mandatory) | Covered | First entry + settings re-entry. |
| SUBJECT-17 | Pronouns picker | Covered | All options + skip. |
| SUBJECT-18 | Interests-context picker | Covered | Via deep-link. |

## Learning, Chat, Library, Retention, Progress

| ID | Flow | Status | Notes |
|---|---|---|---|
| LEARN-01 | Freeform chat | Covered | `freeform-session.yaml`. |
| LEARN-02 | Guided learning session | Covered | `start-session.yaml` + `core-learning.yaml`. |
| LEARN-03 | First session experience | Covered | Aligned with home redesign. |
| LEARN-04 | Core learning loop | Covered | `core-learning.yaml`. |
| LEARN-05 | Coach bubble light/dark | Covered | Two YAMLs aligned. |
| LEARN-06 | Voice input + voice-speed | Covered | `voice-mode-controls.yaml`. |
| LEARN-07 | Session summary | Covered | LEARN-23 transcript link not exercised here. |
| LEARN-08 | Library v3 (single-pane topic-first) | Covered | Stage 1 (1.5): `library-navigation.yaml` updated for v3 entry path, expandable shelves, retention pills. |
| LEARN-09 | Subject shelf → book selection | Covered | Stage 1 (1.3, 1.4): `practice-subject-picker.yaml` + `subjects/multi-subject.yaml` updated for v3 shelf navigation. |
| LEARN-10 | Book detail | Covered | Stage 1 (1.7): `book-detail.yaml` updated for v3 `ShelfRow` expandable entry, removed `ShelvesTab.tsx` references. |
| LEARN-11 | Manage subject status (active/paused/archived) | Covered | Stage 2: `learning/manage-subject-status.yaml`. |
| LEARN-12 | Topic detail (redesigned 855a632f) | Covered | Stage 1 (1.8): `topic-detail.yaml` + `topic-detail-adaptive-buttons.yaml` updated to use `study-cta`, `topic-detail-*` testIDs; stale `retention-card` / `primary-action-button` / `more-ways-toggle` / `secondary-recall-check` removed. |
| LEARN-13 | Recall check | Covered | Stage 1 (1.8 bundled): `recall-review.yaml` updated to use current recall testIDs without stale `retention-card`. |
| LEARN-14 | Failed recall remediation | Covered | Stage 1 (1.8 bundled): `failed-recall.yaml` updated; stale `retention-card` removed. |
| LEARN-15 | Relearn flow | Covered | Stage 1 (1.9): `relearn-flow.yaml` + `relearn-child-friendly.yaml` updated to phase pickers (`relearn-subjects-phase`, `relearn-topics-phase`, `relearn-method-phase`). |
| LEARN-16 | Retention review from library | Covered | Stage 1 (1.10): `retention/library.yaml` updated; live assertions on removed `library-tab-shelves` / `library-tab-books` replaced with v3 selectors. |
| LEARN-17 | Progress overview tab | Covered | `progress-analytics.yaml`. |
| LEARN-18 | Subject progress detail | Partial | Reached inside `progress-analytics.yaml`. |
| LEARN-19 | Streak display | Covered | `streak-display.yaml`. `streak-badge` testID flagged stale in integrity test — verify. |
| LEARN-20 | Milestones list | Partial | Empty state only; ErrorFallback paths code-only. |
| LEARN-21 | Cross-subject vocabulary browser | Covered | `vocabulary-browser.yaml`. |
| LEARN-22 | Per-subject vocabulary list | Covered | `vocabulary-flow.yaml`. |
| LEARN-23 | Read-only session transcript view (BUG-889) | Covered | Stage 2: `learning/session-transcript.yaml` + `learning/session-transcript-parent-proxy.yaml` (proxy gate). |
| LEARN-24 | Saved bookmarks screen | Covered | Stage 2: `progress/saved-bookmarks.yaml` + `progress/saved-bookmarks-parent-proxy.yaml` (proxy disable-delete). |
| LEARN-25 | Library inline search | Covered | Stage 2: `learning/library-search.yaml` — asserts `library-search-bar`, debounce results, `library-search-clear`. |

## Practice Hub and Practice Activities

### Practice Hub

| ID | Flow | Status | Notes |
|---|---|---|---|
| PRACTICE-01 | Practice hub menu | Covered | Stage 3: `practice/practice-hub-navigation.yaml` — taps `practice-recitation`, `practice-review`, `practice-quiz-history`. |
| PRACTICE-02 | Review topics shortcut (overdue relearn) | Partial | Side-effect via retention flows; direct `practice-review` tap covered in PRACTICE-01. |
| PRACTICE-03 | Recitation session | Covered | Stage 3: `practice/recitation-session.yaml`. |
| PRACTICE-04 | "All caught up" empty state | Covered | Stage 3: `practice/all-caught-up.yaml` — asserts `review-empty-state` and `review-empty-browse`. |

### Quiz Activities

| ID | Flow | Status | Notes |
|---|---|---|---|
| QUIZ-01 | Activity picker (Capitals/Vocab/Guess Who; BUG-891 label) | Partial | `quiz-vocabulary-${subjectId}` `<lang> basics` label and `quiz-vocab-locked` fallback never asserted. |
| QUIZ-02 | Round generation loading | Covered | testIDs declared and present. |
| QUIZ-03 | Multiple choice play (incl. free-text branch) | Partial | Free-text variant (`quiz-free-text-input/field/submit`) never exercised. |
| QUIZ-04 | Guess Who clue reveal | Partial | YAML only taps Capitals; clue progression not exercised. |
| QUIZ-05 | Mid-round quit Modal (BUG-892) | Covered | Stage 3: `quiz/quiz-quit-modal.yaml` — taps close icon, asserts Modal backdrop, confirm and cancel. |
| QUIZ-06 | Round complete error retry | **Missing** | `quiz-play-error/retry/exit` untested. |
| QUIZ-07 | Results celebration | Covered | Results-done + history asserted; `quiz-results-play-again` not tapped. |
| QUIZ-08 | Quota / consent / forbidden errors suppress Retry | Covered | Stage 3: `quiz/quiz-error-quota.yaml`, `quiz/quiz-error-consent.yaml`, `quiz/quiz-error-forbidden.yaml` — each seeds the appropriate profile state and asserts error card without Retry. |
| QUIZ-09 | Quiz history (grouping + empty state) | Partial | Empty state (`quiz-history-empty`, `quiz-history-try-quiz`) and Today/Yesterday grouping not asserted. |
| QUIZ-10 | Round detail (BUG-932 first-clue prompt) | Partial | YAML only enters a Capitals round; BUG-932 first-clue truncation never exercised. |
| QUIZ-11 | Malformed-round guard | Covered | Stage 3: `quiz/quiz-malformed-round.yaml` — asserts `quiz-play-malformed` and `quiz-play-malformed-back`. |
| QUIZ-12 | Wrong-answer dispute (BUG-927) | Covered | Stage 3: `quiz/quiz-dispute.yaml` — plays a wrong answer and asserts `quiz-dispute-noted`. |
| QUIZ-13 | Answer-check failure non-blocking warning | Covered | Stage 3: `quiz/quiz-answer-check-failure.yaml` — seeds a failing check-answer endpoint and asserts inline warning. |

### Dictation

| ID | Flow | Status | Notes |
|---|---|---|---|
| DICT-01 | Choice screen | Covered | Error/loading/timeout branches declared but not exercised. |
| DICT-02 | OCR text preview + edit (homework path) | Covered | Fully exercised. |
| DICT-03 | "Surprise me" generated dictation (timeout/cancel) | Partial | `dictation-surprise` never tapped; only homework path exercised. |
| DICT-04 | Playback controls | Partial | Pace, punctuation, skip, repeat, tap-to-pause never interacted with. |
| DICT-05 | Mid-dictation exit confirm | Covered | Stage 1 (1.11): `dictation-full-flow.yaml` updated to tap by testID instead of hardcoded `text: "Leave"`. |
| DICT-06 | Completion screen | Covered | Happy path; timeout / recovery CTA not exercised. |
| DICT-07 | Photo review via multimodal LLM | Partial | Stage 3: `dictation/dictation-review-flow.yaml` covers the review path; camera capture step skipped (hardware dependency). |
| DICT-08 | Sentence-level remediation | Covered | Stage 3: `dictation/dictation-review-flow.yaml` — asserts `review-remediation-screen`, `review-mistake-card`, `review-correction-input`. |
| DICT-09 | Perfect-score celebration | Covered | Stage 3: `dictation/dictation-perfect-score.yaml` — seeds zero-mistake scenario and asserts `review-celebration`. |
| DICT-10 | Recording dictation result | **Missing** | Deferred — `useRecordDictationResult` POST is a side effect; no testID to assert the record call itself. |

## Homework and Parent Experience

| ID | Flow | Status | Notes |
|---|---|---|---|
| HOMEWORK-01 | Start homework from home/More | Covered | Two YAMLs aligned. |
| HOMEWORK-02 | Camera permission + capture + OCR | Covered | Stage 1 (1.13): `camera-ocr.yaml` still covers first-request; permanently-denied state covered by `homework/camera-permission-denied.yaml` (Stage 2). |
| HOMEWORK-03 | Manual fallback when OCR weak | Partial | Optional emulator workaround inside `camera-ocr.yaml`. |
| HOMEWORK-04 | Homework tutoring session | Covered | `homework-flow.yaml`. |
| HOMEWORK-05 | Gallery import | **Missing** | Code-only. |
| HOMEWORK-06 | Image vision pass-through | **Missing** | Code-only. |
| HOMEWORK-07 | Camera permission onboarding two-state + resume refresh | Covered | Stage 2: `homework/camera-permission-denied.yaml` — asserts `open-settings-button` permanently-denied state; auto-refresh on resume covered by the flow's foreground/background cycle. |
| PARENT-01 | Parent dashboard | Covered | `MetricInfoDot` / `SamplePreview` not explicitly asserted. |
| PARENT-02 | Multi-child dashboard | Covered | Dedicated YAML. |
| PARENT-03 | Child detail drill-down | Covered | `child-drill-down.yaml`. |
| PARENT-04 | Child subject → topic drill-down | Partial | Inside drill-down YAML; retention badges not asserted. |
| PARENT-05 | Child session / transcript drill-down | Covered | Stage 1 (1.12 Step 2): `child-drill-down.yaml` updated to assert transcript link absent in parent-proxy mode. |
| PARENT-06 | Child reports list + detail | Covered | Empty + populated YAMLs. |
| PARENT-07 | Parent library view | Covered | Dedicated YAML. |
| PARENT-08 | Subject raw-input audit | Covered | Dedicated YAML. |
| PARENT-09 | Guided label tooltip | Covered | Dedicated YAML. |
| PARENT-10 | Understanding card + gated Retention card | Covered | Stage 1 (1.12 Step 2): `child-drill-down.yaml` updated to assert `topic-understanding-card`; old `topic-mastery-card` removed. |
| PARENT-11 | Session recap (narrative / highlight / prompt / EngagementChip) | Covered | Stage 2: `parent/child-session-recap.yaml` (populated) + `parent/child-session-recap-empty.yaml`. |
| PARENT-12 | Subject retention badges gated on data presence | Covered | Stage 2: `parent/child-subject-retention.yaml` (badges present) + `parent/child-subject-no-retention.yaml` (suppressed). |
| PARENT-13 | Child weekly report detail | Covered | Stage 2: `parent/child-weekly-report.yaml` — asserts `child-weekly-report-hero`, all three metric testIDs, and marks-viewed on mount. |

## Billing and Monetization

| ID | Flow | Status | Notes |
|---|---|---|---|
| BILLING-01 | Subscription screen (current plan + status + trial banner + usage + cancel notice) | Covered | `subscription-details.yaml` + `subscription.yaml`. |
| BILLING-02 | Upgrade purchase + post-purchase polling | Covered | Stage 5: `billing/upgrade-pending-state.yaml` (polling indicator) + `billing/upgrade-confirmed-state.yaml` (post-webhook confirmation). |
| BILLING-03 | Trial / plan usage / family-pool detail states | Partial | Only `trial-active` seeded; family-pool, past-due, cancelling, expired never seeded. |
| BILLING-04 | Restore purchases | Covered | Asserted in `subscription-details.yaml`. |
| BILLING-05 | Manage billing deep link | Partial | Button visible but never tapped / no deep-link assertion. |
| BILLING-06 | Child paywall + notify-parent | Covered | `child-paywall.yaml`. |
| BILLING-07 | Daily quota exceeded paywall | Covered | `daily-quota-exceeded.yaml`. |
| BILLING-08 | Family pool visibility (`family-pool-section`; family static comparison card) | Covered | Stage 5: `billing/family-pool.yaml` — seeds `family-tier` scenario and asserts `family-pool-section`. |
| BILLING-09 | Top-up question credits | Covered | Stage 5: `billing/top-up.yaml` — seeds `learning-active` and exercises top-up flow. |
| BILLING-10 | BYOK waitlist | **Missing** | Deferred — UI commented out in source; revisit once feature is un-commented. |
| BILLING-11 | Trial banner UI (BUG-966) | Covered | Stage 1 (1.13 or subscription-details fix): `subscription-details.yaml` updated to assert `id: "trial-banner"` instead of raw `text: "Trial active"`. |
| BILLING-12 | Pro / Family static comparison cards (BUG-917) | Covered | Stage 5: `billing/static-comparison-family.yaml` + `billing/static-comparison-pro.yaml` — assert `static-tier-family` / `static-tier-pro` from the seeded tier state. |

---

## Summary

### Counts (excluding regression QA-* and CC-* sections)

Updated after Stages 1–5 (snapshot 2026-05-04).

| Status | Count |
|---|---|
| Covered | ~90 |
| Partial | ~16 |
| **Outdated** | **0** |
| **Missing / Deferred** | **9** |

Deferred entries: AUTH-11, AUTH-13, AUTH-14, HOME-06, HOME-08, DICT-10, BILLING-10, ACCOUNT-09 (full real-auth path), and any flows gated on CLERK_TESTING_TOKEN.

### Outdated tests — fix these first

**All 17 outdated tests from the original audit have been fixed in Stages 1–5.** Zero outdated tests remain. The items below are the original list with their resolution noted for audit history.

1. **`account/more-tab-navigation.yaml`** — FIXED (Stage 1, 1.1): Accommodation section added.
2. **`account/delete-account.yaml`** — FIXED (Stage 1, 1.2): typed-confirmation + scheduled stages added; `delete-account-scheduled.yaml` added.
3. **`onboarding/settings-language-edit.yaml`** — FIXED (Stage 1, 1.14): renamed to `account/tutor-language-edit.yaml`; `account/app-language-edit.yaml` written separately for ACCOUNT-28.
4. **`subjects/practice-subject-picker.yaml`** — FIXED (Stage 1, 1.3): updated for redesigned home entry.
5. **`onboarding/view-curriculum.yaml`** — FIXED (Stage 1, 1.6): Library v3 selectors.
6. **`learning/library-navigation.yaml`** — FIXED (Stage 1, 1.5): v3 expandable shelves, search, retention pills.
7. **`subjects/multi-subject.yaml`** — FIXED (Stage 1, 1.4): v3 shelf entry path.
8. **`learning/book-detail.yaml`** — FIXED (Stage 1, 1.7): v3 `ShelfRow` entry.
9. **`retention/topic-detail*.yaml`** — FIXED (Stage 1, 1.8): `study-cta` / `topic-detail-*` testIDs.
10. **`retention/recall-review.yaml`** — FIXED (Stage 1, 1.8 bundled).
11. **`retention/failed-recall.yaml`** — FIXED (Stage 1, 1.8 bundled).
12. **`retention/relearn-flow.yaml` / `relearn-child-friendly.yaml`** — FIXED (Stage 1, 1.9): phase pickers.
13. **`retention/library.yaml`** — FIXED (Stage 1, 1.10): v3 library selectors.
14. **`dictation/dictation-full-flow.yaml`** — FIXED (Stage 1, 1.11): testID-based exit tap.
15. **`homework/camera-ocr.yaml`** — FIXED (Stage 1, 1.13 + Stage 2): first-request remains; `camera-permission-denied.yaml` covers permanently-denied path.
16. **`parent/child-drill-down.yaml`** — FIXED (Stage 1, 1.12 Step 2): `topic-understanding-card` and proxy transcript gate.
17. **`billing/subscription-details.yaml`** — FIXED (Stage 1, 1.13): `id: "trial-banner"` assertion.

### Missing / Deferred tests

**All P1–P4 flows from the original audit were addressed in Stages 2–5.** The following entries remain deferred with explicit reasons:

- **AUTH-05** (MFA branches) — flow stubs exist; real-auth path blocked on `CLERK_TESTING_TOKEN`. Unblock when token available.
- **AUTH-09** (SSO callback happy path) — `sso-callback-fallback.yaml` covers the 10s timeout; OAuth happy path blocked on `CLERK_TESTING_TOKEN`.
- **AUTH-11** (session-expired sign-out) — requires controlled token expiry; no feasible Maestro mechanism without Clerk testing hooks.
- **AUTH-13** (deep-link redirect preservation) — ADB deep-link injection unreliable on Maestro 2.2.0; unit-tested.
- **AUTH-14** (sign-in stuck-state) — controlled slow-network required; unit-tested.
- **ACCOUNT-09** (change password real-auth path) — screen opens; actual password change requires Clerk testing hooks.
- **HOME-06** (resume interrupted session) — SecureStore marker manipulation via ADB not reliable on Maestro 2.2.0.
- **HOME-08** (loading-timeout fallback) — 10s timeout not feasible to trigger reliably in E2E.
- **DICT-10** (recording dictation result) — POST side-effect only; no testID to assert the network call.
- **BILLING-10** (BYOK waitlist) — UI commented out in source; revisit once feature is un-commented.
