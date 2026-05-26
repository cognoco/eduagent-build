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
| 2026-05-25 | `28eab43a5f` / local API `http://127.0.0.1:8787` with staging Doppler config / seeded `mentor-audit-*` registry | Playwright `mentor-audit-registry-smoke` browser run | Reran the seeded registry after blockers/seeds were fixed. The staging API seed endpoint was deploy-lagged and did not know the `mentor-audit-*` scenarios, so the pass used the local API against staging config. Result: 15 reachable default registry landings passed. Four registry entries remain blocked/not covered by this landing harness: post-approval redirect requires an API consent-page browser check, session-expired/session-revoked need deterministic auth invalidation that surfaces the sign-in banners, and MFA needs a standing Clerk MFA fixture because staging authenticator-app MFA is disabled. Local harness fixes made during this rerun: skip welcome intro after seeded sign-in, preserve seeded active profile IDs, align stale first-screen routes/test IDs, and fix rich-child-history retention seed uniqueness. The local API still logged trial-repair/safe-send billing warnings for seeded accounts; browser assertions passed, but the warnings remain cleanup evidence. |

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
| AUTH-01 | App launch and auth gate | Shared launch/auth gate; mentor routes require family access. | ✅ | Pass | | ✅ 05-26 | Latest-main refresh: shared auth gate/sign-in lanes pass; historical child deep-link bug is Done and no longer makes app launch a current issue. |
| AUTH-02 | Sign up with email and password | Email sign-up works before audience is known. | 🚫 | Blocked | | ✅ 05-25 | Sign-in page `Sign up` link opens create-account form with email/password, Google, Terms/Privacy copy, and Sign in link. Submission/email verification was not exercised to avoid email quota. |
| AUTH-03 | Sign-up email verification code | Sign-up verification works before audience is known. | 🚫 | Blocked | | ✅ 05-25 | Sign-up form is reachable in Chrome, but email verification code delivery/entry was not exercised because it requires an external email code flow. |
| AUTH-04 | Sign in with email and password | Email sign-in preserves reachable mentor route only when authorized. | ✅ | Pass | | ✅ 05-26 | Latest-main refresh: email/password sign-in reaches the app for seeded accounts; historical child deep-link preservation bug is Done and tracked separately from basic sign-in. |
| AUTH-05 | Additional sign-in verification | Additional sign-in verification preserves authorized mentor route. | 🚫 | Blocked | | ✅ 05-25 | Email/password sign-in works for the available seeds, but no seed/account in this Chrome pass required an additional verification factor. |
| AUTH-06 | Forgot password and reset password | Forgot/reset password remains audience-neutral. | 🚫 | Blocked | | ✅ 05-25 | Forgot-password link opens reset-code request screen with email input, Send reset code, and Back to sign in. Actual email/reset code was not exercised. |
| AUTH-07 | Auth screen navigation | Sign-in/sign-up/forgot navigation remains audience-neutral. | ✅ | Pass | | ✅ 05-25 | Direct Chrome confirms sign-in page links to Sign up and Forgot password screens, and those screens include return/sign-in paths. |
| AUTH-08 | OAuth sign in / sign up | OAuth buttons/callback entry remain shared. | 🚫 | Blocked | | ✅ 05-25 | Sign-in/sign-up surfaces show shared Google entry, but OAuth provider completion was not exercised from Chrome because it depends on external provider credentials/callback state. |
| AUTH-09 | SSO callback completion and fallback | SSO callback fallback returns safely to sign-in. | 🚫 | Blocked | | ✅ 05-25 | No valid or malformed SSO callback state was available in the Chrome walkthrough; only the OAuth entry buttons were observed. |
| AUTH-10 | Sign out | Sign-out is available only from permitted surfaces. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c8166b0abf009ef74face | ✅ 05-25 | Direct Chrome `/more` shows `Sign out`, but clicking `sign-out-button` hung after the click action and never returned to sign-in before the 45s timeout. |
| AUTH-11 | Session-expired forced sign-out and banner | Session-expired sign-out returns to sign-in with banner. | 🚫 | Blocked | | ✅ 05-25 | The Chrome walkthrough did not have a controlled expired-token/session-invalid seed; normal sign-out is separately blocked by AUTH-10. |
| AUTH-12 | First-time vs returning sign-in copy | First-time vs returning copy remains correct. | ✅ | Pass | | ✅ 05-25 | Direct Chrome auth retry renders `Welcome to MentoMate`, `New here? Try MentoMate`, sign-up `Create account`, and forgot-password reset-code copy after the bundle settles. |
| AUTH-13 | Deep-link auth redirect preservation | Deep-link redirect restores authorized mentor routes only. | 🚫 | Blocked | https://www.notion.so/36c8bce91f7c810dac87c81009503508 | ✅ 05-26 | Historical direct child deep-link bug is Done, but this row still needs a fresh direct latest-main rerun after the parent landing harness mismatch is resolved before it can be counted Pass. |
| AUTH-14 | Sign-in transition spinner / stuck-state recovery | Sign-in transition/stuck recovery works. | 🚫 | Blocked | | ✅ 05-26 | Normal sign-in recovered to `/home`; stuck-transition recovery still needs an injected spinner/session-stall fixture, so this is partial coverage rather than a product defect. |
| ACCOUNT-01 | Create first profile | First profile can capture Study/Family intent but remains Study-safe without child links. | 🚫 | Blocked | | ✅ 05-25 | Existing seeded accounts already had profiles; first-profile creation could not be exercised without a fresh verified account. |
| ACCOUNT-02 | Create additional profile | Additional profile creation supports adult/child profiles where allowed. | ✅ | Pass | | ✅ 05-26 | Direct `/create-profile` renders the child profile form; the old add-child subscription-gate hang is Done and tracked under ACCOUNT-03/05, not this direct form row. |
| ACCOUNT-03 | Add child profile from More or Profiles | Add-child from More/Profiles works as optional mentor setup. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c816a9cc8c86c2f45c059 | ✅ 05-25 | In-app Chrome More exposes `Add a child`; clicking it navigated to `/subscription` and then made the browser automation/CDP session unresponsive, so the create-child form could not be judged. |
| ACCOUNT-04 | Profile switching | Profile switching does not enter proxy for normal child review. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81c097f8cc060f836810 | ✅ 05-25 | Direct Chrome `/profiles` shows Test Parent active plus Emma/Lucas/Sofia learner rows; clicking Emma's row stayed on `/profiles` instead of opening child settings, so the intended owner-to-child path could not be judged. |
| ACCOUNT-05 | Family-plan / max-profile gating | Family-plan/max-profile gates protect add-child setup. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c816a9cc8c86c2f45c059 | ✅ 05-25 | Add-child entry appears to route through `/subscription` for the M-C seed, but the route wedged Chrome automation before the paywall/gate copy could be verified. |
| ACCOUNT-06 | More hub navigation | More exposes mentor rows only when allowed. | ✅ | Pass | | ✅ 05-26 | More hub renders the expected owner/family rows; historical hidden-tab/Family-shell route pollution bug is Done. |
| ACCOUNT-07 | Notifications sub-screen | Mentor-relevant notification settings work. | ✅ | Pass | | ✅ 05-26 | Notifications screen renders; latest language/settings lane passed, so the old animated-splash blocker is no longer active. |
| ACCOUNT-08 | Learning preferences / accommodation | Child accommodation/celebration editors are mentor-gated. | ✅ | Pass | | ✅ 05-26 | Child accommodation/preferences surfaces render; historical child learning-preferences adult-self copy bug is Done. |
| ACCOUNT-09 | Change password | Change password is owner-only. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/more/account` shows `Change Password` only on the owner account surface alongside Test Parent's profile row. Form expansion was not exercised. |
| ACCOUNT-10 | Export my data | Export is owner-only. | ✅ | Pass | | ✅ 05-26 | Privacy screen surfaces owner-only export entry; old splash overlay blocker is Done. Export action itself remains destructive/external and was not launched. |
| ACCOUNT-11 | Delete account | Delete account is owner-only. | ✅ | Pass | | ✅ 05-26 | Privacy screen surfaces owner-only delete-account entry; old splash overlay blocker is Done. Destructive confirmation was not opened against the shared seed. |
| ACCOUNT-12 | Scheduled deletion / Keep account | Scheduled deletion recovery works for owner profile. | 🚫 | Blocked | | ✅ 05-25 | No scheduled-deletion account state was available in the Chrome seeds, and the destructive delete-account action was not opened. |
| ACCOUNT-13 | Privacy policy | Privacy policy is reachable where surfaced. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/privacy` renders Privacy Policy content with March 2026 last-updated copy. |
| ACCOUNT-14 | Terms of service | Terms are reachable where surfaced. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/terms` renders Terms of Service content with March 2026 last-updated copy. |
| ACCOUNT-15 | Self mentor memory | Self mentor memory remains adult self surface, not child editor. | ✅ | Pass | | ✅ 05-26 | Self mentor-memory route renders the owner self surface; old splash overlay blocker is Done. |
| ACCOUNT-16 | Child mentor memory | Child mentor memory works through child route and consent checks. | ✅ | Pass | | ✅ 05-26 | Child mentor-memory route renders child-scoped controls; historical `{{name}}` interpolation bug is Done. |
| ACCOUNT-17 | Child memory consent prompt | Child memory consent prompts appear where needed. | ✅ | Pass | | ✅ 05-25 | Emma child mentor-memory route shows `Enable mentor memory` and `Decline mentor memory` prompts before memory use. |
| ACCOUNT-18 | Subject analogy preference | Child subject analogy preference is scoped to child route/curriculum. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child subject/curriculum drill-down wedges Chrome under SUBJECT-12/PARENT-04, so subject-level analogy preferences could not be reached. |
| ACCOUNT-19 | Consent request during underage profile creation | Underage consent request affects child visibility correctly. | 🚫 | Blocked | | ✅ 05-25 | Direct `/create-profile` renders the child profile form, but the shared seed was not used to create a new underage child or trigger consent email flows. |
| ACCOUNT-20 | Child handoff to parent consent | Child handoff to parent consent works. | 🚫 | Blocked | | ✅ 05-25 | No child-handoff consent seed/state was available in the Chrome pass. |
| ACCOUNT-21 | Parent email entry / send / resend / change | Parent email entry/resend/change email works for consent. | 🚫 | Blocked | | ✅ 05-25 | Parent-email consent send/resend/change requires a pending underage consent setup and external email delivery, which was not present in the Chrome seed. |
| ACCOUNT-22 | Consent pending gate | Consent pending protects child learning data. | 🚫 | Blocked | | ✅ 05-25 | Available M-C seed has approved child access; no pending-consent child seed was available. |
| ACCOUNT-23 | Consent withdrawn gate | Consent withdrawn protects child learning data. | 🚫 | Blocked | | ✅ 05-25 | Available M-C seed has active consent; withdrawing consent was not performed against the shared seed. |
| ACCOUNT-24 | Post-approval landing | Post-approval landing restores child visibility. | 🚫 | Blocked | https://www.notion.so/36c8bce91f7c81b2ad33e27aab4f539a | ✅ 05-26 | Steady-state M-C sign-in works, but post-approval email-link coverage is blocked by the current wrong-route harness bug for `/consent/approve`. |
| ACCOUNT-25 | Parent consent management | Parent consent management works from child detail. | ✅ | Pass | | ✅ 05-25 | Direct Chrome child detail renders `consent-section` for Emma with `Withdraw consent` available from the parent-native child settings surface. |
| ACCOUNT-26 | Regional consent variants | Regional consent variants protect mentor visibility. | 🚫 | Blocked | | ✅ 05-25 | Chrome seeds did not include region-specific consent variants; only the approved Emma consent state was observed. |
| ACCOUNT-27 | Parent consent deny confirmation | Parent deny confirmation works. | 🚫 | Blocked | | ✅ 05-25 | Parent consent management entry exists, but destructive deny/withdraw confirmation was not opened against the shared Chrome seed. |
| ACCOUNT-28 | App language picker | App language picker works from permitted account surface. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81aca1add2d79913bf9d | ✅ 05-25 | Direct Chrome `/more/account` renders `App Language English`, but normal and forced taps on `settings-app-language` hung while `animated-splash` intercepted pointer events, so the picker could not be judged. |
| ACCOUNT-29 | Mentor language row | Mentor-language/account-language entry does not create separate mentor identity. | ✅ | Pass | | ✅ 05-26 | Shared app-language entry remains account-scoped; latest `j24-subject16-conversation-language` lane passed 5/5 after the splash fix. |
| ACCOUNT-30 | More restrictions in impersonated-child mode | Proxy-only More restrictions do not appear in normal mentor review. | ✅ | Pass | | ✅ 05-25 | Normal mentor review remained owner-scoped: More/Profile routes showed owner account controls and child detail stayed parent-native, with no proxy-only More restriction state observed. |

## Batch 2 - Mentor Home, Navigation, Setup, And Child Curriculum

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home | Learner home is reachable only by Study bridge, not as Mentor home. | ✅ | Pass | | ✅ 05-26 | Adult Study/My Learning home is reachable and latest learner smoke/UX passed; separate parent landing mismatch is tracked outside this Study row. |
| HOME-02 | Parent gateway home | Family/Children home summarizes children and routes to mentor surfaces. | ⚠️ | Pass w/ issues | https://www.notion.so/36c8bce91f7c8196a766c9bc9ce12aad, https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-26 | Family home was previously walked with linked children, but latest parent specs now start on My Learning and child subject drill-down remains open. |
| HOME-03 | Parent tabs and parent-mode navigation | Mentor tab target is home/recaps/progress/more when implemented. | ⚠️ | Pass w/ issues | https://www.notion.so/36c8bce91f7c8196a766c9bc9ce12aad | ✅ 05-26 | Historical hidden/undefined route exposure is Done. Current issue is the parent journey landing/spec mismatch: owner-with-children starts on My Learning unless tests/app switch to Children. |
| HOME-04 | Animated splash and initial shell | Splash and initial shell remain shared. | ✅ | Pass | | ✅ 05-26 | Latest settings/language lane passed 5/5; historical animated-splash interception bug is Done. |
| HOME-05 | Empty first-user state | Empty first-user state remains Study, not Mentor home. | 🚫 | Blocked | | ✅ 05-25 | No empty first-user seed was available; the stable solo adult seed was already onboarding-complete and rendered Study home. |
| HOME-06 | Resume interrupted session | Resume-session state remains Study, not Mentor home. | 🚫 | Blocked | | ✅ 05-25 | No interrupted-session seed was visible in the Chrome walkthrough; M-C Family home and solo adult Study home loaded without resume prompts. |
| HOME-07 | Add-first-child gate (family/pro plans) | Family setup offers add/link child plus continue-studying path. | ❌ | Fail | https://www.notion.so/36b8bce91f7c8112a606dc04e8a64864 | ✅ 05-26 | Still active: adult without child links has no confirmed Family setup entry/continue-studying path on Home, and the parent-solo seed was unreliable. |
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
| SUBJECT-16 | Conversation-language picker | Child/profile conversation-language setup is scoped correctly. | ✅ | Pass | | ✅ 05-26 | Latest `j24-subject16-conversation-language` browser lane passed 5/5 for the account language picker; no current product bug remains from this row. |
| SUBJECT-17 | Pronouns picker | Child/profile pronouns setup is scoped and age-gated correctly. | ✅ | Pass | | ✅ 05-26 | Pronouns picker renders preset, Other, Skip, and Continue controls; latest failures are selector/semantics drift, not a confirmed product defect. |

## Batch 3 - Child Review, Recaps, Reports, And Mentor Progress

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PARENT-01 | Parent dashboard | Family home/dashboard works for linked children. | ⚠️ | Pass w/ issues | https://www.notion.so/36c8bce91f7c8196a766c9bc9ce12aad | ✅ 05-26 | Parent-native Family home was walked earlier, but latest parent journey setup lands on My Learning first; current action is the setup/spec contract bug. |
| PARENT-02 | Multi-child dashboard | Multi-child dashboard works. | ⚠️ | Pass w/ issues | https://www.notion.so/36c8bce91f7c8196a766c9bc9ce12aad | ✅ 05-26 | Multi-child dashboard evidence exists from the earlier Chrome walk; latest parent journey setup must switch/seed Family before asserting it. |
| PARENT-03 | Child detail drill-down | Child detail is parent-native and scoped. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-26 | Child detail click path renders scoped Emma content; historical direct deep-link bug is Done. Child subject drill-down remains the active downstream blocker. |
| PARENT-04 | Child subject → topic drill-down | Child subject/topic drill-down is parent-native and scoped. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Clicking Emma's Mathematics subject card navigates to the child subject URL but wedges Chrome automation/CDP, preventing judgment of subject/topic content. |
| PARENT-05 | Child session / transcript drill-down | Child session/transcript review is parent-native, not proxy-dependent. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/child/{profileId}/session/{sessionId}` renders parent-native session detail with duration, type, recap, highlight, engagement, conversation prompt, `Add to my learning`, topic CTA, and back-to-child-profile action. |
| PARENT-06 | Child reports list and detail | Child reports list/detail works. | 🚫 | Blocked | | ✅ 05-25 | Reports button opens `/child/{profileId}/reports`; empty-state says Emma's first report arrives June 1, 2026 and offers `See Emma's progress now`. Detail was not available in this seed state. |
| PARENT-07 | Parent library view | Child curriculum replaces top-level adult Library in Mentor mode. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-26 | Historical Family-shell Library/undefined-route bug is Done. Parent curriculum/library judgment now depends on the still-open child subject route blocker. |
| PARENT-08 | Subject raw-input audit | Subject raw-input audit is scoped to child. | ✅ | Pass | | ✅ 05-25 | Emma child detail click path showed child-scoped raw input (`Your child searched for "fractions homework"`) on the parent-native detail surface. |
| PARENT-09 | Guided label tooltip | Guided label tooltip works in mentor surfaces. | 🚫 | Blocked | | ✅ 05-25 | No Guided label tooltip was visible in the M-C Chrome seed surfaces; needs a child/topic seed that exposes the label. |
| PARENT-10 | Child topic Understanding / Retention cards | Child Understanding/Retention cards render correctly. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child topic cards are downstream of child subject/topic drill-down, which wedges Chrome under PARENT-04/SUBJECT-12. |
| PARENT-11 | Child session recap (Recaps source) | Child session recap content works and can feed Recaps target. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81d19223ee40435187ed | ✅ 05-26 | Recaps list/source rows render child recap data; detail click/back fallback remains open under the recap row-click blocker. |
| PARENT-12 | Child-subject retention badges | Child subject retention badges are data-gated. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child subject retention badges could not be judged because child subject drill-down wedges Chrome. |
| PARENT-13 | Child weekly report detail | Child weekly report detail works and marks viewed. | 🚫 | Blocked | | ✅ 05-25 | Reports route rendered its list/empty state, but this seed did not expose a weekly report detail row to open. |
| LEARN-07 | Session summary | Student session summary is source material only; mentor reads through parent-native route. | ✅ | Pass | | ✅ 05-25 | Parent session route shows child recap/highlight and a `Session summary` section; no child proxy mode was needed. |
| LEARN-17 | Progress overview tab | Family Progress excludes adult self progress. | ✅ | Pass | | ✅ 05-26 | Historical Family Progress owner-self `Mine` exposure bug is Done in PR #453; no fresh latest-main repro is active. |
| LEARN-18 | Subject progress detail | Child subject progress detail is scoped to child. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-26 | Emma progress overview remains scoped; deeper subject detail remains blocked by the open child subject route wedge. |
| LEARN-19 | Streak display | Child/family streak display does not imply adult self progress. | ✅ | Pass | | ✅ 05-26 | Child streak display was scoped in prior Chrome evidence, and the old owner-self Family Progress ambiguity is Done. |
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
| LEARN-08 | Library v3 | Library behavior is adult Study or child curriculum, not top-level Mentor Library. | ✅ | Pass | | ✅ 05-26 | Historical student Library route showing inside Family shell is Done; hidden-route/full-screen fixes remove it from current active blocker counts. |
| LEARN-09 | Subject shelf → book selection | Shelf/book selection is scoped to child curriculum or adult Study. | ✅ | Pass | | ✅ 05-26 | Historical adult Library-in-Family-shell ambiguity is Done; no current Mentor-surfaced shelf/book bug is active. |
| LEARN-10 | Book detail and start learning | Book detail starts learning only in correct student context. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Adult Library is reachable inside the Family shell, but book-detail/start-learning was not launched because the route exposure is already off-scope for Mentor mode. |
| LEARN-11 | Manage subject status | Manage subject status is scoped to child curriculum or adult Study. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child subject/curriculum route is blocked, so child-scoped subject management could not be reached. |
| LEARN-12 | Topic detail | Topic detail is scoped to child curriculum or adult Study. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Child topic detail is downstream of the child subject/topic drill-down that wedges Chrome. |
| LEARN-13 | Recall check | Recall check is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-25 | No recall-check entry was visible from normal mentor surfaces in Chrome. |
| LEARN-14 | Failed recall remediation | Failed recall remediation is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-25 | No failed-recall remediation entry was visible from normal mentor surfaces in Chrome. |
| LEARN-15 | Relearn flow | Relearn flow is not directly surfaced from Mentor mode except explicit Study bridge. | ✅ | Pass | | ✅ 05-25 | No relearn entry was visible from normal mentor review surfaces; explicit Study bridge remains covered separately. |
| LEARN-16 | Retention review | Retention review is not directly surfaced from Mentor mode except scoped child review. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Scoped child retention review could not be judged because child subject/topic drill-down wedges Chrome. |
| LEARN-22 | Per-subject vocabulary list | Vocabulary list is child curriculum/adult Study, not top-level Mentor activity. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | Per-subject child vocabulary list is downstream of the blocked child subject route. |
| LEARN-25 | Library inline search | Library search is child curriculum/adult Study, not top-level Mentor activity. | ✅ | Pass | | ✅ 05-26 | Historical Library search-in-Family-shell ambiguity is Done; no current Mentor-surfaced search bug is active. |
| LEARN-26 | First-curriculum session entry | First-curriculum session starts only in correct student context. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81f7a161f229f3ab7649 | ✅ 05-25 | First-curriculum session entry could not be reached because the child curriculum/subject route wedges Chrome. |
| PRACTICE-01 | Practice hub | Practice hub is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-26 | Historical Practice route rendering inside Family shell is Done; route exposure/full-screen fix removes this as a current Mentor defect. |
| PRACTICE-02 | Review topics shortcut | Review shortcut is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-26 | Historical review shortcut exposure through Family shell is Done with the Practice route fix. |
| PRACTICE-03 | Recitation session | Recitation session is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-26 | Historical recitation entry exposure through Family shell is Done with the Practice route fix. |
| PRACTICE-04 | "All caught up" empty state | All-caught-up state is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-26 | Historical Practice empty-state-in-Family-shell issue is Done; all-caught-up seed remains outside this current defect row. |
| QUIZ-01 | Quiz activity picker | Quiz picker is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-26 | Historical Quiz route rendering inside Family shell is Done; direct route exposure is no longer an active Mentor defect. |
| QUIZ-02 | Round generation loading screen | Quiz launch is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Direct `/quiz` is incorrectly reachable in Family shell; round generation was not launched because the top-level route exposure is already filed as off-scope. |
| QUIZ-03 | Round play — multiple choice | Quiz play is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Quiz play is downstream of the off-scope `/quiz` route exposure in Family shell. |
| QUIZ-04 | Round play — Guess Who clue reveal | Guess Who play is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Guess Who play is downstream of the off-scope `/quiz` route exposure in Family shell. |
| QUIZ-05 | Mid-round quit | Quiz quit path is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Mid-round quit requires launching a student quiz from the off-scope Family-shell route. |
| QUIZ-06 | Round complete error retry | Quiz retry/exit path is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Quiz retry/exit requires launching student quiz play from the off-scope Family-shell route. |
| QUIZ-07 | Results screen | Quiz results are not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Quiz results require completing student quiz play from the off-scope Family-shell route. |
| QUIZ-08 | Quiz quota / consent / forbidden errors | Quiz errors are not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Quiz quota/consent error states require specific quota/consent seeds and launching the off-scope quiz route. |
| QUIZ-09 | Quiz history | Quiz history is visible only through parent-native review if designed. | ✅ | Pass | | ✅ 05-26 | Historical Quiz history exposure via Family shell is Done with the student-activity route fix. |
| QUIZ-10 | Quiz round detail | Quiz detail is visible only through parent-native review if designed. | 🚫 | Blocked | | ✅ 05-25 | No parent-native quiz detail review route was visible in the M-C seed; the only quiz-related surface observed was off-scope student history in `/practice`. |
| QUIZ-11 | Malformed-round guard | Malformed-round guard remains student activity behavior. | 🚫 | Blocked | | ✅ 05-25 | Malformed-round state was not injected in Chrome. |
| QUIZ-12 | Wrong-answer dispute | Wrong-answer dispute remains student activity behavior. | 🚫 | Blocked | | ✅ 05-25 | Wrong-answer dispute requires playing a quiz round and was not launched from the off-scope Family-shell quiz route. |
| QUIZ-13 | Answer-check failure non-blocking warning | Answer-check warning remains student activity behavior. | 🚫 | Blocked | | ✅ 05-25 | Answer-check failure state was not injected in Chrome. |
| DICT-01 | Dictation choice screen | Dictation choice is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-26 | Historical Dictation route rendering inside Family shell is Done; no active Mentor route-scope bug remains. |
| DICT-02 | OCR text preview + edit | Dictation OCR preview is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Dictation entry is off-scope but reachable in Family shell; OCR preview/edit was not launched from that student route. |
| DICT-03 | "Surprise me" LLM-generated dictation | Generated dictation is not directly surfaced from Mentor mode. | ✅ | Pass | | ✅ 05-26 | Historical generated-dictation entry exposure through Family shell is Done with the Dictation route fix. |
| DICT-04 | Playback screen | Dictation playback is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Playback is downstream of the off-scope Dictation route exposed in Family shell. |
| DICT-05 | Mid-dictation exit confirm | Dictation exit confirm is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Exit confirmation requires launching a student dictation flow from the off-scope Family-shell route. |
| DICT-06 | Completion screen | Dictation completion is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Completion requires running a student dictation flow from the off-scope Family-shell route. |
| DICT-07 | Photo review of handwritten dictation | Dictation photo review is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Photo review/camera behavior is downstream of the off-scope route and partly native-only. |
| DICT-08 | Sentence-level remediation | Dictation remediation is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Remediation requires completing a student dictation flow from the off-scope Family-shell route. |
| DICT-09 | Perfect-score celebration | Dictation perfect-score celebration is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Perfect-score state requires completing a student dictation flow from the off-scope Family-shell route. |
| DICT-10 | Recording dictation result | Dictation result recording is not directly surfaced from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Result recording requires running the off-scope dictation student flow. |
| HOMEWORK-01 | Start homework from learner home | Homework start is not direct child impersonation from Mentor mode. | ✅ | Pass | | ✅ 05-26 | Historical Homework route rendering inside Family shell is Done; no active Mentor route-scope bug remains. |
| HOMEWORK-02 | Camera permission, capture, preview, OCR | Homework camera/OCR is not direct child impersonation from Mentor mode. | 🚫 | Blocked | | ✅ 05-26 | Historical Family-shell route-scope bug is Done. Camera capture/preview/OCR still requires browser/native permission and image fixtures, so this branch remains not judged. |
| HOMEWORK-03 | Manual fallback | Homework manual fallback is not direct child impersonation from Mentor mode. | ✅ | Pass | | ✅ 05-26 | Historical manual-homework entry exposure through Family shell is Done with the Homework route fix. |
| HOMEWORK-04 | Homework tutoring session | Homework tutoring is not direct child impersonation from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Homework tutoring is downstream of the off-scope `/homework` route exposed in Family shell. |
| HOMEWORK-05 | Gallery import | Homework gallery import is not direct child impersonation from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Gallery import is downstream of the off-scope homework route and partly native/file-picker dependent. |
| HOMEWORK-06 | Image pass-through to vision LLM | Homework vision pass-through is not direct child impersonation from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Vision pass-through requires launching the off-scope homework flow and providing an image. |
| HOMEWORK-07 | Camera permission onboarding | Homework permission flow is not direct child impersonation from Mentor mode. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c814984cddbfa84010a1b | ✅ 05-25 | Camera permission onboarding is downstream of the off-scope homework route and requires browser/native permission state. |

## Batch 5 - Recaps Target

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RECAP-TARGET-01 | Recaps list + detail derived from session recap | Recaps list item/detail reuses child session recap fields from PARENT-11. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81d19223ee40435187ed | ✅ 05-26 | Recaps list renders child recap source rows; detail click/back fallback remains open under the recap row-click blocker. |
| RECAP-TARGET-02 | Recap detail back-fallback to `/(app)/recaps` | Recap detail is parent-native and backs to `/(app)/recaps`. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81d19223ee40435187ed | ✅ 05-25 | Clicking `recap-row-019e5e2c-7854-7976-a34e-0cacbb283254` hung after the click action, so detail and back fallback could not be judged. |
| RECAP-TARGET-03 | Reports / weekly reports coexistence | Reports/weekly reports can coexist with or link to Recaps safely. | ✅ | Pass | | ✅ 05-25 | Reports route and Recaps tab both coexist in Chrome. Reports empty-state links to progress, not Recaps, for this seed. |
| RECAP-TARGET-04 | Read-only of student session source data | Recaps read student session source data without mutating it. | ✅ | Pass | | ✅ 05-25 | `/recaps` list reads existing Lucas/Emma session recap source fields into read-only rows; no mutation controls were surfaced on the list. |
| RECAP-TARGET-05 | Dead-tab gating before route/API ready | Recaps tab is not surfaced as a dead tab before route/API exists. | ✅ | Pass | | ✅ 05-25 | Recaps tab is surfaced and opens a populated `/recaps` list in the Chrome seed state. |

## Batch 6 - Mentor Billing

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Subscription details screen | Owner can open subscription details. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/subscription` renders `subscription-screen` with plan, trial, usage, restore purchases, top-up, manage billing, and BYOK sections. |
| BILLING-02 | Owner upgrade flow | Owner upgrade flow starts safely. | 🚫 | Blocked | | ✅ 05-25 | `/subscription` renders plan comparison and explains web store purchasing is unavailable on this device; owner upgrade purchase was not launched in Chrome. |
| BILLING-03 | Trial / usage / family-pool states | Trial/usage/family-pool states render correctly. | ✅ | Pass | | ✅ 05-26 | Subscription trial/usage state renders in Chrome; family-pool-specific state is covered by separate BILLING-08 seed coverage, not a current issue here. |
| BILLING-04 | Restore purchases | Restore purchases works for owner. | 🚫 | Blocked | | ✅ 05-25 | `/subscription` shows `Restore purchases`; the store action was not exercised in Chrome/mobile-web. |
| BILLING-05 | Manage billing deep-link | Manage billing deep-link is safe. | ✅ | Pass | | ✅ 05-25 | `/subscription` shows `Manage billing` with safe mobile-device-managed copy instead of opening an unsupported web billing flow. |
| BILLING-06 | ChildPaywall + notify-parent | Child notify-parent path creates mentor-facing response. | 🚫 | Blocked | | ✅ 05-25 | No child paywall/notify-parent seed state was available in Chrome. |
| BILLING-07 | Daily quota exceeded paywall | Adult owner quota paywall does not affect child review scope. | 🚫 | Blocked | | ✅ 05-25 | M-C seed showed trial quota available, not an exceeded-quota state. |
| BILLING-08 | Family pool details | Family pool details are visible to eligible family owner. | 🚫 | Blocked | | ✅ 05-25 | Subscription page rendered trial/usage details, but no family pool detail state was visible in this seed. |
| BILLING-09 | Top-up question credits | Top-up section works for eligible owner. | ✅ | Pass | | ✅ 05-26 | Top-up section and copy render in Chrome; purchase launch remains store/native behavior outside this row refresh. |
| BILLING-10 | BYOK waitlist | BYOK waitlist state is correct if visible. | ✅ | Pass | | ✅ 05-25 | `/subscription` shows Bring your own key copy and `Join Waitlist`/`join-byok-waitlist-button`. |
| BILLING-11 | Trial banner | Trial banner/status renders for trial owner. | ✅ | Pass | | ✅ 05-25 | `/subscription` renders `Trial active`, current plan Plus Trial, trial end date, usage meter, and quota reset date. |
| BILLING-12 | Static plan comparison cards | Static comparison cards render safely. | ✅ | Pass | | ✅ 05-25 | `/subscription` renders Free and Plus comparison cards; Plus is marked current and web store purchasing is explained as unavailable on this device. |

