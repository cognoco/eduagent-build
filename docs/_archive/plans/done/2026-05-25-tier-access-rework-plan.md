# Tier Access Rework — Implementation Plan

**Spec:** [`docs/specs/2026-05-25-tier-access-rework.md`](../docs/specs/2026-05-25-tier-access-rework.md)
**Status:** Draft plan v2 (2026-05-25) — adversarial review applied (CRITICAL-1..4, HIGH-1..4, MEDIUM-1..7, LOW-1..2)
**Mode:** Multi-PR sequence — the spec explicitly says this is not a one-PR change.

---

## Context

Today the commercial gate is **feature lock** — Free and Plus cannot add a child profile, so Family Hub (Recaps, nudges, parent dashboard) is invisible to anyone who hasn't already paid. The motion of every Free/Plus user who clicks "Add a child" is a paywall tease that ends at `/subscription`.

The rework inverts this: every tier gets the full Family product experience; tiers differ only in **capacity**. Free gets owner-only 100/mo, 10/day **plus** a child profile capped at 100/mo, 10/day on a separate per-profile pool. Plus extends the owner to 700/mo with no daily cap (child stays on Free-child caps). Family/Pro switch to a shared pool model with 4/6 profiles. The commercial lever moves from "feature lock" to "quota cliff."

Side effects: the dead `premiumModelProfiles` field gets dropped (comment block also corrected — see PR 1 § 1G), per-profile quota tracking requires a new `profile_quota_usage` table (the existing `quota_pools` is unique on `subscription_id` and stays unchanged for Family/Pro), and `top_up_credits` gains a `profile_id` column so Plus owners' top-ups aren't drained by the child profile. Model-tier resolution is **not** centralized in this rework — verification of `resolveExchangeLlmRouting` (spec D3) showed that Plus's advanced-rung premium routing is already correctly wired; a parallel `resolveProfileLlmTier` helper would either be dead overhead or silently regress that behavior.

Hard constraint: the V0 5-tab guardian shape (`MODE_NAV_V0_ENABLED=true, MODE_NAV_V1_ENABLED=false`) must not regress — this rework is orthogonal to the V0/V1 flag matrix.

Product decision update: paid billing problems fall back to **effective Free**, not "no Family Hub." Keep `subscription.tier` as the billing/source-of-truth tier, but drive capacity and feature visibility from `effectiveAccessTier`. Trial/active paid subscriptions, plus cancelled subscriptions still inside their paid access window, use their paid tier. Past-due, expired, or otherwise non-entitled paid subscriptions use effective Free: one child, Free per-profile caps, Family Hub still visible, and a billing recovery banner. A lapsed Plus/Family user must never have less Family Hub visibility than a Free user.

---

## Sequencing (4 PRs)

Per adversarial review CRITICAL-1, the originally proposed PR 2 (`llm-tier-resolve-helper`) is **deleted** — it directly contradicts spec D3, which forbids adding `resolveProfileLlmTier`. The comment-correction step that PR 2 owned is folded into PR 1 § 1G. The remaining PRs are renumbered.

Per user direction, the original server PR 1+2+3 collapse into one PR (config + schema + metering land together — the migration still ships ahead of code in the same deploy, ordering enforced manually in CI). PR 3's parent-notification event dispatch lands atomically with the handler.

| # | PR | Scope | Risk |
|---|----|-------|------|
| 1 | `tier-server-rework` | `TIER_CONFIGS` reshape + effective-access fallback + `profile_quota_usage` table + `top_up_credits.profile_id` migration + per-profile metering branch (with lazy-provision + owner-top-up fallthrough) + tier/status-change handlers + reset-cron extension + 402 payload extension + `subscription.ts` comment correction | High — schema + hot path |
| 2 | `client-tier-paywall-removal` | Drop add-child paywall, extend subscription context with `effectiveAccessTier`/billing fallback state, introduce `isFamilyHubEligible`, swap 5 gating sites | Medium — UX visibility shift + new client billing-state input |
| 3 | `child-quota-ux-notif` | New `child_cap_notifications` table + event dispatch from metering + Inngest handler + new `/notifications` route + parent in-app banner | Medium — touches metering hot path + new UI + new schema |
| 4 | `subscription-copy-i18n` | Rewrite tier comparison + 7-locale key rewrite + nav-contract spec amendment + onboarding discovery hint (placement decision required — see PR 4 Open issues) | Low — copy only, but blocked on a UX decision |

---

## PR 1 — `tier-server-rework`

**Goal:** Land the full server-side rework in one PR: `TIER_CONFIGS` reshape + new `profile_quota_usage` table + `top_up_credits.profile_id` column + effective-access-tier fallback + metering branch on `quotaModel` + tier/status-change handlers + reset-cron extension + 402 payload extension + `subscription.ts` comment correction. Migration ships in the same deploy as code, but **the deploy job must run `drizzle-kit migrate` before the worker rollout** — per CLAUDE.md, "A worker deploy does not migrate Neon." CI workflow already enforces this; PR description must reaffirm the ordering.

**No event dispatch in this PR.** The parent-notification event lands atomically with its handler in PR 3. Avoids orphan events in the queue.

### 1A. `TIER_CONFIGS` shape

**Files:**
- `apps/api/src/services/subscription.ts` — `TierConfig` interface + `TIER_CONFIGS` literal + comment correction (§ 1G)
- `apps/api/src/services/subscription.test.ts` — update assertions

**Changes to `TierConfig` interface (`subscription.ts:15-25`):**
- Remove `premiumModelProfiles: number`
- Add `quotaModel: 'per-profile' | 'shared-pool'`
- Add `ownerMonthlyQuota: number | null`, `ownerDailyQuota: number | null`, `childMonthlyQuota: number | null`, `childDailyQuota: number | null` (null for shared-pool tiers; populated for per-profile tiers)
- **`topUpAmount`/`topUpPrice` stay populated on Plus (owner-only top-ups per user decision).** Top-ups credit the owner's per-profile pool only; child cannot consume them. Enforcement is via the new `top_up_credits.profile_id` column added in § 1E, not the tier config.

**New TIER_CONFIGS (concrete values from spec § Decision):**

```ts
const TIER_CONFIGS: Record<SubscriptionState['tier'], TierConfig> = {
  free: {
    monthlyQuota: 100, dailyLimit: 10, maxProfiles: 2,  // 1 → 2
    llmTier: 'flash',
    quotaModel: 'per-profile',
    ownerMonthlyQuota: 100, ownerDailyQuota: 10,
    childMonthlyQuota: 100, childDailyQuota: 10,
    priceMonthly: 0, priceYearly: 0, topUpPrice: 0, topUpAmount: 0,
  },
  plus: {
    monthlyQuota: 700, dailyLimit: null, maxProfiles: 2,  // 1 → 2
    llmTier: 'standard',
    quotaModel: 'per-profile',
    ownerMonthlyQuota: 700, ownerDailyQuota: null,
    childMonthlyQuota: 100, childDailyQuota: 10,
    priceMonthly: 18.99, priceYearly: 168, topUpPrice: 10, topUpAmount: 500,
  },
  family: {
    monthlyQuota: 1500, dailyLimit: null, maxProfiles: 4,
    llmTier: 'standard',
    quotaModel: 'shared-pool',
    ownerMonthlyQuota: null, ownerDailyQuota: null,
    childMonthlyQuota: null, childDailyQuota: null,
    priceMonthly: 28.99, priceYearly: 252, topUpPrice: 5, topUpAmount: 500,
  },
  pro: {
    monthlyQuota: 3000, dailyLimit: null, maxProfiles: 6,
    llmTier: 'standard',
    quotaModel: 'shared-pool',
    ownerMonthlyQuota: null, ownerDailyQuota: null,
    childMonthlyQuota: null, childDailyQuota: null,
    priceMonthly: 48.99, priceYearly: 432, topUpPrice: 5, topUpAmount: 500,
  },
};
```

The existing `monthlyQuota` / `dailyLimit` fields stay populated as the "shared-pool" view of the tier (used by Family/Pro at runtime; used as backward-compat surface for Free/Plus until PR 2 rewires consumers).

**Test updates (`subscription.test.ts`):**
- Delete the four `expect(config.premiumModelProfiles).toBe(...)` lines (lines 14, 28, 41, 54 per agent map)
- Change `expect(config.maxProfiles).toBe(1)` to `.toBe(2)` for free (line 13) and plus (line 27)
- Add `expect(config.quotaModel).toBe('per-profile')` for free + plus; `.toBe('shared-pool')` for family + pro
- Add assertions for the four per-profile quota fields: Free owner=100/10 + child=100/10; Plus owner=700/null + child=100/10; Family/Pro all null

### 1A.1 Effective access tier fallback

**Files:**
- `apps/api/src/services/subscription.ts` — new helper exported from the billing/subscription barrel
- `apps/api/src/services/billing/metering.ts` — call helper before selecting quota model
- `apps/api/src/services/billing/family.ts` / profile-limit service — call helper before `maxProfiles`
- `apps/api/src/routes/billing.ts` + `packages/schemas/src/billing.ts` — expose `effectiveAccessTier` and `billingAccess` in subscription/status responses
- `apps/api/src/services/billing/subscription-change.ts` — reconcile rows on billing-status changes, not only tier changes

