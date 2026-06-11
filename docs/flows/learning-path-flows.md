# Learning Path Flows — End-User Perspective

Complete, code-true trace of every learning path in MentoMate — from the first tap (for a **learner** or a **supporter**) through every downstream side-effect (challenge rounds, learner-note saving, LLM note review, LLM session summary, LLM memory, retention/quiz/review inputs).

> **Verification note (2026-06-09).** This document was reconstructed directly from source (`apps/mobile/src/app/(app)/**`, `apps/api/src/**`, `packages/schemas/src/**`) by an 18-agent end-to-end audit, not from the previous edition of this file. Where the prior doc diverged from code, the code wins and the drift is flagged inline as **[was: …]**. File:line citations are current as of this date; re-verify after any nav-contract, session-exchange, or post-session-pipeline change.
>
> **Correction pass (2026-06-09).** A follow-up 14-agent re-verification corrected the topic-probe failure semantics (Path 0), the `needs_deepening_topics` writer set (Notes / Path 5), the recall-test inbound path (Path 5), the Assessment create endpoint, the freeform overlay-eligibility row, the completion dispatch-site count, and added several previously-missing entry surfaces and branches. Each correction is flagged inline with a **[was: …]** note.
>
> **Correction pass (2026-06-11).** Applied the learning-flow simplification deepdive patch list and first small implementation slice: review SM-2 calibration is live-but-not-guaranteed, Challenge drafted-note save is not guarded today, Recall Bridge is skip-path-only, `gap_fill` has dedicated chrome, topicless note prompts are suppressed, quiz completion queues a persistent celebration, locked Assessment is non-pressable, recitation skips the filing wait, and the home subject carousel opens the shelf. Each correction is flagged inline where it replaces a stale claim.

---

## Status legend

Each path/feature is tagged with its real production state:

- **prod-active** — running for real users today.
- **flag-gated** — code shipped, a runtime flag keeps it dark/limited (e.g. `CHALLENGE_ROUND_RUNTIME_ENABLED` defaults `false`; `MODE_NAV_V1_ENABLED` controls the guardian shell).
- **server-built / mobile-dormant** — the API path is complete end-to-end but no mobile surface reaches it (e.g. **Interleaved Retrieval**).
- **orphaned** — the screen/engine exists and works, but no in-app navigation reaches it (e.g. the **recall-test** screen).
- **prompt-only** — an LLM prompt rule with no UI/route surface.
- **data-only** — backend computes/persists it, no UI consumes it yet.

---

## 1. Audience model — who reaches what

Two audiences use the app, and **they reach learning content through different surfaces**. This split is the backbone of the entry-point map below.

| Audience | Who | Primary home | Can drive a learning/practice flow? |
|---|---|---|---|
| **Learner** | Solo owner, OR a child on a parent's account (non-proxy) | `LearnerScreen` (quick actions, subject carousel, Ask Anything) | **Yes** — owns and drives every Path 0–8 directly |
| **Supporter** | Adult owner/guardian with linked children | `ParentHomeScreen` (mentoring hub) | **Almost never** — sees *outputs* (recaps, dashboards, transcripts). The **only** way a supporter enters a learning flow is the "Learn together → Add to my learning" clone, which opens a session **for themselves**, never as/for a child. |
| **Parent-proxy** ("viewing as a child") | Supporter who switched into a child profile via `switchProfile(id, { proxyMode: true })` | `LearnerScreen` with all learning actions hidden | **No** — `gates.showLearningActions = !isParentProxy`, and the API blocks every learning write with `assertNotProxyMode`. Proxy is an internal/test path (`use-parent-proxy.ts:15-18`), not a production user-facing entry. |

### Navigation shell — tab shapes (V0 / V1)

Two parallel shells coexist, selected by `MODE_NAV_V1_ENABLED` (V1 guardian redesign) and `MODE_NAV_V0_ENABLED` (legacy). The V1 contract is `resolveNavigationContract()` in `apps/mobile/src/lib/navigation-contract.ts`; **the V0 helpers now live in `apps/mobile/src/lib/legacy-navigation-contract.ts`** [was: documented at `_layout.tsx:122-185`]. `canEnter(route, params)` (`navigation-contract.ts:390-437`) is the single gate.

| Audience | V1 ON | V1 OFF + V0 ON | V1 OFF + V0 OFF (current prod default) |
|---|---|---|---|
| Learner (solo / child-non-proxy) | `STUDY_TABS` = home, library, progress, more | `LEARNER_TABS` (4) | `LEARNER_TABS` (4) |
| Supporter (owner + child, family mode) | `FAMILY_TABS` = home, **recaps**, progress, more | `FAMILY_MODE_TABS` = home, progress, more (3) | **`LEGACY_GUARDIAN_TABS`** = home, own-learning, library, progress, more (5) |
| Parent-proxy | `PROXY_TABS` = home, library, progress (no `more`) | `PARENT_PROXY_TABS` (3) | `PARENT_PROXY_TABS` (3) |

> **Hard constraint (preserved).** The V1-off + V0-off branch returns `LEGACY_GUARDIAN_TABS` (5 tabs) for the production guardian (`navigation-contract.ts:273-283`). This is the shipped production shape and must not regress when V1 lands. See `docs/specs/2026-05-21-navigation-contract.md`.
>
> **Labeling nuance.** V1-off explicit Study mode uses the contract's study fall-through shape, not the V0 helper as an implementation source. The resulting learner tab set matches the legacy learner shape, but docs should avoid implying the V0 helper owns that branch.

### Home branching (learner vs supporter)

`home.tsx` always mounts a component, but the **branch is in `home.tsx:161`** [was: documented as "inside LearnerScreen"]:

```
navigationContract.home.screen === 'FamilyHome'
  ? <ParentHomeScreen />            // supporter mentoring hub
  : <LearnerScreen showParentHome={false} />   // learner home
```

`home.tsx` passes `showParentHome={false}`, which **kills** the legacy in-`LearnerScreen` branch — that branch (`LearnerScreen.tsx:492`) is now dead from the home route. `home.screen` is set by `showFamilyHome = familyShape && !isParentProxy` under V1 (and a legacy-guardian variant under V0-off), so a guardian gets `ParentHomeScreen` even with V1 off while keeping the 5-tab shell.

### `canEnter` gates (V1) — what blocks an entry

- **Parent-proxy** → only `home`, `library`, `progress`. Blocks every learning route, quiz, dictation, homework, practice, session, relearn, mentor-memory.
- **`LEARNING_ROUTES`** (`session, homework, dictation, quiz, practice, mentor-memory, session-summary/[sessionId], topic/relearn`) → `familyShape ? ownerRole : true`. In learner/study shape: open. In family shape: owner-only.
- `library` → `!familyShape` (a family-shape supporter cannot open Library). `recaps`, `recaps/[recapId]` → `familyShape` only (a learner cannot open Recaps).
- `topic/relearn?for=child` → `familyShape && ownerRole && !proxy` (the "learn this too" bridge).
- **V0 fallback pattern:** each learning screen's `_layout` uses `blocked = MODE_NAV_V1_ENABLED ? !canEnter(route) : isParentProxy` — so with V1 off, only proxy is blocked.
- The deferred `isAdultOwner` null-birthYear bug (memory: `project_navcontract_isadultowner_null_bug.md`) **does not reproduce** in current code — `isAdultOwner` guards `birthYear == null` (`packages/schemas/src/age.ts:60`).

> **Note.** `create-subject` is a **top-level route** (`/create-subject`, not under `(app)/`) and is **not** in the contract's `RouteKey` enum — it has no `canEnter` gate. Its reachability is governed only by whether the (gated) tiles that push to it render. In parent-proxy, those tiles are hidden (`gates.showLearningActions = false`).

---

## 2. Path inventory at a glance

### Tutoring session paths (write `learning_sessions`)

