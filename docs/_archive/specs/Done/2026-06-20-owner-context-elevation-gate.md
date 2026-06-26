---
title: Owner-context elevation gate (non-owner → owner profile switch)
date: 2026-06-20
status: draft
work_items: [WI-301]
adr: MMT-ADR-0025
plan: docs/plans/2026-06-20-owner-context-elevation-gate.md
---

# Owner-context elevation gate

**Problem.** A non-owner profile (a child on a parent's account) can switch into the **owner** profile and thereby unlock every `isOwner`-gated surface — Billing, Account Security, Export/Delete account, Add-child. This is a privilege-escalation gap (DeepSec DS-212 / WI-301, P1/HIGH).

**Decision of record:** [MMT-ADR-0025](../adr/MMT-ADR-0025-owner-context-elevation-reverification.md) — switching into the owner profile requires a **fresh primary-factor reverification**, enforced server-side, flag-guarded. Read it for the *why* and the alternatives; this spec is the *what* and the failure-mode contract.

## Root cause (verified)

No owner-elevation gate exists on **either** side:

| Layer | Site | Current behavior |
|---|---|---|
| Server | `apps/api/src/routes/profiles.ts:415-442` | Authorizes on **account membership only** (`getPersonScope`/`switchProfile`); returns `200` for any same-account switch. `[CR-2026-05-19-H1] intentionally left without owner gate`. |
| Client | `apps/mobile/src/app/profiles.tsx:185-206` | `handleProfileTap` only special-cases owner→child (L186); every other case, incl. non-owner→owner, falls through to `handleSwitch` (L205) ungated. `[BUG-133]` (L104-115) defers all authz to the server. |

**Three surfaces, one root cause:** (1) owner-row tap; (2) `lib/profile.ts#switchProfile` primitive; (3) **direct `POST /v1/profiles/switch` with a child JWT** — a client-only fix cannot close (3), so the fix is server-authoritative.

## Behavior (target)

A switch is an **owner-elevation** switch when the **caller's currently-active profile is non-owner** and the **target profile is the owner**. For an owner-elevation switch:

1. The server requires the caller's Clerk session-token `fva[0]` (primary-factor verification age) to be a non-negative value within `OWNER_ELEVATION_MAX_FVA_MINUTES` (initial: 10). Otherwise → `403 OWNER_ELEVATION_REQUIRED`.
2. The client intercepts the tap, runs a fresh Clerk reverification, and retries the switch once verification succeeds.
3. All non-elevation switches (owner→anyone, non-owner→non-owner) are unchanged: `200` on account-membership, as today.

The gate is disabled when `OWNER_ELEVATION_GATE_ENABLED='false'` (Doppler kill switch; default on).

### Determining "target is owner" / "caller is non-owner" server-side

The request body (`profileSwitchSchema`) carries only `profileId`. The server must resolve **both** the target's ownership and the caller's *currently-active* ownership from authoritative state, not from the client:

- **Target is owner:** resolve `isOwner` for `profileId` within the caller's account from the same source `getPersonScope`/`switchProfile` already reads (the person/profile record). Do not trust a client-supplied flag.
- **Caller is non-owner:** the caller's active profile is the device's current `profileId` (server-resolvable via the existing active-profile/account context, `c.get('profileId')` / account scope). If the caller's active profile cannot be resolved as owner, treat the caller as non-owner (fail-closed).

If either resolution is ambiguous, **fail closed** (treat as an elevation switch requiring reverification) — a false prompt is a minor UX cost; a false pass is the vulnerability.

## API contract

- **Endpoint:** `POST /v1/profiles/switch` (unchanged path, unchanged request body `{ profileId: uuid }`).
- **New failure:** `403` with `{ code: 'OWNER_ELEVATION_REQUIRED', message }` — the caller must reverify and retry. `OWNER_ELEVATION_REQUIRED` is added to `@eduagent/schemas` `ERROR_CODES`.
- **Unchanged failures:** `403 FORBIDDEN` (target not on account), `400 VALIDATION_ERROR` (bad body), `401` (no/invalid token).
- **Success:** `200 { message: 'Profile switched', profileId }` (unchanged).

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Elevation needs reverify | Non-owner taps owner row, stale/absent `fva` | Clerk reverification prompt (password/SSO), then the switch completes | Reverify → auto-retry → owner context |
| Reverify cancelled / fails | User dismisses the prompt or enters wrong credential | Stays on the profiles screen as the non-owner profile; no switch | Tap again to re-attempt |
| Direct API attack | Child JWT calls `POST /profiles/switch` for the owner id without reverify | (no UI) `403 OWNER_ELEVATION_REQUIRED` | None — correctly blocked |
| Gate disabled | `OWNER_ELEVATION_GATE_ENABLED='false'` | Legacy behavior (immediate switch) | Operational rollback only |
| `fva` claim absent | Clerk JWT template not yet emitting `fva` | `403 OWNER_ELEVATION_REQUIRED` (fail-closed) | Operator must add `fva` to the JWT template (deploy precondition) |

## Out of scope

- Owner-elevation for any surface other than the profile switch (in-context `isOwner` content gating is unchanged).
- Enabling true MFA / second factor (separate program; ADR alternative #3).
- An owner PIN or any schema migration (ADR alternative #1).
