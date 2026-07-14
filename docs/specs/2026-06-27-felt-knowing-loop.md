# Felt-Knowing Loop — Writable Notes, Freeform Binding & Evidence Citation

> **STATUS UPDATE (2026-07-14): PARTIALLY SHIPPED.** Writable subject/topic notes and freeform “keep this” are live. The evidence-citation substrate, prompt injection, and rendered citations remain unbuilt; the older paper-only and sibling-status text below is historical.

**Status:** Draft / paper-only · 2026-06-27 · **Branch:** `main` (baseline for all citations)
**Parent vision:** [The Forever Notebook](./2026-06-08-forever-notebook-north-star.md) — "the mentor remembers, and what you keep is the proof."
**Sibling specs (this spec sequences on them; it does NOT re-own their segments):**
- [Memory Task — Review Continuity, Retrieval Log & Unified Relearn Queue](../_archive/specs/Done/2026-06-08-memory-task-review-continuity.md) — historical owner of the review opener, `retrieval_events`, **`evidence_links` + `LearnerSource` (slice 2a, R6)**, the `taskType` catalog (slice 2b, R7), and the relearn queue.
- [Journal Redesign — 5-Button Landing, Reuse-First](../_archive/specs/2026-07-14-stale-spec-cleanup/2026-06-27-journal-redesign.md) — shipped historical design for the V2 Journal-tab **read/browse** surface.

**Historical orientation:** [`00-STATE-OF-PLAY.md`](../_archive/plans/2026-07-14-superseded/v2-plan/00-STATE-OF-PLAY.md) §5–§6.

---

## Context

The product's core bet is that the mentor *feels like it knows you*: a freeform conversation becomes something you keep, what you keep is durable, and the mentor references it back to you later. That loop has four segments. Three are owned by the sibling specs above; the **connective glue between them is unowned and unbuilt**, so the loop does not close today. Every fact below was read from code on `main`, 2026-06-27.

**Gap 1 — you cannot author or keep a note where notes are supposed to live.** The V2 Subject Hub's notes section is **read-only in production**. `SubjectHubNotesSection.tsx` is architecturally write-ready — it declares `onAddNote?: (content: string) => void` (`SubjectHubNotesSection.tsx:26`), derives `canAddNote = canStudy && !!onAddNote` (`:65`), and renders the text input + mic + add button **only when a handler is present** (`:89-129`, `:137-152`), with `submitDraft()` guarded on the handler (`:68-74`, return-on-null `:69`). But the screen that mounts it **deliberately omits the handler** — `SubjectHub.tsx:114-116` passes only `notes` + `canStudy`, never `onAddNote` (PR #1316 deferred the wiring; comment `SubjectHubNotesSection.tsx:30-35`). The API is already complete: `createNote` (`services/notes.ts:512-544`), `updateNote` (`:546-567`), `deleteNoteById` (`:569-580`), all IDOR-guarded through `verifyTopicOwnership` (`:270-304`); the same `useCreateNote` hook is already wired for session-embedded notes (`session/index.tsx`, `onAddNote={() => setShowNoteInput(true)}`). So authoring is **wiring, not building** — but until it exists, the hub is a display case, and `evidence_links` (slice 2a) has nothing learner-authored to cite on the surface where the spec says notes live.

**Gap 2 — a freeform conversation produces nothing the learner can keep mid-chat.** Freeform sessions start with `subjectId` required and `topicId = null` (`session-crud.ts:230`, `:277`). Silent classification (`ask-silent-classify.ts`) writes `{subjectId, subjectName, confidence}` to `learning_sessions.metadata` (`:190-194`, `:196-214`) and emits `app/ask.classification_completed` (`:216-225`) — **telemetry only; it binds no durable artifact**. The only durable freeform binding is the close-path auto-file, gated at **≥5 exchanges + no topicId + not filed** (`session-filing-dispatch.ts:21-48`, `:27`) — it fires *after the session ends*. Mid-conversation, the learner is offered an LLM-emitted "Write note" CTA that **cannot succeed**: notes are topic-mandatory at three layers (`topic_notes.topicId` NOT NULL `notes.ts:14-16`; client hook `use-notes.ts`; the user-facing "cannot save" alert), so freeform's "Write note" is the lying button the deep-dive flagged (`docs/reviews/2026-06-10-learning-flow-simplification-deepdive/02-path1-freeform.md` C1). **Result: the lightest, most natural "keep this" moment in the product is a dead end.**

