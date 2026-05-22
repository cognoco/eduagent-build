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

1. Set the row status to `IN_PROGRESS`.
2. Walk every documented entry point and branch for that flow.
3. Compare observed behavior against both inventories:
   - `Defect`: flow is broken, confusing, dead-ended, unsafe, or available to the wrong audience.
   - `Drift`: flow works, but the docs no longer match the app.
   - `Discovery`: adjacent student flow exists but is missing from the access inventory.
4. File a Notion bug for every defect before moving on.
5. Update `student-flow-access-inventory.md` for access drift. Update `mobile-app-flow-inventory.md` only when the canonical flow description itself is wrong.
6. Update this row with final status, result, bug links, doc update date, and a one-line note.
7. Move to the next independent flow.

### 2. Blocking Bug Rule

Most bugs are filed and the tester moves on. The exception is a blocking bug.

A blocking bug is any P0/P1 issue that prevents judging this flow and likely blocks downstream flows, such as app launch failure, sign-in failure, profile load failure, tab shell crash, broken navigation root, API auth/profile scoping failure, or a shared component crash.

When this happens:

1. File the Notion bug first with priority `P0` or `P1`.
2. Mark the current row `BLOCKED_BY_BUG` and paste the bug URL.
3. Pause dependent rows. Continue only with clearly independent flows.
4. Fix the blocker right away if it is safely scoped and reproducible.
5. Verify the fix locally before resuming the blocked row. Security, billing, auth, consent, and data-scope fixes require a negative-path test.
6. If the blocker cannot be fixed in the same pass, mark downstream dependent rows `BLOCKED`, link the bug, and continue with the next independent batch.

### 3. Filing Bugs In Notion

New bugs go to **Issue Tracker - Open**.

- Database ID: `3598bce9-1f7c-8070-86eb-e012bd99f184`
- Do not create new bugs in the resolved archive database `b8ce802f-1126-4a2f-a123-be5f888cbb23`.
- Prefer the repo Notion workflow/skill when available. Otherwise use the REST API with `NOTION_API_KEY` from Doppler.

Required properties:

| Field | Value |
| --- | --- |
| Bug | `[FLOW-ID] short summary` |
| Status | `Not started` |
| Priority | `P0`, `P1`, `P2`, or `P3` |
| Platform | `Mobile-Android`, `Mobile-iOS`, `Mobile-Web`, `API`, `Packages`, or `CI` as applicable |
| Found In | `student-flow-revision-2026-05-22 / Batch N / FLOW-ID` |
| Reported | test date |

Bug body:

- Repro steps.
- Expected behavior from the inventories.
- Actual behavior.
- Screenshot or recording link when available.
- Build SHA, API target, device, and account slot.

Before creating a bug, search the Open tracker for the same title or `Found In` tag. If the same bug already exists, link it instead of duplicating it. Never reopen a Done bug; file a new regression and relate it.

### 4. Result Convention

| Status | Result | Meaning |
| --- | --- | --- |
| `TODO` | blank | Not yet tested. |
| `IN_PROGRESS` | blank | Testing now. |
| `PASS` | `Pass` | Works as described. |
| `ISSUES` | `Pass w/ issues` | Usable, but one or more non-blocking bugs were filed. |
| `FAIL` | `Fail` | Broken or off-spec for the student audience. |
| `BLOCKED` | `Blocked` | Could not judge because state, service, harness, or native capability is missing. |
| `BLOCKED_BY_BUG` | `Fail` or `Blocked` | A filed blocker must be fixed before dependent flows can be judged. |
| `REMOVED` | `Removed` | Flow no longer exists intentionally; docs must be updated. |

### 5. Test Account Slots

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

### 6. Browser-First Execution

These flows must be walkable in Chrome or the mobile web preview unless the row is explicitly native-only. Do not mark a row blocked merely because the emulator is unavailable. Instead:

1. Test the reachable browser/preview path first.
2. Record any native-only branch as partial coverage in the row notes.
3. File bugs found in browser/preview immediately.
4. Reserve emulator follow-up for camera capture, OS permission redirects, native share sheets, push notifications, app-store billing, and other behavior that cannot exist in Chrome.

