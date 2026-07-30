# Age Assurance Design — v0.1 (Draft for DPO review, agent-drafted)

**Status:** Draft v0.1, 2026-07-30. For DPO review (Stephan Hartmann).
**Feeds:** DPO Action 3 — [`DPO exchanges/2026-07-26-action-register-tracker.md`](../DPO%20exchanges/2026-07-26-action-register-tracker.md) row 3, and directly answers the DPO's Article 8 condition that age assurance be "proportionate to risk" (his 2026-07-30 concurrence on the Norwegian threshold-13 reading — five conditions, one of which is exactly this).
**Method:** direct read of `packages/schemas/src/profiles.ts`, `packages/schemas/src/age.ts`, `apps/api/src/routes/profiles.ts`.

## 1. What is collected, and where

Every profile-creation request declares an exact date of birth, not just a year:

- `birthYear` — **required**, validated by `birthYearSchema` (`packages/schemas/src/profiles.ts:39-57`). This is the actual enforcement point for the 13+ floor: the schema's final `.refine()` (line 55-57) rejects any `birthYear` later than `currentYear - PROFILE_MINIMUM_AGE` (13), with the explicit month-level overestimation compensation documented inline — the refine uses `≤` rather than `<` specifically so a learner born in December of the boundary year (who could still be 12) is caught. A request with a disallowed `birthYear` fails Zod validation before the profile is ever created; there is no code path that creates a profile with an out-of-range `birthYear`.
- `birthMonth` / `birthDay` — **optional**, but once both are present they are persisted (`profiles.birth_month` / `profiles.birth_day`, per the WI-367 comment at `profiles.ts:76-80`) and become the input to exact-date gating downstream (COPPA-boundary consent-revocation checks, the add-child adult gate).
- **Immutability:** `birthMonth`/`birthDay` are create-only — `profileUpdateSchema` omits them (`profiles.ts:80` comment). A learner's declared birth date cannot be silently revised after account creation through the update path.

This is a **self-declaration** model: nothing in the schema or the route requires a document, a credential, or a third-party signal to corroborate the declared birth date at signup. `birthYear` is asked directly, not derived from an app-store age rating, IP geolocation, or any other proxy.

## 2. The gating function

`computeAgeBracketFromDate()` (`packages/schemas/src/age.ts:78-96`) is the canonical exact-date banding function for gating and safety-adjacent decisions, per `AGENTS.md`'s "Profile Shapes" section. It takes `birthYear` plus optional `birthMonth`/`birthDay`, computes UTC-safe whole years elapsed (falling back to year-only math when month/day are absent), and returns one of three bands: `'child'` (under 13), `'adolescent'` (13-17 inclusive), `'adult'` (18+). The file's own comment states plainly that `'child'` cannot actually be produced by any current API call, because the `birthYearSchema` boundary already enforces the 13-floor — `'child'` exists only for a documented future (v1.1) sub-13 ungating path and for the policy engine's age-band evaluation, not as a state reachable today.

Two related functions exist for different purposes and must not be confused (both cited so a reviewer can tell them apart):

- `isAdultOwner()` (`age.ts:98-118`) — calendar-year-tolerant, used for tone/voice/theming gates where the DPO-agreed intended trade-off is the coarser year-only math.
- `isUnambiguouslyAdult()` (`age.ts:135-141`) — the fail-closed variant for **PII-egress gates**, e.g. whether a learner's real name may enter an LLM-provider prompt. It treats the boundary year as still-minor; only `birthYear < currentYear - 18` is unambiguously adult. This is the stricter function, deliberately reserved for privacy-sensitive decisions rather than UX ones.

## 3. Under-13 rejection — where it actually happens

There is exactly one enforcement point: the `birthYearSchema` Zod refinement at `packages/schemas/src/profiles.ts:55-57`, applied to `profileCreateSchema` at line 75. A profile-creation request with a `birthYear` implying under-13 fails schema validation at the API boundary (`apps/api/src/routes/profiles.ts`, where `profileCreateSchema` gates the request body) and the profile row is never written. This is a hard, server-side floor — not a client-side prompt a determined under-13 user could bypass by lying about age category, since the actual numeric year is what is checked, not a self-selected age bracket.

**What this does not do:** it does not detect a learner who enters a false birth year to get past the 13-floor. No verification (ID, credit card, parental email confirmation of age, or app-store age signal) corroborates the declared date at signup today. This is the honest limitation behind the proportionality argument in §4.

