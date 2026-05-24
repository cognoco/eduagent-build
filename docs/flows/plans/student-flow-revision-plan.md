> **STATUS: DRAFT** - student audience flow revision plan. Created 2026-05-22.

# Student Flow Revision Plan

Source access inventory: [`student-flow-access-inventory.md`](../student-flow-access-inventory.md).
Canonical flow inventory: [`mobile-app-flow-inventory.md`](../mobile-app-flow-inventory.md).
Navigation target reference: [`2026-05-21-navigation-contract.md`](../../specs/2026-05-21-navigation-contract.md).

## Purpose

Walk every flow mapped to the **student / Study** audience, verify that the old flow still works for the active learner, file every defect in Notion, and update the docs when the mapped access or flow description has drifted.

This plan is intentionally about access and behavior, not implementation. A student can be an under-18 learner, a child/non-owner profile, an adult learner, or an adult who also has mentor access but is currently studying as themselves.

## Operating Instructions

### 0. Pre-Flight

1. Test on the latest `staging` build or the branch explicitly named when the batch starts. Do not switch branches mid-batch.
2. Record build SHA, API target, device, and date in the first row tested.
3. Start in Chrome or the mobile web preview and do not wait for the emulator before beginning the sweep. Emulator/native runs are follow-up lanes for native-only behavior such as camera, OS permissions, store purchases, push handling, or hardware-specific regressions.
4. Read the row in `student-flow-access-inventory.md`, then read the matching row in `mobile-app-flow-inventory.md`.
5. For negative-access rows, the expected behavior is: not surfaced from Study; direct/deep link either redirects to a safe Study surface or shows a protected/no-access fallback.

### 1. Per-Flow Procedure

For each row:

1. Set `Tested` to 🔄.
2. Walk every documented entry point and branch for that flow.
3. Compare observed behavior against both inventories:
   - `Defect`: flow is broken, confusing, dead-ended, unsafe, or available to the wrong audience.
   - `Drift`: flow works, but the docs no longer match the app.
   - `Discovery`: adjacent student flow exists but is missing from the access inventory.
4. File a Notion bug for every defect before moving on.
5. Update `student-flow-access-inventory.md` for access drift. Update `mobile-app-flow-inventory.md` only when the canonical flow description itself is wrong.
6. Update this row: final `Tested` symbol, `Result` word, `Bugs` URL(s), `Doc Updated` tick + date, and a one-line note.
7. Move to the next independent flow.

### 2. Blocking Bug Rule

Most bugs are filed and the tester moves on. The exception is a blocking bug.

A blocking bug is any P0/P1 issue (see severity guide in §3) that prevents judging this flow and likely blocks downstream flows, such as app launch failure, sign-in failure, profile load failure, tab shell crash, broken navigation root, API auth/profile scoping failure, or a shared component crash.

When this happens:

1. File the Notion bug first with priority `P0` or `P1`.
2. Set the current row `Tested` to 🚫 and `Result` to `Blocked`. Paste the bug URL into `Bugs`.
3. Pause dependent rows. Continue only with clearly independent flows.
4. Fix the blocker right away if it is safely scoped and reproducible.
5. Verify the fix locally before resuming the blocked row. Security, billing, auth, consent, and data-scope fixes require a negative-path test.
6. If the blocker cannot be fixed in the same pass, mark downstream dependent rows 🚫 / `Blocked`, link the bug, and continue with the next independent batch.

### 3. Filing Bugs In Notion

New bugs go to **Issue Tracker - Open**.

- Database ID: `3598bce9-1f7c-8070-86eb-e012bd99f184`
- Do not create new bugs in the resolved archive database `b8ce802f-1126-4a2f-a123-be5f888cbb23`.
- Prefer the repo Notion workflow/skill when available. Otherwise use the REST API with `NOTION_API_KEY` from Doppler.

Required properties:

| Field | Value |
| --- | --- |
| Bug | `[FLOW-ID] short summary` |
| Status | `Not started` — property type is `status`, not `select`; REST payload must be `{"status": {"name": "Not started"}}` |
| Priority | `P0`, `P1`, `P2`, or `P3` (see severity guide below) |
| Platform | `Mobile-Android`, `Mobile-iOS`, `Mobile-Web`, `API`, `Packages`, or `CI` as applicable (multi-select) |
| Found In | `student-flow-revision-2026-05-22 / Batch N / FLOW-ID` |
| Reported | test date |

