---
title: Billing Recovery and Learner Capacity - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: draft
gap_ids: [billing-3, billing-4, notif-3]
---

# Billing Recovery and Learner Capacity - Implementation Plan

**Goal:** Make paid-access failures and child-cap exhaustion recoverable before
users silently lose access or get stuck waiting for a parent who was never
actually alerted.

**Approach:** Treat `billing-3`, `billing-4`, and `notif-3` as one recovery
plane. RevenueCat billing issues need proactive in-app/push/email notification
with a manage-billing path. Child quota exhaustion needs a real out-of-app
parent alert and an owner action that grants capacity without forcing every
single-child Plus family into the full Family tier.

## Dependency / Precondition (review finding HIGH-1)

> **T3, T4, and T5 are blocked on the resolution of audit finding `learn-1`
> (HIGH) and must not ship before it.** That finding establishes that a
> non-owner child 403s `PROXY_MODE` on *every* learning write —
> `assertNotProxyMode` throws whenever `profileMeta.isOwner === false`
> (`apps/api/src/middleware/proxy-guard.ts:57-63`), proven by the passing test
> `apps/api/src/routes/sessions.test.ts:3357-3392`. Because `meteringMiddleware`
> is a **global** middleware that runs *before* the route handler
> (`apps/api/src/index.ts:239`) while `assertNotProxyMode(c)` is the **first
> line inside** every session-write handler
> (`apps/api/src/routes/sessions.ts:284,320,333,485,593,666,1232`), a non-owner
> child's quota is decremented — and `app/billing.profile_quota.exhausted` can
> fire (`apps/api/src/services/billing/metering.ts:553-567`) — on a request that
> then 403s. Consequences this plan must resolve **before** building T4/T5:
>
> - If the quota-consuming persona is the **non-owner child studying on their
>   own profile**, granting them top-up capacity (T4) is futile: their writes
>   still 403, so they cannot spend the credits. `learn-1` must be fixed first.
> - If the real quota-consumer is a **parent proxying into the child**
>   (`isParentProxy = true`), then "notify parent / parent grants capacity"
>   (T3/T5) is the same human acting on themselves and the cross-device
>   escalation premise collapses — T3/T5 must be re-scoped.
>
> **Action:** Confirm `learn-1`'s resolution defines a state where a non-owner
> child can complete learning writes, and pin down exactly which persona
> consumes child quota, before starting T4. Do not begin T4/T5 until this is
> answered in writing here.

## Scope

In scope:
- `apps/api/src/services/billing/revenuecat-webhook-handler.ts`
- `apps/api/src/inngest/functions/payment-failed-observe.ts`
- `apps/api/src/inngest/functions/notify-parent-child-cap-hit.ts`
- `apps/api/src/services/child-cap-notifications.ts`
- `apps/api/src/services/notifications.ts`
- `apps/api/src/routes/notifications.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/services/billing/top-up.ts`
- `apps/api/src/middleware/metering.ts`
- `apps/mobile/src/app/(app)/subscription.tsx`
- `apps/mobile/src/app/(app)/_subscription/_components/ChildPaywall.tsx`
- `apps/mobile/src/components/home/ParentHomeScreen.tsx`
- `apps/mobile/src/hooks/use-child-cap-notifications.ts`
- API integration tests and mobile focused tests.
- A new committed migration under the repo's migrations dir (T0) **if** the
  chosen data model adds a column.

> All files listed above already exist (verified 2026-05-31). The only **new**
> artifacts this plan creates are: the T0 migration (conditional), the T4
> owner→child allocation route/service, a new `payment_failed` `EmailType` +
> template (T1), and the corresponding tests (review finding LOW-1).

Out of scope:
- Replacing RevenueCat or changing store products.
- Identity/org billing migration from account to organization; that is T4 of
  the identity redesign.
- Price packaging decisions for new paid SKUs beyond enabling the product path.

## Product Decisions

- Billing issues are user-visible events, not observe-only telemetry. The app
  sends `app/payment.failed` to a notification function that creates an in-app
  banner and attempts push/email when channels are available.
- Child-cap notification means the parent is alerted out of app. The DB row
  remains the in-app inbox source, but push/email fan-out is part of the flow.