## Batch 1 - Auth And Shared Entry

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | Shared launch/auth gate; default to Study-safe shell while loading. | TODO | | | | |
| AUTH-02 | Email sign-up works before audience is known. | TODO | | | | |
| AUTH-03 | Sign-up verification works before audience is known. | TODO | | | | |
| AUTH-04 | Email sign-in preserves reachable student route. | TODO | | | | |
| AUTH-05 | Additional sign-in verification preserves reachable student route. | TODO | | | | |
| AUTH-06 | Forgot/reset password remains audience-neutral. | TODO | | | | |
| AUTH-07 | Sign-in/sign-up/forgot navigation remains audience-neutral. | TODO | | | | |
| AUTH-08 | OAuth buttons/callback entry remain shared. | TODO | | | | |
| AUTH-09 | SSO callback fallback returns safely to sign-in. | TODO | | | | |
| AUTH-10 | Sign-out is available only from permitted surfaces. | TODO | | | | |
| AUTH-11 | Session-expired sign-out returns to sign-in with banner. | TODO | | | | |
| AUTH-12 | First-time vs returning copy remains correct. | TODO | | | | |
| AUTH-13 | Deep-link redirect restores reachable student routes only. | TODO | | | | |
| AUTH-14 | Sign-in transition/stuck recovery works. | TODO | | | | |

## Batch 2 - Student Profile, Consent, Account, And More

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-01 | First profile creation starts student access. | TODO | | | | |
| ACCOUNT-02 | Additional profile creation does not block student use. | TODO | | | | |
| ACCOUNT-03 | Add-child is optional setup, not required for Study. | TODO | | | | |
| ACCOUNT-04 | Switching real profiles loads that profile's own Study context. | TODO | | | | |
| ACCOUNT-05 | Family/max-profile gates do not block student learning. | TODO | | | | |
| ACCOUNT-06 | More shows student-safe settings and role-gated owner rows. | TODO | | | | |
| ACCOUNT-07 | Notification settings work from More. | TODO | | | | |
| ACCOUNT-08 | Learning preferences affect the active student's own learning. | TODO | | | | |
| ACCOUNT-09 | Change password is owner-only. | TODO | | | | |
| ACCOUNT-10 | Export is owner-only. | TODO | | | | |
| ACCOUNT-11 | Delete account is owner-only. | TODO | | | | |
| ACCOUNT-12 | Scheduled deletion recovery works for owner profile. | TODO | | | | |
| ACCOUNT-13 | Privacy policy is reachable where surfaced. | TODO | | | | |
| ACCOUNT-14 | Terms are reachable where surfaced. | TODO | | | | |
| ACCOUNT-15 | Self mentor memory behaves as the student's own memory/preferences. | TODO | | | | |
| ACCOUNT-16 | Child mentor memory is not surfaced as student self-service. | TODO | | | | |
| ACCOUNT-17 | Child memory consent prompt is not surfaced as student self-service. | TODO | | | | |
| ACCOUNT-18 | Subject analogy preference applies to active student's subject. | TODO | | | | |
| ACCOUNT-19 | Underage consent request gates student access correctly. | TODO | | | | |
| ACCOUNT-20 | Child handoff to parent consent works. | TODO | | | | |
| ACCOUNT-21 | Parent email entry/resend/change email works for consent. | TODO | | | | |
| ACCOUNT-22 | Consent pending gate blocks learning and provides recovery. | TODO | | | | |
| ACCOUNT-23 | Consent withdrawn gate blocks learning and provides recovery. | TODO | | | | |
| ACCOUNT-24 | Post-approval landing restores student access. | TODO | | | | |
| ACCOUNT-25 | Parent consent management is not student self-service. | TODO | | | | |
| ACCOUNT-26 | Regional consent variants gate student access correctly. | TODO | | | | |
| ACCOUNT-27 | Parent deny confirmation is not student self-service. | TODO | | | | |
| ACCOUNT-28 | App language picker works from permitted account surface. | TODO | | | | |
| ACCOUNT-29 | Mentor-language/account-language entry does not create a separate identity. | TODO | | | | |
| ACCOUNT-30 | Proxy-only More restrictions do not replace normal Study access. | TODO | | | | |