Bug body:

- **Repro steps** — numbered list, observable preconditions first.
- **Expected** — what the inventories say should happen.
- **Actual** — what you observed.
- **Screenshot or recording** — attach via the `Screenshots` property (REST file upload) or paste a hosted URL.
- **Build SHA, API target, device, and account slot** (e.g. `S-B`).

Severity guide:

| Priority | Use when |
| --- | --- |
| P0 | Crash (including tab shell crash or shared component crash), data loss, security/privacy leak, billing wrong, consent gate bypassed, API auth/profile scoping failure (data scoped to the wrong profile) |
| P1 | Flow blocked or unusable for a primary student persona; back button dead-ends; key feature broken; broken navigation root; sign-in or profile-load failure |
| P2 | Flow works but UX is degraded; copy wrong; layout broken on small screen |
| P3 | Cosmetic, polish, nice-to-have |

**One bug = one fix.** Do not bundle two unrelated defects into a single Notion page. If a row has multiple defects, file each separately and paste every URL into the row's `Bugs` column, comma-separated.

**Search before filing.** Query the Open tracker (REST `databases/{id}/query` with a title or `Found In` filter) to avoid duplicates. If the same bug already exists, link it instead of duplicating it. Never reopen a Done bug — file a new regression and relate it. See `feedback_notion_resolution_recording.md`.

**Done → Resolved move.** When a bug moves to Done, the same agent that closed it moves the row from `Issue Tracker - Open` (`3598bce9-1f7c-8070-86eb-e012bd99f184`) to `Issue Tracker - Resolved` (`b8ce802f-1126-4a2f-a123-be5f888cbb23`). See `/fix-notion-bugs` for the move recipe.

### 4. Test Account Slots

| Slot | Persona | Needed for |
| --- | --- | --- |
| S-A | Fresh email, no profile | Auth, first profile, onboarding |
| S-B | Adult learner, no subjects | Empty home, create first subject |
| S-C | Adult learner, 2+ subjects, mixed retention | Library, sessions, progress, practice |
| S-D | Under-18 learner needing consent | Consent gates and student restrictions |
| S-E | Child/non-owner profile with entitlement gap | Child paywall and hidden account actions |
| S-F | Adult owner with family links, currently in Study | Adult-can-be-student verification |
| S-G | Account scheduled for deletion | Delete-account scheduled recovery |
| S-H | Trial or paid owner | Subscription, restore, trial, top-up |

### 5. Browser-First Execution

These flows must be walkable in Chrome or the mobile web preview unless the row is explicitly native-only. Do not mark a row blocked merely because the emulator is unavailable. Instead:

1. Test the reachable browser/preview path first.
2. Record any native-only branch as partial coverage in the row notes.
3. File bugs found in browser/preview immediately.
4. Reserve emulator follow-up for camera capture, OS permission redirects, native share sheets, push notifications, app-store billing, and other behavior that cannot exist in Chrome.

### 6. Tested Legend

| Symbol | Meaning |
| --- | --- |
| ⬜ | Not started — row has not been touched yet. |
| 🔄 | In progress — currently being walked. |
| ✅ | Tested and passing. |
| ⚠️ | Tested with non-blocking issues filed (still usable). |
| ❌ | Tested and failing (broken or off-spec for the student audience). |
| 🚫 | Blocked — could not judge because of a filed blocker, missing state, missing harness, or native-only dependency. |
| ➖ | Not applicable / removed — flow intentionally no longer exists; docs must be updated. |

### 7. Result Values

| Result | When to use |
| --- | --- |
| blank | Row not yet tested (`Tested` = ⬜ or 🔄). |
| `Pass` | Works as described. `Tested` = ✅. |
| `Pass w/ issues` | Usable, but one or more non-blocking bugs were filed. `Tested` = ⚠️. |
| `Fail` | Broken or off-spec for the student audience. `Tested` = ❌. |
| `Blocked` | Could not judge because state, service, harness, native capability, or a filed blocker bug prevents the test. `Tested` = 🚫. |
| `Removed` | Flow no longer exists intentionally; docs must be updated. `Tested` = ➖. |

## Table Column Reference

Every batch table below uses the same columns:

| Column | Purpose |
| --- | --- |
| ID | Inventory ID (e.g., `AUTH-05`, `ACCOUNT-19`). |
| Flow | Short flow description matching `mobile-app-flow-inventory.md`. |
| Access expectation | Student-audience access expectation from `student-flow-access-inventory.md`. |
| Tested | Status symbol (⬜ / 🔄 / ✅ / ⚠️ / ❌ / 🚫 / ➖) per Section 6. |
| Result | One of: blank / `Pass` / `Pass w/ issues` / `Fail` / `Blocked` / `Removed` per Section 7. |
| Bugs | Notion URL(s), comma-separated. |
| Doc Updated | Tick + date when the inventory was edited (e.g., ✅ 05-14). |
| Notes | Free-text one-liner with evidence/observation. |

## Batch 1 - Auth And Shared Entry

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | App launch and auth gate | Shared launch/auth gate; default to Study-safe shell while loading. | ⬜ | | | | |
| AUTH-02 | Sign up with email and password | Email sign-up works before audience is known. | ⬜ | | | | |
| AUTH-03 | Sign-up email verification code | Sign-up verification works before audience is known. | ⬜ | | | | |
| AUTH-04 | Sign in with email and password | Email sign-in preserves reachable student route. | ⬜ | | | | |
| AUTH-05 | Additional sign-in verification | Additional sign-in verification preserves reachable student route. | ⬜ | | | | |
| AUTH-06 | Forgot password and reset password | Forgot/reset password remains audience-neutral. | ⬜ | | | | |
| AUTH-07 | Auth screen navigation | Sign-in/sign-up/forgot navigation remains audience-neutral. | ⬜ | | | | |
| AUTH-08 | OAuth sign in / sign up | OAuth buttons/callback entry remain shared. | ⬜ | | | | |
| AUTH-09 | SSO callback completion and fallback | SSO callback fallback returns safely to sign-in. | ⬜ | | | | |
| AUTH-10 | Sign out | Sign-out is available only from permitted surfaces. | ⬜ | | | | |
| AUTH-11 | Session-expired forced sign-out and banner | Session-expired sign-out returns to sign-in with banner. | ⬜ | | | | |
| AUTH-12 | First-time vs returning sign-in copy | First-time vs returning copy remains correct. | ⬜ | | | | |
| AUTH-13 | Deep-link auth redirect preservation | Deep-link redirect restores reachable student routes only. | ⬜ | | | | |
| AUTH-14 | Sign-in transition spinner / stuck-state recovery | Sign-in transition/stuck recovery works. | ⬜ | | | | |

## Batch 2 - Student Profile, Consent, Account, And More

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-01 | Create first profile | First profile creation starts student access. | ⬜ | | | | |
| ACCOUNT-02 | Create additional profile | Additional profile creation does not block student use. | ⬜ | | | | |
| ACCOUNT-03 | Add child profile from More or Profiles | Add-child is optional setup, not required for Study. | ⬜ | | | | |
| ACCOUNT-04 | Profile switching | Switching real profiles loads that profile's own Study context. | ⬜ | | | | |
| ACCOUNT-05 | Family-plan / max-profile gating | Family/max-profile gates do not block student learning. | ⬜ | | | | |
| ACCOUNT-06 | More hub navigation | More shows student-safe settings and role-gated owner rows. | ⬜ | | | | |
| ACCOUNT-07 | Notifications sub-screen | Notification settings work from More. | ⬜ | | | | |
| ACCOUNT-08 | Learning preferences / accommodation | Learning preferences affect the active student's own learning. | ⬜ | | | | |
| ACCOUNT-09 | Change password | Change password is owner-only. | ⬜ | | | | |
| ACCOUNT-10 | Export my data | Export is owner-only. | ⬜ | | | | |
| ACCOUNT-11 | Delete account | Delete account is owner-only. | ⬜ | | | | |
| ACCOUNT-12 | Scheduled deletion / Keep account | Scheduled deletion recovery works for owner profile. | ⬜ | | | | |
| ACCOUNT-13 | Privacy policy | Privacy policy is reachable where surfaced. | ⬜ | | | | |
| ACCOUNT-14 | Terms of service | Terms are reachable where surfaced. | ⬜ | | | | |
| ACCOUNT-15 | Self mentor memory | Self mentor memory behaves as the student's own memory/preferences. | ⬜ | | | | |
| ACCOUNT-16 | Child mentor memory | Child mentor memory is not surfaced as student self-service. | ⬜ | | | | |
| ACCOUNT-17 | Child memory consent prompt | Child memory consent prompt is not surfaced as student self-service. | ⬜ | | | | |
| ACCOUNT-18 | Subject analogy preference | Subject analogy preference applies to active student's subject. | ⬜ | | | | |
| ACCOUNT-19 | Consent request during underage profile creation | Underage consent request gates student access correctly. | ⬜ | | | | |
| ACCOUNT-20 | Child handoff to parent consent | Child handoff to parent consent works. | ⬜ | | | | |
| ACCOUNT-21 | Parent email entry / send / resend / change | Parent email entry/resend/change email works for consent. | ⬜ | | | | |
| ACCOUNT-22 | Consent pending gate | Consent pending gate blocks learning and provides recovery. | ⬜ | | | | |
| ACCOUNT-23 | Consent withdrawn gate | Consent withdrawn gate blocks learning and provides recovery. | ⬜ | | | | |
| ACCOUNT-24 | Post-approval landing | Post-approval landing restores student access. | ⬜ | | | | |
| ACCOUNT-25 | Parent consent management | Parent consent management is not student self-service. | ⬜ | | | | |
| ACCOUNT-26 | Regional consent variants | Regional consent variants gate student access correctly. | ⬜ | | | | |
| ACCOUNT-27 | Parent consent deny confirmation | Parent deny confirmation is not student self-service. | ⬜ | | | | |
| ACCOUNT-28 | App language picker | App language picker works from permitted account surface. | ⬜ | | | | |
| ACCOUNT-29 | Mentor language row | Mentor-language/account-language entry does not create a separate identity. | ⬜ | | | | |
| ACCOUNT-30 | More restrictions in impersonated-child mode | Proxy-only More restrictions do not replace normal Study access. | ⬜ | | | | |