- Single-child extra capacity is implemented as owner-purchased top-up credits
  that can be assigned to a child profile on Plus. The first version does not
  add a new subscription tier. **It does NOT simply reuse the existing top-up
  purchase path** (review finding HIGH-2): that path is owner-locked at three
  independent layers and cannot be pointed at a child as-is —
  - `purchaseTopUpCredits` *forces* the credit's `profileId` to the account
    owner and returns `null` if a non-owner profileId is targeted on a
    per-profile tier (`apps/api/src/services/billing/top-up.ts:128-142`,
    esp. 140-141). Plus is per-profile.
  - `consumeOwnerTopUpCredit` is gated `snapshot.role === 'owner'`
    (`apps/api/src/middleware/metering.ts:796-808`) and only fires on **monthly**
    exhaustion; a child falls straight through to `{success:false,
    source:'none'}` (`metering.ts:811-824`).
  - `top_up_credits` has a single nullable `profileId` column with **no
    "purchased-by" vs "allocated-to" distinction** and an immutable `amount`
    per row (`packages/database/src/schema/billing.ts:215-253`); there is no
    row-split mechanism.

  Therefore the implementation introduces (T0) a schema decision, (T4) a **new
  owner→child allocation write distinct from the purchase path**, and a **new
  child-consumption branch** replacing the `source:'none'` fall-through.

## Tasks

- [ ] **T0: Decide and migrate the child-allocation data model (review finding
  HIGH-3).** Done when: a documented decision exists for how a top-up pack is
  marked as allocated to a child — either (a) add a nullable
  `allocated_to_profile_id` column to `top_up_credits` (keeping `profileId` =
  the owner/pool key), or (b) reassign `profileId` to the child with documented
  loss of owner visibility. If (a), a committed migration SQL is generated via
  `db:generate:dev`, applied before any code reads the column, and a
  `## Rollback` section (below) is filled in. Allocation granularity is decided
  here: reassign-whole-pack (no schema split) vs. split-into-two-rows (requires
  a split helper, since `amount`/`remaining` are per-row and immutable —
  `packages/database/src/schema/billing.ts:215-253`). T4 depends on T0.

- [ ] **T1: Turn `app/payment.failed` into a user-facing notification flow.**
  Done when: the Inngest payment-failed handler (currently log-only —
  `apps/api/src/inngest/functions/payment-failed-observe.ts:65-83`) sends a
  typed notification to the paying owner profile via the existing services
  (`sendPushNotification` and `sendEmail`,
  `apps/api/src/services/notifications.ts:60-186,299-355`), stores an in-app
  billing-alert row, and includes a manage-billing deep link. Because billing
  alerts are transactional, the push call passes `skipDailyCap` so it is not
  silently dropped by `MAX_DAILY_PUSH` (review finding MED-2), and the decision
  on whether it bypasses `respectPushPreference` is recorded here (default:
  bypass, billing is transactional — review finding MED-3). Email requires a
  **new `EmailType`** (e.g. `payment_failed`) added to the enum
  (`notifications.ts:257-271`) plus a template — this is not pure reuse (review
  finding MED-4). The handler must escalate (metric/Inngest event) on every
  delivery failure reason (`no_push_token`, `daily_cap_exceeded`,
  `push_disabled`, `no_api_key`) — no silent recovery (review finding MED-7).
  Tests prove the current observe-only behavior fails and the new handler sends
  one deduped alert. Covers `billing-3`.

- [ ] **T2: Surface past-due state outside the subscription screen.** Done when:
  home/account/subscription entry points show a concise past-due banner for
  owners with `status='past_due'`, the CTA opens the existing manage-billing
  path, and dismissing the banner does not hide future distinct billing issues.
  Mobile tests cover owner-visible and child-hidden states.

