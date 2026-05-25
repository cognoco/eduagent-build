# Tier Access Rework — First Learner on Every Tier, Family Depth as the Gate

**Status:** Draft — legal/commercial tightening applied
**Date:** 2026-05-25

**Related:**
- [`apps/api/src/services/subscription.ts`](../../apps/api/src/services/subscription.ts) — current `TIER_CONFIGS`.
- [`docs/specs/2026-05-21-navigation-contract.md`](./2026-05-21-navigation-contract.md) — Study/Family navigation; the intent-screen decision in that spec is invalidated by this rework and will be re-amended.
- [`apps/mobile/src/app/(app)/more/index.tsx:53-75`](../../apps/mobile/src/app/(app)/more/index.tsx) — `handleAddChild` paywall path that this rework dissolves.
- [`apps/mobile/src/components/home/ParentHomeScreen.tsx:876-900`](../../apps/mobile/src/components/home/ParentHomeScreen.tsx) — same paywall logic, different gating.

---

## Why this exists

Discoverability for Family mode is currently broken on Free and Plus tiers because `maxProfiles: 1` means "Add a learner profile" anywhere in the app terminates at `/subscription`. That makes every onboarding-discovery UX a paywall tease.

The fix is not to hide the tease. It is to make the first learner profile work on every tier, while gating intensity and family operating depth: quota, extra learners, Recaps, nudges, multi-child comparison, and parent-management workflows.

This does **not** mean Free or Plus get the full Family product. It means "my child can try the tutor under my account" is not itself a Family-only feature.

---

## Decision

| Tier | Profiles | Monthly quota | Daily limit | Parent support |
|---|---|---|---|---|
| Free | Owner + 1 learner | 100 (shared) | 10 | Basic account/safety visibility for the one learner; no Recaps/nudges |
| Plus | Owner + 1 learner | 700 (shared) | none | Basic guardian controls for the one learner; no full Family Hub |
| Family | Owner + up to 3 learners (4 profiles total) | 1500 (pool) | none | Full Family Hub: Recaps, progress summaries, nudges, multi-child management |
| Pro | Owner + up to 5 learners (6 profiles total) | 3000 (pool) | none | Power-household capacity only; not a tutor/classroom SKU |

**Differentiation:**
- Free → Plus: quota uplift (7×), no daily cap
- Plus → Family: more learners, full Family Hub, dedicated Recaps tab, parent nudges, multi-child workflows
- Family → Pro: larger capacity, premium model on 2 profiles; do not market as tutor/coach/classroom without a separate product scope

**Quota model:** shared pool across owner + all linked learners. The owner does not choose "who gets the good quota this month." The pool is consumed by whichever profile is active.

**Child profile is permanent, not a trial.** Free users keep their one child profile indefinitely. The quota does the gating. No "trial expired" UX.

**Commercial guardrail:** Do not scale paid acquisition from this pricing until CAC/LTV is modeled from real activation and retention data. The first launch can test price and packaging, but paid search/social spend should be treated as learning spend until lead-to-paid conversion, month-1 retention, and month-3 retention are measured.

**Competitive positioning:** The primary competitive substitute is not another family edtech plan; it is a parent sharing an existing general AI subscription. Family must visibly deliver what a shared ChatGPT/Gemini login cannot: per-learner history, parent-visible progress, child-safe controls, Recaps, nudges, and clean separation between adult and child data.

---

## Legal and compliance boundaries

Subscription tier is not the legal control for child access. The controls are consent state, guardian verification, privacy defaults, data minimization, retention/deletion, and vendor restrictions.

**Child profile rules:**

- A learner profile must never bypass age, consent, or family-link checks because the account is paid.
- For under-consent-threshold users, create or expose learning data only after the required consent state is active, except for minimal data needed to request consent.
- Parent-created learner profiles still require the existing consent/legal basis path; the paywall is not proof of guardianship.
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

1. `TIER_CONFIGS.free.maxProfiles`: `1` → `2`
2. `TIER_CONFIGS.plus.maxProfiles`: `1` → `2`
3. `createProfileWithLimitCheck` (`apps/api/src/services/profile.ts:401`) — no logic change; the existing check honors the new caps.
4. Quota service — verify shared-pool semantics already work across profiles in one account (it should — quota is `account_id` scoped today). If per-profile quotas exist anywhere, sweep.
5. `updateProfileAppContext` (`profile.ts:547`) — currently requires `hasFamilyLinks === true` to set `family`. Still correct: a Free user with 0 children stays Study; once they add their 1 child, they can flip to Family.
6. Consent enforcement — no change in principle, but tests must cover that the first free learner profile does not expose learning/dashboard data unless the consent state permits it.
7. Voice data — verify the current STT/TTS path does not persist raw child audio. If any raw audio persistence exists, remove it or gate it behind a separate legal decision.

## What changes client-side

1. `more/index.tsx:53-75` `handleAddChild` — remove the tier check. Route directly to `create-profile?for=child`. The server's `createProfileWithLimitCheck` enforces the cap and returns 402 only when actually exceeded.
2. `ParentHomeScreen.tsx:876-900` — same: drop the tier branch. Already routes directly when `hasNoLinkedChildren`; align the "has children, wants to add more" branch with the same server-trust pattern.
3. Recaps tab visibility — still Family-only (intentional differentiator). No change.
4. Family Hub / parent-depth copy — Free and Plus can show basic one-learner safety/account controls, but must not promise full Recaps/nudges/multi-child management.
5. `subscription.tsx` marketing screen — rewrite tier comparison copy to lead with quota + multi-child + Recaps/nudges, not "Family is where you can add kids."
6. Translation keys (7 locales) — at least these need updating: `more.family.upgradeRequiredTitle/Message`, `subscription.tier.*.features`, any "add a child requires Family plan" string.