## Batch 3 - Student Home And Subject Setup

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home | Learner home shows student carousel/actions. | ⬜ | | | | |
| HOME-02 | Parent gateway home | Parent gateway home is not the Study home. | ⬜ | | | | |
| HOME-03 | Parent tabs and parent-mode navigation | Parent-mode navigation is not surfaced from Study. | ⬜ | | | | |
| HOME-04 | Animated splash and initial shell | Splash and initial shell remain shared. | ⬜ | | | | |
| HOME-05 | Empty first-user state | Empty first-user state opens create-subject. | ⬜ | | | | |
| HOME-06 | Resume interrupted session | Resume interrupted session resumes active student's session. | ⬜ | | | | |
| HOME-07 | Add-first-child gate (family/pro plans) | Add-first-child setup does not block Study. | ⬜ | | | | |
| HOME-08 | Home loading-timeout fallback | Home loading timeout has Study-safe recovery. | ⬜ | | | | |
| SUBJECT-01 | Create subject from learner home | Create subject from learner home writes to active student. | ⬜ | | | | |
| SUBJECT-02 | Create subject from library empty state | Create subject from library writes to active student. | ⬜ | | | | |
| SUBJECT-03 | Create subject from chat classifier | Chat classifier fallback returns to active student's chat. | ⬜ | | | | |
| SUBJECT-04 | Create subject from homework | Homework subject creation writes to active student. | ⬜ | | | | |
| SUBJECT-05 | Subject resolution and clarification | Subject resolution/suggestion flow works for active student. | ⬜ | | | | |
| SUBJECT-06 | Broad subject flow + book pick | Broad subject → book selection works for active student. | ⬜ | | | | |
| SUBJECT-07 | Focused subject / focused-book flow | Focused subject/book starts active student's learning. | ⬜ | | | | |
| SUBJECT-08 | Per-subject native-language setup | Language subject setup belongs to active student. | ⬜ | | | | |
| SUBJECT-12 | View curriculum without committing | View curriculum without session works from Study routes. | ⬜ | | | | |
| SUBJECT-14 | Placement / knowledge assessment | Placement/knowledge assessment records active student's level. | ⬜ | | | | |
| SUBJECT-16 | Conversation-language picker | Conversation-language setup works for profile. | ⬜ | | | | |
| SUBJECT-17 | Pronouns picker | Pronouns setup obeys age gate. | ⬜ | | | | |