**Decision:** `subscription.tier` remains the billing tier. `effectiveAccessTier` is what the product enforces for capacity and visibility:

```ts
type BillingAccess = 'current' | 'free_fallback';

function resolveEffectiveAccessTier(
  subscription: SubscriptionState,
  now = new Date(),
): { effectiveAccessTier: SubscriptionState['tier']; billingAccess: BillingAccess } {
  if (subscription.tier === 'free') {
    return { effectiveAccessTier: 'free', billingAccess: 'current' };
  }
  if (subscription.status === 'trial' || subscription.status === 'active') {
    return { effectiveAccessTier: subscription.tier, billingAccess: 'current' };
  }
  if (
    subscription.status === 'cancelled' &&
    subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > now
  ) {
    return { effectiveAccessTier: subscription.tier, billingAccess: 'current' };
  }
  return { effectiveAccessTier: 'free', billingAccess: 'free_fallback' };
}
```

Every commercial decision that affects user capability must use `effectiveAccessTier`, not raw `subscription.tier`: `canAddProfile`, metering quota model/limits, family-hub navigation context, 402 upgrade options, and subscription usage displays. Raw tier remains useful for billing copy ("Your Plus payment needs attention") and store management.

**Row reconciliation:** status-change handlers must reconcile `profile_quota_usage` rows when effective access changes without a tier change (for example Plus `active` → `past_due` falls back to Free caps; `past_due` → `active` restores Plus caps). Add a lazy clamp in the per-profile metering path too: before the atomic decrement, ensure the row's `monthly_limit`/`daily_limit` match the current effective tier and role. That prevents stale 700/mo Plus rows from being honored while billing has fallen back to Free.

**Tests required:**
- Active Plus owner uses Plus owner caps; `past_due` Plus owner uses effective Free owner caps and daily limit.
- Cancelled Plus with future `currentPeriodEnd` keeps Plus caps; expired/cancelled-after-window falls back to Free caps.
- Past-due Family with linked child still has Family Hub visibility via effective Free, but cannot add beyond Free's one-child cap.
- Payment recovery (`past_due` → `active`) restores the paid effective tier and reconciles row limits without resetting usage counters.

### 1B. Schema migration — `profile_quota_usage`

**Files:**
- `packages/database/src/schema/billing.ts` — add new table
- `packages/database/src/schema/index.ts` — re-export
- `apps/api/src/migrations/<timestamp>_profile_quota_usage.sql` — generated SQL

**Schema add (`packages/database/src/schema/billing.ts`, after `quotaPools` at line 122):**

```ts
export const profileQuotaUsage = pgTable(
  'profile_quota_usage',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'child'] }).notNull(),
    monthlyLimit: integer('monthly_limit').notNull(),
    usedThisMonth: integer('used_this_month').notNull().default(0),
    dailyLimit: integer('daily_limit'),
    usedToday: integer('used_today').notNull().default(0),
    cycleResetAt: timestamp('cycle_reset_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('profile_quota_usage_sub_profile_idx').on(
      table.subscriptionId, table.profileId,
    ),
    index('profile_quota_usage_subscription_idx').on(table.subscriptionId),
    check('profile_quota_usage_month_non_negative', sql`${table.usedThisMonth} >= 0`),
    check('profile_quota_usage_today_non_negative', sql`${table.usedToday} >= 0`),
  ],
);
```

`role` is stored on the row (not re-derived from profile state) so lazy provisioning and tier-change handlers have a stable source of truth without needing a join.

**Generate migration:**

```bash
pnpm run db:generate:dev   # generates SQL under apps/api/src/migrations/
# Verify the SQL file: CREATE TABLE + indexes + checks; no DROP / RENAME
pnpm run db:push:dev       # apply to dev only
```

**Deploy ordering (CI-enforced):** `drizzle-kit migrate` runs before the worker rollout in the same deploy. Verify the deploy.yml step ordering before merging; if migration and code share a deploy job, the migrate step must precede the worker upload.

### 1C. `MeteringError` class

**Per MEDIUM-1.** The existing metering hot path has no typed error class; `decrementProfileQuota` needs one for the codes added in this PR. Add to `apps/api/src/services/billing/metering.ts`:

```ts
export type MeteringErrorCode =
  | 'PROFILE_ID_REQUIRED'        // per-profile tier called without profileId
  | 'PROFILE_QUOTA_ROW_MISSING'; // reserved — should now never fire after lazy provisioning

export class MeteringError extends Error {
  constructor(public readonly code: MeteringErrorCode, public readonly meta: Record<string, unknown>) {
    super(`MeteringError(${code})`);
    this.name = 'MeteringError';
  }
}
```

The middleware at `apps/api/src/middleware/metering.ts:620-664` must catch `MeteringError` and translate to a 500 with the code in the response body (these are caller-bug conditions, not 402s — they should fail loud in Sentry, not silently return a quota-exceeded payload).

### 1D. Metering branch + 402 payload (with lazy provisioning + owner-top-up fallthrough)

**Files:**
- `apps/api/src/services/billing/metering.ts` — branching + new `decrementProfileQuota` / `incrementProfileQuota` + `MeteringError`
- `apps/api/src/services/billing/metering.integration.test.ts` — per-profile tests + BUG-627 regression on new path + lazy-provision + owner-top-up tests
- `apps/api/src/services/profile.ts` — provision row in `createProfileWithLimitCheck`
- `apps/api/src/middleware/metering.ts:620-664` — extend 402 payload + handle `MeteringError`
- `apps/api/src/services/billing/quota-provision.ts` (new) — `provisionProfileQuotaUsage` helper
- `packages/database/src/schema/billing.ts` — export `profileQuotaUsage`

**Public API of `metering.ts` stays the same.** Signature `decrementQuota(db, subscriptionId, profileId?)` is unchanged; the function dispatches internally.

**Branching shape:**

```ts
// metering.ts — top-level dispatch
export async function decrementQuota(
  db: Database, subscriptionId: string, profileId?: string,
): Promise<DecrementResult> {
  const { effectiveAccessTier: tier } = await getEffectiveAccessTierForSubscription(db, subscriptionId);
  if (TIER_CONFIGS[tier].quotaModel === 'per-profile') {
    if (!profileId) {
      throw new MeteringError('PROFILE_ID_REQUIRED', { tier, subscriptionId });
    }
    return decrementProfileQuota(db, subscriptionId, profileId);
  }
  return decrementPoolQuota(db, subscriptionId, profileId);  // existing path renamed
}
```

The existing function body (lines 126-368 of current `metering.ts`) is renamed to `decrementPoolQuota` and left **byte-for-byte unchanged** — BUG-627's daily-cap race fix at lines 277-303 must not be touched.

**`decrementProfileQuota` (new, with lazy provisioning and owner-top-up fallthrough per CRITICAL-3 + HIGH-1):**

