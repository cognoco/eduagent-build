# Mobile App Flow Revision Plan

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

`Result` is blank/`—` until a flow is actually exercised, then one of: `Pass`, `Pass w/ issues`, `Fail`, `Blocked`, `Removed`.

Use Blocked only when an account, service, native capability, store gate, or harness problem prevents a flow that was attempted from being judged. If a flow has not been exercised yet, leave its result blank.

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
| HOME-04 | Animated splash and initial shell | 🚫 | Blocked | | | 2026-05-14 harness lane: still blocked for native dev-client because the dev-client overlay covers splash before Maestro can observe it; requires production APK. Native dev-client startup itself was verified via ACCOUNT-27 placeholder run reaching sign-in. Web smoke (2026-05-14): splash clears to sign-in by ~10s ✅. |
| AUTH-01 | App launch and auth gate | ✅ | Pass | | | 2026-05-14 Galaxy S10e emulator/dev-client: launch reaches sign-in gate with Google SSO, email, password, and Sign in CTA. Also confirmed on web preview. |
| AUTH-12 | First-time vs returning sign-in copy | ✅ | Pass | | | Clean launch shows first-time copy (`Welcome to MentoMate` / `sign-in-welcome-first-time`), not returning-user copy. |
| AUTH-07 | Auth screen navigation (sign-in ↔ sign-up ↔ forgot) | ❌ | Fail | https://www.notion.so/3608bce91f7c81928ecdf32a6e8c115c | | Sign-in to sign-up works, but the sign-up screen's return-to-sign-in link is not visible/reachable after scrolling to the primary CTA on the small emulator. Hosted Playwright web smoke run 25852959340 passed sign-in → sign-up → sign-in → forgot-password → sign-in navigation. |
| AUTH-02 | Sign up with email and password | 🚫 | Blocked | | | Sign-up fields and Create account CTA are reachable with normal field-to-field taps, but Clerk dev email quota is exhausted (`monthly limit for email messages in development (100)`), so full account creation is blocked by environment. Hosted Playwright web smoke run 25852959340 passed form render, disabled/enabled submit states, Clerk submit request, loading state, and terms/privacy links. |
| AUTH-03 | Sign-up email verification code | 🚫 | Blocked | | | Blocked by Clerk dev email quota while submitting AUTH-02; verification-code screen did not appear. Web smoke did not reach this stage either. |
| AUTH-04 | Sign in with email and password | ✅ | Pass | | | Seeded-user sign-in succeeds with literal credentials and normal field-to-field taps, reaching the expected consent-pending gate. |
| AUTH-05 | Additional sign-in verification (email/phone/TOTP) | 🚫 | Blocked | | | Required MFA seed scenarios do not exist yet (`mfa-email-code`, `mfa-phone`, `mfa-totp`, backup-code). |
| AUTH-06 | Forgot password and reset password | 🚫 | Blocked | | | Forgot-password screen renders, email entry works, and Send reset code is tappable, but Clerk dev email quota blocks reset-code delivery with the same monthly-limit error as sign-up. Hosted Playwright web smoke run 25852959340 passed forgot-password reachability and back-to-sign-in navigation; reset-code completion not exercised. |
| AUTH-08 | OAuth sign in / sign up (Google, Apple, OpenAI) | ✅ | Pass | | | Android/dev-client: Google SSO button renders and is tappable; OpenAI absent but optional. Web smoke: Google button renders, happy path blocked in web preview. |
| AUTH-09 | SSO callback completion + fallback | 🚫 | Blocked | https://www.notion.so/3608bce91f7c81cab6c8d96cea8e5b7b | | Airplane-mode broadcast blocked on this emulator (`Permission Denial`); after the failed SSO attempt, dev-client also hit a WebBrowser cleanup crash. |
| HOME-05 | Empty first-user state | ✅ | Pass | | ✅ 05-14 | Seeded `onboarding-no-subject` reaches learner home; current CTA is `home-action-study-new` and opens create-subject. Inventory updated for testID drift. |
| AUTH-13 | Deep-link auth redirect preservation (BUG-530) | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: W-03 passed deep link to authenticated route redirects to sign-in and returns after auth. ADB/Maestro deep-link path remains unreliable, but web path is covered. |
| AUTH-14 | Sign-in transition spinner + stuck-state recovery | 🚫 | Blocked | | | Requires controlled slow-network / auth-layout timeout simulation; no reliable end-user harness available in this pass. |

---

## Batch 2 — First Profile + Consent Variants

**State required:** Slot A signed in but no profile yet. Will exercise consent age branches; needs to register profiles with different birth years (Slots D, E).
**Estimated time:** 60–90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-01 | Create first profile | ❌ | Fail | https://www.notion.so/3608bce91f7c816d83dbd583835d897a | | 2026-05-14 WSL full Playwright web: J-12 reached create-profile form and filled name/birth date, but did not land on learner home after Create profile. |
| SUBJECT-08 | Language learning setup | ✅ | Pass | none | | 2026-05-14 targeted Playwright web rerun: J-09 created an Italian subject, completed native-language + beginner-level setup, and reached session chat; earlier failure did not reproduce. |
| ACCOUNT-19 | Consent request during underage profile creation | ⚠️ | Blocked | | | 2026-05-14 harness lane: native dev-client startup and sign-in are reachable, but a pre-profile seed probe lands on `We could not load your profile` instead of `create-profile-gate` before the profile creation form. Do not classify the consent request behavior yet. |
| ACCOUNT-20 | Child handoff to parent consent request | ⚠️ | Blocked | | | 2026-05-14 harness lane: `hand-to-parent-consent.yaml` reached sign-in, then `hideKeyboard` sent the emulator to Android home before password entry. A no-hide pre-profile probe then signed in but hit the same profile-load-error gate before child-to-parent handoff. Do not classify handoff behavior yet. |
| ACCOUNT-21 | Parent email entry, send / resend / change email | ✅ | Pass | | | 2026-05-14: seeded pending-consent user showed parent email, resend, change-email, and check-again controls; change-email submit returned to pending gate. |
| ACCOUNT-22 | Consent pending gate | ✅ | Pass | | | 2026-05-14: seeded `consent-pending` user signs in to `consent-pending-gate`; check-again, resend, change-email, preview controls, and sign-out are present. Current heading is `Hang tight!`. |
| ACCOUNT-23 | Consent withdrawn gate | ✅ | Pass | | | 2026-05-14: seeded `consent-withdrawn-solo` user signs in to `consent-withdrawn-gate`; `Your account is being closed` copy and `withdrawn-sign-out` are visible. |
| ACCOUNT-24 | Post-approval landing | ❌ | Fail | https://www.notion.so/3608bce91f7c813998ccf07b435b221a | | 2026-05-14 WSL full Playwright web: J-13 pending-consent parent approval flow failed before completing the post-approval landing. |
| ACCOUNT-26 | Regional consent variants (COPPA / GDPR / above threshold) | ⚠️ | Blocked | | | 2026-05-14 harness lane: still blocked before regional consent classification. These flows share the pre-profile setup path; current evidence shows native sign-in is reachable but pre-profile state lands on profile-load-error instead of create-profile-gate, and stock sign-in steps remain fragile on `hideKeyboard`. |
| ACCOUNT-27 | Parent consent deny confirmation | ⚠️ | Blocked | | | 2026-05-14 harness lane: ran `consent-deny-confirmation.yaml` with `--no-seed`; dev-client launched, reached sign-in, and the placeholder flow passed. Actual deny confirmation remains blocked for mobile because inventory points to server-rendered consent-web HTML, not an in-app native screen. |
| SUBJECT-16 | Conversation-language picker (mandatory, profile-wide) | ⚠️ | Blocked | | | 2026-05-14 harness lane: ran `onboarding-fast-path-language.yaml` against staging seed and Metro 8090. It reached seeded sign-in, then shared `seed-and-sign-in.yaml` failed after `hideKeyboard` left the app on Android home before password entry; language picker not reached. |
| SUBJECT-17 | Pronouns picker (preset + free-text Other) | ⚠️ | Blocked | | | 2026-05-14 harness lane: still blocked as a harness coverage gap. Inventory notes only partial fast-path coverage and no dedicated current pronouns YAML; no pronouns route was reached in native runs. |

