# Path 1 — Freeform Chat: Deep-Dive

> Cluster scope: Freeform "Ask Anything" — first-message subject classification (CFLF), the filing machinery (≥5-exchange close-path auto-file, MMT-ADR-0021), and the freeform note CTA / "cannot-save" trap. · Analyst: path1 · Date 2026-06-10 · Sources verified at HEAD of `new-llm` (branch confirmed via `git branch --show-current`).

All `file:line` cites verified against source unless marked **INFERRED**. Path 1 logic does **not** live in `session/index.tsx` as the brief's line hints suggested — the classification engine is `apps/mobile/src/components/session/use-subject-classification.ts`; index.tsx only wires the disabled-state. Corrections in §4.

---

## 1. Feature inventory (verified)

| Feature / branch | What it does | Status | Load-bearing? (why) | Evidence |
|---|---|---|---|---|
| Greeting guard | Pure-greeting first message in freeform intercepted client-side, animated canned reply, **no API call, no classify, no session write** | prod-active | **Load-bearing** — prevents the silent auto-subject-pick bug AND saves an LLM round-trip + quota on "hi". Anchored regex (`^…$`) so "hi can you help with fractions" still classifies | `use-subject-classification.ts:484-500`; regex `session-types.ts:335-339` (comment: "Do not remove the anchors") |
| CFLF classification (1/n/0) | First substantive freeform msg → `POST /subjects/classify` (LLM rung-1). 1 candidate→silent "Looks like X"; n→disambiguation chips; 0→`resolveSubject`/create-subject fallback | prod-active | **Load-bearing** — produces the `subjectId` that bookmarks + auto-file structurally require (§2.2). Cannot be deleted, only hidden | `use-subject-classification.ts:522-757`; "Looks like X" at `:546`; endpoint `subjects.ts:78-89` → `subject-classify.ts:107` |
| Classify fast-path (1 enrolled subject) | `subjects.length===1` → deterministic auto-match conf 0.9, `needsConfirmation:false`, **no LLM call** | prod-active | Incidental but important: composer block is near-instant for 1-subject learners; only 2+/0-subject learners eat LLM latency | `subject-classify.ts:172-187` |
| Composer block during classify | While `pendingClassification`, text input disabled + "classifying subject" banner; **subject chips stay actionable** (BUG-234) | prod-active | **Load-bearing-ish** — blocks double-send during the in-flight classify; but it's the friction the spec must remove (§5) | `index.tsx:1235-1248`; accessory-always-visible `ChatShell.tsx:900-902` |
| create-subject `returnTo=chat` fallback | 0-candidate / "+Add" path routes to create-subject then **back to freeform chat** (not curriculum flow) | prod-active | Load-bearing escape hatch (BUG-236) — prevents dead-end when no subject matches | `SessionAccessories.tsx:236,262`; Path-0 doc `create-subject.tsx:328-340` |
| Bookmark dependency on subjectId | AI msgs bookmarkable once persisted with a `subjectId` (topicId nullable) | prod-active | **Load-bearing constraint** — `bookmarks.subject_id` is `.notNull()`; `topic_id` nullable. This is *why* classification can't be skipped | schema `bookmarks.ts:25-28` |
| ≥5-exchange close-path auto-file | On close, if freeform + no topic + not filed + `exchangeCount≥5` → `safeSend('app/session.auto_file_requested')` | prod-active (MMT-ADR-0021) | **Load-bearing** — the durable review artifact for freeform; correctly non-core (`safeSend`) so dispatch failure never breaks close | `session-filing-dispatch.ts:12-55`; `FILING_CONFIG.minFreeformExchanges:5` (`config/filing.ts:2`) |
| Filing prompt is **homework-only** | `setShowFilingPrompt(true)` fires **only** for `effectiveMode==='homework'` — freeform never shows the manual "Add to Library" prompt | prod-active | Load-bearing simplicity — freeform goes straight to summary; the ≥5 threshold gates only the *server* dispatch | `use-session-actions.ts:375-376` |
| note_prompt emission (NOT freeform-excluded) | KNOWLEDGE-CAPTURE block included for all non-recitation sessions → LLM can emit `note_prompt.show` → "Write a note" CTA renders in freeform | prod-active | **Incidental / mis-scoped** — the CTA appears in a context where save is structurally impossible | `index.tsx:390,1307` (`notePromptOffered` from SSE); CTA `SessionFooter.tsx:103-119` |
| topicId-null save block ("cannot save" trap) | Tapping save with no topic → `platformAlert("Cannot save note", "Notes cannot be saved right now. Please try again.")` and returns | **prod-active (NOT fixed at HEAD)** | **Anti-feature** — offers a save it then refuses, with copy that *lies* (says "try again" for a permanent structural condition) | `SessionFooter.tsx:128-134`; copy keys `en.json:684-685` |

