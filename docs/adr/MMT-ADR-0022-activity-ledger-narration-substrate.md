# MMT-ADR-0022 — Activity ledger is the template-first narration and moment substrate

> **Note on numbering:** originally minted as `MMT-ADR-0020` on the new-llm branch (the next free number at the time of authoring); renumbered to `0022` on 2026-06-12 when merging into main — `MMT-ADR-0020` was yielded to the identity-foundation cutover-plan consent-request ADR (analysis C6, WI-678), and `MMT-ADR-0021` was taken by the freeform-threshold ADR (also renumbered from 0019 in the same merge).

**Status:** Accepted · 2026-06-11 · **Scope:** Mentor V2 shell backend primitives · **Deciders:** PM (owner) + Codex · **Builds on:** MMT-ADR-0000 (decisions layer)

## Context

The Mentor V2 shell needs a small, deterministic stream of recent learner moments for the `/now` feed and later visibility/reporting surfaces. The product spec names this as `mentor_activity_ledger`: an append-only activity ledger that records durable moments such as session filing, topic mastery, retention becoming due, recap readiness, and snapshot readiness.

The same substrate is also load-bearing for future GDPR-timer narration. Deletion, retention, and consent countdowns need a stable row-backed source of "what happened" rather than reconstructing user-visible moments from scattered operational tables or re-running LLM summaries.

## Decision

Create `mentor_activity_ledger` as an additive, profile-keyed S0 table and expose a best-effort `writeActivityMoment()` helper. The writer is non-core: failures are captured through the existing `safeWrite` posture and never break the primary job or request that produced the moment.

Ledger rows are template-first. A row stores a stable `kind`, stable `templateKey`, and JSON `params`; rendering chooses copy from templates and parameters. The system does not call an LLM per ledger row by default.

S0 keys the table by legacy `profile_id`. The identity-coupled S4 phase will repoint the ledger to `person_id` and add the approved relationship edge reference after the identity app cutover is ready. S0 deliberately does not read or write `person`, `membership`, `guardianship`, or `supportership`.

## Consequences

- `/now` can rank recent moments deterministically with no LLM in the feed path.
- Producers can add narration moments without making non-core writes part of their success criteria.
- The future GDPR-timer surface has an append-only substrate instead of reverse-engineered operational state.
- New ledger kinds remain app-level contract changes, not database migrations, because `kind` and `templateKey` are text validated by `@eduagent/schemas`.
- S4 still owes the identity repoint migration and edge-reference decision. Until then, all S0 ledger reads remain `profileId` scoped.

## Alternatives considered

1. **Rank and write feed moments with an LLM.** Rejected. The Mentor home feed must be deterministic, cheap, explainable, and testable; LLM-assisted ranking can only return as a later separately ruled feature.
2. **Derive moments directly from operational tables every time.** Rejected. Some narration events are not cleanly reconstructable after the fact, and GDPR-timer narration needs a durable event-like substrate.
3. **Key the S0 table by `person_id` immediately.** Rejected. The V2 S0-S3 plan is explicitly identity-independent; the app still runs on `profiles`, and front-loading identity coupling would block the validation bet.
4. **Use a database enum for moment kind/template key.** Rejected. Moment kinds are product contract changes that should ship additively through schemas and code. A DB enum would make every new moment require a migration without adding meaningful safety.

## Rollout and rollback

The migration is additive-only: it creates `ledger_visibility`, `mentor_activity_ledger`, and two indexes. It does not alter or drop existing objects, so the repo's destructive-migration rollback-section requirement does not apply.

If the ledger ever needs to be removed before it carries user-visible state, forward recovery is `DROP TABLE mentor_activity_ledger; DROP TYPE ledger_visibility;`. Once user-visible moments depend on it, removal requires a separate data-retention decision.

## Links

- **Canon edit (lockstep):** `docs/architecture.md` — "Activity Ledger — Narration and Moment Substrate (`MMT-ADR-0022`)" section. Per `MMT-ADR-0000` §II.2, the ADR and its canon line land in the same change-set.
- Spec: `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md` §8.2 and §12.
- Plan: `docs/plans/v2-plan/2026-06-10-s0-backend-primitives.md`.