## Batch 4 - Learning, Library, Retention, And Progress

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LEARN-01 | Freeform chat | Ask Anything opens active student's freeform session. | ⬜ | | | | |
| LEARN-02 | Guided learning session | Guided session starts for active student. | ⬜ | | | | |
| LEARN-03 | First session experience | First session experience works for active student. | ⬜ | | | | |
| LEARN-04 | Core learning loop | Core learning loop works for active student. | ⬜ | | | | |
| LEARN-05 | Coach bubble visual variants | Coach bubble variants render in student session. | ⬜ | | | | |
| LEARN-06 | Voice input and voice-speed controls | Voice input and voice-speed controls work. | ⬜ | | | | |
| LEARN-07 | Session summary | Session summary belongs to session owner. | ⬜ | | | | |
| LEARN-08 | Library v3 | Library is surfaced in Study and shows active student's subjects. | ⬜ | | | | |
| LEARN-09 | Subject shelf → book selection | Shelf/book selection belongs to active student. | ⬜ | | | | |
| LEARN-10 | Book detail and start learning | Book detail starts learning for active student. | ⬜ | | | | |
| LEARN-11 | Manage subject status | Manage subject status affects active student's subject. | ⬜ | | | | |
| LEARN-12 | Topic detail | Topic detail belongs to active student. | ⬜ | | | | |
| LEARN-13 | Recall check | Recall check belongs to active student. | ⬜ | | | | |
| LEARN-14 | Failed recall remediation | Failed recall remediation belongs to active student. | ⬜ | | | | |
| LEARN-15 | Relearn flow | Relearn flow writes active student's session/review data. | ⬜ | | | | |
| LEARN-16 | Retention review | Retention review belongs to active student. | ⬜ | | | | |
| LEARN-17 | Progress overview tab | Progress tab shows active student's own progress. | ⬜ | | | | |
| LEARN-18 | Subject progress detail | Subject progress detail shows active student's subject. | ⬜ | | | | |
| LEARN-19 | Streak display | Streak display reflects active student. | ⬜ | | | | |
| LEARN-20 | Milestones list | Milestones list reflects active student. | ⬜ | | | | |
| LEARN-21 | Cross-subject vocabulary browser | Cross-subject vocabulary browser reflects active student. | ⬜ | | | | |
| LEARN-22 | Per-subject vocabulary list | Per-subject vocabulary belongs to active student. | ⬜ | | | | |
| LEARN-23 | Read-only session transcript | Transcript view is available for active student's completed sessions. | ⬜ | | | | |
| LEARN-24 | Saved bookmarks | Saved bookmarks show/delete active student's bookmarks only. | ⬜ | | | | |
| LEARN-25 | Library inline search | Library search searches active student's library. | ⬜ | | | | |
| LEARN-26 | First-curriculum session entry | First-curriculum session entry creates active student's session. | ⬜ | | | | |

## Batch 5 - Practice, Quiz, And Dictation

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PRACTICE-01 | Practice hub | Practice hub is reachable from Study home. | ⬜ | | | | |
| PRACTICE-02 | Review topics shortcut | Review shortcut opens active student's relearn flow. | ⬜ | | | | |
| PRACTICE-03 | Recitation session | Recitation session belongs to active student. | ⬜ | | | | |
| PRACTICE-04 | "All caught up" empty state | All-caught-up state reflects active student. | ⬜ | | | | |
| QUIZ-01 | Quiz activity picker | Quiz picker reflects active student's quiz options. | ⬜ | | | | |
| QUIZ-02 | Round generation loading screen | Quiz launch/loading handles active student's round. | ⬜ | | | | |
| QUIZ-03 | Round play — multiple choice | Multiple choice/free-text play works. | ⬜ | | | | |
| QUIZ-04 | Round play — Guess Who clue reveal | Guess Who play works. | ⬜ | | | | |
| QUIZ-05 | Mid-round quit | Mid-round quit returns safely. | ⬜ | | | | |
| QUIZ-06 | Round complete error retry | Round complete retry/exit works. | ⬜ | | | | |
| QUIZ-07 | Results screen | Results and Play Again work for active student. | ⬜ | | | | |
| QUIZ-08 | Quiz quota / consent / forbidden errors | Quota/consent/forbidden errors are typed and safe. | ⬜ | | | | |
| QUIZ-09 | Quiz history | Quiz history shows active student's completed rounds. | ⬜ | | | | |
| QUIZ-10 | Quiz round detail | Round detail shows active student's round. | ⬜ | | | | |
| QUIZ-11 | Malformed-round guard | Malformed-round guard avoids dead end. | ⬜ | | | | |
| QUIZ-12 | Wrong-answer dispute | Wrong-answer dispute works. | ⬜ | | | | |
| QUIZ-13 | Answer-check failure non-blocking warning | Answer-check failure warning is non-blocking. | ⬜ | | | | |
| DICT-01 | Dictation choice screen | Dictation choice starts active student's activity. | ⬜ | | | | |
| DICT-02 | OCR text preview + edit | OCR text preview/edit works. | ⬜ | | | | |
| DICT-03 | "Surprise me" LLM-generated dictation | Generated dictation handles timeout/cancel/retry. | ⬜ | | | | |
| DICT-04 | Playback screen | Playback controls work. | ⬜ | | | | |
| DICT-05 | Mid-dictation exit confirm | Mid-dictation exit confirm works. | ⬜ | | | | |
| DICT-06 | Completion screen | Completion screen and save/retry work. | ⬜ | | | | |
| DICT-07 | Photo review of handwritten dictation | Photo review belongs to active student. | ⬜ | | | | |
| DICT-08 | Sentence-level remediation | Sentence remediation works. | ⬜ | | | | |
| DICT-09 | Perfect-score celebration | Perfect-score celebration works. | ⬜ | | | | |
| DICT-10 | Recording dictation result | Result recording is scoped to active student. | ⬜ | | | | |

