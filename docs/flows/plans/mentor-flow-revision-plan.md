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

1. Set `Tested` to 🔄.
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
7. Update this row: final `Tested` symbol, `Result` word, `Bugs` URL(s), `Doc Updated` tick + date, and a one-line note.
8. Move to the next independent flow.

### 2. Blocking Bug Rule

Most bugs are filed and the tester moves on. The exception is a blocking bug.

A blocking bug is any P0/P1 issue (see severity guide in §3) that prevents judging this flow and likely blocks downstream flows, such as app launch failure, sign-in failure, profile load failure, family-link access failure, child data leak, broken tab shell, broken child route stack, Recaps dead tab, or parent proxy accidentally replacing normal mentor review.

When this happens:

1. File the Notion bug first with priority `P0` or `P1`.
2. Set the current row `Tested` to 🚫 and `Result` to `Blocked`. Paste the bug URL into `Bugs`.
3. Pause dependent rows. Continue only with clearly independent flows.
4. Fix the blocker right away if it is safely scoped and reproducible.
5. Verify the fix locally before resuming the blocked row. Security, billing, auth, consent, and child data-scope fixes require a negative-path test.
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
| Found In | `mentor-flow-revision-2026-05-22 / Batch N / FLOW-ID` |
| Reported | test date |

Bug body:

- **Repro steps** — numbered list, observable preconditions first.
- **Expected** — what the inventories say should happen.
- **Actual** — what you observed.
- **Screenshot or recording** — attach via the `Screenshots` property (REST file upload) or paste a hosted URL.
- **Build SHA, API target, device, and account slot** (e.g. `M-B`).

Severity guide:

| Priority | Use when |
| --- | --- |
| P0 | Crash, data loss, security/privacy leak, billing wrong, consent gate bypassed, child data leak, parent proxy accidentally replacing normal mentor review |
| P1 | Flow blocked or unusable for a primary mentor persona; back button dead-ends; key feature broken; family-link access broken; Recaps dead tab |
| P2 | Flow works but UX is degraded; copy wrong; layout broken on small screen |
| P3 | Cosmetic, polish, nice-to-have |

**One bug = one fix.** Do not bundle two unrelated defects into a single Notion page. If a row has multiple defects, file each separately and paste every URL into the row's `Bugs` column, comma-separated.

**Search before filing.** Query the Open tracker (REST `databases/{id}/query` with a title or `Found In` filter) to avoid duplicates. If the same bug already exists, link it instead of duplicating it. Never reopen a Done bug — file a new regression and relate it. See `feedback_notion_resolution_recording.md`.

**Done → Resolved move.** When a bug moves to Done, the same agent that closed it moves the row from `Issue Tracker - Open` (`3598bce9-1f7c-8070-86eb-e012bd99f184`) to `Issue Tracker - Resolved` (`b8ce802f-1126-4a2f-a123-be5f888cbb23`). See `/fix-notion-bugs` for the move recipe.

### 4. Test Account Slots

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
| ❌ | Tested and failing (broken or off-spec for the mentor audience). |
| 🚫 | Blocked — could not judge because of a filed blocker, missing state, missing harness, or native-only dependency. |
| ➖ | Not applicable / removed — flow intentionally no longer exists; docs must be updated. |

### 7. Result Values

| Result | When to use |
| --- | --- |
| blank | Row not yet tested (`Tested` = ⬜ or 🔄). |
| `Pass` | Works as described. `Tested` = ✅. |
| `Pass w/ issues` | Usable, but one or more non-blocking bugs were filed. `Tested` = ⚠️. |
| `Fail` | Broken or off-spec for the mentor audience. `Tested` = ❌. |
| `Blocked` | Could not judge because state, service, harness, native capability, or a filed blocker bug prevents the test. `Tested` = 🚫. |
| `Removed` | Flow no longer exists intentionally; docs must be updated. `Tested` = ➖. |

## Table Column Reference

Every batch table below uses the same columns:

| Column | Purpose |
| --- | --- |
| ID | Inventory ID (e.g., `AUTH-05`, `ACCOUNT-19`). |
| Flow | Short flow description matching `mobile-app-flow-inventory.md`. |
| Access expectation | Mentor-audience access expectation from `mentor-flow-access-inventory.md`. |
| Tested | Status symbol (⬜ / 🔄 / ✅ / ⚠️ / ❌ / 🚫 / ➖) per Section 6. |
| Result | One of: blank / `Pass` / `Pass w/ issues` / `Fail` / `Blocked` / `Removed` per Section 7. |
| Bugs | Notion URL(s), comma-separated. |
| Doc Updated | Tick + date when the inventory was edited (e.g., ✅ 05-14). |
| Notes | Free-text one-liner with evidence/observation. |

## Batch 1 - Auth, Account, And Mentor Setup

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | App launch and auth gate | Shared launch/auth gate; mentor routes require family access. | ⬜ | | | | |
| AUTH-02 | Sign up with email and password | Email sign-up works before audience is known. | ⬜ | | | | |
| AUTH-03 | Sign-up email verification code | Sign-up verification works before audience is known. | ⬜ | | | | |
| AUTH-04 | Sign in with email and password | Email sign-in preserves reachable mentor route only when authorized. | ⬜ | | | | |
| AUTH-05 | Additional sign-in verification | Additional sign-in verification preserves authorized mentor route. | ⬜ | | | | |
| AUTH-06 | Forgot password and reset password | Forgot/reset password remains audience-neutral. | ⬜ | | | | |
| AUTH-07 | Auth screen navigation | Sign-in/sign-up/forgot navigation remains audience-neutral. | ⬜ | | | | |
| AUTH-08 | OAuth sign in / sign up | OAuth buttons/callback entry remain shared. | ⬜ | | | | |
| AUTH-09 | SSO callback completion and fallback | SSO callback fallback returns safely to sign-in. | ⬜ | | | | |
| AUTH-10 | Sign out | Sign-out is available only from permitted surfaces. | ⬜ | | | | |
| AUTH-11 | Session-expired forced sign-out and banner | Session-expired sign-out returns to sign-in with banner. | ⬜ | | | | |
| AUTH-12 | First-time vs returning sign-in copy | First-time vs returning copy remains correct. | ⬜ | | | | |
| AUTH-13 | Deep-link auth redirect preservation | Deep-link redirect restores authorized mentor routes only. | ⬜ | | | | |
| AUTH-14 | Sign-in transition spinner / stuck-state recovery | Sign-in transition/stuck recovery works. | ⬜ | | | | |
| ACCOUNT-01 | Create first profile | First profile can capture Study/Family intent but remains Study-safe without child links. | ⬜ | | | | |
| ACCOUNT-02 | Create additional profile | Additional profile creation supports adult/child profiles where allowed. | ⬜ | | | | |
| ACCOUNT-03 | Add child profile from More or Profiles | Add-child from More/Profiles works as optional mentor setup. | ⬜ | | | | |
| ACCOUNT-04 | Profile switching | Profile switching does not enter proxy for normal child review. | ⬜ | | | | |
| ACCOUNT-05 | Family-plan / max-profile gating | Family-plan/max-profile gates protect add-child setup. | ⬜ | | | | |
| ACCOUNT-06 | More hub navigation | More exposes mentor rows only when allowed. | ⬜ | | | | |
| ACCOUNT-07 | Notifications sub-screen | Mentor-relevant notification settings work. | ⬜ | | | | |
| ACCOUNT-08 | Learning preferences / accommodation | Child accommodation/celebration editors are mentor-gated. | ⬜ | | | | |
| ACCOUNT-09 | Change password | Change password is owner-only. | ⬜ | | | | |
| ACCOUNT-10 | Export my data | Export is owner-only. | ⬜ | | | | |
| ACCOUNT-11 | Delete account | Delete account is owner-only. | ⬜ | | | | |
| ACCOUNT-12 | Scheduled deletion / Keep account | Scheduled deletion recovery works for owner profile. | ⬜ | | | | |
| ACCOUNT-13 | Privacy policy | Privacy policy is reachable where surfaced. | ⬜ | | | | |
| ACCOUNT-14 | Terms of service | Terms are reachable where surfaced. | ⬜ | | | | |
| ACCOUNT-15 | Self mentor memory | Self mentor memory remains adult self surface, not child editor. | ⬜ | | | | |
| ACCOUNT-16 | Child mentor memory | Child mentor memory works through child route and consent checks. | ⬜ | | | | |
| ACCOUNT-17 | Child memory consent prompt | Child memory consent prompts appear where needed. | ⬜ | | | | |
| ACCOUNT-18 | Subject analogy preference | Child subject analogy preference is scoped to child route/curriculum. | ⬜ | | | | |
| ACCOUNT-19 | Consent request during underage profile creation | Underage consent request affects child visibility correctly. | ⬜ | | | | |
| ACCOUNT-20 | Child handoff to parent consent | Child handoff to parent consent works. | ⬜ | | | | |
| ACCOUNT-21 | Parent email entry / send / resend / change | Parent email entry/resend/change email works for consent. | ⬜ | | | | |
| ACCOUNT-22 | Consent pending gate | Consent pending protects child learning data. | ⬜ | | | | |
| ACCOUNT-23 | Consent withdrawn gate | Consent withdrawn protects child learning data. | ⬜ | | | | |
| ACCOUNT-24 | Post-approval landing | Post-approval landing restores child visibility. | ⬜ | | | | |
| ACCOUNT-25 | Parent consent management | Parent consent management works from child detail. | ⬜ | | | | |
| ACCOUNT-26 | Regional consent variants | Regional consent variants protect mentor visibility. | ⬜ | | | | |
| ACCOUNT-27 | Parent consent deny confirmation | Parent deny confirmation works. | ⬜ | | | | |
| ACCOUNT-28 | App language picker | App language picker works from permitted account surface. | ⬜ | | | | |
| ACCOUNT-29 | Mentor language row | Mentor-language/account-language entry does not create separate mentor identity. | ⬜ | | | | |
| ACCOUNT-30 | More restrictions in impersonated-child mode | Proxy-only More restrictions do not appear in normal mentor review. | ⬜ | | | | |