```ts
async function decrementProfileQuota(
  db: Database, subscriptionId: string, profileId: string,
): Promise<DecrementResult> {
  // Ownership check (mirrors existing pattern at metering.ts:131-157).
  // Emit on mismatch once; the lazy-provision retry below will NOT re-call this.
  const ownsProfile = await verifyProfileInSubscriptionAccount(db, subscriptionId, profileId);
  if (!ownsProfile) {
    await emitOwnershipMismatchEvent({ flow: 'decrement', subscriptionId, profileId });
    return {
      success: false, source: 'profile_mismatch',
      remainingMonthly: 0, remainingTopUp: 0, remainingDaily: null,
    };
  }

  const result = await db.transaction(async (tx) => {
    return attemptDecrementInTx(tx, subscriptionId, profileId, /* allowLazyProvision */ true);
  });

  return result;
}

/**
 * Inner transaction body for a per-profile decrement. Tries:
 *   1) Atomic UPDATE on monthly+daily caps.
 *   2) If 0 rows AND row exists AND monthly exhausted AND profile is owner AND
 *      tier has top-ups: atomic UPDATE on the top-up pool (FIFO) — scoped by
 *      profileId so a child cannot drain an owner's top-up batch.
 *   3) If 0 rows AND no row exists: lazy-provision via the active tier's role
 *      caps and retry the atomic UPDATE once (allowLazyProvision = false on
 *      the retry to prevent an infinite loop).
 *   4) Discriminate snapshot: daily_exceeded vs none.
 */
async function attemptDecrementInTx(
  tx: Database, subscriptionId: string, profileId: string, allowLazyProvision: boolean,
): Promise<DecrementResult> {
  // Step 1 — monthly + daily atomic UPDATE.
  const [updated] = await tx
    .update(profileQuotaUsage)
    .set({
      usedThisMonth: sql`${profileQuotaUsage.usedThisMonth} + 1`,
      usedToday: sql`${profileQuotaUsage.usedToday} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(profileQuotaUsage.subscriptionId, subscriptionId),
        eq(profileQuotaUsage.profileId, profileId),
        sql`${profileQuotaUsage.usedThisMonth} < ${profileQuotaUsage.monthlyLimit}`,
        sql`(${profileQuotaUsage.dailyLimit} IS NULL OR ${profileQuotaUsage.usedToday} < ${profileQuotaUsage.dailyLimit})`,
      ),
    )
    .returning();

  if (updated) {
    await recordUsageEvent(tx, subscriptionId, profileId, 1);
    return {
      success: true, source: 'monthly',
      remainingMonthly: updated.monthlyLimit - updated.usedThisMonth,
      remainingTopUp: 0,
      remainingDaily: updated.dailyLimit !== null
        ? updated.dailyLimit - updated.usedToday
        : null,
    };
  }

  // Step 2 — discriminate. Read snapshot inside the same tx (mirrors existing
  // pool path at metering.ts:188-194).
  const [snapshot] = await tx
    .select()
    .from(profileQuotaUsage)
    .where(and(
      eq(profileQuotaUsage.subscriptionId, subscriptionId),
      eq(profileQuotaUsage.profileId, profileId),
    ))
    .limit(1);

  // Step 3 — lazy provisioning if the row genuinely doesn't exist (most common
  // cause: a Family → Plus downgrade that didn't provision children #2/#3).
  if (!snapshot) {
    if (!allowLazyProvision) {
      // Provision succeeded but the retry UPDATE still returned 0 rows AND the
      // snapshot is missing — that's an invariant violation, surface loud.
      throw new MeteringError('PROFILE_QUOTA_ROW_MISSING', { subscriptionId, profileId });
    }
    const role = await resolveProfileRole(tx, subscriptionId, profileId);  // 'owner' | 'child'
    const { effectiveAccessTier: tier } = await getEffectiveAccessTierForSubscription(tx, subscriptionId);
    await provisionProfileQuotaUsage(tx, subscriptionId, profileId, role, { tier });
    await safeSend(
      () => inngest.send({
        name: 'app/billing.profile_quota.lazy_provisioned',
        data: { subscriptionId, profileId, tier, role, occurredAt: new Date().toISOString() },
      }),
      'billing.profile_quota.lazy_provisioned',
      { subscriptionId, profileId, tier, role },
    );
    return attemptDecrementInTx(tx, subscriptionId, profileId, false);
  }

  // Step 4 — owner-only top-up fallthrough (monthly exhausted, daily OK,
  // profile is owner, tier has top-ups available). Scoped by profileId per
  // CRITICAL-2 so child cannot drain owner's top-up batch.
  const monthlyExhausted = snapshot.usedThisMonth >= snapshot.monthlyLimit;
  const dailyOk = snapshot.dailyLimit === null || snapshot.usedToday < snapshot.dailyLimit;
  if (monthlyExhausted && dailyOk && snapshot.role === 'owner') {
    const topUpResult = await consumeOwnerTopUpCredit(tx, subscriptionId, profileId);
    if (topUpResult) {
      // Increment usedToday on the owner's profile row for daily-cap accounting
      // even though the credit came from a top-up batch.
      await tx
        .update(profileQuotaUsage)
        .set({ usedToday: sql`${profileQuotaUsage.usedToday} + 1`, updatedAt: new Date() })
        .where(and(
          eq(profileQuotaUsage.subscriptionId, subscriptionId),
          eq(profileQuotaUsage.profileId, profileId),
        ));
      await recordUsageEvent(tx, subscriptionId, profileId, 1, topUpResult.topUpCreditId);
      return {
        success: true, source: 'top_up',
        remainingMonthly: 0,
        remainingTopUp: topUpResult.remainingTopUp,
        remainingDaily: snapshot.dailyLimit !== null
          ? Math.max(0, snapshot.dailyLimit - snapshot.usedToday - 1)
          : null,
        topUpCreditId: topUpResult.topUpCreditId,
      };
    }
  }

  // Step 5 — pure exhaustion. Daily-vs-monthly discrimination from snapshot.
  if (snapshot.dailyLimit !== null && snapshot.usedToday >= snapshot.dailyLimit) {
    return {
      success: false, source: 'daily_exceeded',
      remainingMonthly: Math.max(0, snapshot.monthlyLimit - snapshot.usedThisMonth),
      remainingTopUp: 0, remainingDaily: 0,
    };
  }
  return {
    success: false, source: 'none',
    remainingMonthly: 0, remainingTopUp: 0,
    remainingDaily: snapshot.dailyLimit !== null
      ? Math.max(0, snapshot.dailyLimit - snapshot.usedToday)
      : null,
  };
}
```

**`consumeOwnerTopUpCredit` (new helper, scoped to top-up table — depends on § 1E migration):**

Mirrors the existing FIFO consume at `metering.ts:236-329` but with an additional `eq(topUpCredits.profileId, profileId)` filter. Returns `{ topUpCreditId, remainingTopUp } | null`. Lives in `metering.ts` next to the existing helper.

**`resolveProfileRole` (new helper):**

```ts
async function resolveProfileRole(
  tx: Database, subscriptionId: string, profileId: string,
): Promise<'owner' | 'child'> {
  const [row] = await tx
    .select({ isOwner: profiles.isOwner })
    .from(profiles)
    .innerJoin(subscriptions, eq(subscriptions.accountId, profiles.accountId))
    .where(and(eq(subscriptions.id, subscriptionId), eq(profiles.id, profileId)))
    .limit(1);
  if (!row) throw new MeteringError('PROFILE_QUOTA_ROW_MISSING', { subscriptionId, profileId });
  return row.isOwner ? 'owner' : 'child';
}
```

**`incrementProfileQuota` (refund path — per MEDIUM-5):**

```ts
export async function incrementProfileQuota(
  db: Database, subscriptionId: string, profileId: string, topUpCreditId?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (topUpCreditId) {
      // Credit back the original top-up batch — mirrors the pool path at
      // metering.ts:431-448. Decrement usedToday on the owner's profile row
      // because that's where the daily-cap consumption was tracked.
      await tx
        .update(topUpCredits)
        .set({ remainingAmount: sql`${topUpCredits.remainingAmount} + 1`, updatedAt: new Date() })
        .where(eq(topUpCredits.id, topUpCreditId));
      await tx
        .update(profileQuotaUsage)
        .set({
          usedToday: sql`GREATEST(0, ${profileQuotaUsage.usedToday} - 1)`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(profileQuotaUsage.subscriptionId, subscriptionId),
          eq(profileQuotaUsage.profileId, profileId),
        ));
      return;
    }
    await tx
      .update(profileQuotaUsage)
      .set({
        usedThisMonth: sql`GREATEST(0, ${profileQuotaUsage.usedThisMonth} - 1)`,
        usedToday: sql`GREATEST(0, ${profileQuotaUsage.usedToday} - 1)`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(profileQuotaUsage.subscriptionId, subscriptionId),
        eq(profileQuotaUsage.profileId, profileId),
      ));
  });
}
```

Then `incrementQuota` dispatches by `quotaModel` same way as `decrementQuota`.

**Row provisioning (`createProfileWithLimitCheck` at `profile.ts:364-468`):**

After the existing profile insert and within the same transaction:

```ts
const { effectiveAccessTier: tier } = await getEffectiveAccessTierForSubscription(txDb, subscription.id);
if (TIER_CONFIGS[tier].quotaModel === 'per-profile') {
  const role = isOwnerInsert ? 'owner' : 'child';
  // Pass effective tier through to avoid a second access-tier query (LOW-1).
  await provisionProfileQuotaUsage(txDb, subscription.id, newProfile.id, role, { tier });
}
```

`provisionProfileQuotaUsage` accepts an optional pre-resolved tier:

```ts
export async function provisionProfileQuotaUsage(
  tx: Database, subscriptionId: string, profileId: string, role: 'owner' | 'child',
  opts: { tier?: SubscriptionState['tier'] } = {},
): Promise<void> {
  const tier = opts.tier ?? (await getEffectiveAccessTierForSubscription(tx, subscriptionId)).effectiveAccessTier;
  const config = TIER_CONFIGS[tier];
  if (config.quotaModel !== 'per-profile') return;
  const monthlyLimit = role === 'owner' ? config.ownerMonthlyQuota! : config.childMonthlyQuota!;
  const dailyLimit  = role === 'owner' ? config.ownerDailyQuota   : config.childDailyQuota;
  const cycleResetAt = nextMonthBoundary(new Date());  // existing helper, used by quota_pools
  await tx
    .insert(profileQuotaUsage)
    .values({ subscriptionId, profileId, role, monthlyLimit, dailyLimit, cycleResetAt })
    .onConflictDoNothing({ target: [profileQuotaUsage.subscriptionId, profileQuotaUsage.profileId] });
}
```

`onConflictDoNothing` makes the helper idempotent so lazy-provision races (two concurrent decrements for the same orphaned profile) cannot create duplicate rows.

**Backfill for existing accounts:** Per `project_pre_launch_no_users.md` (verify at ship time) there are no real users today. **Verify at ship time** — if any Free/Plus account exists in production at ship time, add a one-shot backfill script `scripts/backfill-profile-quota-usage.ts` that inserts a row for every (subscription, profile) pair on per-profile tiers. The PR description must call out the user-state verification step.

**402 payload extension (`apps/api/src/middleware/metering.ts:620-664`):**

Add fields to the `details` object:

```ts
details: {
  ...existing,
  effectiveAccessTier,                            // raw paid tier may differ in fallback
  quotaModel: TIER_CONFIGS[effectiveAccessTier].quotaModel, // 'per-profile' | 'shared-pool'
  profileRole: isOwner ? 'owner' : 'child',      // for child → "ask your parent" CTA
  resetsAt,                                      // exact ISO timestamp for the blocking cap
}
```

`resetsAt` is required. For `reason: 'daily'`, return the next actual daily reset timestamp. For `reason: 'monthly'`, return the row/pool `cycleResetAt`. Do not hard-code "midnight" or "the 1st" in client copy unless it is derived from this timestamp in the user's locale.

The client (`QuotaExceededCard.tsx`) already branches on `isOwner` (lines 49+) but must swap any subscribe/trial-ended notification path for a quota-specific path in PR 3. The `quotaModel` + `profileRole` + `effectiveAccessTier` fields drive the upgrade CTA split: Free owner → Plus; Plus/effective-Free child → Family; bad-standing paid owner → fix billing or continue on Free caps.

Add a `try { ... } catch (err) { if (err instanceof MeteringError) return ctx.json({ error: err.code, meta: err.meta }, 500); throw err; }` around the metering call so caller-bug conditions surface as 500s with structured codes, not as 402 confusion.

**LLM tier resolution at the middleware:** `apps/api/src/middleware/metering.ts:685-686` sets `llmTier` from `getTierConfig(tier).llmTier`. **Leave this site alone — no centralizing helper per spec D3 and adversarial CRITICAL-1.** Per-exchange routing (Plus advanced-rung → premium, AI_UPGRADE_ADDON premium) is handled by `resolveExchangeLlmRouting` at `apps/api/src/services/session/session-exchange.ts:195-237` and stays the single per-exchange decider.

### 1E. `top_up_credits.profile_id` migration (per CRITICAL-2)

**Files:**
- `packages/database/src/schema/billing.ts` — extend `topUpCredits` table
- `apps/api/src/migrations/<timestamp>_top_up_credits_profile_id.sql` — generated SQL
- `apps/api/src/services/billing/metering.ts` — filter top-up lookups by `profileId` for per-profile tiers
- `apps/api/src/routes/revenuecat-webhook.ts` and/or wherever top-up credits are minted — set `profileId` to the buyer

**Schema change (`packages/database/src/schema/billing.ts:154-175`):** add a column

```ts
profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
// Nullable for now: pre-launch zero-row state means no backfill needed; defaults
// to the buyer profile going forward. Family/Pro top-ups stay subscription-scoped
// (the consume filter only applies profileId when the tier is per-profile).
```

Covering index:

```ts
index('top_up_credits_sub_profile_expires_idx').on(
  table.subscriptionId, table.profileId, table.expiresAt,
),
```

**Metering consume filter (`consumeOwnerTopUpCredit` in § 1D):** the new helper's WHERE includes `eq(topUpCredits.profileId, profileId)` for per-profile tiers. The existing `decrementPoolQuota` top-up consume path for Family/Pro stays untouched (it does not filter by `profileId` — shared-pool top-ups are intentionally pool-wide per spec).

**Minting:** RevenueCat webhook (or wherever `topUpCredits` rows are created today) must record the buyer's profile_id. Pre-launch this is the owner profile by default; the spec defers child-targeted purchase UI to a follow-up.

**Pre-launch verification:** zero-row count check at deploy time. If any rows exist, the migration runs as nullable + manual backfill before any `NOT NULL` tightening (deferred to a follow-up).

### 1F. Tier/status-change handling (per HIGH-3 + effective-access fallback)

**Files:**
- `apps/api/src/services/billing/subscription-change.ts` (or the equivalent — grep `setSubscriptionTier` / `changeSubscriptionTier` / RevenueCat handler that mutates `subscriptions.tier`)
- `apps/api/src/services/billing/subscription-change.integration.test.ts`

The current tier-change handler does not touch `quota_pools` or any per-profile state; after this PR it must reconcile `profile_quota_usage` rows to the new **effective** tier's caps. This reconciliation also runs when billing status changes effective access without changing raw tier (for example `plus/active` → `plus/past_due` means effective Plus → effective Free). Transitions per spec § Tier-change handling (lines 282-286):

```ts
async function reconcileQuotaState(
  tx: Database, subscriptionId: string, fromTier: Tier, toTier: Tier,
): Promise<void> {
  const fromModel = TIER_CONFIGS[fromTier].quotaModel;
  const toModel = TIER_CONFIGS[toTier].quotaModel;

  // Per-profile → per-profile (Free ↔ Plus): update limits in place, preserve usage counters.
  if (fromModel === 'per-profile' && toModel === 'per-profile') {
    const config = TIER_CONFIGS[toTier];
    await tx.update(profileQuotaUsage)
      .set({
        monthlyLimit: sql`CASE WHEN ${profileQuotaUsage.role} = 'owner' THEN ${config.ownerMonthlyQuota} ELSE ${config.childMonthlyQuota} END`,
        dailyLimit:   sql`CASE WHEN ${profileQuotaUsage.role} = 'owner' THEN ${config.ownerDailyQuota}   ELSE ${config.childDailyQuota}   END`,
        updatedAt: new Date(),
      })
      .where(eq(profileQuotaUsage.subscriptionId, subscriptionId));
    return;
  }

  // Per-profile → shared-pool (Free/Plus → Family/Pro): delete per-profile rows,
  // create/refresh the shared quota_pools row. Counters do NOT migrate — the
  // user's used quota effectively resets (the upgrade reward). Document in copy.
  if (fromModel === 'per-profile' && toModel === 'shared-pool') {
    await tx.delete(profileQuotaUsage).where(eq(profileQuotaUsage.subscriptionId, subscriptionId));
    await upsertSharedPool(tx, subscriptionId, toTier);  // existing helper or new
    return;
  }

  // Shared-pool → per-profile (Family/Pro → Plus/Free): provision owner row +
  // first linked-child row eagerly. Remaining child rows are lazy-provisioned
  // on first decrement attempt per § 1D.
  if (fromModel === 'shared-pool' && toModel === 'per-profile') {
    const profiles = await tx.select().from(profilesTable)
      .innerJoin(subscriptionsTable, eq(subscriptionsTable.accountId, profilesTable.accountId))
      .where(eq(subscriptionsTable.id, subscriptionId));
    // Provision owner first.
    const owner = profiles.find((p) => p.isOwner);
    if (owner) await provisionProfileQuotaUsage(tx, subscriptionId, owner.id, 'owner', { tier: toTier });
    // First linked child only — the per-profile cap reflects the new tier's child slot count.
    const firstChild = profiles.find((p) => !p.isOwner);
    if (firstChild) await provisionProfileQuotaUsage(tx, subscriptionId, firstChild.id, 'child', { tier: toTier });
    // quota_pools row is left in place (idempotent — no per-profile code reads it).
    // A follow-up sweep ticket cleans the orphan if it becomes a capacity-planning concern.
    return;
  }

  // shared-pool → shared-pool (Family ↔ Pro): existing quota_pools update path; unchanged.
}
```

This function is called from the tier-change service in the same transaction that updates `subscriptions.tier`, and from billing-status update paths when status/currentPeriodEnd changes effective access. The PR description must name the actual call sites being patched.

**Tests required:**
- Free → Plus: existing owner row's `monthly_limit` 100 → 700, `daily_limit` 10 → NULL; `used_this_month` preserved; child row unchanged (100/10 caps already match).
- Plus → Family: per-profile rows deleted; shared pool row exists; subsequent decrement uses pool path.
- Family → Plus: owner + first child rows provisioned with Plus caps (700/null + 100/10); second linked child has no row; first decrement attempt for that child triggers lazy provisioning + logs `billing.profile_quota.lazy_provisioned`.
- Family → Free: same as Family → Plus but with Free caps; owner gets 100/10.

### 1G. `subscription.ts` comment correction (folded from deleted PR 2 per CRITICAL-1)

Replace the misleading comment block at `subscription.ts:43-46` with a two-layer documentation block per spec D3:

```ts
// LLM tier resolution lives in two layers:
//
// 1. Base account `llmTier` (this config) is what bulk/background callers
//    read — Free → 'flash', Plus/Family/Pro → 'standard'. Used wherever a
//    per-request decision isn't appropriate (e.g. background workers).
//
// 2. Per-exchange routing is decided by `resolveExchangeLlmRouting` at
//    `services/session/session-exchange.ts`. That function elevates Plus to
//    `'premium'` on advanced rungs (effectiveRung >= GEMINI_ADVANCED_MODEL_MIN_RUNG)
//    and services the `AI_UPGRADE_ADDON` entitlement's `requestedLlmTier === 'premium'`
//    branch. Family stays Gemini-only. Future owner-only premium routing, when
//    scoped, adds an `isOwner` input there — not as a parallel helper.
```

No code call sites change. Existing tests at `apps/api/src/services/session/session-exchange.test.ts:327+` must continue to pass unchanged.

### 1H. Reset cron extension (per HIGH-2)

**Files:**
- `apps/api/src/services/billing/trial.ts` (or wherever `resetDailyQuotas` + `resetExpiredQuotaCycles` are defined — confirmed by grep)
- `apps/api/src/inngest/functions/quota-reset.ts` — the daily cron at `0 1 * * *` UTC already runs both resets in one tx

The existing `quota-reset.ts` cron orchestrates both `resetDailyQuotas` and `resetExpiredQuotaCycles` in a single transaction (`quota-reset.ts:43-59`). Both functions today iterate `quota_pools` only. Extend each to ALSO iterate `profile_quota_usage`:

```ts
// Inside resetDailyQuotas, after the existing quota_pools update:
await tx.update(profileQuotaUsage)
  .set({ usedToday: 0, updatedAt: new Date() })
  .where(sql`${profileQuotaUsage.usedToday} > 0`);

