---
title: Credentialed Charge Route Guards — Implementation Plan
date: 2026-07-11
profile: code
work_items: [WI-787]
spec: tests/integration/guardian-credentialed-charge-403.integration.test.ts
status: done
---

# Credentialed Charge Route Guards — Implementation Plan

**Goal:** Deny guardian access to four targeted single-charge surfaces when the charge has a Login, without blocking self access or consent authority.
**Approach:** Mirror the existing round-2 route-layer authorization pattern by calling `assertChargeNotCredentialed` after current caller/account authorization and before the service call. On `/profiles/:id`, call it only when the server-resolved `callerPersonId` differs from the target route id; family removal is necessarily guardian-addressed and guards the validated `profileId` after its existing owner/caller checks.

## Scope

In scope:
- `apps/api/src/routes/profiles.ts` — guard GET, PATCH, and app-context PATCH before service dispatch.
- `apps/api/src/routes/billing.ts` — make credentialed-charge family-removal denial explicit.
- `apps/api/src/routes/profiles.test.ts` and `apps/api/src/routes/billing.test.ts` — extend existing route database doubles for the guard's uncredentialed default read; add no module mock.
- `report.md` — record accessor, placements, self-path behavior, and offline verification.
- `docs/plans/2026-07-11-credentialed-charge-route-guards.md` — execution plan and status.

Out of scope:
- `tests/integration/guardian-credentialed-charge-403.integration.test.ts`
- `apps/api/src/services/consent.ts`, `apps/api/src/services/consent-v2.ts`, `apps/api/src/services/identity-v2/ownership-v2.ts`, and `apps/api/src/services/family-access.ts`
- Dashboard and weekly/monthly aggregate-enumeration surfaces
- Service implementations, mobile files, EAS configuration, TypeScript configuration, dependency installation, database or network access

## Tasks

- [x] T1: Read the round-3 deny cases and pins plus the established round-2 route pattern — done when: the existing integration spec identifies the four deny cases and confirms self GET, uncredentialed-charge PATCH, and consent-authority pins.
- [x] T2: Add conditional route guards to the three `/profiles/:id` surfaces — done when: each route compares `c.get('callerPersonId')` with `c.req.param('id')`, skips the guard for equality, and invokes `assertChargeNotCredentialed` before its service call otherwise.
- [x] T3: Add the explicit family-removal guard — done when: `POST /subscription/family/remove` invokes `assertChargeNotCredentialed(db, profileId)` after existing owner/caller checks and before subscription mutation.
- [x] T4: Verify and report — done when: the requested offline `jest --findRelatedTests` command exits successfully or every environment-bound failure is recorded verbatim; changed route code is read for type errors; `report.md` contains exact accessor, final file:line placements, self-path confirmation, and results.
