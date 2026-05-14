# Mobile App Flow Revision Plan — 2026-05-01

Source inventory: [`mobile-app-flow-inventory.md`](../mobile-app-flow-inventory.md) (snapshot refreshed 2026-05-14). Companion E2E gap audit: [`e2e-flow-coverage-audit-2026-05-13.md`](../e2e-flow-coverage-audit-2026-05-13.md).

**Reset 2026-05-14:** all batch rows are marked not yet tested (`⬜`) so the flow revision can restart from the current inventory and E2E audit. Previous pass/fail/blocker notes were stale relative to the current More-tab route shape and E2E coverage audit.

## Purpose

Walk every flow in the inventory, log defects in the Notion Bug Tracker, and update the inventory document where descriptions have drifted. **Total scope: 184 numbered items across 13 sections + an open-ended discovery register for flows missing from the inventory** (154 in the original 2026-04-19 sweep + 30 added 2026-05-04 from the inventory refresh).

## Operating Instructions (read before starting any batch)

This plan is meant to be executable by either the human owner or an agent running unattended. Follow these instructions verbatim; they're the difference between a plan and a checklist.

### 0. Pre-flight (once, before Batch 1)

1. **Branch & build:** test on the latest `staging` build or whatever branch is explicitly named when the batch is started. Do NOT switch branches mid-batch.
2. **Environment:** mobile dev client points at staging API; web preview via `pnpm exec nx serve mobile` (auth-walled past sign-in). Note the build SHA in the **Notes** column of the first row tested.
3. **Doppler scope:** all secret reads use `"C:\Tools\doppler\doppler.exe" -- ...` with project=mentomate (auto-resolved from repo `.doppler.yaml`).
4. **Test devices:** primary = Galaxy S10e emulator (5.8" — small-screen sweep is part of every batch). Secondary = web preview for CC-09 verification.
5. **Account slots:** create the persona slots from the *Test Account / Environment Inventory* table below before the batches that need them. Do NOT improvise accounts mid-batch — the slot table is the contract.

### 1. Per-flow procedure (repeat for each row)

For every row in a batch, do this loop. It takes 2–10 minutes per flow.

1. **Read** the inventory row for that ID in [`mobile-app-flow-inventory.md`](../mobile-app-flow-inventory.md). The "Primary routes / entry points" column is your spec.
2. **Set status to 🔄** in the plan's batch table (mark the row in progress).
3. **Walk** the flow end-to-end in the app. Touch every documented entry point and every documented branch. Take a screenshot of any unexpected state.
4. **Compare** observed behaviour against the inventory description. Three things to watch for:
   - **Defect** → flow doesn't behave as described, or behaves but is broken/confusing/dead-ends.
   - **Drift** → flow works, but the inventory description is now wrong (route changed, testID renamed, branch removed, new branch added).
   - **Discovery** → adjacent flow you encountered that is not in the inventory at all.
5. **Classify the result** using the Result Column Convention below.
6. **Record** results in three places (in this order):
   1. **File bugs in Notion** for every defect (see Section 2).
   2. **Edit the inventory** for every drift/discovery (see Section 3).
   3. **Update this plan's row** with the final status, result, bug URLs, and a one-line note.
7. **Move on.** Don't try to fix anything during testing — you are a tester in this exercise, not a developer. Defects belong in Notion, not in code edits.

### 2. Filing bugs in Notion

**Where:** MentoMate Bug Tracker, database ID `b8ce802f-1126-4a2f-a123-be5f888cbb23`.

**How:** prefer the `/notion` skill if available. Otherwise hit the REST API:

```bash
NOTION_API_KEY="$('C:/Tools/doppler/doppler.exe' secrets get NOTION_API_KEY --plain)"
curl -X POST https://api.notion.com/v1/pages \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{ "parent": {"database_id": "b8ce802f-1126-4a2f-a123-be5f888cbb23"}, "properties": {...} }'
```

**Required fields per bug:**

| Field | Value | Notes |
| --- | --- | --- |
| Bug (title) | `[FLOW-ID] short imperative summary` | e.g. `[QUIZ-05] Mid-round quit confirm dialog dismisses on outside tap` |
| Status | `Not started` | Property type is `status` not `select` — payload must be `{"status": {"name": "Not started"}}` |
| Priority | `P0`/`P1`/`P2`/`P3` | See severity guide below |
| Platform | one or more of `API` / `Mobile-iOS` / `Mobile-Android` / `Packages` / `CI` | Multi-select |
| Found In | `flow-revision-2026-05-01 / Batch N / FLOW-ID` | Free text — makes `git log --grep` and Notion search useful |
| Reported | today's date | |

**Body content (one bug = one Notion page body):**

- **Repro steps** — numbered list, observable preconditions first.
- **Expected** — what the inventory or product spec says should happen.
- **Actual** — what you observed.
- **Screenshot/recording** — attach via Screenshots property (REST file upload) or paste URL if hosted.
- **Build/SHA + device** — copy from your pre-flight notes.

**Severity guide (Priority field):**

| Priority | Use when |
| --- | --- |
| P0 | Crash, data loss, security/privacy leak, billing wrong, consent gate bypassed |
| P1 | Flow blocked or unusable for a primary persona; back button dead-ends; key feature broken |
| P2 | Flow works but UX is degraded; copy wrong; layout broken on small screen |
| P3 | Cosmetic, polish, nice-to-have |

**Multiple bugs per flow:** file separately. One bug = one fix in code. Do NOT bundle two unrelated defects into a single Notion page. Paste all bug URLs into the row's **Bugs** column, comma-separated.

**Existing bugs:** before filing, search Notion (REST `databases/{id}/query` with a title or Found-In filter) to avoid duplicates. If the bug already exists and matches, link to it instead of filing a new one. See `feedback_notion_resolution_recording.md` — never reopen a Done bug; file a new one and link.

### 3. Updating the inventory

The inventory document is a deliverable of this exercise. Edit it inline whenever testing reveals drift.

**When to edit `mobile-app-flow-inventory.md`:**

- Route in "Primary routes / entry points" no longer matches the file tree → update the path.
- TestID in description was renamed → update or remove.
- A documented branch (e.g. "Surprise me path") no longer exists → mark it Removed in the row and note the date.
- A new branch was added that the description doesn't cover → expand the description.
- A whole row's Coverage status changed (a Maestro flow was added/removed) → update the Coverage column.
- Section heading bullets ("What changed since…") need a new entry covering this revision sweep — add one at the top once Batch 18 is complete.

**Edit discipline:**

- Keep the table structure intact. Don't reorder rows mid-revision.
- Preserve existing IDs. If a flow is dead, mark it `(removed 2026-05-NN)` rather than deleting the row.
- After editing, tick the **Doc Updated** column in this plan with the date (e.g. `✅ 05-03`).

**Discovered flows:**

If you find a flow not in the inventory, do BOTH:

1. Add a row in the **Discovered Flows** register at the bottom of this plan with a temporary `DISC-NN` ID.
2. Open `mobile-app-flow-inventory.md` and append a row to the most appropriate section table with a real ID (next free in that section's number range). Cross-reference the temp ID in the Discovered table once assigned.

### 4. Edge cases and how to record them

| Situation | Status | Result | Action |
| --- | --- | --- | --- |
| Need an account/state I don't have, can't create from current persona | 🚫 | `Blocked` | Note what's missing in the row; flag in batch summary; do not skip — return after setup |
| Flow exists but Apple/Google store gating prevents purchase test | 🚫 | `Blocked` | Document partial coverage in Notes; mark Blocked; revisit after store enrolment |
| Flow described in inventory has been removed from the app | ➖ | `Removed` | Edit inventory to mark removed; tick Doc Updated; no bug needed |
| Flow works but inventory description is wrong | ✅ or ⚠️ | `Pass` | Edit inventory; tick Doc Updated; no bug needed (drift, not defect) |
| Flow partly works, one branch broken | ⚠️ | `Pass w/ issues` | File bug for the broken branch; mark plan row ⚠️ |
| Critical defect blocks rest of batch | ❌ | `Fail` | File P0/P1 bug; stop batch; record block in batch summary; resume after fix or move to next independent batch |

### 5. Commit & push cadence

- Commit after each batch is fully tested. Message: `chore(flows): batch N revision results [flow-revision-2026-05-01]`.
- The plan file and the inventory file should be committed together — never one without the other.
- Push immediately so progress is visible to the user. (Per `feedback_*` workflow rules: commit early, push after every commit.)
- Do NOT open a PR for these doc edits unless explicitly asked — direct commits to the working branch.

### 6. Status Legend

| Symbol | Meaning |
| --- | --- |
| ⬜ | Not yet tested |
| 🔄 | Testing in progress |
| ✅ | Pass — flow works as described |
| ⚠️ | Pass with minor issues — bugs filed, no blocker |
| ❌ | Fail — flow broken or significantly off-spec |
| 🚫 | Blocked — cannot test (account, env, store gating, etc.) |
| ➖ | N/A — flow no longer exists or is intentionally deferred |

### 7. Result Column Convention

`Result` is `—` until tested, then one of: `Pass`, `Pass w/ issues`, `Fail`, `Blocked`, `Removed`.

## Test Account / Environment Inventory

These are the personas this plan needs. Set up before Batch 1 to avoid mid-flight account creation.

| Slot | Persona | Notes |
| --- | --- | --- |
| A | Fresh email, never signed in | Used and burned in Batch 1 (signup) |
| B | Adult learner (18+), Free plan, no subjects yet | Created in Batch 2 |
| C | Adult learner with 2+ subjects, mixed retention state | Promoted from B after Batch 3 |
| D | Underage learner profile (11–13) needing parent consent | Batch 2 / consent variants |
| E | Underage learner (14–15, GDPR variant) | Batch 2 |
| F | Parent owner, Family plan, 0 children | Batch 14 (HOME-07) |
| G | Parent owner, Family plan, 1 child | Batch 14 → 15 |
| H | Parent owner, Family plan, 2+ children | Batch 15 (multi-child) |
| I | Account on Plus/Pro plan with active trial | Batch 16 |
| J | Account hitting free daily-quota cap | Batch 16 |
| K | Account scheduled for deletion (7-day grace) | Batch 13 |

## Cross-Cutting Observation Rules

Watch for these in **every** batch and file bugs as encountered. They do not need their own session.

- **CC-04** `goBackOrReplace`: every back button must navigate somewhere sensible (no dead-ends, no fall-through to Home from a deep link).
- **CC-09** Opaque web backgrounds: on web preview, no screen bleed-through between stacked navigators.
- **CC-03** Animation polish: icon transitions, intent card press, celebrations should feel responsive — not janky or missing.

A final pass to confirm coverage of these is captured in **Batch 17**.

---

## Batch 1 — Pre-Auth & Auth Entry

**State required:** No active session. Slot A (fresh email) ready. Run on a clean dev client.
**Estimated time:** 45–60 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-04 | Animated splash and initial shell | 🚫 | Blocked | | | Dev-client overlay covers the splash before Maestro can observe it; requires production APK. Web smoke (2026-05-14): splash clears to sign-in by ~10s ✅. |
| AUTH-01 | App launch and auth gate | ✅ | Pass | | | 2026-05-14 Galaxy S10e emulator/dev-client: launch reaches sign-in gate with Google SSO, email, password, and Sign in CTA. Also confirmed on web preview. |
| AUTH-12 | First-time vs returning sign-in copy | ✅ | Pass | | | Clean launch shows first-time copy (`Welcome to MentoMate` / `sign-in-welcome-first-time`), not returning-user copy. |
| AUTH-07 | Auth screen navigation (sign-in ↔ sign-up ↔ forgot) | ❌ | Fail | https://www.notion.so/3558bce91f7c811cbe38d45d3181c47a | | Sign-in to sign-up works, but the sign-up screen's return-to-sign-in link is not visible/reachable after scrolling to the primary CTA on the small emulator. Web smoke passed navigation. |
| AUTH-02 | Sign up with email and password | 🚫 | Blocked | | | Sign-up fields and Create account CTA are reachable with normal field-to-field taps, but Clerk dev email quota is exhausted (`monthly limit for email messages in development (100)`), so completion is blocked by environment. Web smoke: form + Clerk submit reached, full creation not exercised. |
| AUTH-03 | Sign-up email verification code | 🚫 | Blocked | | | Blocked by Clerk dev email quota while submitting AUTH-02; verification-code screen did not appear. Web smoke did not reach this stage either. |
| AUTH-04 | Sign in with email and password | ✅ | Pass | | | Seeded-user sign-in succeeds with literal credentials and normal field-to-field taps, reaching the expected consent-pending gate. |
| AUTH-05 | Additional sign-in verification (email/phone/TOTP) | 🚫 | Blocked | | | Required MFA seed scenarios do not exist yet (`mfa-email-code`, `mfa-phone`, `mfa-totp`, backup-code). |
| AUTH-06 | Forgot password and reset password | 🚫 | Blocked | | | Forgot-password screen renders, email entry works, and Send reset code is tappable, but Clerk dev email quota blocks reset-code delivery with the same monthly-limit error as sign-up. Web smoke: screen reachable + back nav works; reset-code completion not exercised. |
| AUTH-08 | OAuth sign in / sign up (Google, Apple, OpenAI) | ✅ | Pass | | | Android/dev-client: Google SSO button renders and is tappable; OpenAI absent but optional. Web smoke: Google button renders, happy path blocked in web preview. |
| AUTH-09 | SSO callback completion + fallback | 🚫 | Blocked | https://www.notion.so/3608bce91f7c81cab6c8d96cea8e5b7b | | Airplane-mode broadcast blocked on this emulator (`Permission Denial`); after the failed SSO attempt, dev-client also hit a WebBrowser cleanup crash. |
| HOME-05 | Empty first-user state | ✅ | Pass | | ✅ 05-14 | Seeded `onboarding-no-subject` reaches learner home; current CTA is `home-action-study-new` and opens create-subject. Inventory updated for testID drift. |
| AUTH-13 | Deep-link auth redirect preservation (BUG-530) | 🚫 | Blocked | | | Inventory notes this is code-only because ADB deep-link is unreliable on Maestro 2.2.0; no reliable end-user harness available in this pass. |
| AUTH-14 | Sign-in transition spinner + stuck-state recovery | 🚫 | Blocked | | | Requires controlled slow-network / auth-layout timeout simulation; no reliable end-user harness available in this pass. |

---

## Batch 2 — First Profile + Consent Variants

**State required:** Slot A signed in but no profile yet. Will exercise consent age branches; needs to register profiles with different birth years (Slots D, E).
**Estimated time:** 60–90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-01 | Create first profile | ⚠️ | Blocked | | | 2026-05-14: `flow-review` dev-client startup against local Metro 8083 fails before app UI loads (`SocketTimeoutException`, then dev-launcher ANR). Not marked product failure. |
| SUBJECT-08 | Language learning setup | ⚠️ | Blocked | | | 2026-05-14: blocked by same `flow-review` dev-client startup failure before app UI loads; language setup could not be reached from end-user path. |
| ACCOUNT-19 | Consent request during underage profile creation | ⚠️ | Blocked | | | 2026-05-14: blocked by same pre-profile startup/harness failure before profile creation form could be exercised on `flow-review`. |
| ACCOUNT-20 | Child handoff to parent consent request | ⚠️ | Blocked | | | 2026-05-14: blocked by same pre-profile startup/harness failure before underage consent handoff could be reached on `flow-review`. |
| ACCOUNT-21 | Parent email entry, send / resend / change email | ✅ | Pass | | | 2026-05-14: seeded pending-consent user showed parent email, resend, change-email, and check-again controls; change-email submit returned to pending gate. |
| ACCOUNT-22 | Consent pending gate | ✅ | Pass | | | 2026-05-14: seeded `consent-pending` user signs in to `consent-pending-gate`; check-again, resend, change-email, preview controls, and sign-out are present. Current heading is `Hang tight!`. |
| ACCOUNT-23 | Consent withdrawn gate | ✅ | Pass | | | 2026-05-14: seeded `consent-withdrawn-solo` user signs in to `consent-withdrawn-gate`; `Your account is being closed` copy and `withdrawn-sign-out` are visible. |
| ACCOUNT-24 | Post-approval landing | ⚠️ | Blocked | | | 2026-05-14: blocked by `flow-review` dev-client startup failure before a post-approval seeded path could be exercised. |
| ACCOUNT-26 | Regional consent variants (COPPA / GDPR / above threshold) | ⚠️ | Blocked | | | 2026-05-14: stock COPPA/GDPR/above-threshold Maestro flows are currently fragile on this emulator due Back-key sign-in steps; literal-credential rerun was then blocked by `flow-review` dev-client startup failure. |
| ACCOUNT-27 | Parent consent deny confirmation | ⚠️ | Blocked | | | 2026-05-14: mobile inventory row points at a server-rendered consent-web confirmation, not an in-app mobile screen; no end-user mobile path exercised in this pass. |
| SUBJECT-16 | Conversation-language picker (mandatory, profile-wide) | ⚠️ | Blocked | | | 2026-05-14: inventory points at `e2e/flows/onboarding/onboarding-fast-path-language.yaml`; reachable route could not be exercised because `flow-review` dev-client startup failed. |
| SUBJECT-17 | Pronouns picker (preset + free-text Other) | ⚠️ | Blocked | | | 2026-05-14: inventory notes partial fast-path coverage but no dedicated current pronouns YAML; reachable route could not be exercised because `flow-review` dev-client startup failed. |

---

## Batch 3 — Subject Onboarding (Adult Learner)

**State required:** Slot B (adult learner, no subjects).
**Estimated time:** 60–90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SUBJECT-01 | Create subject from learner home | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-05 | Subject resolution + clarification suggestions | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-06 | Broad subject → pick a book | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-07 | Focused subject / focused-book flow | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-09 | Interview onboarding | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-10 | Analogy-preference onboarding | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-11 | Curriculum review | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-12 | View curriculum without committing | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-13 | Challenge curriculum (skip / add / explain ordering) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-14 | Placement / knowledge assessment | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-15 | Accommodation-mode onboarding (FR255) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-18 | Interests-context picker (free-time / school / both) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 4 — Learner Home, Intent Cards, Resume

**State required:** Slot C (adult learner with subjects, partially-completed session).
**Estimated time:** 30–45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home redesigned carousel + quick actions | ⚠️ | Pass w/ issues | | | 2026-05-14 Playwright `smoke-learner`: seeded learner reaches `learner-screen` and Study/Homework/Practice actions render. Existing screenshot crawl captures too early unless it waits for the splash overlay to clear, so visual evidence needs a wait-hardened rerun. |
| HOME-06 | Resume interrupted session (Continue card) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| HOME-08 | Home loading-timeout fallback (10s) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-04 | Profile switching | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-06 | More hub + nested Account/Profile, Privacy & Data, Notifications, Learning preferences, Accommodation, Help | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-05 | Continue-where-you-left-off (recovery marker vs API) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 5 — Core Learning Sessions (Tutoring + Chat)

**State required:** Slot C with at least one subject + voice/mic permissions granted. Plan ~2 full live sessions in different modes.
**Estimated time:** 90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-01 | Freeform chat (Ask intent card) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-02 | Guided learning session from subject/topic | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-03 | First session experience | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-04 | Core learning loop | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-05 | Coach bubble visual variants (light/dark) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-06 | Voice input + voice-speed controls | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-07 | Session summary (submit / skip) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-02 | Create subject from library empty state | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-03 | Create subject from chat (classifier miss) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-01 | Conversation-stage chips + feedback gating | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-02 | Greeting-aware subject classification | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-23 | Read-only session transcript view (BUG-889) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 6 — Library, Books, Topics

**State required:** Slot C with several subjects (broad + focused) and at least one book.
**Estimated time:** 30–45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-08 | Library root (shelves / books / topics tabs) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-09 | Subject shelf → book selection | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-10 | Book detail + start learning from book | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-11 | Manage subject status (active / paused / archived) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-12 | Topic detail | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-18 | Subject analogy preference after setup | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-25 | Library inline search (PR #144) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 7 — Retention & Recall

**State required:** Slot C with overdue topics (force-age data via dev tools or wait).
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-13 | Recall check | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-14 | Failed recall remediation | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-15 | Relearn flow (same / different method) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-16 | Retention review (library + retention surfaces) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 8 — Progress, Milestones, Vocabulary

**State required:** Slot C with multi-day learning history (streak ≥ 2, ≥ 1 milestone unlocked, ≥ 1 language subject for vocab).
**Estimated time:** 30 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-17 | Progress overview tab | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-18 | Subject progress detail | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-19 | Streak display | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-20 | Milestones list | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-21 | Cross-subject vocabulary browser | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-22 | Per-subject vocabulary list (delete + CEFR/word badges) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| LEARN-24 | Saved bookmarks screen (`/(app)/progress/saved`) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 9 — Practice Hub & Quiz

**State required:** Slot C. For PRACTICE-04, needs a profile with no overdue topics. For QUIZ-08, needs Slot J (quota-capped) at end of batch.
**Estimated time:** 90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PRACTICE-01 | Practice hub menu | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PRACTICE-02 | Review topics shortcut | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PRACTICE-03 | Recitation session | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PRACTICE-04 | "All caught up" empty state with countdown | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-01 | Quiz activity picker (Capitals / Vocab / Guess Who) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-02 | Round generation loading + 20s "still trying" hint | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-03 | Round play — multiple choice | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-04 | Round play — Guess Who clue reveal | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-05 | Mid-round quit with confirm | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-06 | Round complete error retry | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-07 | Results screen (celebration tier + soft-fail streak) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-08 | Quota / consent / forbidden typed errors | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-09 | Quiz history (grouping + empty state) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-10 | Quiz round detail (per-question review) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-10 | Soft-fail side effects on completion | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-11 | Malformed-round guard (BUG-812 / F-015) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-12 | Wrong-answer dispute affordance (BUG-469 / BUG-927) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QUIZ-13 | Answer-check failure inline warning (IMP-7 / BUG-799) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 10 — Dictation

**State required:** Slot C with an active language subject (target language sentences). Camera permission for DICT-07.
**Estimated time:** 60 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| DICT-01 | Choice screen (text vs surprise) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| DICT-02 | OCR text preview + edit (homework path) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| DICT-03 | "Surprise me" LLM-generated dictation | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| DICT-04 | Playback (TTS, pace, punctuation, repeat, tap-pause) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| DICT-05 | Mid-dictation exit confirm dialog | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| DICT-06 | Completion screen | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| DICT-07 | Photo review of handwritten dictation (vision LLM) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| DICT-08 | Sentence-level remediation | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| DICT-09 | Perfect-score celebration | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| DICT-10 | Recording dictation result + retry | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 11 — Homework

**State required:** Slot C, camera + gallery permissions. Have a printed/written page handy.
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOMEWORK-01 | Start homework from home / More | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| HOMEWORK-02 | Camera permission, capture, preview, OCR | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| HOMEWORK-03 | Manual fallback when OCR is weak | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| HOMEWORK-04 | Homework session multi-problem nav | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| HOMEWORK-05 | Gallery import | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| HOMEWORK-06 | Image pass-through to multimodal LLM | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| SUBJECT-04 | Create subject from homework branch | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| HOMEWORK-07 | Camera permission onboarding (two-state + Settings redirect) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 12 — Account, Settings, Mentor Memory, Sign-out

**State required:** Slot C signed in.
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-07 | Notifications sub-screen: push notifications + weekly digest toggles | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-08 | Learning preferences -> Accommodation mode + celebration-level preferences | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-09 | Account/Profile sub-screen: change password | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-10 | Privacy & Data sub-screen: export my data | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-13 | Privacy policy | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-14 | Terms of service | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-15 | Self mentor memory | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| AUTH-10 | Sign out | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| AUTH-11 | Session-expired forced sign-out | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-28 | Account/Profile sub-screen: app language bottom-sheet edit | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-29 | More mentor-language row opens Account/Profile; no distinct tutor-language save flow currently exists | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 13 — Account Deletion Lifecycle

**State required:** Slot K (account that can be safely deleted). Run last among the learner batches because it terminates the session.
**Estimated time:** 20 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-11 | Privacy & Data sub-screen: delete account typed-confirmation flow with 7-day grace | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-12 | Scheduled deletion state: keep account / cancel deletion | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 14 — Parent Setup, Adding Children, Family Gating

**State required:** Slot E (parent owner, Family plan, 0 children → added Timmy age 12).
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-07 | Add-first-child gate | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-02 | Create additional profile (generic) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-03 | Add child profile from More / Profiles | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-05 | Family-plan + max-profile gating | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-25 | Parent consent management for a child | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-16 | Child mentor memory | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-17 | Child memory consent prompt | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| ACCOUNT-30 | Impersonated-child guard across More hub, Account/Profile, and Privacy & Data | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 15 — Parent Dashboard & Drill-Downs

**State required:** Slot E (parent, 1 child Timmy, no learning history yet).
**Estimated time:** 75 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-02 | Parent gateway home | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| HOME-03 | Parent tabs and parent-mode navigation | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-01 | Parent dashboard (live + demo) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-02 | Multi-child dashboard | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-03 | Child detail drill-down | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-04 | Child subject → topic drill-down | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-05 | Child session / transcript drill-down | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-06 | Child monthly reports list + report detail | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-07 | Parent library view | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-08 | Subject raw-input audit | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-09 | Guided label tooltip | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-10 | Child-topic "Understanding" card + gated retention | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-11 | Child-session recap (narrative + clipboard + chip) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-12 | Child-subject detail retention badges (data-gated) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-07 | Accommodation badge surfaces | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-08 | Parent-facing metric vocabulary canon | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| PARENT-13 | Child weekly report detail (push-driven) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 16 — Billing & Monetization

**State required:** Slot I (trialing) for upgrade flows; Slot J (quota-capped) for paywall; Slot G child profile for child paywall. RevenueCat sandbox account on device.
**Estimated time:** 60 min. **Risk:** Apple/Google store gating — some flows may be 🚫 Blocked.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Account/Profile -> Subscription: current-plan details | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-02 | Account/Profile -> Subscription: upgrade purchase + webhook polling | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-03 | Account/Profile -> Subscription: trial, plan usage, family-pool states | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-04 | Account/Profile -> Subscription: restore purchases | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-05 | Account/Profile -> Subscription: manage billing deep link | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-06 | Child entitlement paywall + notify-parent; no visible child More subscription row | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-07 | Daily quota exceeded paywall | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-08 | Account/Profile -> Subscription: family-pool visibility | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-09 | Top-up question credits | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-10 | BYOK waitlist | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-06 | Top-up purchase confidence (two-stage polling) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-11 | Account/Profile -> Subscription: trial banner/status UI (BUG-966) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| BILLING-12 | Account/Profile -> Subscription: Pro / Family static tier comparison cards (BUG-917) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 17 — Cross-Cutting Final Pass

**State required:** Web preview + native (Galaxy S10e). This is a *visual / behavioural* sweep across screens already tested in earlier batches; only file new bugs if not already caught.
**Estimated time:** 30 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CC-03 | Animation polish (icon, intent cards, celebrations) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-04 | `goBackOrReplace` on every back button | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-09 | Opaque web layout backgrounds | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-11 | i18n / `t()` cross-cutting string layer | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-12 | FeedbackProvider + shake-to-feedback on gate screens | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-13 | Streaming error classification + stream-fallback guard | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-14 | Envelope-strip render guard at chat-bubble boundary (BUG-941) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-15 | RN Web stale-send block in ChatShell (BUG-886) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-16 | HMR-safe error type guards (BUG-947) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-17 | Profile-as-lens navigation pattern | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| CC-18 | Stable FlatList refs (PERF-10) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Batch 18 — Regression Smoke Set

**State required:** Slot C; some flows have specific reproduction states embedded in the YAML.
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| QA-01 | Quick smoke check | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-02 | Post-auth comprehensive smoke | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-03 | Chat classifier regression (easter / suggestion) | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-04 | Chat subject picker regression | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-05 | Return to chat after creating a subject | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-06 | Focused-book generation regression | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-07 | Tab-bar leak regression | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-08 | Parent add-child regression | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-09 | Consent email URL regression | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-10 | Dictation full flow regression | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-11 | Quiz full flow regression | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |
| QA-12 | Consent deny-confirmation regression | ⚠️ | Blocked | Notion startup blocker |  | 2026-05-14: blocked by `flow-review` dev-client startup failure before app UI loads (`SocketTimeoutException` / dev-launcher ANR); no end-user screen reachable in this pass. See https://www.notion.so/3608bce91f7c81249e50cfe775cebd3f. |

---

## Discovered Flows (Not in Inventory)

If a flow is found in the app but is missing from `mobile-app-flow-inventory.md`, add it here AND in the inventory in the same edit. Use a temporary ID `DISC-NN` until the inventory assigns a real ID.

| Temp ID | Flow | Found in batch | Routes / entry points | Inventory updated | Notes |
| --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | |

### Likely candidates to look for during testing

The 2026-04-19 inventory snapshot pre-dates several branches. Be alert for:

- Notion bug-fix branch work on `notion-bugfix-2026-04-30` — recent Found-In tags may point at flows that were not catalogued.
- New screens under `apps/mobile/src/app/(app)` that are not referenced anywhere in the inventory tables.
- New `_components/` or `_hooks/` siblings that signal new feature surfaces.
- Any screen with testIDs not mentioned in the inventory.

Quick sanity check before each batch: `git log --since="2026-04-19" --name-only --pretty=format: -- apps/mobile/src/app/ | sort -u` to spot files added since the snapshot.

---

## Master Roll-Up

Update this once a batch is complete to track overall progress.

| Batch | Section | Items | Status | Notes |
| --- | --- | --- | --- | --- |
| 1  | Pre-auth & Auth          | 14 | ❌ | Device (S10e, 2026-05-14): 5 pass, 1 fail, 8 blocked. Main blockers: Clerk dev email quota for email-code flows, MFA/deep-link/slow-network harness gaps, production APK needed for splash. Web smoke: 3 pass, 2 pass-w-issues, 2 blocked. |
| 2  | First Profile + Consent  | 12 | ⚠️ | 3 pass, 9 blocked on 2026-05-14 Galaxy S10e emulator/dev-client. Main blocker: `flow-review` local dev-client bundle/startup fails before app UI (`SocketTimeoutException`, dev-launcher ANR); existing pre-profile consent flows also need Back-key sign-in cleanup for this emulator. |
| 3  | Subject Onboarding       | 12 | ⚠️ | 12 blocked by `flow-review` dev-client startup failure before app UI; see startup blocker Notion bug. |
| 4  | Learner Home + Resume    |  6 | ⚠️ | 1 pass w/issues, 5 blocked. HOME-01 previously reached learner locators; remaining rows blocked by `flow-review` dev-client startup failure. |
| 5  | Core Learning Sessions   | 12 | ⚠️ | 12 blocked by `flow-review` dev-client startup failure before app UI. |
| 6  | Library, Books, Topics   |  7 | ⚠️ | 7 blocked by `flow-review` dev-client startup failure before app UI. |
| 7  | Retention & Recall       |  4 | ⚠️ | 4 blocked by `flow-review` dev-client startup failure before app UI. |
| 8  | Progress / Vocab         |  7 | ⚠️ | 7 blocked by `flow-review` dev-client startup failure before app UI. |
| 9  | Practice Hub + Quiz      | 18 | ⚠️ | 18 blocked by `flow-review` dev-client startup failure before app UI. |
| 10 | Dictation                | 10 | ⚠️ | 10 blocked by `flow-review` dev-client startup failure before app UI. |
| 11 | Homework                 |  8 | ⚠️ | 8 blocked by `flow-review` dev-client startup failure before app UI. |
| 12 | Account / Settings       | 11 | ⚠️ | 11 blocked by `flow-review` dev-client startup failure before app UI. |
| 13 | Account Deletion         |  2 | ⚠️ | 2 blocked by `flow-review` dev-client startup failure before app UI. |
| 14 | Parent Setup + Children  |  8 | ⚠️ | 8 blocked by `flow-review` dev-client startup failure before app UI. |
| 15 | Parent Dashboard         | 17 | ⚠️ | 17 blocked by `flow-review` dev-client startup failure before app UI. |
| 16 | Billing                  | 13 | ⚠️ | 13 blocked by `flow-review` dev-client startup failure before app UI. |
| 17 | Cross-Cutting Final Pass | 11 | ⚠️ | 11 blocked by `flow-review` dev-client startup failure before app UI. |
| 18 | Regression Smoke         | 12 | ⚠️ | 12 blocked by `flow-review` dev-client startup failure before app UI. |
| **Total** | | **184** | ⚠️ | 8✅ 1⚠️ pass-w/issues 1❌ 174 blocked — all rows now have a first status for the 2026-05-14 pass; remaining blockers are primarily the `flow-review` dev-client startup failure plus earlier auth harness/quota gaps. |

### Coverage Audit

Cross-check after Batch 18: every inventory ID must appear in exactly one batch table or in Discovered Flows.

- AUTH-01..14 → Batches 1, 12 (sign out, expired); AUTH-13/14 in Batch 1
- ACCOUNT-01..30 → Batches 2, 4, 12, 13, 14; ACCOUNT-27 in Batch 2; ACCOUNT-28/29 in Batch 12; ACCOUNT-30 in Batch 14
- HOME-01..08 → Batches 1, 4, 14, 15
- SUBJECT-01..18 → Batches 3, 5, 11; SUBJECT-16/17 in Batch 2; SUBJECT-18 in Batch 3
- LEARN-01..25 → Batches 5, 6, 7, 8; LEARN-23 in Batch 5; LEARN-25 in Batch 6; LEARN-24 in Batch 8
- PRACTICE-01..04 → Batch 9
- QUIZ-01..13 → Batch 9; QUIZ-11/12/13 in Batch 9
- DICT-01..10 → Batch 10
- HOMEWORK-01..07 → Batch 11; HOMEWORK-07 in Batch 11
- PARENT-01..13 → Batch 15; PARENT-13 in Batch 15
- BILLING-01..12 → Batch 16; BILLING-11/12 in Batch 16
- QA-01..12 → Batch 18; QA-10/11/12 in Batch 18
- CC-01..18 → Batches 4 (CC-05), 5 (CC-01, CC-02), 9 (CC-10), 15 (CC-07, CC-08), 16 (CC-06), 17 (CC-03, CC-04, CC-09, CC-11, CC-12, CC-13, CC-14, CC-15, CC-16, CC-17, CC-18)