- [ ] **T3: Add real parent push/email fan-out for child-cap notifications.**
  Done when: both manual `/notifications/child-cap/notify-parent`
  (`apps/api/src/routes/notifications.ts:71-94`) and automatic
  `app/billing.profile_quota.exhausted`
  (`apps/api/src/inngest/functions/notify-parent-child-cap-hit.ts`) paths write
  the existing DB row and **then push only when the insert actually occurred**
  — both record helpers return `{inserted: boolean}`
  (`apps/api/src/services/child-cap-notifications.ts:89-114,193-201`); push must
  be gated on `inserted === true` to avoid re-pushing duplicates (review finding
  HIGH-4). Note the existing dedup key is `(ownerProfileId, childProfileId,
  kind, occurredOn)` where `occurredOn` is the **calendar day**, NOT the quota
  window — so a `monthly_exceeded` child would otherwise re-alert daily for
  weeks. This task changes the dedup window for the **push channel** to the
  quota-reset window (`resetsAt`) so the parent is pushed at most once per
  exhaustion episode (review finding HIGH-4). The child UI's "sent" state must
  reflect what actually happened: today the route returns `{sent:true}` meaning
  *row recorded*, not *push delivered* — `sendPushNotification` can return
  `{sent:false, reason:'no_push_token'|'daily_cap_exceeded'|'push_disabled'}`
  with the row still inserted. Define "sent" = "owner alert recorded" and do not
  claim delivery the server cannot confirm (review finding MED-1). Child-cap
  push respects `respectPushPreference` (review finding MED-3). Tests cover
  manual, automatic, duplicate (same day → no second push), monthly-window
  re-hit (→ no second push within the window), and no-parent/no-token paths.
  Covers `notif-3`.

- [ ] **T4: Add child-allocated top-up capacity for Plus owners.** Depends on
  T0 and on the HIGH-1 precondition. Done when:
  - A **new owner-only allocation write** (not `purchaseTopUpCredits`, which
    forces `profileId` to the owner and returns `null` for a non-owner target —
    `top-up.ts:128-142`) lets an owner mark purchased credits as available to a
    specific same-account child profile, using the T0 data model.
  - A **new child-consumption branch in metering** replaces the
    `{success:false, source:'none'}` fall-through (`metering.ts:811-824`) so a
    `role==='child'` profile draws down its allocated credits.
    `consumeOwnerTopUpCredit`'s owner gate (`metering.ts:796-808`) is left
    intact; this is an additional, parallel child path. The decision on whether
    allocated credits cover **daily** exhaustion as well as **monthly** (current
    owner consumption is monthly-only) is recorded here (review finding HIGH-2).
  - The child decrement uses the same **atomic guarded `UPDATE … WHERE remaining
    >= cost`** pattern as the owner path, so concurrent metering does not throw
    the `top_up_credits_remaining_non_negative` check constraint
    (`billing.ts:215-253`) into a 500; on contention it falls back cleanly
    (review finding MED-6).
  - Owner-only top-ups continue to work; unauthorized child-initiated allocation
    and cross-account allocation are denied with typed 403/404. This is a
    data-integrity boundary, so per the repo's Fix Development Rules T4 includes
    a **red-green break test**: write the negative-path test (non-owner /
    cross-account allocation), watch it pass, revert the guard, watch it fail,
    restore (review finding MED-5).
  - Tests cover allocation, child consumption, daily-vs-monthly behavior as
    decided, depletion, atomic-race fallback, and cross-profile/cross-account
    denial. Covers `billing-4`.

- [ ] **T5: Wire parent action from the child-cap banner.** Depends on T4 and
  the HIGH-1 precondition. Done when: the `ParentHomeScreen` child-cap
  notification banner — today a dismiss-only `Pressable`
  (`apps/mobile/src/components/home/ParentHomeScreen.tsx:108-174`) — offers a
  primary action to grant capacity (allocate top-up or upgrade) in addition to
  dismiss; the child paywall (`ChildPaywall.tsx`, today only an "Ask Parent"
  notify action — `_subscription/_components/ChildPaywall.tsx:127-200`) can
  refresh and show capacity restored after the parent acts; tests cover the
  notification-to-action loop. Note: "capacity restored" is only observable to
  the child once the HIGH-1 precondition holds (the child can actually complete
  a learning write); until then the refresh shows credits but writes still 403.