## Batch 2 - Mentor Home, Navigation, Setup, And Child Curriculum

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home | Learner home is reachable only by Study bridge, not as Mentor home. | ⬜ | | | | |
| HOME-02 | Parent gateway home | Family/Children home summarizes children and routes to mentor surfaces. | ⬜ | | | | |
| HOME-03 | Parent tabs and parent-mode navigation | Mentor tab target is home/recaps/progress/more when implemented. | ⬜ | | | | |
| HOME-04 | Animated splash and initial shell | Splash and initial shell remain shared. | ⬜ | | | | |
| HOME-05 | Empty first-user state | Empty first-user state remains Study, not Mentor home. | ⬜ | | | | |
| HOME-06 | Resume interrupted session | Resume-session state remains Study, not Mentor home. | ⬜ | | | | |
| HOME-07 | Add-first-child gate (family/pro plans) | Family setup offers add/link child plus continue-studying path. | ⬜ | | | | |
| HOME-08 | Home loading-timeout fallback | Mentor home timeout recovers to Mentor-safe root. | ⬜ | | | | |
| SUBJECT-01 | Create subject from learner home | Create child subject only from child curriculum path. | ⬜ | | | | |
| SUBJECT-02 | Create subject from library empty state | Create child subject from child curriculum empty state, not adult Library. | ⬜ | | | | |
| SUBJECT-03 | Create subject from chat classifier | Chat classifier fallback is not a normal Mentor route. | ⬜ | | | | |
| SUBJECT-04 | Create subject from homework | Homework subject creation is not a normal Mentor route. | ⬜ | | | | |
| SUBJECT-05 | Subject resolution and clarification | Child subject resolution is scoped to child when launched from child route. | ⬜ | | | | |
| SUBJECT-06 | Broad subject flow + book pick | Child broad subject/book flow is scoped to child when supported. | ⬜ | | | | |
| SUBJECT-07 | Focused subject / focused-book flow | Child focused subject/book flow is scoped to child when supported. | ⬜ | | | | |
| SUBJECT-08 | Per-subject native-language setup | Child language subject setup is scoped to child. | ⬜ | | | | |
| SUBJECT-12 | View curriculum without committing | Child curriculum view is reachable from child surfaces. | ⬜ | | | | |
| SUBJECT-14 | Placement / knowledge assessment | Assessment cannot silently run as adult when intended for child. | ⬜ | | | | |
| SUBJECT-16 | Conversation-language picker | Child/profile conversation-language setup is scoped correctly. | ⬜ | | | | |
| SUBJECT-17 | Pronouns picker | Child/profile pronouns setup is scoped and age-gated correctly. | ⬜ | | | | |