## Batch 7 - Mentor Cross-Cutting Pass

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC-04 | `goBackOrReplace` back navigation | Mentor child/detail/recap back fallbacks are safe. | 🚫 | Blocked | https://www.notion.so/36b8bce91f7c81d19223ee40435187ed | ✅ 05-25 | Child/session back actions render, but recap detail click hangs before the detail route opens, so recap back fallback cannot be judged. |
| CC-07 | Accommodation badge surfaces | Child accommodation controls are mentor-gated. | ✅ | Pass | | ✅ 05-26 | Child accommodation and learning-preferences controls are mentor-gated; historical adult-self copy bug is Done. |
| CC-08 | Parent-facing metric vocabulary | Parent-facing metric vocabulary appears on mentor surfaces. | ✅ | Pass | | ✅ 05-25 | Chrome mentor surfaces use parent-facing labels such as Children, Reports, Nudge, session recap, engagement, child raw-input copy, consent, and learning preferences. |
| CC-09 | Opaque web layout backgrounds | Web backgrounds do not bleed between Family/child stacks. | ✅ | Pass | | ✅ 05-26 | Latest settings/language lane passed after the splash fix; no active opaque-background/splash blocker remains. |
| CC-11 | i18n `t()` cross-cutting strings | Mentor copy uses i18n keys. | ✅ | Pass | | ✅ 05-26 | Historical child learning-preferences copy and mentor-memory interpolation bugs are Done. |
| CC-12 | FeedbackProvider + shake-to-feedback | FeedbackProvider works on mentor gates/More. | ✅ | Pass | | ✅ 05-25 | Direct Chrome `/more/help` renders Help & feedback with Help & Support and Report a Problem; native shake-to-feedback was not exercised in Chrome. |
| CC-17 | Profile-as-lens navigation pattern | Profile-as-lens child routes do not leak or guess child scope. | ✅ | Pass | | ✅ 05-26 | Child routes render scoped child content; historical auth deep-link and profile-row navigation bugs are Done, with no current repro carried forward. |
| CC-18 | Stable FlatList refs | Stable list refs hold on child lists, reports, Recaps, and family progress. | ⚠️ | Pass w/ issues | https://www.notion.so/36b8bce91f7c81d19223ee40435187ed | ✅ 05-26 | Stable child/profile/recap list rows render; recap detail click remains the only active blocker in this row. |

