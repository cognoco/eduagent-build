# MMT-ADR-0055 — The disposable API-integration target is rebuild-only by contract

**Status:** Proposed · **Scope:** The disposable Postgres target used for API integration tests — its remedy path when its schema no longer matches the pinned revision, and what the operator authorization for rebuilding it is scoped to · **Deciders:** pending Architecture sign-off

## Context

Integration tests for the API run against a dedicated, disposable Postgres target that a bootstrap script provisions from a revision-pinned migration journal. The script's guarantee is not "the schema is probably right" — it is a fingerprint-based identity claim: *this target holds exactly this revision's schema, and that is proven by fingerprint.* A marker table records the target id, the revision, a chain fingerprint over the migration journal, and a live fingerprint of the schema itself, and the bootstrap refuses to proceed unless all of them agree.

When the target drifts from the pinned revision, the bootstrap fails closed and demands a destroy-and-recreate authorized by a named operator ruling. This has recurred: a drift incident on 2026-08-03 blocked an unrelated item (a table absent, SQLSTATE 42P01, reconfirmed by read-only catalog check) and failed ten guardian-attachment tests. Destroy-and-recreate fixed the instance, and a later fail-fast guard made recurrence detectable sooner — but each recurrence still requires an operator-authorized destroy, which parks work.

That recurring cost produced a natural question: should the target instead support migrating forward, replaying newer migrations onto the existing instance rather than rebuilding it?

Note the failure family, because it is easy to misfile. This target's gate **refuses correctly** — it detects real drift and declines to mutate a target it cannot vouch for. That is the opposite of a gate that lets a bad state pass silently, and it should not be reasoned about as though it were one. The only question is whether the remedy the gate demands is the right one.

## Decision

**The disposable API-integration target is rebuild-only by contract.** No migrate-forward mode is added.

**The operator authorization required to rebuild is a durable, target-scoped ruling reference, reusable across revisions.** It is not per-revision. What each rebuild requires is the *reference*, not a fresh ruling.

## Consequences

Rebuild wall-clock cost remains on every schema change. This is accepted: it is the price of a target whose contents are verified rather than inferred, and it is paid by a machine rather than a person.

The fingerprint trust model, the fail-closed guards, the revision pinning, the receipt, and the target-name validation are all unchanged by this decision. None of them were in question.

The script's refusal text and the local-database testing runbook disagree with each other about authorization scope, and the refusal text is the one an operator actually reads at the moment of failure. The runbook describes a durable ruling scoped to the exact disposable target; the refusal text describes authorization for the exact target *and revision*. Nothing in the code requires the latter: the option validator accepts any non-empty single-line ruling string above a minimum length, and never checks it for freshness, uniqueness, or any relation to the revision — the marker and receipt record it purely as an audit string. The per-revision requirement exists only in that prose, and it is what makes every routine schema change look like it needs a fresh ruling. Aligning both texts with the decision above is the work this decision implies; until that lands, the refusal text overstates what is required.

Because the target is provisioned for tests and its contents are derived rather than authored, it holds no data whose loss matters. A rebuild is therefore an ordinary, expected event — notably including after any schema change — and not a failure mode.

## Alternatives considered

**Sanctioned migrate-forward mode — rejected.** Add a mode that replays migrations onto an existing populated target, with post-migration drift verification against the recorded schema.

The decisive objection is that it trades a verified identity for an inferred one. After a forward migration the schema is only as trustworthy as the migration chain that produced it, which is precisely the property the fingerprint check exists to stop trusting. The post-migration drift check would be the whole safety argument, and it is the part most likely to be weakened later under time pressure — at which point the target silently becomes untrustworthy while still reporting ready.

This repository already carries the scar from that choice one environment over. The development database is push-and-direct-only precisely because its migration journal drifted; a migrate there would now replay unjournaled migrations and abort on already-exists collisions. That failure has never been recovered. Importing the same risk into the one target explicitly designed to be disposable buys nothing that disposability does not already provide.

It also doubles the mutation surface of a fail-closed script that is among the most safety-critical in the database tooling, and the existing state machine — built around "empty target, or trusted marker" — does not accommodate a third path without restructuring.

The deciding factor is that the target has no data worth preserving. Migrate-forward therefore spends the verification guarantee to buy only wall-clock time, while rebuild-only removes the actual recurring cost, which was never the rebuild itself but the belief that each one needed a new ruling.

## Links

- `scripts/bootstrap-api-integration-schema.mjs` — the bootstrap, its marker/fingerprint checks, and the refusal path (source of truth for the mechanism).
- `packages/database/scripts/verify-disposable-integration-target-lib.mjs` — target verification.
- `docs/runbooks/local-db-testing.md` — operating procedure for the disposable target.
- [`MMT-ADR-0000`](./MMT-ADR-0000-documentation-layer-model-and-decisions-layer.md) §II.1 — the significance gate this decision was tested against.