**Gap 3 — the mentor never visibly cites your own kept content in ordinary conversation.** Memory injection exists — `memory_facts` as `learnerMemoryContext` and `findSimilarTopics()` as `embeddingMemoryContext`, both injected every exchange (per review-continuity spec Context). The review *opener* is being built to name a specific prior (`buildReviewContinuityOpener`, worktree `review-continuity-opener`). But there is **no mechanism, in a normal (non-review) exchange, for the mentor to reference the learner's own note or bookmark** ("from the note you kept on photosynthesis…"). `evidence_links` + `LearnerSource` (slice 2a) is the *data substrate* for exactly this — but it is decided-not-built, and even once built, nothing *surfaces* the citation in live conversation. The felt payoff of the whole loop lives here, and it is the thinnest part.

**The throughline.** Gaps 1→2→3 are one loop: keep a thing (1) — from any context including freeform (2) — and have the mentor bring it back (3). Build any one without the others and none of them feels alive: authoring with no citation is a filing cabinet; citation with nothing kept is a parlor trick; freeform binding with no surfacing is invisible plumbing.

---

## Scope

### This spec owns (the unowned glue)

1. **Writable subject-hub notes** (Gap 1) — wire `onAddNote` → `useCreateNote` (+ edit/delete) on `SubjectHub`, promoting the read-only display case to a learner-authored, topic-scoped note surface. Pure wiring over existing component + API.
2. **Freeform "keep this" as a citable bookmark** (Gap 2) — route the freeform keep-affordance to **bookmark the AI reply** (bookmarks are `topicId`-nullable, only `subjectId`-required — `bookmarks.ts:25-30`) instead of the impossible topic-note, so a freeform turn yields a durable, citable artifact **without any schema change**. Complements the deep-dive's CTA-gating fix (which *removes* the lying note button; this *replaces* it with the affordance that works).
3. **Evidence citation surfacing** (Gap 3) — the read-side payoff: inject the learner's own *kept* content (notes + bookmarks via `LearnerSource`) into ordinary exchanges, and when the mentor references one, record an `evidence_links` row and render the citation to the learner. Reuses slice 2a's data substrate and review-continuity's accuracy/consent invariants.

### This spec sequences (does not re-decide)

- **`evidence_links` + `LearnerSource`** — defined by review-continuity slice 2a (`2026-06-08-memory-task-review-continuity.md:186-191`). This spec **executes** that slice as its Flow 3 data layer and **promotes it from "decided" to "build"**; it does not redesign the table or the union.
- **The merged notes+bookmarks browse surface** — owned by journal-redesign (`JournalNotesArchive`, filter chips). This spec ensures freeform bookmarks (Flow 2) *land* in that surface; it does not respec the surface.
- **The review opener** — owned by review-continuity Tier 1. Flow 3 is the *non-review*, in-conversation analogue; it reuses the opener's verbatim-or-gesture and consent rules, it does not modify the opener.

### Out of scope (deferred / owned elsewhere)

- **A "loose notes" bucket** (topicless `topic_notes`). Refuted L/XL in the deep-dive (`10-notes-supporter.md` C3; `02-path1-freeform.md` C3): `topic_notes.topicId` NOT NULL + FK-cascade + the `verifyTopicOwnership` chain. Gap 2 is solved with **bookmarks** (already topicless-capable), not by forking the note schema.
- **`taskType` catalog** (slice 2b) — review-continuity owns it; not needed for this loop.
- **Concept-grain anything** — parked behind the identity-foundation flip.
- **Auto-file mechanics / the ≥5-exchange threshold / MMT-ADR-0021** — unchanged. Flow 2 adds a *mid-session* keep affordance; it does not touch the close-path auto-file.
- **`validateNoteDraft` wiring** — out of this loop's path (it guards *Challenge-Round-drafted* notes, not learner-authored ones). Tracked separately; see Open Items.

---

## Requirements → traceability

