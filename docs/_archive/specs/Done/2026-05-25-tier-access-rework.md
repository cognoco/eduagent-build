# Tier Access Rework — Family Hub Open to All, Quota as the Single Commercial Gate

**Status:** Draft v3 — quota-as-gate model + second adversarial pass
**Date:** 2026-05-25

**Related:**
- [`apps/api/src/services/subscription.ts`](../../apps/api/src/services/subscription.ts) — current `TIER_CONFIGS`.
- [`docs/specs/2026-05-21-navigation-contract.md`](./2026-05-21-navigation-contract.md) — Study/Family navigation; the intent-screen decision in that spec is invalidated by this rework and will be re-amended.
- [`apps/mobile/src/app/(app)/more/index.tsx:53-94`](../../apps/mobile/src/app/(app)/more/index.tsx) — `handleAddChild` paywall path (tier check at lines 60-75; secondary `familyData.profileCount >= maxProfiles` check at 77-94).
- [`apps/mobile/src/components/home/ParentHomeScreen.tsx:898-925`](../../apps/mobile/src/components/home/ParentHomeScreen.tsx) — `handleAddChild` paywall logic (line 898 is the callback start; `navigateToCreateChildProfile` at line 876 is already used for the first-child case).
- [`apps/mobile/src/lib/navigation-contract.ts:250`](../../apps/mobile/src/lib/navigation-contract.ts) — `familyPlanOwner` tier check that gates the Recaps tab.

---

## Terminology

Throughout this spec, **"linked child"** means a child profile created by the parent on their own account, recorded by a `family_links` row. This is NOT the same as cross-account child linking (a separate two-sided verification flow that does not exist today and is explicitly out of scope; see the legal/compliance section). Any UI string in this rework that uses the word "link" must be reviewed against this distinction — see the legal-section note about not labelling UI "link a child" until the cross-account flow exists.

## Why this exists

The current tier design uses Family Hub access (Recaps, nudges, parent dashboard, add-child) as the commercial gate. Free and Plus cannot add a child profile; even if they could, they would not see any Family Hub surface. This makes Family mode invisible to anyone who has not already paid — every onboarding-discovery UX terminates at `/subscription` as a paywall tease.

The fix is to invert the model: **every tier gets the full Family product experience** (add a child profile, see Recaps, get nudges, view child progress). What differs across tiers is purely **capacity** — monthly quota, daily caps, and how many children can be linked. The parent sees the full product working on their actual child; they upgrade for more capacity or more children, not for access to features they have never seen.

This is a product-led-growth shift. The commercial lever moves from "feature lock" to "quota cliff."

---

## Decision

| Tier | Profiles | Owner quota | Child quota | Quota model | Family Hub |
|---|---|---|---|---|---|
| **Free** | Owner + 1 child (2 total) | 100/mo, 10/day | 100/mo, 10/day | Per-profile (separate pools) | Open |
| **Plus** | Owner + 1 child (2 total) | 700/mo, no daily cap | 100/mo, 10/day (same as Free child) | Per-profile (separate pools) | Open |
| **Family** | Owner + 3 children (4 total) | Shared 1500/mo pool | Shared 1500/mo pool | Shared pool across all profiles | Open |
| **Pro** | Owner + 5 children (6 total) | Shared 3000/mo pool | Shared 3000/mo pool | Shared pool across all profiles | Open |

**Differentiation across the ladder:**

- **Free → Plus:** 7× monthly quota for the owner, no daily cap for the owner. The child stays on the same Free-child cap (deliberately — Plus is positioned for adults who primarily use it themselves; child usage is the upgrade pressure to Family).
- **Plus → Family:** quota model switches from separated per-profile pools to a single shared pool (parent can use less to give child more), ~2× combined capacity, supports up to 3 children, multi-child comparison and household workflows become meaningful.
- **Family → Pro:** 2× the pool, supports up to 5 children. Power-household capacity only; not marketed as tutor/coach/classroom. (Per-profile premium-model routing was specified in the dead `premiumModelProfiles` field but never shipped — deferred per D3.)

**Quota model — why two shapes:**

- **Free and Plus use per-profile quotas.** The child cannot consume the parent's allocation, and vice versa. This protects the Plus parent's paid 700/mo from being chewed through by a child, and gives the child a predictable allocation. Library and memories are already per-profile, so a child session creates a child library on child quota — there is no leakage path.
- **Family and Pro use a shared pool.** The household is the unit; the parent can choose to use less so the child gets more; pool semantics match how families think about a shared subscription.

**Child profile is permanent, not a trial.** No tier has a time-limited Family Hub trial. The quota IS the commercial gate — running out of quota is the upgrade lever, daily and monthly, recurring. No "trial expired" UX, no state machine for trial expiry, no notifications about lost access. A Free family that stops using the product just sits there at 100/mo and 10/day until they re-engage; no cliff, no churn-inducing lockout.

**Bad-standing paid accounts degrade to Free access, not no access.** Subscription tier remains the billing/source-of-truth tier, but product capability is driven by an **effective access tier**. Trial/active paid subscriptions, and cancelled subscriptions still inside their paid access window, use their paid tier. Past-due, expired, or otherwise non-entitled paid subscriptions use effective Free: one child, Free per-profile caps, Family Hub still visible, and a billing banner explaining that paid capacity resumes after payment recovery. A lapsed Plus/Family user must never have less Family Hub access than a Free user.

**Marketing positioning per tier:**

- **Free** — try the product for both you and one child, lightly. Real Recaps, real progress, capped.
- **Plus** — for adults who primarily use it themselves. The child can use it under the Free child limits. Not the family tier.
- **Family** — for households where the child is the main user, or for multiple children. Shared pool means the parent can use less to give the child more.
- **Pro** — power households (multiple heavy users). Not a B2B/tutor/classroom product.

**Commercial guardrail:** Do not scale paid acquisition from this pricing until CAC/LTV is modeled from real activation and retention data. The first launch tests price and packaging; paid search/social spend is learning spend until lead-to-paid conversion, month-1 retention, and month-3 retention are measured.

**Competitive positioning:** The primary competitive substitute is not another family edtech plan; it is a parent sharing an existing general AI subscription (ChatGPT, Gemini). The product must visibly deliver what a shared general-AI login cannot: per-learner history, parent-visible progress, child-safe controls, Recaps, nudges, and clean separation between adult and child data. Opening Family Hub to all tiers is the mechanism that makes this competitive story visible to non-payers.

---

## Legal and compliance boundaries

Subscription tier is not the legal control for child access. The controls are consent state, guardian verification, privacy defaults, data minimization, retention/deletion, and vendor restrictions. **Opening Family Hub to all tiers does not change any of these — every protection below still runs on every tier.**

**Child profile rules:**

