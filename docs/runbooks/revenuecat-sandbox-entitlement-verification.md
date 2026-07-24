# RevenueCat Sandbox Entitlement Verification

This runbook is the operator-gated post-landing proof for **WI-1328
(RevenueCat production monetization setup)**. The code path is delivered by
**WI-2705 (bounded RevenueCat sandbox-to-entitlement verification path)**.

It does not authorize a deploy, production secret change, live purchase,
credential rotation, or production-data mutation by itself. Start only when
the WI-1328 operator has the required Google Play, RevenueCat, Doppler,
Cloudflare, and production read access.

RevenueCat retries reuse the same event ID and event timestamp. Google Play
subscription webhook product IDs use
`<subscription_id>:<base_plan_id>`. The event's `app_id` is RevenueCat's public
dashboard-app identifier. These fields are the authorization boundary; do not
substitute display names or package names.

## Invariants

- The production worker binding
  `REVENUECAT_SANDBOX_VERIFICATION_AUTHORIZATION` is absent normally.
- The first delivery of every sandbox event is denied with
  `reason=sandbox_in_production`; use its RevenueCat dashboard payload to build
  the authorization. Never pre-authorize a guessed event.
- One strict JSON binding authorizes exactly one `INITIAL_PURCHASE` or
  `EXPIRATION` event for at most 15 minutes.
- The binding must match event ID, event type, RevenueCat app ID, App User ID,
  qualified Android product/base plan, `NORMAL` period type, `PLAY_STORE`, and
  transaction ID.
- Authorization is server-side. No request header, query parameter, or body
  token can widen it.
- A matching replay still passes through the normal account resolution and
  idempotency gate. It must not grant twice.
- Remove the binding before leaving the verification session, including on
  any failure path.
- Do not create a synthetic production identity merely for this proof. Use an
  already approved operator-owned billing verification account. If the
  approved proof design requires a disposable identity instead, obtain
  separate authority and an immediate hard-deletion plan before purchase;
  the normal seven-day deletion grace period is not sufficient cleanup for
  this run.

## Authorization Shape

All values come verbatim from the initially denied RevenueCat payload. Times
are epoch milliseconds.

```json
{
  "version": 1,
  "authorizationId": "WI-1328-INITIAL_PURCHASE-YYYYMMDDTHHMMSSZ",
  "issuedAtMs": 0,
  "expiresAtMs": 0,
  "eventId": "RevenueCat event.id",
  "eventType": "INITIAL_PURCHASE",
  "appId": "RevenueCat event.app_id",
  "appUserId": "RevenueCat event.app_user_id",
  "productId": "com.eduagent.plus.monthly.android:monthly",
  "periodType": "NORMAL",
  "store": "PLAY_STORE",
  "transactionId": "RevenueCat event.transaction_id"
}
```

`eventType` is only `INITIAL_PURCHASE` for the grant proof or `EXPIRATION` for
cleanup. `periodType` must be `NORMAL`. `expiresAtMs - issuedAtMs` must be
positive and no more than `900000`. The worker denies an authorization before
`issuedAtMs` and at or after `expiresAtMs`. Unknown or unqualified products,
including a wrong base plan, fail parsing.

Do not paste the JSON into a PR, Work Item comment, chat, or logs: it contains
the App User ID. Store it only in the approved production secret manager.

## Phase 0 — Preconditions and Baseline

1. Confirm the WI-2705 PR is landed and its exact commit is deployed.
2. Confirm production has
   `REVENUECAT_SANDBOX_VERIFICATION_AUTHORIZATION` absent.
3. Select the approved operator-owned adult-owner account and record, in the
   restricted evidence location:
   - Clerk user ID and RevenueCat App User ID;
   - organization and subscription IDs;
   - `subscription.plan_tier`, `status`, `store_product_id`,
     `store_platform`, `last_revenuecat_event_id`, and
     `last_revenuecat_event_timestamp_ms`;
   - the quota-pool limits and counters;
   - the RevenueCat entitlement state.
4. The baseline must be free/expired and hold no production paid entitlement.
   Stop if it is not; this runbook must not overwrite a real subscription.
5. Confirm the Google product is one of the six qualified identifiers already
   mapped in `apps/api/src/services/billing/revenuecat-shared.ts`, the store is
   `PLAY_STORE`, and the expected base-plan suffix matches the Play Console
   configuration.

## Phase 1 — Initial Purchase Proof