## Batch 3 - Student Home And Subject Setup

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home shows student carousel/actions. | TODO | | | | |
| HOME-02 | Parent gateway home is not the Study home. | TODO | | | | |
| HOME-03 | Parent-mode navigation is not surfaced from Study. | TODO | | | | |
| HOME-04 | Splash and initial shell remain shared. | TODO | | | | |
| HOME-05 | Empty first-user state opens create-subject. | TODO | | | | |
| HOME-06 | Resume interrupted session resumes active student's session. | TODO | | | | |
| HOME-07 | Add-first-child setup does not block Study. | TODO | | | | |
| HOME-08 | Home loading timeout has Study-safe recovery. | TODO | | | | |
| SUBJECT-01 | Create subject from learner home writes to active student. | TODO | | | | |
| SUBJECT-02 | Create subject from library writes to active student. | TODO | | | | |
| SUBJECT-03 | Chat classifier fallback returns to active student's chat. | TODO | | | | |
| SUBJECT-04 | Homework subject creation writes to active student. | TODO | | | | |
| SUBJECT-05 | Subject resolution/suggestion flow works for active student. | TODO | | | | |
| SUBJECT-06 | Broad subject -> book selection works for active student. | TODO | | | | |
| SUBJECT-07 | Focused subject/book starts active student's learning. | TODO | | | | |
| SUBJECT-08 | Language subject setup belongs to active student. | TODO | | | | |
| SUBJECT-12 | View curriculum without session works from Study routes. | TODO | | | | |
| SUBJECT-14 | Placement/knowledge assessment records active student's level. | TODO | | | | |
| SUBJECT-16 | Conversation-language setup works for profile. | TODO | | | | |
| SUBJECT-17 | Pronouns setup obeys age gate. | TODO | | | | |

## Batch 4 - Learning, Library, Retention, And Progress

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-01 | Ask Anything opens active student's freeform session. | TODO | | | | |
| LEARN-02 | Guided session starts for active student. | TODO | | | | |
| LEARN-03 | First session experience works for active student. | TODO | | | | |
| LEARN-04 | Core learning loop works for active student. | TODO | | | | |
| LEARN-05 | Coach bubble variants render in student session. | TODO | | | | |
| LEARN-06 | Voice input and voice-speed controls work. | TODO | | | | |
| LEARN-07 | Session summary belongs to session owner. | TODO | | | | |
| LEARN-08 | Library is surfaced in Study and shows active student's subjects. | TODO | | | | |
| LEARN-09 | Shelf/book selection belongs to active student. | TODO | | | | |
| LEARN-10 | Book detail starts learning for active student. | TODO | | | | |
| LEARN-11 | Manage subject status affects active student's subject. | TODO | | | | |
| LEARN-12 | Topic detail belongs to active student. | TODO | | | | |
| LEARN-13 | Recall check belongs to active student. | TODO | | | | |
| LEARN-14 | Failed recall remediation belongs to active student. | TODO | | | | |
| LEARN-15 | Relearn flow writes active student's session/review data. | TODO | | | | |
| LEARN-16 | Retention review belongs to active student. | TODO | | | | |
| LEARN-17 | Progress tab shows active student's own progress. | TODO | | | | |
| LEARN-18 | Subject progress detail shows active student's subject. | TODO | | | | |
| LEARN-19 | Streak display reflects active student. | TODO | | | | |
| LEARN-20 | Milestones list reflects active student. | TODO | | | | |
| LEARN-21 | Cross-subject vocabulary browser reflects active student. | TODO | | | | |
| LEARN-22 | Per-subject vocabulary belongs to active student. | TODO | | | | |
| LEARN-23 | Transcript view is available for active student's completed sessions. | TODO | | | | |
| LEARN-24 | Saved bookmarks show/delete active student's bookmarks only. | TODO | | | | |
| LEARN-25 | Library inline search searches active student's library. | TODO | | | | |
| LEARN-26 | First-curriculum session entry creates active student's session. | TODO | | | | |

