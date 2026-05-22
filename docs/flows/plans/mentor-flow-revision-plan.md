> **STATUS: DRAFT** - mentor audience flow revision plan. Created 2026-05-22.

# Mentor Flow Revision Plan

Source access inventory: [`mentor-flow-access-inventory.md`](../mentor-flow-access-inventory.md).
Canonical flow inventory: [`mobile-app-flow-inventory.md`](../mobile-app-flow-inventory.md).
Navigation target reference: [`2026-05-21-navigation-contract.md`](../../specs/2026-05-21-navigation-contract.md).

## Purpose

Walk every flow mapped to the **mentor / Family** audience, verify that mentor access is parent-native and correctly scoped, file every defect in Notion, and update the docs when mapped access or flow descriptions have drifted.

This plan treats "mentor" as an adult family-support role. It does not mean the AI tutor/mentor voice. Adults can be both mentors and students, so mentor testing must also verify that Family access does not replace the adult's own Study access.

## Operating Instructions

### 0. Pre-Flight

1. Test on the latest `staging` build or the branch explicitly named when the batch starts. Do not switch branches mid-batch.
2. Record build SHA, API target, device, and date in the first row tested.
3. Use an adult owner account with family links for normal Mentor/Family rows. Use an adult owner without family links for setup rows.
4. Start in Chrome or the mobile web preview and do not wait for the emulator before beginning the sweep. Emulator/native runs are follow-up lanes for native-only behavior such as camera, OS permissions, store purchases, push handling, or hardware-specific regressions.
5. Read the row in `mentor-flow-access-inventory.md`, then read the matching row in `mobile-app-flow-inventory.md`.
6. For student-only rows in this plan, expected mentor behavior is: not directly surfaced from Mentor mode; if a bridge exists, it switches the adult into Study as themselves.

### 1. Per-Flow Procedure

For each row:

1. Set the row status to `IN_PROGRESS`.
2. Walk every documented mentor entry point and branch.
3. Check access scope:
   - Does the mentor only see linked/visible children?
   - Does Family Progress exclude the adult's own Study progress?
   - Does normal review avoid parent proxy/view-as-child mode?
   - Do Study bridges write as the adult, not as the child?
4. Compare observed behavior against both inventories:
   - `Defect`: flow is broken, confusing, dead-ended, unsafe, or available to the wrong audience.
   - `Drift`: flow works, but the docs no longer match the app.
   - `Discovery`: adjacent mentor flow exists but is missing from the access inventory.
5. File a Notion bug for every defect before moving on.
6. Update `mentor-flow-access-inventory.md` for access drift. Update `mobile-app-flow-inventory.md` only when the canonical flow description itself is wrong.
7. Update this row with final status, result, bug links, doc update date, and a one-line note.
8. Move to the next independent flow.

### 2. Blocking Bug Rule

Most bugs are filed and the tester moves on. The exception is a blocking bug.

A blocking bug is any P0/P1 issue that prevents judging this flow and likely blocks downstream flows, such as app launch failure, sign-in failure, profile load failure, family-link access failure, child data leak, broken tab shell, broken child route stack, Recaps dead tab, or parent proxy accidentally replacing normal mentor review.

When this happens:

1. File the Notion bug first with priority `P0` or `P1`.
2. Mark the current row `BLOCKED_BY_BUG` and paste the bug URL.
3. Pause dependent rows. Continue only with clearly independent flows.
4. Fix the blocker right away if it is safely scoped and reproducible.
5. Verify the fix locally before resuming the blocked row. Security, billing, auth, consent, and child data-scope fixes require a negative-path test.
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
| Found In | `mentor-flow-revision-2026-05-22 / Batch N / FLOW-ID` |
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
| `FAIL` | `Fail` | Broken or off-spec for the mentor audience. |
| `BLOCKED` | `Blocked` | Could not judge because state, service, harness, or native capability is missing. |
| `BLOCKED_BY_BUG` | `Fail` or `Blocked` | A filed blocker must be fixed before dependent flows can be judged. |
| `REMOVED` | `Removed` | Flow no longer exists intentionally; docs must be updated. |

