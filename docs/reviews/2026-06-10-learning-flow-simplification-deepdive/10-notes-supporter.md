# Notes + Bookmarks + Supporter Surfaces: Deep-Dive

> **STATUS (2026-06-27):** Partial — C2 (bookmarks `topicId` nullable wiring) done; C1 (saved-stuff surface collapse) pending; C4 (supporter digest) blocked on V2 shell S3/S4.

> Cluster scope: Notes (4 creation routes) · Bookmarks · the "saved stuff" surfaces · supporter/parent surfaces (ParentHomeScreen, Recaps tab, `child/*` stack, clone-from-child) · Analyst: notes-supporter · Date 2026-06-10 · Sources verified at HEAD of `new-llm`

All claims tagged **VERIFIED** (read the file:line) or **INFERRED** (reasoned from verified facts). file:line on every load-bearing claim.

---

## 1. Feature inventory (verified)

### Half A — Notes / Bookmarks / saved surfaces

| Feature / screen | What it does | Status | Load-bearing? (why) | Evidence |
|---|---|---|---|---|
| **Note creation — manual** | "Add note" chip → `NoteInput` → `POST /subjects/:s/topics/:t/notes` | prod-active | Yes — learner-authored capture | `services/notes.ts:511` `createNote` (IDOR `verifyTopicOwnership` :270) |
| **Note creation — LLM `note_prompt`** | `ui_hints.note_prompt.show`/`.post_session` renders "Write note" | prod-active | Yes — mentor-prompted capture | `learning-path-flows.md:543` |
| **Note creation — reflection auto-note** | "Your Words" copied verbatim into topic note when `topicId` set | prod-active | Yes — only durable artifact of a reflection | `services/notes.ts:230` `createNoteForSession` (dedupes session+topic+content :169-189) |
| **Note creation — Challenge drafted note** | LLM-authored from solid answers, overlap-guarded → `DraftedNoteReview` | flag-gated (`CHALLENGE_ROUND_RUNTIME_ENABLED=false`) | Partial — guard **UNWIRED** (see §4) | `services/notes.ts:237-244` |
| `topic_notes` table | per-topic notes; `topicId` **NOT NULL**, `sessionId` nullable, **cap 50/topic**, NO unique constraint (multi-note since 0048) | prod-active | Yes — the note store | `schema/notes.ts:14-22`; cap `services/notes.ts:16,150-205` |
| **Bookmarks** | save a mentor `ai_response` mid-session; `subjectId` NOT NULL, `topicId` **nullable**, **uncapped**, unique `(profileId,eventId)` | prod-active | Yes — only "save this reply" path | `schema/bookmarks.ts:25-42`; `services/bookmarks.ts:51` |
| `BookmarkNudgeTooltip` | one-time per-profile tooltip after a few AI responses | prod-active | No — onboarding nudge only | `learning-path-flows.md:568` |
| **Saved surface 1 — `progress/saved.tsx`** | bookmarks-only list, delete-capable, proxy-hides delete | prod-active | Yes — the *editable* bookmark surface | `progress/saved.tsx:90`; delete-gate `:98` `canDelete = gates.showLearningActions` |
| **Saved surface 2 — `my-notes/[kind].tsx`** | unified read-only archive: Sessions / Notes / Bookmarks in one `ArchiveItem` shape | prod-active | Yes — already a half-merge (see §3) | `my-notes/[kind].tsx:33-45,349-369` |
| **Saved surface 3 — topic detail in-screen** | per-topic notes + bookmarks rendered inside `topic/[topicId].tsx` | prod-active | Yes — topic-scoped read | `topic/[topicId].tsx:41,330,414-422,907` |
| `my-notes/index.tsx` (hub) | 3 rows Sessions/Notes/Bookmarks; count pill **only** for Sessions | prod-active | No — a router; mislabels its own contents | `my-notes/index.tsx:70` (counts only `sessions`) |