## Batch 6 - Homework

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HOMEWORK-01 | Start homework from learner home | Homework starts from student home. | ⬜ | | | | |
| HOMEWORK-02 | Camera permission, capture, preview, OCR | Camera permission/capture/OCR works. | ⬜ | | | | |
| HOMEWORK-03 | Manual fallback | Manual fallback works when OCR is weak/fails. | ⬜ | | | | |
| HOMEWORK-04 | Homework tutoring session | Homework tutoring session belongs to active student. | ⬜ | | | | |
| HOMEWORK-05 | Gallery import | Gallery import works where supported. | ⬜ | | | | |
| HOMEWORK-06 | Image pass-through to vision LLM | Image pass-through reaches multimodal session safely. | ⬜ | | | | |
| HOMEWORK-07 | Camera permission onboarding | Permission denied/settings recovery works. | ⬜ | | | | |

## Batch 7 - Student Billing And Paywalls

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Subscription details screen | Owner can open subscription details. | ⬜ | | | | |
| BILLING-02 | Owner upgrade flow | Owner upgrade flow starts safely. | ⬜ | | | | |
| BILLING-03 | Trial / usage / family-pool states | Trial/usage/family-pool states render without changing Study scope. | ⬜ | | | | |
| BILLING-04 | Restore purchases | Restore purchases works for owner. | ⬜ | | | | |
| BILLING-05 | Manage billing deep-link | Manage billing deep-link is safe. | ⬜ | | | | |
| BILLING-06 | ChildPaywall + notify-parent | Child/non-owner paywall offers notify-parent, not purchase management. | ⬜ | | | | |
| BILLING-07 | Daily quota exceeded paywall | Daily quota paywall works for active student/adult. | ⬜ | | | | |
| BILLING-08 | Family pool details | Family pool billing is owner-only and does not change Study data. | ⬜ | | | | |
| BILLING-09 | Top-up question credits | Top-up section works for eligible owner. | ⬜ | | | | |
| BILLING-10 | BYOK waitlist | BYOK waitlist state is correct if visible. | ⬜ | | | | |
| BILLING-11 | Trial banner | Trial banner/status renders for trial owner. | ⬜ | | | | |
| BILLING-12 | Static plan comparison cards | Static comparison cards render safely. | ⬜ | | | | |

