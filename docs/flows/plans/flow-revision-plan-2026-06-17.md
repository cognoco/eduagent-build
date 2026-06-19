> **STATUS: P0 ISSUE MAP + RERUN UPDATED 2026-06-19** — all 280 flow-plan rows marked from the Chrome/Chromium browser sweep, seeded scenarios, and source-backed checks for dormant/native-only paths. Targeted reruns have cleared the rows tied to WI-818, WI-819, WI-820, WI-822, WI-824, WI-825, WI-826, and WI-853; WI-859 replaced the QA-03/QA-04 closure proof with deterministic jest coverage. WI-821 still fails on recap detail. Remaining failure issues: WI-821, WI-823. Remaining P0 pass-with-issues rows are now mapped to Cosmo items WI-854 through WI-865.

# Mobile App Flow Revision Plan

Source inventory: [`mobile-app-flow-inventory.md`](../mobile-app-flow-inventory.md) (rebuilt + re-verified 2026-06-09). Companion E2E gap audit: [`e2e-flow-coverage-audit-2026-05-13.md`](../e2e-flow-coverage-audit-2026-05-13.md).

**Reset 2026-06-17:** every flow row is marked not yet tested (`⬜`) so the revision can restart from the current inventory (re-verified 2026-06-09 by a 33-agent code audit, ~280 flows). All prior pass/fail/blocker notes belonged to the superseded 184-item 2026-05-14 snapshot and have been dropped. **Batches now mirror the inventory's own 9 content sections** rather than the old 18-batch split, so every row traces 1:1 to a row in `mobile-app-flow-inventory.md`. The Operating Instructions, account-slot contract, and cross-cutting rules below are carried over unchanged; where they cite "Batch N" treat it as the equivalent section batch.

**Execution update 2026-06-18:** Tested with Chrome/Chromium browser tooling only (no emulator), using seeded scenarios where available and 16 helper/subagent passes across the nine inventory sections. True native/device-provider paths are marked `🚫 Blocked`; dormant or stale inventory paths are marked `➖ Removed`; source-backed or partially browser-reachable rows are marked `⚠️ Pass w/ issues` with notes.

**Rerun update 2026-06-18:** Targeted staging Chrome/Chromium reruns were completed for rows tied to `WI-819`, `WI-821`, `WI-824`, and `WI-826`. `WI-819` rows passed through J-08 and J-11 live-session journeys; `WI-824` rows passed through the profile-limit upgrade path; `WI-826` rows passed through the withdrawal countdown banner path. `WI-821` partially improved because the Recaps list loads rows, but recap detail still renders the error state and remains failed. `WI-808` / `ic-116` were test-fixture-only commits with no direct manual/browser flow row in this plan.

**Remediation update 2026-06-18 (WI-825):** subject-onboarding drift resolved in the inventory and J-09 browser expectations. SUBJECT-05/07/08/18 now distinguish broad topic-interest picker, language setup, and first-focused-subject `/ready` behavior.

**Remediation update 2026-06-19 (WI-820):** QUIZ-18 no-round guard fixed and rerun in Chrome/Playwright. Cold navigation to `/quiz/play` without a round now renders `quiz-play-no-round` recovery controls instead of redirecting into an Internal Server Error.

**Remediation update 2026-06-19 (WI-853):** BILLING-13 owner in-chat daily quota card now has Chrome/Playwright coverage through J-26. The seeded exhausted-owner session reaches `quota-exceeded-card`, shows owner daily usage copy and disabled input, and the upgrade CTA opens Subscription.

**Remediation update 2026-06-19 (WI-859):** QA-03 (chat classifier regression) and QA-04 (chat subject-picker regression) now have deterministic jest coverage that no longer depends on live-LLM branch variance. The classifier miss/suggestion shape is pinned at the route layer (`apps/api/src/routes/subjects.test.ts` — multi-candidate + `suggestedSubjectName` passthrough, plus `assertNotProxyMode` 403 guards on `/subjects/classify` and `/subjects/resolve`) and at the service layer (`apps/api/src/services/subject-classify.test.ts`, pre-existing). The picker branch is forced deterministically in the mobile hook (`apps/mobile/src/components/session/use-subject-classification.test.ts` — single-subject auto-match, multi-candidate picker choosing the intended subject, resolve fallback) and at the screen-integration layer (`apps/mobile/src/app/(app)/session/index.test.tsx` — no-enrolled-subjects create-new escape hatch). The Maestro YAML flows (`regression/bug-233-chat-classifier-easter.yaml`, `regression/bug-234-chat-subject-picker.yaml`) remain smoke/historical evidence only, not the closure proof.

**Remediation update 2026-06-19 (WI-818):** AUTH-11/AUTH-17 forced re-entry banners rerun in staging Chrome/Playwright. The mentor-audit pre-shell storage-state mutator now clears Clerk's unsuffixed and instance-suffixed session cookies before seeding the expired/revoked banner markers, so both `/sign-in` banner rows render instead of falling through to Home.

**Remediation update 2026-06-19 (WI-822):** BILLING-08 family-pool removal path fixed and rerun in Chrome/Playwright. The `mentor-audit-family-pool-members` seed now lands the owner in family context, the family-pool flow exercises a removable child row, and the browser regression confirms confirm/remove/list-refresh behavior.

**P0 issue-map update 2026-06-19:** BILLING-13 is resolved by `WI-853`; the remaining 22 P0 pass-with-issues rows are grouped into 12 Cosmo issue clusters so shared blockers are visible before further implementation: `WI-854` HOME-15, `WI-855` SUBJECT-20, `WI-856` ACCOUNT-32/38, `WI-857` QA-02/15, `WI-858` SUBJECT-06/22, `WI-859` QA-03/04, `WI-860` QA-05/06/07, `WI-861` HOMEWORK-08/09, `WI-862` QUIZ-02/16, `WI-863` DICT-03/05/06, `WI-864` LEARN-50, and `WI-865` CC-05.

**P1 issue-map update 2026-06-19:** Remaining V2-primary P1 pass-with-issues rows are grouped into three Cosmo issue clusters under Flow Remediation: `WI-870` AUTH-03/05/06/08/09 auth-provider handoffs, `WI-871` ACCOUNT-17/19/20/21/22/24/25/26/27 + QA-09/12 consent handoffs, and `WI-872` PARENT-01/02/03/14/16/17/22/24/25 + QA-08 parent/family branch coverage.

## Purpose