> **"Three saved surfaces" claim — CONFIRMED, and there are actually FOUR render sites.** `progress/saved.tsx` (bookmarks, editable), `my-notes/[kind].tsx` (notes+bookmarks+sessions, read-only), `topic/[topicId].tsx` (per-topic notes+bookmarks inline), plus the read-only `my-notes/index.tsx` hub that routes to them. The diff-doc "three" undercounts by one (topic-detail inline).

### Half B — Supporter / parent surfaces

| Feature / screen | What it does | Status | Load-bearing? | Evidence |
|---|---|---|---|---|
| **ParentHomeScreen** | mentoring hub: per-child `ChildCommandCard` (Learn-together / Reports / Nudge), household pulse, cap banners, withdrawal countdown, add-child | prod-active (V1 family shape / V0-off guardian) | Yes — the guardian home; **dies in spec §7** | `components/home/ParentHomeScreen.tsx:684`; card `:335`, action row `:530-552` |
| **Recaps tab** (`recaps/index`, `[recapId]`) | parent list of child sessions; detail = narrative + "try asking" + AddToMyLearning + open-child-session | prod-active (V1 guardian only) | Yes — the recap surface | `recaps/index.tsx:15`; detail `[recapId].tsx:24` |
| **`child/[profileId]/index`** | overview; 3 modes via `?mode=` (default/progress/settings); settings holds consent + memory + accommodation | prod-active | Yes — but `?mode=` is "one file, three personalities" | `child/[profileId]/index.tsx:743,756-757`; consent `:558,585-612` |
| `child/.../curriculum` | browse child subjects → subjects screen | prod-active | **Marginal** — ~duplicate of index's subject list | `curriculum.tsx:158` |
| `child/.../subjects/[subjectId]` | topics within a subject + recent sessions | prod-active | Yes | `subjects/[subjectId].tsx:49` |
| `child/.../topic/[topicId]` | topic detail; understanding %, drills, AddToMyLearning; params NaN-guarded | prod-active | Yes (depth-3) | `topic/[topicId].tsx:54,109-136` |
| `child/.../session/[sessionId]` | parent-facing read-only recap: narrative/highlight/engagement/prompt + AddToMyLearning | prod-active | Yes (reachable 4 ways) | `session/[sessionId].tsx:44` |
| `child/.../reports` + `report/[reportId]` + `weekly-report/[id]` | weekly + monthly report list/detail; mark-viewed | prod-active | Yes — two cadences, ~2× screens | `reports.tsx:150`; `report/[reportId].tsx:23`; `weekly-report/[weeklyReportId].tsx:76` |
| `child/.../mentor-memory` | parent edits child memory (toggles, tell, curated, export, clear, correction) | prod-active | Yes — but near-dup of self editor | `child/.../mentor-memory.tsx:56` |
| **clone-from-child** (`use-clone-from-child.ts`) | clones child topic into parent's OWN library → `/(app)/topic/relearn` study mode | prod-active | Yes — **the ONLY supporter→learning entry** | `use-clone-from-child.ts:201-218`; `family-bridge.ts:388` |
| `session-transcript/[sessionId]` | top-level read-only transcript (manual `useAuth`); no `assertNotProxyMode` | prod-active | Yes | `learning-path-flows.md:683-684` |
| ParentHomeScreen sub-cards (Cap/Withdrawal/FamilySummary/MentorSlot) | banners + roll-ups | prod-active | Mixed | `ParentHomeScreen.tsx:108,564,87,911` |

---

## 2. Complexity map

### 2.1 User-felt complexity (the save-instinct split; the parent filing-cabinet)

