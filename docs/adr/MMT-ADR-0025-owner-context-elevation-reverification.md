# MMT-ADR-0025 — Switching into the owner profile requires a fresh primary-factor reverification

**Status:** Accepted · 2026-06-20 · **Scope:** Profile-switch authorization / account security · **Deciders:** Architect (jjoerg) + PM · **Supersedes:** the inline `[CR-2026-05-19-H1]` "intentionally no owner gate" note on `POST /v1/profiles/switch` (`apps/api/src/routes/profiles.ts`)

## Context

A MentoMate account can hold multiple profiles — one **owner** (the adult/guardian) and one or more non-owner profiles (children on the parent's account). `isOwner` gates owner-only surfaces: Billing/subscription, Account Security, Export/Delete account, and Add-child (see CLAUDE.md "Profile Shapes" → `isOwner` gating).

The active profile is changed via `POST /v1/profiles/switch`. DeepSec scan DS-212 (WI-301, P1/HIGH) found that **a non-owner profile can switch into the owner profile**, unlocking every `isOwner`-gated surface. The root cause is that **no owner-elevation gate exists on either side of the boundary**:

- **Server** (`routes/profiles.ts:415-442`) authorizes the switch on *account membership only* — `getPersonScope`/`switchProfile` returns truthy iff the target profile belongs to the caller's account — and returns `200` for any same-account switch. The absence is explicit: `[CR-2026-05-19-H1 note: intentionally left without owner gate]`.
- **Client** (`profiles.tsx:185-206`) only special-cases the *owner→child* tap (line 186, a navigation branch, not a security prompt); every other combination — including non-owner→owner — falls through to `handleSwitch` ungated. The `[BUG-133]` comment (lines 104-115) deliberately defers all authorization to the server "rather than add a false-reassurance client guard."

The vulnerability is reachable via three surfaces with one root cause: (1) tapping the owner row in the profile list; (2) the `lib/profile.ts#switchProfile` primitive; (3) a **direct `POST /v1/profiles/switch` with a valid child-account JWT** — which no client-side change can close. The fix must therefore be **server-authoritative**.

The app has **no enforced MFA** — authentication is password / SSO (email-code, OAuth), with `add-password.tsx` existing to let SSO-only accounts add a *first* password. There is no TOTP/second-factor enrollment anywhere in the security surface (`account-security.tsx`, `change-email.tsx`, `add-password.tsx`, `security-sessions.tsx`). So any step-up signal keys on the **primary** factor.

## Decision

### 1. Owner elevation requires a fresh credential reverification, enforced server-side

`POST /v1/profiles/switch` rejects a switch **into the owner profile by a non-owner caller** with `403 OWNER_ELEVATION_REQUIRED` unless the caller has re-verified a factor recently. "Recently" is measured by Clerk's **`fva` (factor-verification-age)** session-token claim — **not** the JWT `iat`, which Clerk's ~60-second auto-refresh keeps perpetually fresh and is therefore useless as a recency signal. All other switches (owner→anyone, non-owner→non-owner, the device handed back to a parent's *child* profile) are unaffected.

### 2. Primary-factor reverification is sufficient elevation

Given no enforced MFA, the gate keys on the **primary** factor's verification age (`fva[0]`): a recent password / SSO re-entry. This is accepted as sufficient owner elevation. The threat model is a child holding a parent's *already-unlocked* phone who does **not** know the parent's password — primary-factor reverification defeats exactly that. Requiring a true second factor is **not** in scope and would be a separate MFA-enablement decision.

### 3. The gate is flag-guarded for emergency rollback

A kill-switch env flag `OWNER_ELEVATION_GATE_ENABLED` (default `'true'`, set `'false'` in Doppler to disable) mirrors the existing `ADULT_OWNER_GATE_ENABLED` pattern (`routes/profiles.ts:54-56`), so the gate can be disabled without a redeploy if it misfires.

### 4. The client reuses the established reverification UX; the server is the source of truth

The mobile client intercepts the non-owner→owner tap and drives a fresh factor verification through the same Clerk reverification mechanism already shipped for credential mutations (`useReverification` in `change-email.tsx:50-55`, `add-password.tsx`), then retries the switch. The client gate is **UX only** — the server `fva` check is authoritative and independently closes the direct-API surface (variant 3).

## Consequences

- **Reverses a documented design choice.** The `[CR-2026-05-19-H1]` "no owner gate" intent is superseded by this ADR; the inline note and the `[BUG-133]` "no client guard" comment are updated to point here.
- **New cross-package contract.** A new error code `OWNER_ELEVATION_REQUIRED` is added to `@eduagent/schemas` `ERROR_CODES`; the JWT trust-boundary schema (`clerkJWTClaimsSchema`) and `AuthUser` gain an `fva` field. Future profile-switch callers must handle the 403.
- **The canon rule this ADR establishes:** a non-owner→owner profile switch requires a fresh primary-factor reverification (`fva`), enforced server-side and flag-guarded (`architecture.md` carries this line; ADR and canon move in lockstep).
- **Regression coverage is mandatory.** The existing `profiles.test.tsx` test that asserts an immediate child→owner switch encodes the vulnerability and is **inverted** (per the test-integrity rule), plus a server negative-path test (`child JWT → owner switch → 403`).
- **No schema migration** — the decision deliberately avoids an owner-PIN (which would need a DB column); the signal rides Clerk's existing session token.

## Alternatives considered

1. **Owner PIN / passcode stored on the account.** Rejected — needs a schema migration and a new secret to manage, rotate, and recover; Clerk already holds a verifiable credential whose freshness it exposes via `fva`. Reuse beats a parallel secret store.
2. **Gate on JWT `iat` (token issue time).** Rejected — Clerk auto-refreshes the session token roughly every 60 s, so `iat` is always "fresh" and cannot represent *human* reverification recency. `fva` is the purpose-built claim.
3. **Require a true second factor (TOTP/MFA) for elevation.** Rejected for now — the app enforces no MFA, so this would first require an MFA-enablement program (enrollment UX, recovery codes, support load). Primary-factor reverification meets the child-on-unlocked-phone threat model today; MFA-gated elevation can supersede this ADR later if the threat model changes.
4. **Client-only gate (hide/disable the owner row + confirm prompt).** Rejected as the *fix* — it cannot close the direct-API surface (variant 3); a child who can call the API with their own JWT bypasses any client guard. Retained only as the UX layer atop the authoritative server check.

## What this ADR does not decide

- **The exact Clerk-Expo call that forces a fresh primary-factor verification** for a non-Clerk-API action (our `/profiles/switch`) — an implementation detail; the code is the source of truth.
- **The precise `fva` recency threshold** — an operational tunable (`OWNER_ELEVATION_MAX_FVA_MINUTES`, initially 10 minutes), owned by config/code, not fixed by this ADR.
- **Owner-elevation for any surface other than the profile switch** — out of scope; `isOwner` content gating inside already-active owner context is unchanged.