### 5. Test Account Slots

| Slot | Persona | Needed for |
| --- | --- | --- |
| M-A | Adult owner, no family links | Family setup and continue-studying path |
| M-B | Adult owner, one linked/visible child | Core mentor home, child detail, progress |
| M-C | Adult owner, two or more linked/visible children | Multi-child dashboard, filters, family progress |
| M-D | Child with consent pending | Protected/empty child states |
| M-E | Child with consent withdrawn | Protected/withdrawn states |
| M-F | Linked child account with completed sessions | Recaps, reports, session recap |
| M-G | Parent-managed child profile with completed sessions | Parent-native review without child login |
| M-H | Family plan owner | Family billing and family pool |
| M-I | Adult owner also studying as self | Study bridge and adult self-progress exclusion |

### 6. Browser-First Execution

These flows must be walkable in Chrome or the mobile web preview unless the row is explicitly native-only. Do not mark a row blocked merely because the emulator is unavailable. Instead:

1. Test the reachable browser/preview path first.
2. Record any native-only branch as partial coverage in the row notes.
3. File bugs found in browser/preview immediately.
4. Reserve emulator follow-up for camera capture, OS permission redirects, native share sheets, push notifications, app-store billing, and other behavior that cannot exist in Chrome.

## Batch 1 - Auth, Account, And Mentor Setup

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | Shared launch/auth gate; mentor routes require family access. | TODO | | | | |
| AUTH-02 | Email sign-up works before audience is known. | TODO | | | | |
| AUTH-03 | Sign-up verification works before audience is known. | TODO | | | | |
| AUTH-04 | Email sign-in preserves reachable mentor route only when authorized. | TODO | | | | |
| AUTH-05 | Additional sign-in verification preserves authorized mentor route. | TODO | | | | |
| AUTH-06 | Forgot/reset password remains audience-neutral. | TODO | | | | |
| AUTH-07 | Sign-in/sign-up/forgot navigation remains audience-neutral. | TODO | | | | |
| AUTH-08 | OAuth buttons/callback entry remain shared. | TODO | | | | |
| AUTH-09 | SSO callback fallback returns safely to sign-in. | TODO | | | | |
| AUTH-10 | Sign-out is available only from permitted surfaces. | TODO | | | | |
| AUTH-11 | Session-expired sign-out returns to sign-in with banner. | TODO | | | | |
| AUTH-12 | First-time vs returning copy remains correct. | TODO | | | | |
| AUTH-13 | Deep-link redirect restores authorized mentor routes only. | TODO | | | | |
| AUTH-14 | Sign-in transition/stuck recovery works. | TODO | | | | |
| ACCOUNT-01 | First profile can capture Study/Family intent but remains Study-safe without child links. | TODO | | | | |
| ACCOUNT-02 | Additional profile creation supports adult/child profiles where allowed. | TODO | | | | |
| ACCOUNT-03 | Add-child from More/Profiles works as optional mentor setup. | TODO | | | | |
| ACCOUNT-04 | Profile switching does not enter proxy for normal child review. | TODO | | | | |
| ACCOUNT-05 | Family-plan/max-profile gates protect add-child setup. | TODO | | | | |
| ACCOUNT-06 | More exposes mentor rows only when allowed. | TODO | | | | |
| ACCOUNT-07 | Mentor-relevant notification settings work. | TODO | | | | |
| ACCOUNT-08 | Child accommodation/celebration editors are mentor-gated. | TODO | | | | |
| ACCOUNT-09 | Change password is owner-only. | TODO | | | | |
| ACCOUNT-10 | Export is owner-only. | TODO | | | | |
| ACCOUNT-11 | Delete account is owner-only. | TODO | | | | |
| ACCOUNT-12 | Scheduled deletion recovery works for owner profile. | TODO | | | | |
| ACCOUNT-13 | Privacy policy is reachable where surfaced. | TODO | | | | |
| ACCOUNT-14 | Terms are reachable where surfaced. | TODO | | | | |
| ACCOUNT-15 | Self mentor memory remains adult self surface, not child editor. | TODO | | | | |
| ACCOUNT-16 | Child mentor memory works through child route and consent checks. | TODO | | | | |
| ACCOUNT-17 | Child memory consent prompts appear where needed. | TODO | | | | |
| ACCOUNT-18 | Child subject analogy preference is scoped to child route/curriculum. | TODO | | | | |
| ACCOUNT-19 | Underage consent request affects child visibility correctly. | TODO | | | | |
| ACCOUNT-20 | Child handoff to parent consent works. | TODO | | | | |
| ACCOUNT-21 | Parent email entry/resend/change email works for consent. | TODO | | | | |
| ACCOUNT-22 | Consent pending protects child learning data. | TODO | | | | |
| ACCOUNT-23 | Consent withdrawn protects child learning data. | TODO | | | | |
| ACCOUNT-24 | Post-approval landing restores child visibility. | TODO | | | | |
| ACCOUNT-25 | Parent consent management works from child detail. | TODO | | | | |
| ACCOUNT-26 | Regional consent variants protect mentor visibility. | TODO | | | | |
| ACCOUNT-27 | Parent deny confirmation works. | TODO | | | | |
| ACCOUNT-28 | App language picker works from permitted account surface. | TODO | | | | |
| ACCOUNT-29 | Mentor-language/account-language entry does not create separate mentor identity. | TODO | | | | |
| ACCOUNT-30 | Proxy-only More restrictions do not appear in normal mentor review. | TODO | | | | |

