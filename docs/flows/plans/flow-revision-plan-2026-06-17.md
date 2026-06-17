> **STATUS: ACTIVE** — fresh testing round. All 280 flows reset to ⬜ (not yet tested) on 2026-06-17, rebuilt from the current inventory. Walk each to completion, BLOCKED, or DEFERRED.

# Mobile App Flow Revision Plan

Source inventory: [`mobile-app-flow-inventory.md`](../mobile-app-flow-inventory.md) (rebuilt + re-verified 2026-06-09). Companion E2E gap audit: [`e2e-flow-coverage-audit-2026-05-13.md`](../e2e-flow-coverage-audit-2026-05-13.md).

**Reset 2026-06-17:** every flow row is marked not yet tested (`⬜`) so the revision can restart from the current inventory (re-verified 2026-06-09 by a 33-agent code audit, ~280 flows). All prior pass/fail/blocker notes belonged to the superseded 184-item 2026-05-14 snapshot and have been dropped. **Batches now mirror the inventory's own 9 content sections** rather than the old 18-batch split, so every row traces 1:1 to a row in `mobile-app-flow-inventory.md`. The Operating Instructions, account-slot contract, and cross-cutting rules below are carried over unchanged; where they cite "Batch N" treat it as the equivalent section batch.

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
| AUTH-01 | App launch and auth gate | ⬜ |  |  |  |  |
| AUTH-02 | Sign up with email/password | ⬜ |  |  |  |  |
| AUTH-03 | Sign-up email verification: verify, resend, change email, back; setActive-failure retry preserves sessionId | ⬜ |  |  |  |  |
| AUTH-04 | Sign in with email/password | ⬜ |  |  |  |  |
| AUTH-05 | Additional verification | ⬜ |  |  |  |  |
| AUTH-06 | Forgot/reset password | ⬜ |  |  |  |  |
| AUTH-07 | Auth screen navigation | ⬜ |  |  |  |  |
| AUTH-08 | OAuth sign in/up | ⬜ |  |  |  |  |
| AUTH-09 | SSO callback completion/fallback/cancel | ⬜ |  |  |  |  |
| AUTH-10 | Sign out | ⬜ |  |  |  |  |
| AUTH-11 | Session-expired forced sign-out + re-entry banner | ⬜ |  |  |  |  |
| AUTH-12 | First-time vs returning sign-in copy | ⬜ |  |  |  |  |
| AUTH-13 | Deep-link auth redirect preservation | ⬜ |  |  |  |  |
| AUTH-14 | Sign-in transition spinner + stuck recovery: 8s | ⬜ |  |  |  |  |
| AUTH-15 | Welcome intro | ⬜ |  |  |  |  |
| AUTH-16 | Not-found catch-all with recovery | ⬜ |  |  |  |  |
| AUTH-17 | Session-REVOKED banner | ⬜ |  |  |  |  |
| AUTH-18 | OAuth stuck-spinner watchdog | ⬜ |  |  |  |  |

---

## Batch 2 — Profiles, Family, Consent, and Account