- A learner profile must never bypass age, consent, or family-link checks because the account is paid (or free).
- For under-consent-threshold users, create or expose learning data only after the required consent state is active, except for minimal data needed to request consent.
- Parent-created learner profiles still require the existing consent/legal basis path; the absence of a paywall is not proof of guardianship.
- Linking an existing child account is a separate two-sided verification flow and is not implemented by this spec. Do not label UI "link a child" until that flow exists.

**Voice handling under COPPA-adjacent policy:**

- Voice remains core product UX for learners; do not treat voice as optional polish.
- For child learners, raw audio must be transient by default: capture only to transcribe/respond, do not retain raw voice recordings, do not train models on them, and delete audio immediately after the request is handled.
- Store text transcripts only under the normal session/data-retention policy and consent state.
- Do not infer emotions from voice, tone, facial expression, camera feed, or other biometric/behavioral signals.
- Any future voice-retention feature requires explicit product/legal review before implementation.

**EU AI Act boundary:**

- Consumer tutoring, homework help, practice, and family progress support stay in scope for this consumer product.
- Do not ship features intended to determine admission, placement, educational level, formal learning-outcome evaluation, proctoring/test-cheating detection, or institutional student monitoring.
- Emotion recognition in education/workplace contexts is prohibited territory. Do not build it.

**Institutional sales gate:**

- No school, district, tutoring-center, or institutional sales channel until a separate institutional SKU is scoped with its own data model, contracts, compliance review, governance controls, and feature set.
- Do not rebrand Pro as Tutor/Coach/Classroom for launch. Tutors need a different product: student management, scheduling, reporting, roster/consent flows, FERPA-aware controls, and support expectations.

---

## What changes server-side

1. **`TIER_CONFIGS` updates** in `apps/api/src/services/subscription.ts`:
   - `free.maxProfiles`: `1` → `2`
   - `plus.maxProfiles`: `1` → `2`
   - Introduce per-profile quota fields for tiers using the per-profile model. Suggested shape: alongside the existing `monthlyQuota` / `dailyQuota`, add `ownerMonthlyQuota` / `ownerDailyQuota` / `childMonthlyQuota` / `childDailyQuota`. Free: owner 100/10, child 100/10. Plus: owner 700/no-cap, child 100/10. Family/Pro: leave existing pool fields, per-profile fields null.
   - A `quotaModel: 'per-profile' | 'shared-pool'` discriminator on each tier config makes the quota-service branch explicit and lint-checkable.

2. **Effective access tier helper:**
   - Add a server-side helper that returns `{ effectiveAccessTier, billingAccess }` from subscription tier/status/currentPeriodEnd.
   - `trial`/`active` paid subscriptions use the paid tier. `cancelled` subscriptions use the paid tier while `currentPeriodEnd` is still in the future. `past_due`, `expired`, and cancelled-after-window subscriptions use effective Free.
   - Use `effectiveAccessTier` for `canAddProfile`, quota metering, usage display, 402 upgrade options, and navigation status responses. Use raw `subscription.tier` only for billing/store copy.
   - Status-change handlers must reconcile `profile_quota_usage` limits when effective access changes without a raw tier change (for example Plus active → past_due clamps to Free caps; past_due → active restores Plus caps).

