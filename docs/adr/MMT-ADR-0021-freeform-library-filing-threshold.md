# MMT-ADR-0021 — Freeform Ask Anything is a narrower persistence path: no hidden topic anchors, topic-bound features stay topic-keyed

**Status:** Accepted · 2026-06-15 · **Scope:** Ask Anything / freeform session persistence and learning affordances · **Deciders:** Architect (jjoerg) + PM (owner) · **Builds on:** MMT-ADR-0000 (decisions layer)

## Context

Ask Anything is the learner's lowest-friction entry point: the learner can ask first without choosing a subject, book, or topic. In code this creates a `learning` session with `metadata.effectiveMode = 'freeform'` and no `topicId`. The app saves the chat history. Persisted session events and bookmarks are subject-backed (`subjectId` is required by `session_events` and `bookmarks`) but topic-optional (`topicId` is nullable), so a freeform bookmark can exist before any Library topic is created or linked.

The architectural question is how much of the topic-bound learning system should leak into that freeform path. Topic-bound features — Challenge Round (which writes mastery/review evidence into a topic-keyed system) and learner-authored notes — assume a `topicId`. The tempting shortcut is to mint a provisional/placeholder topic mid-session so freeform can unlock those features. That shortcut creates hidden curriculum state, blurs the privacy/visibility model, and makes Ask Anything behave like silent Library construction.

## Decision

Freeform Ask Anything is a **deliberately narrower persistence path** than guided learning. Three invariants define the boundary.

### 1. No hidden topic anchors

A freeform session never mints a provisional, freeform-derived, or placeholder `topicId` mid-conversation to unlock topic-bound features. A Library topic is created or linked **only** through the normal filing path, and only once the session is eligible.

### 2. Topic-bound features stay topic-keyed

Challenge Round and learner-authored notes remain keyed to `topicId`. Freeform does not offer, accept, or run either. Re-keying either feature away from topics is a larger architectural change that **must supersede this ADR**, never a one-off exception in UI or prompt code.

### 3. Freeform persists a narrower set, and files only on a sustained conversation

What a freeform session persists:

| Affordance | Freeform rule |
|---|---|
| Chat history | Saved. |
| Subject classification | The system may resolve or ask for the subject so events carry a `subjectId`. |
| Bookmarks | Available for persisted AI-response events with a `subjectId`; `topicId` may be null (topicless bookmark). |
| Library filing | Available only once the conversation is **sustained** (see below); then the normal filing eligibility applies. |
| LLM learner recap / session summary | The durable review artifact for a filed freeform session — produced by the normal post-session pipeline. |
| Challenge Round | Not available (Decision 2). |
| Learner-authored notes | Not available as a freeform flow (Decision 2). Bookmarks are the in-chat instant-save; the recap is the post-filing artifact. |

The "sustained conversation" gate is an **operational threshold, not an architectural constant**: it is owned by `FILING_CONFIG` (`apps/api/src/config/filing.ts`, `minFreeformExchanges`) and may be tuned without superseding this ADR. The architectural commitment is only that a *quick* exchange stays lightweight chat/bookmark material and is not filed by default; the exact exchange count is a product-tuning value.

## Consequences

- **Ask Anything stays psychologically lightweight.** A learner can ask a quick question without the app silently enrolling them in curriculum management.
- **The data model stays honest.** No hidden `topicId` anchors means no orphan curriculum state and no privacy/visibility ambiguity from topics the learner never chose.
- **Topic-bound contracts are protected.** Challenge Round and notes keep their topic-keyed semantics; widening either to freeform is a visible, ADR-level decision rather than drift.
- **The filing threshold is freely tunable.** Adjusting `FILING_CONFIG.minFreeformExchanges` is a one-line operational change; it does not touch this ADR.
- **Bookmarks are not promoted to topic artifacts.** A freeform bookmark can be subject-backed and topicless; topic-page bookmark surfaces see it only once a topic relationship exists.

## Alternatives considered

1. **Mint provisional/freeform-derived topic anchors mid-chat** to unlock topic-bound features. Rejected — creates hidden curriculum state, blurs privacy/visibility, and makes Ask Anything feel like silent Library construction. This is the anti-pattern Decision 1 forbids.
2. **Decouple Challenge Round from `topicId`** so freeform can run it. Rejected here — Challenge Round writes mastery/review evidence into a topic-bound system; moving it off topics is a substantial architectural change, not a freeform affordance tweak, and would need its own superseding ADR.
3. **Add a freeform learner-note flow** (e.g. a "write a note" CTA gated on accepting Library filing). Rejected — it adds consent state, pending/failed-filing recovery, and a note surface for small benefit. Bookmarks during chat plus the post-filing recap cover the need.
4. **Treat the filing threshold as a frozen architectural constant.** Rejected — the threshold is product tuning, trivially reversible via one config value. Freezing it as L2 would force an ADR ceremony for a one-line tweak; it belongs in L3 (`FILING_CONFIG`), referenced here only in passing.
5. **Always ask the learner whether to file on session end.** Rejected — it adds friction to the exact path meant to stay low-friction, and asks the learner to manage filing before the system has enough evidence.

## What this ADR does not decide

- Challenge Round behavior for guided/practice/relearn topic-bound sessions.
- The schema or prompt details of the learner recap / structured LLM session summary.
- The classifier's subject/topic selection strategy once a session is eligible.
- The exact value of `FILING_CONFIG.minFreeformExchanges` (operational tuning, L3).
- Whether a future surface lets learners manually promote short saved chats — that would change this filing boundary and needs a superseding/amending ADR.

## Links

- **Canon (lockstep):** `docs/architecture.md` → "Freeform Ask Anything — narrower persistence path" (under "Key Structural Decisions"); `docs/PRD.md` → "Ask Anything / Freeform Persistence Boundary". Per `MMT-ADR-0000` §II.2, the ADR and its canon lines land in the same change-set.
- **Operational owner of the threshold:** `apps/api/src/config/filing.ts` (`FILING_CONFIG.minFreeformExchanges`).
