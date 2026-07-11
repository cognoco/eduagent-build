---
title: Billing Recovery and Learner Capacity - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audits/2026-05-31-logical-gap-audit.md
status: partially-implemented
gap_ids: [billing-3, billing-4, notif-3]
---

# Billing Recovery and Learner Capacity - Implementation Plan

> **STATUS (2026-07-11): PARTIALLY IMPLEMENTED.** T1/T2 shipped in
> [PR #2039](https://github.com/cognoco/eduagent-build/pull/2039)
> ([squash commit `9e6cc091f`](https://github.com/cognoco/eduagent-build/commit/9e6cc091ff7f01b52e69200462d2f2524426be78)).
> **Only T0 and T3-T6 remain PARKED** pending the identity/backend rework; this
> document does not authorize implementing those tasks.

**Classification detail** (the old "Classification pending" note is resolved;
see re-triage in `_wip/identity-foundation/_research/drift-map.md:315,470`):

- **T1 + T2 (gap `billing-3`: payment-failed notice + past-due banner)** =
  **non-identity slice, now implemented.** It is keyed on the paying
  account/subscription, not the `isOwner` gate.
- **T3 + T4 + T5 (gaps `billing-4`, `notif-3`, `learn-1`)** = **FOLDED into the
  identity rewrite.** Owner→child top-up allocation is built on the `owner`
  primitive the cut dissolves + conflicts with org-pool quota intent, and is
  **hard-blocked on `learn-1`** (non-owner child 403s every learning write).

**Reviewed:** an end-user adversarial pass (2026-06-08) folded 8 findings into
this doc (EU-HIGH-1..3, EU-MED-1..5 — see "Review Findings Addressed" at the
bottom). EU-MED-4/-5 apply to the implemented T1/T2 slice; the rest ride with
the folded half. **Don't redo this review — extend it.**

**Next step for the parked work:** re-plan T0 and T3-T6 after the
identity/backend rework lands; do not reopen the implemented T1/T2 slice.

**Goal:** Make paid-access failures and child-cap exhaustion recoverable before
users silently lose access or get stuck waiting for a parent who was never
actually alerted.

**Approach:** Treat `billing-3`, `billing-4`, and `notif-3` as one recovery
plane. RevenueCat billing issues need proactive in-app/push/email notification
with a manage-billing path. Child quota exhaustion needs a real out-of-app
parent alert and an owner action that grants capacity without forcing every
single-child Plus family into the full Family tier.

## Implemented Decision — T1/T2 Payment-Failure Recovery

This section is the durable specification for the T1/T2 slice absorbed by
**WI-1780 (Billing-failure UX: payment-failed notification + past-due banner)**.
It records the behavior that landed in PR #2039; the older task text below is
retained as historical planning context for the still-parked bundle. This
implements [MMT-ADR-0004](../adr/MMT-ADR-0004-mobile-iap-revenuecat-stripe-dormant.md)'s
requirement that mobile grace periods come from platform entitlement state,
not a fixed application-owned window.

### NowCard type and priority

- A payment failure creates a durable `billing_alert` row, deduplicated by the
  source event ID. Only the insert winner fans out push and email
  (`apps/api/src/services/billing/payment-failed-alert.ts:14-38`,
  `apps/api/src/inngest/functions/payment-failed-observe.ts:72-94`).
- The V2 Mentor feed exposes the newest alert as a `billing_alert` NowCard only
  while its canonical subscription is `past_due`, only in the payer's self
  scope, and removes it after recovery. The candidate includes the effective
  access state, subscription-period deadline, and the full
  More → Account → Subscription chain
  (`apps/api/src/services/now-feed.ts:545-603`).
- `billing_alert` has absolute feed priority `-1`; lower numbers sort first, so
  it precedes unfinished-session priority `0` and every learning candidate.
  This is deliberate: payment recovery must not be displaced by study work
  (`apps/api/src/services/now-feed.ts:63-73,143-165,204-224`). The mobile
  `useNowFeed` hook requests this server-ranked self-feed for the active profile
  (`apps/mobile/src/hooks/use-now-feed.ts:30-58`).
- At most one billing card is returned: alerts are ordered by occurrence time
  and ID descending, then limited to one
  (`apps/api/src/services/now-feed.ts:545-570`).

### User-visible behavior

- **Push:** the payer receives “Payment needs attention” / “Update your payment
  method to restore your MentoMate plan.” The transactional push bypasses the
  engagement daily cap and push-preference check, and carries the canonical
  payer person ID for safe routing
  (`apps/api/src/inngest/functions/payment-failed-observe.ts:110-127`).
- **Email:** the payer receives “Action needed: update your MentoMate payment,”
  an explanation that the latest payment failed, and a Manage Billing deep link
  (`apps/api/src/services/notifications/email.ts:302-314`,
  `apps/api/src/inngest/functions/payment-failed-observe.ts:152-172`).
- **NowCard:** V2 Mentor shows “Payment needs attention” with a “Manage billing”
  CTA. While paid access remains current, it states the period-end deadline;
  if no valid deadline is available it truthfully says access is still active.
  If access has fallen back, it says the account is using free access and that
  updating payment restores the plan
  (`apps/mobile/src/i18n/locales/en.json:3006-3012`,
  `apps/mobile/src/components/mentor/NowCard.tsx:108-149`).
- **Dismissal and recovery:** an active billing card has no Complete or Dismiss
  control and ignores locally dismissed keys. It remains until the subscription
  leaves `past_due`, at which point the server stops returning it
  (`apps/mobile/src/components/mentor/NowCard.tsx:166-194`,
  `apps/mobile/src/components/mentor/NowCardStack.tsx:82-92`,
  `apps/api/src/services/now-feed.ts:557-566`).
- **Manage Billing:** the in-app CTA pushes More → Account → Subscription
  (`apps/mobile/src/lib/now-deep-link.ts:25-27,72-83`). Push/email taps first use
  the payer-aware landing route. It validates the canonical payer, switches
  from a child profile when necessary, re-checks billing capability, then seeds
  the same full ancestor chain; unavailable, tampered, or failed switches go to
  profile selection (`apps/mobile/src/lib/notification-tap-navigation.ts:49-57`,
  `apps/mobile/src/app/(app)/billing/manage.tsx:11-78`).

### Acceptance criteria and evidence

| Criterion | Landed behavior | Committed evidence |
|---|---|---|
| Absorbed T1 AC1 — payer push + new `payment_failed` email + in-app row + owner-gated full-chain link | The handler persists first, resolves `subscription.payerPersonId`, sends both typed channels, and routes through the payer-aware landing or the in-app full chain. | `apps/api/src/inngest/functions/payment-failed-observe.test.ts:114-153`; `apps/api/src/services/notifications/email.test.ts:29-44`; `apps/mobile/src/app/(app)/billing/manage.test.tsx:60-123`; `apps/mobile/src/lib/now-deep-link.test.ts:122-139` |
| Absorbed T1 AC2 — `skipDailyCap`; no silent delivery failure | Push uses `skipDailyCap: true` and `bypassPreferenceCheck: true`. Push/email outcomes are persisted, and every failed channel emits the PII-free `app/billing.alert_delivery_failed` event. | `apps/api/src/inngest/functions/payment-failed-observe.ts:110-150,174-205`; `apps/api/src/inngest/functions/payment-failed-observe.test.ts:155-205,247-281` |
| Absorbed T1 AC3 — red/green regression and one deduped alert/fan-out | The source-event unique insert is the fan-out gate. Unit and real-database tests prove a losing invocation sends neither channel, concurrent inserts yield one row, and two handler invocations produce one push and one email. | `apps/api/src/inngest/functions/payment-failed-observe.test.ts:207-242`; `apps/api/src/services/billing/payment-failed-alert.integration.test.ts:168-189,284-329`; `apps/api/drizzle/0137_workable_greymalkin.sql:20-21` |
| Absorbed T2 AC1 — record NowCard type and priority in `useNowFeed` | `billing_alert` is a shared NowCard kind and server-ranked at `-1`, ahead of every learning card; `useNowFeed` consumes that self feed. | This Implemented Decision; `packages/schemas/src/now-feed.ts:3-9`; `apps/api/src/services/now-feed.ts:63-73,143-165`; `apps/api/src/services/now-feed.test.ts:40-50`; `apps/mobile/src/hooks/use-now-feed.ts:30-58` |
| Absorbed T2 AC2 — payer sees past-due deadline/access state and Manage Billing CTA | The latest active alert supplies `deadlineAt`, `accessState`, and the billing chain; the card renders current-access/deadline or free-fallback copy plus the CTA. | `apps/api/src/services/now-feed.ts:545-603`; `apps/mobile/src/components/mentor/NowCard.tsx:108-164`; `apps/mobile/src/components/mentor/NowCardStack.test.tsx:188-240` |
| Absorbed T2 AC3 — active state cannot be permanently hidden | Billing cards bypass local-dismiss filtering and render neither Dismiss nor Complete; resolving `past_due` removes the card server-side. | `apps/mobile/src/components/mentor/NowCardStack.tsx:82-92`; `apps/mobile/src/components/mentor/NowCardStack.test.tsx:160-185`; `apps/api/src/services/billing/payment-failed-alert.integration.test.ts:248-283` |
| Absorbed T2 AC4 — non-payers never see the billing card | The query is pinned to `subscription.payerPersonId`; the real-database test proves the child self feed has no billing alert. | `apps/api/src/services/now-feed.ts:545-566`; `apps/api/src/services/billing/payment-failed-alert.integration.test.ts:248-283` |
| Whole-bundle AC — one deduped payer push/email/in-app recovery moment, working owner-safe link, V2 past-due card until resolved | The T1/T2 behaviors above execute from the same durable alert. The integration suite proves one fan-out per source event, payer-only highest-priority presentation, and disappearance after recovery; navigation tests prove the full owner-safe chain. | `apps/api/src/services/billing/payment-failed-alert.integration.test.ts:168-189,248-329`; `apps/mobile/src/app/(app)/billing/manage.test.tsx:60-123`; [PR #2039](https://github.com/cognoco/eduagent-build/pull/2039), [commit `9e6cc091f`](https://github.com/cognoco/eduagent-build/commit/9e6cc091ff7f01b52e69200462d2f2524426be78) |

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
> template (T1), a child-directed "capacity restored" push (T4, review finding
> EU-HIGH-2), reworded child-paywall "sent" i18n copy (T3, review finding
> EU-HIGH-3), the owner-gated manage-billing deep-link landing logic (T1, review
> finding EU-MED-4), and the corresponding tests (review finding LOW-1).

Out of scope:
- Replacing RevenueCat or changing store products.
- Identity/org billing migration from account to organization; that is T4 of
  the identity redesign.
- Price packaging decisions for new paid SKUs beyond enabling the product path.
- **Solo-owner (no children) Plus self-cap exhaustion UX** — what a solo learner
  on Plus sees and how they recover when they hit their own 700/month cap
  mid-session. This plan covers owner *payment failure* and *child*-cap → parent,
  but the largest paying segment's own-exhaustion moment is not addressed here.
  Flagged so it is not mistaken as covered by `billing-4`; needs a separate
  tracked gap before launch (review finding EU-MED-2).

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
  billing-alert row, and includes a manage-billing deep link. The deep link
  pushes the **full ancestor chain** to the manage-billing screen (not a 1-deep
  push to the leaf — a bare cross-stack push synthesizes a stack whose
  `router.back()` falls through to Home; see the repo router guardrail), and its
  destination is **owner-gated**: a recipient who taps the push/email link while
  logged out routes to sign-in with a return-to that resumes at manage-billing,
  and a recipient on a non-owner active profile (multi-profile family device) is
  routed to switch to the owner profile rather than dead-ending on a blank or
  back-to-Home screen (review finding EU-MED-4). Because billing
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
  The banner copy states the **grace deadline / next retry date** carried on the
  RevenueCat event ("Fix your payment by {date} to keep Plus") and the **current
  access state** (still-Plus-in-grace vs. already-downgraded) so the user knows
  how long they have and whether access is already lost — the plan's "before
  users silently lose access" goal is not met by a deadline-less banner (review
  finding EU-MED-5). Where the past-due banner can render alongside the child-cap
  banner (T5) on `ParentHomeScreen`, **precedence is defined**: payment-failed
  outranks child-cap, at most one billing banner and one capacity banner show at
  once, and additional same-class alerts collapse to a "+N more" affordance
  rather than stacking unboundedly (review finding EU-MED-3).
  Mobile tests cover owner-visible and child-hidden states, the
  deadline/access-state copy, and the past-due-plus-child-cap precedence.

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
  push respects `respectPushPreference` (review finding MED-3).
  The child-cap parent push passes **`skipDailyCap`** (same as the T1 billing
  alert), because "your child can't study" is at least as actionable to a parent
  as a billing alert and must not be the push silently dropped when `MAX_DAILY_PUSH=3`
  is already spent on engagement nudges — the plan's whole premise is a parent
  "who was never actually alerted," and letting the daily cap eat this push
  recreates exactly that (review finding EU-HIGH-1). This **reverses** the prior
  Failure-Modes assumption that the child-cap drop is merely logged; the drop
  path now only applies when the parent has push fully disabled
  (`respectPushPreference`), not when a generic nudge cap is hit.
  The **child-facing copy** is corrected to match the honest server semantics:
  the `subscription.childPaywall.alerts.quotaSentBody` / `sentBody` strings
  (shown at `ChildPaywall.tsx:134-146,176-179`) are reworded from a
  delivery-confirmed promise ("Your parent has been notified") to a
  records-an-ask framing ("We've let your parent know") so the child is not told
  a human was reached when only an inbox row was written and the push may have
  been suppressed; the affected i18n keys are listed as in-scope artifacts
  (review finding EU-HIGH-3). Tests cover
  manual, automatic, duplicate (same day → no second push), monthly-window
  re-hit (→ no second push within the window), no-parent/no-token paths, that
  the child-cap push is **not** dropped by the daily nudge cap, and the corrected
  child-facing copy. Covers `notif-3`.

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
  - On successful allocation the server sends a **child-directed push** to the
    child profile ("More questions unlocked — tap to keep going") so the loop
    closes back to the person who was actually blocked. Today the alerting is
    one-way: the parent gets push + email + in-app banner, while the child sits
    on the paywall's cooldown countdown (`ChildPaywall.tsx:120,275-297`) with no
    signal that the wait is over, and cannot even query child-cap notifications
    (`use-child-cap-notifications.ts:49` gates the query to `role==='owner'`).
    Pull-to-refresh alone forces the child to guess when to return; the
    allocation push removes the guess (review finding EU-HIGH-2). This push also
    passes `skipDailyCap` for the same actionability reason as EU-HIGH-1.
  - Tests cover allocation, child consumption, daily-vs-monthly behavior as
    decided, depletion, atomic-race fallback, cross-profile/cross-account
    denial, and that a successful allocation emits the child-directed "capacity
    restored" push. Covers `billing-4`.

- [ ] **T5: Wire parent action from the child-cap banner.** Depends on T4 and
  the HIGH-1 precondition. Done when: the `ParentHomeScreen` child-cap
  notification banner — today a dismiss-only `Pressable`
  (`apps/mobile/src/components/home/ParentHomeScreen.tsx:108-174`) — offers a
  primary action to grant capacity in addition to dismiss. That action resolves
  to **one of two explicit states**, never the ambiguous "allocate top-up or
  upgrade" — because allocating already-purchased credits is free while buying
  more is a charge, and the parent must know which (review finding EU-MED-1):
  (a) parent **has** unallocated top-up credits → "Allocate N questions to
  {child}" (no charge, shows the count being moved); (b) parent has **no**
  credits → "Get more questions" routing into the purchase flow with price
  disclosure. There is no silent no-op path: a parent who wants to help but has
  nothing to allocate is taken to a purchasable option, not a dead button.
  The banner ordering vs. the T2 past-due banner follows the precedence defined
  in T2 (review finding EU-MED-3);
  the child paywall (`ChildPaywall.tsx`, today only an "Ask Parent"
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
| Actionable push vs. daily nudge cap | `MAX_DAILY_PUSH=3` already spent on engagement nudges | Both billing-failure and child-cap pushes still deliver — both pass `skipDailyCap` (EU-HIGH-1); only engagement nudges are subject to the cap | In-app row also recorded as backstop; a push is only suppressed when the parent has push fully disabled via `respectPushPreference` |
| Child blocked, asks parent, then parent grants | Parent allocates/buys capacity after the child's "Ask Parent" | Child receives a "capacity restored" push and resumes — does not have to guess when to pull-to-refresh (EU-HIGH-2) | Tap the push to return; if push disabled, paywall refresh still reflects restored credits |
| Parent wants to help but has no credits | "Grant capacity" tapped with zero unallocated top-up credits | "Get more questions" → purchase flow with price disclosure, not a dead/no-op button (EU-MED-1) | Buy a top-up (then allocate) or use the Family upgrade path |
| Child-credit allocation races metering | Parent allocates while child retries | Atomic guarded `UPDATE … WHERE remaining >= cost` prevents negative credits and constraint-violation 500s | On lost race, metering falls back cleanly to the next source / paywall, no 500 |
| Payment failed, user unsure if access is gone | `status='past_due'` | Banner shows the grace deadline / next-retry date and whether access is still active or already downgraded (EU-MED-5) | Fix payment before the stated deadline via manage-billing |
| Billing deep link opened logged-out / wrong profile | Owner taps push/email link on a logged-out or non-owner-active device | Routed to sign-in (return-to manage-billing) or to switch to the owner profile — not a blank screen or back-to-Home (EU-MED-4) | Sign in / switch profile, then land on manage-billing |
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

A second adversarial pass on 2026-06-08 reviewed the plan from the **end-user
perspective** (the experience loop, not server correctness) against the real
mobile surfaces (`ChildPaywall.tsx`, `ParentHomeScreen.tsx`,
`use-child-cap-notifications.ts`). Findings folded in:

- **EU-HIGH-1** — child-cap parent push was the *droppable* one under
  `MAX_DAILY_PUSH` while engagement nudges were not; T3 now passes `skipDailyCap`
  for the actionable child-cap push and the Failure-Modes daily-cap row is
  rewritten. **Reverses** the prior "child-cap drop is logged as a metric"
  decision.
- **EU-HIGH-2** — alerting was one-way (rich to the parent, silent to the child);
  T4 now sends a child-directed "capacity restored" push and a Failure-Modes row
  closes the loop.
- **EU-HIGH-3** — the child read a delivery-confirmed "Parent notified" toast
  when only an inbox row was written; T3 rewords the `quotaSentBody`/`sentBody`
  i18n copy to records-an-ask framing and lists the keys as in-scope artifacts.
- **EU-MED-1** — "grant capacity (allocate or upgrade)" conflated a free
  allocation with a charge and had a silent no-credits dead-end; T5 splits it
  into two explicit states with price disclosure and no dead button.
- **EU-MED-2** — solo-owner (no children) Plus self-cap exhaustion UX is
  explicitly marked out of scope and flagged for a separate tracked gap.
- **EU-MED-3** — past-due (T2) and child-cap (T5) banner precedence/stacking on
  `ParentHomeScreen` is now defined (payment-failed outranks child-cap; "+N more"
  collapse).
- **EU-MED-4** — manage-billing deep link now specifies full-ancestor-chain push,
  owner-gating, and logged-out / wrong-profile landing; Failure-Modes row added.
- **EU-MED-5** — past-due banner now states the grace deadline / next-retry date
  and current access state; Failure-Modes row added.