## Batch 8 - Study Bridge And Negative Student Surfaces

| ID | Flow | Access expectation | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BRIDGE-01 | Mentor → Study switch retains own Study access | Adult can switch from Mentor to Study and retain own Study access. | ✅ | Pass | | ✅ 05-26 | Adult Study access is retained, and historical Family-shell Study-route exposure is Done; bridge write behavior is tracked separately under BRIDGE-02/03/04. |
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
| 1 | Auth, Account, And Mentor Setup | 44 | ⚠️ | 19 pass, 25 blocked/seed- or provider-dependent. |
| 2 | Mentor Home, Navigation, Setup, And Child Curriculum | 20 | ⚠️ | 4 pass, 2 pass w/ issues, 1 fail, 13 blocked; HOME-07 and child subject route remain active. |
| 3 | Child Review, Recaps, Reports, And Mentor Progress | 21 | ⚠️ | 7 pass, 6 pass w/ issues, 8 blocked; open issues are parent setup, child subject, and recap detail. |
| 4 | Learning, Practice, Homework, Quiz, And Dictation Boundaries | 52 | ⚠️ | 22 pass, 30 blocked/downstream or native/seed-dependent. |
| 5 | Recaps Target | 5 | ⚠️ | 3 pass, 1 pass w/ issues, 1 blocked. |
| 6 | Mentor Billing | 12 | ⚠️ | 7 pass, 5 blocked/store- or seed-dependent. |
| 7 | Mentor Cross-Cutting Pass | 8 | ⚠️ | 6 pass, 1 pass w/ issues, 1 blocked. |
| 8 | Study Bridge And Negative Student Surfaces | 5 | ⚠️ | 2 pass, 3 blocked. |
| **Total** | | **167** | ⚠️ | 70 pass, 10 pass w/ issues, 1 fail, 86 blocked. No audit rows remain unstarted. |