// Inside resetExpiredQuotaCycles, after the existing quota_pools update:
await tx.update(profileQuotaUsage)
  .set({
    usedThisMonth: 0,
    cycleResetAt: sql`${profileQuotaUsage.cycleResetAt} + interval '1 month'`,
    updatedAt: new Date(),
  })
  .where(sql`${profileQuotaUsage.cycleResetAt} <= ${now}`);
```

Both writes happen in the existing single transaction so a partial reset is observable (not silently half-applied). Per-row `cycleResetAt` allows mid-cycle additions (a child profile added on day 15 keeps its own cycle anchor).

**Tests required:**
- Daily reset: provision a Free family on day 1, consume on owner + child rows, advance simulated time one day, confirm `used_today = 0` on both rows AND `used_this_month` untouched on both rows.
- Monthly cycle reset: provision a Free family with `cycle_reset_at = day 30`, consume some quota, advance to day 30+1s, confirm `used_this_month = 0` AND `cycle_reset_at = day 60` on both rows.
- Mid-cycle child addition: provision owner on day 1, add child row on day 15 with its own `cycle_reset_at = day 45`. After day 30 cycle tick, owner resets, child does not. After day 45 tick, child resets, owner unaffected (owner's next cycle is day 60).

### 1I. Tests required to merge

**Server gate criteria (per spec § Tests required to merge + adversarial CRITICAL/HIGH coverage):**

In `subscription.test.ts`:
- All four `premiumModelProfiles` assertions removed; `quotaModel` discriminator asserted on all four tiers; per-profile quota fields asserted on Free + Plus.
- `canAddProfile` returns true for first child on Free (was false); returns false for second child on Free/Plus.

In `metering.integration.test.ts`:
- Per-profile decrement (Free): owner consumes own 100/mo pool; child profile separately consumes own 100/mo pool; cross-consumption impossible.
- Per-profile decrement (Plus): owner 700/mo no daily cap; child 100/mo + 10/day; child cannot tap owner's pool.
- **Owner top-up fallthrough (Plus):** owner exhausts 700/mo, next call returns `source: 'top_up'` with a `topUpCreditId`; refund via `incrementProfileQuota` credits the top-up batch (not the monthly pool).
- **Child top-up unavailability:** child exhausts 100/mo on Plus; `decrementProfileQuota` returns `source: 'none'` even with unconsumed top-up credits owned by the owner profile.
- **Lazy provisioning:** simulate Family → Plus downgrade by deleting children #2+ `profile_quota_usage` rows; first decrement for child #2 provisions row with Plus child caps (100/10), retries UPDATE in same tx, returns `source: 'monthly'`; `billing.profile_quota.lazy_provisioned` event emitted.
- **Concurrent lazy provisioning idempotency:** two concurrent decrement calls for the same orphaned profile → exactly one row created (per `onConflictDoNothing`), both calls complete successfully (one via fresh insert, one via retry seeing the existing row).
- BUG-627 daily-cap concurrency on new path: 3 concurrent child decrements at `used_today = 9` → exactly 1 success, 2 daily_exceeded (mirror the existing test at `metering.integration.test.ts:285-330`).
- Shared-pool decrement (Family/Pro): existing tests must pass unchanged.
- 402 payload includes `effectiveAccessTier` + `quotaModel` + `profileRole` + exact `resetsAt`.
- `MeteringError('PROFILE_ID_REQUIRED')` surfaces as a 500 with the structured code; not a 402.
- `provisionProfileQuotaUsage`: creating a Free owner provisions an owner row with 100/10; adding a child provisions a child row with 100/10; `onConflictDoNothing` makes a second call a no-op.
- Tier-change tests (per § 1F): Free→Plus in-place update, Plus→Family delete + pool create, Family→Plus owner+first-child provision, Family→Free with Free caps.
- Effective-access fallback tests (per § 1A.1): past-due Plus clamps to effective Free caps; payment recovery restores Plus caps; cancelled-with-future-period-end keeps paid caps; expired falls back to Free.
- Top-up scoping: Plus owner's top-up credit only consumed by owner sessions; Plus child sessions never decrement owner's top-up batch.
- `updateProfileAppContext`: adult Free owner with 1 linked child can set `'family'` context (new regression).
- **Consent redaction (per MEDIUM-4):** Free child profile + `WITHDRAWN` consent returns redacted data (parent sees consent state, not learning metrics); same regression for Plus child.

In `quota-reset.integration.test.ts` (or wherever the cron is tested):
- Daily reset on per-profile rows; monthly reset on per-profile rows; mid-cycle child addition isolation (per § 1H tests).

**Verification:**
- `pnpm exec nx run api:typecheck` — confirms no consumer reads `premiumModelProfiles`
- `pnpm exec nx run api:test`
- `pnpm exec nx test:integration api` — REQUIRED per CLAUDE.md ("Pre-commit and pre-push hooks both intentionally skip `.integration.test.` files").
- Grep `premiumModelProfiles` returns zero matches across `apps/`, `packages/`.
- Manual smoke: create a Free account in dev, add a child, exhaust child's 10/day via the exchange endpoint, confirm 402 with `quotaModel: 'per-profile'` and `profileRole: 'child'`.

**Rollback:** Revert code. Drop `profile_quota_usage` and `top_up_credits.profile_id` only if zero-user state still holds at ship time. Post-launch, the rows become billing-relevant history — see spec § Rollback.

---

## PR 2 — `client-tier-paywall-removal`

(Renumbered from original PR 3 per CRITICAL-1; original PR 2 deleted.)

**Goal:** Remove the tier paywall on add-child; introduce `isFamilyHubEligible`; swap 5 display-gating sites. Keep the two pool-data-fetch sites tier-gated. **Add `effectiveAccessTier` and `billingAccess` to subscription/navigation context** so lapsed paid accounts fall back to Free visibility/caps instead of losing Family Hub.

**Files (display-gates — swap):**
- `apps/mobile/src/lib/navigation-contract.ts` — extend `NavigationSubscriptionContext` with `effectiveAccessTier` + `billingAccess`; replace `familyPlanOwner` with `isFamilyHubEligible`
- `apps/mobile/src/lib/navigation-contract.ts:245-251` — predicate update site
- `apps/mobile/src/hooks/<the hook that builds the navigation context>` — pass through API-computed `effectiveAccessTier` + `billingAccess`. Grep `NavigationSubscriptionContext` / `subscription.status === 'ready'` to find the construction site before drafting.
- `apps/mobile/src/app/(app)/more/index.tsx:53-101` — drop tier paywall + tier-only `profileLimit` branch
- `apps/mobile/src/app/(app)/profiles.tsx:135` — swap tier check
- `apps/mobile/src/app/(app)/subscription.tsx:686` (or current line for the Family-Hub-link site) — swap tier check
- `apps/mobile/src/components/home/ParentHomeScreen.tsx:898-925` — drop tier paywall on `handleAddChild`

**Files to leave tier-gated (pool-data-fetch):**
- `apps/mobile/src/app/(app)/more/index.tsx:42-43` — `useFamilySubscription(subscription?.tier === 'family' || ...)` stays
- `apps/mobile/src/app/(app)/profiles.tsx:41-42` — same
- `apps/mobile/src/components/home/ParentHomeScreen.tsx:800` — same
- `apps/api/src/routes/billing.ts:545` — server-side family-pool branch stays family/pro

**Schema change — `NavigationSubscriptionContext` (per CRITICAL-4 + product update):**

```ts
// Before
interface NavigationSubscriptionContext {
  status: 'loading' | 'ready';
  tier: 'free' | 'plus' | 'family' | 'pro';
  // ...
}

