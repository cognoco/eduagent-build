> **STATUS: DRAFT** - mentor audience flow revision plan. Created 2026-05-22.

# Mentor Flow Revision Plan

Source access inventory: [`mentor-flow-access-inventory.md`](../mentor-flow-access-inventory.md).
Canonical flow inventory: [`mobile-app-flow-inventory.md`](../mobile-app-flow-inventory.md).
Navigation target reference: [`2026-05-21-navigation-contract.md`](../../specs/2026-05-21-navigation-contract.md).

## Purpose

Walk every flow mapped to the **mentor / Family** audience, verify that mentor access is parent-native and correctly scoped, file every defect in Notion, and update the docs when mapped access or flow descriptions have drifted. Do not use tests. Use the app directly just like end user would. 

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
9. Use seed files for auth and sign in. 

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

### 5a. Chrome Walkthrough Log

| Date | Build / API / Account | Chrome path | Result |
| --- | --- | --- | --- |
| 2026-05-25 | `d8d1ca6d2` / `https://api-stg.mentomate.com` / M-C `parent-multi-child` seed | Local web preview at `http://localhost:8081`, in-app Chrome browser | Signed in, opened Family/Children home, child detail, Reports, and Recaps. Child subject drill-down at `/child/{profileId}/subjects/{subjectId}?subjectName=Mathematics&childName=Emma` made the Chrome automation/CDP session unresponsive and required a browser-process cleanup before continuing. |
| 2026-05-25 | `d8d1ca6d2` / same seed | Direct Playwright with `channel: "chrome"` | Attempted after the user asked whether Playwright was tried. First launch was blocked by sandbox `spawn EPERM`; after approval, Chrome launched but the pass hung and left Playwright-launched Chrome processes. These were cleaned up. Continue the sweep with the in-app Chrome pane unless direct Playwright is specifically needed for screenshots/video. |
| 2026-05-25 | `d8d1ca6d2` / staging API / attempted M-A `parent-solo` seed | Direct Chrome | Seed landed at `/dashboard` with post-approval child-style copy ("You're approved! ... Pick a subject") and no Family switch, so it is not reliable evidence for the adult-without-linked-children setup row. Use another adult seed for M-A checks. |
| 2026-05-25 | `d8d1ca6d2` / staging API / solo adult `onboarding-complete` seed | Direct Chrome | Stable adult Study home renders with learner actions/subjects and no Family switch or add-first-child setup CTA on Home. This proves Study remains available, but does not satisfy the Family setup-entry expectation by itself. |
| 2026-05-25 | `d8d1ca6d2` / staging API / M-C `parent-multi-child` seed | Direct Chrome / Playwright `channel: "chrome"` | Read-only settings sweep reached `/more/notifications`, `/more/account`, `/mentor-memory`, and `/more/privacy`. These routes rendered content, but `animated-splash` stayed visible on every route; normal and forced taps on `settings-app-language` hung/intercepted, so language-picker interaction could not be judged. |
| 2026-05-25 | `d8d1ca6d2` / staging API / M-C `parent-multi-child` seed | Direct Chrome / Playwright `channel: "chrome"` | Focused auth retry confirmed `/sign-in`, `/sign-up`, and `/forgot-password` render shared, audience-neutral copy after the bundle settles. Auth submission, OAuth, email verification, reset-code entry, and session-expired states were not exercised because they require external provider/email/session-state control. |
| 2026-05-25 | `d8d1ca6d2` / staging API / M-C `parent-multi-child` seed | Direct Chrome / Playwright `channel: "chrome"` | Direct `/create-profile` renders the child profile form. Direct `/more/help` renders Help & feedback, Help & Support, and Report a Problem after a longer wait; `/feedback`, `/support`, `/more/feedback`, and `/profiles/new` are unmatched routes and are not the app's current entry paths. Direct onboarding routes remain reachable inside the Family shell. |

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
| AUTH-01 | App launch and auth gate | Shared launch/auth gate; mentor routes require family access. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81698420fbbdb7f6b270 | ✅ 05-25 | Direct Chrome unauthenticated `/sign-in` renders shared auth gate; authorized direct mentor child links later failed to preserve route under AUTH-13. |
| AUTH-02 | Sign up with email and password | Email sign-up works before audience is known. | 🚫 | Blocked | | ✅ 05-25 | Sign-in page `Sign up` link opens create-account form with email/password, Google, Terms/Privacy copy, and Sign in link. Submission/email verification was not exercised to avoid email quota. |
| AUTH-03 | Sign-up email verification code | Sign-up verification works before audience is known. | 🚫 | Blocked | | ✅ 05-25 | Sign-up form is reachable in Chrome, but email verification code delivery/entry was not exercised because it requires an external email code flow. |
| AUTH-04 | Sign in with email and password | Email sign-in preserves reachable mentor route only when authorized. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81698420fbbdb7f6b270 | ✅ 05-25 | Direct Chrome email/password sign-in works for M-C and solo adult seeds and reaches `/home`; authorized mentor deep-link preservation fails under AUTH-13. |
| AUTH-05 | Additional sign-in verification | Additional sign-in verification preserves authorized mentor route. | 🚫 | Blocked | | ✅ 05-25 | Email/password sign-in works for the available seeds, but no seed/account in this Chrome pass required an additional verification factor. |
| AUTH-06 | Forgot password and reset password | Forgot/reset password remains audience-neutral. | 🚫 | Blocked | | ✅ 05-25 | Forgot-password link opens reset-code request screen with email input, Send reset code, and Back to sign in. Actual email/reset code was not exercised. |
| AUTH-07 | Auth screen navigation | Sign-in/sign-up/forgot navigation remains audience-neutral. | ✅ | Pass | | ✅ 05-25 | Direct Chrome confirms sign-in page links to Sign up and Forgot password screens, and those screens include return/sign-in paths. |
| AUTH-08 | OAuth sign in / sign up | OAuth buttons/callback entry remain shared. | 🚫 | Blocked | | ✅ 05-25 | Sign-in/sign-up surfaces show shared Google entry, but OAuth provider completion was not exercised from Chrome because it depends on external provider credentials/callback state. |
| AUTH-09 | SSO callback completion and fallback | SSO callback fallback returns safely to sign-in. | 🚫 | Blocked | | ✅ 05-25 | No valid or malformed SSO callback state was available in the Chrome walkthrough; only the OAuth entry buttons were observed. |
| AUTH-10 | Sign out | Sign-out is available only from permitted surfaces. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c8166b0abf009ef74face | ✅ 05-25 | Direct Chrome `/more` shows `Sign out`, but clicking `sign-out-button` hung after the click action and never returned to sign-in before the 45s timeout. |
| AUTH-11 | Session-expired forced sign-out and banner | Session-expired sign-out returns to sign-in with banner. | 🚫 | Blocked | | ✅ 05-25 | The Chrome walkthrough did not have a controlled expired-token/session-invalid seed; normal sign-out is separately blocked by AUTH-10. |
| AUTH-12 | First-time vs returning sign-in copy | First-time vs returning copy remains correct. | ✅ | Pass | | ✅ 05-25 | Direct Chrome auth retry renders `Welcome to MentoMate`, `New here? Try MentoMate`, sign-up `Create account`, and forgot-password reset-code copy after the bundle settles. |
| AUTH-13 | Deep-link auth redirect preservation | Deep-link redirect restores authorized mentor routes only. | ❌ | Fail | https://www.notion.so/36b8bce91f7c81698420fbbdb7f6b270 | ✅ 05-25 | Direct Chrome deep link to `/child/{profileId}?mode=progress` after sign-in redirected/rendered back to `/home`; the same child detail was reachable by clicking from Family home, so deep-link preservation is not matching the click path. |
| AUTH-14 | Sign-in transition spinner / stuck-state recovery | Sign-in transition/stuck recovery works. | ⚠️ | Pass w/ issues | | ✅ 05-25 | Normal email/password sign-in recovered to `/home` for the M-C seed after the web bundle settled; no artificial stuck transition was injected. |
| ACCOUNT-01 | Create first profile | First profile can capture Study/Family intent but remains Study-safe without child links. | 🚫 | Blocked | | ✅ 05-25 | Existing seeded accounts already had profiles; first-profile creation could not be exercised without a fresh verified account. |
| ACCOUNT-02 | Create additional profile | Additional profile creation supports adult/child profiles where allowed. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c816a9cc8c86c2f45c059 | ✅ 05-25 | Direct Chrome `/create-profile` renders the child profile form with name, birth date, cancel, and Create profile actions, but the normal More/Add child click path wedges at the subscription gate under ACCOUNT-03/05. |
| ACCOUNT-03 | Add child profile from More or Profiles | Add-child from More/Profiles works as optional mentor setup. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c816a9cc8c86c2f45c059 | ✅ 05-25 | In-app Chrome More exposes `Add a child`; clicking it navigated to `/subscription` and then made the browser automation/CDP session unresponsive, so the create-child form could not be judged. |
| ACCOUNT-04 | Profile switching | Profile switching does not enter proxy for normal child review. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81c097f8cc060f836810 | ✅ 05-25 | Direct Chrome `/profiles` shows Test Parent active plus Emma/Lucas/Sofia learner rows; clicking Emma's row stayed on `/profiles` instead of opening child settings, so the intended owner-to-child path could not be judged. |
| ACCOUNT-05 | Family-plan / max-profile gating | Family-plan/max-profile gates protect add-child setup. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c816a9cc8c86c2f45c059 | ✅ 05-25 | Add-child entry appears to route through `/subscription` for the M-C seed, but the route wedged Chrome automation before the paywall/gate copy could be verified. |
| ACCOUNT-06 | More hub navigation | More exposes mentor rows only when allowed. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c8124a1b8fd98fb9526bd | ✅ 05-25 | In-app Chrome opens `/more` with Preferences, Mentor memory/language, Profile, Notifications, Add a child, family usage sharing, Privacy & data, Help & feedback, and Sign out; still inherits Family shell tab drift from HOME-03. |
| ACCOUNT-07 | Notifications sub-screen | Mentor-relevant notification settings work. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81aca1add2d79913bf9d | ✅ 05-25 | Direct Chrome `/more/notifications` renders Push notifications, weekly progress digest, weekly/monthly progress email rows; the persistent animated splash overlay remains visible on top of the route. |
| ACCOUNT-08 | Learning preferences / accommodation | Child accommodation/celebration editors are mentor-gated. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81029269f1932b4a87f9 | ✅ 05-25 | Child detail exposes `Emma's learning preferences`; `/more/accommodation?childProfileId=...` renders child-scoped accommodation choices, but `/more/learning-preferences?childProfileId=...` says `Your learning preferences`. |
| ACCOUNT-09 | Change password | Change password is owner-only. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/more/account` shows `Change Password` only on the owner account surface alongside Test Parent's profile row. Form expansion was not exercised. |
| ACCOUNT-10 | Export my data | Export is owner-only. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81aca1add2d79913bf9d | ✅ 05-25 | Direct Chrome `/more/privacy` shows owner-only `Export my data`; tap/action was not exercised because the splash overlay remains present over the settings route. |
| ACCOUNT-11 | Delete account | Delete account is owner-only. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81aca1add2d79913bf9d | ✅ 05-25 | Direct Chrome `/more/privacy` shows owner-only `Delete account`; destructive action was not opened, and the route inherits the persistent splash overlay issue. |
| ACCOUNT-12 | Scheduled deletion / Keep account | Scheduled deletion recovery works for owner profile. | 🚫 | Blocked | | ✅ 05-25 | No scheduled-deletion account state was available in the Chrome seeds, and the destructive delete-account action was not opened. |
| ACCOUNT-13 | Privacy policy | Privacy policy is reachable where surfaced. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/privacy` renders Privacy Policy content with March 2026 last-updated copy. |
| ACCOUNT-14 | Terms of service | Terms are reachable where surfaced. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/terms` renders Terms of Service content with March 2026 last-updated copy. |
| ACCOUNT-15 | Self mentor memory | Self mentor memory remains adult self surface, not child editor. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81aca1add2d79913bf9d | ✅ 05-25 | Direct Chrome `/mentor-memory` renders self-facing memory controls for Test Parent (`Enable mentor memory`, `Decline mentor memory`, `Clear mentor memory for Test Parent`); the persistent splash overlay remains visible. |
| ACCOUNT-16 | Child mentor memory | Child mentor memory works through child route and consent checks. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81aaa4fbec6588243a1c | ✅ 05-25 | Direct Chrome `/child/{profileId}/mentor-memory` renders child-scoped memory controls for Emma, including export/clear memory and Tell the Mentor input; header shows `{{name}}` placeholder. |
| ACCOUNT-17 | Child memory consent prompt | Child memory consent prompts appear where needed. | ✅ | Pass | | ✅ 05-25 | Emma child mentor-memory route shows `Enable mentor memory` and `Decline mentor memory` prompts before memory use. |
| ACCOUNT-18 | Subject analogy preference | Child subject analogy preference is scoped to child route/curriculum. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child subject/curriculum drill-down wedges Chrome under SUBJECT-12/PARENT-04, so subject-level analogy preferences could not be reached. |
| ACCOUNT-19 | Consent request during underage profile creation | Underage consent request affects child visibility correctly. | 🚫 | Blocked | | ✅ 05-25 | Direct `/create-profile` renders the child profile form, but the shared seed was not used to create a new underage child or trigger consent email flows. |
| ACCOUNT-20 | Child handoff to parent consent | Child handoff to parent consent works. | 🚫 | Blocked | | ✅ 05-25 | No child-handoff consent seed/state was available in the Chrome pass. |
| ACCOUNT-21 | Parent email entry / send / resend / change | Parent email entry/resend/change email works for consent. | 🚫 | Blocked | | ✅ 05-25 | Parent-email consent send/resend/change requires a pending underage consent setup and external email delivery, which was not present in the Chrome seed. |
| ACCOUNT-22 | Consent pending gate | Consent pending protects child learning data. | 🚫 | Blocked | | ✅ 05-25 | Available M-C seed has approved child access; no pending-consent child seed was available. |
| ACCOUNT-23 | Consent withdrawn gate | Consent withdrawn protects child learning data. | 🚫 | Blocked | | ✅ 05-25 | Available M-C seed has active consent; withdrawing consent was not performed against the shared seed. |
| ACCOUNT-24 | Post-approval landing | Post-approval landing restores child visibility. | ⚠️ | Pass w/ issues | | ✅ 05-25 | Existing M-C seed lands on Family home after sign-in; attempted parent-solo seed instead landed on child-style post-approval `/dashboard`, so post-approval coverage remains partial. |
| ACCOUNT-25 | Parent consent management | Parent consent management works from child detail. | ✅ | Pass | | ✅ 05-25 | Direct Chrome child detail renders `consent-section` for Emma with `Withdraw consent` available from the parent-native child settings surface. |
| ACCOUNT-26 | Regional consent variants | Regional consent variants protect mentor visibility. | 🚫 | Blocked | | ✅ 05-25 | Chrome seeds did not include region-specific consent variants; only the approved Emma consent state was observed. |
| ACCOUNT-27 | Parent consent deny confirmation | Parent deny confirmation works. | 🚫 | Blocked | | ✅ 05-25 | Parent consent management entry exists, but destructive deny/withdraw confirmation was not opened against the shared Chrome seed. |
| ACCOUNT-28 | App language picker | App language picker works from permitted account surface. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81aca1add2d79913bf9d | ✅ 05-25 | Direct Chrome `/more/account` renders `App Language English`, but normal and forced taps on `settings-app-language` hung while `animated-splash` intercepted pointer events, so the picker could not be judged. |
| ACCOUNT-29 | Mentor language row | Mentor-language/account-language entry does not create separate mentor identity. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81aca1add2d79913bf9d | ✅ 05-25 | More hub exposes `Mentor language`; `/more/account` uses the shared `App Language` row rather than a separate mentor identity, but interaction is blocked by the splash overlay. |
| ACCOUNT-30 | More restrictions in impersonated-child mode | Proxy-only More restrictions do not appear in normal mentor review. | ✅ | Pass | | ✅ 05-25 | Normal mentor review remained owner-scoped: More/Profile routes showed owner account controls and child detail stayed parent-native, with no proxy-only More restriction state observed. |

## Batch 2 - Mentor Home, Navigation, Setup, And Child Curriculum

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home | Learner home is reachable only by Study bridge, not as Mentor home. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c8124a1b8fd98fb9526bd | ✅ 05-25 | Solo adult seed opens Study home with learner actions and subjects; M-C seed can switch back to My Learning. Family shell still exposes My Learning directly rather than only an explicit bridge. |
| HOME-02 | Parent gateway home | Family/Children home summarizes children and routes to mentor surfaces. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | In-app Chrome shows `Children` home with Emma/Lucas/Sofia cards, progress/reports/nudge actions, conversation starters, and Add profile; child subject route blocker is tracked under PARENT-04/SUBJECT-12. |
| HOME-03 | Parent tabs and parent-mode navigation | Mentor tab target is home/recaps/progress/more when implemented. | ❌ | Fail | https://www.notion.so/36b8bce91f7c8124a1b8fd98fb9526bd | ✅ 05-25 | In Family mode the bottom shell exposes `My Learning`, `Library`, `Recaps`, `Progress`, `More`, plus hidden/debug route links (`/quiz`, `/shelf/undefined`, `/child/undefined`, etc.); final target should not expose adult Library or undefined routes. |
| HOME-04 | Animated splash and initial shell | Splash and initial shell remain shared. | ❌ | Fail | https://www.notion.so/36b8bce91f7c81aca1add2d79913bf9d | ✅ 05-25 | Direct Chrome shows `animated-splash` still visible on `/more/notifications`, `/more/account`, `/mentor-memory`, and `/more/privacy`; it intercepted/hung taps on settings rows after route content rendered. |
| HOME-05 | Empty first-user state | Empty first-user state remains Study, not Mentor home. | 🚫 | Blocked | | ✅ 05-25 | No empty first-user seed was available; the stable solo adult seed was already onboarding-complete and rendered Study home. |
| HOME-06 | Resume interrupted session | Resume-session state remains Study, not Mentor home. | 🚫 | Blocked | | ✅ 05-25 | No interrupted-session seed was visible in the Chrome walkthrough; M-C Family home and solo adult Study home loaded without resume prompts. |
| HOME-07 | Add-first-child gate (family/pro plans) | Family setup offers add/link child plus continue-studying path. | ❌ | Fail | https://www.notion.so/36b8bce91f7c8112a606dc04e8a64864 | ✅ 05-25 | Stable solo adult seed shows Study home and no Family switch or add-first-child setup CTA on Home; attempted `parent-solo` seed landed on post-approval child-style `/dashboard`, so the intended M-A setup path is not currently walkable as documented. |
| HOME-08 | Home loading-timeout fallback | Mentor home timeout recovers to Mentor-safe root. | 🚫 | Blocked | | ✅ 05-25 | Normal Family home loaded; no controlled home timeout/API-failure state was injected in Chrome. |
| SUBJECT-01 | Create subject from learner home | Create child subject only from child curriculum path. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child curriculum/subject route is blocked by SUBJECT-12, so child subject creation from that path could not be reached. |
| SUBJECT-02 | Create subject from library empty state | Create child subject from child curriculum empty state, not adult Library. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649, https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct `/library` opens adult Library inside Family shell, and child curriculum drill-down is blocked by SUBJECT-12. |
| SUBJECT-03 | Create subject from chat classifier | Chat classifier fallback is not a normal Mentor route. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Student activity routes are reachable in Family shell, but no chat-classifier subject-creation state was launched from mentor context. |
| SUBJECT-04 | Create subject from homework | Homework subject creation is not a normal Mentor route. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct `/homework` is reachable in Family shell, but subject creation through homework was not launched because the route itself is off-scope for Mentor mode. |
| SUBJECT-05 | Subject resolution and clarification | Child subject resolution is scoped to child when launched from child route. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child subject drill-down wedges Chrome before resolution/clarification UI can be judged. |
| SUBJECT-06 | Broad subject flow + book pick | Child broad subject/book flow is scoped to child when supported. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child broad-subject/book flow is downstream of the blocked child subject/curriculum route. |
| SUBJECT-07 | Focused subject / focused-book flow | Child focused subject/book flow is scoped to child when supported. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child focused-subject/book flow is downstream of the blocked child subject/curriculum route. |
| SUBJECT-08 | Per-subject native-language setup | Child language subject setup is scoped to child. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Per-subject language setup could not be reached because the child subject route wedges Chrome. |
| SUBJECT-12 | View curriculum without committing | Child curriculum view is reachable from child surfaces. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | In-app Chrome reached Emma child detail and the Mathematics child subject card, but clicking it navigated to `/child/{profileId}/subjects/{subjectId}?subjectName=Mathematics&childName=Emma` and made the Chrome automation/CDP session unresponsive. |
| SUBJECT-14 | Placement / knowledge assessment | Assessment cannot silently run as adult when intended for child. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Placement/assessment flow was not reachable from child subject/curriculum because that route wedges Chrome. |
| SUBJECT-16 | Conversation-language picker | Child/profile conversation-language setup is scoped correctly. | ⚠️ | Pass w/ issues | | ✅ 05-25 | Direct `/onboarding/language-setup` renders `No language subject selected Go Home` inside the Family shell; no child subject language setup state was available. |
| SUBJECT-17 | Pronouns picker | Child/profile pronouns setup is scoped and age-gated correctly. | ⚠️ | Pass w/ issues | | ✅ 05-25 | Direct `/onboarding/pronouns` renders the pronouns picker inside the Family shell for the signed-in owner; child age-gated pronoun setup was not available. |

## Batch 3 - Child Review, Recaps, Reports, And Mentor Progress

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PARENT-01 | Parent dashboard | Family home/dashboard works for linked children. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c8124a1b8fd98fb9526bd | ✅ 05-25 | In-app Chrome shows parent-native Family home for linked children; same shell still carries target-tab drift from HOME-03. |
| PARENT-02 | Multi-child dashboard | Multi-child dashboard works. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c8124a1b8fd98fb9526bd | ✅ 05-25 | M-C seed shows three linked children with per-child subjects, minutes, prompts, Progress/Reports/Nudge actions, and family summary. |
| PARENT-03 | Child detail drill-down | Child detail is parent-native and scoped. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81698420fbbdb7f6b270, https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Emma click-path drill-down opens `/child/{profileId}?mode=progress` with child-only subject, raw input, nudge card, and recent session list; direct Chrome deep link to the same URL redirects/renders back to `/home`; subject drill-down then blocks under PARENT-04. |
| PARENT-04 | Child subject → topic drill-down | Child subject/topic drill-down is parent-native and scoped. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Clicking Emma's Mathematics subject card navigates to the child subject URL but wedges Chrome automation/CDP, preventing judgment of subject/topic content. |
| PARENT-05 | Child session / transcript drill-down | Child session/transcript review is parent-native, not proxy-dependent. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/child/{profileId}/session/{sessionId}` renders parent-native session detail with duration, type, recap, highlight, engagement, conversation prompt, `Add to my learning`, topic CTA, and back-to-child-profile action. |
| PARENT-06 | Child reports list and detail | Child reports list/detail works. | 🚫 | Blocked | | ✅ 05-25 | Reports button opens `/child/{profileId}/reports`; empty-state says Emma's first report arrives June 1, 2026 and offers `See Emma's progress now`. Detail was not available in this seed state. |
| PARENT-07 | Parent library view | Child curriculum replaces top-level adult Library in Mentor mode. | ❌ | Fail | https://www.notion.so/36b8bce91f7c8124a1b8fd98fb9526bd, https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Family-mode bottom shell still exposes top-level `Library` (`/library`) and hidden route links with undefined params; child curriculum entry exists from child detail but subject route currently blocks. |
| PARENT-08 | Subject raw-input audit | Subject raw-input audit is scoped to child. | ✅ | Pass | | ✅ 05-25 | Emma child detail click path showed child-scoped raw input (`Your child searched for "fractions homework"`) on the parent-native detail surface. |
| PARENT-09 | Guided label tooltip | Guided label tooltip works in mentor surfaces. | 🚫 | Blocked | | ✅ 05-25 | No Guided label tooltip was visible in the M-C Chrome seed surfaces; needs a child/topic seed that exposes the label. |
| PARENT-10 | Child topic Understanding / Retention cards | Child Understanding/Retention cards render correctly. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child topic cards are downstream of child subject/topic drill-down, which wedges Chrome under PARENT-04/SUBJECT-12. |
| PARENT-11 | Child session recap (Recaps source) | Child session recap content works and can feed Recaps target. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81698420fbbdb7f6b270, https://www.notion.so/36b8bce91f7c81d19223ee40435187ed | ✅ 05-25 | Recaps list renders Lucas/Emma recap rows with child names/topics/narratives; clicking a recap row hangs before detail opens, so detail/back fallback remains blocked. |
| PARENT-12 | Child-subject retention badges | Child subject retention badges are data-gated. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child subject retention badges could not be judged because child subject drill-down wedges Chrome. |
| PARENT-13 | Child weekly report detail | Child weekly report detail works and marks viewed. | 🚫 | Blocked | | ✅ 05-25 | Reports route rendered its list/empty state, but this seed did not expose a weekly report detail row to open. |
| LEARN-07 | Session summary | Student session summary is source material only; mentor reads through parent-native route. | ✅ | Pass | | ✅ 05-25 | Parent session route shows child recap/highlight and a `Session summary` section; no child proxy mode was needed. |
| LEARN-17 | Progress overview tab | Family Progress excludes adult self progress. | ❌ | Fail | https://www.notion.so/36b8bce91f7c811da68bc7cacd38924e | ✅ 05-25 | `/progress` opens family progress but includes child pills plus a `Mine` pill for the owner profile; target says Family Progress excludes adult self progress. |
| LEARN-18 | Subject progress detail | Child subject progress detail is scoped to child. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Emma progress shows Mathematics subject stats and recent session scoped to Emma; subject/detail branch blocked by the child subject route issue in PARENT-04/SUBJECT-12. |
| LEARN-19 | Streak display | Child/family streak display does not imply adult self progress. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c811da68bc7cacd38924e | ✅ 05-25 | Emma progress shows `0-day streak` under Emma content, but the owner `Mine` pill on the same Family Progress page makes self/child scope ambiguous. |
| LEARN-20 | Milestones list | Child/family milestones are scoped correctly where surfaced. | 🚫 | Blocked | | ✅ 05-25 | No milestones list was visible in this M-C Chrome seed state; cannot judge without a seed/profile with child milestones. |
| LEARN-21 | Cross-subject vocabulary browser | Child/family vocabulary browser is scoped correctly where surfaced. | 🚫 | Blocked | | ✅ 05-25 | No cross-subject vocabulary browser was visible in the M-C Chrome seed; route/surface could not be identified from mentor navigation. |
| LEARN-23 | Read-only session transcript | Mentor transcript/recap access uses parent-native route and family checks. | ✅ | Pass | | ✅ 05-25 | Direct Chrome parent session route rendered read-only recap/transcript-adjacent content plus copy and bridge actions under `/child/{profileId}/session/{sessionId}` with no error boundary. |
| LEARN-24 | Saved bookmarks | Saved bookmarks are not exposed as a normal mentor surface. | ✅ | Pass | | ✅ 05-25 | Family home, child detail, Recaps, Progress, More, and Help did not expose a saved-bookmarks mentor surface in the Chrome walkthrough. |

## Batch 4 - Learning, Practice, Homework, Quiz, And Dictation Boundaries

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LEARN-01 | Freeform chat | Freeform chat is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-25 | Family home, child detail, Recaps, Progress, More, and Help did not expose a freeform chat entry from normal mentor review. |
| LEARN-02 | Guided learning session | Guided session is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-25 | Normal mentor surfaces did not expose a guided student session entry; `Add to my learning` bridge is separately blocked under BRIDGE-02. |
| LEARN-03 | First session experience | First session is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-25 | No first-session student entry was visible in normal mentor surfaces. |
| LEARN-04 | Core learning loop | Core learning loop is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-25 | The mentor routes rendered read-only family/child review surfaces rather than the core student chat loop. |
| LEARN-05 | Coach bubble visual variants | Coach bubble variants remain student-session behavior. | ✅ | Pass | | ✅ 05-25 | No coach-bubble student session UI was visible in normal mentor review routes. |
| LEARN-06 | Voice input and voice-speed controls | Voice controls remain student-session behavior. | ✅ | Pass | | ✅ 05-25 | No voice input/speed controls were exposed in the mentor review surfaces tested in Chrome. |
| LEARN-08 | Library v3 | Library behavior is adult Study or child curriculum, not top-level Mentor Library. | ❌ | Fail | https://www.notion.so/36b8bce91f7c8124a1b8fd98fb9526bd, https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct Chrome `/library` while in Family mode renders the adult Library (`Your personal library`, General Knowledge shelf) with Family tabs still present. |
| LEARN-09 | Subject shelf → book selection | Shelf/book selection is scoped to child curriculum or adult Study. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct Chrome `/library` shows the adult General Knowledge shelf and next action; route scope is ambiguous because it remains inside the Family shell. |
| LEARN-10 | Book detail and start learning | Book detail starts learning only in correct student context. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Adult Library is reachable inside the Family shell, but book-detail/start-learning was not launched because the route exposure is already off-scope for Mentor mode. |
| LEARN-11 | Manage subject status | Manage subject status is scoped to child curriculum or adult Study. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child subject/curriculum route is blocked, so child-scoped subject management could not be reached. |
| LEARN-12 | Topic detail | Topic detail is scoped to child curriculum or adult Study. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child topic detail is downstream of the child subject/topic drill-down that wedges Chrome. |
| LEARN-13 | Recall check | Recall check is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-25 | No recall-check entry was visible from normal mentor surfaces in Chrome. |
| LEARN-14 | Failed recall remediation | Failed recall remediation is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-25 | No failed-recall remediation entry was visible from normal mentor surfaces in Chrome. |
| LEARN-15 | Relearn flow | Relearn flow is not directly surfaced from Mentor mode except explicit Study bridge. | ✅ | Pass | | ✅ 05-25 | No relearn entry was visible from normal mentor review surfaces; explicit Study bridge remains covered separately. |
| LEARN-16 | Retention review | Retention review is not directly surfaced from Mentor mode except scoped child review. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Scoped child retention review could not be judged because child subject/topic drill-down wedges Chrome. |
| LEARN-22 | Per-subject vocabulary list | Vocabulary list is child curriculum/adult Study, not top-level Mentor activity. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Per-subject child vocabulary list is downstream of the blocked child subject route. |
| LEARN-25 | Library inline search | Library search is child curriculum/adult Study, not top-level Mentor activity. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct Chrome `/library` renders `library-search-input` in the Family shell; search interaction was not exercised because the route itself is already off-scope for Mentor mode. |
| LEARN-26 | First-curriculum session entry | First-curriculum session starts only in correct student context. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | First-curriculum session entry could not be reached because the child curriculum/subject route wedges Chrome. |
| PRACTICE-01 | Practice hub | Practice hub is not directly surfaced from Mentor mode. | ❌ | Fail | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct Chrome `/practice` from Family context renders `Test yourself` with review, knowledge check, quick quiz, dictation, recitation, and quiz history while Family tabs remain visible. |
| PRACTICE-02 | Review topics shortcut | Review shortcut is not directly surfaced from Mentor mode. | ❌ | Fail | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | `/practice` exposes `Today's review`, `Start review`, and `Browse your topics` in the Family shell. |
| PRACTICE-03 | Recitation session | Recitation session is not directly surfaced from Mentor mode. | ❌ | Fail | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | `/practice` exposes `Recite from memory` (`practice-recitation`) in the Family shell. |
| PRACTICE-04 | "All caught up" empty state | All-caught-up state is not directly surfaced from Mentor mode. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | `/practice` shows a review empty state (`Complete a topic to start reviewing`) in the Family shell; all-caught-up state specifically was not seeded. |
| QUIZ-01 | Quiz activity picker | Quiz picker is not directly surfaced from Mentor mode. | ❌ | Fail | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct Chrome `/quiz` from Family context renders Quiz Challenge rounds with Capitals, Guess Who, and Vocabulary while Family tabs remain visible. |
| QUIZ-02 | Round generation loading screen | Quiz launch is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct `/quiz` is incorrectly reachable in Family shell; round generation was not launched because the top-level route exposure is already filed as off-scope. |
| QUIZ-03 | Round play — multiple choice | Quiz play is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Quiz play is downstream of the off-scope `/quiz` route exposure in Family shell. |
| QUIZ-04 | Round play — Guess Who clue reveal | Guess Who play is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Guess Who play is downstream of the off-scope `/quiz` route exposure in Family shell. |
| QUIZ-05 | Mid-round quit | Quiz quit path is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Mid-round quit requires launching a student quiz from the off-scope Family-shell route. |
| QUIZ-06 | Round complete error retry | Quiz retry/exit path is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Quiz retry/exit requires launching student quiz play from the off-scope Family-shell route. |
| QUIZ-07 | Results screen | Quiz results are not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Quiz results require completing student quiz play from the off-scope Family-shell route. |
| QUIZ-08 | Quiz quota / consent / forbidden errors | Quiz errors are not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Quiz quota/consent error states require specific quota/consent seeds and launching the off-scope quiz route. |
| QUIZ-09 | Quiz history | Quiz history is visible only through parent-native review if designed. | ❌ | Fail | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | `/practice` exposes `Quiz history` in the Family shell instead of a parent-native review surface. |
| QUIZ-10 | Quiz round detail | Quiz detail is visible only through parent-native review if designed. | 🚫 | Blocked | | ✅ 05-25 | No parent-native quiz detail review route was visible in the M-C seed; the only quiz-related surface observed was off-scope student history in `/practice`. |
| QUIZ-11 | Malformed-round guard | Malformed-round guard remains student activity behavior. | 🚫 | Blocked | | ✅ 05-25 | Malformed-round state was not injected in Chrome. |
| QUIZ-12 | Wrong-answer dispute | Wrong-answer dispute remains student activity behavior. | 🚫 | Blocked | | ✅ 05-25 | Wrong-answer dispute requires playing a quiz round and was not launched from the off-scope Family-shell quiz route. |
| QUIZ-13 | Answer-check failure non-blocking warning | Answer-check warning remains student activity behavior. | 🚫 | Blocked | | ✅ 05-25 | Answer-check failure state was not injected in Chrome. |
| DICT-01 | Dictation choice screen | Dictation choice is not directly surfaced from Mentor mode. | ❌ | Fail | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct Chrome `/dictation` from Family context renders `Dictation` with `I have a text` and `Surprise me` while Family tabs remain visible. |
| DICT-02 | OCR text preview + edit | Dictation OCR preview is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Dictation entry is off-scope but reachable in Family shell; OCR preview/edit was not launched from that student route. |
| DICT-03 | "Surprise me" LLM-generated dictation | Generated dictation is not directly surfaced from Mentor mode. | ❌ | Fail | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | `/dictation` exposes the `Surprise me` generated-dictation entry in the Family shell; generation itself was not launched. |
| DICT-04 | Playback screen | Dictation playback is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Playback is downstream of the off-scope Dictation route exposed in Family shell. |
| DICT-05 | Mid-dictation exit confirm | Dictation exit confirm is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Exit confirmation requires launching a student dictation flow from the off-scope Family-shell route. |
| DICT-06 | Completion screen | Dictation completion is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Completion requires running a student dictation flow from the off-scope Family-shell route. |
| DICT-07 | Photo review of handwritten dictation | Dictation photo review is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Photo review/camera behavior is downstream of the off-scope route and partly native-only. |
| DICT-08 | Sentence-level remediation | Dictation remediation is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Remediation requires completing a student dictation flow from the off-scope Family-shell route. |
| DICT-09 | Perfect-score celebration | Dictation perfect-score celebration is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Perfect-score state requires completing a student dictation flow from the off-scope Family-shell route. |
| DICT-10 | Recording dictation result | Dictation result recording is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Result recording requires running the off-scope dictation student flow. |
| HOMEWORK-01 | Start homework from learner home | Homework start is not direct child impersonation from Mentor mode. | ❌ | Fail | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct Chrome `/homework` from Family context renders `Camera Access Needed` and homework entry actions while Family tabs remain visible. |
| HOMEWORK-02 | Camera permission, capture, preview, OCR | Homework camera/OCR is not direct child impersonation from Mentor mode. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | `/homework` exposes `Allow camera access`; native capture/OCR was not exercised in Chrome, and the route scope is already ambiguous under Family shell. |
| HOMEWORK-03 | Manual fallback | Homework manual fallback is not direct child impersonation from Mentor mode. | ❌ | Fail | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | `/homework` exposes `No picture? Type or record instead` (`manual-entry-button`) in the Family shell. |
| HOMEWORK-04 | Homework tutoring session | Homework tutoring is not direct child impersonation from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Homework tutoring is downstream of the off-scope `/homework` route exposed in Family shell. |
| HOMEWORK-05 | Gallery import | Homework gallery import is not direct child impersonation from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Gallery import is downstream of the off-scope homework route and partly native/file-picker dependent. |
| HOMEWORK-06 | Image pass-through to vision LLM | Homework vision pass-through is not direct child impersonation from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Vision pass-through requires launching the off-scope homework flow and providing an image. |
| HOMEWORK-07 | Camera permission onboarding | Homework permission flow is not direct child impersonation from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Camera permission onboarding is downstream of the off-scope homework route and requires browser/native permission state. |