---

## 2. Complexity map

### 2.1 User-felt complexity
- **The lightest entry makes the heaviest decision on sentence #1.** "Ask anything" freezes the input for one classify round-trip and may interrupt with "which subject?" chips before a single word of teaching — the opposite of the promise. (For a 2+-subject or 0-subject learner this is an LLM-latency block; `use-subject-classification.ts:522-757`, `index.tsx:1237`.)
- **Offered-then-denied "Write note."** A "Write a note" button renders, the kid taps, gets "Notes cannot be saved right now. Please try again." — taps again, fails again, concludes the app is broken. Verified live at HEAD (`SessionFooter.tsx:103-134`).

### 2.2 Hidden complexity
- **Classification is load-bearing plumbing, not UX garnish.** Two downstream systems have a `NOT NULL subject_id`: bookmarks (`bookmarks.ts:25-26`) and the close-path auto-file (`session-filing-dispatch.ts:21` requires the session to resolve to a subject to file). So freeform cannot be "subjectless" end-to-end — the `subjectId` must be produced. It can move to the *background*; it cannot be *removed*. (This is the single most important constraint in this cluster.)
- **`topic_notes.topic_id` is `.notNull()` with a FK + `onDelete:'cascade'`** (`notes.ts:14-16`). There is **no topicless-note path anywhere in the schema.** A "Loose notes" bucket is therefore a schema migration (new nullable column or new table + writer + reader + cap logic), not a UI tweak. Sized L/XL, not S.
- **`handleSend` is a 340-line decision tree** (`use-subject-classification.ts:420-798`) with ~8 distinct branch outcomes across freeform vs non-freeform × 0/1/n candidates × resolve-fallback × catch-paths. Each branch is a real bug fix (BUG-31/233/234/236, F-1). This is the hidden cost behind "just classify silently."

### 2.3 Load-bearing vs incidental verdict
- **Load-bearing (must survive any simplification):** greeting guard; the classify→`subjectId` resolution (background-able, not removable); the ≥5-exchange auto-file via `safeSend`; the create-subject `returnTo=chat` escape.
- **Incidental / removable friction:** the *blocking* + *visible* "Looks like X"/disambiguation interruption (can go background); the freeform "Write note" CTA + cannot-save alert (mis-scoped, should be gated out).

---

## 3. Hypothesis audit (claims from proposed/diff docs on this cluster)