Walk every flow in the inventory, log normal defects as Cosmo issues (fixing only truly big blocking items — see Section 1), and update the inventory document where descriptions have drifted. **Total scope: 280 numbered flows across the inventory's 9 content sections + an open-ended discovery register for flows missing from the inventory.**

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
   1. **Log defects as new Cosmo issues** — one issue per defect (see Section 2). Do not fix them (see policy below).
   2. **Edit the inventory** for every drift/discovery (see Section 3).
   3. **Update this plan's row** with the final status, result, issue links, and a one-line note.
7. **Move on.** Don't try to fix anything during testing — you are a tester in this exercise, not a developer.

> **Bug-handling policy (this sweep).** You are a tester here, not a developer — **do not fix defects in code.** The *only* exception is a **truly big blocking item**: a blocker that makes the flow impossible to run at all (e.g. a missing seed/scenario) **OR** a blocker that affects more than 3 flows. Address those directly, so testing can continue. **Every other (normal) defect — single-flow breakage, drift, degraded UX, cosmetic, any P1/P2/P3 — is NOT addressed in code: log it as a new Cosmo issue and move on.** (i18n defects don't even get an issue — they're a separate cleanup; just note them.) This mirrors the inventory's own rule at [`mobile-app-flow-inventory.md`](../mobile-app-flow-inventory.md) line 9.

### 2. Logging bugs in Cosmo

Normal defects are **logged, not fixed** (see the bug-handling policy in Section 1). Each one becomes a new Cosmo issue.

**Where / how:** create the issue through **`/cosmo:capture`** (the Cosmo intake command) — it owns the canonical field schema, Stage/State defaults, and repo guard, so don't hand-roll a tracker write. One issue per defect.

**What each issue must carry:**

| Field | Value |
| --- | --- |
| Title | `[FLOW-ID] short imperative summary` — e.g. `[QUIZ-05] Mid-round quit confirm dialog dismisses on outside tap` |
| Priority | `P0`/`P1`/`P2`/`P3` — see severity guide below |
| Platform / tags | `API` / `Mobile-iOS` / `Mobile-Android` / `Packages` / `CI` as applicable |
| Provenance | note `flow-revision-2026-06-17 / Batch N / FLOW-ID` so the issue is traceable back to this sweep |

**Body content (one defect = one issue):**

- **Repro steps** — numbered list, observable preconditions first.
- **Expected** — what the inventory or product spec says should happen.
- **Actual** — what you observed.
- **Screenshot/recording** — attach or paste URL if hosted.
- **Build/SHA + device** — copy from your pre-flight notes.

**Severity guide (Priority field):**

| Priority | Use when |
| --- | --- |
| P0 | Crash, data loss, security/privacy leak, billing wrong, consent gate bypassed |
| P1 | Flow blocked or unusable for a primary persona; back button dead-ends; key feature broken |
| P2 | Flow works but UX is degraded; copy wrong; layout broken on small screen |
| P3 | Cosmetic, polish, nice-to-have |

> A P0/P1 is still **logged, not fixed** here — unless it also meets the Section 1 big-blocking bar (flow impossible to run, or blocks >3 flows), in which case you address it directly so the sweep can continue.

**Multiple defects per flow:** log separately — one issue = one fix. Do NOT bundle two unrelated defects into a single issue. Paste all issue links into the row's **Bugs** column, comma-separated.

**Existing issues:** before creating, search Cosmo for the same flow ID / symptom to avoid duplicates. If it already exists and matches, link to it instead of creating a new one; never reopen a closed issue — create a new one and link.

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
| Need an account/state I don't have, can't create from current persona | ⬜ | _(leave blank)_ | Do NOT mark Blocked — the flow has not been attempted. Leave Status ⬜ and Result blank; note the missing prerequisite in the row and flag in the batch summary so setup can be done; return after setup and re-test |
| Flow attempted but Apple/Google store gating actually prevents purchase from completing | 🚫 | `Blocked` | Blocked only because the flow was exercised and store gating proved to be the stopper. Document the exact point of failure in Notes; revisit after store enrolment |
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

---

## Batch 1 — Auth and Access