## Batch 5 - Practice, Quiz, And Dictation

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PRACTICE-01 | Practice hub is reachable from Study home. | TODO | | | | |
| PRACTICE-02 | Review shortcut opens active student's relearn flow. | TODO | | | | |
| PRACTICE-03 | Recitation session belongs to active student. | TODO | | | | |
| PRACTICE-04 | All-caught-up state reflects active student. | TODO | | | | |
| QUIZ-01 | Quiz picker reflects active student's quiz options. | TODO | | | | |
| QUIZ-02 | Quiz launch/loading handles active student's round. | TODO | | | | |
| QUIZ-03 | Multiple choice/free-text play works. | TODO | | | | |
| QUIZ-04 | Guess Who play works. | TODO | | | | |
| QUIZ-05 | Mid-round quit returns safely. | TODO | | | | |
| QUIZ-06 | Round complete retry/exit works. | TODO | | | | |
| QUIZ-07 | Results and Play Again work for active student. | TODO | | | | |
| QUIZ-08 | Quota/consent/forbidden errors are typed and safe. | TODO | | | | |
| QUIZ-09 | Quiz history shows active student's completed rounds. | TODO | | | | |
| QUIZ-10 | Round detail shows active student's round. | TODO | | | | |
| QUIZ-11 | Malformed-round guard avoids dead end. | TODO | | | | |
| QUIZ-12 | Wrong-answer dispute works. | TODO | | | | |
| QUIZ-13 | Answer-check failure warning is non-blocking. | TODO | | | | |
| DICT-01 | Dictation choice starts active student's activity. | TODO | | | | |
| DICT-02 | OCR text preview/edit works. | TODO | | | | |
| DICT-03 | Generated dictation handles timeout/cancel/retry. | TODO | | | | |
| DICT-04 | Playback controls work. | TODO | | | | |
| DICT-05 | Mid-dictation exit confirm works. | TODO | | | | |
| DICT-06 | Completion screen and save/retry work. | TODO | | | | |
| DICT-07 | Photo review belongs to active student. | TODO | | | | |
| DICT-08 | Sentence remediation works. | TODO | | | | |
| DICT-09 | Perfect-score celebration works. | TODO | | | | |
| DICT-10 | Result recording is scoped to active student. | TODO | | | | |

## Batch 6 - Homework

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOMEWORK-01 | Homework starts from student home/More. | TODO | | | | |
| HOMEWORK-02 | Camera permission/capture/OCR works. | TODO | | | | |
| HOMEWORK-03 | Manual fallback works when OCR is weak/fails. | TODO | | | | |
| HOMEWORK-04 | Homework tutoring session belongs to active student. | TODO | | | | |
| HOMEWORK-05 | Gallery import works where supported. | TODO | | | | |
| HOMEWORK-06 | Image pass-through reaches multimodal session safely. | TODO | | | | |
| HOMEWORK-07 | Permission denied/settings recovery works. | TODO | | | | |

## Batch 7 - Student Billing And Paywalls

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Owner can open subscription details. | TODO | | | | |
| BILLING-02 | Owner upgrade flow starts safely. | TODO | | | | |
| BILLING-03 | Trial/usage/family-pool states render without changing Study scope. | TODO | | | | |
| BILLING-04 | Restore purchases works for owner. | TODO | | | | |
| BILLING-05 | Manage billing deep-link is safe. | TODO | | | | |
| BILLING-06 | Child/non-owner paywall offers notify-parent, not purchase management. | TODO | | | | |
| BILLING-07 | Daily quota paywall works for active student/adult. | TODO | | | | |
| BILLING-08 | Family pool billing is owner-only and does not change Study data. | TODO | | | | |
| BILLING-09 | Top-up section works for eligible owner. | TODO | | | | |
| BILLING-10 | BYOK waitlist state is correct if visible. | TODO | | | | |
| BILLING-11 | Trial banner/status renders for trial owner. | TODO | | | | |
| BILLING-12 | Static comparison cards render safely. | TODO | | | | |

