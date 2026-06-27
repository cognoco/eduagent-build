---
title: Owner-context elevation gate — Implementation Plan
date: 2026-06-20
profile: code
work_items: [WI-301]
spec: docs/specs/2026-06-20-owner-context-elevation-gate.md
adr: MMT-ADR-0025
status: draft
---

# Owner-context elevation gate — Implementation Plan

**Goal:** A non-owner profile can no longer switch into the owner profile without a fresh primary-factor reverification, enforced server-side and flag-guarded.
**Approach:** Add the `fva` (factor-verification-age) claim at the JWT trust boundary; gate `POST /v1/profiles/switch` on it server-side (the authoritative half that closes the direct-API surface); layer the existing Clerk reverification UX on the client; cover with red-green tests and amend canon in lockstep.

## Scope
In scope:
- `packages/schemas/src/errors.ts` — new `OWNER_ELEVATION_REQUIRED` error code
- `apps/api/src/middleware/auth.ts` — parse + propagate `fva`
- `apps/api/src/routes/profiles.ts` — the elevation gate + kill-switch flag + comment updates
- `apps/api/src/routes/profiles.test.ts` — server red-green tests
- `apps/mobile/src/app/profiles.tsx` — client interception + reverify + retry + comment update
- `apps/mobile/src/app/profiles.test.tsx` — invert the bug-encoding test + interception tests
- `docs/architecture.md` — lockstep canon amendment
- Clerk JWT template (operational) — emit `fva`

Out of scope (must not change):
- The `profileSwitchSchema` request body (`{ profileId }` is unchanged — `fva` rides the token, not the body)
- Any DB schema / migration
- `isOwner` content-gating logic inside already-active owner context
- Any other route's authorization

## Tasks

- [ ] **T1: Add the `OWNER_ELEVATION_REQUIRED` error code + parse `fva` at the JWT trust boundary.** Server foundation; no behavior change yet.
  - `packages/schemas/src/errors.ts`: add to `ERROR_CODES` (line ~440, before the closing `} as const`):
    ```ts
    // [WI-301] Returned 403 when a non-owner profile attempts to switch into the
    // owner profile without a fresh primary-factor reverification. The caller must
    // re-verify (Clerk fva) and retry. See MMT-ADR-0025.
    OWNER_ELEVATION_REQUIRED: 'OWNER_ELEVATION_REQUIRED',
    ```
    (`errorCodeSchema` is derived from `Object.values(ERROR_CODES)` — no other edit needed.)
  - `apps/api/src/middleware/auth.ts`: extend the claims schema and propagate. `fva` is Clerk's `[primaryFactorAgeMinutes, secondaryFactorAgeMinutes]`; `-1` means a factor was not applicable.
    ```ts
    const clerkJWTClaimsSchema = z.object({
      sub: z.string().min(1),
      email: z.string().optional(),
      email_verified: z.boolean().optional(),
      // [WI-301] Factor-verification-age: minutes since each factor was verified
      // (-1 = N/A). Used by the owner-elevation gate. Optional so a token minted
      // before the JWT-template change still parses (gate fails closed on absence).
      fva: z.tuple([z.number(), z.number()]).optional(),
    });
    ```
    Add `factorVerificationAge?: [number, number]` to `AuthUser` (line ~28-33), return it from `verifyClerkJWT` (line ~145-149: `fva: claims.data.fva`), and set it where `authMiddleware` builds the `user` (`c.set('user', { … factorVerificationAge: <fva> })`).
  - **Confirm `fva` units** against a real staging-Clerk session token (decode a token from the staging instance; verify element 0 is minutes-since-primary-factor). Record the confirmed unit in a code comment on the schema field. If Clerk emits seconds rather than minutes, set the T3 threshold constant accordingly.
  - done when: a new unit test `auth.test.ts > parses fva from the JWT claims` asserts a token carrying `fva: [2, -1]` yields `user.factorVerificationAge === [2, -1]`, and a token without `fva` yields `undefined`; `pnpm exec nx run api:typecheck` green.