## Batch 5 - Recaps Target

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RECAP-TARGET-01 | Recaps list + detail derived from session recap | Recaps list item/detail reuses child session recap fields from PARENT-11. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81698420fbbdb7f6b270, https://www.notion.so/36b8bce91f7c81d19223ee40435187ed | ✅ 05-25 | Direct Chrome `/recaps` list renders `recap-row-*` rows for Lucas/Emma with child/topic/narrative; detail click hangs before opening. |
| RECAP-TARGET-02 | Recap detail back-fallback to `/(app)/recaps` | Recap detail is parent-native and backs to `/(app)/recaps`. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81d19223ee40435187ed | ✅ 05-25 | Clicking `recap-row-019e5e2c-7854-7976-a34e-0cacbb283254` hung after the click action, so detail and back fallback could not be judged. |
| RECAP-TARGET-03 | Reports / weekly reports coexistence | Reports/weekly reports can coexist with or link to Recaps safely. | ✅ | Pass | | ✅ 05-25 | Reports route and Recaps tab both coexist in Chrome. Reports empty-state links to progress, not Recaps, for this seed. |
| RECAP-TARGET-04 | Read-only of student session source data | Recaps read student session source data without mutating it. | ✅ | Pass | | ✅ 05-25 | `/recaps` list reads existing Lucas/Emma session recap source fields into read-only rows; no mutation controls were surfaced on the list. |
| RECAP-TARGET-05 | Dead-tab gating before route/API ready | Recaps tab is not surfaced as a dead tab before route/API exists. | ✅ | Pass | | ✅ 05-25 | Recaps tab is surfaced and opens a populated `/recaps` list in the Chrome seed state. |

