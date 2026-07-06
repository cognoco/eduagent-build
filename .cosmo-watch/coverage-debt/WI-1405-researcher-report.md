**WI-1405 — Billing v2 live-path + child-facing + top-up test coverage gaps; Coverage Debt / WS-44; P2 money/quota coverage item; refining target**

**Affected Surfaces**

API live v2 billing is now the active path. `apps/api/src/services/billing/billing-v2/index.ts:4` says the identity-v2 flag is gone and webhooks dispatch to v2 unconditionally; `apps/api/src/services/billing/billing-v2/dispatch.ts:151` maps RevenueCat handlers to v2 and `:168` returns that v2 map. Billing routes import v2 helpers directly in `apps/api/src/routes/billing.ts:36`.

Quota provisioning and hot quota path:
- `apps/api/src/services/billing/billing-v2/quota-provision-v2.ts:43` role resolution from `person × membership × subscription`.
- `apps/api/src/services/billing/billing-v2/quota-provision-v2.ts:78` provisions `profileQuotaUsage`.
- `apps/api/src/services/billing/billing-v2/quota-provision-v2.ts:151` lazy get-or-provision path.
- `apps/api/src/routes/billing.ts:537` `/usage` calls `getOrProvisionProfileQuotaUsageV2`.
- `apps/api/src/middleware/metering.ts:656` live metering DB-miss path calls `getOrProvisionProfileQuotaUsageV2`.
- `apps/api/src/services/billing/metering.ts:220` `decrementQuota` chooses v2 shared-pool vs per-profile behavior; `:511` covers per-profile decrement and child cap event path.

Family billing v2:
- `apps/api/src/services/billing/billing-v2/family-v2.ts:60` subscription lookup.
- `apps/api/src/services/billing/billing-v2/family-v2.ts:73` profile count.
- `apps/api/src/services/billing/billing-v2/family-v2.ts:122` member listing.
- `apps/api/src/services/billing/billing-v2/family-v2.ts:171` add-profile validation/count path.
- `apps/api/src/services/billing/billing-v2/family-v2.ts:211` remove-profile archive/revoke path.
- `apps/api/src/services/billing/billing-v2/family-v2.ts:277` family pool status.
- Routes: `apps/api/src/routes/billing.ts:900`, `:943`, `:998`.

Top-up:
- `apps/api/src/services/billing/billing-v2/top-up-v2.ts:44` `purchaseTopUpCreditsV2`.
- `apps/api/src/services/billing/billing-v2/top-up-v2.ts:67` paid-tier and owner checks.
- `apps/api/src/services/billing/billing-v2/top-up-v2.ts:84` RevenueCat transaction insert/idempotency.

Mobile child-facing quota and top-up:
- `apps/mobile/src/components/session/QuotaExceededCard.tsx:40` card testID; owner branch starts `:51`; child branch starts `:93`.
- `apps/mobile/src/components/session/SessionMessageActions.tsx:81` renders `QuotaExceededCard`.
- `apps/mobile/src/components/session/use-session-streaming.ts:970` handles streamed `QuotaExceededError`.
- `apps/mobile/src/app/(app)/session/index.tsx:523` quota state; `:1508` passes owner gate into message actions; `:1546` disables composer on quota.
- `apps/mobile/src/app/(app)/subscription.tsx:452` top-up handler; `:527` success-to-poll logic; `:1222` top-up UI section.

**Existing Adjacent Coverage**

Real DB API coverage already exists, so “no live quota hot-path real-DB tests” is too broad:
- Shared-pool monthly decrement: `tests/integration/billing-service.integration.test.ts:463`.
- Shared-pool top-up fallback: `tests/integration/billing-service.integration.test.ts:493`.
- Free per-profile daily-exceeded decrement: `tests/integration/billing-service.integration.test.ts:547`.
- Real DB top-up grant/idempotency via `purchaseTopUpCreditsV2`: `tests/integration/billing-service.integration.test.ts:609`.
- RevenueCat activation real rows: `tests/integration/billing-service.integration.test.ts:664`.
- `/v1/usage` real route usage coverage: `tests/integration/billing-lifecycle.integration.test.ts:583`.

Family adjacent coverage is mostly not the v2 service itself:
- Route tests mock v2 family/provision functions in `apps/api/src/routes/billing.test.ts:214`; family route cases start around `:1525` and add/remove around `:1672`.
- Owner IDOR integration checks family endpoint gates only: `tests/integration/account-billing-owner-idor.integration.test.ts:145`.
- Family usage breakdown integration is adjacent but different service: `tests/integration/family-pool-breakdown.integration.test.ts:297`.

