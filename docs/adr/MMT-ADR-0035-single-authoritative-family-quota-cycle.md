# MMT-ADR-0035 — Family quota surfaces share one authoritative cycle and denominator

**Status:** Accepted · 2026-07-19 · **Scope:** Family/Pro shared-pool billing reads, enforcement repair, RevenueCat cycle transitions, public usage responses · **Deciders:** Architecture sign-off: MentoMate Program Manager (contract ruling, 2026-07-19)

## Context

Family and Pro subscriptions expose the same shared monthly allowance through subscription status, usage, Family membership, and mobile presentation surfaces. Those surfaces previously combined independently timed subscription, quota-pool, member, and usage-event reads. A stale quota limit, a removed member, or a provider renewal delivered after its effective boundary could therefore make two responses describe different denominators or cycles for the same subscription.

The subscription row already carries the provider-owned paid-period start, the quota pool already carries the active monthly reset token, and usage events already provide the durable consumption ledger. The system needs one rule for combining those sources without inventing another reset date or discarding consumption that belongs to a removed member.

## Decision

1. Every owner-visible Family/Pro quota response is assembled from one effective-access snapshot and one locked quota snapshot. The subscription period start is the cycle anchor; the quota pool reset is the public monthly reset token. The reset token must be reachable by replaying canonical forward month clamps from the period anchor.
2. RevenueCat activation, renewal, and a tier transition into a shared pool align the subscription period start and quota reset to the provider period. A newly established provider cycle clears carried enforcement counters before the current-cycle usage ledger is reconciled.
3. Current-cycle shared-pool usage is the non-negative sum of usage-event deltas at or after the resolved cycle start. The tier configuration owns the denominator. Subscription status, usage, Family detail, remaining allowance, percentage presentation, and enforcement repair use those same values.
4. Active member rows retain their attributed usage. Usage from a person removed during the current cycle remains in the aggregate as `formerMemberUsed`, so `sum(byProfile.used) + (formerMemberUsed ?? 0) === familyAggregate.used`.
5. `GET /v1/subscription/family` returns `cycleResetAt` as the exact token already returned by `GET /v1/usage`. It is never independently calculated at the route or client layer.
6. An unanchored reset, a stale access snapshot that remains stale after one retry, or another incoherent shared-pool state fails closed. A stale-snapshot retry and any enforcement-counter repair emit queryable structured observability events.
7. Account-scoped KV status entries do not satisfy the coherent shared-pool read because they do not bind the subscription snapshot, member set, event aggregate, and reset token. Shared-pool routes therefore assemble the database snapshot instead of returning cached counters.

## Consequences

- The public Family response gains a required ISO timestamp, and the usage family aggregate may include an optional non-negative former-member bucket. Tolerant clients can ignore either additive field; typed producers and consumers must adopt them together.
- A provider renewal delivered late still describes the provider cycle rather than a new cycle beginning at webhook processing time.
- Removed-member consumption cannot disappear from the household total or inflate an active member's row.
- Shared-pool status reads may be slower than a KV hit because coherence requires the database snapshot and lock order. Per-profile tiers keep their existing profile-scoped database behavior.
- Counter repair becomes visible to operations and is bounded by the same locked event aggregate shown to the owner.
- Reverting the implementation and this record restores the prior response shapes and read behavior without a schema migration or persisted-data rewrite.

## Alternatives considered

1. **Let each endpoint compute its own reset and usage total.** Rejected — independently timed reads recreate the contradictory denominators this decision removes.
2. **Treat the quota-pool counter as the sole display ledger.** Rejected — a stale counter cannot attribute active versus removed members and can conceal current-cycle event history.
3. **Drop removed-member usage from the aggregate.** Rejected — removal would retroactively restore consumed allowance and make enforcement differ from the owner-visible total.
4. **Return a freshly calculated Family reset date.** Rejected — a second token can drift from usage and enforcement, particularly around clamped month ends and delayed provider webhooks.
5. **Serve shared-pool status directly from the account-scoped cache.** Rejected — the cached payload does not prove that its member rows, event aggregate, denominator, and reset token came from one cycle.

## Links

- `docs/architecture.md` — living Family usage response contract.
- `apps/api/src/services/billing/billing-v2/family-v2.ts` — coherent snapshot assembly and event-ledger aggregation.
- `apps/api/src/services/billing/billing-v2/revenuecat-v2.ts` — provider-cycle activation and renewal alignment.
- `packages/schemas/src/billing.ts` — public Family and usage response schemas.