## Batch 3 - Child Review, Recaps, Reports, And Mentor Progress

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PARENT-01 | Parent dashboard | Family home/dashboard works for linked children. | ⬜ | | | | |
| PARENT-02 | Multi-child dashboard | Multi-child dashboard works. | ⬜ | | | | |
| PARENT-03 | Child detail drill-down | Child detail is parent-native and scoped. | ⬜ | | | | |
| PARENT-04 | Child subject → topic drill-down | Child subject/topic drill-down is parent-native and scoped. | ⬜ | | | | |
| PARENT-05 | Child session / transcript drill-down | Child session/transcript review is parent-native, not proxy-dependent. | ⬜ | | | | |
| PARENT-06 | Child reports list and detail | Child reports list/detail works. | ⬜ | | | | |
| PARENT-07 | Parent library view | Child curriculum replaces top-level adult Library in Mentor mode. | ⬜ | | | | |
| PARENT-08 | Subject raw-input audit | Subject raw-input audit is scoped to child. | ⬜ | | | | |
| PARENT-09 | Guided label tooltip | Guided label tooltip works in mentor surfaces. | ⬜ | | | | |
| PARENT-10 | Child topic Understanding / Retention cards | Child Understanding/Retention cards render correctly. | ⬜ | | | | |
| PARENT-11 | Child session recap (Recaps source) | Child session recap content works and can feed Recaps target. | ⬜ | | | | |
| PARENT-12 | Child-subject retention badges | Child subject retention badges are data-gated. | ⬜ | | | | |
| PARENT-13 | Child weekly report detail | Child weekly report detail works and marks viewed. | ⬜ | | | | |
| LEARN-07 | Session summary | Student session summary is source material only; mentor reads through parent-native route. | ⬜ | | | | |
| LEARN-17 | Progress overview tab | Family Progress excludes adult self progress. | ⬜ | | | | |
| LEARN-18 | Subject progress detail | Child subject progress detail is scoped to child. | ⬜ | | | | |
| LEARN-19 | Streak display | Child/family streak display does not imply adult self progress. | ⬜ | | | | |
| LEARN-20 | Milestones list | Child/family milestones are scoped correctly where surfaced. | ⬜ | | | | |
| LEARN-21 | Cross-subject vocabulary browser | Child/family vocabulary browser is scoped correctly where surfaced. | ⬜ | | | | |
| LEARN-23 | Read-only session transcript | Mentor transcript/recap access uses parent-native route and family checks. | ⬜ | | | | |
| LEARN-24 | Saved bookmarks | Saved bookmarks are not exposed as a normal mentor surface. | ⬜ | | | | |