## Batch 6 - Mentor Billing

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Subscription details screen | Owner can open subscription details. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/subscription` renders `subscription-screen` with plan, trial, usage, restore purchases, top-up, manage billing, and BYOK sections. |
| BILLING-02 | Owner upgrade flow | Owner upgrade flow starts safely. | 🚫 | Blocked | | ✅ 05-25 | `/subscription` renders plan comparison and explains web store purchasing is unavailable on this device; owner upgrade purchase was not launched in Chrome. |
| BILLING-03 | Trial / usage / family-pool states | Trial/usage/family-pool states render correctly. | ⚠️ | Pass w/ issues | | ✅ 05-25 | `/subscription` shows `Trial active`, `Trial ends June 9, 2026`, Plus Trial, `0 / 700 questions used`, and reset date; family-pool state was not visible in this seed. |
| BILLING-04 | Restore purchases | Restore purchases works for owner. | 🚫 | Blocked | | ✅ 05-25 | `/subscription` shows `Restore purchases`; the store action was not exercised in Chrome/mobile-web. |
| BILLING-05 | Manage billing deep-link | Manage billing deep-link is safe. | ✅ | Pass | | ✅ 05-25 | `/subscription` shows `Manage billing` with safe mobile-device-managed copy instead of opening an unsupported web billing flow. |
| BILLING-06 | ChildPaywall + notify-parent | Child notify-parent path creates mentor-facing response. | 🚫 | Blocked | | ✅ 05-25 | No child paywall/notify-parent seed state was available in Chrome. |
| BILLING-07 | Daily quota exceeded paywall | Adult owner quota paywall does not affect child review scope. | 🚫 | Blocked | | ✅ 05-25 | M-C seed showed trial quota available, not an exceeded-quota state. |
| BILLING-08 | Family pool details | Family pool details are visible to eligible family owner. | 🚫 | Blocked | | ✅ 05-25 | Subscription page rendered trial/usage details, but no family pool detail state was visible in this seed. |
| BILLING-09 | Top-up question credits | Top-up section works for eligible owner. | ⚠️ | Pass w/ issues | | ✅ 05-25 | `/subscription` shows `Need more questions?`, `Buy 500 credits`, and one-time purchase/expiry copy; purchase action was not launched in Chrome. |
| BILLING-10 | BYOK waitlist | BYOK waitlist state is correct if visible. | ✅ | Pass | | ✅ 05-25 | `/subscription` shows Bring your own key copy and `Join Waitlist`/`join-byok-waitlist-button`. |
| BILLING-11 | Trial banner | Trial banner/status renders for trial owner. | ✅ | Pass | | ✅ 05-25 | `/subscription` renders `Trial active`, current plan Plus Trial, trial end date, usage meter, and quota reset date. |
| BILLING-12 | Static plan comparison cards | Static comparison cards render safely. | ✅ | Pass | | ✅ 05-25 | `/subscription` renders Free and Plus comparison cards; Plus is marked current and web store purchasing is explained as unavailable on this device. |

## Batch 7 - Mentor Cross-Cutting Pass

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC-04 | `goBackOrReplace` back navigation | Mentor child/detail/recap back fallbacks are safe. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81d19223ee40435187ed | ✅ 05-25 | Child/session back actions render, but recap detail click hangs before the detail route opens, so recap back fallback cannot be judged. |
| CC-07 | Accommodation badge surfaces | Child accommodation controls are mentor-gated. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81029269f1932b4a87f9 | ✅ 05-25 | Child detail exposes Emma's learning preferences and `/more/accommodation?childProfileId=...` renders child accommodation controls; learning-preferences copy is adult-self framed. |
| CC-08 | Parent-facing metric vocabulary | Parent-facing metric vocabulary appears on mentor surfaces. | ✅ | Pass | | ✅ 05-25 | Chrome mentor surfaces use parent-facing labels such as Children, Reports, Nudge, session recap, engagement, child raw-input copy, consent, and learning preferences. |
| CC-09 | Opaque web layout backgrounds | Web backgrounds do not bleed between Family/child stacks. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81aca1add2d79913bf9d | ✅ 05-25 | Main child/session/settings routes render without obvious background bleed, but some settings routes retain the animated splash overlay above content. |
| CC-11 | i18n `t()` cross-cutting strings | Mentor copy uses i18n keys. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81029269f1932b4a87f9, https://www.notion.so/36b8bce91f7c81aaa4fbec6588243a1c | ✅ 05-25 | Most mentor copy renders user-facing strings, but child learning-preferences uses adult-self copy and child mentor-memory header includes `{{name}}`. |
| CC-12 | FeedbackProvider + shake-to-feedback | FeedbackProvider works on mentor gates/More. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/more/help` renders Help & feedback with Help & Support and Report a Problem; native shake-to-feedback was not exercised in Chrome. |
| CC-17 | Profile-as-lens navigation pattern | Profile-as-lens child routes do not leak or guess child scope. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81698420fbbdb7f6b270, https://www.notion.so/36b8bce91f7c81c097f8cc060f836810 | ✅ 05-25 | Child routes render scoped Emma content when entered directly after auth, but auth deep-link preservation and profile-row navigation both fail. |
| CC-18 | Stable FlatList refs | Stable list refs hold on child lists, reports, Recaps, and family progress. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81d19223ee40435187ed | ✅ 05-25 | Child list, recaps list, and profile list render stable rows in Chrome; clicking a recap row still hangs before detail. |