## Batch 2 - Mentor Home, Navigation, Setup, And Child Curriculum

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home is reachable only by Study bridge, not as Mentor home. | TODO | | | | |
| HOME-02 | Family/Children home summarizes children and routes to mentor surfaces. | TODO | | | | |
| HOME-03 | Mentor tab target is home/recaps/progress/more when implemented. | TODO | | | | |
| HOME-04 | Splash and initial shell remain shared. | TODO | | | | |
| HOME-05 | Empty first-user state remains Study, not Mentor home. | TODO | | | | |
| HOME-06 | Resume-session state remains Study, not Mentor home. | TODO | | | | |
| HOME-07 | Family setup offers add/link child plus continue-studying path. | TODO | | | | |
| HOME-08 | Mentor home timeout recovers to Mentor-safe root. | TODO | | | | |
| SUBJECT-01 | Create child subject only from child curriculum path. | TODO | | | | |
| SUBJECT-02 | Create child subject from child curriculum empty state, not adult Library. | TODO | | | | |
| SUBJECT-03 | Chat classifier fallback is not a normal Mentor route. | TODO | | | | |
| SUBJECT-04 | Homework subject creation is not a normal Mentor route. | TODO | | | | |
| SUBJECT-05 | Child subject resolution is scoped to child when launched from child route. | TODO | | | | |
| SUBJECT-06 | Child broad subject/book flow is scoped to child when supported. | TODO | | | | |
| SUBJECT-07 | Child focused subject/book flow is scoped to child when supported. | TODO | | | | |
| SUBJECT-08 | Child language subject setup is scoped to child. | TODO | | | | |
| SUBJECT-12 | Child curriculum view is reachable from child surfaces. | TODO | | | | |
| SUBJECT-14 | Assessment cannot silently run as adult when intended for child. | TODO | | | | |
| SUBJECT-16 | Child/profile conversation-language setup is scoped correctly. | TODO | | | | |
| SUBJECT-17 | Child/profile pronouns setup is scoped and age-gated correctly. | TODO | | | | |