3. **Quota service refactor:**
   - Today: `account_id`-scoped pool lookup.
   - New: lookup branches on `tier.quotaModel`:
     - `'per-profile'` (Free, Plus) → look up cap by the active `profile_id` and its role (owner vs linked-child). Owner profile uses tier's owner cap; linked child uses the tier's child cap.
     - `'shared-pool'` (Family, Pro) → existing `account_id` pool lookup, unchanged.
   - Consumption tracking: for shared-pool tiers, keep the existing `quota_pools` table (`packages/database/src/schema/billing.ts:94-122`) — one row per subscription, counter at the pool level. For per-profile tiers, see the new "Schema migration" section below — a new `profile_quota_usage` table is required because `quota_pools.subscription_id` is uniquely indexed and cannot accept per-(subscription, profile) rows.
   - **Atomic-decrement SQL must be rewritten for per-profile tiers (HIGH-2).** The current hot-path UPDATE at `apps/api/src/services/billing/metering.ts:174-177` is keyed on `subscription_id` alone. Per-profile tiers need an atomic UPDATE keyed on `(subscription_id, profile_id)` with per-profile `monthly_limit` and `daily_limit` checks. The BUG-627 daily-cap concurrency regression (`metering.ts:277-281`) must be re-tested on the new branch — two concurrent child decrements at `used_today = daily_limit - 1` must not both succeed.
   - Exhaustion responses must include the quota model (and the active profile's role) in the 402 payload so the client can render the correct upgrade CTA ("upgrade to Plus" for Free owner; "upgrade to Family" for Plus owner or any child; "ask your parent" when the active profile is a child and has no purchase capability).

4. **`createProfileWithLimitCheck`** (`apps/api/src/services/profile.ts:401`) — honor `effectiveAccessTier`, not raw billing tier. Free/Plus active users allow one child; lapsed paid users fall back to Free's one-child cap. Sanity-test the 402 path on Free, Plus, and past-due Plus/Family.

5. **`updateProfileAppContext`** (`apps/api/src/services/profile.ts:547-561`) — when `defaultAppContext === 'family'`, currently throws `FAMILY_CONTEXT_NOT_ALLOWED` unless the profile is `isOwner === true` AND `computeAgeBracket(birthYear) === 'adult'` AND has at least one row in `family_links`. No tier check is involved — good. Verify this still works correctly when Family Hub is tier-independent: an adult-owner Free user with 0 linked children stays Study (no family_link row), an adult-owner Free user with 1 linked child can flip to Family. Add a regression test that an adult Free owner with a linked child profile successfully sets `family` context.

6. **Recaps generation** (`session-completed.ts:1138`) — already runs unconditionally per session, no tier check. No change needed for generation. The only change is on the display side (client).

7. **Drop dead `premiumModelProfiles` field (per D3).** Verification (2026-05-25) found `premiumModelProfiles` is defined on `TierConfig` and asserted in `subscription.test.ts` but **never read** by any runtime code path (`grep` across `apps/api/src` returns zero non-test, non-config consumers). The field is genuinely dead and can be removed safely.
   - Remove `premiumModelProfiles` from `TierConfig` and all four `TIER_CONFIGS` entries.
   - Remove the four `expect(config.premiumModelProfiles).toBe(...)` assertions in `subscription.test.ts`.
   - **Do NOT add a `resolveProfileLlmTier(account, profile)` helper in this rework.** Earlier drafts proposed one on the premise that the comment at `subscription.ts:43-46` ("Plus owner gets advanced-model access on hard rungs") was unfulfilled. Verification of `apps/api/src/services/session/session-exchange.ts:195-237` (`resolveExchangeLlmRouting`, called from `session-exchange.ts:1380`) shows the comment IS fulfilled: when `subscriptionTier === 'plus'` AND `effectiveRung >= GEMINI_ADVANCED_MODEL_MIN_RUNG`, the function returns `llmTier: 'premium'` — for every profile on the account, owner and child alike. Adding a profile-keyed helper that returns the base tier's `llmTier` uniformly would either (a) be misleading dead overhead if it doesn't replace `resolveExchangeLlmRouting`, or (b) silently regress Plus advanced-rung behavior if callers swap to it. Neither is acceptable for a rework scoped to tier access.
   - **Document the actual model-tier-resolution map** in the new comment that replaces the old `subscription.ts:43-46` block:
     - Base account tier → `TIER_CONFIGS[tier].llmTier` (Free `'flash'`; Plus/Family/Pro `'standard'`). This is what bulk/background callers read.
     - Per-exchange routing → `resolveExchangeLlmRouting({ subscriptionTier, requestedLlmTier, effectiveRung })` at `services/session/session-exchange.ts`. Plus on advanced rungs elevates to `'premium'`; Family is Gemini-only; the `requestedLlmTier === 'premium'` branch services the `AI_UPGRADE_ADDON` entitlement at `subscription.ts:91-96`.
   - **Future owner-only premium routing is its own work item** — when scoped, it lands inside `resolveExchangeLlmRouting` (already the single per-exchange decider) by accepting an `isOwner` input alongside `subscriptionTier`. The helper-and-lint-rule approach is deferred to that work and does not need preemptive plumbing now.

8. **Consent enforcement** — no logic change in principle, but tests must cover that the first Free **and** first Plus child profile do not expose learning/dashboard data unless the consent state permits it. Add explicit redaction tests for both tiers.

9. **Voice data** — verify the current STT/TTS path does not persist raw child audio. If any raw audio persistence exists, remove it or gate it behind a separate legal decision. Scope unchanged from v1.

## What changes client-side

1. **Drop the tier paywall on add-child:**
   - `more/index.tsx:60-75` — remove the `tier !== 'family' && tier !== 'pro'` check inside `handleAddChild`. Route directly to `create-profile?for=child`. The server's `createProfileWithLimitCheck` (`profile.ts:401-407`) returns 402 only when `canAddProfile` actually rejects.
   - `more/index.tsx:77-94` (MEDIUM-2) — after the tier paywall is removed, the secondary `familyData.profileCount >= familyData.maxProfiles` check at line 77 silently stops firing for Free/Plus because `useFamilySubscription` at line 42 only fetches for family/pro. **This is the intended outcome:** the server's `canAddProfile` 402 becomes the single maxProfiles gate for Free/Plus. Verify the 402 → user-facing error path in the client renders a sensible message.
   - `ParentHomeScreen.tsx:898-925` — drop the `tier !== 'family' && tier !== 'pro'` branch in `handleAddChild`. The existing `hasNoLinkedChildren` early-return at line 899 already routes directly via `navigateToCreateChildProfile`; align the "has children, wants to add more" branch with the same server-trust pattern.

2. **Family Hub display gates — open to all tiers (MEDIUM-4):**
   - **Predicate shape:**
     ```
     isFamilyHubEligible(context)
       = isAdultOwner(activeProfile)
         && !isParentProxy
         && linkedChildIds.length >= 1
         && subscription.status === 'ready'        // data has loaded
         && subscription.effectiveAccessTier !== null
     ```
     Raw billing tier is intentionally not in the eligibility check. Free and effective-Free fallback both keep Family Hub visible.
   - **Schema change required for this predicate to work.** The current `NavigationSubscriptionContext` at `apps/mobile/src/lib/navigation-contract.ts:64-66` only exposes `status: 'loading' | 'ready'` (a data-load discriminator) and `tier`. Extend it with `effectiveAccessTier: 'free' | 'plus' | 'family' | 'pro' | null` plus a billing-state hint such as `billingAccess: 'current' | 'free_fallback' | null`. The API should compute this server-side from subscription status and `currentPeriodEnd`; the client should not infer paid entitlement windows from local clock math.
   - **Why effective Free rather than hiding Family Hub.** Today, paid-feature gating for `past_due`/`cancelled`/`expired` is enforced server-side at API call time (the client tier check is a UX accelerator, not a security control). Family Hub display is a navigation-shape decision made client-side before any API call. If a lapsed Plus user loses Recaps while a Free user keeps Recaps, the product feels incoherent. The right fallback is visible Family Hub with Free capacity and a billing recovery banner.
   - **Flicker on Free cold load (per MEDIUM-3).** Free cold loads will briefly traverse `status: 'loading' → 'ready'`, hiding then showing the Recaps tab. Today's `familyPlanOwner` predicate has the same flicker, but only paid users hit it; Free was never family-shape eligible. After this rework, Free + linked-child cold loads also flicker. Acceptable for v1 — the loading-state hold is sub-second on warm Clerk sessions. If telemetry shows this is jarring, the follow-up is to cache the last-known shape in secure storage and seed the predicate with a "presumed-eligible" state while loading. Tracked as a soft-launch monitoring item, not a blocker.
   - `navigation-contract.ts:244-251` — replace `familyPlanOwner` (today: adult-owner + ready + family/pro tier) with `isFamilyHubEligible` (no tier check). This is what makes the Recaps tab visible.
   - `more/index.tsx:43,84` — replace tier check with `isFamilyHubEligible`.
   - `profiles.tsx:42,135` — same.
   - `subscription.tsx:686` — same; copy must lead with quota differentiation, not feature lock.

3. **Family-pool section stays family-only:**
   - `ParentHomeScreen.tsx:800` — `useFamilySubscription(tier === 'family' || tier === 'pro')` should stay tier-gated. Plus has separated per-profile pools, not a shared pool, so the "family pool" visualization is meaningless on Plus and would mislead. Leave this site alone.
   - `apps/api/src/routes/billing.ts:545` — same: the family-pool billing branch stays family/pro.

4. **Child quota exhaustion UX:**
   - On Free/Plus, when the child hits 10/day or 100/mo, the exhaustion screen needs different copy than the parent's: the child cannot upgrade. Say "ask your parent" (no purchase button), plain language, no jargon.
   - Add a parent-facing notification when child quota is exhausted (e.g. "Mia hit today's question limit"). In-app only for v1 per D4; push is a separate follow-up ticket.
   - Do not reuse the existing `notify-parent-subscribe` path or any "trial ended / subscribe to continue" copy for quota exhaustion. Child-cap notifications are quota-specific: "Mia used today's questions" or "Mia used this month's questions", with the recovery path tied to the exact cap.
   - Quota-exhaustion payloads must include an exact `resetsAt` timestamp. UI copy should say "They can try again after {{resetAt}}" (localized to the user's timezone) rather than hard-coded "midnight" or "the 1st".
   - On Family/Pro, the existing pool-exhaustion UI applies to whichever profile is active; no copy change.

5. **Recaps display** opens to all tiers via the new `isFamilyHubEligible` flag — no separate work, falls out of step 2 above.

6. **Marketing copy in `subscription.tsx`** — rewrite tier comparison around:
   - Owner monthly quota (100 → 700 → shared 1500 → shared 3000)
   - Owner daily cap (10 → none → none → none)
   - Child slots (1 → 1 → 3 → 5)
   - Quota model (per-profile → per-profile → shared pool → shared pool)
   - Model tier (Free `'flash'`; Plus/Family/Pro `'standard'`; per-profile premium routing deferred per D3)
   - **Not** "Family is where you can add kids" — that framing is gone.

7. **Translation keys (7 locales) — invalidated by this rework:**
   - `more.family.upgradeRequiredTitle/Message` — delete (no longer a paywall path).
   - `subscription.tier.*.features` — rewrite around the new differentiation matrix.
   - Any "add a child requires Family plan" string — delete.
   - Add new keys for child quota exhaustion ("ask your parent") and parent-facing child-exhaustion notification.

## What changes in the navigation-contract spec

The "Onboarding Intent" section's decision block (added 2026-05-24) needs rewriting:

- The "intentionally lossy" justification for hiding the family path on non-family tiers is gone — every tier can now reach Family Hub.
- A Home empty-state CTA for adult owners ("Add a learner profile") is safe to ship at any tier.
- A dedicated `intent.tsx` screen remains deferred; the Home CTA + the now-universal "add child" path cover discovery.
- The V0 → V1 hard constraint in the navigation-contract spec still applies independently: 5-tab V0 mode must not regress while V1 is being wired. The tier-access changes here are orthogonal to the V0/V1 nav-flag matrix and must not be conflated with it.
- **V0 + Free + linked child is a new state** (today impossible, because Free cannot have a linked child). `isLegacyV0FamilyCapable` at `apps/mobile/src/lib/navigation-contract.ts:217-222` already does NOT check tier — only `isAdultOwner` + has-linked-child. **Decision: V0 follows the same eligibility opening as V1.** A V0 Free user with a linked child sees the 5-tab guardian shape (`LEGACY_GUARDIAN_TABS`), consistent with the rest of this rework. Add an explicit regression test pinning this — V0 + Free + linked child → `LEGACY_GUARDIAN_TABS`; V0 + Free + no linked child → `STUDY_TABS`. The "V0 must not regress" constraint means existing V0 + paid + linked child still renders the same 5 tabs; it does NOT mean tier-based gating must remain in V0.

---

## Resolved decisions

| # | Decision | Rationale | Implementation note |
|---|---|---|---|
| **D1** | **Same child-exhaustion copy across Free and Plus.** Child sees "Ask your parent — you've used today's questions" regardless of tier. No tier-specific variant. | The child does not need to know about tiers, and one shared string is simpler and 7× cheaper to translate. Both Free and Plus child caps are identical (100/mo, 10/day), so different copy would just be cosmetic. | One translation key (e.g. `quota.child.exhausted`), used on both Free and Plus child profiles. Parent-facing notification copy stays neutral. |
| **D2** | **Keep RevenueCat entitlement IDs as-is; rewrite store-side descriptions only.** No entitlement re-scoping. | Entitlements map to tiers (free/plus/family/pro) — i.e. to capacity, not features. With Family Hub now feature-open across all tiers, the entitlement IDs remain accurate; only the marketing copy describing each tier changes. | Update store-listing copy (App Store Connect + Google Play Console) at next submission. Confirm no entitlement is feature-named (e.g. `family_hub_access`) before code change. Not blocking ship. |
| **D3** | **Drop `premiumModelProfiles` (dead field). Do NOT add a `resolveProfileLlmTier` helper.** | Verification (2026-05-25) confirmed `premiumModelProfiles` has zero non-test, non-config consumers and can be removed safely. Verification also corrected the original premise: the "Plus owner gets advanced-model access on hard rungs" comment at `subscription.ts:43-46` IS fulfilled — by `resolveExchangeLlmRouting` at `services/session/session-exchange.ts:195-237`, which keys on `subscriptionTier === 'plus'` + `effectiveRung >= GEMINI_ADVANCED_MODEL_MIN_RUNG` and returns `'premium'`. A profile-keyed helper that returns base `TIER_CONFIGS[tier].llmTier` uniformly would either be misleading dead overhead or silently regress Plus advanced-rung behavior depending on which callers adopt it. | Implementation in server-side step 6. Field deletion is TS-only, zero behavior change. The replacement comment in `subscription.ts` documents the actual two-layer resolution: base account `llmTier` for bulk/background callers + `resolveExchangeLlmRouting` for per-exchange routing (which is where the AI_UPGRADE_ADDON's `requestedLlmTier === 'premium'` and Plus's advanced-rung elevation both live). Future owner-only premium routing, when scoped, adds an `isOwner` input to `resolveExchangeLlmRouting` rather than a parallel helper. |
| **D4** | **In-app notification only when child hits cap, no push.** Accepts 0–N hour delay between cap-hit and parent awareness (until the parent next opens the app). | Push requires opt-in flow, store-review consideration, and infra plumbing we have not built. In-app is sufficient to validate the mechanic. The latency window (child hits cap at 10am at school → parent sees notification at 6pm at home) is acceptable for v1 — the parent still gets the upgrade signal that evening, just not in the moment. Push is a v2 follow-up if soft-launch data shows parents missing the moment matters for conversion. | In-app banner / notification badge on Family Hub. New translation keys for both the child-side ("ask your parent") and parent-side ("Mia hit today's question limit") strings. Track in soft-launch monitoring: time between child-cap event and parent's first session containing the notification view. |
| **D5** | **Ship Family at current `$28.99/mo`. No pricing experiment in this rework.** | The original spec's commercial guardrail still holds: pricing is not approved for scaled paid acquisition until CAC/LTV is measured. With no real users and stores newly approved (2026-05-21), there is no data to motivate a price change. Running a `$24.99` experiment without baseline conversion data measures noise, not signal. | Pricing experiment deferred to a separate ticket once we have ≥30 days of paid-conversion data post-launch. Trigger: if Free→Family conversion is below the threshold set in soft-launch monitoring (item 9 of Sequencing). |
| **D6** | **Recap retention follows the existing session/data-retention policy. No special handling for non-upgrading accounts.** | Recaps live on the child profile. As long as the account is active (Free or paid), session history is visible. If the account is deleted, deletion cascades per the existing privacy/deletion policy. There is no tier-conditional retention path. | No code change. Spec-level confirmation only. Verify via the existing deletion test that child Recap rows are included in the account-delete cascade. |
| **D7** | **Accept the Free 200/mo theoretical max. No mitigation.** | Adult-only Free is still 100/mo (only the owner profile exists; the extra 100 only materializes if a child is actually present). For Free families with a child, the deliberate product promise is "your kid can actually use this" — capping it shared at 100 would re-create the hollow-promise problem that motivated this rework. **Post-rework, the 10/day per-profile cap (a new mechanism introduced by this rework — see CRITICAL-1 and the new `profile_quota_usage` table) is the binding daily constraint for active users.** | No code change beyond what CRITICAL-1 already brings in. Soft-launch monitoring tracks Free retention and Free→Plus conversion; revisit if Free family retention is anomalously high (suggests Free is meeting too much demand). |

## Schema migration (per CRITICAL-1)

Per-profile quota tracking for Free/Plus requires a new table. The existing `quota_pools` table (`packages/database/src/schema/billing.ts:94-122`) is uniquely indexed on `subscription_id` (one row per subscription) and tracks `usedThisMonth` / `usedToday` at the pool level. The unique constraint blocks per-(subscription, profile) rows. Free/Plus need per-profile counters; Family/Pro continue to use the pool-level counter unchanged.

**Approach: new `profile_quota_usage` table.** Leave `quota_pools` intact for Family/Pro. Add a sibling table keyed on `(subscription_id, profile_id)` for per-profile tiers.

```sql
CREATE TABLE profile_quota_usage (
  id uuid PRIMARY KEY DEFAULT generate_uuid_v7(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  monthly_limit integer NOT NULL,
  used_this_month integer NOT NULL DEFAULT 0,
  daily_limit integer,
  used_today integer NOT NULL DEFAULT 0,
  cycle_reset_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CHECK (used_this_month >= 0),
  CHECK (used_today >= 0),
  UNIQUE (subscription_id, profile_id)
);
CREATE INDEX profile_quota_usage_subscription_idx
  ON profile_quota_usage(subscription_id);
```

**Why a new table, not a composite key on `quota_pools`:**

- `quota_pools` has `unique(subscription_id)`. Dropping that constraint breaks every existing query that finds the pool by subscription_id alone (e.g. `findQuotaPool__unscoped`) and ripples through the hot path at `metering.ts:174-177`.
- The existing pool decrement carries known concurrency-bug history (BUG-627 at `metering.ts:277-281`). Keeping that code path intact for Family/Pro reduces the regression surface.
- Per-profile tracking is isolated to Free/Plus today. Future tier additions pick their model without re-migrating the shared-pool table.

**Branching in metering hot path:**

```ts
// services/billing/metering.ts
export async function decrementQuota(db, subscriptionId, profileId) {
  const tier = await getTierForSubscription(db, subscriptionId);
  if (TIER_CONFIGS[tier].quotaModel === 'per-profile') {
    return decrementProfileQuota(db, subscriptionId, profileId);
  }
  return decrementPoolQuota(db, subscriptionId, profileId); // existing path, unchanged
}
```

`decrementProfileQuota` mirrors the atomic-UPDATE pattern from the existing pool decrement, keyed on `(subscription_id, profile_id)`:

```sql
UPDATE profile_quota_usage
SET used_this_month = used_this_month + 1,
    used_today = used_today + 1,
    updated_at = NOW()
WHERE subscription_id = $1
  AND profile_id = $2
  AND used_this_month < monthly_limit
  AND (daily_limit IS NULL OR used_today < daily_limit)
RETURNING used_this_month, monthly_limit, used_today, daily_limit;
```

**Row provisioning.** A `profile_quota_usage` row is created when (a) a Free or Plus account is created (owner row) and (b) when a child profile is added to a Free or Plus account (child row). Provisioning happens inside the same transaction as profile creation so a partial state is not observable. On tier change, see the Rollback section for downgrade considerations.

**Concrete provisioning examples:**
- Free owner row: `monthly_limit: 100, daily_limit: 10, used_this_month: 0, used_today: 0`.
- Free child row: `monthly_limit: 100, daily_limit: 10, used_this_month: 0, used_today: 0`.
- Plus owner row: `monthly_limit: 700, daily_limit: NULL, used_this_month: 0, used_today: 0`. (`NULL` daily_limit means no daily cap; the atomic-UPDATE guard at line 251 already handles `daily_limit IS NULL`.)
- Plus child row: `monthly_limit: 100, daily_limit: 10` — identical to Free child by deliberate design (per the tier matrix).

**Lazy-provisioning fallback for orphaned profiles (per HIGH-3).** If a `profile_quota_usage` row is missing when `decrementProfileQuota` runs (most likely cause: a Family → Plus downgrade where the per-profile rows for children #2 and #3 were never created at downgrade time), the metering function provisions a row on-the-fly using the active tier's child cap (Plus child: `100/10`; Free child: `100/10`) and then retries the atomic UPDATE in the same transaction. The lazy-provision branch logs `profile_quota_row_lazy_provisioned` with `{ subscription_id, profile_id, tier }` so observability catches downgrade-induced orphan creation. This makes the Family → Plus downgrade gracefully degrade (children get child-cap quotas) without requiring an explicit migration sweep; the sweep is still desirable for capacity-planning visibility but is no longer a blocker.

**Reset orchestration (per HIGH-2).** Daily and monthly resets must extend to the new table. Two cron functions exist today against `quota_pools`:
- The monthly reset (cycle rollover on `cycle_reset_at`) and the daily reset (UTC midnight against `used_today`) both iterate `quota_pools`. This rework extends both functions to also iterate `profile_quota_usage` with the same semantics — `used_this_month = 0` and `cycle_reset_at += interval '1 month'` on the monthly job; `used_today = 0` on the daily job. Both writes happen in the same Inngest step so a partial reset is observable rather than silent.
- Each `profile_quota_usage` row carries its own `cycle_reset_at` so per-profile rows can be created mid-cycle (new child added on day 15) without unifying timestamps across the subscription.
- Integration test (gate criterion below): provision a Free family on day 1 with `cycle_reset_at = day 30`; consume some quota on owner + child rows; advance simulated time to day 30; confirm both rows reset.
- Daily reset test: same fixture, advance one day, confirm `used_today` resets to 0 on both rows but `used_this_month` is untouched.

**Tier-change handling for `profile_quota_usage` rows (per MEDIUM-4).** When an account changes tier mid-cycle:
- Free → Plus (upgrade): existing owner row's `monthly_limit` is updated in-place from 100 → 700; `daily_limit` is updated from 10 → NULL. Existing child row is unchanged (Plus child caps match Free child caps). `cycle_reset_at` is preserved (the user's billing cycle anchor doesn't change).
- Plus → Family (upgrade): per-profile rows are deleted in the same transaction that creates/updates the `quota_pools` row. Counters are NOT migrated — the user's used quota effectively resets, which is the upgrade reward. Document this explicitly in the marketing copy ("upgrade resets your quota").
- Family → Plus (downgrade): per-profile rows for owner + first child are created with the Plus caps. Children #2 and #3 are NOT auto-provisioned — they are lazy-provisioned on first decrement attempt per the HIGH-3 fallback above. The shared `quota_pools` row stays for now (idempotent — nothing reads it on Plus) and is cleaned by a follow-up sweep; or it is deleted in the same transaction. Spec author choice: pick one in the implementation PR and document.
- Family → Free / Plus → Free (downgrade): per-profile rows are reset to Free caps; existing usage counters are preserved (Free user inherits whatever they've used this cycle).

**Concurrency regression coverage.** The BUG-627 daily-cap race must be re-tested on the new branch: two concurrent decrements at `used_today = daily_limit - 1` must result in exactly one success and one failure. Reuse the existing concurrency-test pattern from `metering.integration.test.ts`.

**Top-up credit ownership under per-profile quotas (per HIGH-1).** `top_up_credits` (`packages/database/src/schema/billing.ts:154-175`) is keyed on `subscription_id` only — currently any profile on a Plus subscription would drain a top-up the owner purchased, breaking per-profile isolation. Decision for this rework: **top-ups belong to the purchasing profile.**
- Schema: add `profile_id uuid NOT NULL REFERENCES profiles(id)` to `top_up_credits`. Add a covering index `(subscription_id, profile_id, expires_at)`.
- Metering fallback (`metering.ts:236+`): filter top-up lookup by `eq(topUpCredits.profileId, profileId)` in addition to subscription_id, for per-profile tiers only. Shared-pool tiers (Family/Pro) keep current subscription-only filter — they intentionally pool top-ups across the household.
- Pre-launch caveat: no real top-ups exist today (no real users), so the migration is a one-line `ALTER TABLE` + index add with no backfill. Re-verify zero-row count at ship time.
- Purchase UI: when a per-profile-tier owner buys a top-up, default the credit to the owner profile. Plus parents do not have a way to buy a top-up *for* their child today — defer to a follow-up; the failure mode is "child runs out, parent upgrades to Family." Tracked in Out of scope.

## Rollback (per HIGH-3)

| Change | Reversible? | Data loss? | Recovery procedure |
|---|---|---|---|
| Add `profile_quota_usage` table | Yes — additive | None | `DROP TABLE profile_quota_usage CASCADE`. Revert code that reads/writes it. Daily/monthly reset crons fall back to iterating only `quota_pools`. |
| Add `profile_id` column to `top_up_credits` | Yes — additive (NOT NULL with default = NULL until rows exist) | None pre-launch (zero rows). If post-launch, the column captures ownership data that would be lost on revert. | Pre-launch: `ALTER TABLE top_up_credits DROP COLUMN profile_id`. Post-launch: do not revert; ownership data is product-meaningful. |
| Extend daily/monthly reset crons to iterate `profile_quota_usage` | Yes | None (no data deleted; reset is idempotent) | Remove the second-table iteration step from each cron function. Per-profile rows are still readable but stop being reset — only matters if `profile_quota_usage` itself is also kept; otherwise no-op. |
| Drop `premiumModelProfiles` field from `TierConfig` (TS-only) | Yes | None — field was never read at runtime | Restore the field + 4 test assertions from git. Also restore the original `subscription.ts:43-46` comment OR keep the corrected two-layer comment block — the corrected comment is accurate regardless of whether the field is present. |
| Add `quotaModel` field to `TierConfig` (TS-only) | Yes | None — additive | Restore prior config from git. |
| Per-profile quota fields on `TierConfig` (TS-only) | Yes | None — additive | Restore prior config from git. |
| Add effective-access fields to subscription/navigation context (TS/schema-only) | Yes | None — additive | Revert the type/schema + remove the fields from the hook that builds the context. `isFamilyHubEligible` falls back to the pre-rework `familyPlanOwner` predicate or to an open-without-billing-gate behavior, depending on the revert strategy. |
| `maxProfiles: 1 → 2` for Free / Plus | Yes (config flip) | Profiles created during the live window persist | Reverting the config does not delete child profiles already created. Operator must run an archival sweep on Free/Plus accounts that have `profile_count > 1`. **No automatic cascade — explicit human approval required before the sweep.** |

**Deploy ordering risk.** New server code reads from `profile_quota_usage`. If code ships before the migration runs, all Free/Plus consumption fails with a missing-table error. Per CLAUDE.md ("A worker deploy does not migrate Neon. Apply the target migration before shipping code that reads new columns."), the migration must land in staging+production before the code deploy. CI must enforce this — no co-deploy of migration + code without explicit acknowledgement in the PR description.

**Pre-launch caveat.** Per `project_pre_launch_no_users.md`, no real users exist at the time of this spec. The rollback table assumes a zero-user state at first ship; once real users exist, the per-profile counter rows in `profile_quota_usage` become user data and any rollback that drops the table loses billing-relevant history. Re-verify the user state at ship time.

## Tests required to merge (per LOW-2)

Gate criteria — these tests must exist and pass before this rework merges:

- **`TIER_CONFIGS` shape:** `free.maxProfiles === 2`, `plus.maxProfiles === 2`, `quotaModel` discriminator present on all four tiers, `premiumModelProfiles` field absent.
- **`canAddProfile`:** returns true for first child on Free (was false); returns false for second child on Free/Plus; family/pro behavior unchanged up to their caps.
- **Per-profile decrement (Free):** owner consumes own 100/mo pool independently of child; child consumes own 100/mo pool; cross-consumption is impossible.
- **Per-profile decrement (Plus):** owner consumes 700/mo with no daily cap; child capped at 100/mo + 10/day; child cannot tap owner's pool.
- **Daily-cap concurrency (BUG-627 regression):** two concurrent child decrements at `used_today = 9` — exactly one succeeds.
- **Shared-pool decrement (Family/Pro):** existing tests pass; no regression in pool semantics.
- **`TIER_CONFIGS[tier].llmTier`** (base, what bulk/background callers see): Free → `'flash'`; Plus/Family/Pro → `'standard'`. Removal of `premiumModelProfiles` does not change any of these.
- **`resolveExchangeLlmRouting` regression coverage** (existing tests at `apps/api/src/services/session/session-exchange.test.ts:327+` must continue to pass unchanged): Plus at advanced rung → `'premium'` for both owner and child profiles on the account (current behavior, preserved). Family stays Gemini-only. The `requestedLlmTier === 'premium'` branch (AI_UPGRADE_ADDON entitlement) is unaffected by this rework.
- **`updateProfileAppContext`:** adult Free owner with 1 linked child can set `'family'`; non-owner cannot; under-18 owner cannot.
- **`isFamilyHubEligible`:** adult Free owner with linked child → true; adult Free owner with 0 children → false; non-owner child profile → false; `past_due` Plus owner with linked child → true via effective Free and shows a billing recovery banner; Free owner with linked child + billing data not yet loaded → false (during the loading flicker window).
- **V0 navigation regression:** V0 + Free + linked child → `LEGACY_GUARDIAN_TABS` (new state introduced by this rework); V0 + Free + no linked child → `STUDY_TABS`; V0 + Family + linked child → `LEGACY_GUARDIAN_TABS` (unchanged).
- **Top-up profile scoping:** Plus owner's top-up credit is only consumed by owner sessions; Plus child sessions never decrement an owner-owned top-up. Family/Pro top-ups remain pool-wide (consumed by any active profile).
- **Lazy row provisioning:** simulate a Family → Plus downgrade by deleting `profile_quota_usage` rows for children #2 and #3; first decrement attempt for child #2 succeeds and creates a row with Plus child caps (`100/10`); a `profile_quota_row_lazy_provisioned` event is logged.
- **Reset cron coverage:** monthly reset job iterates `profile_quota_usage` rows whose `cycle_reset_at <= now()` and zeroes `used_this_month` + advances `cycle_reset_at`; daily reset job iterates all `profile_quota_usage` rows and zeroes `used_today` without touching `used_this_month`.
- **Tier upgrade in-place quota update:** Free → Plus on an existing owner row updates `monthly_limit` 100 → 700 and `daily_limit` 10 → NULL without resetting `used_this_month` (the user's accumulated usage carries; the cap just raises).
- **402 payload includes effective access tier + quota model + profile role.** Client renders correct upgrade CTA per (effective tier, model, role) pair.
- **402 payload includes exact reset timing.** Daily exhaustion returns the next daily reset timestamp; monthly exhaustion returns the profile/pool cycle reset timestamp. Parent notifications and quota cards render this timestamp rather than hard-coded reset wording.
- **Consent redaction:** Free child profile + `WITHDRAWN` consent returns redacted data (parent sees consent state, not learning metrics). Same for Plus child.
- **Client paywall removal:** Free user's `handleAddChild` routes directly to `create-profile?for=child` with no platformAlert.
- **Recaps tab visibility (V1 nav):** Free adult owner with linked child sees the Recaps tab via `isFamilyHubEligible`.
- **V0 regression:** `MODE_NAV_V0_ENABLED=true, MODE_NAV_V1_ENABLED=false` still renders the 5-tab guardian shape unchanged.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Free owner hits 100/mo | Owner per-profile quota exhausted | Existing quota-exhausted UI with upgrade-to-Plus CTA | Upgrade or wait to month rollover |
| Free child hits 100/mo or 10/day | Child per-profile quota exhausted | "Ask your parent" message; parent gets in-app notification | Parent upgrades to Family (lifts both caps via shared pool) or child waits |
| Free user with child tries to add 2nd child | `maxProfiles: 2` exceeded | 402 from server with upgrade-to-Family CTA | Upgrade |
| Plus owner hits 700/mo | Owner per-profile pool exhausted | Existing exhaustion UI with upgrade-to-Family CTA | Upgrade or wait to month rollover |
| Plus child hits 100/mo or 10/day | Child per-profile quota exhausted | "Ask your parent" — child cannot buy upgrade | Parent upgrades to Family |
| Plus parent expects child to share their 700 | Misread of the tier's quota model | Child hits 100/10 cap fast despite parent paying $18.99 | `subscription.tsx` copy must explicitly say "for your usage primarily; child uses Free-tier limits" — Q in copy review |
| Paid account falls out of entitlement | Payment failure, expiry, or cancelled subscription after the paid access window | Family Hub remains visible with a billing banner; capacity behaves like Free | Fix billing to restore paid capacity, or continue on Free caps |
| Existing paying user downgrades Family → Plus with 2+ linked children | Subscription change | Existing over-cap UX (orphaned child profiles) | Out of scope for this spec; flag for review |
| Reader assumes `premiumModelProfiles` is the mechanism behind Plus's advanced-rung premium routing | The field is dead — never read anywhere — but the comment at `subscription.ts:43-46` made it look load-bearing | Spec/tier-work decisions get scoped against a misunderstood mechanism (e.g. an earlier draft of this very spec proposed a `resolveProfileLlmTier` helper on a false premise) | Per D3: drop the field, and replace the misleading comment with a two-layer documentation block (base `TIER_CONFIGS[tier].llmTier` for bulk callers + `resolveExchangeLlmRouting` for per-exchange routing, which is the actual home of Plus's `'premium'` elevation on advanced rungs). |
| Orphaned child profile after Family → Plus downgrade has no `profile_quota_usage` row | Tier-change handler did not provision rows for children #2+ at downgrade time | Lazy provisioning fallback in `decrementProfileQuota` creates the row with Plus child caps on first attempt; child session proceeds; `profile_quota_row_lazy_provisioned` is logged | None needed at user level — degrade is graceful; capacity-planning sweep is a separate ticket |
| `top_up_credits` migration ships without `profile_id` backfill | Schema change adds NOT NULL column to a table that may have rows | Pre-launch state means zero rows, so backfill is unnecessary; verify zero-row count at deploy time | If non-zero rows exist at ship, add a backfill that defaults `profile_id` to the subscription's owner profile and ship the migration in two steps (nullable → backfill → NOT NULL) |
| Family quota pool exhausted mid-session for child | 1500 monthly cap hit on day 20 | All profiles see exhaustion; recovery = upgrade or rollover | Standard pool exhaustion UX |
| First Free or Plus learner exposes child data without consent | New cap allows profile creation but consent is pending/withdrawn | Parent sees consent state, not learning metrics | Server redaction/protected-data response; complete consent. Test coverage required on both tiers. |
| Raw child audio is retained | Voice capture path saves audio files | Legal/privacy risk invisible to user | Delete raw audio immediately after transcription/response; keep only permitted text/session records |
| Pro is marketed as tutor/classroom | Paywall copy says Tutor/Coach/Classroom | Users expect B2B/tutor features that do not exist | Remove positioning; create separate institutional/tutor SKU before selling |
| Institutional buyer requests pilot | School/district asks to use consumer app | Compliance scope expands to FERPA/AI Act/institutional controls | Do not sell; route to future institutional-SKU discovery |
| Free family-pool UI accidentally rendered on Plus | Forgot to keep `ParentHomeScreen.tsx:800` tier-gated | Plus parent sees "family pool" with confusing numbers | Keep `useFamilySubscription(tier === 'family' || tier === 'pro')` as-is; do NOT replace with the family-hub eligibility flag at that site |

---

## Out of scope

- Pricing changes — current `$0 / $18.99 / $28.99 / $48.99` stays for code; pricing not approved for scaled paid acquisition until CAC/LTV measured.
- RevenueCat catalog updates beyond description rewording — separate ticket.
- Hide-switcher preference (rejected earlier in conversation).
- Dedicated `onboarding/intent.tsx` screen — deferred; Home CTA + universal add-child covers discovery.
- "Link existing child account" flow — not built; not blocked by this rework but blocks any UI labelled "link a child."
- School/district, tutor, coach, classroom SKU — explicitly not launch scope.
- Time-limited Family Hub trial on Free — rejected in favor of permanent open access with quota as the gate. No trial-expiry state machine, no expiry notifications, no degraded-view fallback.
- Migration of existing real users to the new quota model — not required at launch per `project_pre_launch_no_users.md` (verify at ship time).
- Parent-controlled quota allocation on shared-pool tiers (Family/Pro) — the pool is first-come, first-served today; "the parent can use less so the child gets more" works through self-restraint, not a UI affordance. Per-profile reservation/cap UI is a deferred feature, not a blocker for this rework.
- Downgrade migration path (Family → Plus with 2+ linked children) — orphaned child profiles are handled by the lazy-provisioning fallback in the Schema Migration section (gracefully degrades to Plus child caps on first decrement attempt; no user-facing block). A dedicated archive-sweep UI for parents to clean up old child profiles is a separate ticket and not blocking this rework.
- Buying a top-up *for* a specific child profile on Plus — the schema change in this rework (adding `profile_id` to `top_up_credits`) is forward-compatible with the feature; the purchase UI currently defaults top-ups to the buyer. A child-targeted top-up purchase flow is a separate ticket. Today's escape valve for "child runs out, parent wants to buy more without upgrading" is to upgrade to Family.

---

## Sequencing

This is a product re-architecture, not a one-PR change. Suggested order:

1. **Apply review findings** — two adversarial-review passes completed 2026-05-25. First pass applied CRITICAL-1, HIGH-1/2/3, MEDIUM-1/2/3/4/5, LOW-1/2 (initial draft → v2). Second pass corrected the misread of `resolveExchangeLlmRouting` (dropped the proposed `resolveProfileLlmTier` helper), added a paid-status access input to `isFamilyHubEligible` (CRITICAL-2 in pass 2), added `profile_id` to `top_up_credits` (HIGH-1 in pass 2), defined reset-cron extension to `profile_quota_usage` (HIGH-2), added lazy-provisioning fallback for orphaned profiles (HIGH-3), pinned V0 + Free + linked-child behavior, documented flicker, and added a terminology glossary. Third pass changed bad-standing paid behavior from hidden Family Hub to effective-Free fallback, and tightened child-cap notification/reset-time copy. Subsequent reviews can re-run the `challenge` skill if the scope shifts.
2. **Server change (1) — `TIER_CONFIGS`** — `maxProfiles: 2` for Free/Plus, per-profile quota fields, `quotaModel` discriminator. **Drop the dead `premiumModelProfiles` field** and update `subscription.test.ts` accordingly (per D3). Tests for the new config shape.
3. **Server change (2) — Schema migration + quota service refactor** — Create the new `profile_quota_usage` table per the Schema Migration section (CRITICAL-1). Branch `decrementQuota` / `incrementQuota` by `tier.quotaModel` (per-profile for Free/Plus → new table; account-pool for Family/Pro → existing `quota_pools`, unchanged). Re-run the BUG-627 concurrency regression on the new branch. Migration ships before code per the Rollback section's deploy-ordering note.
4. **Server change (3) — Drop dead `premiumModelProfiles` field + comment correction (per D3)** — Delete the field from `TierConfig` and all four `TIER_CONFIGS` entries. Delete the four `expect(config.premiumModelProfiles).toBe(...)` assertions in `subscription.test.ts`. Replace the misleading "Plus is the one-person serious-study plan… selectable advanced-model profiles" comment block at `subscription.ts:43-46` with a two-layer documentation block that names `resolveExchangeLlmRouting` as the per-exchange decider (where Plus's advanced-rung `'premium'` routing actually lives) and `TIER_CONFIGS[tier].llmTier` as the base for bulk callers. **No helper added; no routing-code call sites change.** Existing `resolveExchangeLlmRouting` tests at `session-exchange.test.ts:327+` must continue to pass unchanged.
5. **Server change (4) — `top_up_credits.profile_id` migration** — Add `profile_id uuid REFERENCES profiles(id)` to `top_up_credits` (NOT NULL in the long run, but ship as nullable + zero-row verification at deploy to avoid backfill complexity). Add `(subscription_id, profile_id, expires_at)` covering index. Update metering fallback in `metering.ts:236+` to filter top-up lookup by `profileId` for per-profile tiers; Family/Pro keep current subscription-only filter. RevenueCat purchase webhook → default the credit to the buying profile (owner today).
6. **Client gating cleanup** — Drop tier paywall on add-child (`more/index.tsx`, `ParentHomeScreen.tsx`). Extend subscription status/context with `effectiveAccessTier` and a billing fallback hint computed by the API. Introduce `isFamilyHubEligible` derived flag. Replace tier checks at the four family-hub display sites (`navigation-contract.ts`, `more/index.tsx`, `profiles.tsx`, `subscription.tsx`). Leave `useFamilySubscription` family-pool gates alone.
7. **Child quota UX** — "Ask your parent" exhaustion screen + quota-specific parent in-app notification when child hits cap. Do not reuse subscribe/trial-ended notification paths. Render exact reset timing from the server payload.
8. **Consent + voice verification** — tests/audit proving first Free and first Plus learner creation respects consent redaction and no raw child audio is retained.
9. **Marketing copy + translations** — `subscription.tsx` rewrite + 7 locale files. Delete invalidated keys.
10. **Navigation-contract spec amendment** — replace "intentionally lossy" decision with the Home-CTA approach. Build the Home empty-state card. Update the V0 regression test to cover the new V0 + Free + linked child state.
11. **Soft-launch monitoring** — quota-exhaustion rates per tier (especially Free-owner vs Free-child), activation, week-1/month-1 retention, lead-to-paid conversion (Free→Plus, Free→Family, Plus→Family), refund rates per tier. Calibrate caps and prices before paid scale. Track Recaps-tab flicker duration on Free cold loads (MEDIUM-3 follow-up trigger).