## Batch 8 - Study Bridge And Negative Student Surfaces

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BRIDGE-01 | Mentor → Study switch retains own Study access | Adult can switch from Mentor to Study and retain own Study access. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c8124a1b8fd98fb9526bd, https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct Chrome shows My Learning/Library routes load the adult owner's Study data, but those routes are exposed inside the Family shell rather than through a clear bridge. |
| BRIDGE-02 | "Add to my learning" writes as adult | "Add to my learning" writes as adult, not as child. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81d8a1f3dc69d960481d | ✅ 05-25 | Parent session detail renders `Add to my learning`, but clicking `add-to-my-learning-button` hung before success/failure, so write scope could not be verified. |
| BRIDGE-03 | Adult quota / paywall before Study bridge | Adult quota/paywall appears before Study bridge if needed. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81d8a1f3dc69d960481d | ✅ 05-25 | Add-to-my-learning bridge click is blocked before any adult quota/paywall branch can be judged. |
| BRIDGE-04 | Back-nav after bridge avoids stale child/proxy | Back navigation after bridge does not return to stale child/proxy route. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81d8a1f3dc69d960481d | ✅ 05-25 | Add-to-my-learning bridge click is blocked before bridge destination/back navigation can be judged. |
| BRIDGE-05 | Normal mentor review never enters parent proxy | Normal mentor review never enters parent proxy. | ✅ | Pass | | ✅ 05-25 | Parent home, child detail, child session detail, child memory, and child accommodation routes rendered parent-native surfaces without switching the active profile into a child proxy. |