## Batch 8 - Negative Mentor Access From Study

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PARENT-01 | Parent dashboard | Parent dashboard is not surfaced from Study. | ⬜ | | | | |
| PARENT-02 | Multi-child dashboard | Multi-child dashboard is not surfaced from Study. | ⬜ | | | | |
| PARENT-03 | Child detail drill-down | Child detail is not surfaced from Study. | ⬜ | | | | |
| PARENT-04 | Child subject → topic drill-down | Child subject/topic drill-down is not surfaced from Study. | ⬜ | | | | |
| PARENT-05 | Child session / transcript drill-down | Child session/transcript review is not surfaced from Study. | ⬜ | | | | |
| PARENT-06 | Child reports list and detail | Child reports are not surfaced from Study. | ⬜ | | | | |
| PARENT-07 | Parent library view | Top-level Library remains adult self Library in Study, not child curriculum. | ⬜ | | | | |
| PARENT-08 | Subject raw-input audit | Subject raw-input audit is not surfaced from Study. | ⬜ | | | | |
| PARENT-09 | Guided label tooltip | Guided label tooltip is not surfaced from Study. | ⬜ | | | | |
| PARENT-10 | Child topic Understanding / Retention cards | Child Understanding/Retention cards are not surfaced from Study. | ⬜ | | | | |
| PARENT-11 | Child session recap (Recaps source) | Child session recap is not surfaced from Study. | ⬜ | | | | |
| PARENT-12 | Child-subject retention badges | Child retention badges are not surfaced from Study. | ⬜ | | | | |
| PARENT-13 | Child weekly report detail | Child weekly report detail is not surfaced from Study except protected deep link handling. | ⬜ | | | | |

## Batch 9 - Student Cross-Cutting Pass

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC-01 | Conversation-stage-aware chips / feedback gating | Conversation-stage chips/feedback gating work in student sessions. | ⬜ | | | | |
| CC-02 | Greeting-aware subject classification | Greeting-aware subject classification works. | ⬜ | | | | |
| CC-03 | Animation polish (icons, intent, celebrations, permissions) | Animation polish is acceptable on student paths. | ⬜ | | | | |
| CC-04 | `goBackOrReplace` back navigation | Back buttons use safe fallbacks. | ⬜ | | | | |
| CC-05 | Continue-where-you-left-off card | Continue-where-left-off is scoped to active student. | ⬜ | | | | |
| CC-06 | Top-up purchase confidence | Top-up purchase confidence behaves safely. | ⬜ | | | | |
| CC-07 | Accommodation badge surfaces | Self accommodations show; child editors are not exposed in Study. | ⬜ | | | | |
| CC-08 | Parent-facing metric vocabulary | Parent-facing vocabulary is not exposed in Study. | ⬜ | | | | |
| CC-09 | Opaque web layout backgrounds | Web backgrounds do not bleed between student stacks. | ⬜ | | | | |
| CC-10 | Soft-fail side effects on completion screens | Completion side effects soft-fail without blocking student celebration. | ⬜ | | | | |
| CC-11 | i18n `t()` cross-cutting strings | i18n works on student surfaces. | ⬜ | | | | |
| CC-12 | FeedbackProvider + shake-to-feedback | FeedbackProvider works on student gates/More. | ⬜ | | | | |
| CC-13 | Streaming error classification + stream-fallback guard | Streaming error recovery is safe. | ⬜ | | | | |
| CC-14 | Envelope-strip render guard at chat-bubble boundary | Envelope JSON is stripped at render boundary. | ⬜ | | | | |
| CC-15 | RN Web stale-send block in ChatShell | RN Web stale-send block prevents duplicate sends. | ⬜ | | | | |
| CC-16 | HMR-safe error type guards | HMR-safe error guards work. | ⬜ | | | | |
| CC-17 | Profile-as-lens navigation pattern | Profile-as-lens does not leak mentor state into Study. | ⬜ | | | | |
| CC-18 | Stable FlatList refs | Stable list refs hold on student list surfaces. | ⬜ | | | | |

## Discovered Student Flows

| Temp ID | Flow | Found in batch | Routes / entry points | Inventory updated | Notes |
| --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | |

## Master Roll-Up

| Batch | Section | Items | Status | Notes |
| --- | ---: | ---: | --- | --- |
| 1 | Auth And Shared Entry | 14 | ⬜ | |
| 2 | Student Profile, Consent, Account, And More | 30 | ⬜ | |
| 3 | Student Home And Subject Setup | 20 | ⬜ | |
| 4 | Learning, Library, Retention, And Progress | 26 | ⬜ | |
| 5 | Practice, Quiz, And Dictation | 27 | ⬜ | |
| 6 | Homework | 7 | ⬜ | |
| 7 | Student Billing And Paywalls | 12 | ⬜ | |
| 8 | Negative Mentor Access From Study | 13 | ⬜ | |
| 9 | Student Cross-Cutting Pass | 18 | ⬜ | |
| **Total** | | **167** | ⬜ | |