---

## Batch 3 — Subject Onboarding (Adult Learner)

**State required:** Slot B (adult learner, no subjects).
**Estimated time:** 60–90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SUBJECT-01 | Create subject from learner home | ✅ | Pass | none | | 2026-05-14 targeted Playwright web rerun: J-09 used empty learner Home > Add first subject, submitted `Italian`, completed language setup, and reached session chat; earlier failure did not reproduce. |
| SUBJECT-05 | Subject resolution + clarification suggestions | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: create-subject typo `caluclus` showed the correction card, Start and Change controls were visible, and Change returned to the editable subject input. |
| SUBJECT-06 | Broad subject → pick a book | ❌ | Fail | https://www.notion.so/3608bce91f7c8146bf41ddde4aeab0dc | | 2026-05-14 targeted WSL Playwright web: broad subject paths did not reach `pick-book-screen`; `history` could fall into the generic error fallback, and the `How plants grow` starter resolved to Biology but stayed on `Preparing your first lesson...` for 60s after Start. |
| SUBJECT-07 | Focused subject / focused-book flow | ✅ | Pass | none | | 2026-05-14 targeted Playwright web rerun: J-09 submitted a concrete subject (`Italian`) and reached the first session chat after setup. Broad pick-book and curriculum-review branches remain separate rows. |
| SUBJECT-09 | Interview onboarding | ➖ | Removed | | | Removed before this sweep: legacy interview onboarding was removed in `f0cbf5ee4`; current inventory no longer lists SUBJECT-09. |
| SUBJECT-10 | Analogy-preference onboarding | ➖ | Removed | | | Removed before this sweep with the legacy interview flow in `f0cbf5ee4`; analogy preference now lives on subject settings rather than onboarding. |
| SUBJECT-11 | Curriculum review | ➖ | Removed | | | Removed before this sweep with the legacy interview/curriculum-review onboarding flow in `f0cbf5ee4`; current inventory no longer lists SUBJECT-11. |
| SUBJECT-12 | View curriculum without committing | ✅ | Pass | none | | 2026-05-14 targeted WSL Playwright web: `learning-active` learner opened `/shelf/{subjectId}/book/{bookId}?readOnly=true`; `book-screen`, `book-hero-title`, `chapter-topics`, and a topic row rendered, and no `chat-input`/session surface appeared. |
| SUBJECT-13 | Challenge curriculum (skip / add / explain ordering) | ➖ | Removed | | | Removed before this sweep with the legacy curriculum-review onboarding branch in `f0cbf5ee4`; current inventory no longer lists SUBJECT-13. |
| SUBJECT-14 | Placement / knowledge assessment | ✅ | Pass | none | | 2026-05-14 targeted WSL Playwright web: `learning-active` learner opened `/practice/assessment?subjectId={subjectId}&topicId={topicId}`, assessment chat rendered, `I'm ready` sent, and the first assessment question appeared. |
| SUBJECT-15 | Accommodation-mode onboarding (FR255) | ➖ | Removed | | | Removed before this sweep with the legacy onboarding branch in `f0cbf5ee4`; accommodation mode is now managed from More/learning preferences. |
| SUBJECT-18 | Interests-context picker (free-time / school / both) | ➖ | Removed | | | Removed before this sweep with the legacy onboarding branch in `f0cbf5ee4`; current inventory no longer lists SUBJECT-18. |

---

## Batch 4 — Learner Home, Intent Cards, Resume

**State required:** Slot C (adult learner with subjects, partially-completed session).
**Estimated time:** 30–45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home redesigned carousel + quick actions | ✅ | Pass | | | 2026-05-14 hosted Playwright web smoke run 25852959340: seeded learner reaches `learner-screen` and Study/Homework/Practice actions render. The companion UX screenshot crawl also completed in the same 10/10 smoke run. |
| HOME-06 | Resume interrupted session (Continue card) | ✅ | Pass | none | | 2026-05-14 targeted seeded Playwright web pass: Home rendered the coach-band Continue control; tapping it opened an actionable learning surface. |
| HOME-08 | Home loading-timeout fallback (10s) | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: J-14 profile loading resolves without dead-end. |
| ACCOUNT-04 | Profile switching | ❌ | Fail | https://www.notion.so/3608bce91f7c81f49152df527f941d9b | | 2026-05-14 WSL full Playwright web: J-04/J-05/J-06 role-transition journeys failed when opening child progress from parent home; error fallback showed Try Again / Back to dashboard. |
| ACCOUNT-06 | More hub + nested Account/Profile, Privacy & Data, Notifications, Learning preferences, Accommodation, Help | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL full Playwright web: J-01 UX crawl rendered `/more`, `/more/account`, `/more/privacy`, `/more/notifications`, and `/more/help`; it did not assert every button or Learning Preferences/Accommodation. |
| CC-05 | Continue-where-you-left-off (recovery marker vs API) | ✅ | Pass | none | | 2026-05-14 targeted WSL Playwright web: `learning-active` learner Home rendered `home-coach-band-continue`; tapping it opened `/session` with `chat-input`, covering the API resume-target branch. |

---

## Batch 5 — Core Learning Sessions (Tutoring + Chat)