## Discovered Mentor Flows

| Temp ID | Flow | Found in batch | Routes / entry points | Inventory updated | Notes |
| --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | |

## Master Roll-Up

| Batch | Section | Items | Status | Notes |
| --- | ---: | ---: | --- | --- |
| 1 | Auth, Account, And Mentor Setup | 44 | ⚠️ | 8 pass, 13 pass w/ issues, 1 fail, 22 blocked/seed- or provider-dependent. |
| 2 | Mentor Home, Navigation, Setup, And Child Curriculum | 20 | ⚠️ | 4 pass w/ issues, 3 fail, 13 blocked; child subject route is the main downstream blocker. |
| 3 | Child Review, Recaps, Reports, And Mentor Progress | 21 | ⚠️ | 5 pass, 6 pass w/ issues, 2 fail, 8 blocked. |
| 4 | Learning, Practice, Homework, Quiz, And Dictation Boundaries | 52 | ⚠️ | 9 pass, 4 pass w/ issues, 10 fail, 29 blocked/downstream or native/seed-dependent. |
| 5 | Recaps Target | 5 | ⚠️ | 3 pass, 1 pass w/ issues, 1 blocked. |
| 6 | Mentor Billing | 12 | ⚠️ | 5 pass, 2 pass w/ issues, 5 blocked/store- or seed-dependent. |
| 7 | Mentor Cross-Cutting Pass | 8 | ⚠️ | 2 pass, 5 pass w/ issues, 1 blocked. |
| 8 | Study Bridge And Negative Student Surfaces | 5 | ⚠️ | 1 pass, 1 pass w/ issues, 3 blocked. |
| **Total** | | **167** | ⚠️ | 33 pass, 36 pass w/ issues, 16 fail, 82 blocked. No audit rows remain unstarted. |