| Claim | Verdict | Evidence |
|---|---|---|
| Freeform "Write note" → "cannot save, try again" is a permanent condition wearing transient-error copy (`SessionFooter.tsx:128-133`, `en.json`) | **CONFIRMED** | `SessionFooter.tsx:128-134` returns on `!topicId` with `cannotSaveTitle`/`cannotSaveMessage` = "Notes cannot be saved right now. Please try again." (`en.json:684-685`). Copy is genuinely misleading. |
| Minimal fix = gate the "Write note" CTA on `topicId != null`, mirroring the homework-only `setShowFilingPrompt` gating | **CONFIRMED (viable, S)** | CTA render at `SessionFooter.tsx:103` has no topic guard; the homework-only pattern at `use-session-actions.ts:375` is the precedent. Adding `&& topicId` to the CTA condition is surgical. |
| "Loose notes" bucket as the no-topic fallback | **REFUTED as a quick win** | `topic_notes.topic_id` is `.notNull()` FK (`notes.ts:14-16`) — no topicless path exists. Bucket = schema migration + new writer/reader/cap. Sized L/XL. The gate-the-CTA fix is the real win; loose-notes is a separate, larger bet. |
| Make first-turn classification silent and non-blocking; "no Looks-like-X chips, no create-subject screen" | **PARTIAL** | Silent + non-blocking is achievable and aligns with spec §3 (background-resolve). BUT classification **cannot be skipped** — `subjectId` is required by bookmarks (`bookmarks.ts:25`) and auto-file. "No create-subject screen" is risky: the 0-candidate path is the only escape when nothing matches; removing it re-opens the dead-end BUG-236 fixed. Keep the fallback; hide the happy path. |
| Infra to "answer first, resolve in background" already exists (Path 1 classify-after-first-message) | **CONFIRMED** | Classification already runs *after* the first message is in the transcript (`handleSend` appends the user msg at `:439` before classify at `:526`). The reorder is real; only the *blocking* is the gap. |
| `freeform` is a runtime branch (`topicId==null`), not a real mode; merge into `tutor` | **CONFIRMED (structurally)** | Freeform diverges from `learning` only by start-state (no subject/topic) + filing branch + overlay-ineligibility (all driven by `topicId==null`). No freeform-specific `SESSION_MODE_CONFIGS` pedagogy. This is a §7-class consolidation, SPEC-ABSORBED, not a ship-now. |
| Greeting guard exists and short-circuits before classify | **CONFIRMED** | `use-subject-classification.ts:484-500`. |

---

## 4. Current-doc corrections (`learning-path-flows.md`)