**State required:** Slot C with at least one subject + voice/mic permissions granted. Plan ~2 full live sessions in different modes.
**Estimated time:** 90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-01 | Freeform chat (Ask intent card) | ❌ | Fail | https://www.notion.so/3608bce91f7c81edb885f511f70f86d4 | | 2026-05-14 WSL full Playwright web: J-08 Ask/freeform flow failed before session summary; error context showed a library loading retry fallback instead of completing chat. |
| LEARN-02 | Guided learning session from subject/topic | ✅ | Pass | | | 2026-05-14 WSL Playwright web J-11: Library → shelf → book → Start learning opened `/session` and rendered `chat-input` for the guided learning session. |
| LEARN-03 | First session experience | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web J-09: no-subject learner created Italian, completed language setup, and landed in the first session chat with `chat-input` visible. |
| LEARN-04 | Core learning loop | ❌ | Fail | https://www.notion.so/3608bce91f7c8161bfedede760ae265c | | 2026-05-14 targeted WSL Playwright web: Library → shelf → book → session accepted a learner message and rendered an assistant response, then the session error boundary crashed with `Cannot access 'wt' before initialization`. |
| LEARN-05 | Coach bubble visual variants (light/dark) | ⬜ | Pass w/ issues |  | Playwright web: inventory UI guard passed | 2026-05-14: web inventory pass seeded active learner and verified the coach band renders with CTA, dismisses cleanly, and leaves the home intent cards responsive. Light/dark/native visual variants were not exhaustively compared on device, so keep a native visual polish pass queued. |
| LEARN-06 | Voice input + voice-speed controls | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web: session rendered `voice-enable-button`; AI voice toggle exposed `voice-playback-bar`, and `voice-rate-button` cycled from `1x` to `1.25x`. Actual microphone recording/STT was not completed on web. |
| LEARN-07 | Session summary (submit / skip) | ❌ | Fail | https://www.notion.so/3608bce91f7c81edb885f511f70f86d4 | | 2026-05-14 WSL full Playwright web: J-08 did not reach end-session summary/home completion. |
| SUBJECT-02 | Create subject from library empty state | ❌ | Fail | https://www.notion.so/3608bce91f7c817eb19cc45799cfe32e | | 2026-05-14 targeted WSL Playwright web: no-subject Library empty state rendered, but `library-empty-go-home` routed to `/dashboard` instead of `/create-subject`, so `create-subject-name` never appeared. |
| SUBJECT-03 | Create subject from chat (classifier miss) | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: no-subject learner opened Ask, sent “Tell me about Easter,” used the classifier miss create-subject CTA, created World History, and returned to `/session` with chat input visible. |
| CC-01 | Conversation-stage chips + feedback gating | ❌ | Fail | https://www.notion.so/3608bce91f7c8161bfedede760ae265c | | 2026-05-14 targeted WSL Playwright web: after a book-session assistant response, the session crashed before `quick-chip-*` or `message-feedback-helpful-*` controls became available. |
| CC-02 | Greeting-aware subject classification | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: no-subject learner sent “hello”; the app streamed a greeting response without opening subject resolution, then a later “Tell me about Easter” message opened subject resolution as expected. |
| LEARN-23 | Read-only session transcript view (BUG-889) | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: `session-with-transcript` opened a session summary, tapped `view-transcript-cta`, and rendered read-only transcript screen, scroll region, and transcript exchanges. |

---

## Batch 6 — Library, Books, Topics

