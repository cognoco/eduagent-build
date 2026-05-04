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
| AUTH-05 | Additional sign-in verification (email/phone/TOTP/backup) | **Missing** | Four MFA branches have no E2E. |
| AUTH-06 | Forgot password | Covered | Two YAMLs aligned. |
| AUTH-07 | Auth screen navigation chain | Covered | Full chain exercised. |
| AUTH-08 | OAuth sign in/up (Google/Apple/OpenAI) | Partial | `sso-buttons.yaml` only checks Android Google button render. |
| AUTH-09 | SSO callback completion + 10s fallback | **Missing** | No file targets `/sso-callback`. |
| AUTH-10 | Sign out | Partial | Only as setup helper / final step of `more-tab-navigation.yaml`. |
| AUTH-11 | Session-expired forced sign-out + banner | **Missing** | Code-only. |
| AUTH-12 | First-time vs returning sign-in copy | Covered | `welcome-text-first-time.yaml`. |
| AUTH-13 | Deep-link auth redirect preservation | **Missing** | Unit-tested only. |
| AUTH-14 | Sign-in transition stuck-state recovery | **Missing** | testIDs `sign-in-transitioning*` never asserted. |

## Profiles, Family, Consent, Account

| ID | Flow | Status | Notes |
|---|---|---|---|
| ACCOUNT-01 | Create first profile | Covered | `create-profile-standalone.yaml`. |
| ACCOUNT-02 | Create additional profile (generic) | Partial | Tested via ACCOUNT-01/03; no generic add-profile journey. |
| ACCOUNT-03 | Add child profile from More/Profiles | Covered | `add-child-profile.yaml` + `bug-239`. |
| ACCOUNT-04 | Profile switching | Covered | `profile-switching.yaml`. |
| ACCOUNT-05 | Family-plan / max-profile gating | Partial | Indirect via billing flows. |
| ACCOUNT-06 | More tab navigation | **Outdated** | `more-tab-navigation.yaml` skips the Accommodation section header added by commit `ea32d358` — scrolls directly from `learning-mode-section-header` to `celebrations-section-header`. |
| ACCOUNT-07 | Push notif + weekly digest toggles | Covered | `settings-toggles.yaml`. |
| ACCOUNT-08 | Learning-mode / celebration / accommodation prefs | Partial | Accommodation + Celebrations sections never asserted. |
| ACCOUNT-09 | Change password | **Missing** | Code-only. |
| ACCOUNT-10 | Export my data | **Missing** | Only an alert dismiss in More-nav; no dedicated test. |
| ACCOUNT-11 | Delete account (7-day grace, three-stage) | **Outdated** | `delete-account.yaml` only exercises stage 1. The BUG-910 typed-confirmation stage (`delete-account-confirm-input` / `delete-account-confirm-final`) and the `scheduled` stage with family/subscription warnings are not asserted. |
| ACCOUNT-12 | Cancel scheduled account deletion | Partial | `account-lifecycle.yaml` does not reach the `scheduled` stage; `delete-account-keep` never asserted. |
| ACCOUNT-13 | Privacy policy | Partial | Reached only via More-nav. |
| ACCOUNT-14 | Terms of service | Partial | Reached only via More-nav. |
| ACCOUNT-15 | Self mentor memory | Covered | Empty + populated YAMLs. |
| ACCOUNT-16 | Child mentor memory | Covered | Empty + populated YAMLs. |
| ACCOUNT-17 | Child memory consent prompt | **Missing** | Code-only. |
| ACCOUNT-18 | Subject analogy preference after setup | **Missing** | Code-only. |
| ACCOUNT-19 | Consent during underage profile creation | Partial | Two flows exist separately; combined handoff not exercised. |
| ACCOUNT-20 | Child handoff to parent consent | Covered | `hand-to-parent-consent.yaml`. |
| ACCOUNT-21 | Parent email entry / send / resend / change | Covered | Server-side own-email rejection not asserted. |
| ACCOUNT-22 | Consent pending gate | Covered | Dedicated YAML. |
| ACCOUNT-23 | Consent withdrawn gate | Covered | Dedicated YAML. |
| ACCOUNT-24 | Post-approval landing | Covered | Dedicated YAML. |
| ACCOUNT-25 | Parent consent management | Covered | Dedicated YAML. |
| ACCOUNT-26 | Regional consent variants | Covered | COPPA / GDPR / above-threshold. |
| ACCOUNT-27 | Parent consent deny confirmation | Covered | Dedicated YAML. |
| ACCOUNT-28 | App language (UI locale) edit via More | **Missing** | Inventory points at `settings-language-edit.yaml`, but that file actually tests Tutor language (ACCOUNT-29). The app-language bottom sheet (`settings-app-language` / `language-picker-backdrop`) has no E2E. |
| ACCOUNT-29 | Tutor language edit from More | Covered | `settings-language-edit.yaml`. |
| ACCOUNT-30 | Impersonated-child guard on More | **Missing** | Unit-test only (`more.test.tsx`). |