// After
interface NavigationSubscriptionContext {
  status: 'loading' | 'ready';
  tier: 'free' | 'plus' | 'family' | 'pro';
  /**
   * API-computed tier currently enforced for product capacity/visibility.
   * Equals the billing tier while paid entitlement is current; falls back to
   * 'free' for past_due/expired/non-entitled paid subscriptions.
   */
  effectiveAccessTier: 'free' | 'plus' | 'family' | 'pro' | null;
  /**
   * 'free_fallback' means the user still sees Free-level Family Hub, but paid
   * capacity is suspended until billing recovers. Use for banners/copy only.
   */
  billingAccess: 'current' | 'free_fallback' | null;
  // ...
}
```

The entitlement-window decision lives on the API, not in `navigation-contract.ts` and not in local client clock math. The hook maps missing data to `{ effectiveAccessTier: null, billingAccess: null }` while loading.

**New helper (`apps/mobile/src/lib/navigation-contract.ts`):**

Compose from existing helpers (agent map confirmed all exist):

```ts
// Insert near isFamilyCapable at line 205-208
export function isFamilyHubEligible(context: ProfileContext): boolean {
  if (!isAdultOwner(context.activeProfile)) return false;
  if (context.role !== 'owner') return false;
  if (context.isParentProxy) return false;
  if (getLinkedChildIds(context.activeProfile, context.profiles).length < 1) return false;
  if (context.subscription.status !== 'ready') return false;
  // Lapsed paid accounts fall back to effective Free, not no Family Hub.
  return context.subscription.effectiveAccessTier !== null;
}
```

**Replace `familyPlanOwner` (line 245-251):**

```ts
// Before
const familyPlanOwner =
  isAdultOwner(context.activeProfile) &&
  ownerRole &&
  !context.isParentProxy &&
  subscriptionReady &&
  (context.subscription.tier === 'family' || context.subscription.tier === 'pro');

