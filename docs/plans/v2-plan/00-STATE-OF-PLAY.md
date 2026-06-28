---
title: State of Play — Library Shell + "Knows-Me" Memory (fast orientation)
date: 2026-06-27
profile: orientation
status: living
spec: docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md
related:
  - docs/plans/v2-plan/00-README.md
  - docs/plans/v2-plan/02-flow-map.md
  - docs/plans/v2-plan/2026-06-10-s2-subject-hub.md
  - docs/plans/v2-plan/2026-06-10-s3-journal-and-avatar.md
  - docs/specs/2026-06-08-memory-task-review-continuity.md
  - docs/specs/2026-06-08-concept-capture-layer-design.md
---

# State of Play — Library Shell + "Knows-Me" Memory

**Read this first to orient.** Two big, entangled topics — (1) the **library/app shell** redesign and (2) the **mentor memory / "knows-me" personalization** layer — keep getting confused because they ride on different versioning axes and span different nav shells and tabs. This file is the single fast map of *what is built, in which nav version, in which tab, and what is missing.* It is a **living orientation doc**, not a spec or a plan; the cited specs/plans remain the source of truth for intent, and **code is ground truth for status** — every status line below carries a `file:line` or a plan-status citation so it can be re-verified, not trusted.

> Verified 2026-06-27 from code + the S2/S3 plans + the memory specs. Re-verify any status before acting; flags and "IMPLEMENTED" annotations drift.

> **⚠️ Identity-state correction (2026-06-28, verified by live DB query).** Earlier wording in this doc said `S4`/`S5` are *"BLOCKED on the identity-foundation flip"* and that concept-grain is *"parked behind the identity cutover."* **That is stale.** The identity migration is **done** on the live DBs. Queried `doppler -c <cfg> -- node` over `DATABASE_URL`, 2026-06-28: on **stg `ep-fancy-cherry`** (the DB the app actually serves — phone/emulator/local all hit `api-stg`, per [`project_dev_schema_drift_trap`]) legacy `accounts`/`profiles`/`family_links` are **DROPPED**, `login`(125)/`person`(229) are live, and `subjects.profile_id`'s FK is repointed to **`person`** (151/151 rows match); **prd `ep-holy-leaf`** is the same shape (empty). Only the **orphan `dev` DB** still holds legacy tables, and nothing reads it. **Consequence:** `S4`/`S5` are **unbuilt, buildable now** — not identity-blocked; the supporter tables are empty only because no linking UI exists yet. Caveat: schema *code* still drifts from the DB (`subjects.ts:54` references the dropped `profiles`) — `WI-1128`. App is also **pre-launch, zero users, all DB rows disposable test data** ([`project_pre_launch_no_users`]). Full audit: [`03-gap-analysis-2026-06-28.md`](03-gap-analysis-2026-06-28.md).

---

## 1. The two axes (this is the thing that confuses everyone)

There are **two completely different version systems**. They are orthogonal. Almost all confusion is from collapsing them.

### Axis A — Nav-shell build flags (`V0` / `V1` / `V2`)

*Which set of tabs the app shows.* Build-time env flags, resolved in `apps/mobile/src/lib/feature-flags.ts:30-32`:

| Flag | Env var | What it selects |
|---|---|---|
| `MODE_NAV_V0_ENABLED` | `EXPO_PUBLIC_ENABLE_MODE_NAV` | Legacy mode shells (family/study mode, ModeSwitcher) |
| `MODE_NAV_V1_ENABLED` | `EXPO_PUBLIC_ENABLE_MODE_NAV_V1` | The guardian-redesign intermediate (recaps tab) |
| `MODE_NAV_V2_ENABLED` | `EXPO_PUBLIC_ENABLE_MODE_NAV_V2` | The new **3-tab Mentor shell** (mentor / subjects / journal) |

When `MODE_NAV_V2_ENABLED` is on, `useNavigationShellContract` **hard-returns** `visibleTabs = {mentor, subjects, journal}` (`apps/mobile/src/lib/use-navigation-contract.ts:185-196`) — the legacy `library` and `progress` tabs are hidden (`href:null`, V2 tab set at `:22`).

### Axis B — V2 redesign phases (`S0`…`S6`)

*How the V2 shell is being built, in strangle order.* These are **implementation phases**, not nav versions. Full set in [`00-README.md`](00-README.md):