## Batch 8 - Negative Mentor Access From Study

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PARENT-01 | Parent dashboard is not surfaced from Study. | TODO | | | | |
| PARENT-02 | Multi-child dashboard is not surfaced from Study. | TODO | | | | |
| PARENT-03 | Child detail is not surfaced from Study. | TODO | | | | |
| PARENT-04 | Child subject/topic drill-down is not surfaced from Study. | TODO | | | | |
| PARENT-05 | Child session/transcript review is not surfaced from Study. | TODO | | | | |
| PARENT-06 | Child reports are not surfaced from Study. | TODO | | | | |
| PARENT-07 | Top-level Library remains adult self Library in Study, not child curriculum. | TODO | | | | |
| PARENT-08 | Subject raw-input audit is not surfaced from Study. | TODO | | | | |
| PARENT-09 | Guided label tooltip is not surfaced from Study. | TODO | | | | |
| PARENT-10 | Child Understanding/Retention cards are not surfaced from Study. | TODO | | | | |
| PARENT-11 | Child session recap is not surfaced from Study. | TODO | | | | |
| PARENT-12 | Child retention badges are not surfaced from Study. | TODO | | | | |
| PARENT-13 | Child weekly report detail is not surfaced from Study except protected deep link handling. | TODO | | | | |

## Batch 9 - Student Cross-Cutting Pass

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CC-01 | Conversation-stage chips/feedback gating work in student sessions. | TODO | | | | |
| CC-02 | Greeting-aware subject classification works. | TODO | | | | |
| CC-03 | Animation polish is acceptable on student paths. | TODO | | | | |
| CC-04 | Back buttons use safe fallbacks. | TODO | | | | |
| CC-05 | Continue-where-left-off is scoped to active student. | TODO | | | | |
| CC-06 | Top-up purchase confidence behaves safely. | TODO | | | | |
| CC-07 | Self accommodations show; child editors are not exposed in Study. | TODO | | | | |
| CC-08 | Parent-facing vocabulary is not exposed in Study. | TODO | | | | |
| CC-09 | Web backgrounds do not bleed between student stacks. | TODO | | | | |
| CC-10 | Completion side effects soft-fail without blocking student celebration. | TODO | | | | |
| CC-11 | i18n works on student surfaces. | TODO | | | | |
| CC-12 | FeedbackProvider works on student gates/More. | TODO | | | | |
| CC-13 | Streaming error recovery is safe. | TODO | | | | |
| CC-14 | Envelope JSON is stripped at render boundary. | TODO | | | | |
| CC-15 | RN Web stale-send block prevents duplicate sends. | TODO | | | | |
| CC-16 | HMR-safe error guards work. | TODO | | | | |
| CC-17 | Profile-as-lens does not leak mentor state into Study. | TODO | | | | |
| CC-18 | Stable list refs hold on student list surfaces. | TODO | | | | |

## Discovered Student Flows

| Temp ID | Flow | Found in batch | Routes / entry points | Inventory updated | Notes |
| --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | |

## Master Roll-Up

| Batch | Section | Items | Status | Notes |
| --- | ---: | ---: | --- | --- |
| 1 | Auth And Shared Entry | 14 | TODO | |
| 2 | Student Profile, Consent, Account, And More | 30 | TODO | |
| 3 | Student Home And Subject Setup | 20 | TODO | |
| 4 | Learning, Library, Retention, And Progress | 26 | TODO | |
| 5 | Practice, Quiz, And Dictation | 27 | TODO | |
| 6 | Homework | 7 | TODO | |
| 7 | Student Billing And Paywalls | 12 | TODO | |
| 8 | Negative Mentor Access From Study | 13 | TODO | |
| 9 | Student Cross-Cutting Pass | 18 | TODO | |
| **Total** | | **167** | TODO | |