Mobile coverage:
- `QuotaExceededCard` child/owner component coverage exists in `apps/mobile/src/components/session/QuotaExceededCard.test.tsx:62`, `:76`, `:115`.
- Stream 402 handling exists in `apps/mobile/src/components/session/use-session-streaming.test.ts:905`.
- Session screen quota card coverage exists in `apps/mobile/src/app/(app)/session/index.test.tsx:2445`.
- Generic poll hook coverage exists in `apps/mobile/src/app/(app)/_subscription/_hooks/use-purchase-confirmation-poll.test.tsx:13`.
- Subscription top-up tests cover error/cancel/duplicate/no-package cases around `apps/mobile/src/app/(app)/subscription.test.tsx:1991`, but not the positive success-to-poll path.

E2E:
- In-chat quota card flow exists at `apps/mobile/e2e/flows/billing/daily-quota-exceeded.yaml:3` and asserts card around `:83`, but it is not clearly child-facing.
- Family pool E2E exists at `apps/mobile/e2e/flows/billing/family-pool.yaml:2`; removal assertions around `:89`.
- Top-up E2E is explicitly a deferred stub because RevenueCat sandbox automation is unavailable: `apps/mobile/e2e/flows/billing/top-up.yaml:3`; allowlisted at `apps/mobile/e2e/launch-legacy-allowlist.txt:24`.

**Confirmed Gaps / Stale Premises**

- Confirmed gap: no direct real-DB integration twin for `quota-provision-v2` role resolution, absent-row provisioning, stale-limit update, and cross-org/missing-membership behavior.
- Confirmed gap: no real-DB integration twin for `family-v2` list/status/add/remove service semantics.
- Stale wording: “family-seat add” is ambiguous. `addProfileToSubscriptionV2` validates an already same-org profile and returns count; it does not create membership or a seat assignment (`family-v2.ts:171`).
- Partly stale: “live quota hot path has no real-DB tests” is overbroad. There is real DB decrement/top-up coverage, but the missing slice is lazy v2 provisioning plus per-profile live route/middleware behavior from an absent row.
- Confirmed gap: mobile top-up positive success-to-poll path is uncovered at the screen level.
- Confirmed gap: child in-chat quota card lacks device-level evidence. Component/unit coverage exists; e2e child-flow evidence does not.

**Draft Acceptance Criteria**

1. Add real-DB `quota-provision-v2` integration coverage for owner and child role resolution, absent `profileQuotaUsage` provisioning, stale-limit update, and no-provision behavior for missing/cross-org membership. Red-green-revert: tests fail if role resolution is changed to legacy/profile-only or insert/update provisioning is removed.

2. Add live quota hot-path coverage for per-profile v2 from an absent quota row, preferably through the route/metering boundary with only external dependencies stubbed. Assert the row is lazy-provisioned and decremented exactly once, and child 402 details do not leak owner top-up availability. Red-green-revert: test fails if `getOrProvisionProfileQuotaUsageV2` is bypassed or per-profile tiers hit shared pool decrement.

3. Add real-DB `family-v2` integration coverage for list, pool status, add validation, and remove/archive/revoke behavior. Cover family/pro happy path, plus/free rejection, over-cap rejection, cross-org rejection, owner-removal rejection, and archived members excluded from count/list. Red-green-revert: tests fail if archived persons remain billable/listed or owner/cross-org removal succeeds.

4. Add mobile child in-chat quota coverage at code level and e2e level. Unit/screen coverage should assert `sessionIsOwner=false` renders child actions, hides upgrade/top-up actions, and disables composer after structured 402. Maestro flow should use a child-profile seed and assert `quota-exceeded-card`, `quota-notify-parent-btn`, `quota-go-home-btn`, and no `quota-upgrade-btn`.

5. Add mobile top-up success-to-poll screen test. Paid tier + top-up package + successful purchase should enter polling UI, refetch usage, confirm only when `topUpCreditsRemaining > baseCredits`, show success alert, and clear in-flight state. Include unconfirmed polling if feasible. Red-green-revert: test fails if polling is skipped or confirmation uses `>= baseCredits`.

6. Keep live RevenueCat purchase e2e separate from code-level claims. A headless executor may add/adjust YAML or seeded confirmed-state tests, but live store purchase + RevenueCat sandbox confirmation must be marked `verify-at-e2e-run`.

**Recommended Execution Path**

Assisted. This touches money, subscriptions, quota provisioning, real DB setup, mobile UI, and Maestro/device evidence. The WI also has stale/ambiguous premises that need human/refiner judgment, especially family “add” semantics and the split between headless code coverage vs live RevenueCat/device verification.

---
**[ BOTTOM LINE ]** `WI-1405` is real, but the refine text should narrow “no real-DB hot-path tests” to the missing v2 lazy-provision/per-profile slices and call out family-add semantics explicitly.

**[ FYI ]**
- Top-up live purchase e2e is already documented as blocked by RevenueCat sandbox automation.
- Child quota card has unit coverage, but not child-specific in-chat Maestro evidence.

**[ ACTIONS ]**
1. Refine with the AC above and split headless implementation from `verify-at-e2e-run` device evidence.
2. Decide whether `family-v2` “add” is intended to only validate same-org existing profiles or should actually create/assign membership before execution starts.