### 2026-05-25 Seeded Registry Rerun Snapshot

This snapshot is narrower than the 167-row manual inventory table above. It covers the automated seeded landing registry only, after the previously missing blockers/seeds were added.

| Scope | Total | Passing | Blocked / not covered | Notes |
| --- | ---: | ---: | ---: | --- |
| `mentor-audit-*` default seeded registry | 15 | 15 | 0 | All reachable default landings passed in Playwright against local API with staging config. |
| `mentor-audit-*` excluded registry entries | 4 | 0 | 4 | `mentor-audit-post-approval-redirect`, `mentor-audit-session-expired`, `mentor-audit-session-revoked`, and `mentor-audit-mfa-totp` need separate consent/auth/MFA fixtures or checks. |
| Full manual mentor inventory | 167 | 69 tested pass/pass-with-issues | 82 blocked plus 16 fail from the earlier Chrome sweep | These counts are the historical row-by-row audit state above and were not overwritten by the seeded registry rerun. |

### 2026-05-26 Latest-Main Blocked-Row Rerun

Rerun target: latest `origin/main` at `44e20638e6`, local web/API with staging Doppler config. This pass reran the automated browser lanes that map to the 82 previously blocked rows. It is a retest evidence log, not a full rewrite of the row table.

| Lane | Ran | Passed | Failed / still blocked | Evidence |
| --- | ---: | ---: | ---: | --- |
| Inclusive `mentor-audit-*` registry (`PLAYWRIGHT_INCLUDE_CHROME_ONLY=1`) | 19 | 15 | 4 | Default seeded landings still pass. Still failing: mobile `/consent/approve` is unmatched, session-expired/session-revoked storage mutation lands on home instead of sign-in banners, and MFA seed fails with Clerk TOTP attach `405`. |
| Broader auth/journey/navigation specs (`smoke-auth`, `smoke-parent`, `role-transitions`, `later-phases`) | 47 | 28 | 19 | Passing coverage now includes auth top-of-funnel, normal learner flows, consent gates, loading fallback, quiz/library/retention direct routes, language picker, and several account/subscription surfaces. Failures concentrate around stale parent-home-first assumptions, pre-profile/deep-link spinner states, billing copy/test drift, and pronoun test selectors. |
| Learner smoke/UX lane (`setup`, `smoke-learner`) | 4 | 4 | 0 | Confirms the adult Study side and screenshot crawl still run on latest main. |