- [ ] **T2 (design spike): pin the client reverification trigger.** Clerk's `useReverification` is built to wrap a *Clerk-backend-protected* call; our switch is protected by *our* backend, so the trigger needs deciding. Resolve which mechanism forces a fresh primary-factor verification (refreshing the session token's `fva`) for our own-API action:
  - Candidate A — reactive: call `switchProfile`; on `403 OWNER_ELEVATION_REQUIRED`, invoke a Clerk reverification flow, then retry.
  - Candidate B — proactive: before calling `switchProfile` for an owner-elevation tap, force reverification via Clerk's session step-up API (`session.startVerification`/equivalent) wrapped like the existing `useReverification` usages.
  - Load the `tech-clerk-expo` / `tech-clerk-custom-ui` skills; inspect the in-repo `useReverification` sites (`change-email.tsx:50-55`, `add-password.tsx`).
  - done when: the chosen mechanism + the exact Clerk-Expo call is recorded as a short addendum at the bottom of this plan (`## T2 outcome`), **validated end-to-end on the staging Clerk instance** (non-owner taps owner row → challenge → fresh `fva` in the new token → switch returns `200`). No code ships from T2 beyond a throwaway validation; T4 implements the decision.

- [ ] **T3: Server-side elevation gate + kill-switch flag.** The authoritative half — independently closes the direct-API surface (spec variant 3). Depends on T1.
  - `apps/api/src/routes/profiles.ts`: add the flag to `ProfileEnv['Bindings']` (next to `ADULT_OWNER_GATE_ENABLED`, line ~54-58):
    ```ts
    // [WI-301] Kill switch for the owner-elevation reverification gate. Set to
    // 'false' in Doppler for emergency rollback. Default 'true'. See MMT-ADR-0025.
    OWNER_ELEVATION_GATE_ENABLED?: string;
    ```
  - In the `/profiles/switch` handler (replace the `[CR-2026-05-19-H1]` "no owner gate" comment with a pointer to MMT-ADR-0025), after resolving `found` and before returning success, insert the gate. Resolve target ownership and caller-active ownership from authoritative state (see spec "Determining…"), fail closed on ambiguity:
    ```ts
    // [WI-301] Owner-elevation gate (MMT-ADR-0025). A non-owner caller switching
    // INTO the owner profile must have re-verified a factor recently. fva (not iat,
    // which Clerk keeps fresh) is the recency signal. Fail closed on ambiguity.
    const gateEnabled = (c.env?.OWNER_ELEVATION_GATE_ENABLED ?? 'true') !== 'false';
    if (gateEnabled) {
      const targetIsOwner = await isOwnerProfile(db, profileId, account.id);
      const callerIsOwner = await isCallerActiveOwner(c, db, account.id); // false if unresolved
      if (targetIsOwner && !callerIsOwner) {
        const fva = c.get('user').factorVerificationAge;
        const primaryAge = fva?.[0];
        const fresh =
          typeof primaryAge === 'number' &&
          primaryAge >= 0 &&
          primaryAge <= OWNER_ELEVATION_MAX_FVA_MINUTES;
        if (!fresh) {
          return c.json(
            { code: ERROR_CODES.OWNER_ELEVATION_REQUIRED, message: 'Owner context requires recent reverification' },
            403,
          );
        }
      }
    }
    ```
    Define `const OWNER_ELEVATION_MAX_FVA_MINUTES = 10;` at module top. Implement `isOwnerProfile(db, profileId, accountId): Promise<boolean>` and `isCallerActiveOwner(c, db, accountId): Promise<boolean>` from the same person/profile source `getPersonScope`/`switchProfile` reads (resolve the caller's active profile from `c.get('profileId')` / account scope); both honour the `IDENTITY_V2_ENABLED` seam already branched in this handler. The existing `forbidden(...)` (account-membership) check stays ahead of this block unchanged.
  - done when: the T3 tests below are red before the handler edit and green after.

- [ ] **T4: Client interception + reverify + retry.** UX layer atop T3. Depends on T2 + T3.
  - `apps/mobile/src/app/profiles.tsx` `handleProfileTap` (lines 185-206): add a branch *before* the fall-through `handleSwitch` for the owner-elevation case — when `!activeProfile?.isOwner && profile.isOwner`, run the T2-chosen reverification, then call `handleSwitch(profile.id)` on success; on cancel/failure, do nothing (stay put). Leave the existing owner→child branch (L186) and the default `handleSwitch` (L205) intact. Update the `[BUG-133]` comment (L104-115) to note the elevation branch is a UX layer over the authoritative server gate (MMT-ADR-0025), not a replacement.
  - Belt-and-braces: if `switchProfile` returns/throws `OWNER_ELEVATION_REQUIRED` (e.g. token went stale between tap and call), run the same reverify-and-retry once. Classify on the typed error `code`, not the formatted message (per CLAUDE.md "Classify errors before formatting").
  - done when: the T4 tests below are green, including the **inverted** `profiles.test.tsx:271` test.

- [ ] **T5: Lockstep canon amendment + comment cleanup.** Depends on T3 landing.
  - `docs/architecture.md`: in the profile-switch / account-security section, add one line: "A non-owner→owner profile switch requires a fresh primary-factor reverification (`fva`), enforced server-side in `POST /v1/profiles/switch` and flag-guarded (`OWNER_ELEVATION_GATE_ENABLED`). See MMT-ADR-0025." (Canon records current state — land this in the **same PR** as T3, not before.)
  - Confirm the `[CR-2026-05-19-H1]` and `[BUG-133]` comments now reference MMT-ADR-0025 (done in T3/T4).
  - done when: `grep -rn "MMT-ADR-0025" docs/architecture.md apps/api/src/routes/profiles.ts apps/mobile/src/app/profiles.tsx` returns all three; `pnpm run check:decision-adr-link` green.

- [ ] **T6 (operational precondition): Clerk JWT template emits `fva`.** The gate fails closed on absent `fva`, so **enabling the gate in an environment before its Clerk JWT template emits `fva` would 403 every owner-elevation switch.** This is a deploy-ordering hard constraint, not a code task.
  - Add `fva` to the session-token JWT template in each Clerk instance (dev/staging/prod) used by the API audience.
  - done when: a freshly minted staging token, decoded, contains an `fva` claim; documented in `## T6 outcome`. The gate flag is enabled per-environment **only after** that environment's template is confirmed.

## Tests

**T1 — `apps/api/src/middleware/auth.test.ts`**
- `parses fva from JWT claims`: stub a verified token whose payload includes `fva: [2, -1]` → `user.factorVerificationAge` deep-equals `[2, -1]`. Second case: payload without `fva` → `factorVerificationAge` is `undefined`. Use the real `clerkJWTClaimsSchema`/`verifyClerkJWT` path; mock only the Clerk JWKS boundary (existing external-boundary mock — not an internal mock).

**T3 — `apps/api/src/routes/profiles.test.ts`** (extend the existing `describe('POST /v1/profiles/switch')`, ~line 1131)
- `403 OWNER_ELEVATION_REQUIRED when a non-owner switches to owner with stale fva`: seed an account with an owner + a non-owner profile, caller active as the non-owner, token `fva: [120, -1]` (stale) → `403`, body `code === 'OWNER_ELEVATION_REQUIRED'`. **This is the red-green security test** — write it, watch it fail against current `main` (returns 200), implement T3, watch it pass; then per the Fix Development Rules, revert the handler block and confirm it fails again.
- `200 when a non-owner switches to owner with fresh fva`: same setup, token `fva: [1, -1]` → `200`.
- `200 when an owner switches to a child (no elevation)`: owner active, target child, any `fva` → `200` (gate not triggered).
- `200 when a non-owner switches to another non-owner`: → `200` (gate not triggered).
- `403 OWNER_ELEVATION_REQUIRED on a direct API call with absent fva` (variant-3 / fail-closed): caller active non-owner, token with **no** `fva` claim, target owner → `403`.
- `bypasses the gate when OWNER_ELEVATION_GATE_ENABLED='false'`: stale `fva`, flag off → `200`.

**T4 — `apps/mobile/src/app/profiles.test.tsx`**
- **Invert** the existing `it('switches immediately when a child taps the owner row')` (~line 271): it currently asserts `mockSwitchProfile` WAS called with `'owner-id'`. The current behavior is the vulnerability (per the test-integrity rule: invert, do **not** delete). Rewrite to: a non-owner active profile taps the owner row → the reverification flow is invoked and `switchProfile` is **not** called until reverification resolves; on success → `switchProfile('owner-id')` is called.
- `does not intercept an owner switching to a child` — owner active, tap child → existing owner→child navigation branch runs, no reverification.
- `retries the switch after a 403 OWNER_ELEVATION_REQUIRED` — `switchProfile` first yields the typed `OWNER_ELEVATION_REQUIRED` error → client runs reverify → retries → success. Mock only the Clerk reverification boundary; use the real `handleProfileTap`/`handleSwitch`.

## Verification (whole-plan)
- `pnpm exec nx run api:typecheck && pnpm exec nx run api:test` (the profiles + auth suites)
- `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/profiles.tsx src/app/profiles.test.tsx --no-coverage && pnpm exec tsc --noEmit`
- `bash scripts/check-change-class.sh --run` (api + shared-schemas classes will route the integration + lint gates)
- Red-green evidence recorded for the T3 `403` security test per the Fix Development Rules (security HIGH requires a negative-path break test).