| Phase | Builds | Status (2026-06-27) |
|---|---|---|
| `S0` backend primitives | `mentor_activity_ledger` + `GET /now` feed | **Done in code** |
| `S0-R` retention gate | SRS write chokepoint | parallel, behavior-preserving |
| `S1` Mentor home | ≤3-card feed + ever-present bar + camera/homework | **plan marked IMPLEMENTED** (richness gaps — §4) |
| `S2` Subject hub | shelf+progress merge → hub + Subjects tab | **plan marked IMPLEMENTED** (richness gaps — §4) |
| `S3` Journal + avatar | recaps + cross-subject archive + mentor-memory surfacing | **plan marked IMPLEMENTED** |
| `S4` scope chip / support hub | supporter scopes, server mask | **Unbuilt, buildable now** (identity is live — see correction note; backend pre-built, mobile/route gaps remain) |
| `S5` visibility contract | trust/consent ceremony | **Unbuilt, buildable now** (depends on S4; backend pre-built, link screens + break-tests missing) |
| `S6` cutover + deletions | delete V0/V1 shells, retire old tabs | **DEFERRED + IRREVERSIBLE** (human sign-off) |

### Axis C — the founder's informal words ("v1 = the app I like", "V2 = barren")

When the founder says **"v1 library"** they mean **the rich legacy library surface they like** (`apps/mobile/src/app/(app)/library.tsx` + the `shelf/`+`book/` screens) — this is the **V0/V1 nav shell's** library tab. When they say **"V2 was barren"** they mean **the V2 nav shell's Subjects tab + Subject Hub** (the `S2` deliverable). So "v1 vs V2" in founder-speak = **legacy library tab vs the new V2 Subjects/Hub** — *not* the `MODE_NAV_V1` flag. This doc uses **"legacy library"** and **"V2 Subjects/Hub"** to avoid the collision.

---

## 2. Which shell shows in which environment

Verified from `apps/mobile/eas.json`, `.env.local`, `.github/workflows/ci.yml`:

| Environment | V0 | V1 | V2 | Shell the user sees |
|---|---|---|---|---|
| **Production** | on | off | off | Legacy 5-tab (home / library / progress / more / own-learning) |
| **Preview** | on | on | **on** | **V2 3-tab** (mentor / subjects / journal) |
| **Development** | on | on | **on** | **V2 3-tab** |
| **Local** (`.env.local`) | on | on | off | Legacy shell |
| **CI / OTA** | — | — | **on** | **V2 3-tab** |

**Consequence:** Production users today still get the rich legacy library. The barren surface the founder saw is the **dev/preview/OTA V2 shell**. Switching between a local build and a dev/preview build literally changes which library you see.

---

## 3. Tab-by-tab: legacy → V2 heir → what's built / missing

The single legacy "Library" tab is **deliberately split into three V2 surfaces across three phases** (flow-map [`02-flow-map.md`](02-flow-map.md) lines 93, 144, 147). This is *why* any one V2 tab feels thinner than the old all-in-one library.

| Legacy library job | V2 heir | Phase | Built? | Citation |
|---|---|---|---|---|
| Subject/book/topic **structure** browse, per-subject notes, next-up | **Subjects tab + Subject Hub** | S2 | ✅ skeleton built | `s2-subject-hub.md:13` |
| The animated **"smart card" / next-action** coach card (`LEARN-30`) | **Mentor home feed** (`NowCard` stack) | S1 | ⚠️ built **without animation** | `NowCard.tsx`, `NowCardStack.tsx` (no `Animated`) |
| Cross-subject **"everything I've saved"** archive (notes+bookmarks+sessions search, `LEARN-25`) | **Journal tab** | S3 | ✅ archive sections exist | `s3-journal-and-avatar.md` (IMPLEMENTED) |
| The legacy `library.tsx` tab itself | — | S6 | strangle-target, not deleted yet | `s2-subject-hub.md:48` |

### What's actually missing in the V2 Subjects/Hub (verified in code, 2026-06-27)

These are real gaps on the built surface — not flag/empty-data illusions:

| Capability legacy had | V2 status | Citation |
|---|---|---|
| **Add a subject when subjects already exist** | **Absent** — create button only in the *empty* state; gone once ≥1 subject | `SubjectsBrowse.tsx:55-65` (empty only); `:68-99` (no add on populated path) |
| **Manage subjects** (pause/archive/delete) | **No entry point** in V2 | legacy `library.tsx:432-530` modal; no V2 equivalent |
| **Add a note from the hub** | **Read-only** — persistence deferred; `onAddNote` not wired | `SubjectHubNotesSection.tsx:33-35` |
| **Cross-entity search** (notes + sessions, not just names) | Client-only **name filter** | legacy `useLibrarySearch` `library.tsx:317-361`; no V2 equivalent |
| Status grouping (active/paused/archived) | Flat list | `SubjectsBrowse.tsx:68-99` |
| Book count, urgency-boost on rows | Absent | legacy `library.tsx:942, 960-962` |
| **Card animation** (smart-card motion) | None — plain `View`/`Pressable` | `NowCard.tsx`, `NowCardStack.tsx`, `MentorCelebration.tsx:31-44` |
| Per-subject **session history** | Absent (planned for S3/Journal) | `s2-subject-hub.md` out-of-scope |
| Animated loading skeleton (`ShimmerSkeleton`) | Plain spinner | legacy `library.tsx:622-675` |
| Retention badge, color tint, next-up block | **Present** ✅ | `SubjectHubProgressSummary`, `SubjectHub.tsx:76-83` |

**Bottom line for §3:** S1+S2 shipped the *structural skeleton* and marked themselves "IMPLEMENTED" — true at skeleton level, false at richness level. The life (animation, add/manage subject, *writable* notes, cross-entity search) was deferred or never built.

---

## 4. The mentor memory / "knows-me" layer

This is the *other* big topic — the original "make the learner feel the mentor knows them" thread. The **fact-memory spine is live**; the **review-continuity layer is now in active implementation** (worktrees, not yet on `main`); the remaining connective tissue (`evidence_links`, live freeform binding) is still deferred. Don't conflate "memory" (this section) with "the library shell" (§3) — they are different systems that happen to meet at the notes/saved-from-mentor surface (§5).

### What's LIVE (the mentor genuinely remembers)

| Capability | Status | Citation |
|---|---|---|
| **Memory facts injected every exchange** (pgvector relevance retrieval) | LIVE | `session-exchange.ts:70-79` (`retrieveRelevantMemory()` + `readMemorySnapshotFromFacts()`) |
| **Age-based voice** adaptation per prompt | LIVE | `exchange-prompts.ts:37-82` (`getAgeVoice`) |
| **Learner-model extraction** (`experienceLevel`, knowledge, interests, analogy framing, pace) at session start | LIVE | `topic-probe-extraction.ts:15-123` |
| **Mentor-memory UI** (view/edit/delete/suppress/export, consent toggles) | LIVE | `mentor-memory.tsx`; parent view `child/[profileId]/mentor-memory.tsx`; `mentor-memory-sections.tsx` |
| **V2 Journal surfaces memory** (`JournalMentorMemorySection`) + moments strip (`mentor_activity_ledger`) | LIVE (S3 IMPLEMENTED) | `s3-journal-and-avatar.md:21-50` |
| `memory_facts` table (append-only, embeddings) | LIVE | `packages/database/src/schema/memory-facts.ts` |

### Memory continuity — NOW BEING IMPLEMENTED (in worktrees, not yet on `main`)

The canonical memory spec `2026-06-08-memory-task-review-continuity.md` (DRAFT) is **in active implementation as of 2026-06-27**, in dedicated worktrees off `main` — `review-continuity-opener`, `review-continuity-buildables`, `continuity-copy-wins`. **Not yet merged to `main`** (grep on `main` finds no `buildReviewContinuityOpener` / `retrieval_events` yet — re-verify before relying on it). Its **Tier 1** ("DO IT") scope is:

| Layer (Tier 1 — being built) | What it does | Status | Citation |
|---|---|---|---|
| **Review-continuity opener** | Opens a session as a *remembered continuation* ("last week you worked out X from your notes — has it stuck?") instead of cold, assembling `session_summaries.learnerRecap` + `memory_facts` + embeddings | **In implementation** (worktrees above); flag-gated | spec §"Committed tier" item 1; opener gap at spec `:16-20` |
| **`retrieval_events` log** | Captures every recall grade (prompt, answer, verdict, rationale, misconception, next action, grader source incl. char-count fallback) → feeds eval harness + opener | **In implementation**; additive topic-grain table | spec §Scope item 2; R2/R3 |
| **Unified relearn queue** | `overdue ∪ active/pending_review needs_deepening`, deduped by `topicId`, SM-2-ranked, reason-tagged; fixes the ignored `_signal` in promotion | **In implementation** | spec §Scope item 3; R4/R5 |

### Still DESIGNED / DEFERRED (the connective tissue, NOT in the in-flight Tier 1)

| Missing layer | What it would do | Status | Citation |
|---|---|---|---|
| **`evidence_links`** ("you learned this from your own note on X") | Bind memory/openers to the learner's own **notes, bookmarks, transcripts, homework OCR** as citable sources | **Tier 2 — decided, not built** | spec §"Probably-worth-it" item 4; R6 |
| **Live mid-conversation binding** (freeform → knowledge map) | Mentor recognizes where you are *during* a freeform chat and binds it live | **Telemetry-only** — classification written, acted on by nothing | `ask-silent-classify.ts:196-214` |
| **`taskType` catalog** (`recall` + `teach_back` + new `explain`) | Memory-task type vocabulary | **Tier 2 — decided, not built** | spec §"Probably-worth-it" item 5; R7 |
| **Concept-grain mastery** (`concepts` / `concept_mastery`) | Know the learner at concept resolution, not just topic | **PARKED** behind the hardcoded `CONCEPT_CAPTURE_ENABLED=false` flag (`concept-capture.ts:19`). NOTE: the identity cutover and the `concepts`/`concept_mastery` tables it once waited on are **both now done** — both tables exist on stg (verified 2026-06-28) — so enabling is now a flag + product call, not identity-blocked | `2026-06-08-concept-capture-layer-design.md` (PARKED 2026-06-27); `MMT-ADR-0017` |

### Other freeform-binding facts (verified earlier in this thread)

- **`topic_map` context** (position N of M, chapter, neighbors) + SM-2 retention guidance exist in the mentor prompt, but only fire **behind an already-loaded `topicId` + `bookId`** — i.e. a structured session. Freeform chat gets none of it.
- Extracted **`experienceLevel` is dropped** before the prompt is assembled, so the live prompt never adapts to it.
- Freeform chat **auto-files to the library at session CLOSE** (not live): `isClosePathAutoFileEligible` (freeform, `topicId` null, `exchangeCount ≥ 5`) → Inngest `app/session.auto_file_requested` → `auto-file-session.ts` → `resolveFilingResult()`. So chat→library binding **exists**, but it is **lagged (close-time) and count-gated (5 exchanges)** — see `MMT-ADR-0021` (freeform filing threshold).

---

## 5. The connective tissue — why §3 and §4 are the same problem

The library barrenness (§3) and the personalization gap (§4) **meet at one surface**: the learner's notes / saved-from-mentor items.

- The memory spec's **`evidence_links`** (`:187-191`) is exactly the "the mentor knows it all binds together" loop the founder described — unify `topic_notes` + `bookmarks` + transcripts + homework OCR into citable sources so the mentor can say *"you figured this out yourself, here's your note."*
- But that loop **renders on the V2 notes surface that is currently read-only** (`SubjectHubNotesSection.tsx:33-35`). Memory can't cite the notes, and the notes can't even be created on the surface where it'd show.

So: **fix one end without the other and neither feels alive.** The "felt knowing" experience is one user journey, not two features:

1. **Remember facts about me** → LIVE ✅
2. **Know where I am, live, in freeform** → telemetry-only ❌
3. **Open as a remembered continuation** ("last time…") → **IN IMPLEMENTATION** (worktrees `review-continuity-opener` / `-buildables` / `continuity-copy-wins`) 🔨
4. **Cite my own notes/work back to me** (`evidence_links`) → specced Tier 2, deferred ❌
5. **Surface all of it** (Journal + memory screens) → BUILT ✅
6. **A writable, lively library that feeds 4** → barren/read-only in V2 ❌

The spine (1) and the display (5) are built; the remembered opener (3) is now in flight. The still-open middle that makes it *feel* like knowing is **(4) cite-my-own-work + (6) a writable library + (2) live freeform binding** — and (4) and (6) are the same surface (§5 above).