**State required:** Slot A (no profile) + Slots D/E for consent age variants; Slot C for account/settings; Slot K for the deletion lifecycle; Slots F/G/H for child/family profile rows.
**Inventory section:** [`mobile-app-flow-inventory.md` → Profiles, Family, Consent, and Account](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-01 | Create first profile | ⬜ |  |  |  |  |
| ACCOUNT-02 | Create additional profile | ⬜ |  |  |  |  |
| ACCOUNT-03 | Add child profile | ⬜ |  |  |  |  |
| ACCOUNT-04 | Profile switching via `/profiles` modal | ⬜ |  |  |  |  |
| ACCOUNT-05 | Profile-limit / family-plan gating for add-child | ⬜ |  |  |  |  |
| ACCOUNT-06 | More hub | ⬜ |  |  |  |  |
| ACCOUNT-07 | Notifications sub-screen | ⬜ |  |  |  |  |
| ACCOUNT-08 | Accommodation picker | ⬜ |  |  |  |  |
| ACCOUNT-09 | Account security | ⬜ |  |  |  |  |
| ACCOUNT-10 | Export my data | ⬜ |  |  |  |  |
| ACCOUNT-11 | Delete account: initial → confirming | ⬜ |  |  |  |  |
| ACCOUNT-12 | Scheduled-deletion state: Keep account | ⬜ |  |  |  |  |
| ACCOUNT-13 | Privacy policy | ⬜ |  |  |  |  |
| ACCOUNT-14 | Terms of service | ⬜ |  |  |  |  |
| ACCOUNT-15 | Self mentor memory: item delete/unsuppress, injection toggle, Tell-the-mentor, interest chips, clear-all | ⬜ |  |  |  |  |
| ACCOUNT-16 | Child mentor memory | ⬜ |  |  |  |  |
| ACCOUNT-17 | Child memory consent prompt | ⬜ |  |  |  |  |
| ACCOUNT-18 | Subject analogy preference | ⬜ |  |  |  |  |
| ACCOUNT-19 | Consent request during underage profile creation | ⬜ |  |  |  |  |
| ACCOUNT-20 | Child → parent handoff phases on `/consent` | ⬜ |  |  |  |  |
| ACCOUNT-21 | Parent email entry / resend / change email | ⬜ |  |  |  |  |
| ACCOUNT-22 | Consent pending gate: PENDING "send to parent" vs REQUESTED waiting UI | ⬜ |  |  |  |  |
| ACCOUNT-23 | Consent withdrawn gate | ⬜ |  |  |  |  |
| ACCOUNT-24 | Post-approval landing | ⬜ |  |  |  |  |
| ACCOUNT-25 | Parent consent management: withdraw | ⬜ |  |  |  |  |
| ACCOUNT-26 | Regional consent variants | ⬜ |  |  |  |  |
| ACCOUNT-27 | Parent consent deny confirmation | ⬜ |  |  |  |  |
| ACCOUNT-28 | App language bottom sheet | ⬜ |  |  |  |  |
| ACCOUNT-29 | Mentor language row | ⬜ |  |  |  |  |
| ACCOUNT-30 | More under parent-proxy: tab removed ENTIRELY in both nav systems; residual route renders locked panel ONLY | ⬜ |  |  |  |  |
| ACCOUNT-31 | Celebration-level prefs | ⬜ |  |  |  |  |
| ACCOUNT-32 | Consent-gate "while you wait" previews: `PreviewSubjectBrowser` + `PreviewSampleCoaching` fully replace the pending gate; stati… | ⬜ |  |  |  |  |
| ACCOUNT-33 | Pre-auth audience carrier → parent fast-path | ⬜ |  |  |  |  |
| ACCOUNT-34 | Post-OAuth save wizard | ⬜ |  |  |  |  |
| ACCOUNT-35 | Profile-limit upgrade gate: `POST /profiles` 402 `PROFILE_LIMIT_EXCEEDED` → "Upgrade required" alert → "See plans" → `/(app)/su… | ⬜ |  |  |  |  |
| ACCOUNT-36 | Create-profile access-blocked screen | ⬜ |  |  |  |  |
| ACCOUNT-37 | Rename profile | ⬜ |  |  |  |  |
| ACCOUNT-38 | Consent-gate profile-switch escape: shown ONLY for 18+ adults sharing account with ≥1 minor | ⬜ |  |  |  |  |
| ACCOUNT-39 | `/consent` deep-link guards: signed-out → sign-in redirect; foreign `profileId` → `consent-profile-not-found` + go-back | ⬜ |  |  |  |  |
| ACCOUNT-40 | Consent reminder cascade + day-30 auto-delete | ⬜ |  |  |  |  |
| ACCOUNT-41 | Withdrawal countdown banner on Home: per-child warning during 7-day grace with one-tap "Reverse" restore | ⬜ |  |  |  |  |
| ACCOUNT-42 | Consent email-delivery-failed recovery: `emailStatus:'failed'` → failure copy + return-to-parent-phase retry; hard failure → 502 | ⬜ |  |  |  |  |
| ACCOUNT-43 | Security sessions / Manage devices: Clerk session list, per-session revoke, current badge; Clerk-only, no app API | ⬜ |  |  |  |  |
| ACCOUNT-44 | Family-pool breakdown-sharing toggle | ⬜ |  |  |  |  |
| ACCOUNT-45 | Withdrawal-archive preference | ⬜ |  |  |  |  |
| ACCOUNT-46 | Change email + Add password | ⬜ |  |  |  |  |
| ACCOUNT-48 | Help & Feedback: support mailto + "Report a problem" via `FeedbackProvider.openFeedback` | ⬜ |  |  |  |  |
| ACCOUNT-49 | Owner SELF memory-consent prompt: `MemoryConsentPrompt` inline on `/(app)/mentor-memory` when own status pending; "Use memory"… | ⬜ |  |  |  |  |
| ACCOUNT-50 | Child mentor-memory consent-withdrawn dead-end gate: whole screen replaced by `child-mentor-memory-consent-withdrawn` + Back; r… | ⬜ |  |  |  |  |
| ACCOUNT-51 | Parent memory export: "Export memory summary" → share sheet / web `.txt` download; SELF export endpoint exists but mobile-dormant | ⬜ |  |  |  |  |
| ACCOUNT-52 | Parent correction escape hatch | ⬜ |  |  |  |  |

---

## Batch 3 — Home, Navigation, and Subject Setup

**State required:** Slot C (subjects + a partially-completed session) for learner home/resume; Slots F/G for parent gateway + add-child; check nav flags per environment before tab-shape rows.
**Inventory section:** [`mobile-app-flow-inventory.md` → Home, Navigation, and Subject Setup](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home: subject carousel, add tile, Ask Anything, quick actions, CoachBand | ⬜ |  |  |  |  |
| HOME-02 | Parent gateway home | ⬜ |  |  |  |  |
| HOME-03 | Tab shapes / mode navigation | ⬜ |  |  |  |  |
| HOME-04 | Animated splash behind dedicated error boundary | ⬜ |  |  |  |  |
| HOME-05 | Empty first-user state → `/create-subject` | ⬜ |  |  |  |  |
| HOME-06 | Resume interrupted session: SecureStore recovery marker → session push; else server resume target; subject-card "Continue" hint | ⬜ |  |  |  |  |
| HOME-07 | Add-first-child CTA for childless owners: `(showAddChild \ | ⬜ |  |  |  |  |
| HOME-08 | Home loading-timeout fallback | ⬜ |  |  |  |  |
| HOME-09 | "Own Learning" bridge tab | ⬜ |  |  |  |  |
| HOME-10 | App-layout gate stack + recoveries: auth → pending-redirect replay | ⬜ |  |  |  |  |
| HOME-11 | Study/Family ModeSwitcher | ⬜ |  |  |  |  |
| HOME-12 | Parent-proxy shell | ⬜ |  |  |  |  |
| HOME-13 | `/dashboard` legacy redirect → `/(app)/home`, preserving `returnTo` | ⬜ |  |  |  |  |
| HOME-14 | Learner home degraded states: subjects-load error | ⬜ |  |  |  |  |
| HOME-15 | Home overlays: post-grace consent notice toast | ⬜ |  |  |  |  |
| HOME-16 | EarlyAdopterCard | ⬜ |  |  |  |  |
| SUBJECT-01 | Create subject from learner home | ⬜ |  |  |  |  |
| SUBJECT-02 | Create subject from library | ⬜ |  |  |  |  |
| SUBJECT-03 | Create subject from chat | ⬜ |  |  |  |  |
| SUBJECT-04 | Create subject from homework | ⬜ |  |  |  |  |
| SUBJECT-05 | Subject resolution machine | ⬜ |  |  |  |  |
| SUBJECT-06 | Broad subject → pick-book | ⬜ |  |  |  |  |
| SUBJECT-07 | Focused subject/book → first session: `POST first-curriculum` with up to 3 attempts | ⬜ |  |  |  |  |
| SUBJECT-08 | Per-subject native-language + CEFR setup | ⬜ |  |  |  |  |
| SUBJECT-12 | View curriculum without committing | ⬜ |  |  |  |  |
| SUBJECT-14 | Placement / knowledge assessment | ⬜ |  |  |  |  |
| SUBJECT-17 | Pronouns picker | ⬜ |  |  |  |  |
| SUBJECT-18 | First-subject "Ready" recap interstitial | ⬜ |  |  |  |  |
| SUBJECT-19 | Existing-subject "Continue" rows inside create-subject | ⬜ |  |  |  |  |
| SUBJECT-20 | Subject-limit dead-end recovery: regex-on-message classification | ⬜ |  |  |  |  |
| SUBJECT-21 | Curriculum retry endpoint | ⬜ |  |  |  |  |
| SUBJECT-22 | Pick-book degraded/recovery states: missing-param guard; cycling loading + slow hint | ⬜ |  |  |  |  |

---

## Batch 4 — Learning, Chat, Library, Retention, and Progress

**State required:** Slot C with several subjects + at least one book, voice/mic permission, overdue topics (force-age), and multi-day history (streak ≥ 2, ≥ 1 milestone, ≥ 1 language subject).
**Inventory section:** [`mobile-app-flow-inventory.md` → Learning, Chat, Library, Retention, and Progress](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-01 | Freeform chat | ⬜ |  |  |  |  |
| LEARN-02 | Guided learning session | ⬜ |  |  |  |  |
| LEARN-03 | First session experience: `BookmarkNudgeTooltip` | ⬜ |  |  |  |  |
| LEARN-04 | Core learning loop | ⬜ |  |  |  |  |
| LEARN-05 | Coach bubble visual variants | ⬜ |  |  |  |  |
| LEARN-06 | Voice input + playback: VoiceToggle | ⬜ |  |  |  |  |
| LEARN-07 | Session summary screen | ⬜ |  |  |  |  |
| LEARN-08 | Library v3 subject-first shelf list | ⬜ |  |  |  |  |
| LEARN-09 | Subject shelf → book selection | ⬜ |  |  |  |  |
| LEARN-10 | Book detail + start learning: sticky CTA | ⬜ |  |  |  |  |
| LEARN-11 | Manage subject status + **archive-first delete** | ⬜ |  |  |  |  |
| LEARN-12 | Topic detail: adaptive sticky CTA | ⬜ |  |  |  |  |
| LEARN-13 | Recall check | ⬜ |  |  |  |  |
| LEARN-14 | Failed recall remediation | ⬜ |  |  |  |  |
| LEARN-15 | Relearn flow: 5 entries | ⬜ |  |  |  |  |
| LEARN-16 | Retention review from library | ⬜ |  |  |  |  |
| LEARN-17 | Progress overview tab | ⬜ |  |  |  |  |
| LEARN-18 | Subject progress detail | ⬜ |  |  |  |  |
| LEARN-19 | Streak display | ⬜ |  |  |  |  |
| LEARN-20 | Milestones list | ⬜ |  |  |  |  |
| LEARN-21 | Cross-subject vocabulary browser | ⬜ |  |  |  |  |
| LEARN-22 | Per-subject vocabulary list | ⬜ |  |  |  |  |
| LEARN-23 | Read-only session transcript | ⬜ |  |  |  |  |
| LEARN-24 | Saved bookmarks: paginated list, tap-trash + confirm delete | ⬜ |  |  |  |  |
| LEARN-25 | Library inline search | ⬜ |  |  |  |  |
| LEARN-26 | First-curriculum session entry | ⬜ |  |  |  |  |
| LEARN-27 | My Notes archive hub + lists: sessions → `/progress/sessions` archive; notes → `GET /notes`; bookmarks → `GET /bookmarks`; inva… | ⬜ |  |  |  |  |
| LEARN-28 | Subject session archive from progress | ⬜ |  |  |  |  |
| LEARN-29 | Self reports list + detail | ⬜ |  |  |  |  |
| LEARN-30 | Library "next action" coach card | ⬜ |  |  |  |  |
| LEARN-31 | Curriculum-complete banner | ⬜ |  |  |  |  |
| LEARN-32 | Library degraded states: 15s `library-load-timeout`; hard `library-error`; `library-stale-banner` | ⬜ |  |  |  |  |
| LEARN-33 | Book notes section: collapsible inline CRUD | ⬜ |  |  |  |  |
| LEARN-34 | Delete book w/ started-topics double-confirm: 4xx `started_topics` → second destructive confirm w/ count → retry `confirmStarte… | ⬜ |  |  |  |  |
| LEARN-35 | Topic-generation lifecycle: auto-trigger on ungenerated book; idle→slow(30s)→timed_out(60s) w/ retry; generation-failure alert | ⬜ |  |  |  |  |
| LEARN-36 | Book-complete celebration card | ⬜ |  |  |  |  |
| LEARN-37 | Past conversations list | ⬜ |  |  |  |  |
| LEARN-38 | Book-route params `readOnly` + `autoStart` | ⬜ |  |  |  |  |
| LEARN-39 | Vocabulary stack index back-trap: real `index` route seeded by `unstable_settings` so backing out of cross-tab push lands here… | ⬜ |  |  |  |  |
| LEARN-40 | Archived-transcript summary card: `archived:true` transcript renders `ArchivedTranscriptCard` | ⬜ |  |  |  |  |
| LEARN-41 | Session crash recovery: `SessionErrorBoundary` wraps every session render | ⬜ |  |  |  |  |
| LEARN-42 | Expired/deleted session recovery: transcript 404 → `session_expired` system message, subtitle, disabled composer, "Start new se… | ⬜ |  |  |  |  |
| LEARN-43 | Offline / server-unreachable gating: offline disables composer + hides chips; API-unreachable swaps subtitle only; failed durab… | ⬜ |  |  |  |  |
| LEARN-44 | Parking lot | ⬜ |  |  |  |  |
| LEARN-45 | Mid-session topic switcher + wrong-subject correction: TopicSwitcherModal | ⬜ |  |  |  |  |
| LEARN-46 | Skip-warmup chip | ⬜ |  |  |  |  |
| LEARN-47 | Message feedback | ⬜ |  |  |  |  |
| LEARN-48 | In-session message bookmarks: toggle on persisted AI msgs + first-session nudge tooltip; confirmation toast | ⬜ |  |  |  |  |
| LEARN-49 | In-session notes: "Add note" chip | ⬜ |  |  |  |  |
| LEARN-50 | Challenge Round mobile surface | ⬜ |  |  |  |  |
| LEARN-51 | Auto-resume: topic entry w/o sessionId backfills active session via `router.setParams` → transcript hydration + resumed-banner… | ⬜ |  |  |  |  |
| LEARN-52 | Parent-proxy session block: `ExplainedRedirect` w/ read-only copy + switch-profile CTA on any `/session/*`; V0 keeps legacy pro… | ⬜ |  |  |  |  |
| LEARN-53 | Topic stack back-stop | ⬜ |  |  |  |  |
| LEARN-54 | Interleaved Retrieval | ⬜ |  |  |  |  |
| LEARN-55 | Verification overlays | ⬜ |  |  |  |  |

---

## Batch 5 — Practice Hub and Practice Activities

**State required:** Slot C; Slot J (free daily-quota cap) for quota/forbidden rows; an active language subject for dictation rows; camera permission for photo-review.
**Inventory section:** [`mobile-app-flow-inventory.md` → Practice Hub and Practice Activities](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PRACTICE-01 | Practice hub | ⬜ |  |  |  |  |
| PRACTICE-02 | Review topics shortcut | ⬜ |  |  |  |  |
| PRACTICE-03 | Recitation session | ⬜ |  |  |  |  |
| PRACTICE-04 | "All caught up": next-review countdown or complete-a-topic copy + "Browse topics" → library; review card stays tappable at 0 ov… | ⬜ |  |  |  |  |
| PRACTICE-05 | Assessment readiness row: "N topics ready" when eligible; otherwise a non-pressable locked hint with adaptive copy | ⬜ |  |  |  |  |
| QUIZ-01 | Activity picker: Capitals, per-language vocab cards | ⬜ |  |  |  |  |
| QUIZ-02 | Round generation loading: rotating copy, 20s soft hint, **30s hard timeout → ErrorFallback w/ re-armed retry** | ⬜ |  |  |  |  |
| QUIZ-03 | Play | ⬜ |  |  |  |  |
| QUIZ-04 | Guess Who progressive clue reveal | ⬜ |  |  |  |  |
| QUIZ-05 | Mid-round quit modal | ⬜ |  |  |  |  |
| QUIZ-06 | Round-complete error retry | ⬜ |  |  |  |  |
| QUIZ-07 | Results: celebration tiers, score/theme/XP, "What you missed" review section | ⬜ |  |  |  |  |
| QUIZ-08 | Quota / consent / forbidden typed errors on launch: Retry suppressed when recovery ≠ retry; friendly copy for upstream/timeout/… | ⬜ |  |  |  |  |
| QUIZ-09 | Quiz history | ⬜ |  |  |  |  |
| QUIZ-10 | Round detail: schema-validated | ⬜ |  |  |  |  |
| QUIZ-11 | Malformed-round guard | ⬜ |  |  |  |  |
| QUIZ-12 | Wrong-answer dispute | ⬜ |  |  |  |  |
| QUIZ-13 | Answer-check failure: assumes wrong + inline banner + platformAlert + Sentry; flag cleared per question | ⬜ |  |  |  |  |
| QUIZ-14 | Difficulty-bump challenge banner: `round.difficultyBump` → full-screen banner requiring explicit Start | ⬜ |  |  |  |  |
| QUIZ-15 | Final-question auto-save: immediate round submit; "saving" panel → See Results / One More; navigation queued if save in flight;… | ⬜ |  |  |  |  |
| QUIZ-16 | Home quiz-discovery card entry: Continue → mark-surfaced POST, then capitals/guess_who push `/(app)/quiz/launch` w/ `activityType` | ⬜ |  |  |  |  |
| QUIZ-17 | Quiz index load-error retry | ⬜ |  |  |  |  |
| QUIZ-18 | Play no-round guard | ⬜ |  |  |  |  |
| DICT-01 | Choice screen | ⬜ |  |  |  |  |
| DICT-02 | Text preview + edit | ⬜ |  |  |  |  |
| DICT-03 | "Surprise me" generation | ⬜ |  |  |  |  |
| DICT-04 | Playback | ⬜ |  |  |  |  |
| DICT-05 | Mid-dictation exit: hardware back AND visible Exit button → in-app Modal | ⬜ |  |  |  |  |
| DICT-06 | Completion: "I'm done" → result POST → practice; "Check my writing" → DICT-07; review spinner + cancel + 20s timeout; blur mark… | ⬜ |  |  |  |  |
| DICT-07 | Photo review of handwriting: camera | ⬜ |  |  |  |  |
| DICT-08 | Sentence-level remediation | ⬜ |  |  |  |  |
| DICT-09 | Perfect-score celebration | ⬜ |  |  |  |  |
| DICT-10 | Result recording w/ honest-failure retry alert | ⬜ |  |  |  |  |
| DICT-11 | Playback stale-context recovery | ⬜ |  |  |  |  |
| DICT-12 | Review no-data guard | ⬜ |  |  |  |  |
| DICT-13 | E2E-only gallery picker branch | ⬜ |  |  |  |  |

---

## Batch 6 — Homework and Parent Experience

**State required:** Slot C + camera/gallery permission and a written page for homework; Slots G/H (parent owner, 1 / 2+ children with learning history) for the parent dashboard + drill-downs.
**Inventory section:** [`mobile-app-flow-inventory.md` → Homework and Parent Experience](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOMEWORK-01 | Start homework | ⬜ |  |  |  |  |
| HOMEWORK-02 | Camera permission → viewfinder → preview → processing → result → error | ⬜ |  |  |  |  |
| HOMEWORK-03 | Manual entry | ⬜ |  |  |  |  |
| HOMEWORK-04 | Homework tutoring session | ⬜ |  |  |  |  |
| HOMEWORK-05 | Gallery import | ⬜ |  |  |  |  |
| HOMEWORK-06 | Image pass-through to vision | ⬜ |  |  |  |  |
| HOMEWORK-07 | Camera permission onboarding: auto OS prompt on undetermined; denied keyed on `!canAskAgain`; Settings redirect; AppState-resum… | ⬜ |  |  |  |  |
| HOMEWORK-08 | Image-attach failure fallback: base64 fail/timeout → text-only auto-send + VISIBLE system message + analytics event | ⬜ |  |  |  |  |
| HOMEWORK-09 | Subject resolution in result phase: auto-classify once per image; confident → "Looks like {subject}" + Change; LLM-suggestion +… | ⬜ |  |  |  |  |
| HOMEWORK-10 | Per-problem voice dictation: mic per problem card → `useSpeechRecognition`, transcript appends; on-device, second OS permission… | ⬜ |  |  |  |  |
| HOMEWORK-11 | Problem-card editing: OCR split into cards; dropped low-confidence fragments restorable via chip; add/remove cards; 8000-char U… | ⬜ |  |  |  |  |
| HOMEWORK-12 | Close/back semantics: always `router.replace(homeHrefForReturnTo)` | ⬜ |  |  |  |  |
| PARENT-01 | Parent home mentoring hub | ⬜ |  |  |  |  |
| PARENT-02 | Multi-child dashboard: ≥2 children → family-summary panel | ⬜ |  |  |  |  |
| PARENT-03 | Child detail drill-down: subject mentor-note cards + RecentSessionsList; URL modes default / `?mode=progress` | ⬜ |  |  |  |  |
| PARENT-04 | Child subject → topic drill-down: skeletons, error+retry, `topics-load-unknown` branch, new-learner empty split, recent-session… | ⬜ |  |  |  |  |
| PARENT-05 | Child session recap detail: narrative/highlight/engagement chip/conversation prompt + copy, AddToMyLearning, active-time | ⬜ |  |  |  |  |
| PARENT-06 | Child reports list + monthly detail: monthly + weekly merge w/ pinned latest-weekly hero, NEW badge, next-cron-date empty state… | ⬜ |  |  |  |  |
| PARENT-08 | Subject raw-input audit | ⬜ |  |  |  |  |
| PARENT-09 | Metric tooltips | ⬜ |  |  |  |  |
| PARENT-10 | Understanding + retention cards on child topic | ⬜ |  |  |  |  |
| PARENT-11 | Family Recaps feed + detail | ⬜ |  |  |  |  |
| PARENT-12 | Child-subject retention badges | ⬜ |  |  |  |  |
| PARENT-13 | Child weekly report detail: marks viewed once | ⬜ |  |  |  |  |
| PARENT-14 | Learn This Too clone | ⬜ |  |  |  |  |
| PARENT-15 | Send-nudge action sheet: 4 templates; consent gate | ⬜ |  |  |  |  |
| PARENT-16 | Nudge rate limit: 4 per recipient child per rolling 24h, counted on `toProfileId` regardless of sender, `pg_advisory_xact_lock`… | ⬜ |  |  |  |  |
| PARENT-17 | Child curriculum overview | ⬜ |  |  |  |  |
| PARENT-18 | Child profile settings view | ⬜ |  |  |  |  |
| PARENT-19 | Progress-nudge card | ⬜ |  |  |  |  |
| PARENT-20 | Learn Together sheet: AddToMyLearning for latest-recap topic | ⬜ |  |  |  |  |
| PARENT-21 | Child-cap quota notifications on parent home: dismissible warning banners w/ reset time | ⬜ |  |  |  |  |
| PARENT-22 | Family-route blocked gate | ⬜ |  |  |  |  |
| PARENT-23 | Demo dashboard fallback | ⬜ |  |  |  |  |
| PARENT-24 | Parent-home ambient layer: household-pulse subtitle, `ParentTransitionNotice` | ⬜ |  |  |  |  |
| PARENT-25 | Progress-tab nudge entry: guardian viewing linked child w/ `nudgeRecommended` → `progress-nudge-cta` opens NudgeActionSheet | ⬜ |  |  |  |  |

---

## Batch 7 — Billing and Monetization

**State required:** Slot I (trialing) for upgrade flows; Slot J (quota-capped) for paywall; Slot G child profile for child paywall; RevenueCat sandbox account on device. Risk: Apple/Google store gating may force 🚫 Blocked.
**Inventory section:** [`mobile-app-flow-inventory.md` → Billing and Monetization](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Subscription screen: plan, status badge | ⬜ |  |  |  |  |
| BILLING-02 | Upgrade purchase + confirmation polling | ⬜ |  |  |  |  |
| BILLING-03 | Trial/usage/family composite | ⬜ |  |  |  |  |
| BILLING-04 | Restore purchases | ⬜ |  |  |  |  |
| BILLING-05 | Manage billing: native deep link w/ retry + fallback-URL alert | ⬜ |  |  |  |  |
| BILLING-06 | Child paywall | ⬜ |  |  |  |  |
| BILLING-07 | Daily-quota-exceeded adult path: NO paywall branch | ⬜ |  |  |  |  |
| BILLING-08 | Family pool section + **member removal** | ⬜ |  |  |  |  |
| BILLING-09 | Top-up credits | ⬜ |  |  |  |  |
| BILLING-10 | BYOK waitlist | ⬜ |  |  |  |  |
| BILLING-11 | Trial banner states | ⬜ |  |  |  |  |
| BILLING-12 | Static tier comparison | ⬜ |  |  |  |  |
| BILLING-13 | In-chat quota-exceeded card | ⬜ |  |  |  |  |
| BILLING-14 | Cross-feature upsell entries → `/(app)/subscription`: create-profile 402 "See plans" | ⬜ |  |  |  |  |
| BILLING-15 | Push-notification tap → subscription: `subscribe_request` + `trial_expiry` | ⬜ |  |  |  |  |
| BILLING-16 | Subscription screen timeout/error recovery: 15s TimeoutLoader w/ retry + go-back | ⬜ |  |  |  |  |

---

## Batch 8 — Regression and System Flows

**State required:** Slot C; several rows embed specific reproduction seeds in their flow file — read the inventory Coverage column before running.
**Inventory section:** [`mobile-app-flow-inventory.md` → Regression and System Flows](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| QA-01 | Quick smoke check | ⬜ |  |  |  |  |
| QA-02 | Post-auth comprehensive smoke | ⬜ |  |  |  |  |
| QA-03 | Chat classifier regression | ⬜ |  |  |  |  |
| QA-04 | Chat subject picker regression | ⬜ |  |  |  |  |
| QA-05 | Return to chat after subject create | ⬜ |  |  |  |  |
| QA-06 | Focused-book generation regression | ⬜ |  |  |  |  |
| QA-07 | Tab-bar leak regression | ⬜ |  |  |  |  |
| QA-08 | Parent add-child regression | ⬜ |  |  |  |  |
| QA-09 | Consent email URL regression | ⬜ |  |  |  |  |
| QA-10 | Dictation full-flow regression | ⬜ |  |  |  |  |
| QA-11 | Quiz full-flow regression | ⬜ |  |  |  |  |
| QA-12 | Consent deny-confirmation | ⬜ |  |  |  |  |
| QA-13 | Sign-in/out loop regression | ⬜ |  |  |  |  |
| QA-14 | SSE reconnect | ⬜ |  |  |  |  |
| QA-15 | Preview/onboarding regression cluster | ⬜ |  |  |  |  |

---

## Batch 9 — Cross-Cutting Behaviors

**State required:** Web preview + native (Galaxy S10e). Visual / behavioural sweep across screens already exercised in earlier batches; only file new bugs if not already caught.
**Inventory section:** [`mobile-app-flow-inventory.md` → Cross-Cutting Behaviors](../mobile-app-flow-inventory.md)

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CC-01 | Conversation-stage chips | ⬜ |  |  |  |  |
| CC-02 | Greeting-aware classification | ⬜ |  |  |  |  |
| CC-03 | Animation polish: `BrandCelebration`, `CelebrationAnimation`, session celebrations wired via `useCelebration` w/ learner celebr… | ⬜ |  |  |  |  |
| CC-04 | `goBackOrReplace` universal back pattern | ⬜ |  |  |  |  |
| CC-05 | Continue-where-you-left-off: SecureStore recovery marker takes priority; else server resume target; else overdue review | ⬜ |  |  |  |  |
| CC-06 | Top-up purchase confidence: two-stage polling progress + confident timeout copy | ⬜ |  |  |  |  |
| CC-07 | Accommodation badge surfaces: non-deletable badge on mentor-memory; selector on child settings + self settings; role-gated capt… | ⬜ |  |  |  |  |
| CC-08 | Parent-facing metric vocabulary canon | ⬜ |  |  |  |  |
| CC-09 | Opaque web layout backgrounds | ⬜ |  |  |  |  |
| CC-10 | Quiz streak/XP recording is server-side inside round completion | ⬜ |  |  |  |  |
| CC-11 | i18n `t()` layer | ⬜ |  |  |  |  |
| CC-12 | FeedbackProvider + shake-to-feedback on gate screens; Help screen "Report a problem" opens the same sheet | ⬜ |  |  |  |  |
| CC-13 | Streaming error classification + stream-fallback guard | ⬜ |  |  |  |  |
| CC-14 | Envelope-strip render guard at chat-bubble boundary | ⬜ |  |  |  |  |
| CC-15 | RN Web stale-send block in ChatShell | ⬜ |  |  |  |  |
| CC-16 | HMR-safe error type guards in `format-api-error.ts` | ⬜ |  |  |  |  |
| CC-17 | Profile-as-lens navigation: child routes carry `[profileId]`; `useActiveProfileRole()` gates destructive actions under proxy | ⬜ |  |  |  |  |
| CC-18 | Stable FlatList refs | ⬜ |  |  |  |  |
| CC-19 | Mode-navigation contract controls tab shape + route access | ⬜ |  |  |  |  |
| CC-20 | Parent bridge provenance + return targets | ⬜ |  |  |  |  |
| CC-21 | Post-session pipeline | ⬜ |  |  |  |  |

---

## Discovered Flows (Not in Inventory)

If a flow is found in the app but is missing from `mobile-app-flow-inventory.md`, add it here AND in the inventory in the same edit. Use a temporary ID `DISC-NN` until the inventory assigns a real ID.

| Temp ID | Flow | Found in batch | Routes / entry points | Inventory updated | Notes |
| --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | |

---

## Master Roll-Up

Update this once a batch is complete to track overall progress. Every row starts ⬜ (not yet tested).

| Batch | Section | Items | Status | Notes |
| --- | --- | --- | --- | --- |
| 1 | Auth and Access | 18 | ⬜ | Not yet tested |
| 2 | Profiles, Family, Consent, and Account | 51 | ⬜ | Not yet tested |
| 3 | Home, Navigation, and Subject Setup | 32 | ⬜ | Not yet tested |
| 4 | Learning, Chat, Library, Retention, and Progress | 55 | ⬜ | Not yet tested |
| 5 | Practice Hub and Practice Activities | 36 | ⬜ | Not yet tested |
| 6 | Homework and Parent Experience | 36 | ⬜ | Not yet tested |
| 7 | Billing and Monetization | 16 | ⬜ | Not yet tested |
| 8 | Regression and System Flows | 15 | ⬜ | Not yet tested |
| 9 | Cross-Cutting Behaviors | 21 | ⬜ | Not yet tested |
| **Total** | | **280** | ⬜ | 280 untested, 0 pass, 0 pass-w/issues, 0 fail, 0 blocked, 0 removed. |

### Coverage Audit

Cross-check after the final batch: every inventory ID must appear in exactly one batch table or in Discovered Flows. Because batches mirror the inventory's section order, the check is a straight per-section row-count match against `mobile-app-flow-inventory.md`.