| Path | Audience entry | UI mode (`metadata.effectiveMode`) | Session type (DB) | Status |
|---|---|---|---|---|
| **0 — Learn Something New / First Curriculum** | Learner: `home-action-study-new` → `/create-subject` | `learning` | `learning` | prod-active |
| **1 — Freeform Chat** | Learner: `home-ask-anything` | `freeform` | `learning` | prod-active |
| **2 — Guided Learning** | Learner: Library/topic-detail/book CTAs | `learning` (topic+subject preset) [was: "freeform-scoped"] | `learning` | prod-active |
| **3 — Homework Help** | Learner: `home-action-homework` → camera | `homework` | `homework` | prod-active |
| **4 — Practice / Review** | Learner: topic detail (overdue) | `review` [was: `practice`] | `learning` | prod-active |
| **5 — Retention Relearn** | Learner: Library pills / Practice hub / book "review" | `relearn` | `learning` | prod-active (recall-test pre-check is **orphaned**) |
| **6 — Recitation** | Learner: Practice hub "Recite" (Beta) | `recitation` | `learning` | prod-active (Beta) |
| **NEW — Interleaved Retrieval** | *(none — no mobile caller)* | n/a | **`interleaved`** | **server-built / mobile-dormant** |
| **NEW — `gap_fill`** | Spawned by Assessment "borderline" | `gap_fill` (dedicated "Gap Check" chrome) | `learning` | prod-active (spawned only) |

### Practice activities (non-session — own tables)

| Path | Audience entry | Backend | Status |
|---|---|---|---|
| **7 — Quiz** | Learner: Practice hub "Quiz" | `POST /quiz/rounds` · `/rounds/:id/check` · `/rounds/:id/complete` | prod-active |
| **8 — Dictation** | Learner: Practice hub "Dictation" | `POST /dictation/generate` · `/prepare-homework` · `/review` · `/result` | prod-active |
| **NEW — Assessment (verification-depth ladder)** | Learner: Practice hub "Assessment" | `POST /assessments` (recall → explain → transfer) | prod-active |

### Supporter surfaces (view outputs; see §11)

