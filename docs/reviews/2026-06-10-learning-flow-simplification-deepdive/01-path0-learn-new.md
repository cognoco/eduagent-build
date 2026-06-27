# Path 0 — Learn Something New: Deep-Dive

> **STATUS (2026-06-27):** Partial — W1 #8 (`/ready` skip already active for four_strands) confirmed; C1 (drop `/ready` for all returning users) and C6 (`MATCHER_ENABLED` topic-intent matcher) still open.

> Cluster scope: create-subject / first-curriculum onboarding-to-first-session (the "Learn something new" cold-start gauntlet). · Analyst: path0 · Date 2026-06-10 · Sources verified at HEAD of `new-llm`.

All file:line citations below are **VERIFIED** (file read in this session) unless tagged **INFERRED**. The trusted map is `docs/flows/learning-path-flows.md` §"Path 0"; the proposed/diff docs are mined for ideas only and independently re-verified.

---

## 1. Feature inventory (verified)

| Feature / branch | What it does | Status | Load-bearing? (why) | Evidence |
|---|---|---|---|---|
| **`/subjects/resolve` (5-status enum)** | LLM classifies raw input → `direct_match` / `corrected` / `resolved` / `ambiguous` / `no_match`. Drives which confirmation card renders. | prod-active | **INCIDENTAL** as a *gate*; the LLM resolve itself is useful enrichment. The 5-way UI triage is taste, not integrity. | enum: `packages/schemas/src/subjects.ts:89-93` (VERIFIED). route: `apps/api/src/routes/subjects.ts:60-76` (VERIFIED). UI branches: `create-subject.tsx:642-655` (`isAmbiguous`/`isNoMatch`/`isConfident`) (VERIFIED) |
| **`direct_match` → silent create** | Skips confirmation, calls `doCreate` immediately. | prod-active | **INCIDENTAL** (already the "fast" branch — proof the confirmation cards are optional) | `create-subject.tsx:441-449` (VERIFIED) |
| **`corrected`/single `resolved` → confident card** | "We'll start with X — Start / Change". One-tap. | prod-active | INCIDENTAL (UX nicety) | `create-subject.tsx:1040-1080`; `isConfident` at `:650-655` (VERIFIED) |
| **`resolved` (n>1) / `ambiguous` → chips** | Disambiguation cards + "Something else" + "Use my words". | prod-active | **PARTIALLY load-bearing** (pedagogy): genuinely vague single-word input ("Easter", "Science") needs focus disambiguation or the API bulk-generates 8+ generic books (BUG-237). The *value* is load-bearing; the *blocking modal placement* is incidental. | `create-subject.tsx:899-1001`; focus-inference rationale `:486-518` (VERIFIED) |
| **`no_match` → "create anyway"** | "Just use '<words>'" escape hatch. | prod-active | **LOAD-BEARING** (dead-end prevention): the only escape when the LLM rejects the input; without it a learner with an exotic subject is stuck. | `create-subject.tsx:1003-1037`; `allowUseMyWords` `:656` (VERIFIED) |
| **`POST /subjects` structure types** (`focused_book` / `four_strands` / `broad` / `narrow`) | `createSubjectWithStructure` branches: focused_book → advisory-lock + book insert + prewarm dispatch; four_strands → language curriculum; broad → book suggestions; narrow → topics. | prod-active | **LOAD-BEARING** (data integrity + pedagogy): determines the curriculum scaffold a learner gets; wrong branch = wrong structure (8 generic books vs 1 focused book). | `apps/api/src/services/subject.ts:317-441` (VERIFIED): focused_book `:334-420`, four_strands `:422-437`, broad/narrow `:439+` |
| **Server-side focus inference** | When `rawInput` ≠ `name`, treats rawInput as focus → forces focused_book even with no explicit client focus. | prod-active | **LOAD-BEARING** (data integrity): prevents the broad-path 8-book explosion for inputs like "tea" under "Botany". | `subject.ts:323-334` (VERIFIED) |
| **Curriculum prewarm (Inngest)** | `app/subject.curriculum-prewarm-requested` via `safeSend`; consent-re-checked at exec, idempotent on `bookId`, concurrency 5/profile, retries 2. Generates the focused book's topics in the background. | prod-active | **LOAD-BEARING** (the whole reason first-curriculum often resolves fast): warms topics so the poll hits quickly. Consent re-check is compliance-load-bearing (WI-82). | dispatch `subject.ts:407-411`; fn `subject-prewarm-curriculum.ts:68-107` (consent gate `:105`) (VERIFIED) |
| **`POST /.../sessions/first-curriculum` server poll** | Polls up to `FIRST_CURRICULUM_SESSION_WAIT_MS=25_000ms` @ `POLL=750ms` for a topic; on focused_book-with-no-topics, calls `materializeFocusedBookTopics` inline once (5s budget); 409 `CurriculumSessionNotReadyError` if deadline passes. | prod-active | **LOAD-BEARING** (data integrity): a learning session requires a topic; this is the wait-for-curriculum gate. But the *blocking, synchronous* shape is incidental — the work could be eventually-consistent. | `session-crud.ts:850-948`; constants `:274-275` (VERIFIED) |
| **Client 409-retry machinery** | On `ConflictError /curriculum is still being prepared/`, retries 3× @ 2s (`MAX_ATTEMPTS=3`, `RETRY_MS=2_000`). | prod-active | INCIDENTAL (a UX patch over the server poll's hard 25s ceiling) | `create-subject.tsx:85-86,150-206`; error-match `:92-97` (VERIFIED) |
| **`MATCHER_ENABLED` topic-intent matcher** | When `true`, `matchTopicByIntent()` picks the topic best matching learner intent (rung flash, conf floor). **Defaults `false`** — off in all envs. | flag-gated (off) | INCIDENTAL today (dark code). When on it is a pedagogy refinement. | config default: `apps/api/src/config.ts:114` (VERIFIED); plumbed `sessions.ts:271`, `session-crud.ts:677,902-913` (VERIFIED) |
| **`/ready` gate** | First-subject-ever only: staggered-checkmark reflection screen with a CTA that replays session params. four_strands SKIPS it. | prod-active | **INCIDENTAL** (one-time first-run delight; four_strands already skips it → proof it's droppable) | `ready.tsx` (whole, VERIFIED); `isFirstSubject` snapshot `create-subject.tsx:307`; routing `:169-181`; four_strands skip `:364-381` (VERIFIED) |
| **Book-picker gate (`/pick-book/[subjectId]`)** | `broad` structure → forced book-pick before any session. | prod-active | **PARTIALLY load-bearing** (pedagogy): a genuinely broad subject ("History") needs a scope choice. But forcing it *before first teaching* is incidental — it can be a later Library affordance. | route `create-subject.tsx:354-361` (VERIFIED); screen atlas `subjects-curriculum-books.md` §5 |
| **Language-setup gate (`/onboarding/language-setup`)** | four_strands → CEFR/language config; **skips `/ready`**. | prod-active | **LOAD-BEARING** (pedagogy): four-strands language teaching needs the CEFR level + language code before a useful session. | `create-subject.tsx:364-381` (VERIFIED) |
| **`returnTo='chat'` bypass** | Entering create-subject from an unresolved chat/homework prompt: on create, replaces straight to `/(app)/session {mode:'freeform'}` — bypasses ALL structure routing, `/ready`, book-pick. | prod-active | **LOAD-BEARING** (continuity): keeps a chat-originated subject in the conversation the learner was already having. | `create-subject.tsx:328-340` (VERIFIED) |
| **Topic-probe extraction (Path-0 side-effect)** | First substantive message fires `app/topic-probe.requested` via a bare `inngest.send` with a `// core-send` **compensation** comment: on dispatch failure the catch rolls back `topicProbeFiredAt`, marks `topicProbeExtractionStatus='failed'`, captures to Sentry, and **returns normally** — the learner's exchange is unaffected. | prod-active | **LOAD-BEARING** (extraction) but **NOT** fail-the-user (the doc correctly refutes the old "breaks first exchange" claim). | `session-exchange.ts:1225-1280` (VERIFIED); rollback `:1238-1268`, no re-throw |

---

## 2. Complexity map

### 2.1 User-felt complexity (taps, decisions, waits — traced, with constants)

**Decision points the learner can hit before one word of teaching (worst realistic path, broad subject, first-ever):**
1. Type a subject (1 input).
2. Resolve confirmation: Accept/Edit (confident) **or** pick a disambiguation chip (ambiguous) — **1 forced decision** (`create-subject.tsx:1040-1131` / `899-1001`).
3. Book-picker: choose a book from LLM suggestions — **1 forced decision** (`broad` branch, `:354-361`).
4. `/ready`: tap "Start" — **1 forced tap** (`ready.tsx:170-177`).
→ **3-4 taps + 1 text entry before teaching** on the broad/first path; **1 tap + 1 text entry** on the best path (`direct_match`, existing learner, focused_book that prewarmed).

**Waits (traced from constants, not vibes):**
- Resolve: single-shot mutation, **no internal retry** (`use-resolve-subject.ts` whole, VERIFIED), guarded by a **30s client timeout** (`create-subject.tsx:259-268`). Typical LLM rung-3 latency ~2-4s; worst case = 30s then error+Retry.
- `POST /subjects`: synchronous, LLM-heavy for broad/narrow (`detectSubjectType` rung 3, `subject.ts:445`). No screen-local timeout beyond the global API client (**INFERRED** — not separately constant-bounded here).
- first-curriculum poll: **up to 25s** server-side (`WAIT_MS=25_000`, poll 750ms) **+ 5s** one-shot materialize budget for focused_book; on 409, client adds **up to 3×2s = 6s** (`create-subject.tsx:85-86`). The "Preparing your first lesson…" spinner (`busyLabel` `preparingCurriculum`, `:664-666`).
- `/ready` animation: `FIRST_ROW_DELAY=500ms + 2×ROW_STAGGER=550ms` ≈ **1.6s** of staggered checkmarks before the CTA reads as "ready" (`ready.tsx:19-20,66-79`).

**Worst-case felt latency** (broad/first-ever, prewarm misses, one 409): resolve ~4s + create ~3-8s + poll up to ~25s + 409 retry up to ~6s + /ready ~1.6s ≈ **40-90s of spinners** straddling **3-4 forced taps**. **Typical case** (focused_book, prewarm hit, existing learner): resolve ~3s + create ~2s + poll < 1s (`prewarmHit` when `topicAvailableMs < 750ms`, `session-crud.ts:914`) → session in **~5-8s, 1 confirmation tap**. The 90s figure is real but is the *tail*, not the median.

### 2.2 Hidden complexity (server branches, tables, flags, jobs)
- **4 structure branches** in one `createSubjectWithStructure` function, two of them transactional with `pg_advisory_xact_lock` (subject-name lock `subject.ts:336-354`; per-subject book lock `:358-402`) — concurrency-correctness machinery invisible to the user.
- **Server-side focus inference** silently overrides the client's structure intent (`subject.ts:323-334`).
- **Inngest fan-out:** prewarm (`subject-prewarm-curriculum`), and downstream `book-pre-generation` chains the next 1-2 books (atlas §Inngest). Consent-gated at exec.
- **`MATCHER_ENABLED`** dark flag adds a whole topic-intent-matching path that almost no one exercises.
- **Two front-door tiles + 2 library entries** all push to the same `/create-subject` (atlas §1 "Accessible from": `LearnerScreen.tsx:658,728`, `library.tsx:818,890,1169`).
- **Semantic duplication** with `POST /filing` (book-picker flow): both LLM-classify input and create/reuse subject+book+topic, sharing no code (atlas §8).

### 2.3 Load-bearing vs incidental verdict (per item)
- **Keep (load-bearing):** structure-type branching + focus inference (data integrity), the prewarm job + its consent re-check (compliance + the reason latency is usually bearable), the `no_match` escape (dead-end prevention), language-setup gate (four-strands pedagogy), `returnTo=chat` bypass (continuity), topic-probe compensation (correct already).
- **Incidental (candidate to defer/delete):** the 5-way confirmation UI *as a blocking gate*, the `/ready` screen on the create path (four_strands already skips it), the book-picker *as a pre-teaching gate*, the client 409-retry as a symptom-patch over the synchronous poll, `MATCHER_ENABLED` (dark — decide ship-or-cut).

---

## 3. Hypothesis audit (claims from proposed/diff docs on this cluster)

| Claim (proposed/diff) | Verdict | Evidence |
|---|---|---|
| "30-90s cold-start latency + 3-6 forced decisions before teaching" (proposed:15,75) | **CONFIRMED (tail), PARTIAL (typical)** | 90s is the worst-case tail (broad+miss+409); typical focused_book/prewarm-hit is ~5-8s/1 tap. Decisions are 3-4 on the worst path, 1 on the best. Constants in §2.1. |
| "four_strands already skips `/ready` — proof the gate is non-essential" (proposed:82, diff:100) | **CONFIRMED** | `create-subject.tsx:364-381` returns before `transitionToFirstSession` (which owns the `/ready` route), so four_strands never hits `/ready`. (VERIFIED) |
| "Prewarm infra already exists; resolve/structure/prewarm can run async" (proposed:81, diff:97) | **CONFIRMED** | `safeSend app/subject.curriculum-prewarm-requested` (`subject.ts:407-411`), full Inngest fn exists (VERIFIED). |
| "Freeform subject-attach exists but attaches **subjectId only, NOT topicId**; no endpoint attaches a topicId to a running session — largest net-new piece, **XL**" (diff:97) | **CONFIRMED** | `ask-silent-classify.ts` writes `metadata.silentClassification={subjectId,subjectName,confidence}` — `topicId` appears **0 times** in the file (VERIFIED grep). Read-back `session-exchange.ts:1869-1910` consumes subjectId only. Also `startSession` *requires* a non-null `subjectId` and only optionally takes `topicId` (`session-crud.ts:192-231`) — so instant-open without a subject must use the freeform path, which structurally has no topic. **The gap is real and XL.** |
| "Instant session must use the freeform path (no subjectId); `startSession` requires subjectId" (diff:96) | **CONFIRMED** | `session-crud.ts:192-202` throws "Subject not found" without a valid subjectId (VERIFIED). |
| "Drop `/ready` from create path: **S**, keep first-ever only" (diff:100) | **CONFIRMED (sizable as S)** | `/ready` is purely client routing gated by `isFirstSubject` (`create-subject.tsx:169-221,307`); removing it from the create path is a mobile-only change. The proposed nuance "keep only for the very first session ever" is already the current behavior — so "drop from create path" means dropping it entirely or moving it post-session. |
| "Topic-probe core-send breaks the user's first exchange" (old learning-path-flows claim, refuted in current doc) | **REFUTED (current doc is right)** | `session-exchange.ts:1227-1268`: try/catch rolls back the marker and does **not** re-throw; exchange continues. (VERIFIED) |
| "Subject-resolve has a 30s timeout" (proposed:75) | **CONFIRMED** | client timeout `create-subject.tsx:259-268` (VERIFIED). |
| "Book-picker gate is droppable to an optional later Library affordance: **M**" (proposed:84, diff:99) | **PARTIAL** | Droppable as a *pre-teaching gate*, yes. But a broad subject genuinely needs a scope choice eventually; deferring it requires the talk-first attach machinery (the XL piece) to scope the subject conversationally first. Standalone today it would strand broad subjects without a book. |

---

## 4. Current-doc corrections (anything `learning-path-flows.md` gets wrong — file:line proof)

The current `learning-path-flows.md` Path 0 section is **highly accurate** after its two correction passes. Findings:

1. **`/ready` step is described as "First subject ever → /ready" but omits that four_strands skips it within the create-subject screen, not within first-curriculum.** The doc's flow box (`learning-path-flows.md:164-166`) notes "EXCEPT four_strands, which skips /ready" — **this is correct**. No correction; flagging that the skip happens at `create-subject.tsx:364-381` (before `transitionToFirstSession` is ever reached), not inside the session-start API.
2. **Latency framing.** The doc lists the constants correctly (`WAIT_MS=25_000`, poll 750ms, `MAX_ATTEMPTS=3`@2s, materialize 5s) at `learning-path-flows.md:157-162`. It does **not** state that `prewarmHit` (topic ready in <750ms) makes the typical case sub-second — worth a one-line addition so readers don't over-index on the 25s ceiling. Evidence: `session-crud.ts:914`. (Enhancement, not an error.)
3. **No factual errors found** in the Path-0-specific side-effects block (`:170-176`) — topic-probe compensation, focus inference, returnTo=chat, reflection auto-note, and close-path-ineligibility all verified against source.

Net: the trusted doc is code-true for this cluster. The only gap is the missing "typical case is fast" nuance.

---

## 5. Simplification candidates

### C1 — Drop `/ready` from the create path (keep as optional post-session moment)
- **User gains:** one fewer forced tap + ~1.6s of animation on the first-ever subject; lands on teaching faster.
- **Deleted/kept:** delete the `isFirstSubject → /ready` routing in `transitionToFirstSession` and `doCreate`; keep `ready.tsx` (could re-home as a post-first-session celebration). four_strands already skips it.
- **Size:** **S** (mobile-only routing change; `create-subject.tsx:169-221,307`).
- **Classification:** **SHIP-NOW.** Does not need the new shell; does not regress V0/V1.
- **Risk:** Low — loses a one-time delight screen. Mitigate by moving the reflection to session end.
- **Verdict:** **REAL WIN** (small but free).

### C2 — Make the resolve confirmation non-blocking for confident matches
- **User gains:** `corrected` and single-`resolved` already auto-route via `direct_match` only when status is exactly `direct_match`; promoting `corrected`/confident-`resolved` to silent-create (with an undo affordance) removes the Accept/Edit tap for the common case.
- **Deleted/kept:** keep the ambiguous/no_match cards (load-bearing); collapse the `isConfident` card into a silent create + a "not <X>? change it" inline correction.
- **Size:** **S-M** (mobile; `create-subject.tsx:529-549,1040-1080`).
- **Classification:** **SHIP-NOW** (no shell dependency).
- **Risk:** Medium — silently creating the wrong subject is worse than a confirm tap; needs a visible, one-tap undo. Keep the heavier card for `resolved` with multiple candidates.
- **Verdict:** **CONDITIONAL** (win only if the undo is real and cheap).

### C3 — Defer the book-picker gate; broad subjects start teaching, pick a book later
- **User gains:** broad subjects ("History") stop forcing a "shop for a textbook" decision before any teaching.
- **Deleted/kept:** keep `/pick-book` as a Library affordance; remove the forced `broad → router.replace('/pick-book')` on the create path (`create-subject.tsx:354-361`).
- **Size:** **M-L.** Standalone it strands broad subjects (no book → no topic → first-curriculum 409s forever). To do it *right* requires conversationally scoping the broad subject into a focused book — i.e. the talk-first topic-attach machinery (C5).
- **Classification:** **SPEC-ABSORBED (§3.1 talk-first cold start + §5 Subject hub / S1-S2).** The spec rules onboarding-through-conversation; the book choice becomes a mentor turn, not a modal.
- **Risk:** High if shipped without the attach machinery.
- **Verdict:** **CONDITIONAL → MIRAGE standalone; REAL WIN inside the spec.**

### C4 — Collapse the client 409-retry by making first-curriculum eventually-consistent
- **User gains:** removes the "Preparing your first lesson…" stall + the 25s+6s ceiling.
- **Deleted/kept:** keep the server-side topic materialization; move it off the synchronous open path so the session opens immediately and the topic attaches when ready.
- **Size:** **L** (requires the topic-attach-to-live-session endpoint — the XL piece below — plus a UI that tolerates a topicless-then-topicful session).
- **Classification:** **SPEC-ABSORBED (§3.1 / §8.1 `GET /now` + S1).** This is the talk-first reorder.
- **Risk:** Medium-High (depends on C5).
- **Verdict:** **CONDITIONAL** (gated on C5).

### C5 — Talk-first "Learn something new": open a freeform session instantly, attach subject AND topic in the background
- **User gains:** lands on a teaching turn in ~2s instead of 40-90s; zero forced taxonomy decisions; the resolve/structure/prewarm apparatus becomes eventually-consistent enrichment.
- **Deleted/kept:** keep the entire server apparatus (resolve, structure, prewarm — all already async-capable); **net-new** = an endpoint/path that attaches a `topicId` to an already-running session. Today `ask-silent-classify` attaches `subjectId` only (VERIFIED: topicId 0 occurrences) and `startSession` can't start without a subject.
- **Size:** **XL** (the topic-attach-to-live-session path does not exist; `startSession` and the freeform pedagogy branch both assume topicId is fixed at start or absent).
- **Classification:** **SPEC-ABSORBED (§3.1 — RULED: "the first subject is created through the first conversation, not a setup form"; §11 S1).** **Scope note:** §3.1 rules talk-first for **day-one cold start** specifically. Whether the ruling extends to **every later "learn something new" entry** (an established learner adding subject #5) is **an open gap** — the spec's cold-start card self-destructs on first real state (§3.1), so later entries are not explicitly covered. Recommend the per-phase S1 plan rule this.
- **Risk:** Medium-High — the topic-attach must not break the LLM envelope contract, profileId scoping (`startSession` ownership guards `session-crud.ts:198-231` must be preserved on attach), or the topic-probe compensation.
- **Verdict:** **REAL WIN, but spec-absorbed and XL** — the single highest-value move, not ship-now.

### C6 — Decide `MATCHER_ENABLED`: ship or delete
- **User gains:** none directly; removes dark-flag cognitive load and a dead branch.
- **Size:** **S** (config + plumbing in `sessions.ts:271`, `session-crud.ts:677,902-913`).
- **Classification:** **SHIP-NOW** (housekeeping).
- **Risk:** Low.
- **Verdict:** **REAL WIN** (small) — but it's a product decision (is intent-matching wanted?), not purely mechanical.

---

## 6. Bottom line

**Simplification potential score: 4 / 5.** Path 0 is a genuine gauntlet on its worst path (3-4 forced taps, 40-90s of spinners), and the redesign that fixes it is *already ruled* (spec §3.1 talk-first). But the headline fix (C5) is XL and identity-/shell-adjacent, and the typical case is already fast (~5-8s, prewarm-hit), so the urgency is lower than the worst-case framing suggests — hence 4, not 5.

**Single highest-value move:** **C5 — talk-first "Learn something new"** (open freeform instantly, attach subject + topic in the background). It collapses the entire decision/latency gauntlet into a conversation and is the spec's ruled direction. The crux and the only true net-new piece is the **topic-attach-to-live-session endpoint** — verified absent today (`ask-silent-classify.ts` attaches subjectId only; `startSession` requires a subject up front). Ship the cheap wins now (**C1 drop `/ready` from create path; C6 resolve the MATCHER flag**) while the XL piece is specced into S1.

**The one thing that must NOT be simplified away:** the **structure-type branching + server-side focus inference** (`subject.ts:317-441`). They are data-integrity load-bearing — collapsing or skipping them resurrects the 8-generic-books explosion (BUG-237) and breaks the focused-book pedagogy scaffold. Equally non-negotiable in any reorder: the prewarm job's **consent re-check** (`subject-prewarm-curriculum.ts:105`, WI-82), the `startSession` **profileId/topic ownership guards** (`session-crud.ts:198-231`), and the topic-probe **compensation/rollback** posture — none of these may be dropped to make the flow "feel" simpler, and the V0 5-tab guardian shell (spec §7) is not touched by any candidate here.
