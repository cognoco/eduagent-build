---
title: Profile Authority Refresh Loading — Implementation Plan
date: 2026-08-03
profile: code
work_items: [WI-2901]
status: done
---

# Profile Authority Refresh Loading — Implementation Plan

**Goal:** Keep validated learner-only sessions usable during background authority refreshes while preventing cached owner/guardian/proxy capability from remaining interactive until revalidation settles.
**Approach:** Centralize the provider's loading decision in a pure resolver that distinguishes cold/unvalidated state, learner-only authority, and owner/guardian/proxy-capable state. Exercise that resolver and the real foreground-refetch path with regressions before changing the provider wiring.

## Scope

In scope:
- `apps/mobile/src/lib/profile.ts`
- `apps/mobile/src/lib/profile.test.tsx`
- `apps/mobile/src/app/(app)/_layout.test.tsx` only if provider-level assertions cannot prove gate ordering
- `.workitem-artifacts/WI-2901/**`
- `docs/plans/2026-08-03-profile-authority-refresh-loading.md`

Out of scope:
- API authorization and identity binding
- Query retry or refetch cadence changes
- Navigation, consent, or shell contract changes

## Tasks

- [x] T1: Add `resolveProfileAuthorityLoadingState()` and wire it into `ProfileProvider` in `apps/mobile/src/lib/profile.ts`; exercise its matrix in `apps/mobile/src/lib/profile.test.tsx` for cold start, validated learner-only cache, owner/guardian/proxy-capable cache, joined learner, explicit proxy, missing selection, refresh completion, and role transition — done when: focused resolver regressions fail against the global-loading behavior and pass after the resolver is wired.
- [x] T2: Exercise the `ProfileProvider` → `useProfiles()` foreground-refetch path through `AppState` in `apps/mobile/src/lib/profile.test.tsx` — done when: deferred-refetch tests prove learner content remains usable, owner/guardian/proxy capability is loading-gated, cadence is unchanged, and success/failure cannot expose stale authority.
- [x] T3: Prove `AppLayout` gate stability in `apps/mobile/src/app/(app)/_layout.test.tsx` — done when: learner refresh keeps the navigator mounted while loading/error states take precedence over redirect, create-profile, and consent gates for owner/guardian/proxy capability.
- [x] T4: Validate and prepare lifecycle evidence — done when: the commands below, hosted change-class checks, red/green evidence, and completion artifacts are green and reviewable.

## Reproduction and validation commands

Run from the WI-2901 worktree root:

```powershell
pnpm exec jest apps/mobile/src/lib/profile.test.tsx --runInBand --forceExit
pnpm exec jest "apps/mobile/src/app/(app)/_layout.test.tsx" --runInBand --forceExit
pnpm exec jest apps/mobile/src/lib/profile.test.tsx "apps/mobile/src/app/(app)/_layout.test.tsx" --runInBand --forceExit
pnpm exec jest apps/mobile/src/lib/navigation-contract-usage-guard.test.ts --runInBand
pnpm exec nx run @eduagent/mobile:typecheck
pnpm exec eslint apps/mobile/src/lib/profile.ts apps/mobile/src/lib/profile.test.tsx "apps/mobile/src/app/(app)/_layout.test.tsx" apps/mobile/src/lib/navigation-contract-usage-guard.test.ts
pnpm exec prettier --check apps/mobile/src/lib/profile.ts apps/mobile/src/lib/profile.test.tsx "apps/mobile/src/app/(app)/_layout.test.tsx" apps/mobile/src/lib/navigation-contract-usage-guard.test.ts
git diff --check
```

The explicit `git push origin HEAD:WI-2901` runs the repository pre-push
change-class gate. The PR gate then requires `main`, flag-on integration,
Windows/Orion contract, API quality, E2E web smoke, CodeQL, merge completeness,
and exact-head independent review.
