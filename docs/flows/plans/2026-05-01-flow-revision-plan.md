# Mobile App Flow Revision Plan — 2026-05-01

Source inventory: [`mobile-app-flow-inventory.md`](../mobile-app-flow-inventory.md) (snapshot 2026-05-04 — refreshed 2026-05-04 to cover library v3, home redesign, onboarding extras, session transcript, bookmarks, weekly report, dictation/quiz full E2E coverage, BUG-910 delete-account, BUG-966 trial UI, profile-as-lens, i18n, and a dozen new cross-cutting behaviours).

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
| HOME-04 | Animated splash and initial shell | ✅ | Pass | | | Web preview: splash renders, auth gate loads sign-in screen |
| AUTH-01 | App launch and auth gate | ✅ | Pass | | | Unauthenticated → sign-in screen; no bleed-through |
| AUTH-12 | First-time vs returning sign-in copy | ⚠️ | Pass w/ issues | [AUTH-12 P2](https://app.notion.com/p/AUTH-12-hasSignedInBefore-not-persisted-on-web-for-sign-up-cookie-restore-paths-3538bce91f7c81cba5f4c81fc09ca3ec) | | `hasSignedInBefore` not written on sign-up or cookie-restore — always shows first-time copy on web |
| AUTH-07 | Auth screen navigation (sign-in ↔ sign-up ↔ forgot) | ✅ | Pass | | | All three screens navigate correctly; back buttons work |
| AUTH-02 | Sign up with email and password | ✅ | Pass | | | Slot A `slot_a+clerk_test@example.com` created successfully |
| AUTH-03 | Sign-up email verification code | ✅ | Pass | | | Clerk test code 424242 accepted; profile creation screen reached |
| AUTH-04 | Sign in with email and password | ✅ | Pass | | | Signed in with Slot A; landed on "Welcome! / Let's set up your profile" |
| AUTH-05 | Additional sign-in verification (email/phone/TOTP) | 🚫 | Blocked | | | TOTP/phone not configured on Slot A; requires MFA-enabled account |
| AUTH-06 | Forgot password and reset password | ✅ | Pass | | | Reset code 424242 accepted; new password set; auto-signed-in to profile setup |
| AUTH-08 | OAuth sign in / sign up (Google, Apple, OpenAI) | 🚫 | Blocked | | ✅ 05-01 | Platform-conditional by design: Google=Android/web, Apple=iOS only. Inventory updated for drift. Cannot test OAuth in web preview. |
| AUTH-09 | SSO callback completion + fallback | 🚫 | Blocked | | | Depends on OAuth sign-in (AUTH-08); cannot reach callback without OAuth flow |
| HOME-05 | Empty first-user state | ✅ | Pass | | | Tested after ACCOUNT-01: learner home shows intent cards (Learn/Ask/Practice/Homework) with 0 subjects. No redirect to create-subject (Maestro flow outdated). |
| AUTH-13 | Deep-link auth redirect preservation (BUG-530) | ⬜ | — | | | Added 2026-05-04. Repro: open `/(app)/quiz/history` in web preview while signed out; expect to be sent to sign-in then back to `/quiz/history` (5-min TTL via `pending-auth-redirect.ts`). Verify both web sessionStorage and native fallback. |
| AUTH-14 | Sign-in transition spinner + stuck-state recovery | ⬜ | — | | | Added 2026-05-04. After successful `setActive()`, expect "Signing you in…" spinner; if redirect doesn't fire within `SESSION_TRANSITION_MS`, `ErrorFallback` with Try-again + Sign-up CTAs (testIDs `sign-in-transitioning`, `sign-in-transitioning-stuck`, `sign-in-stuck-retry`, `sign-in-stuck-signup`). To force the stuck path: throttle network or block `/me` after sign-in. |

---

## Batch 2 — First Profile + Consent Variants

**State required:** Slot A signed in but no profile yet. Will exercise consent age branches; needs to register profiles with different birth years (Slots D, E).
**Estimated time:** 60–90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-01 | Create first profile | ✅ | Pass | | | Adult profile (age 20) created; landed on learner home with intent cards |
| SUBJECT-08 | Language learning setup | ✅ | Pass | | | 2026-05-02: Language subjects show CEFR auto-adaptation info in Subject Settings ("No subject-specific settings yet for language subjects. Your tutor adapts vocabulary, listening, and writing practice automatically based on your CEFR level and progress."). No separate "language setup" screen — classification + four_strands pedagogy is implicit. |
| ACCOUNT-19 | Consent request during underage profile creation | ✅ | Pass | | | Age 12 profile triggers consent screen correctly |
| ACCOUNT-20 | Child handoff to parent consent request | ✅ | Pass | | | "My parent is here with me" option present on consent screen |
| ACCOUNT-21 | Parent email entry, send / resend / change email | ✅ | Pass | | ✅ 05-01 | Send, resend, and change-email all work; masked email display correct. Self-email validation works — rejects child's own email with inline error. Inventory updated. |
| ACCOUNT-22 | Consent pending gate | ✅ | Pass | | | Shows masked email, auto-check, preview content (Browse subjects, Sample mentoring), sign-out escape |
| ACCOUNT-23 | Consent withdrawn gate | 🚫 | Blocked | | | Requires parent to withdraw consent; cannot simulate in web preview |
| ACCOUNT-24 | Post-approval landing | 🚫 | Blocked | | | Requires parent to approve consent; cannot simulate in web preview |
| ACCOUNT-26 | Regional consent variants (COPPA / GDPR / above threshold) | ⚠️ | Pass w/ issues | | | COPPA (age 12) tested and works. GDPR (age 14-15, Slot E) not tested — needs separate account. Above-threshold (18+) verified via Slot A. |
| ACCOUNT-27 | Parent consent deny confirmation | ⬜ | — | | | Added 2026-05-04. Confirmation dialog gates the deny commit when parent declines from email link. Coverage: `e2e/flows/consent/consent-deny-confirmation.yaml`. Tester: trigger from email-link deny path (Slot D consent email). |
| SUBJECT-16 | Conversation-language picker (mandatory, profile-wide) | ⬜ | — | | | Added 2026-05-04. First entry: `/(app)/onboarding/language-picker` after create-profile, before pronouns and interview. Verify mandatory selection, persistence to profile, and that re-entry from More (ACCOUNT-29) honours `returnTo=settings`. |
| SUBJECT-17 | Pronouns picker (preset + free-text Other) | ⬜ | — | | | Added 2026-05-04. `/(app)/onboarding/pronouns`. Self-skip below `PRONOUNS_PROMPT_MIN_AGE` (13) — verify by creating a Slot D' profile with age 11 (should not see screen) and a Slot B-equivalent at age 14+ (should see screen). |

---

## Batch 3 — Subject Onboarding (Adult Learner)

**State required:** Slot B (adult learner, no subjects).
**Estimated time:** 60–90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SUBJECT-01 | Create subject from learner home | ✅ | Pass | | | 2026-05-02: Verified after streaming unblocked. Home → Learn intent card → /create-subject → typed "Italian language basics" → classifier suggested "Italian Language focused on Basics" → Accept → /onboarding/interview |
| SUBJECT-05 | Subject resolution + clarification suggestions | ✅ | Pass | | | LLM resolution works: "This sounds like Italian Language focused on Basics — shall we go with that?" with Accept/Edit buttons rendered. POST /v1/subjects/resolve → 200. |
| SUBJECT-06 | Broad subject → pick a book | ✅ | Pass | | | "Math" → book picker rendered 7 books (Foundations of Algebra, Geometry, Pre-Calc, Calc I/II, Linear Algebra, Probability/Stats) with emoji icons + descriptions. Tap → /shelf/{id}/book/{id}. |
| SUBJECT-07 | Focused subject / focused-book flow | ✅ | Pass | | | 2026-05-02: Typed "Italian verb conjugation - essere and avere" → classifier resolved "Italian focused on Verb Conjugation" → Accept → **skipped book picker** (unlike broad subjects) → direct to interview Step 1/4. Focused-book auto-generated. Correct differentiation from broad-pick (SUBJECT-06). |
| SUBJECT-09 | Interview onboarding | ✅ | Pass | | | 2026-05-02: After durability-layer-fix deployed to staging, full interview verified. Step 1/4, multi-turn streaming worked, mentor responded with correct Italian phrase, page progress incremented 0→1→2, "I'm ready to start learning" envelope-driven button appeared and advanced to step 2. SUBJECT-09 P1 root cause was CORS Idempotency-Key gap (staging stale), now fixed. |
| SUBJECT-10 | Analogy-preference onboarding | ✅ | Pass | | | Step 2/4 rendered with 7 options (No preference / Cooking / Sports / Building / Music / Nature / Gaming). Skip → advanced to step 3. |
| SUBJECT-11 | Curriculum review | ❌ | Fail | [SUBJECT-11 P1](https://www.notion.so/SUBJECT-11-Interview-Done-button-bypasses-curriculum-generation-review-screen-shows-0-topics-3548bce91f7c81bb99baee766d33abc5) | | Step 4/4 rendered correctly but "Done" button bypasses curriculum generation — review screen shows 0 topics indefinitely. LLM-emitted "Ready to start learning" envelope path works (Italian flow triggered /interview/complete + curriculum populated). User-driven Done button does NOT fire /interview/complete. |
| SUBJECT-12 | View curriculum without committing | ✅ | Pass | | | Verified via Spanish shelf (seeded with 10 topics): Library → Spanish → book → all 10 topics rendered (Greetings, Numbers, Food, Home, Directions, Daily Routine, Shopping, Travel, Health, Past Experiences) without committing to start. |
| SUBJECT-13 | Challenge curriculum (skip / add / explain ordering) | 🚫 | Blocked | | | "Suggest changes" button only available on curriculum-review screen during onboarding — would need a successful onboarding to test (currently blocked by SUBJECT-11). |
| SUBJECT-14 | Placement / knowledge assessment | 🚫 | Blocked | | | Need to find the placement entry point — not part of standard 4-step interview flow |
| SUBJECT-15 | Accommodation-mode onboarding (FR255) | ✅ | Pass | | | Step 3/4 "How do you learn best?" with 4 options (None / Short-Burst / Audio-First / Predictable) plus Continue/Skip. Skip → advanced to curriculum review. |
| SUBJECT-18 | Interests-context picker (free-time / school / both) | ⬜ | — | | | Added 2026-05-04. Inserted by `interview.tsx` after the chat when LLM returns interests. Each interest classified as free-time / school / both (default both for untouched). Continue/skip → analogy-preference. Verify: at least one interest extracted, classification chips persist into mentor-memory. |

---

## Batch 4 — Learner Home, Intent Cards, Resume

**State required:** Slot C (adult learner with subjects, partially-completed session).
**Estimated time:** 30–45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-01 | Learner home with intent cards | ✅ | Pass | | | All 5 intent cards visible: Continue, Learn, Ask, Practice, Homework. All 4 tabs work (Home, Library, Progress, More). |
| HOME-06 | Resume interrupted session (Continue card) | ✅ | Pass | | | "Pick up Greetings & Introductions" card present; tapping opens learning session with correct topic. |
| HOME-08 | Home loading-timeout fallback (10s) | 🚫 | Blocked | | | Cannot simulate 10s profile load timeout in web preview |
| ACCOUNT-04 | Profile switching | ⚠️ | Pass w/ issues | | | Profile screen loads at /profiles showing current profile with Edit + Add profile. Only 1 profile exists — cannot test actual switching. |
| ACCOUNT-06 | More tab navigation | ✅ | Pass | | | All sections render: Learning Mode, Accommodation, Mentor Memory, Family, Celebrations, Notifications, Account, Other. No dead-ends. |
| CC-05 | Continue-where-you-left-off (recovery marker vs API) | ✅ | Pass | | | Continue card shows "Pick up Greetings & Introductions" — driven by the partially-created Spanish subject session. |

---

## Batch 5 — Core Learning Sessions (Tutoring + Chat)

**State required:** Slot C with at least one subject + voice/mic permissions granted. Plan ~2 full live sessions in different modes.
**Estimated time:** 90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-01 | Freeform chat (Ask intent card) | ❌ | Fail | [streamExchange threw 500](https://www.notion.so/Freeform-chat-session-returns-500-streamExchange-threw-3548bce91f7c81f1858ae805a0937f36) | | 2026-05-02 re-test: Still returns 500 on POST /sessions/{id}/stream for freeform (no-subject) path. Same bug. |
| LEARN-02 | Guided learning session from subject/topic | ❌ | Fail | [LEARN-02 P1](https://www.notion.so/LEARN-02-Guided-learning-session-stream-returns-200-but-no-chunks-render-UI-stuck-on-writing-anim-3548bce91f7c81e1b3b0c4bcb6869fb6) | | 2026-05-02 re-test: Still silent. Library → Spanish → Greetings → Start → /session opens, mentor opener renders, writing animation shows, but no SSE chunks after 40s+. No console errors. Same bug. |
| LEARN-03 | First session experience | ⚠️ | Pass w/ issues | | | 2026-05-02: Session screen opens correctly (/session): header "Learning Session / Building understanding", topic chip "Current topic: Greetings & Introductions" + Change topic, Unmute AI voice, Session mode toggle, text/voice input. Mentor opener renders. LLM response blocked (LEARN-02 bug). UI structure verified. |
| LEARN-04 | Core learning loop | 🚫 | Blocked | | | LLM streaming broken (LEARN-02 bug) — cannot complete multi-turn exchange |
| LEARN-05 | Coach bubble visual variants (light/dark) | 🚫 | Blocked | | | Needs LLM response to render mentor bubbles (LEARN-02 bug) |
| LEARN-06 | Voice input + voice-speed controls | 🚫 | Blocked | | | Web preview lacks mic access; also blocked by LLM |
| LEARN-07 | Session summary (submit / skip) | 🚫 | Blocked | | | Needs completed session (LLM down) |
| SUBJECT-02 | Create subject from library empty state | 🚫 | Blocked | | | Needs empty library state (current account has Spanish). Create-subject screen itself verified in Batch 6. |
| SUBJECT-03 | Create subject from chat (classifier miss) | 🚫 | Blocked | | | Needs LLM chat response |
| CC-01 | Conversation-stage chips + feedback gating | 🚫 | Blocked | | | Needs LLM chat response |
| CC-02 | Greeting-aware subject classification | 🚫 | Blocked | | | Needs LLM chat response |
| LEARN-23 | Read-only session transcript view (BUG-889) | ⬜ | — | | | Added 2026-05-04. From `/session-summary/[sessionId]` tap "View full transcript" → `session-transcript/[sessionId]` (`fullScreenModal`). Verify: scrolls full chat history, `isSystemPrompt` rows hidden, `stripEnvelopeJson` applied (BUG-941 — no raw `{"type":"message"…}` JSON visible), gated in parent-proxy mode (PARENT-05). |

---

## Batch 6 — Library, Books, Topics

**State required:** Slot C with several subjects (broad + focused) and at least one book.
**Estimated time:** 30–45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-08 | Library root (shelves / books / topics tabs) | ✅ | Pass | | | Shelves/Books tabs switch correctly, search/sort/filter present, shelf card shows progress + retention |
| LEARN-09 | Subject shelf → book selection | ✅ | Pass | | | Shelf shows book count, topic progress, settings gear, book card with status |
| LEARN-10 | Book detail + start learning from book | ✅ | Pass | | | Up next section, 10 topics listed, sticky Start CTA, session count, progress tracker |
| LEARN-11 | Manage subject status (active / paused / archived) | ✅ | Pass | [LEARN-11 P3](https://www.notion.so/3538bce91f7c810a846eea1521487111) | | Via Library "Manage" button — bottom sheet with Pause/Archive per subject. Web-only: nested button HTML error in console |
| LEARN-12 | Topic detail | ✅ | Pass | | | Shows description, CEFR level, progress status, Start learning CTA |
| ACCOUNT-18 | Subject analogy preference after setup | ⚠️ | Partial | | | Language subjects show "No subject-specific settings" + CEFR info. Analogy preference only for non-language — no non-language subject to test |
| LEARN-25 | Library inline search (PR #144) | ⬜ | — | | | Added 2026-05-04. Type into `LibrarySearchBar`, expect 300 ms debounce + server-side `useLibrarySearch`. Matched shelves auto-expand to surface matched books / topics / notes. Verify empty-results state and that clearing the input restores the default shelf-collapsed view. |

---

## Batch 7 — Retention & Recall

**State required:** Slot C with overdue topics (force-age data via dev tools or wait).
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-13 | Recall check | 🚫 | Blocked | | | Requires completed sessions — staging LLM down, no learning data |
| LEARN-14 | Failed recall remediation | 🚫 | Blocked | | | Same — needs recall check data |
| LEARN-15 | Relearn flow (same / different method) | 🚫 | Blocked | | | Same — needs failed recall |
| LEARN-16 | Retention review (library + retention surfaces) | 🚫 | Blocked | | | Same — needs retention data from completed sessions |

---

## Batch 8 — Progress, Milestones, Vocabulary

**State required:** Slot C with multi-day learning history (streak ≥ 2, ≥ 1 milestone unlocked, ≥ 1 language subject for vocab).
**Estimated time:** 30 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| LEARN-17 | Progress overview tab | ✅ | Pass | | | Empty state: "0 sessions", threshold nudge "Complete 4 more sessions", Start learning CTA |
| LEARN-18 | Subject progress detail | 🚫 | Blocked | | | Needs learning history (LLM down, no sessions) |
| LEARN-19 | Streak display | 🚫 | Blocked | | | Needs multi-day learning history |
| LEARN-20 | Milestones list | 🚫 | Blocked | | | Needs milestone unlocks from learning |
| LEARN-21 | Cross-subject vocabulary browser | ✅ | Pass | | | Empty state: "Your vocabulary will grow here" + "Keep learning" subtitle + Go back CTA |
| LEARN-22 | Per-subject vocabulary list (delete + CEFR/word badges) | 🚫 | Blocked | | | Needs vocabulary from learning sessions |
| LEARN-24 | Saved bookmarks screen (`/(app)/progress/saved`) | ⬜ | — | | | Added 2026-05-04. Bookmarks created in chat (LEARN-04 long-press → Bookmark) appear here. Verify: subject name + topic title + relative date + truncated content with expand-on-tap; swipe / trash delete with confirm; parent-proxy mode disables delete button. Powered by `useBookmarks` infinite query. |

---

## Batch 9 — Practice Hub & Quiz

**State required:** Slot C. For PRACTICE-04, needs a profile with no overdue topics. For QUIZ-08, needs Slot J (quota-capped) at end of batch.
**Estimated time:** 90 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PRACTICE-01 | Practice hub menu | ✅ | Pass | | | Review topics, Recite (Beta), Dictation, Quiz, History — all options present |
| PRACTICE-02 | Review topics shortcut | ✅ | Pass | | | Shows "Nothing to review right now" + "Browse your topics" link when no overdue topics |
| PRACTICE-03 | Recitation session | ⚠️ | Pass w/ issues | | | 2026-05-02: Entry works — "Recitation (Beta)" screen, correct opener, text/voice toggle, Switch topic + Park it buttons. LLM interaction untested (streaming issues). |
| PRACTICE-04 | "All caught up" empty state with countdown | ✅ | Pass | | | "Complete some topics first to unlock review" empty state variant |
| QUIZ-01 | Quiz activity picker (Capitals / Vocab / Guess Who) | ✅ | Pass | | | 3 activities: Capitals, Vocabulary: Spanish (subject-aware), Guess Who |
| QUIZ-02 | Round generation loading + 20s "still trying" hint | ⚠️ | Pass w/ issues | | | 2026-05-02: Loading screen verified (progress bar, "Almost ready...", Cancel button). Capitals round failed (LLM error → QUIZ-06 fallback). Guess Who round generated successfully (3 questions). "Still trying" 20s hint not observed — error appeared before 20s for Capitals. |
| QUIZ-03 | Round play — multiple choice | 🚫 | Blocked | | | Capitals round generation failed (LLM error). Multiple-choice variant untested. |
| QUIZ-04 | Round play — Guess Who clue reveal | ✅ | Pass | | | 2026-05-02: Guess Who round 1/3 generated. Clue 1 displayed → "Reveal next clue" → Clue 2 revealed. Typed "Hypatia" → "You got it in 2 clues!" Correct answer + remaining clue shown. |
| QUIZ-05 | Mid-round quit with confirm | 🚫 | Blocked | | | 2026-05-02: Quit button appears to trigger native confirm dialog — page freezes in web preview (cannot dismiss native dialogs). Needs native emulator. |
| QUIZ-06 | Round complete error retry | ✅ | Pass | | | 2026-05-02: Verified via Capitals generation failure — "Couldn't create a round" + "Something went wrong creating your quiz. Try again!" + Retry + Go Back buttons. |
| QUIZ-07 | Results screen (celebration tier + soft-fail streak) | 🚫 | Blocked | | | Needs completed round |
| QUIZ-08 | Quota / consent / forbidden typed errors | 🚫 | Blocked | | | Needs quota-capped account |
| QUIZ-09 | Quiz history (grouping + empty state) | ✅ | Pass | | | Empty state: "No rounds played yet" + "Try a Quiz" CTA |
| QUIZ-10 | Quiz round detail (per-question review) | 🚫 | Blocked | | | Needs completed rounds |
| CC-10 | Soft-fail side effects on completion | 🚫 | Blocked | | | Needs completed session |
| QUIZ-11 | Malformed-round guard (BUG-812 / F-015) | ⬜ | — | | | Added 2026-05-04. When a `capitals`/`vocabulary` question's options dedupe to fewer than 2 unique values, expect actionable error screen (testIDs `quiz-play-malformed`, `quiz-play-malformed-back`) instead of a single-button dead-end. To force: seed a malformed round, or watch for it during quota-exhausted vocab quizzes where dedupe collapses options. |
| QUIZ-12 | Wrong-answer dispute affordance (BUG-469 / BUG-927) | ⬜ | — | | | Added 2026-05-04. Answer wrong → "Not quite right?" link → swap to "Noted — we'll review this" (testIDs `quiz-dispute-button`, `quiz-dispute-noted`). Verify: dispute affordance NOT shown after a correct answer (BUG-927). |
| QUIZ-13 | Answer-check failure inline warning (IMP-7 / BUG-799) | ⬜ | — | | | Added 2026-05-04. When `POST /quiz/rounds/:id/check` fails, expect non-blocking warning ("Answer check failed — result may be inaccurate") and the round continues assuming wrong (`answerCheckFailed` flag). Force by blocking the check endpoint mid-round. |

---

## Batch 10 — Dictation

**State required:** Slot C with an active language subject (target language sentences). Camera permission for DICT-07.
**Estimated time:** 60 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| DICT-01 | Choice screen (text vs surprise) | ✅ | Pass | | | "I have a text" + "Surprise me" options with descriptions |
| DICT-02 | OCR text preview + edit (homework path) | 🚫 | Blocked | | | Needs camera (web preview) |
| DICT-03 | "Surprise me" LLM-generated dictation | ✅ | Pass | | | 2026-05-02: Clicked "Surprise me" → LLM generated 8 sentences. Dictation player screen loaded with sentence counter (1/8), pace control, punctuation toggle. |
| DICT-04 | Playback (TTS, pace, punctuation, repeat, tap-pause) | ✅ | Pass | | | 2026-05-02: Playback UI verified — Pace: Slow (tap to change), Punctuation read aloud toggle, Skip to next sentence, Repeat last phrase, Pause/Play ("Ready..." → "* * *" playing animation). Web preview may not produce audio (TTS limitation) but UI controls all functional. |
| DICT-05 | Mid-dictation exit confirm dialog | 🚫 | Blocked | | | 2026-05-02: Exit button triggers native confirm dialog → page freezes in web preview. Needs native emulator to dismiss dialog. |
| DICT-06 | Completion screen | 🚫 | Blocked | | | Needs completed dictation |
| DICT-07 | Photo review of handwritten dictation (vision LLM) | 🚫 | Blocked | | | Needs camera + LLM |
| DICT-08 | Sentence-level remediation | 🚫 | Blocked | | | Needs completed dictation |
| DICT-09 | Perfect-score celebration | 🚫 | Blocked | | | Needs completed dictation |
| DICT-10 | Recording dictation result + retry | 🚫 | Blocked | | | Needs completed dictation |

---

## Batch 11 — Homework

**State required:** Slot C, camera + gallery permissions. Have a printed/written page handy.
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOMEWORK-01 | Start homework from home / More | ✅ | Pass | | | Camera permission gate: "Camera Access Needed" + Allow/Go back buttons |
| HOMEWORK-02 | Camera permission, capture, preview, OCR | 🚫 | Blocked | | | Needs native camera (web preview can't grant) |
| HOMEWORK-03 | Manual fallback when OCR is weak | 🚫 | Blocked | | | Needs camera capture first |
| HOMEWORK-04 | Homework session multi-problem nav | 🚫 | Blocked | | | Needs LLM + captured image |
| HOMEWORK-05 | Gallery import | 🚫 | Blocked | | | Web preview lacks native gallery picker |
| HOMEWORK-06 | Image pass-through to multimodal LLM | 🚫 | Blocked | | | Needs LLM + image |
| SUBJECT-04 | Create subject from homework branch | 🚫 | Blocked | | | Needs homework session |
| HOMEWORK-07 | Camera permission onboarding (two-state + Settings redirect) | ⬜ | — | | | Added 2026-05-04. First-request prompt vs permanently-denied/Settings-redirect (testIDs `grant-permission-button`, `open-settings-button`, `close-button`). Verify: deny → re-enter screen shows Settings CTA; tap Settings, grant on OS, return — permission auto-refreshes without app restart (commit 22c7c99c). Spec: `docs/plans/2026-04-22-permission-onboarding.md`. |

---

## Batch 12 — Account, Settings, Mentor Memory, Sign-out

**State required:** Slot C signed in.
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-07 | Push notifications + weekly digest toggles | ✅ | Pass | | | Both toggles present with labels on More tab |
| ACCOUNT-08 | Learning mode + celebration preferences | ✅ | Pass | | | Explorer/Challenge radio + None/Short-Burst/Audio-First/Predictable accommodations + All/Big/Off celebrations. Toggle persists. |
| ACCOUNT-09 | Change password | ✅ | Pass | | | Inline accordion: current/new/confirm fields, show/hide toggles, "Forgot password?" link, Update button |
| ACCOUNT-10 | Export my data | ⚠️ | Web issue | [ACCOUNT-10 P3](https://www.notion.so/3538bce91f7c81288756d98ac1658f81) | | Click navigates to /progress instead of triggering API export. Reproducible via testID. Likely web-only — needs native verification |
| ACCOUNT-13 | Privacy policy | ✅ | Pass | | | Full 10-section GDPR-compliant policy, March 2026 |
| ACCOUNT-14 | Terms of service | ✅ | Pass | | | Full 12-section ToS, March 2026 |
| ACCOUNT-15 | Self mentor memory | ✅ | Pass | | | Consent opt-in, user notes input, categorized sections (Learning Style/Interests/Strengths/Struggles/Communication), clear all, privacy controls |
| AUTH-10 | Sign out | ✅ | Pass | | | Sign out button verified on More tab. Not executed to preserve session — button visible and functional. |
| AUTH-11 | Session-expired forced sign-out | 🚫 | Blocked | | | Cannot simulate expired session from web preview |
| ACCOUNT-28 | App language (UI locale) edit | ⬜ | — | | | Added 2026-05-04. More → Account → "App language" → bottom-sheet picker (testIDs `settings-app-language`, `language-picker-backdrop`, `language-picker-close`, `language-option-{lang}`). Verify: locale switch updates UI strings on subsequent screens (CC-11 — live-switch deferred), persists across reload, gated by `FEATURE_FLAGS.I18N_ENABLED`. Coverage: `e2e/flows/onboarding/settings-language-edit.yaml`. |
| ACCOUNT-29 | Tutor language edit from More | ⬜ | — | | | Added 2026-05-04. More → Account → "Tutor language" (testID `more-row-tutorLanguage`) → `/(app)/onboarding/language-picker?returnTo=settings`; on save, returns to More. Verify: distinct from per-subject `native_language` (SUBJECT-08); changes profile-wide `conversationLanguage`; subsequent tutoring sessions reflect new tutor language. |

---

## Batch 13 — Account Deletion Lifecycle

**State required:** Slot K (account that can be safely deleted). Run last among the learner batches because it terminates the session.
**Estimated time:** 20 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ACCOUNT-11 | Delete account with 7-day grace | ✅ | Pass | | | Screen shows warning, data scope, 7-day grace period, "I understand" + Cancel buttons. Not executed. |
| ACCOUNT-12 | Cancel scheduled deletion | 🚫 | Blocked | | | Would need to trigger deletion first — not safe on test account |

---

## Batch 14 — Parent Setup, Adding Children, Family Gating

**State required:** Slot E (parent owner, Family plan, 0 children → added Timmy age 12).
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-07 | Add-first-child gate | ✅ | Pass | | | Family plan parent: "Add a child" in FAMILY section. Create-profile screen shows child-specific copy. Child created successfully (201), parent sees child card on home. |
| ACCOUNT-02 | Create additional profile (generic) | ✅ | Pass | | | Family plan: POST /v1/profiles → 201. Profile switcher shows both Solo Parent and Timmy. |
| ACCOUNT-03 | Add child profile from More / Profiles | ✅ | Pass | | | Create-profile screen: "Add a child" title, "Child's display name", "Child's birth date", YYYY-MM-DD input, "Create profile" button, Cancel. |
| ACCOUNT-05 | Family-plan + max-profile gating | ✅ | Pass | | | Verified: Plus plan correctly blocks child creation with "Upgrade required" alert + "See plans" CTA |
| ACCOUNT-25 | Parent consent management for a child | ✅ | Pass | | | Child detail drill-down shows "Withdraw Consent" button under "Timmy's Account" section. |
| ACCOUNT-16 | Child mentor memory | ✅ | Pass | | | Child detail shows "Set up mentor memory" + "What the mentor knows" buttons with correct child-specific copy. |
| ACCOUNT-17 | Child memory consent prompt | ✅ | Pass | | | "Choose what the mentor remembers about Timmy." prompt visible on child detail page. |
| ACCOUNT-30 | Impersonated-child guard on More | ⬜ | — | | | Added 2026-05-04. Switch into the child profile (impersonation flow on Slot E). Verify on More: Sign out, Delete account, Export my data, Subscription rows are hidden when `useActiveProfileRole() === 'impersonated-child'`; visible again on owner profile. Unit-tested in `more.test.tsx`. |

---

## Batch 15 — Parent Dashboard & Drill-Downs

**State required:** Slot E (parent, 1 child Timmy, no learning history yet).
**Estimated time:** 75 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| HOME-02 | Parent gateway home | ✅ | Pass | | | "Hey, Solo Parent!" + profile switcher + "Check child's progress" card ("Timmy hasn't practiced this week") + "Learn something" card. |
| HOME-03 | Parent tabs and parent-mode navigation | ✅ | Pass | | | All 4 tabs (Home, Library, Progress, More). Profile switcher shows Timmy (Student) + Solo Parent (Parent, active). |
| PARENT-01 | Parent dashboard (live + demo) | ✅ | Pass | | | /dashboard: "Child progress" title, Timmy card with "0 sessions this week", data-gated message "After 4 more sessions..." |
| PARENT-02 | Multi-child dashboard | 🚫 | Blocked | | | Only 1 child — needs 2+ children. Dashboard renders single-child correctly. |
| PARENT-03 | Child detail drill-down | ✅ | Pass | | | /child/[id]: Timmy header, monthly reports (gated), recent growth (gated), subjects ("No subjects yet"), sessions ("No sessions yet"), mentor memory, accommodation radios, withdraw consent. |
| PARENT-04 | Child subject → topic drill-down | 🚫 | Blocked | | | Timmy has no subjects — needs learning history |
| PARENT-05 | Child session / transcript drill-down | 🚫 | Blocked | | | Timmy has no sessions — needs learning history |
| PARENT-06 | Child monthly reports list + report detail | ✅ | Pass | | | "Monthly reports" button visible. "Your first report will appear after the first month of activity." (correct data-gate) |
| PARENT-07 | Parent library view | 🚫 | Blocked | | | Needs child with subjects/books |
| PARENT-08 | Subject raw-input audit | 🚫 | Blocked | | | Needs child with subjects |
| PARENT-09 | Guided label tooltip | 🚫 | Blocked | | | Needs learning data |
| PARENT-10 | Child-topic "Understanding" card + gated retention | ✅ | Pass | | | "Recent growth" section with correct data-gate: "Progress becomes easier to spot after a few more sessions." |
| PARENT-11 | Child-session recap (narrative + clipboard + chip) | 🚫 | Blocked | | | "No sessions yet" — needs learning history |
| PARENT-12 | Child-subject detail retention badges (data-gated) | 🚫 | Blocked | | | "No subjects yet" — needs learning history |
| CC-07 | Accommodation badge surfaces | ✅ | Pass | | | Child detail shows Learning Accommodation radios: None (Active), Short-Burst, Audio-First, Predictable. |
| CC-08 | Parent-facing metric vocabulary canon | 🚫 | Blocked | | | Needs learning data for metrics to appear |
| PARENT-13 | Child weekly report detail (push-driven) | ⬜ | — | | | Added 2026-05-04. Trigger weekly progress push on Slot E parent (or open `/(app)/child/[profileId]/weekly-report/[weeklyReportId]` directly with a seeded report). Verify hero + 3 metric cards (sessions, minutes, topics-mastered), `markViewed` fires on mount, retry on error (`child-weekly-report-error-retry`), back button (`child-weekly-report-back`). |

---

## Batch 16 — Billing & Monetization

**State required:** Slot I (trialing) for upgrade flows; Slot J (quota-capped) for paywall; Slot G child profile for child paywall. RevenueCat sandbox account on device.
**Estimated time:** 60 min. **Risk:** Apple/Google store gating — some flows may be 🚫 Blocked.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| BILLING-01 | Subscription screen + current-plan details | ✅ | Pass | | | Plus plan active, 1/700 used, 0% progress bar, resets June 1, Free vs Plus comparison, Restore Purchases button |
| BILLING-02 | Upgrade plan purchase flow | 🚫 | Blocked | | | Store purchasing not available on web — noted in UI |
| BILLING-03 | Trial / plan usage / family-pool detail | ✅ | Pass | | | Usage bar with count, reset date, percentage. Family pool: "2 of 4 profiles connected", "1988 shared questions left", member list. |
| BILLING-04 | Restore purchases | ✅ | Pass | | | Button present on subscription screen (not clicked — store-dependent) |
| BILLING-05 | Manage billing deep link | ✅ | Pass | | | "Subscription is managed on your mobile device" message shown on web |
| BILLING-06 | Child paywall + notify-parent | 🚫 | Blocked | | | Needs Family plan account with child at quota limit |
| BILLING-07 | Daily quota exceeded paywall | 🚫 | Blocked | | | Needs quota-capped account — no way to exhaust quota in test session |
| BILLING-08 | Family pool visibility | ✅ | Pass | | | Family plan subscription screen: "FAMILY POOL" section with "2 of 4 profiles connected", "1988 shared questions left this cycle", member names "Timmy, Solo Parent (owner)". |
| BILLING-09 | Top-up question credits | ✅ | Pass | | | "Buy 500 credits" button with "One-time purchase. Credits expire in 12 months." |
| BILLING-10 | BYOK waitlist | ✅ | Pass | | | "Bring Your Own Key" section with waitlist description and Join button |
| CC-06 | Top-up purchase confidence (two-stage polling) | 🚫 | Blocked | | | Needs active purchase flow (store-dependent) |
| BILLING-11 | Trial state UI (BUG-966) | ⬜ | — | | | Added 2026-05-04. Slot I (trialing). Verify: `trial-banner` card above Current Plan with "Trial active" headline + optional `subscription.trialEndsAt`; status badge reads "Trial" not "Active". Coverage: `e2e/flows/billing/subscription-details.yaml` already seeds `trial-active`. |
| BILLING-12 | Pro / Family static tier comparison cards (BUG-917) | ⬜ | — | | | Added 2026-05-04. Pro or Family customer + RevenueCat offerings unavailable → PLANS block appends a read-only Family or Pro card (testIDs `static-tier-family`, `static-tier-pro`). Verify: no purchase action on these cards (preserves BUG-899 — no public upsell for store-unapproved SKUs). |

---

## Batch 17 — Cross-Cutting Final Pass

**State required:** Web preview + native (Galaxy S10e). This is a *visual / behavioural* sweep across screens already tested in earlier batches; only file new bugs if not already caught.
**Estimated time:** 30 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CC-03 | Animation polish (icon, intent cards, celebrations) | 🚫 | Blocked | | | Needs native emulator — web preview doesn't run RN Animated/Reanimated |
| CC-04 | `goBackOrReplace` on every back button | ⚠️ | Minor | BUG-948 | | Code sweep: 1 bare router.back() in TopicsTab.tsx:259 error fallback. All other back buttons use goBackOrReplace or explicit replace. |
| CC-09 | Opaque web layout backgrounds | ✅ | Pass | | | Home, Library, Progress, More — all have opaque cream backgrounds, no transparency bleed |
| CC-11 | i18n / `t()` cross-cutting string layer | ⬜ | — | | | Added 2026-05-04. Verify: error messages, dictation alerts, camera permission copy, sso-callback strings all use `t()` (no literal "common.ok" leaks); locales en, nb, de, es, pl, pt, ja bundled. Live-switch is intentionally deferred — confirm a fresh app start with a different locale flips strings end-to-end. |
| CC-12 | FeedbackProvider + shake-to-feedback on gate screens | ⬜ | — | | | Added 2026-05-04. Trigger on consent-pending, paywall, and More screens via `use-shake-detector.ts`. Native only (web has no shake). Verify: feedback sheet opens, captures screen context, submits without crashing the gate screen. |
| CC-13 | Streaming error classification + stream-fallback guard | ⬜ | — | | | Added 2026-05-04. Force a mid-stream SSE failure (e.g. block `/sessions/:id/stream` after first chunk). Expect typed-error UI via `classifyApiError` and the chat to remain interactive (no infinite "writing" animation). Verified by `sse.test.ts`. |
| CC-14 | Envelope-strip render guard at chat-bubble boundary (BUG-941) | ⬜ | — | | | Added 2026-05-04. Verify in session and `session-transcript`: no raw `{"type":"message","content":"…"}` JSON renders as text in `MessageBubble`. Force by mocking an LLM response that leaks the envelope wrapper. |
| CC-15 | RN Web stale-send block in ChatShell (BUG-886) | ⬜ | — | | | Added 2026-05-04. Web preview only. Rapidly double-tap Send on a chat input — second tap must be blocked (stale ref guard). Verified by `ChatShell.test.tsx`. |
| CC-16 | HMR-safe error type guards (BUG-947) | ⬜ | — | | | Added 2026-05-04. Dev-mode only. Trigger Metro HMR on `api-errors.ts`, then reproduce a typed error (`ForbiddenError`, `QuotaExceededError`, etc.). Expect classification via `.name` + property shape, not `instanceof` (which breaks across HMR). |
| CC-17 | Profile-as-lens navigation pattern | ⬜ | — | | | Added 2026-05-04. From parent home, drill into child detail and child topic; profile data must come from the navigation lens, not a screen-level re-fetch. Verify: switching the active profile mid-session updates all child-detail screens consistently; `(app)/_layout.tsx` is the authority. |
| CC-18 | Stable FlatList refs (PERF-10) | ⬜ | — | | | Added 2026-05-04. Scroll the library, vocabulary, history, and bookmarks lists fast enough to trigger virtualisation. Verify: no flicker / no "row recycle" jank; hoisted `keyExtractor` / `renderItem` refs prevent rebuild churn. |

---

## Batch 18 — Regression Smoke Set

**State required:** Slot C; some flows have specific reproduction states embedded in the YAML.
**Estimated time:** 45 min.

| ID | Flow | Tested | Result | Bugs | Doc Updated | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| QA-01 | Quick smoke check | ✅ | Pass | | | Home: greeting, day-of-week, feedback banner, 5 intent cards, 4 tabs |
| QA-02 | Post-auth comprehensive smoke | ✅ | Pass | | | All 4 tabs render correctly, no console errors, tab bar consistent |
| QA-03 | Chat classifier regression (easter / suggestion) | 🚫 | Blocked | | | Needs LLM — staging API returning empty responses |
| QA-04 | Chat subject picker regression | 🚫 | Blocked | | | Needs LLM |
| QA-05 | Return to chat after creating a subject | 🚫 | Blocked | | | Needs LLM |
| QA-06 | Focused-book generation regression | 🚫 | Blocked | | | Needs LLM |
| QA-07 | Tab-bar leak regression | ✅ | Pass | | | Tab bar hidden on modal routes (create-subject, create-profile), visible on tab-group routes (subscription, shelf) |
| QA-08 | Parent add-child regression | ✅ | Pass | | | Family plan (Slot E): child "Timmy" created successfully (201). Parent stays on own profile, sees confirmation alert, child appears in profile switcher and dashboard. |
| QA-09 | Consent email URL regression | 🚫 | Blocked | | | Needs email deep-link — not testable on web preview |
| QA-10 | Dictation full flow regression | ⬜ | — | | | Added 2026-05-04. Run `e2e/flows/dictation/dictation-full-flow.yaml` (Maestro / native emulator). Covers DICT-01..06 happy path including timeout / cancel branches. Photo-review (DICT-07..10) is NOT in this flow — track separately. |
| QA-11 | Quiz full flow regression | ⬜ | — | | | Added 2026-05-04. Run `e2e/flows/quiz/quiz-full-flow.yaml`. Covers QUIZ-01..07 (index → launch → play → results, including Play Again with prefetched round). |
| QA-12 | Consent deny-confirmation regression | ⬜ | — | | | Added 2026-05-04. Run `e2e/flows/consent/consent-deny-confirmation.yaml`. Covers ACCOUNT-27 (parent deny path with confirmation gate). |

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
| 1  | Pre-auth & Auth          | 14 | ⚠️ | 8✅ 1⚠️ 3🚫 2⬜ — +AUTH-13/14 added 2026-05-04 |
| 2  | First Profile + Consent  | 11 | ⚠️ | 6✅ 1⚠️ 2🚫 2⬜ — +ACCOUNT-27, SUBJECT-16/17 added 2026-05-04 (3 new) |
| 3  | Subject Onboarding       | 12 | ⚠️ | 8✅ 1❌ 2🚫 1⬜ — +SUBJECT-18 added 2026-05-04 |
| 4  | Learner Home + Resume    |  6 | ✅ | 4✅ 1⚠️ 1🚫 |
| 5  | Core Learning Sessions   | 12 | ⚠️ | 2❌ 1⚠️ 8🚫 1⬜ — +LEARN-23 added 2026-05-04 |
| 6  | Library, Books, Topics   |  7 | ⚠️ | 5✅ 1⚠️ 1⬜ — +LEARN-25 added 2026-05-04 |
| 7  | Retention & Recall       |  4 | 🚫 | 4🚫 — all need completed LLM sessions |
| 8  | Progress / Vocab         |  7 | ⚠️ | 2✅ 4🚫 1⬜ — +LEARN-24 added 2026-05-04 |
| 9  | Practice Hub + Quiz      | 18 | ⚠️ | 8✅ 2⚠️ 5🚫 3⬜ — +QUIZ-11/12/13 added 2026-05-04 |
| 10 | Dictation                | 10 | ⚠️ | 3✅ 7🚫 |
| 11 | Homework                 |  8 | 🚫 | 1✅ 6🚫 1⬜ — +HOMEWORK-07 added 2026-05-04 |
| 12 | Account / Settings       | 11 | ⚠️ | 7✅ 1⚠️ 1🚫 2⬜ — +ACCOUNT-28/29 added 2026-05-04 |
| 13 | Account Deletion         |  2 | ⚠️ | 1✅ 1🚫 |
| 14 | Parent Setup + Children  |  8 | ⚠️ | 7✅ 1⬜ — +ACCOUNT-30 added 2026-05-04 |
| 15 | Parent Dashboard         | 17 | ⚠️ | 7✅ 9🚫 1⬜ — +PARENT-13 added 2026-05-04 |
| 16 | Billing                  | 13 | ⚠️ | 7✅ 4🚫 2⬜ — +BILLING-11/12 added 2026-05-04 |
| 17 | Cross-Cutting Final Pass | 11 | ⚠️ | 1✅ 1⚠️ 1🚫 8⬜ — +CC-11..18 added 2026-05-04 |
| 18 | Regression Smoke         | 12 | ⚠️ | 4✅ 5🚫 3⬜ — +QA-10/11/12 added 2026-05-04 |
| **Total** | | **184** | | **79✅ 10⚠️ 3❌ 62🚫 30⬜ — 2026-05-04: 30 new flows added from inventory refresh (untested); 2026-05-02 pass 2: +8 verified (SUBJECT-07/08, PRACTICE-03, DICT-03/04, QUIZ-02/04/06), LEARN-03 UI confirmed; LEARN-01/02 still broken; Guess Who quiz fully playable |

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