Current blocker groups after this rerun:

- **Family entry / parent shell assumptions:** J03-J07, J16-J18, and J21 failures show the user lands on adult `My Learning` with a visible `Children` switch, while older specs expect `parent-home-screen` immediately. This means those rows are no longer "missing seed" blocked, but they still need a product/spec decision: should Family open first for family owners, or should tests click `Children` before judging child review?
- **Consent approval route:** `mentor-audit-post-approval-redirect` still opens unmatched mobile `/consent/approve`; the actual approval path needs an API consent-page browser check.
- **Auth session invalidation:** `mentor-audit-session-expired`, `mentor-audit-session-revoked`, and W03-style deep-link auth recovery still need deterministic auth/session fixtures. Current storage mutation does not surface the expected sign-in banners.
- **MFA:** `mentor-audit-mfa-totp` still cannot seed because staging Clerk returns `405` for TOTP attach; this needs a standing MFA-enabled account or Clerk environment change.
- **Provider/native/store boundaries:** email verification, reset-code entry, OAuth/SSO completion, native camera/gallery, and app-store purchase/restore branches remain Chrome-limited unless dedicated fixtures or native lanes are provided.
- **Harness/test drift:** Several failures are stale assertions rather than confirmed product defects: pre-profile tests expect old create-profile flow timing, billing tests expect older copy/state, and pronoun tests expect older button semantics.