## Batch 4 - Learning, Practice, Homework, Quiz, And Dictation Boundaries

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LEARN-01 | Freeform chat | Freeform chat is not directly surfaced from Mentor mode. | ⬜ | | | | |
| LEARN-02 | Guided learning session | Guided session is not directly surfaced from Mentor mode. | ⬜ | | | | |
| LEARN-03 | First session experience | First session is not directly surfaced from Mentor mode. | ⬜ | | | | |
| LEARN-04 | Core learning loop | Core learning loop is not directly surfaced from Mentor mode. | ⬜ | | | | |
| LEARN-05 | Coach bubble visual variants | Coach bubble variants remain student-session behavior. | ⬜ | | | | |
| LEARN-06 | Voice input and voice-speed controls | Voice controls remain student-session behavior. | ⬜ | | | | |
| LEARN-08 | Library v3 | Library behavior is adult Study or child curriculum, not top-level Mentor Library. | ⬜ | | | | |
| LEARN-09 | Subject shelf → book selection | Shelf/book selection is scoped to child curriculum or adult Study. | ⬜ | | | | |
| LEARN-10 | Book detail and start learning | Book detail starts learning only in correct student context. | ⬜ | | | | |
| LEARN-11 | Manage subject status | Manage subject status is scoped to child curriculum or adult Study. | ⬜ | | | | |
| LEARN-12 | Topic detail | Topic detail is scoped to child curriculum or adult Study. | ⬜ | | | | |
| LEARN-13 | Recall check | Recall check is not directly surfaced from Mentor mode. | ⬜ | | | | |
| LEARN-14 | Failed recall remediation | Failed recall remediation is not directly surfaced from Mentor mode. | ⬜ | | | | |
| LEARN-15 | Relearn flow | Relearn flow is not directly surfaced from Mentor mode except explicit Study bridge. | ⬜ | | | | |
| LEARN-16 | Retention review | Retention review is not directly surfaced from Mentor mode except scoped child review. | ⬜ | | | | |
| LEARN-22 | Per-subject vocabulary list | Vocabulary list is child curriculum/adult Study, not top-level Mentor activity. | ⬜ | | | | |
| LEARN-25 | Library inline search | Library search is child curriculum/adult Study, not top-level Mentor activity. | ⬜ | | | | |
| LEARN-26 | First-curriculum session entry | First-curriculum session starts only in correct student context. | ⬜ | | | | |
| PRACTICE-01 | Practice hub | Practice hub is not directly surfaced from Mentor mode. | ⬜ | | | | |
| PRACTICE-02 | Review topics shortcut | Review shortcut is not directly surfaced from Mentor mode. | ⬜ | | | | |
| PRACTICE-03 | Recitation session | Recitation session is not directly surfaced from Mentor mode. | ⬜ | | | | |
| PRACTICE-04 | "All caught up" empty state | All-caught-up state is not directly surfaced from Mentor mode. | ⬜ | | | | |
| QUIZ-01 | Quiz activity picker | Quiz picker is not directly surfaced from Mentor mode. | ⬜ | | | | |
| QUIZ-02 | Round generation loading screen | Quiz launch is not directly surfaced from Mentor mode. | ⬜ | | | | |
| QUIZ-03 | Round play — multiple choice | Quiz play is not directly surfaced from Mentor mode. | ⬜ | | | | |
| QUIZ-04 | Round play — Guess Who clue reveal | Guess Who play is not directly surfaced from Mentor mode. | ⬜ | | | | |
| QUIZ-05 | Mid-round quit | Quiz quit path is not directly surfaced from Mentor mode. | ⬜ | | | | |
| QUIZ-06 | Round complete error retry | Quiz retry/exit path is not directly surfaced from Mentor mode. | ⬜ | | | | |
| QUIZ-07 | Results screen | Quiz results are not directly surfaced from Mentor mode. | ⬜ | | | | |
| QUIZ-08 | Quiz quota / consent / forbidden errors | Quiz errors are not directly surfaced from Mentor mode. | ⬜ | | | | |
| QUIZ-09 | Quiz history | Quiz history is visible only through parent-native review if designed. | ⬜ | | | | |
| QUIZ-10 | Quiz round detail | Quiz detail is visible only through parent-native review if designed. | ⬜ | | | | |
| QUIZ-11 | Malformed-round guard | Malformed-round guard remains student activity behavior. | ⬜ | | | | |
| QUIZ-12 | Wrong-answer dispute | Wrong-answer dispute remains student activity behavior. | ⬜ | | | | |
| QUIZ-13 | Answer-check failure non-blocking warning | Answer-check warning remains student activity behavior. | ⬜ | | | | |
| DICT-01 | Dictation choice screen | Dictation choice is not directly surfaced from Mentor mode. | ⬜ | | | | |
| DICT-02 | OCR text preview + edit | Dictation OCR preview is not directly surfaced from Mentor mode. | ⬜ | | | | |
| DICT-03 | "Surprise me" LLM-generated dictation | Generated dictation is not directly surfaced from Mentor mode. | ⬜ | | | | |
| DICT-04 | Playback screen | Dictation playback is not directly surfaced from Mentor mode. | ⬜ | | | | |
| DICT-05 | Mid-dictation exit confirm | Dictation exit confirm is not directly surfaced from Mentor mode. | ⬜ | | | | |
| DICT-06 | Completion screen | Dictation completion is not directly surfaced from Mentor mode. | ⬜ | | | | |
| DICT-07 | Photo review of handwritten dictation | Dictation photo review is not directly surfaced from Mentor mode. | ⬜ | | | | |
| DICT-08 | Sentence-level remediation | Dictation remediation is not directly surfaced from Mentor mode. | ⬜ | | | | |
| DICT-09 | Perfect-score celebration | Dictation perfect-score celebration is not directly surfaced from Mentor mode. | ⬜ | | | | |
| DICT-10 | Recording dictation result | Dictation result recording is not directly surfaced from Mentor mode. | ⬜ | | | | |
| HOMEWORK-01 | Start homework from learner home | Homework start is not direct child impersonation from Mentor mode. | ⬜ | | | | |
| HOMEWORK-02 | Camera permission, capture, preview, OCR | Homework camera/OCR is not direct child impersonation from Mentor mode. | ⬜ | | | | |
| HOMEWORK-03 | Manual fallback | Homework manual fallback is not direct child impersonation from Mentor mode. | ⬜ | | | | |
| HOMEWORK-04 | Homework tutoring session | Homework tutoring is not direct child impersonation from Mentor mode. | ⬜ | | | | |
| HOMEWORK-05 | Gallery import | Homework gallery import is not direct child impersonation from Mentor mode. | ⬜ | | | | |
| HOMEWORK-06 | Image pass-through to vision LLM | Homework vision pass-through is not direct child impersonation from Mentor mode. | ⬜ | | | | |
| HOMEWORK-07 | Camera permission onboarding | Homework permission flow is not direct child impersonation from Mentor mode. | ⬜ | | | | |