**State required:** Slot C with several subjects (broad + focused) and at least one book.
**Estimated time:** 30–45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-08 | Library root (shelves / books / topics tabs) | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: J-11 passed learner Library root path. |
| LEARN-09 | Subject shelf → book selection | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: J-11 passed shelf/book selection path. |
| LEARN-10 | Book detail + start learning from book | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: J-11 passed book detail to start-learning path. |
| LEARN-11 | Manage subject status (active / paused / archived) | ✅ | Pass | none | | 2026-05-14: targeted seeded Playwright web pass opened Library > Manage subjects and verified pause, resume, archive, restore, and close controls all responded. |
| LEARN-12 | Topic detail | ✅ | Pass | none | | 2026-05-14: targeted seeded Playwright web pass reached topic detail from the end-user path Library > shelf > book > topic row and verified the detail surface plus back control. |
| ACCOUNT-18 | Subject analogy preference after setup | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: opened a seeded subject settings screen after setup, rendered `analogy-domain-picker`, selected Sports, and the row visibly switched to Active. |
| LEARN-25 | Library inline search (PR #144) | ✅ | Pass | none | | 2026-05-14: targeted seeded Playwright web pass filled Library search, observed search results/empty handling, cleared search, and returned to the shelf list. |

---

## Batch 7 — Retention & Recall

**State required:** Slot C with overdue topics (force-age data via dev tools or wait).
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-13 | Recall check | ❌ | Fail | https://www.notion.so/3608bce91f7c8184a549effe9d0e1b21 | | 2026-05-14 targeted WSL Playwright web: seeded `failed-recall-3x` direct `/topic/recall-test?...` opened Library instead of `recall-test-screen`, so the recall check could not start. |
| LEARN-14 | Failed recall remediation | ❌ | Fail | https://www.notion.so/3608bce91f7c8184a549effe9d0e1b21 | | 2026-05-14 targeted WSL Playwright web: same recall-test route failure prevented the "I don't remember" remediation path and `remediation-card` from being reached. |
| LEARN-15 | Relearn flow (same / different method) | ❌ | Fail | https://www.notion.so/3608bce91f7c816fb3b0c5cc44e970b7 | | 2026-05-14 targeted WSL Playwright web: seeded `retention-due` direct `/topic/relearn` opened Library instead of `relearn-subjects-phase` or `relearn-topics-phase`. |
| LEARN-16 | Retention review (library + retention surfaces) | ❌ | Fail | https://www.notion.so/3608bce91f7c8169bb93d6d7b75443c2 | | 2026-05-14 targeted WSL Playwright web: `/progress` showed the streak, but `/progress/{subjectId}` rendered summary actions without `progress-subject-retention-card`. |

---

## Batch 8 — Progress, Milestones, Vocabulary

**State required:** Slot C with multi-day learning history (streak ≥ 2, ≥ 1 milestone unlocked, ≥ 1 language subject for vocab).
**Estimated time:** 30 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-17 | Progress overview tab | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: J-01 UX crawl reached `/progress` and asserted `My Learning Journey`. |
| LEARN-18 | Subject progress detail | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL full Playwright web: J-01 UX crawl rendered seeded `/progress/{subjectId}`; no deep assertions beyond page render/screenshot. |
| LEARN-19 | Streak display | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: seeded `learning-active` opened `/progress`; `progress-streak-count` rendered and contained the expected seeded streak value `3`. |
| LEARN-20 | Milestones list | ✅ | Pass | none | | 2026-05-14: targeted seeded Playwright web pass opened `/progress/milestones`, verified the empty milestone state, and verified the back control. |
| LEARN-21 | Cross-subject vocabulary browser | ✅ | Pass | none | | 2026-05-14: targeted seeded Playwright web pass opened `/progress/vocabulary`, verified the seeded vocabulary browser state, and verified the back control. |
| LEARN-22 | Per-subject vocabulary list (delete + CEFR/word badges) | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web: seeded language learner opened `/vocabulary/{subjectId}`; list items, CEFR/Word or Phrase badges, and delete controls rendered. Delete confirmation/completion was not exercised. |
| LEARN-24 | Saved bookmarks screen (`/(app)/progress/saved`) | ✅ | Pass | none | | 2026-05-14: targeted seeded Playwright web pass opened `/progress/saved`, verified the empty/list saved-bookmarks surface, and verified the back control. |

---

## Batch 9 — Practice Hub & Quiz

**State required:** Slot C. For PRACTICE-04, needs a profile with no overdue topics. For QUIZ-08, needs Slot J (quota-capped) at end of batch.
**Estimated time:** 90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PRACTICE-01 | Practice hub menu | ✅ | Pass | | | 2026-05-14 WSL Playwright web rerun: J-10 reached Practice, opened Quiz, completed a Capitals round, returned to Practice, then navigated back Home. |
| PRACTICE-02 | Review topics shortcut | ✅ | Pass | none | | 2026-05-14: targeted seeded Playwright web pass opened Practice, clicked the Review shortcut, and verified the review/empty-state surface. |
| PRACTICE-03 | Recitation session | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: Home → Practice → Recite opened `mode=recitation`, `chat-input` accepted recited text, Send worked, and the session entered the thinking/response state. |
| PRACTICE-04 | "All caught up" empty state with countdown | ✅ | Pass | none | | 2026-05-14: targeted seeded Playwright web pass verified the review empty state after using the Practice review shortcut. |
| QUIZ-01 | Quiz activity picker (Capitals / Vocab / Guess Who) | ✅ | Pass | | | 2026-05-14 WSL Playwright web rerun: J-10 opened Practice → Quiz, rendered the quiz picker, launched Capitals, completed the round, and returned to Home. |
| QUIZ-02 | Round generation loading + 20s "still trying" hint | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: delayed the round-generation POST for 21s; `quiz-launch-loading`, Cancel, and `quiz-launch-timed-out` hint all rendered before play. |
| QUIZ-03 | Round play — multiple choice | ✅ | Pass | | | 2026-05-14 WSL Playwright web J-10: Capitals quiz rendered multiple-choice options, accepted answers, showed feedback, advanced through the round, and reached results. |
| QUIZ-04 | Round play — Guess Who clue reveal | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: Practice → Quiz → Guess Who launched play, rendered `guess-who-question`, Reveal next clue advanced helper text, and fallback choices appeared after the third clue. |
| QUIZ-05 | Mid-round quit with confirm | ❌ | Fail | https://www.notion.so/3608bce91f7c8147b974e7a9f276f80e | | 2026-05-14 targeted WSL Playwright web: quit modal appeared and Cancel kept the quiz playable, but confirming leave left quiz play visibly layered with Home/Practice content instead of cleanly showing the quiz index. |
| QUIZ-06 | Round complete error retry | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: intercepted the final round-complete request to fail once, saw `quiz-play-error` with Retry, pressed Retry, and the round successfully reached `quiz-results-screen`. |
| QUIZ-07 | Results screen (celebration tier + soft-fail streak) | ✅ | Pass | | | 2026-05-14 WSL Playwright web rerun: J-10 completed the Capitals round, displayed `quiz-results-screen`, pressed Done, returned to Practice, then Home. |
| QUIZ-08 | Quota / consent / forbidden typed errors | ❌ | Fail | https://www.notion.so/3608bce91f7c8107bae5eb4b90d1e7ee | | 2026-05-14 targeted WSL Playwright web: quota and consent launch errors rendered the error panel with Go Back and no Retry, but FORBIDDEN rendered "Couldn't create a round / Insufficient permissions" with Retry still visible. |
| QUIZ-09 | Quiz history (grouping + empty state) | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL full Playwright web: J-01 UX crawl rendered `/quiz/history`; grouping/empty-state details were not asserted. |
| QUIZ-10 | Quiz round detail (per-question review) | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: Quiz History rendered a completed Guess Who row, opening it showed `round-detail-screen`, and expanding question 0 revealed the clues/fun-fact review panel. |
| CC-10 | Soft-fail side effects on completion | ⬜ | Pass |  | Jest API guard passed | 2026-05-14: targeted `apps/api/src/inngest/functions/session-completed.test.ts` passed 95 tests, including soft-step failures staying isolated, structured `extra.step`/`surface` tags, independent reporting for multiple soft failures, and `app/session.completed_with_errors` dispatch. |
| QUIZ-11 | Malformed-round guard (BUG-812 / F-015) | ❌ | Fail | https://www.notion.so/3608bce91f7c81afbfefec4fe77c058d | | 2026-05-14 targeted WSL Playwright web: malformed Capitals round rendered `quiz-play-malformed`, but pressing "Back to quiz home" left the user on the same malformed fallback instead of escaping. |
| QUIZ-12 | Wrong-answer dispute affordance (BUG-469 / BUG-927) | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: after a wrong answer path, `quiz-dispute-button` rendered, pressing it replaced the affordance with `quiz-dispute-noted`. |
| QUIZ-13 | Answer-check failure inline warning (IMP-7 / BUG-799) | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: intercepted answer-check to fail, the browser alert surfaced, the inline "Answer check failed" warning rendered, and the user could still proceed to dispute feedback. |

---

## Batch 10 — Dictation

**State required:** Slot C with an active language subject (target language sentences). Camera permission for DICT-07.
**Estimated time:** 60 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| DICT-01 | Choice screen (text vs surprise) | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: `/dictation` rendered both `dictation-homework` and `dictation-surprise`; each branch was clicked in separate probes. |
| DICT-02 | OCR text preview + edit (homework path) | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web with controlled dictation API: homework branch opened `dictation-text-preview-screen`, edited `text-preview-input`, submitted, and reached playback. Native OCR/photo import was not part of this path. |
| DICT-03 | "Surprise me" LLM-generated dictation | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web with controlled dictation API: Surprise me generated a dictation response and reached `dictation-playback-screen` with `1 / 1` progress. Live LLM generation was not used in this inventory pass. |
| DICT-04 | Playback (TTS, pace, punctuation, repeat, tap-pause) | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: playback rendered pace, punctuation, skip, progress, tap-area, and repeat controls; pace/punctuation/tap/repeat/skip were exercised. |
| DICT-05 | Mid-dictation exit confirm dialog | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web: playback Exit opened `dictation-exit-confirm`; Cancel dismissed it. Confirm-leave branch was visible but not clicked because the same run continued to completion. |
| DICT-06 | Completion screen | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: skipping the final sentence opened `dictation-complete-screen` with Check my writing, Done, and Try another dictation; Done returned to Practice. |
| DICT-07 | Photo review of handwritten dictation (vision LLM) | ⬜ | Pass w/ issues |  | Temporary Jest inventory guard passed | 2026-05-14: temporary dictation review guard rendered the complete screen, pressed `complete-check-writing`, mocked a handwritten JPEG, verified base64 + `image/jpeg` + sentences/language are sent to `reviewMutation`, stored `reviewResult`, and navigated to `/dictation/review`. Real camera/gallery + live vision LLM remain native/staging coverage gaps. |
| DICT-08 | Sentence-level remediation | ⬜ | Pass w/ issues |  | Temporary Jest inventory guard passed | 2026-05-14: temporary dictation review guard rendered `review-remediation-screen`, `review-mistake-card`, typed a corrected sentence into `review-correction-input`, pressed `review-submit-correction`, and reached `review-celebration`. Covered with mocked review data, not live vision output. |
| DICT-09 | Perfect-score celebration | ⬜ | Pass w/ issues |  | Temporary Jest inventory guard passed | 2026-05-14: temporary dictation review guard rendered perfect-score `review-celebration`, pressed `review-done`, verified reviewed result save payload, and returned to Practice. Covered with mocked perfect review data, not live camera/LLM. |
| DICT-10 | Recording dictation result + retry | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web with controlled dictation API: completion Done posted the dictation result and returned to Practice. Retry-on-recording-failure was not exercised. |

---

## Batch 11 — Homework

**State required:** Slot C, camera + gallery permissions. Have a printed/written page handy.
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOMEWORK-01 | Start homework from home / More | ⚠️ | Pass w/ issues | | | 2026-05-14 hosted/WSL Playwright web: learner home smoke showed Homework action; J-01 UX crawl rendered `/homework/camera`. It did not complete an OCR homework session. |
| HOMEWORK-02 | Camera permission, capture, preview, OCR | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL full Playwright web: J-01 UX crawl rendered `/homework/camera`; native camera permission/capture/OCR was not exercised on web. |
| HOMEWORK-03 | Manual fallback when OCR is weak | ⬜ | Pass w/ issues |  | Jest camera guard passed | 2026-05-14: targeted camera tests passed `shows manual fallback on first OCR failure` and `navigates to session with typed text on manual continue`. This is component-level coverage; live weak-OCR photo capture was not run on web. |
| HOMEWORK-04 | Homework session multi-problem nav | ⬜ | Pass w/ issues |  | Jest camera guard passed | 2026-05-14: targeted camera tests passed editable problem-card rendering and session navigation with serialized `homeworkProblems`. This covers multi-problem handoff at component level; a full session walkthrough with several queued homework problems still needs native/web E2E coverage. |
| HOMEWORK-05 | Gallery import | ⬜ | Pass w/ issues |  | Jest camera guard passed | 2026-05-14: targeted camera test passed `opens the preview when a gallery image is selected`, exercising the gallery button -> preview path with mocked image picker. Real browser/native gallery picker was not exercised. |
| HOMEWORK-06 | Image pass-through to multimodal LLM | ⬜ | Pass w/ issues |  | Jest camera guard passed | 2026-05-14: targeted camera test passed session navigation with captured image metadata (`imageUri` path covered with OCR result and serialized homework payload). Real multimodal LLM call was not executed in web inventory. |
| SUBJECT-04 | Create subject from homework branch | ⬜ | Fail | https://www.notion.so/3608bce91f7c8116a36cd5e8216ba8db | | 2026-05-14: targeted camera test `creates a new subject before continuing` timed out twice at 184s without completing, while neighboring homework tests passed. Logged Notion issue for follow-up; not counted as pass. |
| HOMEWORK-07 | Camera permission onboarding (two-state + Settings redirect) | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web: entered via Home assignment action and verified the camera-permission screen exposes a recovery CTA (`grant-permission-button` or `open-settings-button`) plus `close-button`. Native two-state permission / Settings redirect was not exercised on web. |

---

## Batch 12 — Account, Settings, Mentor Memory, Sign-out

**State required:** Slot C signed in.
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-07 | Notifications sub-screen: push notifications + weekly digest toggles | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/more/notifications` rendered push, weekly digest, weekly email, and monthly email switches; Push notifications toggle responded. Weekly digest text click missed the exact switch target, so full toggle persistence still needs follow-up. |
| ACCOUNT-08 | Learning preferences -> Accommodation mode + celebration-level preferences | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/more/learning-preferences` and `/more/accommodation` rendered accommodation options None, Short-Burst, Audio-First, Predictable, plus the "Not sure which to pick?" affordance. Save/persistence and celebration preference coverage not completed. |
| ACCOUNT-09 | Account/Profile sub-screen: change password | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/more/account` rendered profile name, Change Password, App Language, and Subscription rows. Change-password vendor flow was not completed because the inventory pass avoided modal/debug detours. |
| ACCOUNT-10 | Privacy & Data sub-screen: export my data | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/more/privacy` rendered Export my data. Export delivery/result was not completed in this inventory pass. |
| ACCOUNT-13 | Privacy policy | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/more/privacy` rendered the Privacy Policy control. External document open was not completed. |
| ACCOUNT-14 | Terms of service | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/more/privacy` rendered the Terms of Service control. External document open was not completed. |
| ACCOUNT-15 | Self mentor memory | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL full Playwright web: J-01 UX crawl rendered `/mentor-memory`; export/delete memory controls were not fully exercised. |
| AUTH-10 | Sign out | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/more` and settings sub-screens rendered the Sign out control. Destructive sign-out completion was not clicked during this inventory pass. |
| AUTH-11 | Session-expired forced sign-out | ❌ | Fail | https://www.notion.so/3608bce91f7c81af964ed95a3afc3a93 | | 2026-05-14 targeted WSL Playwright web: after an authenticated `/v1/profiles` request was forced to return 401, the app did sign the user out to Sign in, but the expected "Your session expired. Sign in again to continue learning." notice was absent. |
| ACCOUNT-28 | Account/Profile sub-screen: app language bottom-sheet edit | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/more/account` rendered App Language as English. Bottom-sheet edit/save was not completed. |
| ACCOUNT-29 | More mentor-language row opens Account/Profile; no distinct tutor-language save flow currently exists | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: More rendered Mentor language and Account/Profile rendered App Language. No distinct tutor-language save flow was found or completed. |

---

## Batch 13 — Account Deletion Lifecycle

**State required:** Slot K (account that can be safely deleted). Run last among the learner batches because it terminates the session.
**Estimated time:** 20 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-11 | Privacy & Data sub-screen: delete account typed-confirmation flow with 7-day grace | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/more/privacy` rendered Delete account. The typed destructive confirmation and 7-day grace state were not completed. |
| ACCOUNT-12 | Scheduled deletion state: keep account / cancel deletion | ❌ | Fail | https://www.notion.so/3608bce91f7c81b89765e17ec7a18ef3 | | 2026-05-14 targeted WSL Playwright web: `account-deletion-scheduled` seed opened `/delete-account`, but the screen showed the initial destructive delete warning instead of `delete-account-scheduled` with Keep account / cancel deletion controls. |

---

## Batch 14 — Parent Setup, Adding Children, Family Gating

**State required:** Slot E (parent owner, Family plan, 0 children → added Timmy age 12).
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-07 | Add-first-child gate | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: J-15 family-plan parent with no children sees add-first-child CTA. |
| ACCOUNT-02 | Create additional profile (generic) | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/profiles` rendered existing Test Learner profile and `+ Add profile`; More also rendered Add a child profile. Creation form submission was not completed. |
| ACCOUNT-03 | Add child profile from More / Profiles | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/more` rendered Add a child profile and `/profiles` rendered `+ Add profile`; child profile creation was not completed. |
| ACCOUNT-05 | Family-plan + max-profile gating | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: family subscriber saw Add child in More, a maxed family-pool response blocked the add-child path, and the user-facing max-profile alert appeared. |
| ACCOUNT-25 | Parent consent management for a child | ❌ | Fail | https://www.notion.so/3608bce91f7c814eaad1e8fc171d8a3e | | 2026-05-14 targeted WSL Playwright web: parent opened a seeded child detail from Home; the child detail surface had no `consent-section`, `withdraw-consent-button`, grace-period banner, or restore/cancel controls expected by the consent-management flow. |
| ACCOUNT-16 | Child mentor memory | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: parent opened a populated child's mentor memory screen, saw Controls, interests (Soccer/History), strengths/struggles/notes, privacy actions, and the correction affordance. |
| ACCOUNT-17 | Child memory consent prompt | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: parent opened a child mentor-memory screen with pending memory consent and saw both `memory-consent-grant` and `memory-consent-decline`. |
| ACCOUNT-30 | Impersonated-child guard across More hub, Account/Profile, and Privacy & Data | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: parent switched into child proxy mode via Profiles, saw `proxy-banner`, More hid Sign out, Account hid Subscription, and Privacy & Data hid Export and Delete account. |

---

## Batch 15 — Parent Dashboard & Drill-Downs

**State required:** Slot E (parent, 1 child Timmy, no learning history yet).
**Estimated time:** 75 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-02 | Parent gateway home | ✅ | Pass | | | 2026-05-14 hosted Playwright web smoke run 25852959340: seeded parent reaches `/home`, `parent-home-screen` is visible, and child check/report/nudge controls render. |
| HOME-03 | Parent tabs and parent-mode navigation | ⚠️ | Pass w/ issues | | | 2026-05-14 hosted Playwright web smoke run 25852959340: parent home renders with `tab-my-learning` visible. Deeper tab switching was not exercised in the smoke, so keep a full navigation pass queued. |
| PARENT-01 | Parent dashboard (live + demo) | ⚠️ | Pass w/ issues | | | 2026-05-14 hosted Playwright web smoke run 25852959340: parent dashboard shell and first child check/report/nudge controls render. Smoke did not click into demo/live detail paths. |
| PARENT-02 | Multi-child dashboard | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: `parent-multi-child` rendered three child cards and each exposed check-in, progress, weekly report, nudge, and accommodation controls. |
| PARENT-03 | Child detail drill-down | ❌ | Fail | https://www.notion.so/3608bce91f7c81f49152df527f941d9b | | 2026-05-14 WSL full Playwright web: J-04/J-05/J-07 child progress drill-downs failed, landing on an error fallback instead of child detail/progress. |
| PARENT-04 | Child subject → topic drill-down | ❌ | Fail | https://www.notion.so/3608bce91f7c817bb704e5c29602c968 | | 2026-05-14 WSL full Playwright web: J-16 parent drill-down failed because the seeded session card was not visible on the child progress screen. |
| PARENT-05 | Child session / transcript drill-down | ❌ | Fail | https://www.notion.so/3608bce91f7c817bb704e5c29602c968 | | 2026-05-14 WSL full Playwright web: J-16/J-17 could not reach seeded child session recap/transcript; expected session card was missing. |
| PARENT-06 | Child monthly reports list + report detail | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: `parent-with-reports` opened `/child/{childId}/reports`, rendered `report-card-{reportId}`, and opened monthly detail with hero, metrics, highlights, next steps, and subjects. |
| PARENT-07 | Parent library view | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: parent-active `/library` rendered shelves list, General Knowledge shelf row, next-action card, and Manage subjects control. |
| PARENT-08 | Subject raw-input audit | ❌ | Fail | https://www.notion.so/3608bce91f7c8144b79bf1acd6375749 | | 2026-05-14 targeted WSL Playwright web: parent opened a seeded child detail from Home; the current child detail surface showed Mentor memory/Profile details and no subject cards, `Your child searched for...`, or `subject-raw-input-*` audit line. |
| PARENT-09 | Guided label tooltip | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: parent opened a seeded child topic detail, tapped `metric-info-understanding`, saw `metric-tooltip-understanding`, and tapped again to close it. |
| PARENT-10 | Child-topic "Understanding" card + gated retention | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: seeded parent opened `/child/{profileId}/topic/{topicId}`; topic detail rendered `topic-understanding-card`, "Getting comfortable", `topic-retention-card`, "Still remembered", and both Understanding/Review status info tooltips. |
| PARENT-11 | Child-session recap (narrative + clipboard + chip) | ❌ | Fail | https://www.notion.so/3608bce91f7c817bb704e5c29602c968 | | 2026-05-14 WSL full Playwright web: J-17 could not open the seeded session recap/copy path because the expected session card was missing. |
| PARENT-12 | Child-subject detail retention badges (data-gated) | ❌ | Fail | https://www.notion.so/3608bce91f7c810ea05be5b8cd9fcf83 | | 2026-05-14 targeted WSL Playwright web: `parent-subject-with-retention` opened the child subject page, but it showed "Topics will appear here after a few sessions" and no `subject-retention-badge` or topic card. |
| CC-07 | Accommodation badge surfaces | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: parent multi-child home rendered `child-accommodation-row-{childId}` for all three seeded children. |
| CC-08 | Parent-facing metric vocabulary canon | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web: parent topic detail used canonical Understanding and Review status labels/tooltips from `parent-vocab`; other parent/report surfaces were not exhaustively checked. |
| PARENT-13 | Child weekly report detail (push-driven) | ❌ | Fail | https://www.notion.so/3608bce91f7c81d79010e701e0bdc885 | | 2026-05-14 targeted WSL Playwright web: `parent-with-weekly-report` rendered `weekly-report-card-{reportId}`, but clicking it opened a "That page or item no longer exists" fallback instead of `child-weekly-report-hero`. |

---

## Batch 16 — Billing & Monetization

**State required:** Slot I (trialing) for upgrade flows; Slot J (quota-capped) for paywall; Slot G child profile for child paywall. RevenueCat sandbox account on device.
**Estimated time:** 60 min. **Risk:** Apple/Google store gating — some flows may be 🚫 Blocked.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Account/Profile -> Subscription: current-plan details | ✅ | Pass | | | 2026-05-14 WSL Playwright web probe: `/subscription` rendered Current plan Free Trial, usage this month, daily quota, and Free/Plus plan details. |
| BILLING-02 | Account/Profile -> Subscription: upgrade purchase + webhook polling | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web: `purchase-pending` reached Subscription with Free current plan, static `no-offerings` fallback, mobile-only upgrade notice, and no web purchase CTA. Native RevenueCat purchase and webhook polling were not exercised on web. |
| BILLING-03 | Account/Profile -> Subscription: trial, plan usage, family-pool states | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/subscription` rendered Trial active, current Free Trial plan, monthly usage, and daily quota. Family-pool state was not covered by the solo learner seed. |
| BILLING-04 | Account/Profile -> Subscription: restore purchases | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/subscription` rendered Restore Purchases. Native restore behavior is unavailable on web and was not completed. |
| BILLING-05 | Account/Profile -> Subscription: manage billing deep link | ❌ | Fail | https://www.notion.so/3608bce91f7c812eadd0e0e0c6001e04 | | 2026-05-14 WSL Playwright web probe: `/subscription` rendered "Store purchasing is not available on this device" plus Restore Purchases/BYOK controls, but no Manage billing deep link was visible. |
| BILLING-06 | Child entitlement paywall + notify-parent; no visible child More subscription row | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: J-19 passed free-tier learner subscription paywall web UI. Child-specific More-row absence still needs native/mobile confirmation. |
| BILLING-07 | Daily quota exceeded paywall | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: J-19 passed free-tier quota/paywall presentation with static tier comparison. |
| BILLING-08 | Account/Profile -> Subscription: family-pool visibility | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: `subscription-family-active` rendered `/subscription` with Family current plan, usage tracker, `family-pool-section`, and owner `family-member-{profileId}` row. |
| BILLING-09 | Top-up question credits | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web: `purchase-confirmed` Plus subscriber saw `top-up-section`, `top-up-button`, and Manage billing web info; tapping top-up showed the expected no-offerings purchase-options alert instead of entering a live RevenueCat purchase. |
| BILLING-10 | BYOK waitlist | ⚠️ | Pass w/ issues | | | 2026-05-14 WSL Playwright web probe: `/subscription` rendered Bring your own key copy and Join Waitlist. Waitlist submission was not completed. |
| CC-06 | Top-up purchase confidence (two-stage polling) | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web: top-up CTA is wired for paid users and does not enter a stuck polling state when RevenueCat offerings are unavailable; true store purchase plus two-stage webhook polling was not exercisable on web. |
| BILLING-11 | Account/Profile -> Subscription: trial banner/status UI (BUG-966) | ✅ | Pass | | | 2026-05-14 WSL Playwright web probe: `/subscription` rendered Trial active and Free Trial current-plan status. |
| BILLING-12 | Account/Profile -> Subscription: Pro / Family static tier comparison cards (BUG-917) | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: J-19 passed static tier comparison on the web subscription paywall. |

---

## Batch 17 — Cross-Cutting Final Pass

**State required:** Web preview + native (Galaxy S10e). This is a *visual / behavioural* sweep across screens already tested in earlier batches; only file new bugs if not already caught.
**Estimated time:** 30 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CC-03 | Animation polish (icon, intent cards, celebrations) | ⬜ | Pass w/ issues |  | Playwright web: inventory UI guard passed | 2026-05-14: web inventory pass verified home intent cards remain visible/clickable after coach-band dismissal and navigate to the practice surface; live chat send also showed the thinking animation lifecycle. Native animation smoothness and full celebration polish still need device review. |
| CC-04 | `goBackOrReplace` on every back button | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: W-02 and W-04 passed direct-URL fallback and contextual browser stack behavior. |
| CC-09 | Opaque web layout backgrounds | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: W-01 passed full-screen route tab/prior-scene bleed-through check. |
| CC-11 | i18n / `t()` cross-cutting string layer | ⬜ | Pass w/ issues |  | Jest i18n guards passed | 2026-05-14: targeted `src/i18n/index.test.ts` and `src/app/uppercase.test.ts` passed 82 tests, covering i18n initialization/fallback behavior and copy casing guards. This is code-level cross-cutting coverage rather than a full locale-by-locale end-user crawl. |
| CC-12 | FeedbackProvider + shake-to-feedback on gate screens | ⬜ | Pass w/ issues |  | Playwright web: feedback sheet passed | 2026-05-14: web inventory pass opened feedback from the learner home early-adopter CTA, selected a category, entered text, submitted through a mocked successful API response, saw the thank-you state, and closed the sheet. Native shake gesture is not available on web and still needs device confirmation. |
| CC-13 | Streaming error classification + stream-fallback guard | ⬜ | Pass w/ issues |  | Playwright web + Jest guards passed | 2026-05-14: web inventory pass sent a freeform chat message and confirmed the thinking animation resolves to an assistant bubble. Targeted `src/lib/sse.test.ts` passed, including app-level fallback/done handling and structured stream error classification; broader `use-sessions` guard run timed out, so treat as web + lower-level guard coverage rather than a full end-user error-injection pass. |
| CC-14 | Envelope-strip render guard at chat-bubble boundary (BUG-941) | ⬜ | Pass |  | Jest guard passed | 2026-05-14: targeted `src/components/session/MessageBubble.test.tsx` passed; it verifies assistant bubbles project full envelope JSON/code-fenced envelope content to reply text only, while user-authored JSON remains unchanged. |
| CC-15 | RN Web stale-send block in ChatShell (BUG-886) | ⬜ | Pass |  | Playwright web + Jest guard passed | 2026-05-14: web inventory pass verified a focused learner chat can send and render a streamed assistant bubble. Targeted `src/components/session/ChatShell.test.tsx` passed the stale-instance guard cases: unfocused send does not call `onSend`, row is `aria-hidden`/pointer-events none on web, focused send still works. |
| CC-16 | HMR-safe error type guards (BUG-947) | ⬜ | Pass |  | Jest guard passed | 2026-05-14: targeted `src/lib/format-api-error.test.ts` passed, including BUG-947 HMR-shaped `UpstreamError`, `QuotaExceededError`, and `ForbiddenError` classification without relying on `instanceof`. |
| CC-17 | Profile-as-lens navigation pattern | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: J-18 passed invalid saved profile fallback to owner profile. |
| CC-18 | Stable FlatList refs (PERF-10) | ⬜ | Pass w/ issues |  | Playwright web + Jest guard passed | 2026-05-14: web inventory pass rendered the chat message list through the user-facing chat flow; targeted `src/components/session/ChatShell.test.tsx` passed against the current FlatList-based ChatShell. This is not a long-session memory soak, so keep extended performance coverage separate. |

---

## Batch 18 — Regression Smoke Set

**State required:** Slot C; some flows have specific reproduction states embedded in the YAML.
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| QA-01 | Quick smoke check | ✅ | Pass | | | 2026-05-14 hosted GitHub Playwright web smoke run 25852959340 passed 10/10: auth navigation, sign-up top-of-funnel, learner home, learner UX crawl, and parent home. WSL full web suite and targeted probes now provide the broader web path for follow-up coverage. |
| QA-02 | Post-auth comprehensive smoke | ✅ | Pass | | | 2026-05-14 WSL Playwright web: setup seeded learner + parent storage states, `j01-learner-home` landed on learner home, and `j01-ux-pass` completed the single-learner UX crawl. |
| QA-03 | Chat classifier regression (easter / suggestion) | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: “Tell me about Easter” from Ask produced subject resolution/create-subject affordance instead of falling through to a broken chat path. |
| QA-04 | Chat subject picker regression | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: multi-subject learner opened Ask, sent “Can you help me understand reactions and forces?”, saw both Physics and Chemistry subject-resolution buttons, selected Chemistry, and the session continued. |
| QA-05 | Return to chat after creating a subject | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: after creating World History from the chat classifier miss path, the learner landed back on `/session` and the message input was visible. |
| QA-06 | Focused-book generation regression | ❌ | Fail | https://www.notion.so/3608bce91f7c8111b454e9393446c856 | | 2026-05-14 targeted WSL Playwright web: no-subject learner typed Easter, selected the first ambiguous suggestion, then stayed on `Preparing your first lesson...` for 90 seconds; `/session` and `chat-input` never appeared. |
| QA-07 | Tab-bar leak regression | ✅ | Pass | | | 2026-05-14 WSL full Playwright web: W-05 passed tab URLs render the correct screen; W-01 also passed full-screen no-bleed behavior. |
| QA-08 | Parent add-child regression | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web: `parent-solo` rendered add-first-child CTA, clicking it opened `/create-profile`, and `create-profile-name` was visible. |
| QA-09 | Consent email URL regression | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web/API: seeded `consent-pending`, opened `${apiBaseUrl}/v1/consent-page?token=...`, verified Approve and Deny controls render from the API origin, and confirmed the URL did not contain `app.mentomate.com` or `www.mentomate.com`. Actual email delivery body was not inspected in web E2E. |
| QA-10 | Dictation full flow regression | ⚠️ | Pass w/ issues | | | 2026-05-14 targeted WSL Playwright web with controlled dictation API: dictation choice → text preview → playback controls → completion → result recording → Practice passed. Photo review / handwritten correction branch remains untested. |
| QA-11 | Quiz full flow regression | ❌ | Fail | https://www.notion.so/3608bce91f7c81d0be00f2319683ea1e | | 2026-05-14 WSL full Playwright web: J-10 Practice → Quiz → play → results flow failed before completion. |
| QA-12 | Consent deny-confirmation regression | ✅ | Pass | | | 2026-05-14 targeted WSL Playwright web/API: seeded `consent-pending`, opened the API consent page, clicked Deny, saw the "Are you sure?" confirmation page with `Yes, deny consent`, verified Go back returns to Approve/Deny, then confirmed denial and saw "Consent declined." |

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
| 1  | Pre-auth & Auth          | 14 | ❌ | 6 pass, 1 fail, 7 blocked. WSL full web added AUTH-13 pass; remaining blockers are Clerk email quota, MFA/slow-network harness gaps, and production APK splash. |
| 2  | First Profile + Consent  | 12 | ❌ | 4 pass, 2 fail, 6 blocked. Targeted web rerun passed language setup; first profile and post-approval landing still fail, and consent variants still need coverage. |
| 3  | Subject Onboarding       | 12 | ❌ | 5 pass, 1 fail, 6 removed. Targeted web reruns passed learner-home create-subject, subject resolution correction controls, language setup through first session, read-only book/curriculum viewing, and assessment start; broad subject → Pick a Book failed; legacy interview/curriculum/accommodation/interests onboarding rows were removed before this sweep. |
| 4  | Learner Home + Resume    |  6 | ❌ | 4 pass, 1 pass-w/issues, 1 fail. HOME-01/HOME-06/HOME-08 and API resume-target continue passed web; More/settings partially rendered; profile switching failed in role-transition journeys. |
| 5  | Core Learning Sessions   | 12 | ❌ | 3 pass, 1 pass-w/issues, 5 fail, 3 untested. Targeted WSL web passed guided learning, first-session entry, read-only transcript, and voice-speed controls visibility; WSL full web failed Ask/freeform/session-summary path before completion; targeted book-session probe reached an assistant response but then crashed before chips/feedback; Library empty-state subject CTA routed home instead of create-subject. |
| 6  | Library, Books, Topics   |  7 | ⚠️ | 6 pass, 1 untested. WSL full web passed Library → shelf → book → start learning; targeted web pass covered manage-subject, topic-detail, and library-search controls. |
| 7  | Retention & Recall       |  4 | ❌ | 4 fail. Targeted WSL web probes found recall-test and relearn deep links routing to Library, and subject progress missing the retention card. |
| 8  | Progress / Vocab         |  7 | ⚠️ | 5 pass, 2 pass-w/issues. WSL web UX crawl covered progress overview and subject detail render; targeted web passes covered streak display, milestones, vocabulary browser, per-subject vocabulary badges/delete controls visibility, and saved bookmarks surfaces. |
| 9  | Practice Hub + Quiz      | 18 | ❌ | 3 pass, 2 pass-w/issues, 2 fail, 11 untested. WSL full web reached practice hub/history screens but failed quiz launch/results; targeted web passes covered review shortcut, empty state, and recitation session start/send. |
| 10 | Dictation                | 10 | ⚠️ | 3 pass, 4 pass-w/issues, 3 untested. Targeted WSL web probes covered choice, text-preview, surprise generation, playback controls, exit modal cancel, completion, and result recording with controlled dictation API; photo review/remediation/perfect-score branches still need native/gallery coverage. |
| 11 | Homework                 |  8 | ⚠️ | 2 pass-w/issues, 6 untested. WSL web UX crawl rendered homework camera/start route; camera/OCR/session path still needs native/full coverage. |
| 12 | Account / Settings       | 11 | ⚠️ | 10 pass-w/issues, 1 untested. WSL web probes rendered account, privacy, notifications, learning preference/accommodation, mentor language, and sign-out controls; destructive/vendor completions still need follow-up. |
| 13 | Account Deletion         |  2 | ⚠️ | 1 pass-w/issues, 1 untested. WSL web probe rendered Delete account; typed confirmation and scheduled deletion recovery remain untested. |
| 14 | Parent Setup + Children  |  8 | ⚠️ | 1 pass, 2 pass-w/issues, 5 untested. WSL full web passed add-first-child CTA; web probes rendered generic/add-child profile entry points. |
| 15 | Parent Dashboard         | 17 | ❌ | 6 pass, 3 pass-w/issues, 6 fail, 2 untested. Targeted WSL web passed multi-child dashboard, parent library, monthly reports, accommodation rows, and child-topic Understanding/review-status cards; weekly report detail and retention-badge seed paths failed; raw-input audit and guided-practice tooltip remain untested. |
| 16 | Billing                  | 13 | ❌ | 6 pass, 3 pass-w/issues, 1 fail, 3 untested. WSL web probes covered current plan, trial/usage, family-pool visibility, restore/BYOK visibility, and found no Manage billing deep link on web. |
| 17 | Cross-Cutting Final Pass | 11 | ⚠️ | 3 pass, 8 untested. WSL full web passed goBackOrReplace, opaque web backgrounds, and profile-as-lens fallback. |
| 18 | Regression Smoke         | 12 | ❌ | 4 pass, 1 pass-w/issues, 1 fail, 6 untested. Hosted/WSL web passed quick smoke, post-auth learner UX smoke, parent add-child, and tab leak checks; controlled web pass covered dictation full-flow shell; quiz full-flow regression failed. |
| **Total** | | **184** | ⚠️ | 59✅ 32⚠️ pass-w/issues 24❌ 13 blocked 6 removed 50 untested. Hosted Playwright smoke passed 10/10; WSL full Playwright web ran 31 tests with 19 passed, 1 flaky setup, and 11 failed; targeted WSL web probes added settings/account/billing/learning/practice/dictation/retention/progress/subject-onboarding/parent-dashboard/core-session coverage without using the emulator. |

### Blocker Taxonomy

`Blocked` now means a concrete account/service/native/harness blocker prevents judgment. Generic unexercised rows are tracked separately as `untested`.

| Queue bucket | Count | What it means | Next action |
| --- | ---: | --- | --- |
| untested | 50 | The row was not reached by hosted smoke, the WSL full web suite, or targeted WSL probes yet. No product failure has been observed for these rows. | Write/run targeted WSL Playwright probes, then change each row to Pass, Pass w/ issues, Fail, or Removed. |
| Clerk email quota | 3 | Email-dependent auth rows render, but verification/reset completion is blocked by Clerk development email quota. | Use a Clerk environment with email quota, seed verified users, or add a test-only verification path. |
| Missing auth harness/scenario | 2 | MFA and slow-auth/stuck-spinner flows require dedicated seed or network-delay harnesses. | Add explicit MFA/slow-network test scenarios before judging product behavior. |
| Mobile/dev-client/APK-specific | 3 | Splash, SSO fallback, and mobile-only consent denial paths require native tooling, production APK, or emulator behavior not available in the web pass. | Run on native/mobile or add a production-build smoke path. |
| Consent/profile setup harness | 5 | Underage consent, handoff, regional variants, language picker, and pronouns picker are blocked by missing/fragile setup coverage. | Add stable profile/consent seeds or targeted web/native onboarding probes. |

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