`ParentHomeScreen` mentoring hub · `recaps` tab (V1) · `child/[profileId]/{index,session,topic,subjects,reports,report,weekly-report,curriculum,mentor-memory}` · top-level read-only `session-transcript/[sessionId]` · `LearnTogetherSheet` / `AddToMyLearningButton` (clone-from-child → supporter's own relearn session).

### Within-session mechanisms (not paths)

Challenge Round (flag-gated) · Verification overlays Devil's Advocate (`evaluate`) + Feynman (`teach_back`) · Bookmarks · Notes (4 routes) · First-turn opener · Next-topic recap card.

---

## 3. Per-path entry-point map (learner vs supporter)

Every in-app surface that starts a path. `mode:` is the route param pushed to `/(app)/session`. **All learner entries are hidden in parent-proxy** (the quick-action row, add-subject tiles, and My Notes render only inside `if (gates.showLearningActions)` = `!isParentProxy`).

| Path | Surface / testID | Route + `mode` | Learner | Supporter | file:line |
|---|---|---|---|---|---|
| 1 Freeform | `home-ask-anything` | `/(app)/session` `{mode:'freeform'}` | ✅ | study ctx only | `LearnerScreen.tsx:80-85,418-420` |
| 0 Learn-New | `home-action-study-new`, `home-add-subject-tile`, `home-add-first-subject` | `/create-subject` → `/(app)/session` `{mode:'learning'}` | ✅ | study ctx | `LearnerScreen.tsx:93-99,656-661,709-731` |
| 2 Guided | topic detail "Start studying" / continue | `/(app)/session` `{mode:'learning', subjectId, topicId}` | ✅ | owner | `topic/[topicId].tsx:443-481` |
| 2 Guided | book "up next" / topic row | `/(app)/session` `{mode:'learning', ...}` | ✅ | owner | `shelf/[subjectId]/book/[bookId].tsx:1086-1130` |
| 2 Guided | subject carousel `home-subject-card-*` | `/(app)/shelf/[subjectId]` | ✅ | view-only | `LearnerScreen.tsx:629-651` [was: progress detail] |
| 3 Homework | `home-action-homework` | `/(app)/homework/camera` → `{mode:'homework'}` | ✅ | study ctx | `LearnerScreen.tsx:72-78`; `homework/camera.tsx:509` |
| 4 Practice/Review | topic detail "Review this topic" (overdue) | `/(app)/session` `{mode:'review'}` | ✅ | owner | `topic/[topicId].tsx:458-462` |
| 5 Relearn | Practice hub "Best next step"; book "review"; CoachBand "Revisit … fading" | `/(app)/topic/relearn` → `{mode:'relearn'}` | ✅ | owner | `practice/index.tsx:513-518`; `book/[bookId].tsx:1184`; `LearnerScreen.tsx:367-372`; `topic/relearn.tsx:316-318` |
| 6 Recitation | Practice hub `practice-recitation` (Beta) | `/(app)/session` `{mode:'recitation'}` | ✅ | owner | `practice/index.tsx:920-924` |
| 7 Quiz | Practice hub "Quiz" / vocab cards; CoachBand quiz-discovery (capitals/guess_who → `/(app)/quiz/launch`, vocabulary → `/(app)/quiz` picker, fixed 2026-06-10); quiz/history "Play again" | `/(app)/quiz` | ✅ | owner | `practice/index.tsx:397-423,832-839`; `LearnerScreen.tsx:391-401` |
| 8 Dictation | Practice hub `practice-dictation` | `/(app)/dictation` | ✅ | owner | `practice/index.tsx:879-883` |
| Assessment | Practice hub "Assessment" (pressable only when eligible topics exist; otherwise non-pressable locked hint) | `/(app)/practice/assessment-picker` → `/(app)/practice/assessment` | ✅ | owner | `practice/index.tsx:425-440` |
| Supporter-only | "Learn together → Add to my learning" (clone child topic) | `POST /curriculum/clone-from-child` → `/(app)/topic/relearn` (study mode) | — | ✅ (as self) | `LearnTogetherSheet.tsx`; `use-clone-from-child.ts:200-218` |
| Supporter-only | "Continue learning this topic" from the read-only transcript (archived only) | `session-transcript/[sessionId]` → `/(app)/session` `{mode:'learning'}` | — | ✅ (as self) | `session-transcript/[sessionId].tsx:179-186` |

> **Mode-value reality check.** Distinct `mode` strings actually pushed from production: `freeform`, `learning`, `review`, `homework`, `relearn`, `recitation`, `gap_fill`. There is **no `guided` mode** and **no live `practice` push** (`practice` survives only as a legacy alias normalized to `review` in `sessionModeConfig.ts:70-74`).

---

## Path 0: Learn Something New / First Curriculum Session

**Status:** prod-active. There is no `ONBOARDING_FAST_PATH` flag (confirmed absent). API-side topic-intent matching exists behind `MATCHER_ENABLED` (default off).

### Who hits it
Learners who tap **Learn something new**, an add-subject tile, or create a subject from an unresolved chat/homework prompt. Creates/resolves the subject, gets the first usable curriculum topic, and opens a normal teaching session.

### Flow

```
Home → home-action-study-new → /create-subject (top-level route, ungated)
  ├─ Learner types subject → POST /subjects/resolve (LLM), 30s timeout + retry
  │   │  (status enum has 5 values — subjects.ts:88-94 — not 4)
  │   ├─ direct_match            → silent create
  │   ├─ corrected               → typo/normalization applied → silent create
  │   ├─ resolved                → "We'll start with X — Accept / Edit" (suggestion chips when >1)
  │   ├─ ambiguous               → disambiguation chips
  │   └─ no_match                → "Create a new subject?"
  ├─ POST /subjects → createSubjectWithStructure() (subject.ts:317), threads conversationLanguage:
  │   ├─ focused_book → advisory lock + curriculum_books insert + safeSend app/subject.curriculum-prewarm-requested
  │   ├─ four_strands → regenerateLanguageCurriculum()
  │   └─ broad/narrow → detectSubjectType() → broad persists bookSuggestions / narrow persists curriculum_topics
  └─ Routes by branch:
      ├─ focused_book + narrow → transitionToFirstSession()
      ├─ broad                 → /pick-book/[subjectId] (pick a book first)
      └─ four_strands          → /onboarding/language-setup  (this branch SKIPS the /ready screen)

POST /subjects/:subjectId/sessions/first-curriculum  (startFirstCurriculumSession)
  ├─ Server polls FIRST_CURRICULUM_SESSION_WAIT_MS = 25_000ms (POLL 750ms) for a topic
  ├─ focused_book with no topics → materializeFocusedBookTopics() inline (5s budget)
  ├─ MATCHER_ENABLED=true → matchTopicByIntent() (rung flash, 1.5s, conf floor 0.6)
  ├─ ready → insert learning_sessions + session_start event (atomic), return sessionId + topicId
  └─ not ready → 409; mobile retries 3× @ 2s (FIRST_CURRICULUM_SESSION_MAX_ATTEMPTS=3)

Routing after creation:
  ├─ First subject ever → /ready → CTA → Session Screen   (EXCEPT four_strands, which skips /ready)
  └─ Existing learner   → Session Screen directly
→ Then behaves like Path 2 (Guided): notes / challenge / overlays / End Session → Summary.
```

### Path-0-specific side-effects (beyond the shared pipeline)
- **Topic probe extraction** — on the **first substantive learning message**, `maybeDispatchTopicProbeExtraction()` fires `app/topic-probe.requested` via a bare `inngest.send` annotated `// core-send` (`session-exchange.ts:1220-1277`). **The "core-send" here is a marker-rollback *compensation* pattern, NOT fail-the-user semantics** [was: "a broken probe dispatch fails the user's first exchange" — refuted]: the send is wrapped in try/catch, so on dispatch failure it rolls back the `topicProbeFiredAt` marker, captures to Sentry, and **returns normally** — the learner's first exchange is unaffected. Async extraction writes `learning_sessions.metadata.extractedSignals`.
- **Server-side focus inference** — when `rawInput` differs from `name`, `createSubjectWithStructure` (`subject.ts:323-334`) treats `rawInput` as the effective focus and forces the **focused_book** branch even if the client sent no explicit focus.
- **`returnTo='chat'` exit** — entering create-subject from an unresolved chat/homework prompt bypasses ALL structure-type routing and replaces straight to `/(app)/session` `{mode:'freeform'}` (`create-subject.tsx:328-340`), **not** the curriculum flow.
- **Reflection auto-note** — summary submission with a topic present calls `createNoteForSession()` (non-fatal on cap conflict).
- Close-path auto-filing is **not** eligible (mode=`learning`, topicId set).

---

## Path 1: Freeform Chat ("Just Ask Anything")

**Status:** prod-active. `mode=freeform`, `sessionType=learning`, no subject/topic at start.

### Flow

```
Home → home-ask-anything → /(app)/session {mode:'freeform'}
  ├─ Greeting guard: a pure-greeting first message is intercepted client-side (no API call)
  ├─ First substantive message → subject classification (CFLF) POST /subjects/classify
  │   ├─ 1 candidate  → auto-pick silently ("Looks like X")
  │   ├─ n candidates → disambiguation chips
  │   └─ 0 candidates → resolveSubject fallback / create-subject (returnTo=chat)
  ├─ AI responds using the subject's pedagogy (Socratic ladder / Four Strands)
  │   └─ FIRST AI turn uses the FIRST TURN RULE (teach one idea + one action). The old
  │      "fun-fact opener" has been REMOVED entirely [was: an unconditional fun-fact opener].
  ├─ Bookmarks available once an AI response is persisted with a subjectId (topicId nullable)
  └─ End Session → close (summaryStatus='pending') → Session Summary
      ├─ if still unfiled AND ≥5 exchanges → close-path auto-file requested in background (safeSend)
      └─ "Your Words" reflection OR Skip
```

### Key behavior & corrections
- **Filing affordance is homework-only.** `setShowFilingPrompt(true)` fires **only** for `effectiveMode==='homework'` (`use-session-actions.ts:375-376`). Freeform **never** shows the manual "Add to Library" prompt — it goes straight to summary. The ≥5-exchange threshold (MMT-ADR-0019, `FILING_CONFIG.minFreeformExchanges=5`) gates the **server-side auto-file dispatch only**, not a prompt.
- **Topic notes are CTA-suppressed when topicless.** The KNOWLEDGE CAPTURE block is still included for all non-recitation sessions, so the LLM *can* emit `note_prompt.show`; however, `SessionFooter` renders the "Write note" affordance and `NoteInput` only when `topicId` is present. A topicless freeform session no longer shows a note-save CTA or the old "cannot save" alert [was: "prompt can appear, save blocked at topicId guard"].
- Challenge Round excluded (no `topicId`).
- After background filing completes, `postSessionSuggestions` writes ≤2 `topic_suggestions` for the book.
- Durable review artifact for a filed freeform session = the LLM learner recap / structured summary (no learner-authored note).

---

## Path 2: Guided Learning (Subject + Topic)

**Status:** prod-active. `mode=learning` with `subjectId`+`topicId` preset [was: "freeform (scoped)"]. The richest path — notes, challenge, overlays, and reflection auto-note all apply.

### Flow

```
Library v3 (single-pane) → subject shelf → book card → topic row → Topic Detail
  └─ Single sticky CTA (deriveStudyCTA), NOT a two-button layout [was: 3 states × 2 buttons]:
      ├─ not_started                              → "Start studying"   (mode=learning)
      ├─ completed/verified/stable + strong       → "Practice again"   (mode=LEARNING, not review)
      ├─ completed/verified/stable + overdue      → "Review this topic" (mode=review → Path 4)
      └─ in_progress / other                      → contextual         (mode=learning)
  └─ /(app)/session {mode:'learning', subjectId, topicId}
      ├─ Topic-specific opening; FIRST TURN RULE on first turn
      ├─ Pedagogy: Socratic ladder OR Four Strands (per subject)
      ├─ Notes: manual "Add note"; LLM ui_hints.note_prompt.show / .post_session
      ├─ Challenge Round may be OFFERED (flag-gated, eligibility — see §Challenge Round)
      ├─ Verification overlays (evaluate / teach_back) may auto-trigger MID-SESSION (SM-2 gated)
      └─ End Session → close (pending) → Session Summary
          ├─ "Your Words" reflection ≥10 chars → LLM evaluates → "Mate feedback"
          │   └─ submitted reflection auto-creates a topic note (always when topicId set; non-fatal)
          └─ Skip
```

> **CTA label and route mode are independent derivations.** `deriveStudyCTA` (`topic/[topicId].tsx:228-245`) picks the **label** from `retentionStatus` (strong → "Practice again"), while `handleStudyPress` (`:450-463`) picks the **route mode** from `isOverdue` (`nextReviewAt < now`), *not* from `retentionStatus`. A non-overdue topic always routes `mode=learning` regardless of the label. When the in-progress topic has an active session, the CTA **resumes** it (`resumeTarget` / `activeSession.sessionId`, `:465-481`) rather than starting fresh.

Recording differs from freeform only in that `topicId` is set from session start, so there is **no filing step** and the post-session pipeline does not wait for filing; retention attaches immediately.

> **Verification overlays are mid-session, not a separate route.** The earlier claim that `/(app)/topic/relearn` launches `evaluate`/`teach_back` via a `verificationType` param is **refuted** — `relearn.tsx:307-332` passes no such param. Overlays activate inside the ongoing session (see §Verification Overlays). The route-level **Assessment** feature is the thing with explicit recall/explain/transfer *depths*.

---

## Path 3: Homework Help

**Status:** prod-active. `mode=homework`, `sessionType=homework`.

### Flow

```
Home → home-action-homework → Camera Screen (blocked in parent-proxy: read-only empty state)
  ├─ Permission states: first-request vs permanently-denied/Settings; re-checks on app resume
  ├─ Capture options (all in viewfinder): shutter · gallery pick · type/dictate manually
  ├─ OCR cascade (use-homework-ocr.ts): on-device ML Kit → if low-quality/handwritten →
  │   server OCR POST /v1/ocr (GeminiOcrProvider, multimodal LLM) → if that fails → retry → manual
  │   (There is NO separate "skip OCR, raw image to LLM" path. The captured image is ALSO attached
  │    as inline_data to the FIRST exchange message, so OCR text + raw image both reach the LLM.)
  ├─ Subject auto-classify → auto-set / auto-create / picker
  └─ POST /subjects/:subjectId/homework → /(app)/session {mode:'homework'}
      ├─ Opening shows captured problem text; FIRST TURN RULE does NOT apply (sessionType≠learning)
      ├─ Sub-mode per problem: "Help Me Solve It" (help_me) / "Check My Answer" (check_answer)
      │   — both forbid Socratic follow-up (no escalation ladder); CRITICAL THINKING block excluded
      ├─ Multi-problem navigation; POST /sessions/:id/homework-state emits
      │   homework_problem_started / _completed / ocr_correction events
      └─ End Session → Filing Prompt ("Yes, add it" / "No thanks") [homework is the ONLY path
          that shows the manual filing prompt] → Session Summary
          ├─ Submit "Your Words" → completion dispatch only
          └─ Skip → Recall Bridge POST /sessions/:id/recall-bridge — generates MAX 2 questions
             [was: "3"], homework-only, requires topicId (so empty unless the session was filed)
```

Step 6 of the post-session pipeline extracts the parent-facing `homeworkSummary` (`problemCount`, `practicedSkills`, `independentProblemCount`, `guidedProblemCount`, `summary`, `displayTitle`).

---

## Path 4: Practice / Review Session

**Status:** prod-active. Entry param is `mode=review` [was: `practice`]; header reads **"Review"** with subtitle "Refresh what you know" [was: "Practice Session"]. `uiMode=review` maps to `sessionType=learning`.

### Flow

```
Topic Detail (completed/verified/stable AND overdue) → "Review this topic"
  └─ /(app)/session {mode:'review', subjectId, topicId}
      ├─ Header: "Review" + visible client-side wall-clock timer
      ├─ Retention status (strong/fading/weak/forgotten) injected into the system prompt;
      │   starting escalation rung is retention-aware (forgotten→3, weak→2, else 1)
      ├─ REVIEW OVERRIDE: prefer source wording; general-knowledge source BLOCKED in review
      ├─ FIRST TURN RULE suppressed; a REVIEW calibration opener fires instead
      │   ("transition phrase + what do you remember?")
      ├─ Verification overlays (evaluate/teach_back) are SELECTED from the card but their prompt
      │   blocks are SUPPRESSED in review (gated !isReviewMode) — so no overlay actually runs
      └─ End Session → Session Summary (no filing prompt; topic exists)
```

> **Recording caveat.** Review has a live calibration grading path (`maybeDispatchReviewCalibration` → `review-calibration-grade.ts`) that can write SM-2 outside the ordinary overlay-quality path. The post-session `update-retention` step still skips when `effectiveQuality` is null, so review is **live-but-not-guaranteed**: non-substantive answers, cooldowns, or other no-quality edges may leave the card unchanged. [was: "review frequently records no SM-2 because overlays are suppressed" — over-pessimistic.]

The non-overdue **"Practice again"** CTA on a strong topic routes `mode=learning` (a normal learning session), **not** review.

---

## Path 5: Retention Relearn

**Status:** prod-active for the relearn screen; the **recall-test pre-check screen is orphaned**.

### Reachability reality
- **`/(app)/topic/relearn` — fully wired.** **Four** live entries: Library/home overdue banner (`LearnerScreen.tsx:369-372`), Practice hub "Review Topics" (`practice/index.tsx:514`), book "Start Review" (`book/[bookId].tsx:1184`), and the supporter **clone-from-child** bridge (`use-clone-from-child.ts:203-214`, opens relearn for the cloned topic in the supporter's own library) [was: "Three live entries" — the clone-from-child entry was omitted]. The first three land directly on the relearn method picker.
- **`/(app)/topic/recall-test` — fully orphaned.** The screen and the recall engine (`processRecallTest`) are live, but **no in-app navigation reaches it at all** — zero `router.push`/`href` hits, and **no** notification deep-link either [was: "the only inbound path is a push-notification deep-link" — refuted; the `recall_nudge` push routes to `/(app)/home`, `notification-tap-navigation.ts:34-37`]. The doc's old "recall-test failure → relearn" pre-check has no UI trigger. (Memory: `project_deadends_triage_and_subject_review.md` — screen dead, engine load-bearing.)

### Flow

```
Library pill / overdue banner / Practice hub → /(app)/topic/relearn
  ├─ Method picker (visual_diagrams / step_by_step / real_world_examples / practice_problems)
  │   — current preference highlighted as "Usual method"
  ├─ POST /retention/relearn (startRelearn):
  │   ├─ conditional INSERT of needs_deepening_topics (only if no active row; not an upsert) —
  │   │   passes NO source, so the row gets the schema default source='system_signal'
  │   │   [was: "upserts … source 'manual' or 'recall_failure'" — refuted; those values are
  │   │    never written here] (retention-data.ts:1104-1109)
  │   ├─ inserts learning_sessions {sessionType:'learning', metadata.effectiveMode:'relearn'}
  │   └─ returns the most recent learnerRecap for the topic as `recap`
  └─ /(app)/session {mode:'relearn', recap, sessionId, topicId}
      ├─ Opening uses the recap ("Last time we covered … want a quick quiz first?")
      ├─ NO dedicated relearn pedagogy block — runs as a standard learning exchange
      │   (general-knowledge source IS permitted, unlike review)
      └─ End Session → Session Summary (no filing prompt)
```

### Two known gaps (verify before relying on this path)
1. **Teaching preference is never written back.** `startRelearn` reads the preference and echoes the choice, but no code calls `setTeachingPreference` / the `PUT /subjects/:id/teaching-preference` endpoint from the relearn flow. The method choice is currently cosmetic.
2. **Challenge Round is temporarily blocked after relearn.** The `needs_deepening_topics` insert at relearn start sets `struggleStatus='needs_deepening'`, which fails the Challenge eligibility gate. This is not permanent in the normal quality-bearing path: `updateNeedsDeepeningProgress()` resolves the row after `EXIT_CONSECUTIVE_SUCCESSES = 3` good completions. The remaining risk is no-quality or abandoned relearn sessions, which do not advance the counter.

### Relearn-specific side-effect
`relearn-retention-reset` (CRITICAL pipeline step) resets the SM-2 card to baseline (`easeFactor 2.5, intervalDays 1, repetitions 0, failureCount 0`) **before** the SM-2 advance step runs. It is gated on `mode==='relearn'`, `topicId`, `exchangeCount > 0`, and `effectiveQuality != null` [was: documented as mode-only].

---

## Path 6: Recitation Session

**Status:** prod-active (Beta). `mode=recitation`, `sessionType=learning`.

### Flow

```
Home → home-action-practice → Practice Hub → "Recite (Beta)" → /(app)/session {mode:'recitation'}
  ├─ Subject silently auto-assigned (availableSubjects[0]) — no classification dialog
  ├─ Input mode is USER PREFERENCE (text default, restored from SecureStore), NOT forced voice
  │   [was: "voice is primary"]. Voice feedback covers pace/expression; text feedback is restricted
  │   to wording/structure/completeness.
  ├─ Recitation prompt block injected; NO Socratic ladder, NO FIRST TURN RULE, NO no-recall-recovery
  ├─ Last 4 user turns + current bundled as `recitation_text` evidence each turn
  └─ End Session → Session Summary (no filing prompt)
```

### Side-effects not in the old doc
- **`practice_activity_events` write per AI turn** (`activityType='recitation'`).
- **No filing-wait timeout for recitation.** Topicless recitation used to enter the generic topicless-session wait and emit `app/session.filing_timed_out` after 60s; the pipeline now skips that wait when `event.data.mode === 'recitation'` [was: guaranteed 60s wait].
- The full post-completion pipeline (coaching card, LLM summary, memory, XP, streak, embeddings) runs regardless of topic context. Verification overlays and Challenge Round do not run.

---

## Path 7: Quiz Activity

**Status:** prod-active. Non-session bounded activity (own tables).

### Flow

```
Practice Hub → "Quiz" → /(app)/quiz (Quiz Index)
  ├─ Capitals (always) · Vocabulary: <Language> (one card per active four_strands subject;
  │   locked card if none) · Guess Who (always)
  └─ /(app)/quiz/launch → POST /quiz/rounds (LLM generate; Capitals is deterministic, no LLM)
      ├─ Rotating loading copy; 20s "taking longer" hint; HARD 30s timeout → error panel
      ├─ Typed error classification via classifyApiError().recovery: quota/forbidden/consent → no
      │   Retry; network/server → Retry
      ├─ if round.difficultyBump → full-screen "challenge" banner (quiz-challenge-banner) requiring
      │   an explicit Start tap before play (does NOT go straight to play) — launch.tsx:161-167
      └─ /(app)/quiz/play
          ├─ Server-checked answers: POST /quiz/rounds/:id/check (options stripped of correct answer)
          ├─ Guess Who: progressive clues; score scales with cluesUsed
          ├─ Advance resets answerState/selectedAnswer/freeText/guessWhoClues/timer in one React
          │   batch (BUG-929); mid-round quit = in-app Modal with Keep Playing / Save & Finish /
          │   Leave (BUG-892); tab bar hidden (FULL_SCREEN_ROUTES)
          ├─ Last question → POST /quiz/rounds/:id/complete (atomic; server-recorded results are
          │   source of truth, client results ignored)
          └─ /(app)/quiz/results (celebrationTier perfect/great/nice) → Play Again / Done
After dismissal: /(app)/quiz/history → /(app)/quiz/[roundId]
```

### Corrections (verify against the old doc)
- **No `quiz_stats` table.** Stats are computed on-demand from `quiz_rounds` via SQL GROUP BY (`computeRoundStats`). [was: "writes to `quiz_stats`"]
- **Persistent celebration is queued on completion.** `celebrationTier` is computed, returned to the client, and mapped to the existing home-surface celebration queue via `queueCelebration()` in a non-fatal `safeWrite` [was: "no celebration queued"].
- **Mid-round prefetch is dead code.** `usePrefetchRound` + `/quiz/rounds/prefetch` exist but no production screen calls them; `prefetchedRoundId` is always null, and Play Again falls back to a fresh `launch`. [was: "mid-round prefetch at 50% so Play Again is instant"]
- **Quiz XP is not written to `xp_ledger`.** It lives in `quiz_rounds.xpEarned` + `practice_activity_events.pointsEarned`. The `xp_ledger` is session/topic-scoped only.

### Does quiz feed learning/retention?
**Yes, via its own systems** (not `retention_cards`): Vocabulary quizzes upsert discovery words into the `vocabulary` bank and run SM-2 on `vocabulary_retention_cards`; Capitals/Guess Who run SM-2 on `quiz_mastery_items`. Wrong answers → `quiz_missed_items`, injected into the next round's prompt. Streak via `app/streak.record` (safeSend). It does **not** write `learning_sessions`, `session_summaries`, `learning_profiles`, or `retention_cards`.

---

## Path 8: Dictation Activity

**Status:** prod-active. Non-session bounded activity (own tables).

### Flow

```
Practice Hub → "Dictation" → /(app)/dictation (Choice)
  ├─ "I have a text" → /(app)/dictation/text-preview  (BLANK editable TextInput — NO camera/OCR
  │   in this flow [was: "Camera → OCR"]; no dictation text-preview `ocrText` route param/producer)
  │   → POST /dictation/prepare-homework (LLM sentence-split + punctuation) → Playback
  └─ "Surprise me" → POST /dictation/generate (LLM, 6-10 sentences [was: "6-12"], age-appropriate
      by AGE ONLY — does NOT read learning history/interests [was: "age-appropriate to recent
      topics"]) → Playback
          ├─ Client-driven TTS playback (no network); pace/punctuation prefs in SecureStore;
          │   3.5s silent countdown (UI label, not spoken)
          └─ Complete:
              ├─ "Check my writing" (NO feature-flag gate [was: "hidden if flag off"]):
              │   camera → POST /dictation/review (rung-2 multimodal LLM; reads learningProfiles
              │   .struggles best-effort, does NOT write back; 10/min rate limit) → per-mistake
              │   remediation → POST /dictation/result {reviewed:true}
              └─ "I'm done" → POST /dictation/result {reviewed:false}
```

### Recording & feed
- **No `dictation_streaks` table.** Streak is computed on-the-fly from `dictation_results` (last 60 distinct dates). [was: "`dictation_streaks`"]
- Writes `dictation_results` + `practice_activity_events` (`activityType='dictation'`, no XP in v1). The latter feeds weekly/monthly reports — **reporting only**.
- Dictation feeds **no** retention/memory/curriculum system.

---

## Path NEW: Assessment (verification-depth ladder)

**Status:** prod-active, undocumented in the prior edition. A route-level evaluated-practice loop, distinct from the mid-session `evaluate`/`teach_back` overlays.

### Flow

```
Practice Hub → "Assessment" → /(app)/practice/assessment-picker
  │   (useAssessmentEligibleTopics → GET /retention/assessment-eligible
  │    [was: "POST /assessments" — refuted; eligibility is a retention GET])
  └─ /(app)/practice/assessment → useCreateAssessment
  │   → POST /subjects/:subjectId/topics/:topicId/assessments
  │     [was: bare "POST /assessments" — refuted; no such route exists]
      ├─ VerificationDepth ladder: recall → explain → transfer
      ├─ useSubmitAnswer per question → POST /assessments/:id/answer
      │   (on terminal pass, co-commits SM-2 retention update + XP entry in the SAME transaction)
      └─ Terminal status:
          ├─ passed
          ├─ borderline       → opens /(app)/session {mode:'gap_fill', gaps: JSON.stringify(weakAreas)}
          │                      (dedicated "Gap Check" chrome; server keys off gaps + topicId).
          │                      Secondary action "decline-refresh" →
          │                      PATCH /assessments/:id/decline-refresh → back to /(app)/practice
          └─ failed_exhausted → opens /(app)/session {mode:'learning'}
```

API: `apps/api/src/routes/assessments.ts` (create at `:51`; submit-answer at `:211-238`; `decline-refresh` PATCH at `:299-328`; sibling `POST /sessions/:id/quick-check` at `:370-416`), `services/assessments.ts`. Writes `assessments` rows with `verificationDepth`.

---

## Path NEW: Interleaved Retrieval — **server-built / mobile-dormant**

**Status:** the API path is complete end-to-end; **no mobile surface reaches it**. Documented here because it is launch-relevant (decide: ship an entry point or mark dead).

- **What it is:** a mixed-topic spaced-retrieval session. Selects up to N (default 5) due/most-stale retention-card topics across subjects, shuffles them, and runs one session that cycles between all of them (interleaving for discrimination). Cites Story 4.6 / FR92-93.
- **Creation:** `POST /v1/sessions/interleaved` (`sessions.ts:1479-1497`, `assertNotProxyMode`, returns `{sessionId, topics}`; `NoInterleavedTopicsError`→400) → `startInterleavedSession` (`interleaved.ts:144`) inserts `learning_sessions` with `sessionType:'interleaved'` and `metadata.interleavedTopics`.
- **Behavior:** prompt builder injects "INTERLEAVED RETRIEVAL … cycle between them" with a numbered topic list (`exchange-prompts.ts:145-148,675-689`); exchange handler has an `isInterleaved` branch.
- **Distinct write:** the post-session pipeline updates SM-2 retention cards for **all** practiced topics (`session-completed.ts:515-523` reads `event.data.interleavedTopicIds`), not just one.
- **Reachability:** zero mobile callers (`grep interleaved` in `apps/mobile/src` finds only unrelated hits). Absent from every mobile route and the old session-type table.

---

## Challenge Round (within eligible topic-bound learning sessions)

**Status:** code shipped, **API flag-gated** — `CHALLENGE_ROUND_RUNTIME_ENABLED` defaults `false` (`config.ts:145`); off in all envs today. When false: no prompt block injection, signals ignored, no mobile `challengeOffer`/`challengeRound`/`draftedNote`.

A short transfer/application check inside an ordinary learning session, followed by mastery/review persistence and optional note capture. **Not** the same as the `evaluate` overlay.

### Eligibility — all VERIFIED against `challenge-round/trigger.ts:22-136`
- `sessionType==='learning'`; topic-bound (freeform excluded — enforced in the caller `session-exchange.ts:2036-2037`).
- `struggleStatus==='normal'` (derived: any active needs-deepening row → not normal).
- `exchangeCount >= 5`; `recentCorrectStreak >= 2`.
- Retention `strong`, OR new-topic with evidence (`>=7` exchanges, `>=4` solid answers, `>=4` correct streak).
- Quota `>= 3` remaining turns; free tier also needs `>= 5%` quota fraction.
- No active/offered/declined round blocking; no same-topic decline cooldown (24h).

### Flow

```
Eligible → LLM emits signals.challenge_round_offer → ChallengeOfferCard (pitch = AI text)
  ├─ Accept → POST /v1/challenge-round/accept → state 'active' (up to 3 questions, MAX=3)
  │   ├─ per answer: signals.challenge_round_evaluation[] (each MUST carry answerEventId + learnerQuote)
  │   ├─ server STRICT-validates answer event ids are this session's user_message events,
  │   │   and OVERWRITES learnerQuote with real DB content (anti-hallucination) → else reject whole eval
  │   └─ when index >= total → 'drafting'
  ├─ Decline → state 'declined' AND ALWAYS writes a 24h topic cooldown row
  │   [was: cooldown only for "don't ask again"]; dontAskAgain only sets the in-session flag
  └─ Don't-ask-again → session decline + cooldown
Finalize (decideMasteryAndReview):
  ├─ all solid → INSERT assessments {masteryChallengeVerifiedAt, depth 'transfer', quality 5}
  │   [recorded via INSERT, not UPDATE]
  ├─ partial/misconception → needs_deepening_topics (source 'challenge_round', 7-day expiry)
  ├─ all missing → reteach (no mastery)
  └─ solid evidence → DraftedNoteReview (intended lexical-overlap guard exists, but the
     current save route does not call `validateNoteDraft`; do not treat Save as guarded)
```

- **LLM rung floor IS in source** (`resolveChallengeRoundLlmRoutingRung`, `session-exchange.ts:260-275`) — floors accepted/active/drafting turns to the advanced rung. [CLAUDE.md says "mechanism planned, not yet in source" — that note is stale.]
- State stored in `learning_sessions.metadata.challengeRound`; cross-session cooldown in the `challenge_round_cooldowns` table.

---

## Verification Overlays (within a learning session)

**Mid-session overlays**, SM-2-gated; **not** separate routes.

### Devil's Advocate (`evaluate`)
- Triggers when `easeFactor >= 2.5 && repetitions > 0` (`evaluate.ts:28-33`). AI presents a plausibly flawed explanation; emits `signals.evaluate_assessment {challenge_passed, flaw_identified, quality 0-5}`. SM-2 mapping: passed clamps to [3,5], failed floors at 2-3 (a single fail won't tank retention). Difficulty rung persists on `retention_cards.evaluateDifficultyRung`.

### Feynman (`teach_back`)
- Triggers when `easeFactor >= 2.3 && repetitions > 0` (weaker gate; only if evaluate didn't trigger — mutually exclusive per exchange). AI plays "clueless student"; emits `signals.teach_back_assessment {completeness, accuracy, clarity, overall_quality, weakest_area, gap_identified}`. SM-2 = accuracy·0.5 + completeness·0.3 + clarity·0.2.

Both feed the post-session `update-retention` SM-2 step via `effectiveQuality`.

### Path-gating — **[was inverted in the old doc]**

| Effective mode | Overlays run? |
|---|---|
| `learning`, `relearn` | **Yes** (if the topic's retention card qualifies) |
| `freeform` | **No** — topicId-less, so no retention card is ever loaded (`session-exchange.ts:1513,1537`); the auto-select `else if (retentionCard && …)` at `:1717-1721` can never fire [was: listed as "Yes (if the retention card qualifies)" — refuted; freeform structurally cannot have a retention card] |
| `practice` / `review` | **No** — `isReviewMode` suppresses the prompt blocks |
| `recitation` | **No** — `isRecitation` suppresses |
| `homework` | **No** — wrong `sessionType` |
| `interleaved` | **No** — `!isInterleaved` check |

The old doc's "Guided + Practice only" was wrong in both directions: practice/review are **blocked**, and **relearn** qualifies (it is a topic-bound learning session). Freeform does **not** qualify — being topicId-less, it never loads a retention card.

---

## Notes (within tutoring sessions)

Notes are topic-bound. All four creation routes converge on `topic_notes` via `insertNoteWithCap()` (cap `MAX_NOTES_PER_TOPIC = 50`, advisory-locked).

1. **Manual note** — "Add note" tool chip (shows in `teaching` stage, not topic-gated) → `NoteInput` → `POST /subjects/:s/topics/:t/notes`.
2. **LLM `note_prompt`** — `ui_hints.note_prompt.show` renders a "Write note" affordance only when `topicId` is present; `.post_session` opens `NoteInput` near session end under the same topic gate. Emitted for all non-recitation sessions, but topicless sessions suppress the CTA.
3. **Reflection auto-note** — "Your Words" reflection is copied verbatim into a topic note when `session.topicId` is set (cap conflict non-fatal).
4. **Challenge drafted note** — LLM-authored from solid answers only. `validateNoteDraft()` exists and is used in the Challenge signal path, but the current note-save route does not call it before `DraftedNoteReview` Save/Skip [was: save was described as guarded].

### Corrections
- **There is NO LLM review of a learner-authored note.** The only LLM evaluation nearby is `evaluateSummary()` on the *reflection* (route 3's source text), which gates reflection-bonus XP and "Mate feedback". The Challenge draft (route 4) is LLM *authoring*; its deterministic guard exists but is not wired into the current save route.
- **Freeform topicless notes are CTA-suppressed** — the prompt signal can arrive, but `SessionFooter` suppresses both the CTA and editor when `topicId` is missing [was: save-time alert].
- **`signals.needs_deepening` does NOT write a `needs_deepening_topics` row** — it is stored only in `session_events.metadata.needsDeepening` (telemetry). There are **two** production writers of `needs_deepening_topics`: the Challenge Round (`source='challenge_round'`, `challenge-round/persistence.ts:254` / `session-exchange.ts:777`) and the **relearn flow** (`retention-data.ts:1104-1109`, no explicit source → schema default `source='system_signal'`) [was: "the only writer is the Challenge Round; the `system_signal` default is unused" — refuted; the relearn path relies on the `system_signal` default].

### Per-path note applicability

| Path | Manual | note_prompt | Reflection auto-note | Challenge draft |
|---|---|---|---|---|
| 0 / 2 Learning | ✅ | ✅ | ✅ (topic set) | ✅ (flag on) |
| 1 Freeform | ✗ unless a topic has been attached | prompt may fire, CTA suppressed without topic | ✗ (no topic) | ✗ |
| 3 Homework | ✅ if topic-bound | ✅ | ✅ if topic | ✅ if topic-bound |
| 4 Practice/Review | ✅ | ✅ | ✅ | ✅ |
| 5 Relearn | ✅ | ✅ | ✅ | (blocked by needs_deepening status) |
| 6 Recitation | ✅ if topic-bound | ✗ (`!isRecitation` excludes) | ✅ if topic | unlikely |
| 7 Quiz / 8 Dictation | ✗ (activity, no session UI) | ✗ | ✗ | ✗ |

---

## Bookmarks (within any tutoring session)

Save AI messages mid-session once an AI response is persisted with a `subjectId`. `topicId` is nullable, but `bookmarks.subjectId` is NOT NULL; a fully subjectless freeform turn cannot be bookmarked until classification/attachment supplies a subject. A one-time `BookmarkNudgeTooltip` appears after a few responses (per-profile SecureStore key). Saved at `/(app)/progress/saved`; parent-proxy hides delete. Bookmarks don't change pedagogy or recording.

---

## First-Turn AI Opener — **[fun-fact opener REMOVED]**

The unconditional "fun fact" opener no longer exists in any mode. For `sessionType==='learning'` non-review, non-recitation, non-language sessions, the **FIRST TURN RULE** fires instead (teach one idea + one focused action). Review sessions get a calibration opener; homework/recitation/language are exempt by their own gates.

---

## Next-Topic Recap Card (all tutoring paths)

**Status:** prod-active. After the session resolves, `generate-learner-recap` (pipeline step 2c) produces `closingLine`, `learnerRecap` (1-4 takeaways), `nextTopicId`, `nextTopicReason`, persisted on the `session_summaries` row. Gated: `exchangeCount >= 3` AND `transcriptTurns >= 4`. `nextTopicReason` is set only for topic-bound sessions (freeform always `null`). `nextTopicTitle` is **not stored** — it is resolved at read time from `next_topic_id`, so it always reflects the current topic name. The mobile summary screen polls every 2s (15s timeout) and renders `session-next-topic-card`; `nextTopicReason` is fed back into the next session's prompt via `session-context-builders.ts:513-515`.

**Not wired (data-only):** `topicOrder` exists only in `curriculumAdaptResponseSchema` (the `PUT /curriculum/adapt` result), not in any subjects/recap response; no mobile consumer. [was: cited at `subjects.ts:333` as a recap field — wrong location and context.]

---

## Session lifecycle & Post-Session Pipeline (all session paths)

Real handler: `apps/api/src/inngest/functions/session-completed.ts` (concurrency 25/profile, idempotent on `sessionId`).

### Close → pending → dispatch

```
End Session → POST /sessions/:id/close
  ├─ closeSession() in one transaction: status→completed (or auto_closed if silence_timeout),
  │   writes wallClockSeconds + durationSeconds, creates pending session_summaries row
  ├─ client summaryStatus sanitized to only 'pending' | 'skipped'
  ├─ dispatchClosePathAutoFileIfEligible (freeform + no topic + ≥5 exchanges → safeSend auto-file)
  └─ app/session.completed dispatched ONLY if summaryStatus ∉ {pending, submitted, auto_closed}
      (so a normal pending close does NOT dispatch; a skip close dispatches immediately)

Dispatch actually fires from FOUR sites [was: "three sites"]. The three ROUTE sites go through
dispatchSessionCompletedEvent (CORE-send, idempotency key session-completed-${id}-${status}):
  ├─ Submit "Your Words"  POST /sessions/:id/summary       (LLM evaluates reflection; bonus XP; auto-note)
  ├─ Skip                 POST /sessions/:id/summary/skip
  └─ Close (skip-status)  POST /sessions/:id/close          (a skip close dispatches immediately)
The fourth site is the Stale-cleanup cron (auto_closed, reason silence_timeout) — it sends an
un-keyed event array, so it relies on Inngest's native delivery dedup, NOT the ${id}-${status} key.
```

### `app/session.completed` — ACTUAL ordered steps

| Step | What | Gate |
|---|---|---|
| wait-for-filing (≤60s) | wait `app/filing.completed` | `(sessionType==='homework' \|\| !topicId) && !auto_closed && mode!=='recitation'` [was: "freeform/homework only"; then recitation also waited] |
| re-read-session | backfill topicId/exchangeCount | if missing |
| process-verification-completion | evaluate/teach_back → SM-2 quality | vType ∈ {evaluate, teach_back} + topicId |
| **relearn-retention-reset** | reset card to baseline | mode==='relearn' + topicId + exchangeCount>0 + effectiveQuality!=null [**omitted from old doc**] |
| update-retention | SM-2 advance | skip if no topics OR quality null |
| update-vocabulary-retention | extract + upsert vocab | four_strands + languageCode |
| update-needs-deepening | needs-deepening progress | quality + topics |
| check-milestone-completion | language milestone celebration | language milestone advanced |
| write-coaching-card | progress snapshot + pending summary + coaching card | always |
| generate-session-insights (2b) | parent-facing highlight/narrative/prompt/engagement | LLM if ≥3 exchanges, else template |
| generate-learner-recap (2c) | closingLine/learnerRecap/nextTopic | needs summary row + subjectId |
| generate-llm-summary (2d) | structured LLM summary | always (subject/topic optional) |
| analyze-learner-profile (3) | LLM transcript → learning_profiles | **3-layer consent/GDPR gate** (see §Memory) |
| **embed-new-memory-facts** | Voyage-embed new memory_facts | Voyage key [**omitted from old doc**] |
| **dedup-new-facts** | dedup facts | `MEMORY_FACTS_DEDUP_ENABLED` rollout [**omitted**] |
| **notify-struggle (3b)** | push to parent | struggle detected [**omitted**] |
| update-dashboard (CRITICAL) | streaks + XP | XP always; streak skipped if unattended/0-exchange |
| generate-embeddings | session embedding (Voyage, 1024-dim) | **no consent gate** (see asymmetry note) |
| extract-homework-summary (6) | parent-facing homework summary | sessionType==='homework' |
| update-pace-baseline | median response seconds | always |
| queue-celebrations | streak/mastery/verification celebrations | per-condition |

> **There is NO "Step 7: track summary skip count."** That step is fictional — skip handling lives in `skipSummary()`, not the pipeline.

### Crons
- **session-stale-cleanup** — runs **every 10 min** (`*/10 * * * *`), closes sessions idle **>30 min**, dispatches `app/session.completed` with `auto_closed`/`silence_timeout`. [was: "runs after 30 minutes" — 30 min is the threshold, 10 min is the cadence.] Also abandons stale quiz rounds (>2h).
- **summary-reconciliation-cron** — daily 04:00 UTC; scans recent ended sessions for missing summary rows / LLM summaries / learner recaps and fans out create/regenerate events without replaying the full pipeline. (No coverage for missing parent insights.)

---

## LLM Summary / Recap stack

Five layers, all writing the `session_summaries` row:
1. **session_summaries lifecycle** — `pending → submitted | accepted | skipped | auto_closed` (priority-merged).
2. **Reflection eval** — `POST /sessions/:id/summary` → `evaluateSummary` (rung 2) → `{feedback, isAccepted}`; accepted grants bonus XP. Works for freeform (no topic needed).
3. **Learner recap + next-topic (2c)** — see §Next-Topic Recap Card.
4. **Structured LLM summary (2d)** — `generateAndStoreLlmSummary` (rung 2) writes `llmSummary` JSONB; numeric-grounding guard; emits `summary.generated`/`summary.failed`. Used for archived-transcript responses, not real-time UI.
5. **Parent insights (2b)** — `highlight`/`narrative`/`conversationPrompt`/`engagementSignal`; LLM if ≥3 exchanges else template; surfaced via `GET /recaps`.

---

## LLM Memory

The write→read loop around `learning_profiles` (+ `memory_facts` + `session_embeddings`).

- **Write (pipeline step 3):** `analyzeSessionTranscript` (LLM) → `applyAnalysis` merges JSONB (interests, strengths, struggles, communicationNotes, learningStyle, recentlyResolvedTopics), behind a **3-layer gate**: memory consent `granted` + `memoryCollectionEnabled !== false` (pre-LLM), `isGdprProcessingAllowed` (pre-LLM, so the transcript never leaves for the LLM under withdrawn consent), then both re-checked inside the write transaction. **Consent-blocked runs are skipped silently (no log/metric).**
- **Read-back:** `buildMemoryBlock` renders profile fields into every exchange prompt, behind a separate injection gate (`memoryConsentStatus==='granted' && memoryInjectionEnabled`).
- **Onboarding dimensions:** `interests` ride the (consent-gated) memory block; `pronouns` + `conversation_language` ride the **router personalization preamble** (`router.ts:231-256`) and are **NOT consent-gated**.
- **Embeddings (step 5):** Voyage `voyage-3.5`, 1024-dim, into `session_embeddings`/`memory_facts`. **No consent gate** — an asymmetry with step 3 (transcript→Voyage is ungated while transcript→generative-LLM is gated). Flagged for legal: likely intentional (embeddings are for the learner's own retrieval, not fed to a generative model) but should be documented or gated.
- **Which paths feed memory:** only `learning`/`homework`/`interleaved` session types feed memory in practice. **Caveat:** this exclusion is **not** enforced by a `sessionType` gate in the pipeline — `analyze-learner-profile` (`session-completed.ts:1380-1396`) is gated only on consent + GDPR. The exclusion holds because Quiz/Dictation are non-session activities that never dispatch `app/session.completed` with a conversational transcript — *not* because the memory step refuses them. If either ever dispatched the event with a transcript, the memory write would run.

---

## 11. Supporter surfaces (what supporters see and do)

Supporters mostly consume **outputs**. The prior "What Parents See" section covered ~30% of the real surface; the full map:

### ParentHomeScreen (mentoring hub)
Rendered when `home.screen==='FamilyHome'`. Per-child `ChildCommandCard`: tap → `/(app)/child/[profileId]`; "Learn together" → `LearnTogetherSheet`; "Reports" → `/(app)/child/[id]/reports`; "Nudge" → `NudgeActionSheet`. Plus household pulse, child-cap banners, add-child.

### The one supporter→learning entry: clone-from-child
`LearnTogetherSheet` / `AddToMyLearningButton` → `POST /curriculum/clone-from-child` clones the child's latest topic into **the supporter's own library**, then opens `/(app)/topic/relearn` in study mode — a session **for the supporter as a learner**, never as/for the child. `AddToMyLearningButton` also appears on recap detail, child session detail, and child topic detail.

### Recaps tab (V1 guardian)
`/(app)/recaps` (list) + `/(app)/recaps/[recapId]` (detail). Shows child recaps (narrative / displaySummary / highlight, conversationPrompt, topic). `GET /recaps` / `GET /recaps/:id`, owner-only. Detail has `AddToMyLearningButton` and "Open session" → `/(app)/child/[id]/session/[sessionId]`.

### Child profile screens (`/(app)/child/[profileId]/…`)
`index` (overview, `?mode=settings|progress`), `session/[sessionId]` (parent-facing read-only recap — narrative/highlight/conversationPrompt/homeworkSummary, no "join/resume"), `subjects/[subjectId]`, `topic/[topicId]`, `curriculum`, `mentor-memory` (edit what the mentor remembers), `reports` + `report/[reportId]`, `weekly-report/[weeklyReportId]` (marks viewed on mount, push-driven). All gated by `assertOwnerAndParentAccess` + `canEnter` family-child rules.

### Read-only session transcript
Top-level `session-transcript/[sessionId]` (NOT under `(app)/`; manual `useAuth` guard), reached from the session-summary "View full transcript" link. Bubbles run through `stripEnvelopeJson`. `GET /sessions/:id/transcript` has **no `assertNotProxyMode`** (reading is safe; in proxy the active profile is the child's).

### Dashboard data sources
`GET /dashboard` + `/dashboard/children/:profileId/*` read `learning_sessions`, `session_events`, `progress_snapshots`, `learning_profiles`, `retention_cards`, `curriculum_topics`, `assessments`, `weekly_reports`, recap/insight records, and `metadata.homeworkSummary`.

### Notifications → supporter content
`struggle_noticed|flagged|resolved`, `weekly_progress`, `monthly_report` → `/(app)/recaps` (list, family ctx). `progress_refresh` → `/(app)/progress`. Learner-facing nudges (`nudge`, `review_reminder`, `recall_nudge`, `dictation_review`) → `/(app)/home` (study ctx). Cross-context taps during an active session prompt before navigating.

---

## Mode Comparison Matrix — tutoring sessions

| Aspect | Freeform | Guided | Homework | Practice/Review | Relearn | Recitation | Interleaved |
|---|---|---|---|---|---|---|---|
| `mode` param | freeform | learning | homework | review | relearn | recitation | n/a (API) |
| Session type (DB) | learning | learning | homework | learning | learning | learning | **interleaved** |
| Subject/topic at start | No / No | Yes / Yes | Sometimes / No | Yes / Yes | Yes / Yes | auto / optional | multi-topic |
| Subject classification | first message | skipped | first message | skipped | skipped | skipped | skipped |
| Filing on close | bg auto-file if ≥5 & eligible | No | **manual prompt** | No | No | No | No |
| Pedagogy | per subject | per subject | direct (no Socratic) | review override | standard learning | verbatim recall | cycle topics |
| First-turn opener | FIRST TURN RULE | FIRST TURN RULE | none | review calibration | recap-based | none | n/a |
| Verification overlays | **Yes** | **Yes** | None | **No** (suppressed) | **Yes** | None | None |
| Challenge Round | No | flag-gated | No | No (review) | temporarily blocked while `needs_deepening` is active | No | No |
| Timer visible | No | No | No | **Yes** | No | No | No |
| Reachable in mobile | Yes | Yes | Yes | Yes | Yes | Yes (Beta) | **No (dormant)** |

## Mode Comparison Matrix — practice activities

| Aspect | Quiz | Dictation | Assessment |
|---|---|---|---|
| Subject at start | optional (vocab) | No | topic-scoped |
| Server-validated answers | Yes (per-question) | Yes (multimodal review, optional) | Yes (per-answer) |
| Feeds retention | Yes (own tables: vocabulary / quiz_mastery_items) | No | Yes (`assessments`) |
| XP | `quiz_rounds.xpEarned` + practice_activity_events (NOT xp_ledger) | None (v1) | `xp_ledger` entry atomically co-committed with SM-2 on terminal pass |
| Spawns a session? | No | text-preview → homework session | borderline→gap_fill (Gap Check chrome), failed→learning |
| Tables | `quiz_rounds` (+ missed_items, mastery_items); stats computed live | `dictation_results` (streak computed live) | `assessments` |

---

## Cross-Cutting Dimensions

| Dimension | Values | Scope | Effect |
|---|---|---|---|
| Pedagogy mode | `socratic` / `four_strands` | per subject | Socratic ladder vs Four Strands |
| Input mode | `text` / `voice` | per session | full vs ≤50-word spoken-style |
| Celebration level | `all` / `milestones` / `none` | per profile | which celebrations appear |
| Conversation language | BCP-47 (mandatory) | per profile | tutor prose language (router preamble; **not** consent-gated) |
| Pronouns | free-form / declined below age floor | per profile | addressing the learner (router preamble; **not** consent-gated) |
| Interests context | free-form snippet | per profile | seeds analogies (memory block; **consent-gated**) |
| App UI locale | en/nb/de/es/pl/pt/ja | per profile | UI strings via `t()` |
| Active profile lens | owner / impersonated-child | per navigation | proxy hides destructive + learning actions |

> **Removed dimension.** The persistent `learningMode: 'serious' | 'casual'` toggle was removed in Phase 0 (PR #325); a single default tone (`DEFAULT_TONE_GUIDANCE`) applies. [The `learningModes` DB table still exists but now stores the `medianResponseSeconds` pace baseline — do not mistake the table name for the removed feature.]

**Render guard:** every AI message bubble in every path — and the read-only transcript — passes through `stripEnvelopeJson` (BUG-941) so leaked envelope JSON / `[MARKER]` tokens are hidden.

---

## Removed / orphaned / dormant — confirmed state

| Item | State | Evidence |
|---|---|---|
| `/(app)/learn-new` intermediate screen | **removed** | no route file; e2e comment confirms gone |
| `ONBOARDING_FAST_PATH` flag | **absent** | no source hits |
| `personaFromBirthYear` fossil | **absent** | guarded by `persona-fossil-guard.test.ts` |
| `learningMode: serious/casual` toggle | **removed** | `exchange-prompts.ts:195-203` |
| recall-test screen (`topic/recall-test.tsx`) | **orphaned** | no in-app push; push-notification deep-link only |
| Interleaved session | **server-built / mobile-dormant** | no mobile caller |
| `shelf/[subjectId]` + `book/[bookId]` | **still present** as detail routes | the *tab* is gone (Library v3), the screens remain and are pushed-to |
| Quiz mid-round prefetch | **dead code** | hook + route exist, no production caller |
| `quiz_stats` / `dictation_streaks` tables | **do not exist** | stats/streak computed on demand |

---

## Open questions to resolve before this doc is "frozen"

1. **Interleaved Retrieval** — intended-future (wire a mobile entry) or dead (remove)? It is fully server-built.
2. **recall-test pre-check** — re-wire an in-app entry, or formally retire the screen? It has **no inbound path at all** (not even a notification deep-link — `recall_nudge` routes to `/home`), but the engine (`processRecallTest`) is load-bearing.
3. **Relearn teaching-preference write** — the method choice is currently never persisted (`PUT /subjects/:id/teaching-preference` is unwired from the relearn flow). Intended or a gap?
4. **Relearn → Challenge Round block** — no longer a permanent-block assumption; quality-bearing completions resolve `needs_deepening` after 3 good completions. Decide whether no-quality/abandoned relearn sessions need a separate unblock policy.
5. **`gap_fill` server semantics** — mobile now has dedicated `gap_fill` chrome. Confirm whether the server should continue treating it as standard learning with `gaps`+`topicId`, or needs distinct analytics/prompt handling beyond the existing gap prompt block.
6. **Embedding consent asymmetry** — document step 5 as intentional, or gate it with `isGdprProcessingAllowed`.
7. **Consent-skip observability** — memory write is skipped silently; add a metric if visibility is wanted.
8. **Production flag state** — confirm live Doppler values of `EXPO_PUBLIC_ENABLE_MODE_NAV` / `..._V1` before publishing the tab matrix as authoritative.