// After
const familyHubEligible = isFamilyHubEligible(context);
```

Then update every downstream usage of `familyPlanOwner` in the file to `familyHubEligible`. The Recaps tab gate (V1) now fires for any adult owner with a linked child once subscription data resolves, including bad-standing paid accounts that are operating on effective Free. UI surfaces should use `billingAccess === 'free_fallback'` to show a recovery banner rather than hiding Family Hub.

**`more/index.tsx` cleanup:**

Replace lines 53-101 with:

```ts
const handleAddChild = useCallback(() => {
  if (!subscription) {
    platformAlert(t('common.loading'), t('more.errors.tryAgainMoment'));
    return;
  }
  // No tier check — server's createProfileWithLimitCheck (402) is the maxProfiles gate.
  router.push({ pathname: '/create-profile', params: { for: 'child' } } as never);
}, [subscription, router, t]);
```

The `familyData.profileCount >= maxProfiles` branch (lines 77-94) is dropped — `useFamilySubscription` only fires for family/pro anyway, and the server-side 402 is the single source of truth for "you can't add more." Confirm the 402 client-error path renders sensibly: trace the throw from `routes/profiles.ts:102-125` → mobile `create-profile` screen's submit handler → user sees `PROFILE_LIMIT_EXCEEDED` message. If the rendered string is poor, add a translation override (separate small follow-up, not blocking).

**`ParentHomeScreen.tsx:898-925` cleanup:**

Same shape — drop the `tier !== 'family' && tier !== 'pro'` branch; align the "has children, add more" branch with the existing `navigateToCreateChildProfile` pattern used at the no-children early-return (line 876).

**V0 hard-constraint guard (per LOW-2 — tier explicit in fixtures):**

Add regression tests in `apps/mobile/src/lib/navigation-contract.test.ts` that explicitly cover the new (Free + linked child) state introduced by this rework:

```ts
test('[V0 hard constraint] V0 + Family + linked child still renders 5 tabs (unchanged)', () => {
  const context = makeContext({
    flags: { MODE_NAV_V0_ENABLED: true, MODE_NAV_V1_ENABLED: false },
    activeProfile: makeAdultOwner(),
    linkedChildren: 1,
    subscription: { status: 'ready', tier: 'family', effectiveAccessTier: 'family', billingAccess: 'current' },
  });
  const result = resolveNavigationContract(context);
  expect(result.visibleTabs).toEqual(LEGACY_GUARDIAN_TABS);
});

test('[new state] V0 + Free + linked child renders 5 tabs (rework opens guardian shape to Free)', () => {
  const context = makeContext({
    flags: { MODE_NAV_V0_ENABLED: true, MODE_NAV_V1_ENABLED: false },
    activeProfile: makeAdultOwner(),
    linkedChildren: 1,
    subscription: { status: 'ready', tier: 'free', effectiveAccessTier: 'free', billingAccess: 'current' },
  });
  const result = resolveNavigationContract(context);
  expect(result.visibleTabs).toEqual(LEGACY_GUARDIAN_TABS);
});

