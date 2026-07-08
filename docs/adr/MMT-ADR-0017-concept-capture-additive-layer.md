# MMT-ADR-0017 — Concept-grain mastery is captured in an additive layer; the topic-grained spine is not re-keyed

**Status:** Accepted · 2026-06-15 · **Scope:** Mastery/retention data model · **Deciders:** Architect (jjoerg) + PM · **Builds on:** MMT-ADR-0005 (book-mastery atomic update), MMT-ADR-0011 (phase-E data model)

## Context

EduAgent tracks learning at **topic grain** on every shipped surface — `retention_cards` (one SM-2 timer per topic), `assessments.masteryChallengeVerifiedAt` (set only when all of a topic's concepts evaluate `solid`), `topic_notes` (per topic). The lone concept-grain exception is `needs_deepening_topics`, which stores **only weak** concepts.

Challenge-Round evaluation (`decideMasteryAndReview()`) already produces a per-concept verdict (`solid`/`partial`/`missing`/`misconception`) plus the learner's backing quote for **every** concept it grades. When a topic passes (all solid), the solid verdicts and their quotes are **discarded** — the system durably remembers concept-grain failure but not concept-grain success. Consequences: no concept-grain star, no concept-grain trajectory, and no data on how multi-concept topics actually are.

Two structural questions had to be answered together: (a) should mastery move to concept grain, and (b) if so, by **re-keying** the existing spine or by an **additive** layer.

## Decision

### 1. Capture concept-grain mastery in an additive layer

Add two per-profile, topic-namespaced tables — `concepts` (identity) and `concept_mastery` (current verdict) — that capture **every** Challenge-Round per-concept verdict, solid and weak alike. This stops the solid-verdict signal loss and creates the substrate for a concept-grain star and (later) a concept trajectory.

### 2. Do not re-key the topic-grained spine

`retention_cards`, `assessments`, and progress **stay topic-keyed**. The concept layer sits beside them; it is read for derived signals (the note star) but is not the scheduling or progress key. Re-keying the spine to concept grain is **deferred** and revisited **only when captured usage shows topics are genuinely multi-concept** — a question the new layer itself gathers evidence for.

### 3. Concept identity is namespaced under topic, per profile, with no global resolution

A concept is unique within `(profileId, topicId, normalizedLabel)`. The topic is the namespace that contains label proliferation. No cross-profile or cross-topic concept-identity resolution is built; a cross-subject *connection* (deferred) is a consented edge between two namespaced nodes, not a shared identity.

## Consequences

- **The migration is purely additive** — two new tables + one enum, no changes to shipped tables, trivially reversible (pre-launch the captured data is test-only and no shipped surface depends on it).
- **Capture activation is flag-gated** (`CONCEPT_CAPTURE_ENABLED`): the writer sits behind the flag so the schema, reader, and UI can ship independently of turning capture on. Enabling capture is an operational step taken only once the identity data model the tables key against is stable in the target environment.
- **The note star and tutor-correction-on-recall ride existing signal** — the star is derived from `concept_mastery` (presence-only), and the tutor correction is the already-stored `needs_deepening_topics.correction`. No grading of note text is introduced in v1.
- **Identity/state are split into two tables** so the deferred trajectory feature can insert an append-only evaluation log between them without reshaping.
- **`architecture.md` (Knowledge Retention) is amended in lockstep** to state that mastery is captured at concept grain additively while the scheduled spine remains topic-keyed.
- **The re-key decision is now evidence-gated**, not open-ended: the layer captures concept cardinality per topic as a side effect, which is the input to any future re-key.

## Alternatives considered

1. **Ship topic-grain star + a concept-cardinality probe first; defer the tables behind that evidence.** This was the cheaper path — the user-facing star and tutor-note are buildable on existing topic-grained tables (`assessments` + `needs_deepening_topics`) with zero new schema, and a cardinality metric answers the multi-concept question more cheaply than two tables. **Rejected by the owner**, accepting the cost (two additive tables built ahead of a reader) in exchange for landing the schema cleanly while the system is calm and context is loaded. Noted: pre-launch the temporal-lossiness argument that normally justifies capture-ahead is null (no real-user history yet), so this is a convenience/timing choice, not a data-preservation necessity.
2. **Re-key the spine (retention/assessments/progress) to concept grain now.** Rejected — a full-spine migration is the redesign the owner ruled out, and it bets on the multi-concept world before the evidence exists.
3. **Global (curriculum-wide) concept identity.** Rejected — concept labels are free-text LLM output with no stable IDs; global resolution risks a graph of fuzzy near-duplicates. Topic-namespacing contains the mess for free.
4. **One combined table.** Rejected — separating identity from mutable state mirrors existing patterns and preserves the seam for the deferred trajectory log.

## What this ADR does not decide

- **Whether/when the spine is re-keyed to concept grain** — deferred, gated on captured usage evidence.
- **The concept trajectory** (append-only evaluation log + "March-vs-now" UI) — deferred; `concept_mastery` holds latest state only in v1.
- **Note-text grading** (judging the learner's exact sentence vs. reusing the verdict) — out of scope; the star reuses the verdict.
- **The relevance/connection nudge and the cross-subject connection graph** — separate slices.
- **Exact table column types** — the physical schema in `packages/database/src/schema/` is the source of truth for column detail; this ADR fixes only the grain, namespacing, and identity/state split. (Original design detail: `docs/specs/2026-06-08-concept-capture-layer-design.md`, historical.)