---

## 6. Forward work — the "knows-me" loop (proposed scope)

> Status: **now specced** — the connective glue is captured in **[`docs/specs/2026-06-27-felt-knowing-loop.md`](../../specs/2026-06-27-felt-knowing-loop.md)** (Draft, paper-only). That spec owns the *unowned* glue of this loop — items (1)-note-authoring, (3), and (4) below — and deliberately does NOT re-own its siblings (`memory-task-review-continuity.md` owns `evidence_links`/`LearnerSource`/opener/`retrieval_events`; `2026-06-27-journal-redesign.md` owns the merged notes+bookmarks *browse* surface). No Cosmo WIs claimed yet; promote when scheduled. Each item is identity-independent (Tier-1 buildable now) unless noted.

Scope the four-part felt-knowing loop as **one coherent experience**, in this order:

1. **Make the built V2 surface not barren** (§3 punch-list, no new architecture):
   - Restore **add-subject + manage** on the populated Subjects path (not just empty state).
   - **Un-defer note persistence** — wire `onAddNote` so the hub notes section is writable (`SubjectHubNotesSection.tsx:33-35`). → felt-knowing-loop spec **Flow 1** (pure wiring; `SubjectHub.tsx:115` withholds the handler, API already complete).
   - Re-add **cross-entity search** (notes + sessions), porting the legacy `useLibrarySearch` behavior.
   - Bring **real animation** to `NowCard` / `MentorCelebration` per the S1 spec copy that never became code.
2. **Review-continuity opener + `retrieval_events` + unified relearn queue** — **already in flight** (Tier 1 of `memory-task-review-continuity.md`, in worktrees `review-continuity-opener` / `-buildables` / `continuity-copy-wins`). Track to merge; this item is *land it*, not *scope it*.
3. **Wire `evidence_links`** (Tier 2 of the same spec, `:187-191` / R6) so memory/openers cite the learner's own notes/bookmarks/transcripts — renders on the now-writable notes surface from (1). **This is the still-open connective tissue.** → felt-knowing-loop spec **Flow 3** (citation *surfacing* in live exchanges via the envelope's structured `citations[]`, flag+eval-gated; adds only `fromKind='exchange'` to slice 2a's enum, no new migration).
4. **Live freeform binding** — promote `ask-silent-classify` from telemetry to a live signal: bind the freeform chat to the recognized subject/topic mid-conversation, and stop dropping `experienceLevel` before the prompt. (This is the original "stuck chat" ask.) → felt-knowing-loop spec **Flow 2** captures the user-facing slice: a freeform "keep this" becomes a citable **bookmark** (`topicId`-nullable, so no schema fork), replacing the lying read-only "Write note" CTA.

**Sequencing note:** (1) is identity-independent and cheap; (2) is in-flight; (3) builds on the Tier-1 retrieval log + the writable notes from (1); (4) is the deepest. Concept-grain "knowing" (§4) stays **parked** behind the `CONCEPT_CAPTURE_ENABLED` flag — *not* the identity flip (which is done; see the correction note up top) — so it remains a separate flag + product decision.

---

## 7. Where to look (canonical sources)

- **Library/shell intent:** `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`; phase plans in this folder ([`00-README.md`](00-README.md) is the index); coverage map [`02-flow-map.md`](02-flow-map.md).
- **Memory intent:** `docs/specs/2026-06-08-memory-task-review-continuity.md` (current canonical, DRAFT); foundation `docs/_archive/specs/Done/2026-05-05-memory-architecture-upgrade.md`; concept-grain `docs/specs/2026-06-08-concept-capture-layer-design.md` + `MMT-ADR-0017`.
- **Felt-knowing connective glue:** `docs/specs/2026-06-27-felt-knowing-loop.md` (the note-authoring + freeform-keep + citation-surfacing glue, §6 above); merged notes+bookmarks *browse* surface `docs/specs/2026-06-27-journal-redesign.md`.
- **Freeform filing:** `MMT-ADR-0021` (5-exchange threshold); `auto-file-session.ts`; `resolveFilingResult()` in `apps/api/src/services/filing.ts`.
- **Code ground truth:** the `file:line` citations above. When a status here disagrees with the code, **the code wins — fix this doc.**