test('[regression] V0 + Free + no linked children stays in study shape', () => {
  const context = makeContext({
    flags: { MODE_NAV_V0_ENABLED: true, MODE_NAV_V1_ENABLED: false },
    activeProfile: makeAdultOwner(),
    linkedChildren: 0,
    subscription: { status: 'ready', tier: 'free', effectiveAccessTier: 'free', billingAccess: 'current' },
  });
  const result = resolveNavigationContract(context);
  expect(result.visibleTabs).toEqual(STUDY_TABS);
});
```

(The existing V0 short-circuit at `navigation-contract.ts:265-277` already returns the `LEGACY_GUARDIAN_TABS` set when `MODE_NAV_V1_ENABLED=false`. The first test pins the unchanged path; the second pins the new state per spec line 191; the third pins the empty-children regression.)

**Tests required:**
- `isFamilyHubEligible`: adult Free owner + linked child → true; adult Free owner + 0 children → false; non-owner → false; `past_due` Plus with `effectiveAccessTier: 'free'` → true and `billingAccess: 'free_fallback'`; loading with `effectiveAccessTier: null` → false.
- Recaps tab visibility (V1 nav): Free adult owner with linked child sees Recaps; past-due Plus adult owner with linked child also sees Recaps with Free-level capacity and billing recovery banner.
- V0 regression tests above.
- Client paywall removal: render `more/index.tsx` as Free user, click add-child, assert `router.push` fires with `/create-profile?for=child` and no `platformAlert`.

**Verification:**
- `cd apps/mobile && pnpm exec jest --findRelatedTests src/lib/navigation-contract.ts src/app/\(app\)/more/index.tsx --no-coverage`
- `cd apps/mobile && pnpm exec tsc --noEmit`
- Manual smoke: Free user flow on emulator — add-child routes directly, second add-child returns 402 with sensible copy.

**Rollback:** Revert. No data implications.

---

## PR 3 — `child-quota-ux-notif`

(Renumbered from original PR 4.)

**Goal:** Add parent in-app notification when child hits cap. Reuse the child/owner branching shape in `QuotaExceededCard`, but do **not** reuse the old `notify-parent-subscribe` endpoint or any "trial ended / subscribe to continue" copy. **Event dispatch + handler land together in this PR** — no orphan events from PR 1. **New `child_cap_notifications` table** + new `/notifications` route (does not exist today — confirmed by glob).

**Files:**
- `packages/database/src/schema/notifications.ts` (new) — `childCapNotifications` table schema
- `packages/database/src/schema/index.ts` — re-export
- `apps/api/src/migrations/<timestamp>_child_cap_notifications.sql` — generated SQL
- `apps/api/src/services/billing/metering.ts` — add `safeSend` of `app/billing.profile_quota.exhausted` inside `decrementProfileQuota` when child profile returns `daily_exceeded` or `none`; include exact `resetsAt`
- `apps/api/src/inngest/functions/notify-parent-child-cap-hit.ts` (new) — listens for the event, writes a notification row for the owner profile
- `apps/api/src/routes/notifications.ts` (NEW — confirmed not present) — GET endpoint scoped to the active owner profile; mirrors the `/recaps` route's auth/scoping pattern at `apps/api/src/routes/recaps.ts`
- `apps/api/src/routes/notifications.test.ts` (new)
- `apps/mobile/src/components/home/ParentHomeScreen.tsx` — render notification banner from new query hook
- `apps/mobile/src/hooks/use-child-cap-notifications.ts` (new)
- `apps/mobile/src/i18n/locales/{en,de,es,ja,nb,pl,pt}.json` — 7 locales × new keys (`quota.parent.childCapHit.title`, `.dailyMessage`, `.monthlyMessage`, `.dismiss`)

**Schema add — `child_cap_notifications` (per MEDIUM-2):**

```ts
// packages/database/src/schema/notifications.ts
export const childCapNotifications = pgTable(
  'child_cap_notifications',
  {
    id: uuid('id').primaryKey().$defaultFn(() => generateUUIDv7()),
    ownerProfileId: uuid('owner_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    childProfileId: uuid('child_profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['daily_exceeded', 'monthly_exceeded'] }).notNull(),
    occurredOn: date('occurred_on').notNull(), // UTC day; the dedup anchor
    resetsAt: timestamp('resets_at', { withTimezone: true }).notNull(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('child_cap_notifications_dedup_idx').on(
      table.ownerProfileId, table.childProfileId, table.kind, table.occurredOn,
    ),
    index('child_cap_notifications_owner_active_idx')
      .on(table.ownerProfileId, table.dismissedAt),
  ],
);
```

The unique index on `(owner_profile_id, child_profile_id, kind, occurred_on)` is the dedup mechanism — `onConflictDoNothing` on the insert means N cap-hit events for the same child on the same day produce exactly one row.

**Event dispatch (in `decrementProfileQuota` — after the snapshot branch resolves):**

```ts
// Only emit for child role; owner exhaustion does not page the parent.
if ((result.source === 'daily_exceeded' || result.source === 'none') && snapshot.role === 'child') {
  // safeSend per CLAUDE.md non-core dispatch rule
  await safeSend(
    () => inngest.send({
      name: 'app/billing.profile_quota.exhausted',
      data: {
        subscriptionId,
        profileId,
        kind: result.source === 'daily_exceeded' ? 'daily_exceeded' : 'monthly_exceeded',
        resetsAt: result.resetsAt,
        occurredAt: new Date().toISOString(),
      },
    }),
    'billing.profile_quota.exhausted',
    { subscriptionId, profileId },
  );
}
```

The new Inngest function reads the owner profile (via `account_id` join through `subscriptions` → `profiles WHERE is_owner = true`), then inserts the notification row with `onConflictDoNothing` on the dedup index. It stores `resetsAt` so the parent banner can say exactly when the child can try again.

**Child-side "Notify parent" button:** if the child UI keeps a button, wire it to this quota-specific notification path (or a small idempotent endpoint that inserts the same `child_cap_notifications` row). It must never call `settings/notify-parent-subscribe`, whose current server copy says "free trial has ended" and "Subscribe to continue"; that path is semantically wrong for permanent Free/Plus quota caps.

**`/notifications` route:**

Mirror the auth + scoping pattern of `apps/api/src/routes/recaps.ts`. Owner-scoped only — a child profile auth context cannot list parent notifications. Endpoints:
- `GET /notifications/child-cap` — list active (non-dismissed) rows for the current owner profile
- `POST /notifications/child-cap/:id/dismiss` — set `dismissed_at = now()`

Tests in `notifications.test.ts` cover: owner can list own; child profile auth returns 403; cross-account access returns 404.

**Latency:** Per spec D4, in-app only; push deferred. The parent sees the notification next time they open the app — acceptable.

**Tests required:**
- Concurrency dedupe: 10 simultaneous cap-hit events for the same child + day → exactly 1 row (unique index + `onConflictDoNothing`).
- `safe-non-core.guard.test.ts` passes — the new dispatch uses `safeSend`.
- Owner-only notification: a Plus owner who hits 700/mo does NOT trigger a notification (the dispatch branches on `snapshot.role === 'child'`).
- Notification copy regression: child-cap notification code contains no "trial", "subscribe", or old child-paywall wording.
- Reset-time rendering: daily and monthly child-cap notifications render a localized timestamp from `resetsAt`; no hard-coded "midnight" or "1st" copy.
- Cross-account isolation: account A's owner cannot read account B's `/notifications/child-cap` rows.
- Dismiss is idempotent — calling dismiss on an already-dismissed row is a 200 no-op.

**Verification:**
- `pnpm exec nx test:integration api --testPathPattern=notify-parent|notifications`
- `cd apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-child-cap-notifications.ts --no-coverage`
- Manual: trigger child cap in dev, open parent's view, see banner; dismiss; refresh; banner gone.

**Rollback:** Revert. The new table is additive — drop only if zero-row at deploy time.

---

## PR 4 — `subscription-copy-i18n` + nav-contract spec amendment + onboarding intro discovery hint

(Renumbered from original PR 5.)

> ⚠ **BLOCKER — onboarding discovery hint placement is undecided.** Plan v1's resolved decision 2 ("add a single explanatory line on the onboarding intro's family-links screen") rests on a screen that does not exist. Verified by `glob apps/mobile/src/app/(app)/onboarding/**`: the actual onboarding flow has only `index.tsx` (redirect → `pronouns`), `pronouns.tsx`, and `language-setup.tsx`. There is no family-links screen. Resolve placement before PR 4 begins — see § "PR 4 Open issues" below.

**Goal:** Rewrite tier comparison around capacity. Delete invalidated translation keys across all 7 locales. Update spec docs. Add the onboarding discovery hint (once placement is resolved).

**Files:**
- `apps/mobile/src/app/(app)/subscription.tsx:59-139` — rewrite `TIER_FEATURE_INDICES` content (structure stays; copy keys change)
- `apps/mobile/src/i18n/locales/{en,de,es,ja,nb,pl,pt}.json` (7 files) — key rewrite (see below)
- `docs/specs/2026-05-21-navigation-contract.md` — re-amend the "Onboarding Intent" decision block
- `apps/mobile/src/app/(app)/onboarding/<TBD>.tsx` — once placement decided per PR 4 Open issues

**New feature messaging per tier (the four `subscriptionScreen.tierFeatures.{tier}.{0-3}` indices):**

- **Free** (`tierFeatures.free.{0-3}`):
  - "0": "Try it for you and one child"
  - "1": "100 questions/month, 10/day per profile"
  - "2": "Real Recaps and progress"
  - "3": "Core learning topics"
- **Plus** (`tierFeatures.plus.{0-3}`):
  - "0": "For adults who use it themselves"
  - "1": "700 questions/month, no daily cap"
  - "2": "Child uses Free-tier limits (100/mo, 10/day)"  ← critical to prevent the failure mode "Plus parent expects child to share their 700"
  - "3": "Recaps and progress for your child"
- **Family** (`tierFeatures.family.{0-3}`):
  - "0": "For households where the child is the main user"
  - "1": "1,500 shared questions/month across all profiles"
  - "2": "Up to 3 children + you"
  - "3": "Shared pool — use less yourself to give your child more"
- **Pro** (`tierFeatures.pro.{0-3}`):
  - "0": "For power households with multiple heavy users"
  - "1": "3,000 shared questions/month"
  - "2": "Up to 5 children + you"
  - "3": "All Family features"

**Keys to DELETE in all 7 locales:**
- `more.family.upgradeRequiredTitle`
- `more.family.upgradeRequiredMessage`
- `more.family.viewPlans` (if only referenced by the now-dead paywall — confirm via grep before deleting)
- `more.family.profileLimitTitle`
- `more.family.profileLimitMessage`
- Any child quota or notification copy that says "trial ended", "subscribe to continue", or implies Family Hub access expires.

**Keys to ADD:**
- `quota.parent.childCapHit.title` — "{{childName}} hit today's question limit"
- `quota.parent.childCapHit.dailyMessage` — "They can try again after {{resetAt}}. Family gives your household more room."
- `quota.parent.childCapHit.monthlyMessage` — "They can ask more questions after {{resetAt}}. Family gives your household a shared monthly pool."
- `quota.parent.childCapHit.dismiss` — "Dismiss"
- `onboarding.discovery.addChildHint` — "You can add a family member later under **More → Add a child**." (or equivalent — exact placement copy depends on the screen chosen)

**Per-locale work (Norwegian + Polish + Japanese deserve a careful translator pass, not literal MT):** flag in PR description; user is Norwegian, expect personal review of `nb.json` strings.

**Nav-contract spec amendment (`docs/specs/2026-05-21-navigation-contract.md`):**

The "Onboarding Intent" decision block (added 2026-05-24) needs editing:
- Strike the "intentionally lossy" justification — Family Hub is now reachable from every tier.
- `intent.tsx` stays deferred.
- **Per-Home empty-state CTA decision (user-chosen):** Do NOT broaden the `LearnerScreen.tsx` `showParentHome` condition. Adult owners with zero linked children continue to see LearnerScreen (the learner home).
- Discovery moves to onboarding (placement per PR 4 Open issues).

### PR 4 Open issues — must resolve before PR 4 starts

1. **Where does the discovery hint live?** The onboarding flow currently has no family-links screen. Three viable placements; user choice required:

   **Option A — Append to existing `pronouns.tsx` or `language-setup.tsx`.** A one-line note at the bottom of one of the existing screens. Pro: zero new infra. Con: hint is buried inside an unrelated screen; engagement is probably low.

   **Option B — New one-card onboarding screen after `language-setup`.** A dedicated short screen with the discovery hint as its single content. Pro: hint is the screen's whole purpose, can't be missed. Con: new screen + step indicator update + onboarding completion ordering changes.

   **Option C — One-time post-onboarding banner (dismissible) on the Home screen.** Rendered on first session after onboarding completes; dismissed forever after first interaction. Pro: every user sees it regardless of onboarding path; no flow-ordering change. Con: requires a per-profile "first session done" flag (likely already exists for onboarding; verify); skirts the "no Home CTA" user decision but as a one-shot, not a persistent affordance.

   **Pre-decision required.** Plan author recommendation: **Option C** (one-time banner). It's the only option that's guaranteed to be visible to every user regardless of how the onboarding intro evolves, and it doesn't conflict with the "Home should stay quiet" decision because it's a one-shot dismissible card, not a persistent CTA. Surface to user before PR 4 begins.

2. **`more.family.viewPlans` deletion.** Grep across the codebase to confirm this key is only referenced by the deleted paywall before deleting in PR 4. If used elsewhere (e.g. an account screen "view plans" link), keep it.

**Verification:**
- 7-locale parity check — confirm no key is in `en.json` but missing from another locale (the repo likely has a parity test; find via grep `i18n.*parity` or run the existing i18n CI step)
- Visual review of `subscription.tsx` rendered on small phone (Galaxy S10e, per user memory) — tier cards must not truncate on 5.8" screens
- `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/subscription.tsx --no-coverage`

**Rollback:** Revert.

---

## Cross-cutting verification (run after all 4 PRs ship)

Per spec § Tests required to merge, the full gate criteria:

```bash
# Server
pnpm exec nx run api:typecheck
pnpm exec nx run api:lint
pnpm exec nx run api:test
pnpm exec nx test:integration api

# Mobile
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec jest --no-coverage

# Schema
pnpm run db:generate:dev  # confirm no drift
```

**Manual E2E smoke (dev emulator):**
1. New Free account → add child → exhaust child's 10/day → confirm "ask your parent" copy, 402 includes `resetsAt`, parent sees quota-specific in-app notification on next session
2. Upgrade Free → Plus → confirm child still capped at 100/10, owner gets 700/no-cap, owner's `monthly_limit` was updated in place
3. Upgrade Plus → Family → confirm pool semantics restored, per-profile rows deleted
4. Downgrade Family → Plus on an account with 3 linked children → confirm owner + first child get Plus caps eagerly; children #2 and #3 lazy-provision on first decrement and emit `billing.profile_quota.lazy_provisioned`
5. Plus owner exhausts 700/mo, buys a top-up, makes a request → confirm `source: 'top_up'`; child on same account exhausts 100/mo → confirm `source: 'none'` (does NOT drain owner's top-up)
6. Plus owner enters `past_due` → confirm Recaps stays visible with a billing recovery banner and Free-level caps (`effectiveAccessTier: 'free'`); restored to Plus caps when payment recovers
7. Toggle `MODE_NAV_V0_ENABLED=true, MODE_NAV_V1_ENABLED=false` → confirm 5-tab guardian shape unchanged for an adult owner with linked children on Family; ALSO confirm 5-tab guardian shape appears for an adult Free owner with linked child (new state)
8. Sign in as a non-owner child profile → confirm no "upgrade" buttons surfaced anywhere; child's quota-exhaustion shows "Notify parent"

**Soft-launch monitoring (per spec sequencing step 11):**
- Quota-exhaustion rates per tier (owner vs child split)
- Free → Plus conversion (owner-quota-driven)
- Free → Family conversion (child-quota-driven)
- Plus → Family conversion (Plus parents whose child hits 100/mo regularly)
- Refund rate per tier
- Child-cap-hit → parent-notification-seen latency (should be ≤ 24h median)
- `billing.profile_quota.lazy_provisioned` rate — if non-zero on Free/Plus-created accounts, it indicates a bug in eager provisioning at profile-create time

---

## Resolved decisions (from user, 2026-05-25; updated 2026-05-25 post-review)

1. **Top-ups on per-profile tiers:** owner-only. Plus's `topUpAmount: 500` credits the owner's `profile_quota_usage` pool only; child cannot consume. Enforced via the new `top_up_credits.profile_id` column (PR 1 § 1E) and the `profileId`-scoped consume filter in `decrementProfileQuota` (PR 1 § 1D).
2. **Add-child discovery for adult owners with no children:** do NOT broaden `LearnerScreen.showParentHome`. Discovery happens at onboarding via a placement chosen in PR 4 Open issues (current author recommendation: one-time post-onboarding banner; user must confirm before PR 4 starts).
3. **Event dispatch timing:** dispatch + handler land together in PR 3. PR 1's metering changes do not emit the parent-notification event.
4. **PR shape:** 4 PRs (was 5 in plan v1 — the `llm-tier-resolve-helper` PR is deleted per CRITICAL-1, which directly contradicted spec D3).
5. **Model-tier resolution (per CRITICAL-1 + spec D3):** No `resolveProfileLlmTier` helper. Plus's advanced-rung premium routing is already correctly wired in `resolveExchangeLlmRouting`. PR 1 § 1G replaces the misleading comment block at `subscription.ts:43-46` with a two-layer documentation block.
6. **Bad-standing paid access:** Past-due/expired/non-entitled paid accounts fall back to effective Free instead of losing Family Hub. Cancelled accounts keep paid effective tier while still inside `currentPeriodEnd`; after entitlement ends, effective tier is Free.
7. **Child-cap notifications:** Use quota-specific in-app notification/copy with exact reset timing. Do not reuse `notify-parent-subscribe` or any trial/subscription-ended wording for quota exhaustion.

## Open questions (resolve before PR 1 ships)

1. **Backfill at ship time.** Per `project_pre_launch_no_users.md`, no real users exist as of 2026-05-09 (stores newly approved 2026-05-21). Verify zero Free/Plus accounts in production at PR 1 ship time. If any exist, ship a one-shot backfill script `scripts/backfill-profile-quota-usage.ts` in the same PR. Same check for `top_up_credits` rows requiring `profile_id` backfill.
2. **Onboarding discovery hint placement.** See PR 4 Open issues item 1. User decision required before PR 4 starts.

---

## Critical files reference

| File | What changes | PR |
|---|---|---|
| `apps/api/src/services/subscription.ts` | `TierConfig` shape + `TIER_CONFIGS` literal + comment correction (folded from deleted PR 2) | 1 |
| `apps/api/src/services/subscription.ts` / billing barrel | `resolveEffectiveAccessTier` helper for bad-standing paid → Free fallback | 1 |
| `packages/schemas/src/billing.ts` | Add `effectiveAccessTier`/`billingAccess` to subscription/status responses; add `resetsAt` to quota exceeded details | 1, 2 |
| `apps/api/src/services/subscription.test.ts` | Remove dead-field assertions, update maxProfiles, assert quotaModel | 1 |
| `packages/database/src/schema/billing.ts` | Add `profileQuotaUsage` table + `profileId` column on `topUpCredits` + covering index | 1 |
| `apps/api/src/migrations/<ts>_profile_quota_usage.sql` | Generated SQL | 1 |
| `apps/api/src/migrations/<ts>_top_up_credits_profile_id.sql` | Generated SQL | 1 |
| `apps/api/src/services/billing/metering.ts` | Branch on `quotaModel`; new `decrementProfileQuota`/`incrementProfileQuota` with lazy provisioning + owner-top-up fallthrough; `MeteringError` class; `consumeOwnerTopUpCredit` helper | 1 |
| `apps/api/src/services/billing/quota-provision.ts` (new) | `provisionProfileQuotaUsage` helper (idempotent via `onConflictDoNothing`) | 1 |
| `apps/api/src/services/billing/subscription-change.ts` | Tier/status-change reconciliation: Free↔Plus in-place, Plus→Family delete, Family→Plus owner+first-child provision, paid bad-standing → effective Free clamp | 1 |
| `apps/api/src/services/billing/trial.ts` | Extend `resetDailyQuotas` + `resetExpiredQuotaCycles` to also iterate `profile_quota_usage` | 1 |
| `apps/api/src/services/profile.ts:364-468` | Provision row on profile create; maxProfiles=2 path coverage; pass tier through to provisioner | 1 |
| `apps/api/src/middleware/metering.ts:620-664` | Extend 402 payload with `quotaModel` + `profileRole`; catch `MeteringError` → 500 | 1 |
| `apps/api/src/routes/revenuecat-webhook.ts` (or top-up mint site) | Set `profile_id` on new `top_up_credits` rows (default = buyer) | 1 |
| `apps/api/src/services/billing/metering.integration.test.ts` | Per-profile tests + BUG-627 regression + owner top-up + child no-top-up + lazy-provision + concurrency idempotency | 1 |
| `apps/mobile/src/lib/navigation-contract.ts` | Extend `NavigationSubscriptionContext` with `effectiveAccessTier`/`billingAccess`; `familyPlanOwner` → `isFamilyHubEligible` | 2 |
| `apps/mobile/src/hooks/<context builder>` | Pass through API-computed `effectiveAccessTier`/`billingAccess` | 2 |
| `apps/mobile/src/app/(app)/more/index.tsx:53-101` | Drop tier paywall on add-child | 2 |
| `apps/mobile/src/components/home/ParentHomeScreen.tsx:898-925` | Drop tier paywall on add-child | 2 |
| `apps/mobile/src/app/(app)/profiles.tsx:135` | Swap to `isFamilyHubEligible` | 2 |
| `apps/mobile/src/app/(app)/subscription.tsx` | Swap to `isFamilyHubEligible` (PR 2); rewrite tier copy (PR 4) | 2, 4 |
| `packages/database/src/schema/notifications.ts` (new) | `childCapNotifications` table | 3 |
| `apps/api/src/services/billing/metering.ts` | Emit `app/billing.profile_quota.exhausted` for child exhaustion | 3 |
| `apps/api/src/inngest/functions/notify-parent-child-cap-hit.ts` (new) | Parent notification handler with dedup | 3 |
| `apps/api/src/routes/notifications.ts` (new) | Owner-scoped notifications endpoints | 3 |
| `apps/mobile/src/hooks/use-child-cap-notifications.ts` (new) | Banner query hook | 3 |
| `apps/mobile/src/i18n/locales/*.json` (7 files) | Delete invalidated keys, add quota-specific reset-time keys (`quota.parent.childCapHit.*`), `onboarding.discovery.addChildHint`, `tierFeatures.*` | 3, 4 |
| `apps/mobile/src/app/(app)/onboarding/<TBD>.tsx` | Discovery hint placement (decision required) | 4 |
| `docs/specs/2026-05-21-navigation-contract.md` | Amend "Onboarding Intent" block | 4 |

---

## What this plan deliberately does NOT do

- No pricing changes (D5)
- No RevenueCat catalog edits beyond store-listing descriptions (D2)
- No `intent.tsx` screen (covered by onboarding discovery hint in PR 4)
- No "link existing child account" flow (spec § out of scope)
- No tutor/coach/classroom SKU
- No Family Hub trial state machine — quota IS the gate, no time-limited trial
- No per-profile premium model routing — D3 defers this; future change lands as an `isOwner` input to `resolveExchangeLlmRouting`, not as a parallel helper
- No push notifications for child-cap-hit (D4 — in-app only for v1)
- No `resolveProfileLlmTier` helper (CRITICAL-1 + spec D3 — explicitly forbidden in this rework)
- No child-targeted top-up purchase UI (spec out-of-scope — escape valve is "upgrade to Family")
- No dedicated downgrade-migration sweep UI (Family → Plus with 2+ children is handled by lazy provisioning + Plus child caps; capacity-planning sweep is a separate ticket)