**State required:** No active session for pre-auth rows (Slot A, clean dev client); Slot C signed-in for sign-out / session-expired.
**Inventory section:** [`mobile-app-flow-inventory.md` → Auth and Access](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | App launch and auth gate | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| AUTH-02 | Sign up with email/password | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| AUTH-03 | Sign-up email verification: verify, resend, change email, back; setActive-failure retry preserves sessionId | ⚠️ | Pass w/ issues | WI-870 | ✅ 2026-06-19 | P1 issue mapped: add deterministic auth-provider handoff coverage for email verification, resend/change-email, and setActive retry beyond browser smoke. |
| AUTH-04 | Sign in with email/password | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| AUTH-05 | Additional verification | ⚠️ | Pass w/ issues | WI-870 | ✅ 2026-06-19 | P1 issue mapped with AUTH-03/06/08/09: provider verification/recovery handoff coverage needed beyond browser smoke. |
| AUTH-06 | Forgot/reset password | ⚠️ | Pass w/ issues | WI-870 | ✅ 2026-06-19 | P1 issue mapped with AUTH-03/05/08/09: deterministic coverage needed for provider/security challenge branches. |
| AUTH-07 | Auth screen navigation | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| AUTH-08 | OAuth sign in/up | ⚠️ | Pass w/ issues | WI-870 | ✅ 2026-06-19 | P1 issue mapped with AUTH-03/05/06/09: deterministic provider-completion/account-link coverage needed beyond browser smoke. |
| AUTH-09 | SSO callback completion/fallback/cancel | ⚠️ | Pass w/ issues | WI-870 | ✅ 2026-06-19 | P1 issue mapped with AUTH-03/05/06/08: deterministic callback/fallback/cancel coverage needed for native handoff branches. |
| AUTH-10 | Sign out | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| AUTH-11 | Session-expired forced sign-out + re-entry banner | ✅ | Pass | WI-818 | ✅ 06-19 | Rerun 2026-06-19 on staging Chrome/Playwright passed: `mentor-audit-session-expired` lands on `/sign-in` with `session-expired-banner` visible after clearing Clerk session cookie variants. |
| AUTH-12 | First-time vs returning sign-in copy | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| AUTH-13 | Deep-link auth redirect preservation | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| AUTH-14 | Sign-in transition spinner + stuck recovery: 8s | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| AUTH-15 | Welcome intro | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| AUTH-16 | Not-found catch-all with recovery | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| AUTH-17 | Session-REVOKED banner | ✅ | Pass | WI-818 | ✅ 06-19 | Rerun 2026-06-19 on staging Chrome/Playwright passed: `mentor-audit-session-revoked` lands on `/sign-in` with `session-revoked-banner` visible after clearing Clerk session cookie variants. |
| AUTH-18 | OAuth stuck-spinner watchdog | 🚫 | Blocked |  |  | Requires native OAuth custom tab/AppState transition; not testable in Chrome-only sweep. |

---

## Batch 2 — Profiles, Family, Consent, and Account

**State required:** Slot A (no profile) + Slots D/E for consent age variants; Slot C for account/settings; Slot K for the deletion lifecycle; Slots F/G/H for child/family profile rows.
**Inventory section:** [`mobile-app-flow-inventory.md` → Profiles, Family, Consent, and Account](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-01 | Create first profile | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-02 | Create additional profile | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-03 | Add child profile | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-04 | Profile switching via `/profiles` modal | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-05 | Profile-limit / family-plan gating for add-child | ✅ | Pass | WI-824 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome passed: profile-limit create-profile returned PROFILE_LIMIT_EXCEEDED, showed the upgrade alert, and routed to subscription after See plans. |
| ACCOUNT-06 | More hub | ⚠️ | Pass w/ issues |  |  | Profile-edit UI reached; avatar/media branch remains native-dependent. |
| ACCOUNT-07 | Notifications sub-screen | ⚠️ | Pass w/ issues |  |  | Add-child flow reached; some external parent email handoff branches were source-checked. |
| ACCOUNT-08 | Accommodation picker | ⚠️ | Pass w/ issues |  |  | Archived profile controls covered; restore edge case source-checked. |
| ACCOUNT-09 | Account security | ⚠️ | Pass w/ issues |  |  | Birthday/age copy covered; age-gate boundary branches source-checked. |
| ACCOUNT-10 | Export my data | ⚠️ | Pass w/ issues |  |  | Regional eligibility branch covered through seeded/source checks; no live regional provider event. |
| ACCOUNT-11 | Delete account: initial → confirming | ⚠️ | Pass w/ issues |  |  | Consent status surfaces covered; email-delivery branch covered separately as blocked. |
| ACCOUNT-12 | Scheduled-deletion state: Keep account | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-13 | Privacy policy | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-14 | Terms of service | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-15 | Self mentor memory: item delete/unsuppress, injection toggle, Tell-the-mentor, interest chips, clear-all | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-16 | Child mentor memory | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-17 | Child memory consent prompt | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped: add deterministic consent handoff/resume coverage for paths still dependent on email/deep-link provider behavior. |
| ACCOUNT-18 | Subject analogy preference | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-19 | Consent request during underage profile creation | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped with consent handoff cluster: seeded invite creation passes, but delivery/return coverage needs deterministic proof. |
| ACCOUNT-20 | Child → parent handoff phases on `/consent` | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped with consent handoff cluster: accept/deny UI is reachable, but mailbox/deep-link handoff coverage remains partial. |
| ACCOUNT-21 | Parent email entry / resend / change email | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped with consent handoff cluster: resend/change-email and regional provider branches need deterministic coverage. |
| ACCOUNT-22 | Consent pending gate: PENDING "send to parent" vs REQUESTED waiting UI | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped with consent handoff cluster: pending state passes, but reminder/delivery branch coverage remains deferred. |
| ACCOUNT-23 | Consent withdrawn gate | ⚠️ | Pass w/ issues |  |  | Consent expired/cleanup state source-checked; timer-driven expiry not accelerated in browser. |
| ACCOUNT-24 | Post-approval landing | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped with consent handoff cluster: resend/retry surface is covered, but external delivery/landing proof remains partial. |
| ACCOUNT-25 | Parent consent management: withdraw | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped with consent handoff cluster: withdrawal confirmation passes, but return-link/provider proof remains partial. |
| ACCOUNT-26 | Regional consent variants | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped with consent handoff cluster: seeded/source guard covered; provider handoff variants need deterministic coverage. |
| ACCOUNT-27 | Parent consent deny confirmation | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped with consent handoff cluster: invalid/expired-link source check exists; live expired-link proof remains missing. |
| ACCOUNT-28 | App language bottom sheet | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-29 | Mentor language row | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-30 | More under parent-proxy: tab removed ENTIRELY in both nav systems; residual route renders locked panel ONLY | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-31 | Celebration-level prefs | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-32 | Consent-gate "while you wait" previews: `PreviewSubjectBrowser` + `PreviewSampleCoaching` fully replace the pending gate; stati… | ⚠️ | Pass w/ issues | WI-856 | ✅ 2026-06-19 | Issue mapped: deterministic Chrome coverage needed for preview replacement branches. |
| ACCOUNT-33 | Pre-auth audience carrier → parent fast-path | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-34 | Post-OAuth save wizard | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-35 | Profile-limit upgrade gate: `POST /profiles` 402 `PROFILE_LIMIT_EXCEEDED` → "Upgrade required" alert → "See plans" → `/(app)/su… | ✅ | Pass | WI-824 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome passed: profile-limit create-profile returned PROFILE_LIMIT_EXCEEDED, showed the upgrade alert, and routed to subscription after See plans. |
| ACCOUNT-36 | Create-profile access-blocked screen | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-37 | Rename profile | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-38 | Consent-gate profile-switch escape: shown ONLY for 18+ adults sharing account with ≥1 minor | ⚠️ | Pass w/ issues | WI-856 | ✅ 2026-06-19 | Issue mapped with ACCOUNT-32: add deterministic adult profile-switch eligibility coverage. |
| ACCOUNT-39 | `/consent` deep-link guards: signed-out → sign-in redirect; foreign `profileId` → `consent-profile-not-found` + go-back | ✅ | Pass | WI-826 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome passed: after consent withdrawal, Home showed the withdrawal countdown banner and Reverse CTA for the child. |
| ACCOUNT-40 | Consent reminder cascade + day-30 auto-delete | 🚫 | Blocked |  |  | Requires timer/email cascade through day-30 deletion automation; not responsibly testable in one Chrome session. |
| ACCOUNT-41 | Withdrawal countdown banner on Home: per-child warning during 7-day grace with one-tap "Reverse" restore | ✅ | Pass | WI-826 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome passed: after consent withdrawal, Home showed the withdrawal countdown banner and Reverse CTA for the child. |
| ACCOUNT-42 | Consent email-delivery-failed recovery: `emailStatus:'failed'` → failure copy + return-to-parent-phase retry; hard failure → 502 | 🚫 | Blocked |  |  | Requires forced email-delivery failure/SMTP or API fault injection. |
| ACCOUNT-43 | Security sessions / Manage devices: Clerk session list, per-session revoke, current badge; Clerk-only, no app API | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-44 | Family-pool breakdown-sharing toggle | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-45 | Withdrawal-archive preference | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-46 | Change email + Add password | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-48 | Help & Feedback: support mailto + "Report a problem" via `FeedbackProvider.openFeedback` | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-49 | Owner SELF memory-consent prompt: `MemoryConsentPrompt` inline on `/(app)/mentor-memory` when own status pending; "Use memory"… | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-50 | Child mentor-memory consent-withdrawn dead-end gate: whole screen replaced by `child-mentor-memory-consent-withdrawn` + Back; r… | ⚠️ | Pass w/ issues |  |  | Consent-withdrawn mentor-memory gate covered; deeper withdrawn-account lifecycle source-checked. |
| ACCOUNT-51 | Parent memory export: "Export memory summary" → share sheet / web `.txt` download; SELF export endpoint exists but mobile-dormant | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| ACCOUNT-52 | Parent correction escape hatch | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |

---

## Batch 3 — Home, Navigation, and Subject Setup

**State required:** Slot C (subjects + a partially-completed session) for learner home/resume; Slots F/G for parent gateway + add-child; check nav flags per environment before tab-shape rows.
**Inventory section:** [`mobile-app-flow-inventory.md` → Home, Navigation, and Subject Setup](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home: subject carousel, add tile, Ask Anything, quick actions, CoachBand | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-02 | Parent gateway home | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-03 | Tab shapes / mode navigation | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-04 | Animated splash behind dedicated error boundary | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-05 | Empty first-user state → `/create-subject` | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-06 | Resume interrupted session: SecureStore recovery marker → session push; else server resume target; subject-card "Continue" hint | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-07 | Add-first-child CTA for childless owners: `(showAddChild \ | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-08 | Home loading-timeout fallback | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-09 | "Own Learning" bridge tab | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-10 | App-layout gate stack + recoveries: auth → pending-redirect replay | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-11 | Study/Family ModeSwitcher | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-12 | Parent-proxy shell | ➖ | Removed |  |  | Parent-proxy shell is not reachable as a current end-user browser flow; inventory appears stale. |
| HOME-13 | `/dashboard` legacy redirect → `/(app)/home`, preserving `returnTo` | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-14 | Learner home degraded states: subjects-load error | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOME-15 | Home overlays: post-grace consent notice toast | ⚠️ | Pass w/ issues | WI-854 | ✅ 2026-06-19 | Issue mapped: pending notices may be hidden when empty-child dashboard falls back to demo data. |
| HOME-16 | EarlyAdopterCard | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| SUBJECT-01 | Create subject from learner home | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| SUBJECT-02 | Create subject from library | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| SUBJECT-03 | Create subject from chat | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| SUBJECT-04 | Create subject from homework | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| SUBJECT-05 | Subject resolution machine | ✅ | Pass | WI-825 | ✅ 2026-06-18 | WI-825 resolved: inventory + J-09 browser expectations now document broad topic-interest, language setup, and first-focused-subject `/ready` branches. |
| SUBJECT-06 | Broad subject → pick-book | ⚠️ | Pass w/ issues | WI-858 | ✅ 2026-06-19 | Issue mapped: refresh pick-book evidence/inventory for broad-subject branch. |
| SUBJECT-07 | Focused subject/book → first session: `POST first-curriculum` with up to 3 attempts | ✅ | Pass | WI-825 | ✅ 2026-06-18 | WI-825 resolved: focused first subject reaches `/ready`; broad subjects are explicitly separated into SUBJECT-06. |
| SUBJECT-08 | Per-subject native-language + CEFR setup | ✅ | Pass | WI-825 | ✅ 2026-06-18 | WI-825 resolved: language branch remains covered by J-09 and is no longer conflated with topic-interest picker behavior. |
| SUBJECT-12 | View curriculum without committing | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| SUBJECT-14 | Placement / knowledge assessment | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| SUBJECT-17 | Pronouns picker | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| SUBJECT-18 | First-subject "Ready" recap interstitial | ✅ | Pass | WI-825 | ✅ 2026-06-18 | WI-825 resolved: J-09 now asserts first focused subject lands on `/ready` before session. |
| SUBJECT-19 | Existing-subject "Continue" rows inside create-subject | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| SUBJECT-20 | Subject-limit dead-end recovery: regex-on-message classification | ⚠️ | Pass w/ issues | WI-855 | ✅ 2026-06-19 | Issue mapped: replace message-regex recovery with typed subject-limit error contract. |
| SUBJECT-21 | Curriculum retry endpoint | ⚠️ | Pass w/ issues |  |  | Covered by source/route review and adjacent seeded flows; not a distinct visible Chrome path. |
| SUBJECT-22 | Pick-book degraded/recovery states: missing-param guard; cycling loading + slow hint | ⚠️ | Pass w/ issues | WI-858 | ✅ 2026-06-19 | Issue mapped with SUBJECT-06: refresh degraded pick-book coverage evidence. |

---

## Batch 4 — Learning, Chat, Library, Retention, and Progress

**State required:** Slot C with several subjects + at least one book, voice/mic permission, overdue topics (force-age), and multi-day history (streak ≥ 2, ≥ 1 milestone, ≥ 1 language subject).
**Inventory section:** [`mobile-app-flow-inventory.md` → Learning, Chat, Library, Retention, and Progress](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-01 | Freeform chat | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-02 | Guided learning session | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-03 | First session experience: `BookmarkNudgeTooltip` | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-04 | Core learning loop | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-05 | Coach bubble visual variants | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-06 | Voice input + playback: VoiceToggle | 🚫 | Blocked |  |  | Requires microphone/audio capture and playback; not testable in Chrome-only sweep. |
| LEARN-07 | Session summary screen | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-08 | Library v3 subject-first shelf list | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-09 | Subject shelf → book selection | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-10 | Book detail + start learning: sticky CTA | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-11 | Manage subject status + **archive-first delete** | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| LEARN-12 | Topic detail: adaptive sticky CTA | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-13 | Recall check | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| LEARN-14 | Failed recall remediation | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| LEARN-15 | Relearn flow: 5 entries | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| LEARN-16 | Retention review from library | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| LEARN-17 | Progress overview tab | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-18 | Subject progress detail | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-19 | Streak display | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-20 | Milestones list | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-21 | Cross-subject vocabulary browser | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-22 | Per-subject vocabulary list | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-23 | Read-only session transcript | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-24 | Saved bookmarks: paginated list, tap-trash + confirm delete | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-25 | Library inline search | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-26 | First-curriculum session entry | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-27 | My Notes archive hub + lists: sessions → `/progress/sessions` archive; notes → `GET /notes`; bookmarks → `GET /bookmarks`; inva… | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-28 | Subject session archive from progress | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-29 | Self reports list + detail | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-30 | Library "next action" coach card | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-31 | Curriculum-complete banner | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-32 | Library degraded states: 15s `library-load-timeout`; hard `library-error`; `library-stale-banner` | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-33 | Book notes section: collapsible inline CRUD | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-34 | Delete book w/ started-topics double-confirm: 4xx `started_topics` → second destructive confirm w/ count → retry `confirmStarte… | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-35 | Topic-generation lifecycle: auto-trigger on ungenerated book; idle→slow(30s)→timed_out(60s) w/ retry; generation-failure alert | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-36 | Book-complete celebration card | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-37 | Past conversations list | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-38 | Book-route params `readOnly` + `autoStart` | ➖ | Removed |  |  | readOnly/autoStart route params are dormant/code-only in current browser-reachable app. |
| LEARN-39 | Vocabulary stack index back-trap: real `index` route seeded by `unstable_settings` so backing out of cross-tab push lands here… | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-40 | Archived-transcript summary card: `archived:true` transcript renders `ArchivedTranscriptCard` | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-41 | Session crash recovery: `SessionErrorBoundary` wraps every session render | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-42 | Expired/deleted session recovery: transcript 404 → `session_expired` system message, subtitle, disabled composer, "Start new se… | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-43 | Offline / server-unreachable gating: offline disables composer + hides chips; API-unreachable swaps subtitle only; failed durab… | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-44 | Parking lot | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-45 | Mid-session topic switcher + wrong-subject correction: TopicSwitcherModal | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-46 | Skip-warmup chip | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-47 | Message feedback | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-48 | In-session message bookmarks: toggle on persisted AI msgs + first-session nudge tooltip; confirmation toast | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-49 | In-session notes: "Add note" chip | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-50 | Challenge Round mobile surface | ⚠️ | Pass w/ issues | WI-864 | ✅ 2026-06-19 | Issue mapped: align Challenge Round docs/status and add deterministic mobile-surface proof or flag-gated rationale. |
| LEARN-51 | Auto-resume: topic entry w/o sessionId backfills active session via `router.setParams` → transcript hydration + resumed-banner… | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-52 | Parent-proxy session block: `ExplainedRedirect` w/ read-only copy + switch-profile CTA on any `/session/*`; V0 keeps legacy pro… | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-53 | Topic stack back-stop | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| LEARN-54 | Interleaved Retrieval | ➖ | Removed |  |  | Interleaved Retrieval is mobile-dormant in current build. |
| LEARN-55 | Verification overlays | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |

---

## Batch 5 — Practice Hub and Practice Activities

**State required:** Slot C; Slot J (free daily-quota cap) for quota/forbidden rows; an active language subject for dictation rows; camera permission for photo-review.
**Inventory section:** [`mobile-app-flow-inventory.md` → Practice Hub and Practice Activities](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PRACTICE-01 | Practice hub | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PRACTICE-02 | Review topics shortcut | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PRACTICE-03 | Recitation session | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PRACTICE-04 | "All caught up": next-review countdown or complete-a-topic copy + "Browse topics" → library; review card stays tappable at 0 ov… | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PRACTICE-05 | Assessment readiness row: "N topics ready" when eligible; otherwise a non-pressable locked hint with adaptive copy | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-01 | Activity picker: Capitals, per-language vocab cards | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-02 | Round generation loading: rotating copy, 20s soft hint, **30s hard timeout → ErrorFallback w/ re-armed retry** | ⚠️ | Pass w/ issues | WI-862 | ✅ 2026-06-19 | Issue mapped: add intercepted Chrome coverage for soft/hard timeout and retry re-arming. |
| QUIZ-03 | Play | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-04 | Guess Who progressive clue reveal | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-05 | Mid-round quit modal | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-06 | Round-complete error retry | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-07 | Results: celebration tiers, score/theme/XP, "What you missed" review section | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-08 | Quota / consent / forbidden typed errors on launch: Retry suppressed when recovery ≠ retry; friendly copy for upstream/timeout/… | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-09 | Quiz history | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-10 | Round detail: schema-validated | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-11 | Malformed-round guard | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-12 | Wrong-answer dispute | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-13 | Answer-check failure: assumes wrong + inline banner + platformAlert + Sentry; flag cleared per question | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-14 | Difficulty-bump challenge banner: `round.difficultyBump` → full-screen banner requiring explicit Start | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-15 | Final-question auto-save: immediate round submit; "saving" panel → See Results / One More; navigation queued if save in flight;… | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-16 | Home quiz-discovery card entry: Continue → mark-surfaced POST, then capitals/guess_who push `/(app)/quiz/launch` w/ `activityType` | ⚠️ | Pass w/ issues | WI-862 | ✅ 2026-06-19 | Issue mapped with QUIZ-02: force quiz discovery card and mark-surfaced branch in Chrome. |
| QUIZ-17 | Quiz index load-error retry | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QUIZ-18 | Play no-round guard | ✅ | Pass | WI-820 | ✅ 06-19 | Rerun 2026-06-19 on staging Chrome/Playwright passed: cold `/quiz/play` with no round renders `quiz-play-no-round`, Retry, and Go Home recovery controls; focused unit regression passed. |
| DICT-01 | Choice screen | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| DICT-02 | Text preview + edit | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| DICT-03 | "Surprise me" generation | ⚠️ | Pass w/ issues | WI-863 | ✅ 2026-06-19 | Issue mapped: add deterministic dictation generation coverage with controlled response. |
| DICT-04 | Playback | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| DICT-05 | Mid-dictation exit: hardware back AND visible Exit button → in-app Modal | ⚠️ | Pass w/ issues | WI-863 | ✅ 2026-06-19 | Issue mapped with DICT-03/06: cover visible Exit and native-safe hardware-back modal path. |
| DICT-06 | Completion: "I'm done" → result POST → practice; "Check my writing" → DICT-07; review spinner + cancel + 20s timeout; blur mark… | ⚠️ | Pass w/ issues | WI-863 | ✅ 2026-06-19 | Issue mapped with DICT-03/05: cover completion/review timeout and stale-context guard. |
| DICT-07 | Photo review of handwriting: camera | 🚫 | Blocked |  |  | Requires native camera/gallery/media or E2E gallery seam; not testable in Chrome-only browser sweep. |
| DICT-08 | Sentence-level remediation | 🚫 | Blocked |  |  | Requires native camera/gallery/media or E2E gallery seam; not testable in Chrome-only browser sweep. |
| DICT-09 | Perfect-score celebration | 🚫 | Blocked |  |  | Requires native camera/gallery/media or E2E gallery seam; not testable in Chrome-only browser sweep. |
| DICT-10 | Result recording w/ honest-failure retry alert | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| DICT-11 | Playback stale-context recovery | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| DICT-12 | Review no-data guard | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| DICT-13 | E2E-only gallery picker branch | 🚫 | Blocked |  |  | Requires native camera/gallery/media or E2E gallery seam; not testable in Chrome-only browser sweep. |

---

## Batch 6 — Homework and Parent Experience

**State required:** Slot C + camera/gallery permission and a written page for homework; Slots G/H (parent owner, 1 / 2+ children with learning history) for the parent dashboard + drill-downs.
**Inventory section:** [`mobile-app-flow-inventory.md` → Homework and Parent Experience](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOMEWORK-01 | Start homework | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOMEWORK-02 | Camera permission → viewfinder → preview → processing → result → error | 🚫 | Blocked |  |  | Native camera permission/viewfinder/capture branch cannot be completed in Chrome-only sweep. |
| HOMEWORK-03 | Manual entry | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOMEWORK-04 | Homework tutoring session | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| HOMEWORK-05 | Gallery import | 🚫 | Blocked |  |  | Requires camera/gallery/OCR or microphone/native media path. |
| HOMEWORK-06 | Image pass-through to vision | 🚫 | Blocked |  |  | Requires camera/gallery/OCR or microphone/native media path. |
| HOMEWORK-07 | Camera permission onboarding: auto OS prompt on undetermined; denied keyed on `!canAskAgain`; Settings redirect; AppState-resum… | 🚫 | Blocked |  |  | Native camera permission/viewfinder/capture branch cannot be completed in Chrome-only sweep. |
| HOMEWORK-08 | Image-attach failure fallback: base64 fail/timeout → text-only auto-send + VISIBLE system message + analytics event | ⚠️ | Pass w/ issues | WI-861 | ✅ 2026-06-19 | Issue mapped: harden fallback coverage for visible system message and analytics event. |
| HOMEWORK-09 | Subject resolution in result phase: auto-classify once per image; confident → "Looks like {subject}" + Change; LLM-suggestion +… | ⚠️ | Pass w/ issues | WI-861 | ✅ 2026-06-19 | Issue mapped with HOMEWORK-08: harden subject-resolution and reclassification coverage. |
| HOMEWORK-10 | Per-problem voice dictation: mic per problem card → `useSpeechRecognition`, transcript appends; on-device, second OS permission… | 🚫 | Blocked |  |  | Requires camera/gallery/OCR or microphone/native media path. |
| HOMEWORK-11 | Problem-card editing: OCR split into cards; dropped low-confidence fragments restorable via chip; add/remove cards; 8000-char U… | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| HOMEWORK-12 | Close/back semantics: always `router.replace(homeHrefForReturnTo)` | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-01 | Parent home mentoring hub | ⚠️ | Pass w/ issues | WI-872 | ✅ 2026-06-19 | P1 issue mapped: complete deterministic parent/family branch coverage for child, notification, and rate-limit paths not force-triggered live. |
| PARENT-02 | Multi-child dashboard: ≥2 children → family-summary panel | ⚠️ | Pass w/ issues | WI-872 | ✅ 2026-06-19 | P1 issue mapped with parent/family branch cluster: multi-child seeded coverage exists, but notification/rate-limit branches need deterministic proof. |
| PARENT-03 | Child detail drill-down: subject mentor-note cards + RecentSessionsList; URL modes default / `?mode=progress` | ⚠️ | Pass w/ issues | WI-872 | ✅ 2026-06-19 | P1 issue mapped with parent/family branch cluster: child detail browser/source coverage exists; edge branches need deterministic proof. |
| PARENT-04 | Child subject → topic drill-down: skeletons, error+retry, `topics-load-unknown` branch, new-learner empty split, recent-session… | ❌ | Fail | WI-823 |  | Parent bridge child topic/session/recap route entry surfaces were missing or could not return correctly. |
| PARENT-05 | Child session recap detail: narrative/highlight/engagement chip/conversation prompt + copy, AddToMyLearning, active-time | ❌ | Fail | WI-823 |  | Parent bridge child topic/session/recap route entry surfaces were missing or could not return correctly. |
| PARENT-06 | Child reports list + monthly detail: monthly + weekly merge w/ pinned latest-weekly hero, NEW badge, next-cron-date empty state… | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-08 | Subject raw-input audit | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-09 | Metric tooltips | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-10 | Understanding + retention cards on child topic | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-11 | Family Recaps feed + detail | ❌ | Fail | WI-821 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome partially improved: Recaps list loads rows, but opening a recap still shows We could not load this recap; detail branch remains failing. |
| PARENT-12 | Child-subject retention badges | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-13 | Child weekly report detail: marks viewed once | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-14 | Learn This Too clone | ⚠️ | Pass w/ issues | WI-872 | ✅ 2026-06-19 | P1 issue mapped with parent/family branch cluster: seeded/browser coverage exists; child/notification edge branches need deterministic proof. |
| PARENT-15 | Send-nudge action sheet: 4 templates; consent gate | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-16 | Nudge rate limit: 4 per recipient child per rolling 24h, counted on `toProfileId` regardless of sender, `pg_advisory_xact_lock`… | ⚠️ | Pass w/ issues | WI-872 | ✅ 2026-06-19 | P1 issue mapped with parent/family branch cluster: nudge rate-limit branch needs deterministic proof beyond seeded/source coverage. |
| PARENT-17 | Child curriculum overview | ⚠️ | Pass w/ issues | WI-872 | ✅ 2026-06-19 | P1 issue mapped with parent/family branch cluster: child curriculum coverage exists; edge branches need deterministic proof. |
| PARENT-18 | Child profile settings view | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-19 | Progress-nudge card | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-20 | Learn Together sheet: AddToMyLearning for latest-recap topic | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-21 | Child-cap quota notifications on parent home: dismissible warning banners w/ reset time | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| PARENT-22 | Family-route blocked gate | ⚠️ | Pass w/ issues | WI-872 | ✅ 2026-06-19 | P1 issue mapped with parent/family branch cluster: seeded/source coverage exists; blocked-gate edge branches need deterministic proof. |
| PARENT-23 | Demo dashboard fallback | ➖ | Removed |  |  | Demo dashboard fallback is not a reliable current end-user Chrome flow; hook/API-testable only. |
| PARENT-24 | Parent-home ambient layer: household-pulse subtitle, `ParentTransitionNotice` | ⚠️ | Pass w/ issues | WI-872 | ✅ 2026-06-19 | P1 issue mapped with parent/family branch cluster: parent-home ambient coverage exists; notification/transition edge proof remains partial. |
| PARENT-25 | Progress-tab nudge entry: guardian viewing linked child w/ `nudgeRecommended` → `progress-nudge-cta` opens NudgeActionSheet | ⚠️ | Pass w/ issues | WI-872 | ✅ 2026-06-19 | P1 issue mapped with parent/family branch cluster: progress-tab nudge entry needs deterministic child/rate-limit proof. |

---

## Batch 7 — Billing and Monetization

**State required:** Slot I (trialing) for upgrade flows; Slot J (quota-capped) for paywall; Slot G child profile for child paywall; RevenueCat sandbox account on device. Risk: Apple/Google store gating may force 🚫 Blocked.
**Inventory section:** [`mobile-app-flow-inventory.md` → Billing and Monetization](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Subscription screen: plan, status badge | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| BILLING-02 | Upgrade purchase + confirmation polling | 🚫 | Blocked |  |  | Requires native store purchase/restore/top-up or push-notification tap. |
| BILLING-03 | Trial/usage/family composite | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| BILLING-04 | Restore purchases | 🚫 | Blocked |  |  | Requires native store purchase/restore/top-up or push-notification tap. |
| BILLING-05 | Manage billing: native deep link w/ retry + fallback-URL alert | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| BILLING-06 | Child paywall | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| BILLING-07 | Daily-quota-exceeded adult path: NO paywall branch | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| BILLING-08 | Family pool section + **member removal** | ✅ | Pass | WI-822 | ✅ 06-19 | Rerun 2026-06-19 in Chrome/Playwright passed: seeded family owner saw removable child controls, confirmed removal, and the list refreshed with the removed child hidden and the remaining child still visible. |
| BILLING-09 | Top-up credits | 🚫 | Blocked |  |  | Requires native store purchase/restore/top-up or push-notification tap. |
| BILLING-10 | BYOK waitlist | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| BILLING-11 | Trial banner states | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| BILLING-12 | Static tier comparison | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| BILLING-13 | In-chat quota-exceeded card | ✅ | Pass | WI-853 | ✅ 2026-06-19 | Chrome/Playwright J-26 covers seeded owner daily quota in an active session: send shows `quota-exceeded-card`, owner usage copy, disabled input, and upgrade routes to Subscription. |
| BILLING-14 | Cross-feature upsell entries → `/(app)/subscription`: create-profile 402 "See plans" | ✅ | Pass | WI-824 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome passed: profile-limit create-profile returned PROFILE_LIMIT_EXCEEDED, showed the upgrade alert, and routed to subscription after See plans. |
| BILLING-15 | Push-notification tap → subscription: `subscribe_request` + `trial_expiry` | 🚫 | Blocked |  |  | Requires native store purchase/restore/top-up or push-notification tap. |
| BILLING-16 | Subscription screen timeout/error recovery: 15s TimeoutLoader w/ retry + go-back | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |

---

## Batch 8 — Regression and System Flows

**State required:** Slot C; several rows embed specific reproduction seeds in their flow file — read the inventory Coverage column before running.
**Inventory section:** [`mobile-app-flow-inventory.md` → Regression and System Flows](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| QA-01 | Quick smoke check | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QA-02 | Post-auth comprehensive smoke | ⚠️ | Pass w/ issues | WI-857 | ✅ 2026-06-19 | Issue mapped: align smoke manifest/status with current Chrome/deep-link coverage. |
| QA-03 | Chat classifier regression | ✅ | Pass | WI-859 | ✅ 2026-06-19 | Deterministic jest coverage replaces live-LLM evidence: route + service tests pin the classifier miss/suggestion shape (multi-candidate + `suggestedSubjectName` passthrough; proxy-mode 403 guard on classify/resolve). YAML flow is smoke/historical only. |
| QA-04 | Chat subject picker regression | ✅ | Pass | WI-859 | ✅ 2026-06-19 | Deterministic jest coverage forces the picker branch: hook tests cover single-subject auto-match, multi-candidate picker (learner picks the intended subject, no silent first-subject fallback), and resolve fallback; the session-screen integration test covers the no-enrolled-subjects create-new escape hatch. YAML flow is smoke/historical only. |
| QA-05 | Return to chat after subject create | ✅ | Pass | WI-860 | ✅ 2026-06-19 | Reconciled — already covered, no new test needed. `create-subject.test.tsx` [BUG-236] asserts `returnTo=chat` after creation routes to `/(app)/session` (freeform, NOT picker), and the no-`returnTo` default routes to `/(app)/pick-book/[subjectId]` (NOT session) — both branches, default behavior unchanged. |
| QA-06 | Focused-book generation regression | ✅ | Pass | WI-860 | ✅ 2026-06-19 | Reconciled — already covered, no new test needed. Service: `subject.test.ts` covers server-side focus derivation (`name:'Botany', rawInput:'tea'`, no explicit focus → `focused_book` prewarm), explicit focus → `focused_book`, and ambiguous/no-focus → `broad`. UI: `create-subject.test.tsx` [BUG-237] derives focus from original input → `/ready`; J-09 web journey `j09-learn-create-subject-onboarding.spec.ts` reaches the `ready-screen`/`/ready` interstitial for a focused first subject. |
| QA-07 | Tab-bar leak regression | ✅ | Pass | WI-860 | ✅ 2026-06-19 | Added a small assertion to close the one uncovered branch. `_layout.test.tsx` now unit-tests the exported `HIDDEN_TAB_ROUTES` guard (Bug 763 belt-and-braces `href:null`): asserts every dynamic/nested route (`shelf`, `subject`, `pick-book`, `child`, etc.) is hidden and no real tab route is. Render-path coverage was impossible (`Tabs.Screen` is a `() => null` stub). |
| QA-08 | Parent add-child regression | ⚠️ | Pass w/ issues | WI-872 | ✅ 2026-06-19 | P1 issue mapped with parent/family branch cluster: browser/source checks exist; native/automation branches need deterministic proof. |
| QA-09 | Consent email URL regression | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped with consent handoff cluster: browser/source checks exist; email/deep-link branch proof remains partial. |
| QA-10 | Dictation full-flow regression | 🚫 | Blocked |  |  | Requires full native dictation camera/audio path. |
| QA-11 | Quiz full-flow regression | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| QA-12 | Consent deny-confirmation | ⚠️ | Pass w/ issues | WI-871 | ✅ 2026-06-19 | P1 issue mapped with consent handoff cluster: browser/source checks exist; denial/deep-link branch proof remains partial. |
| QA-13 | Sign-in/out loop regression | ⚠️ | Pass w/ issues |  |  | Covered by browser smoke/source/unit-linked checks; not all native/automation branches completed live. |
| QA-14 | SSE reconnect | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| QA-15 | Preview/onboarding regression cluster | ⚠️ | Pass w/ issues | WI-857 | ✅ 2026-06-19 | Issue mapped with QA-02: update preview/onboarding coverage away from hidden CTA assumptions. |

---

## Batch 9 — Cross-Cutting Behaviors

**State required:** Web preview + native (Galaxy S10e). Visual / behavioural sweep across screens already exercised in earlier batches; only file new bugs if not already caught.
**Inventory section:** [`mobile-app-flow-inventory.md` → Cross-Cutting Behaviors](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CC-01 | Conversation-stage chips | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-02 | Greeting-aware classification | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-03 | Animation polish: `BrandCelebration`, `CelebrationAnimation`, session celebrations wired via `useCelebration` w/ learner celebr… | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-04 | `goBackOrReplace` universal back pattern | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-05 | Continue-where-you-left-off: SecureStore recovery marker takes priority; else server resume target; else overdue review | ⚠️ | Pass w/ issues | WI-865 | ✅ 2026-06-19 | Issue mapped: document native boundary or add priority-collision coverage. |
| CC-06 | Top-up purchase confidence: two-stage polling progress + confident timeout copy | 🚫 | Blocked |  |  | Top-up purchase confidence depends on native store purchase completion. |
| CC-07 | Accommodation badge surfaces: non-deletable badge on mentor-memory; selector on child settings + self settings; role-gated capt… | ⚠️ | Pass w/ issues |  |  | Cross-cutting behavior covered by seeded/source checks; full branch matrix not forced live. |
| CC-08 | Parent-facing metric vocabulary canon | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-09 | Opaque web layout backgrounds | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-10 | Quiz streak/XP recording is server-side inside round completion | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-11 | i18n `t()` layer | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-12 | FeedbackProvider + shake-to-feedback on gate screens; Help screen "Report a problem" opens the same sheet | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-13 | Streaming error classification + stream-fallback guard | ✅ | Pass | WI-819 | ✅ 06-18 | Rerun 2026-06-18 on staging Chrome via J-08 and J-11 passed: freeform chat, library-to-book session, two live sends, close/summary, and reconnect recovery completed without repeated lost-connection. |
| CC-14 | Envelope-strip render guard at chat-bubble boundary | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-15 | RN Web stale-send block in ChatShell | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-16 | HMR-safe error type guards in `format-api-error.ts` | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-17 | Profile-as-lens navigation: child routes carry `[profileId]`; `useActiveProfileRole()` gates destructive actions under proxy | ⚠️ | Pass w/ issues |  |  | Cross-cutting behavior covered by seeded/source checks; full branch matrix not forced live. |
| CC-18 | Stable FlatList refs | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-19 | Mode-navigation contract controls tab shape + route access | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |
| CC-20 | Parent bridge provenance + return targets | ❌ | Fail | WI-823 |  | Parent bridge provenance/return targets failed with missing bridge surfaces. |
| CC-21 | Post-session pipeline | ✅ | Pass |  |  | Covered in Chrome/browser sweep with seeded scenarios; no product defect found. |

---

## Discovered Flows (Not in Inventory)

If a flow is found in the app but is missing from `mobile-app-flow-inventory.md`, add it here AND in the inventory in the same edit. Use a temporary ID `DISC-NN` until the inventory assigns a real ID.

| Temp ID | Flow | Found in batch | Routes / entry points | Inventory updated | Notes |
| --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | |

---

## Master Roll-Up

Updated from the 2026-06-18 Chrome/Chromium sweep plus targeted 2026-06-19 reruns. Row-level notes remain the source of truth for per-flow evidence and linked Cosmo issues.

| Batch | Section | Items | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | Auth and Access | 18 | ⚠️ | Rerun updated 2026-06-19: 12 ✅, 5 ⚠️, 0 ❌, 1 🚫. |
| 2 | Profiles, Family, Consent, and Account | 51 | ⚠️ | Rerun updated 2026-06-18: 30 ✅, 19 ⚠️, 0 ❌, 2 🚫. |
| 3 | Home, Navigation, and Subject Setup | 32 | ⚠️ | Rerun updated 2026-06-18: 26 ✅, 5 ⚠️, 1 ➖. |
| 4 | Learning, Chat, Library, Retention, and Progress | 55 | ⚠️ | Rerun updated 2026-06-18: 51 ✅, 1 ⚠️, 0 ❌, 1 🚫, 2 ➖. |
| 5 | Practice Hub and Practice Activities | 36 | ⚠️ | Rerun updated 2026-06-19: 27 ✅, 5 ⚠️, 0 ❌, 4 🚫. |
| 6 | Homework and Parent Experience | 36 | ❌ | Rerun updated 2026-06-18: 16 ✅, 11 ⚠️, 3 ❌, 5 🚫, 1 ➖. |
| 7 | Billing and Monetization | 16 | ✅ | Rerun updated 2026-06-19: 12 ✅, 0 ⚠️, 0 ❌, 4 🚫. |
| 8 | Regression and System Flows | 15 | ⚠️ | Rerun updated 2026-06-19: 5 ✅, 9 ⚠️, 0 ❌, 1 🚫 (QA-03/QA-04 → deterministic jest, WI-859). |
| 9 | Cross-Cutting Behaviors | 21 | ❌ | Rerun updated 2026-06-18: 16 ✅, 3 ⚠️, 1 ❌, 1 🚫. |
| **Total** | | **280** | ❌ | 195 pass, 58 pass-w/issues, 4 fail, 19 blocked, 4 removed, 0 untested. |

### Coverage Audit

Cross-check after the final batch: every inventory ID must appear in exactly one batch table or in Discovered Flows. Because batches mirror the inventory's section order, the check is a straight per-section row-count match against `mobile-app-flow-inventory.md`.