## Batch 3 - Child Review, Recaps, Reports, And Mentor Progress

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PARENT-01 | Family home/dashboard works for linked children. | TODO | | | | |
| PARENT-02 | Multi-child dashboard works. | TODO | | | | |
| PARENT-03 | Child detail is parent-native and scoped. | TODO | | | | |
| PARENT-04 | Child subject/topic drill-down is parent-native and scoped. | TODO | | | | |
| PARENT-05 | Child session/transcript review is parent-native, not proxy-dependent. | TODO | | | | |
| PARENT-06 | Child reports list/detail works. | TODO | | | | |
| PARENT-07 | Child curriculum replaces top-level adult Library in Mentor mode. | TODO | | | | |
| PARENT-08 | Subject raw-input audit is scoped to child. | TODO | | | | |
| PARENT-09 | Guided label tooltip works in mentor surfaces. | TODO | | | | |
| PARENT-10 | Child Understanding/Retention cards render correctly. | TODO | | | | |
| PARENT-11 | Child session recap content works and can feed Recaps target. | TODO | | | | |
| PARENT-12 | Child subject retention badges are data-gated. | TODO | | | | |
| PARENT-13 | Child weekly report detail works and marks viewed. | TODO | | | | |
| LEARN-07 | Student session summary is source material only; mentor reads through parent-native route. | TODO | | | | |
| LEARN-17 | Family Progress excludes adult self progress. | TODO | | | | |
| LEARN-18 | Child subject progress detail is scoped to child. | TODO | | | | |
| LEARN-19 | Child/family streak display does not imply adult self progress. | TODO | | | | |
| LEARN-20 | Child/family milestones are scoped correctly where surfaced. | TODO | | | | |
| LEARN-21 | Child/family vocabulary browser is scoped correctly where surfaced. | TODO | | | | |
| LEARN-23 | Mentor transcript/recap access uses parent-native route and family checks. | TODO | | | | |
| LEARN-24 | Saved bookmarks are not exposed as a normal mentor surface. | TODO | | | | |

