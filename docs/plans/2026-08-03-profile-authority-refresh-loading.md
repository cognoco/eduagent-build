---
title: Profile Authority Refresh Loading — Implementation Plan
date: 2026-08-03
profile: code
work_items: [WI-2901]
status: done
---

# Profile Authority Refresh Loading — Implementation Plan

**Goal:** Keep validated learner-only sessions usable during background authority refreshes while preventing cached owner or proxy capability from remaining interactive until revalidation settles.
**Approach:** Centralize the provider's loading decision in a pure resolver that distinguishes cold/unvalidated state, learner-only authority, and capability-bearing cached state. Exercise that resolver and the real foreground-refetch path with regressions before changing the provider wiring.

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

- [x] T1: Specify the loading decision for cold start, validated learner-only cache, owner/family cache, joined learner, explicit proxy, missing selection, refresh completion, and role transition — done when: focused resolver regressions fail against the current owner-unscoped loading behavior and pass after the resolver is wired into `ProfileProvider`.
- [x] T2: Exercise foreground and repeated refresh behavior through `AppState` — done when: deferred-refetch tests prove learner content remains usable, owner/proxy authority is loading-gated, cadence is unchanged, and success/failure cannot expose stale capability.
- [x] T3: Prove shell/gate stability — done when: existing or focused app-layout tests demonstrate learner refresh keeps the navigator mounted while loading/error states take precedence over redirect, create-profile, and consent gates for capability-bearing authority.
- [x] T4: Validate and prepare lifecycle evidence — done when: mobile typecheck, focused mobile suites, applicable change-class checks, red/green evidence, and completion artifacts are green and reviewable.