- **The save-instinct split.** A learner who wants to "keep this" faces two *different mental models* with no unifying affordance: a **note** (something *I write*, must be inside a topic) vs a **bookmark** (a *mentor reply I star*, can be topicless). They are saved by different gestures, capped differently (50/topic vs uncapped), and surfaced in inconsistent places. VERIFIED divergence: `topic_notes.topicId` NOT NULL + cap 50 (`schema/notes.ts:15`; `services/notes.ts:16`) vs `bookmarks.topicId` nullable + uncapped (`schema/bookmarks.ts:28`). The user does not perceive "topic-bound capped artifact" vs "event-provenanced uncapped star" — they perceive "I saved a thing." The taxonomy is an implementation leak.
- **Where did my saved thing go?** Three+ destinations: editable bookmarks in `progress/saved`, read-only everything in `my-notes`, topic-scoped in topic detail. The `my-notes` hub shows a count **only for Sessions** (`my-notes/index.tsx:70`) — Notes/Bookmarks always read as empty until tapped. INFERRED user-cost: "do I have saved notes?" is unanswerable without two taps.
- **The parent filing-cabinet.** A guardian who wants "what did my kid learn + what does the mentor remember" must visit **three unrelated places** — Recaps tab, child overview (`?mode=settings` for memory), and the depth-2 mentor-memory editor (`recaps-notes-memory.md:184-188`). The highest-value parent action (AddToMyLearning / clone) is buried at **depth 3-4** inside topic/session detail (`parent-family.md:120`).
- **Same session, three "what happened" reports.** One completed session emits a learner recap, a parent highlight+narrative, and an engagement signal — three generators, three render sites (summary screen, Recaps tab, My-Notes session rows). VERIFIED: `recaps-notes-memory.md:204-209`; recap cards paper over null fields with ~5 fallbacks (`recaps/index.tsx:133`).

### 2.2 Hidden complexity (two systems, overlap counts, caps, guards)

- **Two save systems, asymmetric on every axis.** Notes: topic-mandatory, capped (50, advisory-locked `services/notes.ts:160-205`), no unique constraint, FK-cascade on topic delete. Bookmarks: subject-mandatory, topic-optional, uncapped, unique `(profileId,eventId)`, raw `sessionId`/`eventId` with **no FK** so they survive session TTL (`schema/bookmarks.ts:22-24`). A merge must reconcile **5 distinct schema axes**.
- **The unified list already exists — but only reads.** `my-notes/[kind].tsx` collapses sessions+notes+bookmarks into one `ArchiveItem` (`:33-45`) and renders all three from one card component (`:233-302`). It has **no write/delete path** — deletion still lives only in `progress/saved` (bookmarks) and the topic flow (notes). So the "merge" is half-done: read merged, write split.
- **Supporter data-overlap counts (VERIFIED file:line).** The same `session_summaries` content (`narrative`/`highlight`/`conversationPrompt`/`engagementSignal`) is rendered in **at least 4 places**: Recaps list (`recaps/index.tsx:133`), Recap detail (`[recapId].tsx`), child session detail (`child/.../session/[sessionId].tsx:44`), and My-Notes session rows (`my-notes/[kind].tsx:125`). **Session detail is reachable via 4 ancestor chains** (overview→recent depth-2, subject→recent depth-3, topic→history depth-4, weekly-report CTA — `parent-family.md:116`). **AddToMyLearningButton renders in 3 places** (recap detail, child session detail, child topic detail — `learning-path-flows.md:675`). **Nudge entry exists in ≥2 places** (ParentHomeScreen + weekly-report — `parent-family.md:122`). **mentor-memory has 2 near-duplicate editors** (self 821 lines vs child 695 lines — `recaps-notes-memory.md:190-195`).
- **The unwired guard.** `validateNoteDraft` (`services/challenge-round/note-draft.ts:117`) — the lexical-overlap hallucination floor CLAUDE.md mandates for Challenge-Round drafts — has **no production caller** and **no guard test** (`services/notes.ts:237-244`, verbatim: *"no production code path calls validateNoteDraft today, and no guard test exists"*). It is inert only because the whole Challenge flow is flag-off; the day the flag flips, drafted notes ship unguarded.

### 2.3 Load-bearing vs incidental verdict