## Batch 4 - Learning, Practice, Homework, Quiz, And Dictation Boundaries

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-01 | Freeform chat is not directly surfaced from Mentor mode. | TODO | | | | |
| LEARN-02 | Guided session is not directly surfaced from Mentor mode. | TODO | | | | |
| LEARN-03 | First session is not directly surfaced from Mentor mode. | TODO | | | | |
| LEARN-04 | Core learning loop is not directly surfaced from Mentor mode. | TODO | | | | |
| LEARN-05 | Coach bubble variants remain student-session behavior. | TODO | | | | |
| LEARN-06 | Voice controls remain student-session behavior. | TODO | | | | |
| LEARN-08 | Library behavior is adult Study or child curriculum, not top-level Mentor Library. | TODO | | | | |
| LEARN-09 | Shelf/book selection is scoped to child curriculum or adult Study. | TODO | | | | |
| LEARN-10 | Book detail starts learning only in correct student context. | TODO | | | | |
| LEARN-11 | Manage subject status is scoped to child curriculum or adult Study. | TODO | | | | |
| LEARN-12 | Topic detail is scoped to child curriculum or adult Study. | TODO | | | | |
| LEARN-13 | Recall check is not directly surfaced from Mentor mode. | TODO | | | | |
| LEARN-14 | Failed recall remediation is not directly surfaced from Mentor mode. | TODO | | | | |
| LEARN-15 | Relearn flow is not directly surfaced from Mentor mode except explicit Study bridge. | TODO | | | | |
| LEARN-16 | Retention review is not directly surfaced from Mentor mode except scoped child review. | TODO | | | | |
| LEARN-22 | Vocabulary list is child curriculum/adult Study, not top-level Mentor activity. | TODO | | | | |
| LEARN-25 | Library search is child curriculum/adult Study, not top-level Mentor activity. | TODO | | | | |
| LEARN-26 | First-curriculum session starts only in correct student context. | TODO | | | | |
| PRACTICE-01 | Practice hub is not directly surfaced from Mentor mode. | TODO | | | | |
| PRACTICE-02 | Review shortcut is not directly surfaced from Mentor mode. | TODO | | | | |
| PRACTICE-03 | Recitation session is not directly surfaced from Mentor mode. | TODO | | | | |
| PRACTICE-04 | All-caught-up state is not directly surfaced from Mentor mode. | TODO | | | | |
| QUIZ-01 | Quiz picker is not directly surfaced from Mentor mode. | TODO | | | | |
| QUIZ-02 | Quiz launch is not directly surfaced from Mentor mode. | TODO | | | | |
| QUIZ-03 | Quiz play is not directly surfaced from Mentor mode. | TODO | | | | |
| QUIZ-04 | Guess Who play is not directly surfaced from Mentor mode. | TODO | | | | |
| QUIZ-05 | Quiz quit path is not directly surfaced from Mentor mode. | TODO | | | | |
| QUIZ-06 | Quiz retry/exit path is not directly surfaced from Mentor mode. | TODO | | | | |
| QUIZ-07 | Quiz results are not directly surfaced from Mentor mode. | TODO | | | | |
| QUIZ-08 | Quiz errors are not directly surfaced from Mentor mode. | TODO | | | | |
| QUIZ-09 | Quiz history is visible only through parent-native review if designed. | TODO | | | | |
| QUIZ-10 | Quiz detail is visible only through parent-native review if designed. | TODO | | | | |
| QUIZ-11 | Malformed-round guard remains student activity behavior. | TODO | | | | |
| QUIZ-12 | Wrong-answer dispute remains student activity behavior. | TODO | | | | |
| QUIZ-13 | Answer-check warning remains student activity behavior. | TODO | | | | |
| DICT-01 | Dictation choice is not directly surfaced from Mentor mode. | TODO | | | | |
| DICT-02 | Dictation OCR preview is not directly surfaced from Mentor mode. | TODO | | | | |
| DICT-03 | Generated dictation is not directly surfaced from Mentor mode. | TODO | | | | |
| DICT-04 | Dictation playback is not directly surfaced from Mentor mode. | TODO | | | | |
| DICT-05 | Dictation exit confirm is not directly surfaced from Mentor mode. | TODO | | | | |
| DICT-06 | Dictation completion is not directly surfaced from Mentor mode. | TODO | | | | |
| DICT-07 | Dictation photo review is not directly surfaced from Mentor mode. | TODO | | | | |
| DICT-08 | Dictation remediation is not directly surfaced from Mentor mode. | TODO | | | | |
| DICT-09 | Dictation perfect-score celebration is not directly surfaced from Mentor mode. | TODO | | | | |
| DICT-10 | Dictation result recording is not directly surfaced from Mentor mode. | TODO | | | | |
| HOMEWORK-01 | Homework start is not direct child impersonation from Mentor mode. | TODO | | | | |
| HOMEWORK-02 | Homework camera/OCR is not direct child impersonation from Mentor mode. | TODO | | | | |
| HOMEWORK-03 | Homework manual fallback is not direct child impersonation from Mentor mode. | TODO | | | | |
| HOMEWORK-04 | Homework tutoring is not direct child impersonation from Mentor mode. | TODO | | | | |
| HOMEWORK-05 | Homework gallery import is not direct child impersonation from Mentor mode. | TODO | | | | |
| HOMEWORK-06 | Homework vision pass-through is not direct child impersonation from Mentor mode. | TODO | | | | |
| HOMEWORK-07 | Homework permission flow is not direct child impersonation from Mentor mode. | TODO | | | | |