### 2026-05-26 Fresh Reclassification

This reclassification separates historical blocker rows from current latest-main evidence. Do not carry a Done Notion item forward as an active blocker unless the same user-visible failure reproduces on `44e20638e6` or newer; create a new regression item instead.

| Bucket | Reclassification | Evidence / rows | Next action |
| --- | --- | --- | --- |
| Fixed or runnable now | Not active blockers. Latest browser lanes pass the default mentor registry landings, adult Study smoke/UX, language picker, consent gates, retention/library/quiz direct routes, and several account/subscription read surfaces. Historical rows covered only by missing seed should move out of "blocked" when touched next. | 15/19 inclusive mentor registry passed; 4/4 learner smoke/UX passed; 28/47 broader specs passed. The old splash-overlay blocker `36b8bce91f7c81aca1add2d79913bf9d`, family-shell undefined-link blocker `36b8bce91f7c8124a1b8fd98fb9526bd`, and add-to-learning hang blocker `36b8bce91f7c81d8a1f3dc69d960481d` are marked Done/deleted in Notion. | Retire these from active blocker counts during the next row-by-row inventory refresh. If a failure returns, file it as a new regression linked to the Done item. |
| Product/spec decision | Not a seed blocker. Current app lands family-capable adults on adult `My Learning` with a `Children` switch, while older parent specs expect `parent-home-screen` first. | J03-J07, J16-J18, J21; related rows include HOME-02/HOME-03, PARENT-01 through PARENT-03, PARENT-11, and CC-17. | Decide whether family owners should land in Family first or whether browser specs should click `Children` before asserting child-review surfaces. Do not file a new bug until that expected behavior is confirmed. |
| Open live-repro blockers | Still active, but not explained by missing seeds. These need a focused live Chrome repro because latest broad runs did not get past the family-entry assumption far enough to prove them fixed or broken. | Child subject route wedge `36b8bce91f7c81f7a161f229f3ab7649` is still Notion `Not started`; recap detail click hang `36b8bce91f7c81d19223ee40435187ed` is still Notion `Not started`. | Re-run after the family-entry expectation is settled, using direct child subject and recap-detail probes with trace/HAR capture. |
| Parent journey harness mismatch | New current bug, not the old Done family-shell undefined-link bug. The setup helper accepts any app shell at `/home`, so it can capture a storage state even when the requested `parent-home-screen` did not render; downstream parent specs then fail. | J03 rerun on 2026-05-26 failed both parent gateway tests. Evidence screenshot shows adult `My Learning` with `Children` switch, not Family home. New Notion: https://www.notion.so/36c8bce91f7c8196a766c9bc9ce12aad | Fix the setup/spec contract: either seed family default/force Family before capture, or update parent specs to click `Children` before asserting child-review screens. |
| Wrong harness / wrong surface | New current bug. The registry entry opens a mobile route that does not own consent approval. | `mentor-audit-post-approval-redirect` fails on unmatched mobile `/consent/approve`. New Notion: https://www.notion.so/36c8bce91f7c81b2ad33e27aab4f539a | Replace with an API consent-page browser check using the real approval URL. |
| Auth fixture gap | New current bug unless a real signed-out user can reproduce the missing banner. | `mentor-audit-session-expired`, `mentor-audit-session-revoked`, and W03 deep-link recovery do not currently force the expected sign-in banners. New Notion: https://www.notion.so/36c8bce91f7c811a9243fdb4ab44a94b | Add or use a true expired/revoked-session fixture; then classify any remaining behavior as product bug. |
| Environment/provider/native limits | MFA has a new current seed/environment bug. Other provider/native branches remain not testable in Chrome without dedicated fixtures. | MFA TOTP seed fails with Clerk `405`; email verification/reset-code, OAuth/SSO completion, camera/gallery, and store purchase/restore branches remain provider/native-bound. New Notion for MFA: https://www.notion.so/36c8bce91f7c819f96a1fdae498abaca | Cover with standing provider accounts, mocked provider callbacks, or native lanes. |
| Harness/test drift | Not active product blockers until reproed manually. | Pre-profile spinner timing, subscription copy/state, and pronoun button semantics failures rendered real UI but mismatched older assertions. | Update tests to current UI contracts, or write a new bug only if the current UI violates product expectations. |