## Batch 5 - Recaps Target

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RECAP-TARGET-01 | Recaps list + detail derived from session recap | Recaps list item/detail reuses child session recap fields from PARENT-11. | ⬜ | | | | |
| RECAP-TARGET-02 | Recap detail back-fallback to `/(app)/recaps` | Recap detail is parent-native and backs to `/(app)/recaps`. | ⬜ | | | | |
| RECAP-TARGET-03 | Reports / weekly reports coexistence | Reports/weekly reports can coexist with or link to Recaps safely. | ⬜ | | | | |
| RECAP-TARGET-04 | Read-only of student session source data | Recaps read student session source data without mutating it. | ⬜ | | | | |
| RECAP-TARGET-05 | Dead-tab gating before route/API ready | Recaps tab is not surfaced as a dead tab before route/API exists. | ⬜ | | | | |

## Batch 6 - Mentor Billing

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Subscription details screen | Owner can open subscription details. | ⬜ | | | | |
| BILLING-02 | Owner upgrade flow | Owner upgrade flow starts safely. | ⬜ | | | | |
| BILLING-03 | Trial / usage / family-pool states | Trial/usage/family-pool states render correctly. | ⬜ | | | | |
| BILLING-04 | Restore purchases | Restore purchases works for owner. | ⬜ | | | | |
| BILLING-05 | Manage billing deep-link | Manage billing deep-link is safe. | ⬜ | | | | |
| BILLING-06 | ChildPaywall + notify-parent | Child notify-parent path creates mentor-facing response. | ⬜ | | | | |
| BILLING-07 | Daily quota exceeded paywall | Adult owner quota paywall does not affect child review scope. | ⬜ | | | | |
| BILLING-08 | Family pool details | Family pool details are visible to eligible family owner. | ⬜ | | | | |
| BILLING-09 | Top-up question credits | Top-up section works for eligible owner. | ⬜ | | | | |
| BILLING-10 | BYOK waitlist | BYOK waitlist state is correct if visible. | ⬜ | | | | |
| BILLING-11 | Trial banner | Trial banner/status renders for trial owner. | ⬜ | | | | |
| BILLING-12 | Static plan comparison cards | Static comparison cards render safely. | ⬜ | | | | |

