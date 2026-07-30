# MMT-ADR-0042 — The free tier is a permanent dual cap, and quota counts only visible learner questions

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Free-tier metering, quota-counting rules on all metered routes, parent-proxy metering order · **Deciders:** pending Architecture sign-off · **Builds on:** MMT-ADR-0035 (single authoritative family quota cycle)

## Context

A free tier for a tutoring product has to satisfy two goals that pull apart. It must be generous enough that a new user reaches the moment where the product demonstrably works — which takes on the order of seven to ten exchanges, not one or two — and it must be bounded enough that unlimited free use is not a standing cost.

A purely monthly allowance satisfies the second goal and fails a third one that only appears in use: a month's worth of questions available on day one is consumed in a single sitting. The user gets the exchanges but not the habit, and the product is then absent for the rest of the month. A daily rhythm — a reason to come back tomorrow — is what converts a trial into a routine, and it also identifies the users worth converting, since someone who reaches a daily limit repeatedly is demonstrating sustained use rather than curiosity.

**A documentation divergence is resolved here.** Product documentation has described the free tier as a monthly allowance with a *first-week boost* — a daily allowance available only for the first several days after signup. The implemented behaviour is not time-bounded: the daily cap is a static property of the free tier configuration and applies on every day of use, including after a trial expires. No signup-date-relative daily limit exists anywhere in the system. The permanent dual cap is the decision; the first-week framing described something that was never built, and the ADR records the reconciliation rather than either side of the disagreement being treated as authority.

## Decision

1. **The free tier enforces two caps simultaneously, and both are unconditional.** A per-day cap and a per-calendar-month cap apply together, on every day the account exists. Neither is relative to signup date, trial state, or tenure. Current values are 10 per day and 100 per month.

2. **Paying removes the daily rhythm for the payer, not for a dependent learner.** Which caps apply is resolved per profile from the tier's quota model and the profile's role, never from the tier name alone:
   - **Shared-pool tiers** (Family, Pro) have no per-profile caps at all. The pool is the only bound, and per-profile limit resolution deliberately returns nothing for them.
   - **Per-profile tiers** (Free, Plus) resolve limits by role. The **owner** of a paid per-profile tier has a monthly cap and a null daily limit — that null is the mechanism removing the daily rhythm, not an absence of configuration. A **non-owner (child) profile on that same paid tier retains a daily cap**, and is currently held at the same 10/day and 100/month as the free tier.

   The child-side daily cap is live enforcement, not vestigial config: it is resolved at provisioning, written onto the profile's quota row, and read by the metering middleware on every metered request. **Nothing in this ADR authorises removing it.** A future decision to lift a dependent learner's daily cap would be a deliberate change to a child-facing safeguard, argued on its own merits — never a cleanup justified by this document.

3. **The tier configuration owns the denominators.** Limits are read from one tier configuration, not recomputed at a route or client layer. This extends the same single-denominator discipline MMT-ADR-0035 establishes for shared-pool cycles to the per-profile tiers.

4. **Quota counts visible learner questions and deliberate user-triggered AI actions only.** Work the learner did not ask for and cannot see — report generation, book or topic generation, summaries, telemetry, prefetch, and background jobs — never decrements the learner's pool. Where internal model work needs cost protection, it gets its own abuse or rate limiting; it does not borrow the learner's visible-question allowance.

5. **A metered route in parent-proxy context rejects before subscription lookup and before any decrement.** An action that is refused because a parent is acting in a child's context must not consume the child's or the family's pool. Ordering is the enforcement: rejection precedes lookup, and lookup precedes decrement.

6. **The numbers are product parameters; the shape and the counting rules are the decision.** Retuning any tier's limits, including the free tier's, does not supersede this ADR — the limits are A/B-testable without architectural change. What this ADR fixes is that the free tier's shape is a simultaneous daily-and-monthly pair, that quota counts only visible learner-initiated work, and that proxy rejection precedes decrement.

## Consequences

- Every metered route inherits two obligations that are easy to violate silently: it must classify its work as visible-and-learner-initiated before decrementing, and it must order proxy rejection ahead of lookup. Both failures are invisible in normal operation and only surface as unexplained quota loss.
- Adding a new background or derived AI feature is by default free of quota impact, and making it metered is an explicit decision requiring justification — not the other way round.
- Free-tier exhaustion has two distinct causes that clients must be able to distinguish, since "come back tomorrow" and "upgrade or wait for the month" are different messages.
- A daily limit is only meaningful with a reliable daily reset, so the reset job is load-bearing for the free tier's shape rather than a housekeeping task.
- Because tier numbers may move for experimentation, no code path or document may treat a specific limit as an invariant; anything asserting a particular number is quoting current configuration, not policy.
- **"What does this tier allow?" is not answerable from the tier alone** — it needs the tier's quota model and the profile's role. Any surface, message, or reasoning that maps tier directly to caps will be wrong for a dependent learner on a per-profile paid plan, in the direction of overstating their allowance.
- How the cap is *communicated* at the moment it is reached — whether advance warning is given, and whether any unadvertised allowance is permitted before pausing — is **not decided here**. This ADR governs the cap mechanism; the presentation of exhaustion is a separate decision with its own change-set. (A product ruling on that presentation was recorded 2026-07-15 and is not implementation canon; it is noted in the S2-06A disposition ledger rather than folded in here, because doing so would make an undecided thing read as architecture.)

## Alternatives considered

- **A monthly allowance only.** Rejected: a month's worth of questions available immediately is consumed in one sitting, which delivers the exchanges without the return habit and leaves the product absent for the remainder of the month.
- **A daily allowance only.** Rejected: it provides no bound on total free consumption over time.
- **A smaller monthly allowance (the earlier 50).** Rejected on evidence that it was too small to reach the point where the product demonstrates its value, which takes roughly seven to ten exchanges.
- **Metering all model work, including background generation.** Rejected: it charges the learner for work they neither requested nor saw, and it makes the visible-question count meaningless as a user-facing number. Cost protection for internal work is a separate mechanism.
- **Deducting quota before evaluating proxy eligibility, and refunding on rejection.** Rejected: a refund path is a second place for the ledger to go wrong, and the ordering constraint is cheaper and exact.

## Links

- `apps/api/src/services/subscription.ts` — the tier configuration that owns every denominator, including the separate owner/child quota fields per tier.
- `apps/api/src/services/billing/billing-shared.ts` — `getProfileQuotaLimits(tier, role)`, the per-profile resolution clause 2 describes: it returns nothing for shared-pool tiers and selects the owner or child fields by role for per-profile tiers.
- `apps/api/src/services/billing/billing-v2/quota-provision-v2.ts` — writes the resolved per-profile limits onto the profile's quota row.
- `apps/api/src/middleware/metering.ts` — dual-cap enforcement and decrement ordering; reads the per-profile daily limit for per-profile tiers.
- `docs/adr/MMT-ADR-0035-single-authoritative-family-quota-cycle.md` — the shared-pool cycle and denominator contract this extends to per-profile tiers.
- `docs/PRD.md` — free-tier presentation; corrected in the same change-set to state the permanent dual cap.
