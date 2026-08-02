---
title: Resumable family-join consent and visibility journey — Implementation Plan
date: 2026-08-01
profile: code
work_items: [WI-2534]
spec: docs/specs/2026-07-30-13-16-family-join-guardian-consent-ceremony.md
status: in-progress
---

# Resumable family-join consent and visibility journey — Implementation Plan

**Goal:** Turn the adult-first family invitation into a resumable, two-identity journey that finishes destination-organization consent before membership movement and keeps supportership as a separately authorized visibility contract.

**Approach:** Persist one journey row per family invite, bound to the authenticated recipient Person only after verified-email equality succeeds. Re-evaluate age, residence, and policy on every transition; guardian-required journeys use the existing durable VPC authority machinery with a server-derived destination organization override. Membership moves only after the legal gate is current, and person scope remains unavailable until the canonical visibility contract has both required acceptances.

## Settled implementation decisions

- An invite code is a continuation locator, never consent or guardian authority. The authenticated learner's verified login email must match the invited email before the invite can bind to that Person.
- The invitation email carries the opaque code for manual entry. This repository has no universal/app-link contract, so this item does not invent an unserved URL.
- `family_join_journey` is the durable workflow owner. It records the bound charge, latest policy posture, supportership decision authority, and terminal state without overloading consent grants or visibility edges as workflow records.
- A pending invite is the pre-journey learner state. Once the authenticated recipient accepts and binds it, journey states are `awaiting_guardian`, `ready_to_join`, `joined`, `declined`, and `withdrawn`; token expiry is derived live and returned as `expired` without reviving the row.
- A consent-capable learner owns the supportership opt-in. A consent-gated learner may express a preference, but only the verified guardian can authorize the supportee side; the supporter must still accept their own side through the canonical visibility contract.
- The inviting adult and verified guardian may be the same Person, but invitation, guardian authority, family membership, and visibility acceptance remain separate writes and audit events.
- A different verified adult may complete the guardian step using the invite code; possession of the code identifies the journey but grants no authority. VPC verification must independently bind that adult, charge, destination organization, qualification, policy, and purpose set.
- Final join archives only the retiring solo organization's live grants into consent receipts, leaving the fresh destination grant set intact. It does not copy a grant across organizations.
- Reaching self-consent age, residence changes, and policy changes invalidate the cached posture and are resolved from current server state. Finalization always rechecks the current legal gate under the charge-Person lock.
- The database migration follows WI-2895's open `0165` migration and is numbered from the landed main journal; no parallel migration number is guessed.

## Scope

In scope:

- `packages/database/src/schema/identity.ts` — durable family-join journey table and relations.
- `apps/api/drizzle/` and `apps/api/drizzle/meta/` — one additive migration after the WI-2895 migration lands.
- `packages/schemas/src/family-join.ts` and tests — journey, guardian-step, decline, withdrawal, and final result contracts.
- `apps/api/src/services/identity-v2/family-join-journey.ts` and integration tests — state resolver and transition owner.
- `apps/api/src/services/identity-v2/family-join-v2.ts` and tests — legal-gate-aware final membership move and solo-grant archival.
- `apps/api/src/services/identity-v2/guardian-attachment.ts`, `guardian-attachment-verifier.ts`, and tests — trusted destination-organization context and composable in-transaction attachment.
- `apps/api/src/services/linking-ceremony.ts` and tests — guardian-authorized supportee acceptance with explicit audit provenance.
- `apps/api/src/routes/family-join.ts` and route integration tests — authenticated recipient, guardian, decline, withdrawal, status, and finalization surfaces.
- `apps/api/src/services/notifications/email.ts` and its guard tests — deliver the manual invite code without an unserved URL.
- `apps/mobile/src/lib/family-join-journey-state.ts` and tests — device-only SecureStore continuation.
- `apps/mobile/src/hooks/use-family-join-journey.ts` and tests — typed API operations and cache invalidation.
- `apps/mobile/src/app/(app)/family-join.tsx` and tests — learner/guardian entry, separate decisions, holding states, retry, decline, expiry, and completion.
- `apps/mobile/src/app/(app)/guardian-attachment.tsx` and tests — return to the family-join guardian completion when a journey code is present.
- English source strings plus generated locale synchronization required by repository i18n rules.
- Acceptance-focused API integration and mobile interaction coverage using distinct learner, inviter, and alternate-guardian identities.

Out of scope:

- selecting or building a verifier/VPC vendor;
- universal links or app-link hosting;
- under-13 credentials;
- changing country-policy decisions or consent ages;
- treating family membership, billing, invitation, or Guardianship as visibility authorization;
- exposing any learning data before an accepted visibility contract;
- redesigning the general visibility-contract UI.

## Tasks

- [x] T1: Pin shared journey contracts and durable workflow schema — done when: schema tests fail before and pass after for the exact states, actor-owned supportership decisions, invite/charge uniqueness, terminal timestamps, and strict request/result envelopes.
- [x] T2: Bind an invite to the correct authenticated learner and resolve the live legal posture — done when: integration tests prove verified-email equality, forwarded-token rejection, current destination organization, current policy/age resolution, exact retry, expiry, decline, withdrawal, relaunch reads, and consent-age transition without authority carryover.
- [x] T3: Make guardian authority destination-aware without trusting a client organization — done when: guardian-attachment integration tests prove the generic path still binds the current organization, the family-join wrapper binds the invite's destination organization, wrong/cross-organization assertions fail, and fresh destination requests/grants commit atomically.
- [x] T4: Add guardian-authorized supportee acceptance to the canonical visibility contract — done when: linking-ceremony tests prove only a current verified guardian may authorize a consent-gated charge, the audit names the guardian actor and authority basis, no contract is created on decline, and the supporter side remains separately pending.
- [x] T5: Finalize membership only after both current gates are satisfied — done when: two-identity PostgreSQL tests prove guardian-required holding, guardian completion, final retry, solo-org teardown, old-org grant receipt archival, fresh destination grants, consent-capable self path, different-guardian path, exact retry, rollback, withdrawal/revocation bounce, and zero accepted person scope until the visibility contract's supporter side is also accepted.
- [x] T6: Expose authenticated journey routes and deliver a usable invite code — done when: route tests prove neutral invite behavior, verified recipient binding, typed holding/terminal results, adult guardian completion, inviter-only withdrawal, learner decline, anti-enumerating errors, and email guard coverage for a manual code with no unserved URL.
- [x] T7: Build the resumable mobile ceremony — done when: component/hook/storage tests cover code entry, SecureStore relaunch, separate family/consent/visibility explanations, learner-owned versus guardian-owned supportership choice, same-adult and alternate-adult handoff, provider return, pending, decline, expiry, policy change, retry, success, and safe exit.
- [ ] T8: Run strict verification and red-green-revert — done when: shared schema, API unit/integration, mobile, i18n, typecheck, lint, migration guards, change-class checks, and a named regression's pass→revert-fail→restore-pass evidence are recorded for completion.

## Acceptance mapping

- Destination consent before learning processing: T2, T3, T5.
- Separate Guardianship, consent, membership, billing, and visibility decisions: T3–T7.
- Same or different verified guardian: T3, T5, T7.
- Consent-capable versus consent-gated supportership authority: T2, T4, T5.
- Pending, handoff, relaunch, decline, expiry, withdrawal, revocation, age transition, and partial completion: T2, T5–T7.
- No person scope or learning data before both gates: T4, T5.