## Batch 7 - Mentor Cross-Cutting Pass

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC-04 | `goBackOrReplace` back navigation | Mentor child/detail/recap back fallbacks are safe. | ⬜ | | | | |
| CC-07 | Accommodation badge surfaces | Child accommodation controls are mentor-gated. | ⬜ | | | | |
| CC-08 | Parent-facing metric vocabulary | Parent-facing metric vocabulary appears on mentor surfaces. | ⬜ | | | | |
| CC-09 | Opaque web layout backgrounds | Web backgrounds do not bleed between Family/child stacks. | ⬜ | | | | |
| CC-11 | i18n `t()` cross-cutting strings | Mentor copy uses i18n keys. | ⬜ | | | | |
| CC-12 | FeedbackProvider + shake-to-feedback | FeedbackProvider works on mentor gates/More. | ⬜ | | | | |
| CC-17 | Profile-as-lens navigation pattern | Profile-as-lens child routes do not leak or guess child scope. | ⬜ | | | | |
| CC-18 | Stable FlatList refs | Stable list refs hold on child lists, reports, Recaps, and family progress. | ⬜ | | | | |

## Batch 8 - Study Bridge And Negative Student Surfaces

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BRIDGE-01 | Mentor → Study switch retains own Study access | Adult can switch from Mentor to Study and retain own Study access. | ⬜ | | | | |
| BRIDGE-02 | "Learn this too" writes as adult | "Learn this too" writes as adult, not as child. | ⬜ | | | | |
| BRIDGE-03 | Adult quota / paywall before Study bridge | Adult quota/paywall appears before Study bridge if needed. | ⬜ | | | | |
| BRIDGE-04 | Back-nav after bridge avoids stale child/proxy | Back navigation after bridge does not return to stale child/proxy route. | ⬜ | | | | |
| BRIDGE-05 | Normal mentor review never enters parent proxy | Normal mentor review never enters parent proxy. | ⬜ | | | | |

## Discovered Mentor Flows

| Temp ID | Flow | Found in batch | Routes / entry points | Inventory updated | Notes |
| --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | |

## Master Roll-Up

| Batch | Section | Items | Status | Notes |
| --- | ---: | ---: | --- | --- |
| 1 | Auth, Account, And Mentor Setup | 44 | ⬜ | |
| 2 | Mentor Home, Navigation, Setup, And Child Curriculum | 20 | ⬜ | |
| 3 | Child Review, Recaps, Reports, And Mentor Progress | 21 | ⬜ | |
| 4 | Learning, Practice, Homework, Quiz, And Dictation Boundaries | 52 | ⬜ | |
| 5 | Recaps Target | 5 | ⬜ | |
| 6 | Mentor Billing | 12 | ⬜ | |
| 7 | Mentor Cross-Cutting Pass | 8 | ⬜ | |
| 8 | Study Bridge And Negative Student Surfaces | 5 | ⬜ | |
| **Total** | | **167** | ⬜ | |
