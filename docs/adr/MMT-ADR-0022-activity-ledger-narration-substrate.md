# MMT-ADR-0022 — Activity feed: moments are derived on read; the ledger table is seen-state, not an event-of-record

**Status:** Accepted · 2026-06-15 · **Scope:** Learner-home moment feed (the `/now` surface) · **Deciders:** Architect (jjoerg) + PM (owner) · **Builds on:** MMT-ADR-0000 (decisions layer)

## Context

The learner-home `/now` feed shows a small, prioritized stream of recent notable moments — "you filed a session", and the like. The architectural question is how those moments are produced: **derived from operational state at read time, or materialized into a dedicated store as they happen.**

The decisive fact, established by the as-built code: **the moments are overwhelmingly reconstructable.** The `/now` feed already derives `retention_due` live from `retention_cards`; topic-mastery is already recorded on the session/assessment records; session filing is recorded on the session. Of the six moment kinds the schema declares, five are never materialized at all — the feed derives them or would. So the premise that justified a materialized log ("reconstructing from operational tables is fragile/non-deterministic") is contradicted by the system's own behavior. The only thing that genuinely needs persistence is **seen-state** ("have we already shown this moment?"), which the operational tables cannot express.

## Decision

The architecture is **derive-on-read with a thin seen-state store (option E of the alternatives below).**

1. **Moments are derived on read.** The `/now` feed computes notable moments by querying operational tables (sessions, `retention_cards`, assessments, …) at request time and ranking them. A new moment kind adds a read-time projection, **not** a new materialized writer.
2. **`mentor_activity_ledger` is a narrow seen-state store**, not an event-of-record: it tracks `surfaced_at` so a moment is shown approximately once, plus the rare moment that is genuinely not reconstructable from operational state. It is not a materialized log of all moments.
3. **Writes are non-core / best-effort (`safeWrite`).** This is *correct*, because the table is a cosmetic display aid, not authoritative: a dropped row costs at most one lowest-priority feed card, and drops are captured in Sentry. (This is the residual write surface; most moments are not written at all.)
4. **Visibility is self-only.** A moment is shown only to the profile it concerns, enforced by profile scope + RLS. There is **no per-row visibility flag.** If cross-user moment sharing (guardian/supporter) is ever built, it is a **read-time, relationship-derived policy** owned by the visibility-contract work — never a stored column.
5. **Not a compliance substrate.** The feed is not load-bearing for GDPR-timer narration, deletion, retention, or consent countdowns; those derive from their own authoritative sources. If a compliance consumer is ever built on moment history, that is a separate decision with its own (stronger) write semantics.
6. **`/now`'s read-scope covers `person` and `supportership` reads.** The service also serves `person`-scoped and `supporter-hub` requests, reading `person` + `supportership` alongside the derive-on-read operational tables above. The S0 build plan originally scoped this out ("no `person`/edge reads") under the assumption that identity was not yet live; identity is now live (stg/prd: `person` populated, `profiles` dropped, `subjects` FK repointed), so that precondition no longer holds — the S4-scoped reads shipping inside this one service is correct, not a tier violation (`WI-1123`, 2026-07-01). `supportership` is currently empty (no linking UI yet), so these reads are live but return nothing in practice.

## Consequences

- `/now` ranks moments deterministically with no LLM and no dependence on a complete materialized log.
- The dual-write / lost-moment problem largely dissolves: you cannot lose a moment you compute from source-of-truth.
- The table shrinks to seen-state. The `visibility` column + `ledger_visibility` enum, the unread `template_key` column, and the five declared-but-unwritten `LedgerKind`s are dead weight to remove (tracked as follow-up code WIs).
- Best-effort writes remain correct for the residual materialized surface.
- A future kind is added as a read-time projection; only a *genuinely non-reconstructable* moment justifies a new materialized write.

## Alternatives considered (the design space)

- **A — Derive-on-read only.** Ideal for the reconstructable majority; folded into the chosen hybrid. Pure-A can't hold the one thing that must persist (seen-state) or a truly-ephemeral moment.
- **B — Materialized store of all moments.** **Rejected:** its premise ("reconstruction is fragile") is refuted by the feed already deriving retention on read; materializing every kind adds a dual-write/loss surface and a write path on every producer for no benefit on derivable moments.
- **C — Project over an existing event backbone** (Inngest history / domain events). **Rejected:** couples the feed to internal event schemas; the operational tables are a cleaner projection source.
- **D — Notification/inbox** (per-user read/unread). **Rejected:** full inbox semantics exceed the feed's need; `surfaced_at` provides the minimal seen-state the hybrid requires.
- **E — Hybrid: derive the derivable, persist only seen-state + the genuinely non-reconstructable. CHOSEN.**

## Rollout and rollback

The table is additive and *shrinking* under this decision. Removing the dead `visibility` column + `ledger_visibility` type, the `template_key` column, and the unwritten kinds is forward-only cleanup (tracked WIs); none is read by any consumer today (`/now` is the sole reader and uses neither column). No user-visible state depends on the table beyond the cosmetic feed.

## Links

- **Canon (lockstep):** `docs/architecture.md` → "Activity Feed — Derived Moments + Seen-State" section. Per `MMT-ADR-0000` §II.2, the ADR and its canon line land in the same change-set.