| # | Requirement | Gap | Owner |
|---|---|---|---|
| F1 | `SubjectHub` passes `onAddNote` (→ `useCreateNote`) so the hub notes section renders writable; new notes persist topic-scoped via `createNote` | 1 | this spec |
| F2 | Hub notes are editable and deletable (`updateNote` / `deleteNoteById`), with the parent-proxy delete-hide gate honored (`gates.showLearningActions`) | 1 | this spec |
| F3 | In a freeform session (`topicId == null`, `subjectId` classified), the "keep this" affordance bookmarks the referenced AI reply via `createBookmark`; the impossible topic-note path is never offered | 2 | this spec (CTA-removal half: deep-dive C1) |
| F4 | A freeform bookmark created via F3 appears in the journal merged list with visible authorship ("saved from chat") | 2 | journal-redesign (surface) + this spec (ensure it lands) |
| F5 | In a non-review exchange, the mentor may reference the learner's own kept note/bookmark, sourced from `LearnerSource`, consent-gated, verbatim-or-gesture | 3 | this spec (uses slice 2a substrate) |
| F6 | When the mentor cites a kept item, an `evidence_links` row is written (`fromKind='exchange'`, `toKind∈{note,bookmark}`) and the citation is rendered to the learner | 3 | this spec (uses slice 2a table) |
| F7 | `evidence_links` + `LearnerSource` (slice 2a) is built as the F5/F6 substrate | 3 | review-continuity slice 2a, executed here |

---

## Data Model

**No new tables in this spec.** It composes existing stores plus the slice-2a substrate it executes.

- **F1/F2 (writable notes)** — `topic_notes` unchanged; uses `createNote` / `updateNote` / `deleteNoteById` (`services/notes.ts:512-580`). Cap `MAX_NOTES_PER_TOPIC = 50` (`:16`) applies unchanged.
- **F3/F4 (freeform keep)** — `bookmarks` unchanged. The enabling fact is existing: `bookmarks.subjectId` NOT NULL but `bookmarks.topicId` **nullable** (`schema/bookmarks.ts:25-30`), unique `(profileId, eventId)` (`:39-42`), `sessionId` raw/no-FK so it survives session TTL (`:22-24`). A freeform AI reply is bookmarkable the moment silent-classify has resolved a `subjectId`.
- **F5/F6/F7 (citation)** — the slice-2a `evidence_links` table **exactly as review-continuity defines it**: `{ id, profileId, fromKind, fromId, toKind, toId, createdAt }` (`2026-06-08-memory-task-review-continuity.md:191`), plus the read-time `LearnerSource` view-model union `kind ∈ {note, bookmark, transcript_excerpt, homework_ocr}` assembled in `services/learner-source.ts` (ibid). This spec adds **one enum value** to `fromKind`: `'exchange'` (a live mentor turn is the citing side). `toKind` uses the existing `{note, bookmark}` members. That is the only schema delta, and it lands inside the slice-2a migration (so there is still **one** additive migration for `evidence_links`, owned by slice 2a, with this value included).

> **Retention.** `evidence_links` holds only ids + kinds + a timestamp — no free-text PII — so it is outside the EU-3 redaction concern that governs `retrieval_events`. A link whose target is later purged dangles harmlessly (raw-id, no-FK — mirrors `bookmarks.eventId`); the renderer degrades to "source no longer available" (see Failure Modes).

---

## Flow 1 — Writable subject-hub notes (F1/F2)

**Change site.** `SubjectHub.tsx:114-116`. Pass `onAddNote` (and the edit/delete handlers) into `<SubjectHubNotesSection>`. The component already renders the authoring UI when the handler is present (`:65`, `:89-129`); no component change is required for create.

**Create.** `onAddNote={(content) => createNote.mutate({ subjectId, topicId, content })}` using the existing `useCreateNote` hook (the same one wired in `session/index.tsx`). The hub note is topic-scoped — it requires a `topicId`, which the hub has in context (the selected topic). **Decision:** notes authored from the hub bind to the **currently-focused topic** in the hub; if the hub view is at subject level with no focused topic, the add-note input is not shown (`canAddNote` already gates on context — keep authoring topic-scoped, never topicless, consistent with the no-loose-notes ruling).

**Edit / delete.** Add row-level edit (`updateNote`, `services/notes.ts:546-567`) and delete (`deleteNoteById`, `:569-580`). **Delete must honor the parent-proxy gate**: reuse `canDelete = navigationContract.gates.showLearningActions` exactly as `progress/saved.tsx:98` does for bookmarks — a parent-proxy session must not delete a child's notes. This is a hard requirement, not a nicety (it is the only thing preventing proxy IDOR-by-UI on notes).

**Authorship is always visible.** A hub note is `my note` authorship; a saved-from-mentor item is a bookmark. The merged browse surface (journal-redesign) already distinguishes authorship — Flow 1 only adds the authoring entry point, it does not blur the two stores.

---

## Flow 2 — Freeform "keep this" as a citable bookmark (F3/F4)