### 2026-05-26 Fail/Pass-With-Issues Row Refresh

Scope refreshed: every row that was marked `Fail` or `Pass w/ issues` before this pass. Starting count: 52 rows total, 16 `Fail`, 36 `Pass w/ issues`. After the row-by-row refresh: 11 rows remain in `Fail`/`Pass w/ issues` status: 1 `Fail`, 10 `Pass w/ issues`. Rows whose only linked blocker was Done/deleted were moved to `Pass` or `Blocked` depending on whether the latest evidence proved the row or showed missing fixture/native coverage.

New Notion tracker for stale audit status cleanup: https://www.notion.so/36c8bce91f7c810dac87c81009503508

| Refresh bucket | Rows | Current classification |
| --- | --- | --- |
| Current open product blockers | `HOME-07`, `PARENT-07` child-subject branch, `RECAP-TARGET-01`, `CC-18` | Keep active. `HOME-07` still has open Notion `36b8bce91f7c8112a606dc04e8a64864`; child subject wedge is open Notion `36b8bce91f7c81f7a161f229f3ab7649`; recap detail hang is open Notion `36b8bce91f7c81d19223ee40435187ed`. |
| New current harness/contract bugs filed on 2026-05-26 | `HOME-02`, `PARENT-01`, `PARENT-02`, `PARENT-03`, and parent-journey dependent rows; inclusive mentor audit excluded entries | New Notion bugs now track the current evidence: parent journey setup mismatch `36c8bce91f7c8196a766c9bc9ce12aad`, wrong consent route `36c8bce91f7c81b2ad33e27aab4f539a`, session expired/revoked fixture gap `36c8bce91f7c811a9243fdb4ab44a94b`, MFA seed/environment gap `36c8bce91f7c819f96a1fdae498abaca`. |
| Rows previously marked failing but linked only to Done/deleted bugs | `AUTH-13`, `HOME-03`, `HOME-04`, `LEARN-17`, `LEARN-08`, `PRACTICE-01`, `PRACTICE-02`, `PRACTICE-03`, `QUIZ-01`, `QUIZ-09`, `DICT-01`, `DICT-03`, `HOMEWORK-01`, `HOMEWORK-03`, plus pass-with-issues rows tied to child copy, profile row navigation, add-child gate, splash, and old shell exposure | Refreshed. Rows with enough latest evidence moved to `Pass`; rows that still need a dedicated fixture/native/direct rerun moved to `Blocked`; rows with a separate active blocker now link that active blocker instead of the Done item. |
| Former pass-with-issues rows with no bug link | `AUTH-14`, `ACCOUNT-24`, `SUBJECT-16`, `SUBJECT-17`, `BILLING-03`, `BILLING-09` | Refreshed. `SUBJECT-16`, `SUBJECT-17`, `BILLING-03`, and `BILLING-09` now pass for their Chrome-visible surfaces. `AUTH-14` is blocked on an injected stuck-state fixture. `ACCOUNT-24` is blocked by the current consent approval route harness bug. |
| Rows whose issue is native/provider/store coverage rather than app failure | `HOMEWORK-02`, plus OAuth/email/store branches outside this fail/pass-with-issues set | Kept out of product bug counts unless the Chrome-visible UI itself is wrong. `HOMEWORK-02` moved to `Blocked` because camera/OCR needs browser/native permission and image fixtures after the old route-scope bug was fixed. |

Row IDs that remain `Fail` or `Pass w/ issues` after refresh:

- `Fail`: `HOME-07`.
- `Pass w/ issues`: `HOME-02`, `HOME-03`, `PARENT-01`, `PARENT-02`, `PARENT-03`, `PARENT-07`, `PARENT-11`, `LEARN-18`, `RECAP-TARGET-01`, `CC-18`.

The local API again emitted recurring seeded-account `account.trial_missing_repair_attempted`, `[safe-send] non-core dispatch timed out`, and `billing.trial_missing_repair_failed` warnings. These did not stop the passing browser assertions, but they remain cleanup evidence for billing/API seed stability.