1. Complete the controlled Google Play sandbox purchase.
2. Confirm the first production webhook response is:

   ```json
   {
     "received": true,
     "skipped": true,
     "reason": "sandbox_in_production"
   }
   ```

3. In RevenueCat, open that exact `INITIAL_PURCHASE` payload. Require all bound
   fields in the authorization shape to be present. Stop on a missing
   `app_id`, `transaction_id`, qualified product/base plan, or unexpected
   period/store/event/environment.
4. Create the exact authorization with a fresh ID and a window no longer than
   15 minutes. Add it to the production Doppler config through the approved
   secret-sync/deploy procedure.
5. Re-read the active worker configuration without printing the value. Confirm
   only that the binding is present.
6. Resend the exact RevenueCat event.
7. Capture restricted evidence that:
   - the structured accepted log names the authorization ID, event ID, app ID,
     product, and store but not the App User ID or transaction ID;
   - account resolution and normal idempotency ran;
   - the canonical subscription is `active` at the mapped paid tier;
   - `store_product_id` is the qualified product/base-plan ID;
   - quota limits match the mapped tier;
   - the application entitlement/paid capability is visible for the selected
     account.
8. Resend the same event once more. Verify the idempotency response is
   `{ "received": true, "skipped": true }` and no tier, quota, or entitlement
   value changes a second time.
9. Remove the authorization binding immediately and sync/deploy the removal.
10. Resend the purchase event after removal. Require
    `reason=sandbox_in_production` and no billing mutation.

## Phase 2 — Entitlement Cleanup

1. Cancel the sandbox subscription in Google Play and wait for RevenueCat's
   `EXPIRATION` event. A `CANCELLATION` event alone is not cleanup: normal
   cancellation can leave access active until period end.
2. Confirm the first `EXPIRATION` delivery is denied before mutation.
3. Require `period_type` to be `NORMAL`. Stop if it is `TRIAL`; the production
   handler intentionally transitions trial expiration into the extended trial
   rather than free/expired.
4. Build a new authorization from the exact denied expiration payload:
   - new `authorizationId`;
   - `eventType: "EXPIRATION"`;
   - exact expiration event ID;
   - the same app/user/product/`NORMAL` period/store/transaction boundary;
   - a fresh window no longer than 15 minutes.
5. Add/sync the binding, resend that exact expiration once, and verify:
   - `subscription.plan_tier = 'free'`;
   - `subscription.status = 'expired'`;
   - quota limits match the free tier;
   - cached and direct entitlement reads no longer grant paid access;
   - the expiration event ID/timestamp is the canonical idempotency watermark.
6. Replay the expiration once and verify it grants/revokes nothing twice.
7. Remove/sync the binding immediately.
8. Resend the expiration after removal and require
   `reason=sandbox_in_production` before mutation.
9. Compare the final account/subscription/quota state with the Phase-0
   baseline. There must be no paid test entitlement or newly created identity.

## Failure and Abort Procedure

At any error—handler 500, failed deploy, missing field, unexpected account,
wrong product/base plan, or inconclusive database evidence:

1. Remove `REVENUECAT_SANDBOX_VERIFICATION_AUTHORIZATION` first and verify the
   active worker no longer has it.
2. Resend the observed event once and require
   `reason=sandbox_in_production`. This proves the reusable authorization is
   gone before cleanup continues.
3. Inspect the canonical subscription and quota rows. The webhook handlers use
   atomic subscription/quota writers; never infer rollback from an HTTP 500.
4. If a paid entitlement exists, complete Phase 2 with a separately observed
   and exactly authorized `EXPIRATION` event. Do not widen or extend the failed
   purchase authorization.
5. If a disposable identity was exceptionally authorized, execute its
   separately approved immediate hard-deletion procedure and verify login,
   membership, person, organization, subscription, and quota rows are absent.
6. Do not declare the proof complete until the binding is absent, the default
   sandbox guard is re-proven, and the account has no paid test entitlement.

## Evidence Bundle

Record:

- landed and deployed commit SHA;
- RevenueCat event IDs and transaction ID in the restricted evidence store;
- authorization IDs and issued/expiry timestamps, but not the JSON secret;
- initial-denial, accepted, idempotent-replay, expiration-cleanup, and
  post-removal-denial timestamps;
- before/after subscription and quota projections;
- account/identity cleanup result;
- the exact operator who changed and removed the production binding.

The Work Item/PR may link to this bundle but must not copy App User IDs or the
authorization JSON into public or third-party systems.