- **Load-bearing (do not simplify away):** the note/bookmark *stores* (both are the only path to their respective artifact); `progress/saved` delete + proxy-hide (`:98` — the only IDOR-safe delete surface); clone-from-child (only supporter→learning bridge); consent management inside `child/.../index`; the report generators; `validateNoteDraft` (required-but-unwired, not optional).
- **Incidental (collapsible):** the **3-surface saved-stuff sprawl** (one store, three views — collapsible to one); the `my-notes/index` hub (a router whose only job is hidden behind a home-header icon `LearnerScreen.tsx:511`); `child/.../curriculum` (near-dup of index's subject list `parent-family.md:130`); the weekly/monthly report split (two cadences, one list); the duplicated nudge wiring; the two mentor-memory editors (role-parameterizable into one).

---

## 3. Hypothesis audit (claims from proposed/diff docs on this cluster)

| Claim | Verdict | Evidence |
|---|---|---|
| `my-notes/[kind].tsx` ALREADY half-merges notes+bookmarks | **CONFIRMED** | One `ArchiveItem` shape (`:33-45`), `noteToItem`/`bookmarkToItem`/`sessionToItem` (`:131-161`), single card render (`:505-512`). Read-only merge; no shared write/delete. |
| There are "three saved surfaces" | **CONFIRMED (undercount)** | Three list surfaces (`progress/saved`, `my-notes/[kind]`, topic-detail inline) + the `my-notes/index` hub router = effectively four sites. |
| `progress/saved` hides delete in parent-proxy | **CONFIRMED** | `canDelete = navigationContract.gates.showLearningActions` (`progress/saved.tsx:98`); `BookmarkRow` gates the trash icon on `canDelete` (`:54-68`). |
| Notes cap is 50/topic, advisory-locked | **CONFIRMED** | `MAX_NOTES_PER_TOPIC = 50` (`services/notes.ts:16`); `pg_advisory_xact_lock` (`:162-164`). |
| Bookmarks are uncapped | **CONFIRMED** | No cap in `createBookmark` (`services/bookmarks.ts:51-125`); only unique `(profileId,eventId)` (`schema/bookmarks.ts:39-42`). |
| `validateNoteDraft` is unwired | **CONFIRMED** | `services/notes.ts:237-244` comment; no caller. |
| Notes IDOR-guarded at ~:270 | **CONFIRMED** | `verifyTopicOwnership` parent-chain join (`services/notes.ts:270-304`); `listAllNotes` enforces `subjects.profileId = profileId` (`:445`). |
| A per-child "This Week" supporter digest is an M-sized interim win | **PARTIAL → leans MIRAGE** | The §11 S4/S5 Support-hub feed is the ratified heir and is **identity-blocked**; ParentHomeScreen already aggregates per-child cards (`ParentHomeScreen.tsx:335`). An interim digest re-skins a surface §7 deletes. See §5. |
| Library Step 5 (search) folds into Subjects/Journal | **CONFIRMED (spec)** | Annex A.2: `specs/2026-05-12-chat-notes-bookmarks` Step 5 → folds into Subjects/Journal (`spec:417`). |

---

## 4. Current-doc corrections (`learning-path-flows.md`)

1. **Bookmark `subjectId` is NOT NULL — the doc implies only `topicId` matters.** `learning-path-flows.md:568,196` says bookmarks need "an AI response persisted with a subjectId (topicId nullable)." That is correct but understates: `createBookmark` **innerJoins** subjects (`services/bookmarks.ts:67`) and the column is `.notNull()` (`schema/bookmarks.ts:25-27`). A freeform AI turn with no subject **cannot** be bookmarked — same structural class as the note save-block, one level up. The doc treats bookmark-eligibility as looser than it is.
2. **The unwired guard is correctly flagged in the shared context but `learning-path-flows.md:545,503` reads as if the guard runs.** §Notes route 4 says drafts are "validated by a lexical-overlap guard before `DraftedNoteReview`"; the Challenge §:503 says "lexical-overlap guard ≥0.4." Both describe the *intended* pipeline; the guard is **built but uncalled** (`services/notes.ts:237-244`). The doc should carry the same `[UNWIRED]` flag the atlas does (`recaps-notes-memory.md:197-203`). **This is the known-stale item from the shared brief, now re-confirmed at HEAD.**
3. **Freeform "save blocked at topicId null guard" is doubly enforced — doc cites only the alert.** `learning-path-flows.md:203,549` attributes the freeform note exclusion to a save-time `topicId` null guard + alert. VERIFIED there are **two** floors: (a) the client hook throws before any request (`use-notes.ts:237-239` — `'subjectId and topicId are required'`), and (b) the DB column is `NOT NULL` (`schema/notes.ts:15`). The alert is the third, user-facing layer. There is no "loose note" path at any layer.
4. **`my-notes` is "three saved surfaces," not the doc's implied single archive.** The doc's Bookmarks/Notes sections never mention that `progress/saved` is a *separate, editable* bookmark surface distinct from the read-only `my-notes` archive. Two surfaces show the same bookmarks with different capabilities (delete vs read-only).

---

## 5. Simplification candidates

### C1 — Collapse the 3-4 saved-stuff surfaces into one editable archive
- **User gain:** "everything I saved" lives in one place with consistent edit/delete; ends the "where did my note go" hunt.
- **Deleted/kept:** keep `topic_notes`+`bookmarks` stores untouched; keep topic-detail inline read (it's contextual). Delete the `progress/saved` standalone surface by **porting its delete + proxy-hide** into the existing `my-notes/[kind]` list (which already renders both kinds). Retire the count-less `my-notes/index` hub in favor of a single archive with kind-filter tabs.
- **Size:** **M.** The read-merge already exists (`my-notes/[kind].tsx:349-369`); work = add delete mutations (notes via `DELETE /notes/:id`, bookmarks via `DELETE /bookmarks/:id`, both proxy-blocked server-side already) + port the `canDelete = gates.showLearningActions` gate (`progress/saved.tsx:98`) + redirect old routes.
- **Classification:** **SPEC-ABSORBED (§3 Journal tab, S3; §5 Subjects-hub notes, S2).** Spec §3 rules Journal = "recaps · notes (cross-subject view) · mentor memory"; §5.4 rules subject-scoped notes on the hub, cross-subject notes browsable in Journal, "one store, two origins (my notes vs saved-from-mentor, authorship always visible), two views." **This is exactly the note+bookmark merge, already ruled.** Annex A.3 folds `forever-notebook-north-star` in as the Journal invariants.
- **Risk:** Low. No store change, no scoping change. Must not regress proxy delete-hide.
- **Verdict:** **CONDITIONAL — stepping stone, not wasted.** A pre-S3 merge is NOT throwaway: §5/§3 keep the *two stores* and ask for *one browsable view with visible authorship* — precisely what porting delete into `my-notes` produces. The work re-homes into the S2 Subjects hub (subject-scoped) + S3 Journal (cross-subject) rather than being discarded. **Do the read+delete unification now (M); the tab placement is the S2/S3 wrapper.**

### C2 — Wire or formally defer `validateNoteDraft`
- **User gain:** none directly (it's a safety floor); prevents hallucinated drafted notes when the Challenge flag flips.
- **Deleted/kept:** keep; either wire `validateNoteDraft` into the `decideMasteryAndReview → createNoteForSession` path with the guard test, or record a tracked deferral.
- **Size:** **S** (wire: ~1 call-site + red-green guard test per `services/notes.ts:243`) or **XS** (formal deferral note).
- **Classification:** **SHIP-NOW (compliance, not redesign).** CLAUDE.md's Challenge-Round rule: "Notes drafted from Challenge Rounds must use only `solidAnswerQuotes` and pass the lexical-overlap hallucination guard… **before being shown to the learner**." This is a *required* invariant that is currently false. It is flag-gated dark today, but the rule has no "unless flagged off" exception.
- **Risk:** Wiring touches a flag-off path (zero prod blast radius today); the risk is shipping the flag WITHOUT the guard. Project memory `project_stars_parked_until_baseline_reset` parks Challenge note-mark features — so a **formal deferral with a tracked ID** is the honest minimum; full wiring can ride the un-park.
- **Verdict:** **REAL WIN (formal-defer now, wire at un-park).** At minimum convert the bare code comment into a tracked deferral (owner + un-park trigger) so it cannot be silently flipped on. CLAUDE.md "sweep-when-you-fix": there is only 1 site, so no sweep needed.

### C3 — Fix the freeform phantom-save (notes-schema side)
- **User gain:** ends the dead-end where a freeform user is offered "Write note" and then alerted "cannot save" (`learning-path-flows.md:203`).
- **Deleted/kept:** **the schema side requires NO change** — and a "loose notes" bucket would be a large, wrong change (see below).
- **Size of a "loose notes" bucket (the tempting-but-wrong option):** **L/XL.** It would require: making `topic_notes.topicId` **nullable** (migration + drops the FK-cascade-on-topic-delete invariant `schema/notes.ts:16`), reworking the cap (50/*topic* is meaningless without a topic), extending `verifyTopicOwnership` (currently a topic→book→subject join `:270-304` — there is no chain to verify for a topicless note), and a new surfacing/listing model (`listAllNotes` innerJoins through topic→book→subject `:498-501`, all of which vanish). This is a data-model fork, not a bug-fix.
- **Classification:** **CONFLICTS-resolved-by-coordination.** Cluster-2 covers the **CTA-gate side** (suppress the "Write note" affordance in freeform so it's never offered). The **notes-schema side verdict is: do nothing to the schema.** `topic_notes` is correctly topic-mandatory; the fix is suppression at the CTA, not a loose-notes bucket.
- **Risk:** None (suppression is the cluster-2 fix). Building a loose-notes bucket would be high-risk for low gain.
- **Verdict:** **REAL WIN (via the cheap fix) / MIRAGE (the schema rework).** The phantom-save is a CTA bug, not a schema gap. Coordinate: cluster-2 gates the CTA; this cluster confirms the schema must stay as-is. The spec §5 ("notes live on the subject hub, topic-scoped") **reinforces** topic-mandatory notes — a loose-notes bucket would actively fight the ratified direction.

### C4 — Unify the two mentor-memory editors into one role-parameterized view
- **User gain:** consistent behavior self vs child; one place to maintain.
- **Deleted/kept:** keep both *routes*; delete one *implementation* — collapse `mentor-memory.tsx` (821) + `child/.../mentor-memory.tsx` (695) into one component parameterized by `:profileId|self` (they already share `mentor-memory-sections.tsx`).
- **Size:** **M-L** (two screens, divergent gating — self uses `sessionIsOwner`, child uses `memoryConsentStatus` + withdrawn-consent screen `recaps-notes-memory.md:194`).
- **Classification:** **SPEC-ABSORBED (§6.3 Journal "mentor memory" per scope; S3/S4).** The scope-chip model makes "self vs child memory" a scope lens, not two screens.
- **Risk:** Medium — consent gating divergence is legally load-bearing; must not weaken the child-consent gate.
- **Verdict:** **CONDITIONAL — wait for S3/S4.** Pre-spec unification risks re-doing it when the scope model lands; the consent-gate divergence makes a hasty merge dangerous.

### C5 — Interim supporter "This Week" digest / Recaps-fold
- **User gain:** a single weekly per-child summary instead of the Recaps-tab + report-split sprawl.
- **Deleted/kept:** would fold weekly/monthly reports + recaps into one digest card.
- **Size:** **M** (the diff-doc's estimate).
- **Classification:** **SPEC-ABSORBED-WAIT (§6.3 Support-hub aggregated feed; §3.2 cold-start; S4/S5 — identity-blocked).** Spec §7: "**`ParentHomeScreen` as a special shell — its heir is the Support-hub Mentor feed**." §6.3 rules the per-scope aggregated feed; §11 puts it at **S4 (identity-coupled)**. The S2→S3 evidence gate sits *before* S4, and S4 needs the identity-foundation model to land (`spec:294,314`).
- **Risk:** **High waste risk.** Any interim digest re-skins ParentHomeScreen (which §7 deletes) and the Recaps tab (which §6.3 subsumes into the hub feed). It would be built against the V0/V1 shells and thrown away at S4.
- **Verdict:** **MIRAGE (pre-S4).** The whole §11 supporter cluster is SPEC-ABSORBED-wait. The honest read of the timing: supporter simplification is **blocked on the identity runway + the S2→S3 evidence gate**, and ParentHomeScreen is on death row. Do **not** spend interim effort here. The only supporter-side ship-now item is keeping the existing surfaces from regressing (V0 5-tab constraint, §7).

---

## 6. Bottom line

**Scores (1-5, higher = more worth simplifying now):**
- **Notes/Bookmarks half: 4/5.** Real, ship-now value: the read-merge already exists, the merge is spec-ratified (§5/§3), and porting delete into `my-notes` is an honest M that re-homes cleanly into S2/S3. Plus two compliance/correctness items (`validateNoteDraft`, freeform phantom-save) that are S/XS.
- **Supporter half: 2/5.** Almost entirely SPEC-ABSORBED-wait. ParentHomeScreen is deleted by §7; the digest idea is identity-blocked at S4 behind the S2→S3 evidence gate. Interim work here is mirage. The one exception is not-regressing.

**Highest-value move:** **C1 — collapse the saved-stuff surfaces into one editable archive (M), as the S2/S3 stepping stone**, executed *with* **C2 (formally defer/track `validateNoteDraft`, XS)** and **C3 (confirm no schema change for the phantom-save; cluster-2 gates the CTA)**. These three are all ship-now, low-risk, and forward-compatible with the mentor-is-the-app spec.

**The one thing that must NOT be simplified away:**
1. **`topic_notes.topicId NOT NULL` + the cap + `verifyTopicOwnership` IDOR chain.** Making notes topicless (a "loose notes" bucket) to "fix" the freeform phantom-save is an L/XL data-model fork that drops FK-cascade safety and fights spec §5's topic-scoped-notes ruling. The phantom-save is a CTA bug, not a schema gap.
2. **`progress/saved.tsx:98` proxy delete-hide (`canDelete = gates.showLearningActions`).** Any merge into `my-notes` MUST port this gate — it is the only thing stopping a parent-proxy session from deleting a child's bookmarks.
3. **`validateNoteDraft` is required, not optional.** Do not "simplify" it away as dead code — CLAUDE.md mandates it before any drafted note is shown. Track it; wire it at the Challenge un-park.

---
**[ BOTTOM LINE ]** Notes/Bookmarks is a genuine ship-now M (the spec-ratified merge, read-half already built); the entire supporter half is SPEC-ABSORBED-wait behind the identity runway + S2→S3 gate and should not be touched interim.

**[ FYI ]**
- The unwired `validateNoteDraft` guard is re-confirmed at HEAD (`services/notes.ts:237-244`) — inert only because Challenge is flag-off; flipping the flag ships drafted notes unguarded, violating a CLAUDE.md hard rule.
- The freeform phantom-save is a CTA bug, not a schema gap: notes are topic-mandatory at three layers (client hook, DB NOT NULL, alert). A "loose notes" bucket is L/XL and conflicts with spec §5.
- "Three saved surfaces" undercounts — there are four render sites (`progress/saved`, `my-notes/[kind]`, topic-detail inline, + the `my-notes/index` hub router).

**[ ACTIONS ]**
1. Coordinate C3 with cluster-2: they gate the freeform "Write note" CTA; this cluster confirms the schema stays topic-mandatory (no loose-notes bucket).
2. Convert the `validateNoteDraft` code comment into a tracked deferral (owner + un-park trigger) so the Challenge flag cannot be flipped without the guard.

**[ DECISIONS ]**
1. Whether to build the saved-stuff read+delete unification (C1, M) now as an S2/S3 stepping stone — recommended **yes** (forward-compatible, re-homes cleanly, no store/scoping change), with the hard requirement that the `progress/saved` proxy delete-hide is ported.