The doc's Path 1 narrative is accurate. Two **location** corrections vs the brief's line hints (not the doc, but worth recording so future readers don't chase ghosts):

1. **Classification + "Looks like X" + blocking all live in `use-subject-classification.ts`, not `session/index.tsx:1095-1096,1218-1219`.** The "Looks like X" injection is `use-subject-classification.ts:546`. `index.tsx` only consumes `pendingClassification` to set `inputDisabled` (`:1237`) and the disabled banner (`:1257`). The brief's `index.tsx` line hints point at unrelated `SessionScreenChrome`/`ChatShell` wiring.
2. **Classify is not always an LLM call.** `learning-path-flows.md:189-191` implies classify always hits the LLM. For a learner with exactly **1 enrolled subject**, `classifySubject` short-circuits deterministically with no LLM call (`subject-classify.ts:172-187`). The composer-block latency is therefore conditional on subject count (0 or ≥2 → LLM; 1 → instant). Minor, but it changes the latency story: most returning single-subject freeform users barely feel the block.

The doc's key claims I re-verified and **confirm**: filing affordance homework-only (`use-session-actions.ts:375-376`); note prompt NOT freeform-excluded, save blocked at topicId guard (`SessionFooter.tsx:128-134`); ≥5-exchange close-path auto-file via `safeSend` (`session-filing-dispatch.ts:24,45`); Challenge Round excluded for no topicId.

---

## 5. Simplification candidates

### C1 — Gate the freeform "Write note" CTA on `topicId != null`; delete the cannot-save alert
- **User gain:** removes a confirmed offered-then-denied trap whose copy actively misleads ("try again" for a permanent condition).
- **Deleted/kept:** delete the `!topicId` alert branch (`SessionFooter.tsx:128-134`) + its two `en.json` keys; gate the CTA render (`:103`) on `topicId`. Keep everything else.
- **Size:** S.
- **Classification:** **SHIP-NOW.** Independent of the shell redesign; the spec's freeform bar (§3) will carry *more* freeform traffic, so this trap gets *more* common if unfixed. No conflict with §7.
- **Risk:** near-zero. Mirrors the established homework-only filing-gate pattern. One break-test: render note_prompt in a topicless session, assert no CTA.
- **Verdict:** **REAL WIN.**

### C2 — Make first-turn classification silent + non-blocking (background-resolve), keep the 0-candidate fallback
- **User gain:** "ask anything" answers the question first; subject resolves in the background only to satisfy bookmark/auto-file plumbing. Removes the input-freeze + the "which subject?" interruption on the lightest entry — the exact friction the spec bets the whole product on (§3 "ever-present input bar = front door").
- **Deleted/kept:** delete the *blocking* (`pendingClassification`→`inputDisabled`) and the *visible* happy-path interruption ("Looks like X" / disambiguation chips on the first turn). **Keep** the classify call (background), the greeting guard, and the 0-candidate create-subject `returnTo=chat` fallback (it's the only no-match escape; removing it re-opens BUG-236).
- **Size:** M (must thread subjectId resolution into the first exchange without blocking the stream; handle the race where the AI streams before classify returns).
- **Classification:** **SPEC-ABSORBED (§3 / §3.1, strangle phase ~S2–S4).** The cold-start card and ever-present bar *are* this flow; the spec's "no 'what subject is it?' preamble" rule (§3.1 homework stress-test) is the same principle. Do it as part of building the bar, not before.
- **Risk:** Medium. (a) Bookmarks/auto-file need the resolved `subjectId` — background resolve must complete before the user bookmarks or the auto-file runs (it does, since both are post-first-AI-turn). (b) Silent mis-classification with no visible "wrong subject?" chip could file under the wrong subject — keep a lightweight post-hoc "wrong subject" affordance (already exists: `showWrongSubjectChip`).
- **Verdict:** **CONDITIONAL** — real win, but belongs inside the spec build, and must not drop the wrong-subject correction affordance.

### C3 — "Loose notes" bucket for topicless freeform saves
- **User gain:** a freeform note could be saved instead of refused.
- **Deleted/kept:** would add a topicless-note store.
- **Size:** L/XL (schema: `topic_notes.topic_id` is `.notNull()` FK — needs nullable column or new table + new writer/reader + cap logic + a surfacing UI).
- **Classification:** CONFLICTS-ish — overlaps the spec's Journal/notes consolidation (§3 Journal tab, §5). Building a parallel loose-notes store now risks throwaway work against the Journal model.
- **Risk:** High relative to payoff; the cheaper C1 (don't offer the save) removes the user harm without the store.
- **Verdict:** **MIRAGE** (as a near-term move). The harm is "offered-then-denied," not "can't save freeform notes" — C1 fixes the harm. Revisit loose-notes only inside the §5 Journal design.

### C4 — Fold `freeform` mode into a single `tutor` mode (`topicId==null` runtime branch)
- **User gain:** indirect (fewer mode permutations to maintain); no direct end-user gain.
- **Size:** L.
- **Classification:** **SPEC-ABSORBED (§7 "what dies", post-§11 evidence gate).** "Nothing dies before §11 says so."
- **Risk:** must preserve funnel analytics (decouple `entryPoint`), the filing branch, and overlay-ineligibility — all `topicId`-driven, so mechanically clean, but it's a backend refactor, not a UX win.
- **Verdict:** **CONDITIONAL / defer to spec sequencing.**

---

## 6. Bottom line

**Score: 4/5** — Path 1 is in good shape and already embodies the spec's thesis (classify-after-first-message = answer-first infra exists). It carries two genuine defects: one trivially fixable trap (the note CTA) and one spec-aligned friction (blocking classification). It is *not* over-built.

**Highest-value move:** **C1 — gate the freeform "Write note" CTA on `topicId` and delete the lying cannot-save alert** (size S, SHIP-NOW, zero shell coupling). It removes a confirmed "the app is broken" moment that the spec's bar-as-front-door bet will only make *more* frequent. C2 (silent non-blocking classify) is the bigger UX win but is correctly the spec's job (§3/§3.1) and should ride the shell build.

**The one thing that must NOT be simplified away:** **the classification step itself.** It looks like UX garnish but is load-bearing plumbing — `bookmarks.subject_id` and the close-path auto-file are both `NOT NULL subject_id` (`bookmarks.ts:25`, `session-filing-dispatch.ts:21`). Make it *silent and background*; never make it *skippable*. Likewise keep the greeting guard (prevents the silent auto-pick bug + saves quota) and the 0-candidate create-subject `returnTo=chat` escape (the only no-match exit; deleting it re-opens BUG-236).