## Batch 5 - Recaps Target

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| RECAP-TARGET-01 | Recaps list item/detail reuses child session recap fields from PARENT-11. | TODO | | | | |
| RECAP-TARGET-02 | Recap detail is parent-native and backs to `/(app)/recaps`. | TODO | | | | |
| RECAP-TARGET-03 | Reports/weekly reports can coexist with or link to Recaps safely. | TODO | | | | |
| RECAP-TARGET-04 | Recaps read student session source data without mutating it. | TODO | | | | |
| RECAP-TARGET-05 | Recaps tab is not surfaced as a dead tab before route/API exists. | TODO | | | | |

## Batch 6 - Mentor Billing

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Owner can open subscription details. | TODO | | | | |
| BILLING-02 | Owner upgrade flow starts safely. | TODO | | | | |
| BILLING-03 | Trial/usage/family-pool states render correctly. | TODO | | | | |
| BILLING-04 | Restore purchases works for owner. | TODO | | | | |
| BILLING-05 | Manage billing deep-link is safe. | TODO | | | | |
| BILLING-06 | Child notify-parent path creates mentor-facing response. | TODO | | | | |
| BILLING-07 | Adult owner quota paywall does not affect child review scope. | TODO | | | | |
| BILLING-08 | Family pool details are visible to eligible family owner. | TODO | | | | |
| BILLING-09 | Top-up section works for eligible owner. | TODO | | | | |
| BILLING-10 | BYOK waitlist state is correct if visible. | TODO | | | | |
| BILLING-11 | Trial banner/status renders for trial owner. | TODO | | | | |
| BILLING-12 | Static comparison cards render safely. | TODO | | | | |

## Batch 7 - Mentor Cross-Cutting Pass

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CC-04 | Mentor child/detail/recap back fallbacks are safe. | TODO | | | | |
| CC-07 | Child accommodation controls are mentor-gated. | TODO | | | | |
| CC-08 | Parent-facing metric vocabulary appears on mentor surfaces. | TODO | | | | |
| CC-09 | Web backgrounds do not bleed between Family/child stacks. | TODO | | | | |
| CC-11 | Mentor copy uses i18n keys. | TODO | | | | |
| CC-12 | FeedbackProvider works on mentor gates/More. | TODO | | | | |
| CC-17 | Profile-as-lens child routes do not leak or guess child scope. | TODO | | | | |
| CC-18 | Stable list refs hold on child lists, reports, Recaps, and family progress. | TODO | | | | |

## Batch 8 - Study Bridge And Negative Student Surfaces

| ID | Access expectation | Status | Result | Notion bugs | Docs updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| BRIDGE-01 | Adult can switch from Mentor to Study and retain own Study access. | TODO | | | | |
| BRIDGE-02 | "Learn this too" writes as adult, not as child. | TODO | | | | |
| BRIDGE-03 | Adult quota/paywall appears before Study bridge if needed. | TODO | | | | |
| BRIDGE-04 | Back navigation after bridge does not return to stale child/proxy route. | TODO | | | | |
| BRIDGE-05 | Normal mentor review never enters parent proxy. | TODO | | | | |

## Discovered Mentor Flows

| Temp ID | Flow | Found in batch | Routes / entry points | Inventory updated | Notes |
| --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | |

## Master Roll-Up

| Batch | Section | Items | Status | Notes |
| --- | ---: | ---: | --- | --- |
| 1 | Auth, Account, And Mentor Setup | 44 | TODO | |
| 2 | Mentor Home, Navigation, Setup, And Child Curriculum | 20 | TODO | |
| 3 | Child Review, Recaps, Reports, And Mentor Progress | 21 | TODO | |
| 4 | Learning, Practice, Homework, Quiz, And Dictation Boundaries | 52 | TODO | |
| 5 | Recaps Target | 5 | TODO | |
| 6 | Mentor Billing | 12 | TODO | |
| 7 | Mentor Cross-Cutting Pass | 8 | TODO | |
| 8 | Study Bridge And Negative Student Surfaces | 5 | TODO | |
| **Total** | | **167** | TODO | |