- [ ] **T6: Add recovery-state observability.** Done when:
  structured metrics or events record billing-alert sent/failed, child-cap
  parent-alert sent/failed, and child-credit allocation consumed. "Failed" is
  not a single boolean — record the specific `sendPushNotification` /
  `sendEmail` reason (`no_push_token`, `daily_cap_exceeded`, `push_disabled`,
  `no_api_key`, `log_write_failed`) so each failure mode is queryable. Per the
  repo rule banning silent recovery in billing/webhook code, every catch/fallback
  on these paths emits a metric or Inngest event — `console.warn` alone is
  insufficient (review findings MED-7, MED-2).

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Payment failed but no push token | `app/payment.failed` with no token | In-app banner and email attempt | Open app or email link to manage billing |
| Payment alert delivery provider fails | Push/email service error | Sentry/metric, in-app banner still persists | Retry through Inngest/backoff |
| Child asks parent repeatedly | Multiple cap hits in same quota window | One parent push per exhaustion episode (push deduped on the `resetsAt` window, not per calendar day) | New push fires when the quota window resets |
| Push dropped by daily cap | `MAX_DAILY_PUSH=3` already hit by other nudges | In-app row still recorded; push returns `daily_cap_exceeded` | Billing alert passes `skipDailyCap`; child-cap drop is logged as a metric and the in-app row remains |
| Parent has no actionable purchase path | Store/top-up unavailable | Upgrade/manage plan CTA only | Use existing Family upgrade path |
| Child-credit allocation races metering | Parent allocates while child retries | Atomic guarded `UPDATE … WHERE remaining >= cost` prevents negative credits and constraint-violation 500s | On lost race, metering falls back cleanly to the next source / paywall, no 500 |
| Child has credits but write 403s | HIGH-1 precondition (`learn-1`) unresolved | Credits visible but learning write blocked | Resolve `learn-1` before shipping T4/T5 (see Dependency section) |
| Unauthorized allocation | Non-owner or unrelated profile | Typed 403/404 | Switch to owner profile |

## Verification

Focused checks:

```powershell
pnpm exec nx run api:test --testPathPattern="payment-failed|child-cap|billing|metering|top-up"
Push-Location apps/mobile
pnpm exec jest --findRelatedTests src/app/(app)/subscription.tsx src/app/(app)/_subscription/_components/ChildPaywall.tsx src/components/home/ParentHomeScreen.tsx --no-coverage
pnpm exec tsc --noEmit
Pop-Location
```

Because this touches billing and API behavior, run before commit:

```powershell
pnpm exec nx run api:typecheck
pnpm exec nx test:integration api
```

## Rollback

Scope of destructive change: only T0, and only under option (a) (adding
`allocated_to_profile_id` to `top_up_credits`). Options for T0:

- **(a) Add nullable `allocated_to_profile_id` column.** Rollback IS possible:
  the column is additive and nullable, so dropping it loses only the
  child-allocation linkage, not the credit packs themselves (`amount`,
  `remaining`, `profileId`=owner are untouched). Recovery: drop-column migration;
  any in-flight child allocations revert to owner-pool credits (no credit value
  destroyed). Because the down-migration drops a column, the rollback path must
  ship with the forward migration and be tested on dev before staging.
- **(b) Reassign `profileId` to the child (no new column).** Rollback is
  **lossy**: once `profileId` is overwritten from owner→child, the original
  "this was the owner's pool" association is gone unless captured in an audit
  log. If (b) is chosen, T0 MUST also write an allocation audit row so the
  reassignment is reversible; otherwise rollback is not possible and the owner
  association is permanently lost. Option (a) is therefore preferred.

No tables or types are dropped by this plan. RevenueCat products and the
`subscriptions` table are untouched.

## Review Findings Addressed

This plan was adversarially reviewed against current code on 2026-05-31. Findings
folded in:

- **HIGH-1** — T3/T4/T5 premise vs. audit `learn-1`: added the Dependency /
  Precondition section and a Failure-Modes row; T4/T5 marked blocked on it.
- **HIGH-2** — top-up owner-lock at three layers: rewrote the Product Decision
  and T4 to require a new allocation write + new child-consumption branch +
  daily/monthly decision.
- **HIGH-3** — missing migration/rollback: added T0 and this `## Rollback`
  section.
- **HIGH-4** — dedup is per-calendar-day not per-quota-window: T3 now gates push
  on `inserted===true` and moves the push dedup window to `resetsAt`;
  Failure-Modes row corrected.
- **MED-1** — honest "sent" semantics in T3.
- **MED-2** — `MAX_DAILY_PUSH` contention: `skipDailyCap` for billing alerts;
  drop recorded (T1/T6, Failure Modes).
- **MED-3** — `respectPushPreference` decision recorded in T1/T3.
- **MED-4** — new `payment_failed` `EmailType` + template noted in T1/Scope.
- **MED-5** — red-green break test mandated in T4.
- **MED-6** — atomic guarded decrement for the child path (T4, Failure Modes).
- **MED-7** — silent-recovery ban / per-reason metrics in T1/T6.
- **LOW-1** — Scope now marks which artifacts are new vs. existing.