**The substitution.** Today freeform surfaces an LLM-emitted "Write note" CTA that cannot succeed (topic-mandatory note schema). The deep-dive's C1 fix *removes* that CTA in topicless sessions. This flow *replaces* it with the affordance that already works in freeform: **bookmark the referenced AI reply**.

**Precondition (already satisfied by existing flow).** A bookmark needs `subjectId` + the AI `eventId`. Silent-classify resolves `subjectId` after the first AI turn (`ask-silent-classify.ts`; `use-subject-classification.ts:580`), and the AI reply carries an `eventId`. So from the second turn onward a freeform reply is bookmarkable. **Decision:** the keep affordance in a topicless session is **enabled once `subjectId` is resolved** (mirror the existing classify-gating), disabled before that with a quiet "one sec…" rather than an error — never the old "cannot save, try again" lie.

**Write.** `createBookmark({ eventId, subjectId, topicId: null, content })` (`services/bookmarks.ts:43-117`). `topicId` stays null — legitimate for bookmarks. The unique `(profileId, eventId)` constraint makes re-tapping idempotent.

**Surfacing (F4).** The freeform bookmark flows into the journal merged list (journal-redesign's `JournalNotesArchive`, which already merges bookmarks) tagged as saved-from-chat authorship. This spec's only obligation is that the write happens and carries the fields the browse surface reads; the surface itself is journal-redesign's.

**Why bookmark, not note.** Bookmarks are provenance-stamped (`eventId`, raw `sessionId` surviving TTL) and topicless-legal; that is exactly the shape of "I want to keep what the mentor just said in a freeform chat." Forcing it into `topic_notes` would require the refuted loose-notes fork. The learner perceives "I kept this"; the store is the right one underneath.

---

## Flow 3 — Evidence citation surfacing (F5/F6/F7)

This is the felt payoff and the thinnest part — built last, on top of Flows 1–2 (which produce the kept artifacts) and slice 2a (the substrate). Behind a flag `EVIDENCE_CITATION_ENABLED` (config object per eslint G4; default off until eval-validated), mirroring the review-continuity opener's flag discipline.

**Substrate (F7 — execute slice 2a).** Build `services/learner-source.ts` (the `LearnerSource` union) and the `evidence_links` table as review-continuity slice 2a specifies, with the added `fromKind='exchange'` value (see Data Model). `LearnerSource` reads `topic_notes` + `bookmarks` (the two stores Flows 1–2 populate) scoped by `profileId` through the sanctioned parent chain.

**Injection (F5).** At exchange-prompt assembly (the same layer that injects `learnerMemoryContext` / `embeddingMemoryContext`), add a `learnerKeptContext` block: the most-relevant 1–2 `LearnerSource` items for the active subject/topic (notes first — they are the learner's own words — then bookmarks). The block instructs the mentor that it *may*, when genuinely relevant, reference one of these kept items by name, and **how**:

- **Verbatim-or-gesture (reuse EU-1).** A first-person "the note you wrote says X" may only quote the kept item's **verbatim** text; the mentor may *gesture* ("you kept something on photosynthesis — want to build on it?") but must never put paraphrased words in the learner's mouth. A confidently-wrong "you said X" erodes trust faster than no citation (review-continuity invariant 6 / EU-1).
- **Never fabricate.** If no relevant kept item exists, the block is absent and the mentor cites nothing — it does not invent a note.

**Consent (reuse EU-2).** `learnerKeptContext` is the same class of personal-memory recall as `learnerMemoryContext` and **rides the identical consent gate**. A learner/guardian who declined memory features is never greeted with "the note you kept…". Consent-declined test arm required.

**Recording + render (F6).** When the mentor's turn references a kept item (detected via the structured response envelope — the citation is an explicit signal, not free-text marker-scraping, per the envelope rule), write one `evidence_links` row (`fromKind='exchange'`, `fromId=<exchange/event id>`, `toKind∈{note,bookmark}`, `toId=<source id>`) via `safeWrite` (non-core; a citation-log failure never breaks the turn). The learner-facing render shows a small "from your note/bookmark" chip on the mentor message, tappable to the source in the journal. **Decision:** the citation signal is carried in the envelope (extend the envelope schema with an optional `citations: Array<{ toKind, toId }>`), parsed via `parseEnvelope()` — never inferred from prose.

**Honest degradation.** Flag off → no `learnerKeptContext`, no citation chips, unchanged exchange. Substrate present but no kept items → block absent, mentor cites nothing. Cited source later purged → chip resolves to "source no longer available" (dangling link is harmless).

**Eval-gated.** This is an LLM-prompt change: `pnpm eval:llm` (Tier 1 snapshot) before commit; `pnpm eval:llm --live` (Tier 2) to confirm the envelope still validates and that with kept items present the mentor cites accurately, with none present it cites nothing (no fabrication). A/B via the flag.

---

## Read side

- **Subject Hub** renders writable, editable, deletable notes (Flow 1); delete gated by `gates.showLearningActions`.
- **Freeform session** offers a working "keep this" (bookmark) affordance once subject-classified (Flow 2); never the lying note CTA.
- **Journal merged list** (journal-redesign) shows hub notes + freeform bookmarks with visible authorship — no change owned here beyond ensuring Flow-2 writes land.
- **Mentor messages** may carry a "from your note/bookmark" citation chip (Flow 3), tappable to source.
- No new top-level screen; no change to SM-2 surfaces or the relearn queue.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Hub note add with no focused topic | Subject-level hub view, no topic context | No add-note input (gated) | `canAddNote` already context-gates; authoring stays topic-scoped (no loose notes) |
| Hub note delete in parent-proxy | Proxy session taps delete | No delete affordance | `canDelete = gates.showLearningActions` hides it (F2 hard requirement) |
| Freeform keep before classify | Learner taps keep before `subjectId` resolves | Quiet "one sec…" disabled state | Affordance enables on classify; **never** the old "cannot save, try again" lie |
| Freeform keep, classify failed/0-candidate | Subject never resolves | Keep affordance stays disabled; create-subject escape still available | No bookmark without a subject (structural); not a regression — matches today's bookmark constraint |
| Duplicate keep | Re-tap same reply | One bookmark | Unique `(profileId, eventId)` idempotent |
| Citation flag off | `EVIDENCE_CITATION_ENABLED=false` | Unchanged exchange, no chips | A/B control arm; no regression |
| No kept items to cite | Learner has no relevant note/bookmark | Mentor cites nothing | `learnerKeptContext` block absent; no fabrication |
| Citation under declined consent | Memory features declined | No "from your note…" ever | Rides `learnerMemoryContext` consent gate; consent-declined test arm |
| Mentor misattributes a kept item | Paraphrase distorts the learner's words | A wrong "your note says X" | Verbatim-or-gesture enforced in prompt + assembler (EU-1); treat as fatal, not cosmetic |
| Cited source purged | `evidence_links` target later purged | Chip → "source no longer available" | Raw-id, no-FK design; link dangles harmlessly |
| Citation-log write fails | DB error on `evidence_links` insert | Nothing — turn completes normally | `safeWrite` guard logs to Sentry; non-core |

---

## Migration & Rollback

- **Flows 1 & 2:** **no migration.** Pure mobile wiring (Flow 1) + a CTA substitution + existing `createBookmark` (Flow 2). Rollback = revert code.
- **Flow 3:** the **one** additive migration is slice 2a's `evidence_links` table (owned by review-continuity slice 2a), with the `fromKind='exchange'` value included. Purely additive — no drops, no changes to shipped tables. Committed SQL + `drizzle-kit migrate` (dev may `db:push:dev`); apply before shipping code that reads/writes the table (Schema-And-Deploy-Safety). The envelope-schema extension (`citations[]`) is additive and optional.
- **Rollback (Flow 3):** drop `evidence_links`; the injection/render is flag-gated code (revert by deploy + flag-off). Pre-launch data is test-only — no production loss.

---

## Test Plan

- **F1 (create, integration, real DB — no internal mocks, GC1/GC6):** authoring from the hub writes a `topic_notes` row scoped to the focused topic + profile; the cap (50/topic) is honored; a second profile cannot create against another's topic (scoped-write break test via `verifyTopicOwnership`).
- **F2 (edit/delete + proxy gate, break test):** edit updates only the owner's row (`updateNote` where `(noteId, profileId)`); delete removes only the owner's row; **a parent-proxy session renders no delete affordance** (`gates.showLearningActions === false`) — red-green: assert the control is absent under proxy, present under owner.
- **F3 (freeform keep):** in a topicless, subject-classified session, the keep affordance creates a `bookmark` with `topicId=null`, correct `subjectId`/`eventId`; before classify the affordance is disabled (no error alert); re-tap is idempotent (unique constraint).
- **F4 (lands in browse):** a Flow-3 freeform bookmark appears in the journal merged list query with saved-from-chat authorship (assert against the `JournalNotesArchive` data source).
- **F5/F6 (citation, eval-gated):** `pnpm eval:llm` snapshot for the `learnerKeptContext` block; `pnpm eval:llm --live` confirms a valid envelope and that **with** a relevant kept item the mentor cites it (verbatim-or-gesture), **without** one it cites nothing (no fabrication); a citation writes exactly one `evidence_links` row via the envelope `citations[]` (never prose-scraped); consent-declined → no citation block (test arm).
- **F7 (substrate):** `LearnerSource` assembles notes + bookmarks scoped by `profileId`; a second profile never reads another's sources (scoped-read break test); a dangling link (purged target) renders "source no longer available".
- **Integration suite:** `pnpm exec nx test:integration api` before any commit touching `apps/api/`.

---

## Relationship to sibling specs (avoid collision)

| Concern | Owner | This spec |
|---|---|---|
| `evidence_links` table + `LearnerSource` union | review-continuity slice 2a (design) | **Executes** it (Flow 3 / F7); adds only `fromKind='exchange'` inside the same migration |
| `retrieval_events`, relearn queue, review opener | review-continuity Tier 1 (in-flight) | Untouched; Flow 3 is the **non-review** citation analogue, reusing the opener's EU-1/EU-2 invariants only |
| Merged notes+bookmarks **browse** surface, filter chips | journal-redesign | Untouched; Flow 2 only ensures freeform bookmarks **land** there |
| `taskType` catalog (slice 2b) | review-continuity | Not used |
| Note **authoring** in the hub | — (unowned) | **This spec, Flow 1** |
| Freeform **keep affordance** producing a citable artifact | — (unowned; deep-dive C1 only removes the broken CTA) | **This spec, Flow 2** |
| Mentor **citing kept content** in live conversation | — (unowned) | **This spec, Flow 3** |

---

## Open Items

- **No ADR required.** Every decision here is additive and reversible and sits below the [MMT-ADR-0000](../adr/MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md) significance gate — no schema drops, no contested architecture (the one schema delta, `fromKind='exchange'`, rides slice 2a's already-additive migration). If review judges the citation substrate contested enough to record, raise an `MMT-ADR` in lockstep with the `architecture.md` "Knowledge Retention" line; the default is no new ADR.
- **Envelope `citations[]` shape.** Confirm the exact addition to `llmResponseEnvelopeSchema` (`@eduagent/schemas`) and that `parseEnvelope()` handles it; the citation signal must be structured, never a `[MARKER]` (envelope rule). Decide during Flow 3 implementation.
- **Relevance selection for `learnerKeptContext`.** How the 1–2 kept items are chosen (recency vs. embedding-similarity to the active turn). Default: reuse the existing `findSimilarTopics()` relevance path that already feeds `embeddingMemoryContext`, filtered to learner-kept sources. Confirm when Flow 3 is scheduled.
- **`fromKind='exchange'` id semantics.** Whether `fromId` is the `session_events` row id of the mentor turn or the exchange id; pick the one that survives the citation-render lookup. Decide with the slice-2a author so the enum value lands cleanly in their migration.
- **`validateNoteDraft` (tracked, not in this loop).** Still unwired (`services/notes.ts:237-244`) — guards Challenge-Round-*drafted* notes, not the learner-*authored* notes Flow 1 adds, so it is out of this path. Flagged here only so the writable-notes work is not misread as having closed it; it rides the Challenge un-park (see `10-notes-supporter.md` C2).

---

## Sequencing

FEEL → CORRECT → LOAD-BEARING, and substrate-before-payoff:

1. **Flow 1 (writable hub notes)** — cheapest, highest standalone value, produces the learner-authored artifacts Flow 3 cites. Ship first.
2. **Flow 2 (freeform keep → bookmark)** — pairs with the deep-dive C1 CTA-removal; produces the freeform artifacts Flow 3 cites. Ship alongside or just after Flow 1.
3. **Slice 2a substrate (F7)** — `evidence_links` + `LearnerSource`. Coordinate the migration with the review-continuity author (one migration, `fromKind='exchange'` included).
4. **Flow 3 (citation surfacing)** — last, behind `EVIDENCE_CITATION_ENABLED`, eval-gated, A/B. The felt payoff, built only once 1–2 have given it something true to cite.

Nothing here flips a production flag. Flows 1–2 are flagless wiring; Flow 3 ships dark until eval-validated.