## 4. Proportionality argument (responding to the DPO's Art 8 condition)

The DPO's 2026-07-30 concurrence on the Norwegian Article 8 threshold-13 reading for non-EEA minors was conditional on five points, one of which is "age assurance proportionate to risk." The case for self-declaration being proportionate at MentoMate's current scale and product shape:

1. **Content risk profile.** MentoMate is a tutoring/homework product. It has no social feed, no user-to-user messaging, no public profile, no friend/follower graph, and no user-generated content visible to other users. The primary risk vectors that drive stricter age-verification mandates elsewhere (stranger contact, exposure to peer content, social comparison, virality) do not exist in this product's current feature set.
2. **No under-13 marketing.** The product is not marketed to, or designed to appeal specifically to, children under 13 — the 13+ floor is a genuine product boundary, not a nominal one layered on top of an all-ages design (contrast with products that market broadly and then claim a 13+ floor as a formality).
3. **No incentive to falsify downward.** Self-declaration risk is highest where a service offers something minors specifically want that adults do not (e.g., social platforms, certain games). A homework/tutoring product does not create a strong incentive for an adult to falsely register as a minor, and a genuine under-13 user gains no product-specific benefit from lying upward that an accurate 13-17 declaration would not already provide — the "child" band is not even a reachable, functioning product state today (§2).
4. **13+ floor, not a lower one.** MentoMate's floor already sits at the maximum lawful threshold GDPR Article 8 permits national law to set (13), rather than defaulting to the GDPR baseline of 16 only where local law lowers it. The under-18 safety, transparency, profiling, and billing protections in the 07-23 ruling continue to apply throughout the 13-17 band regardless of self-consent capacity, so a false-downward declaration (an actual under-13 registering as 13) still lands the user inside the product's most-protected cohort, not an unprotected one.
5. **Exact date of birth, not a checkbox.** The design collects and stores an actual date, not a "yes I am 13+" attestation — this is a stronger signal than the minimum EDPB guidance describes as acceptable ("reasonable efforts"), even though it remains self-declared and uncorroborated.

This argument supports self-declaration as proportionate **today**, at pre-launch scale with the current feature set. It is explicitly not a permanent position — see §5.

## 5. Future strengthening layer — store-level age signals

`WI-1116` (referenced in `2026-07-30-us-risk-acceptance-draft.md` and `2026-07-30-us-deep-dive-post-dpo.md`) is a tracked, **not-yet-implemented** engineering item to consume Apple's developer age-category and parental-consent APIs (live since 2026-06-04) in response to Texas SB 2420 (the Texas App Store Accountability Act, already in effect) — ingesting a store-provided age-category and parental-consent signal, assigning an accurate age rating, and honoring significant-change notices. As of 2026-07-30 this is scoped narrowly to the Texas legal driver and is an open engineering decision, not a shipped feature (`2026-07-30-us-deep-dive-post-dpo.md` row 1: "Open — engineering decision + integration").

For the DPO's purposes: this is correctly framed as a **future strengthening layer** on top of self-declaration, not a currently-operating second factor. If WI-1116 ships, it would give MentoMate a corroborating signal from the app store's own age-verification flow (per the `residenceAssuranceSchema` design in the country-policy schema, such a signal is architecturally suited to be a *corroborating* method, never a primary replacement for the self-declared birth date — see `2026-07-30-residence-determination-design.md` §3 for the equivalent pattern already built for residence). Until it ships, it cannot be cited as part of the present-day proportionality argument in §4, only as a stated roadmap item.

## 6. Open items

- **[OPEN — needs input]** No verification, credential check, or app-store age signal corroborates the declared birth date today. This document argues that is currently proportionate; it is not this document's place to rule whether the DPO agrees — that ruling is exactly what Action 3 is asking for.
- **[OPEN — needs input]** WI-1116 has no committed ship date as of 2026-07-30 — its status as a "future strengthening layer" should not be represented to the DPO as imminent without a real timeline.
- **[OPEN — needs input]** Whether mobile onboarding UI presents the birth-date fields as a single date picker (exact date) or splits year from month/day in a way that could make `birthMonth`/`birthDay` easy to skip was not traced this pass (mobile onboarding screens were not opened) — worth confirming, since `birthMonth`/`birthDay` being optional in the schema means the exact-date gating functions silently fall back to year-only math for any profile that omits them.