## What changes in the navigation-contract spec

The "Onboarding Intent" section's decision block (added 2026-05-24) needs rewriting. With Free + Plus able to add learners, the "intentionally lossy" justification is gone. Replacement direction in that spec: a Home empty-state CTA for adult owners ("Add a learner profile") is now safe to ship; a dedicated `intent.tsx` screen remains deferred because the Home CTA covers discovery.

---

## Open questions

| # | Question | Default if not answered |
|---|---|---|
| Q1 | Does the Family `learning-quota` consumption on a child profile feel different when the child is on Free vs Family (e.g. should we surface "this is shared with your parent's plan" on the child's quota-exhausted screen)? | Show the same exhaustion message; let the parent surface upgrade options. |
| Q2 | RevenueCat product changes — do we need to update entitlement descriptions in the store, or is "Family = multiple children" still accurate enough that no store metadata changes? | Update store descriptions next release; not blocking. |
| Q3 | Does "premium model on 1 profile" (Plus) need a UX for the parent to pick which profile gets it, or does it always default to the active profile? | Default to owner; add a settings toggle later if asked. Do not silently grant premium routing to both owner and child. |
| Q4 | Should the Free child profile have any **soft cap** distinct from the 100/month pool (e.g. "child can use up to 50 of the 100"), to prevent the owner being starved? | No sub-caps; pool is pool. Add only if real usage shows starvation. |
| Q5 | Should Family launch at current `$28.99/mo` or be tested closer to `$24.99/mo`? | Keep current price in code for now, but do not scale paid acquisition until CAC/LTV and onboarding conversion are measured. |
| Q6 | What exact one-learner parent visibility belongs in Free/Plus vs Family? | Free/Plus get safety/account status and a lightweight summary; Recaps, nudges, multi-child comparison, and recurring parent workflows stay Family. |

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Free user hits 100/month pool | Quota exhausted | Existing quota-exhausted UI with upgrade CTA (to Plus, since Plus is next tier with same profile count) | Upgrade or wait to month rollover |
| Free user with child tries to add 2nd child | `maxProfiles` exceeded | 402 from server with upgrade-to-Family CTA | Upgrade |
| Existing paying user downgrades Family → Free with 3 linked children | Subscription change | Existing over-cap UX (whatever it is today — separate question, not blocked by this rework) | Out of scope for this spec; flag for review |
| Plus user with 1 child, both on premium model | Plus only has 1 premium-model slot | Need to confirm `premiumModelProfiles: 1` logic when 2 profiles exist | Verify behavior before ship; see Q3 |
| Family quota pool exhausted mid-session for child | 1500 monthly cap hit on day 20 | All profiles see exhaustion; recovery = upgrade or rollover | Standard pool exhaustion UX |
| First free learner exposes child data without consent | New cap allows profile creation but consent is pending/withdrawn | Parent sees consent state, not learning metrics | Server redaction/protected-data response; complete consent |
| Raw child audio is retained | Voice capture path saves audio files | Legal/privacy risk invisible to user | Delete raw audio immediately after transcription/response; keep only permitted text/session records |
| Pro is marketed as tutor/classroom | Paywall copy says Tutor/Coach/Classroom | Users expect B2B/tutor features that do not exist | Remove positioning; create separate institutional/tutor SKU before selling |
| Institutional buyer requests pilot | School/district asks to use consumer app | Compliance scope expands to FERPA/AI Act/institutional controls | Do not sell; route to future institutional-SKU discovery |

---

## Out of scope

- Pricing changes — assume current $0 / $18.99 / $28.99 / $48.99 stays for code, but pricing is not approved for scaled paid acquisition until CAC/LTV is measured.
- RevenueCat catalog updates beyond description rewording — separate ticket.
- Hide-switcher preference (rejected earlier in conversation).
- A dedicated `onboarding/intent.tsx` screen — still deferred; Home CTA covers discovery once this rework ships.
- "Link existing child account" flow — not built; not blocked by this rework but blocks any UI labelled "link a child."
- School/district, tutor, coach, or classroom SKU — explicitly not launch scope.

---

## Sequencing

This is a product re-architecture, not a one-PR change. Suggested order:

1. **Spec stress-test** — apply `~/.claude/playbooks/payment-access-system.md` questionnaire if it exists; otherwise an adversarial-review pass on this doc.
2. **Server change** — `TIER_CONFIGS` edits + tests; verify shared-pool quota across profiles.
3. **Client gating cleanup** — drop the tier check in `more/index.tsx` and `ParentHomeScreen.tsx`. The 402 path becomes the single source of truth.
4. **Consent + voice verification** — add tests/audit notes proving first free learner creation still respects consent redaction and no raw child audio is retained.
5. **Marketing copy + translations** — `subscription.tsx` + 7 locale files.
6. **Navigation-contract spec amendment** — replace the "intentionally lossy" decision with the Home-CTA approach. Build the Home empty-state card.
7. **Soft-launch monitor** — watch quota-exhaustion, activation, week-1 retention, month-1 retention, lead-to-paid conversion, and refund rates per tier; calibrate caps/prices before paid scale.