## Home, Navigation, and Subject Setup

| ID | Flow | Status | Notes |
|---|---|---|---|
| HOME-01 | Learner home (redesigned: carousel + Ask + quick actions) | Partial | All sub-pieces exercised across other flows; no dedicated test of the full new layout. |
| HOME-02 | Parent gateway home | Covered | `parent-dashboard.yaml` + `parent-tabs.yaml`. |
| HOME-03 | Parent tabs / parent-mode navigation | Covered | `parent-tabs.yaml` aligned. |
| HOME-04 | Animated splash | Covered | `animated-splash.yaml` (release-build only). |
| HOME-05 | Empty first-user state | Covered | `empty-first-user.yaml` uses `home-add-subject-tile` / `home-empty-subjects`. |
| HOME-06 | Resume interrupted session via Continue | **Missing** | Code-only. |
| HOME-07 | Add-first-child gate (parent owners) | **Missing** | Code-only. |
| HOME-08 | Home loading-timeout fallback | **Missing** | testIDs `home-loading-timeout*` not in any YAML. |
| SUBJECT-01 | Create subject from home | Covered | Aligned with redesigned home (`home-action-study-new`). |
| SUBJECT-02 | Create subject from library empty state | Partial | Indirect only. |
| SUBJECT-03 | Create subject from chat | Covered | Two regression YAMLs. |
| SUBJECT-04 | Create subject from homework | Partial | Indirect only. |
| SUBJECT-05 | Subject resolve / clarification | Covered | Aligned with current home. |
| SUBJECT-06 | Broad subject → pick-book | **Outdated** | `practice-subject-picker.yaml` scrolls to `text: "Practice for a test"` (old `AdaptiveEntryCard` footer); redesigned home replaced this with `home-action-practice` routing to `/(app)/practice`, and "Your subjects" is now rendered uppercase (`YOUR SUBJECTS`). |
| SUBJECT-07 | Focused subject → interview | Covered | `create-subject.yaml`. |
| SUBJECT-08 | Per-subject native-language setup | Partial | Reached implicitly; no dedicated assertion on language-setup screen. |
| SUBJECT-09 | Interview onboarding (→ interests-context) | Partial | interests-context branch only via deep-link in `onboarding-extras-flow.yaml`, never via live interview exit. |
| SUBJECT-10 | Analogy-preference onboarding | Covered | Aligned. |
| SUBJECT-11 | Curriculum review | Covered | Aligned. |
| SUBJECT-12 | View curriculum without committing | **Outdated** | `view-curriculum.yaml` asserts `id: "library-tab-shelves"` — that testID is gone after Library v3 (PR #144); the library section of this flow will fail or pass only via `optional`. |
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
| LEARN-08 | Library v3 (single-pane topic-first) | **Outdated** | `library-navigation.yaml` enters via `home-coach-band-continue`; does not exercise expandable shelves, retention pills, or `LibrarySearchBar` introduced by PR #144. Header still references the removed `subject-filter-tabs`. |
| LEARN-09 | Subject shelf → book selection | **Outdated** | Library entry path changed in v3 — `practice-subject-picker.yaml` + `multi-subject.yaml` still navigate via the old shelf-tab pattern. |
| LEARN-10 | Book detail | **Outdated** | `book-detail.yaml` header references the removed `ShelvesTab.tsx` component; needs verification that `subject-card-${SUBJECT_ID}` resolves through v3's expandable `ShelfRow`. |
| LEARN-11 | Manage subject status (active/paused/archived) | **Missing** | Code-only. |
| LEARN-12 | Topic detail (redesigned 855a632f) | **Outdated** | `topic-detail.yaml` + `topic-detail-adaptive-buttons.yaml` assert `retention-card`, `primary-action-button`, `more-ways-toggle`, `secondary-recall-check` — all on the known-stale list in `e2e-testid-integrity.test.ts`. Replaced by `study-cta` / `topic-detail-*`. |
| LEARN-13 | Recall check | **Outdated** | `recall-review.yaml` asserts stale `retention-card` on the path. |
| LEARN-14 | Failed recall remediation | **Outdated** | `failed-recall.yaml` asserts stale `retention-card`. |
| LEARN-15 | Relearn flow | **Outdated** | `relearn-flow.yaml` + `relearn-child-friendly.yaml` assert `relearn-different-method` / `relearn-same-method` / `relearn-back-to-choice` — all stale. Screen redesigned to phase pickers (`relearn-subjects-phase`, `relearn-topics-phase`, `relearn-method-phase`). |
| LEARN-16 | Retention review from library | **Outdated** | `library.yaml` makes live `assertVisible` on `library-tab-shelves` and `library-tab-books` (lines 69/74/89) — both removed in v3; only passes due to `optional: true`. |
| LEARN-17 | Progress overview tab | Covered | `progress-analytics.yaml`. |
| LEARN-18 | Subject progress detail | Partial | Reached inside `progress-analytics.yaml`. |
| LEARN-19 | Streak display | Covered | `streak-display.yaml`. `streak-badge` testID flagged stale in integrity test — verify. |
| LEARN-20 | Milestones list | Partial | Empty state only; ErrorFallback paths code-only. |
| LEARN-21 | Cross-subject vocabulary browser | Covered | `vocabulary-browser.yaml`. |
| LEARN-22 | Per-subject vocabulary list | Covered | `vocabulary-flow.yaml`. |
| LEARN-23 | Read-only session transcript view (BUG-889) | **Missing** | Unit tests only; parent-proxy gate untested by E2E. |
| LEARN-24 | Saved bookmarks screen | **Missing** | `/(app)/progress/saved` route untested by E2E. |
| LEARN-25 | Library inline search | **Missing** | `library-search-empty` / `*-server-loading` / `*-clear-results` testIDs untested. |

## Practice Hub and Practice Activities

### Practice Hub

| ID | Flow | Status | Notes |
|---|---|---|---|
| PRACTICE-01 | Practice hub menu | Partial | Hub renders inside quiz/dictation flows; `practice-recitation`, `practice-review`, `practice-quiz-history` never tapped. |
| PRACTICE-02 | Review topics shortcut (overdue relearn) | Partial | Side-effect via retention flows. |
| PRACTICE-03 | Recitation session | **Missing** | `practice-recitation` never tapped. |
| PRACTICE-04 | "All caught up" empty state | **Missing** | `review-empty-state` / `review-empty-browse` never exercised. |

### Quiz Activities

| ID | Flow | Status | Notes |
|---|---|---|---|
| QUIZ-01 | Activity picker (Capitals/Vocab/Guess Who; BUG-891 label) | Partial | `quiz-vocabulary-${subjectId}` `<lang> basics` label and `quiz-vocab-locked` fallback never asserted. |
| QUIZ-02 | Round generation loading | Covered | testIDs declared and present. |
| QUIZ-03 | Multiple choice play (incl. free-text branch) | Partial | Free-text variant (`quiz-free-text-input/field/submit`) never exercised. |
| QUIZ-04 | Guess Who clue reveal | Partial | YAML only taps Capitals; clue progression not exercised. |
| QUIZ-05 | Mid-round quit Modal (BUG-892) | **Missing** | `quiz-quit-modal-backdrop` / `quiz-quit-confirm` / `quiz-quit-cancel` never tapped. |
| QUIZ-06 | Round complete error retry | **Missing** | `quiz-play-error/retry/exit` untested. |
| QUIZ-07 | Results celebration | Covered | Results-done + history asserted; `quiz-results-play-again` not tapped. |
| QUIZ-08 | Quota / consent / forbidden errors suppress Retry | **Missing** | No error-state seed for launch. |
| QUIZ-09 | Quiz history (grouping + empty state) | Partial | Empty state (`quiz-history-empty`, `quiz-history-try-quiz`) and Today/Yesterday grouping not asserted. |
| QUIZ-10 | Round detail (BUG-932 first-clue prompt) | Partial | YAML only enters a Capitals round; BUG-932 first-clue truncation never exercised. |
| QUIZ-11 | Malformed-round guard | **Missing** | `quiz-play-malformed*` untested. |
| QUIZ-12 | Wrong-answer dispute (BUG-927) | **Missing** | Tap is `optional: true` and `quiz-dispute-noted` never asserted. |
| QUIZ-13 | Answer-check failure non-blocking warning | **Missing** | `answerCheckFailed` requires controlled API failure. |

### Dictation

| ID | Flow | Status | Notes |
|---|---|---|---|
| DICT-01 | Choice screen | Covered | Error/loading/timeout branches declared but not exercised. |
| DICT-02 | OCR text preview + edit (homework path) | Covered | Fully exercised. |
| DICT-03 | "Surprise me" generated dictation (timeout/cancel) | Partial | `dictation-surprise` never tapped; only homework path exercised. |
| DICT-04 | Playback controls | Partial | Pace, punctuation, skip, repeat, tap-to-pause never interacted with. |
| DICT-05 | Mid-dictation exit confirm | **Outdated** | YAML taps `text: "Leave"` — string is now `t()`-keyed (commit d0e1efdc); will fail in non-en locales. |
| DICT-06 | Completion screen | Covered | Happy path; timeout / recovery CTA not exercised. |
| DICT-07 | Photo review via multimodal LLM | **Missing** | Code-only. |
| DICT-08 | Sentence-level remediation | **Missing** | `review-remediation-screen` etc. untested. |
| DICT-09 | Perfect-score celebration | **Missing** | `review-celebration` untested. |
| DICT-10 | Recording dictation result | **Missing** | Unit-tested only. |

## Homework and Parent Experience

| ID | Flow | Status | Notes |
|---|---|---|---|
| HOMEWORK-01 | Start homework from home/More | Covered | Two YAMLs aligned. |
| HOMEWORK-02 | Camera permission + capture + OCR | **Outdated** | `camera-ocr.yaml` covers `grant-permission-button` (first-request) only. The `open-settings-button` permanently-denied sub-state and auto-refresh on resume (commits 22c7c99c + d0e1efdc) are not exercised. |
| HOMEWORK-03 | Manual fallback when OCR weak | Partial | Optional emulator workaround inside `camera-ocr.yaml`. |
| HOMEWORK-04 | Homework tutoring session | Covered | `homework-flow.yaml`. |
| HOMEWORK-05 | Gallery import | **Missing** | Code-only. |
| HOMEWORK-06 | Image vision pass-through | **Missing** | Code-only. |
| HOMEWORK-07 | Camera permission onboarding two-state + resume refresh | **Missing** | `open-settings-button` never asserted. |
| PARENT-01 | Parent dashboard | Covered | `MetricInfoDot` / `SamplePreview` not explicitly asserted. |
| PARENT-02 | Multi-child dashboard | Covered | Dedicated YAML. |
| PARENT-03 | Child detail drill-down | Covered | `child-drill-down.yaml`. |
| PARENT-04 | Child subject → topic drill-down | Partial | Inside drill-down YAML; retention badges not asserted. |
| PARENT-05 | Child session / transcript drill-down | **Outdated** | Transcript link gating in parent-proxy mode (CR-PR129-M5, commit 3c542326) not asserted. |
| PARENT-06 | Child reports list + detail | Covered | Empty + populated YAMLs. |
| PARENT-07 | Parent library view | Covered | Dedicated YAML. |
| PARENT-08 | Subject raw-input audit | Covered | Dedicated YAML. |
| PARENT-09 | Guided label tooltip | Covered | Dedicated YAML. |
| PARENT-10 | Understanding card + gated Retention card | **Outdated** | `child-drill-down.yaml` asserts `topic-status-card` but never `topic-understanding-card` (the renamed testID per commit 68a2288c — old `topic-mastery-card` is gone from source). |
| PARENT-11 | Session recap (narrative / highlight / prompt / EngagementChip) | **Missing** | Unit tests only. |
| PARENT-12 | Subject retention badges gated on data presence | **Missing** | Code-only. |
| PARENT-13 | Child weekly report detail | **Missing** | All `child-weekly-report-*` testIDs untested. |

## Billing and Monetization

| ID | Flow | Status | Notes |
|---|---|---|---|
| BILLING-01 | Subscription screen (current plan + status + trial banner + usage + cancel notice) | Covered | `subscription-details.yaml` + `subscription.yaml`. |
| BILLING-02 | Upgrade purchase + post-purchase polling | **Missing** | `purchase-polling-indicator` testID exists in source but no E2E asserts it. |
| BILLING-03 | Trial / plan usage / family-pool detail states | Partial | Only `trial-active` seeded; family-pool, past-due, cancelling, expired never seeded. |
| BILLING-04 | Restore purchases | Covered | Asserted in `subscription-details.yaml`. |
| BILLING-05 | Manage billing deep link | Partial | Button visible but never tapped / no deep-link assertion. |
| BILLING-06 | Child paywall + notify-parent | Covered | `child-paywall.yaml`. |
| BILLING-07 | Daily quota exceeded paywall | Covered | `daily-quota-exceeded.yaml`. |
| BILLING-08 | Family pool visibility (`family-pool-section`; family static comparison card) | **Missing** | Family-tier seed never used; testID never asserted in E2E. |
| BILLING-09 | Top-up question credits | **Missing** | Code-only. |
| BILLING-10 | BYOK waitlist | **Missing** | UI commented out in source. |
| BILLING-11 | Trial banner UI (BUG-966) | **Outdated** | YAML asserts only `text: "Trial active"` (raw text). The `id: "trial-banner"` testID and conditional `trialEndsAt` date string are not asserted — weaker than implementation. |
| BILLING-12 | Pro / Family static comparison cards (BUG-917) | **Missing** | Unit-tested only (`subscription.test.tsx`); `static-tier-family` / `static-tier-pro` never E2E-asserted. |

---

## Summary

### Counts (excluding regression QA-* and CC-* sections)

| Status | Count |
|---|---|
| Covered | ~52 |
| Partial | ~27 |
| **Outdated** | **15** |
| **Missing** | **40** |

### Outdated tests — fix these first

These tests exist but no longer match current code. They either pass via `optional: true` on stale assertions, depend on hardcoded English text that has been i18n'd, or rely on testIDs that have been removed.

1. **`account/more-tab-navigation.yaml`** — add Accommodation section header (ACCOUNT-06).
2. **`account/delete-account.yaml`** — add typed-confirmation + scheduled stages (ACCOUNT-11, BUG-910).
3. **`onboarding/settings-language-edit.yaml`** — actually tests Tutor language; inventory wrongly cites it as ACCOUNT-28 coverage. Either rename file or write a separate App Language YAML.
4. **`subjects/practice-subject-picker.yaml`** — old `AdaptiveEntryCard`/"Practice for a test" entry, "Your subjects" lowercase (SUBJECT-06).
5. **`onboarding/view-curriculum.yaml`** — asserts removed `library-tab-shelves` (SUBJECT-12).
6. **`learning/library-navigation.yaml`** — pre-v3 library; doesn't cover search / expandable shelves / retention pills (LEARN-08).
7. **`subjects/multi-subject.yaml` / `subjects/practice-subject-picker.yaml`** — pre-v3 shelf entry path (LEARN-09).
8. **`learning/book-detail.yaml`** — references removed `ShelvesTab.tsx` (LEARN-10).
9. **`retention/topic-detail*.yaml`** — assert removed `retention-card` / `primary-action-button` / `more-ways-toggle` / `secondary-recall-check` (LEARN-12).
10. **`retention/recall-review.yaml`** — stale `retention-card` on path (LEARN-13).
11. **`retention/failed-recall.yaml`** — stale `retention-card` on path (LEARN-14).
12. **`retention/relearn-flow.yaml` / `relearn-child-friendly.yaml`** — assert removed `relearn-different-method` / `-same-method` / `-back-to-choice`; relearn redesigned to phase pickers (LEARN-15).
13. **`retention/library.yaml`** — live `assertVisible` on removed `library-tab-shelves` / `library-tab-books`; only passes via `optional: true` (LEARN-16).
14. **`dictation/dictation-full-flow.yaml`** — DICT-05 taps hardcoded `text: "Leave"`, now i18n'd (commit d0e1efdc); breaks in non-en locales.
15. **`homework/camera-ocr.yaml`** — only first-request permission state; permanently-denied + Settings-redirect + resume-refresh untested (HOMEWORK-02 / HOMEWORK-07).
16. **`parent/child-drill-down.yaml`** — asserts `topic-status-card` but not the renamed `topic-understanding-card` (PARENT-10) and doesn't gate transcript link in proxy mode (PARENT-05).
17. **`billing/subscription-details.yaml`** — asserts `text: "Trial active"` instead of `id: "trial-banner"`; no `trialEndsAt` assertion (BILLING-11).

### Missing tests — write these next (priority order)

**P1 — recently shipped flows with zero E2E coverage:**

- LEARN-23 Session transcript view (BUG-889) — incl. parent-proxy gate.
- LEARN-24 Saved bookmarks screen — list, swipe-delete, parent-proxy disable.
- LEARN-25 Library inline search end-to-end.
- PARENT-13 Child weekly report detail.
- PARENT-11 Session recap block (narrative / highlight / prompt / EngagementChip).
- PARENT-12 Subject retention badges gated on data.
- ACCOUNT-28 App language (UI locale) edit via More bottom sheet — distinct from Tutor language.
- BILLING-12 Pro / Family static comparison cards (BUG-917).
- BILLING-08 Family pool section (family-tier seed).
- HOMEWORK-07 Camera permission onboarding two-state + resume refresh.

**P2 — practice / quiz / dictation gap-fillers:**

- PRACTICE-01..04 dedicated practice-hub navigation flow + recitation session + "all caught up" empty state.
- QUIZ-05 Mid-round quit Modal.
- QUIZ-08 Quota / consent / forbidden error variants.
- QUIZ-11 Malformed-round guard.
- QUIZ-12 Wrong-answer dispute (assert `quiz-dispute-noted` after wrong answer).
- QUIZ-13 Answer-check failure warning.
- DICT-07..10 Photo-review remediation loop, perfect-score, result recording.

**P3 — auth / account hardening:**

- AUTH-05 Additional sign-in verification (email / phone / TOTP / backup).
- AUTH-09 SSO callback + 10s fallback.
- AUTH-11 Session-expired forced sign-out + banner.
- AUTH-13 Deep-link auth redirect preservation.
- AUTH-14 Sign-in transition stuck-state recovery.
- ACCOUNT-09 Change password.
- ACCOUNT-10 Export my data (full flow, not just alert dismiss).
- ACCOUNT-17 Child memory consent prompt.
- ACCOUNT-18 Subject analogy preference after setup.
- ACCOUNT-30 Impersonated-child More guard.

**P4 — home / billing edge cases:**

- HOME-01 Dedicated test of redesigned home layout (carousel + Ask + quick actions + CoachBand).
- HOME-06 Resume interrupted session via Continue.
- HOME-07 Add-first-child gate for parent owners.
- HOME-08 Home loading-timeout fallback.
- LEARN-11 Manage subject status (active/paused/archived).
- BILLING-02 Upgrade purchase + `purchase-polling-indicator`.
- BILLING-09 Top-up flow.
- BILLING-10 BYOK waitlist (once UI uncommented).
