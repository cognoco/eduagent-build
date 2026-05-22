> Agent 5 checkpoint - 2026-05-22

# Scope

- Batch 7: BILLING-01..12
- Batch 8: PARENT-01..13 negative mentor access from Study
- Batch 9: CC-01..18 cross-cutting

# Environment

- Branch: `i18n-translations`
- Local HEAD observed: `32946837b` (prompt shared context said `ae5cacc8a`)
- API target: `https://api-stg.mentomate.com`
- Preview target: `http://127.0.0.1:19006`
- Working tree note: `apps/mobile/src/app/(app)/_layout.tsx` was already modified before Agent 5 edits/checkpointing; Agent 5 did not edit source or git state.

# Current Findings

## Ready to file / verify in Notion

### PARENT-03 / PARENT-04 / PARENT-05 / PARENT-06 / PARENT-08 / PARENT-10 / PARENT-11 / PARENT-12 / PARENT-13 + CC-17

Study-mode deep links to `/(app)/child/[profileId]/*` are wrapped by `RequireFamilyContext`, but `useGuardFamilyRoute()` calls `setMode('family')` and `router.replace('/(app)/home')` when a family-capable user is currently in Study. From the student perspective this changes app context and routes to Family home instead of showing a protected/no-access fallback or returning to Study home.

Evidence:

- `apps/mobile/src/components/guards/RequireFamilyContext.tsx` renders a spinner while `familyCapable && mode !== 'family'`.
- `apps/mobile/src/lib/navigation.ts` `useGuardFamilyRoute()` performs `setMode('family')` and `router.replace(FAMILY_HOME_PATH)` when mode is not family.
- `apps/mobile/src/app/(app)/child/[profileId]/_layout.tsx` wraps all child subroutes in `RequireFamilyContext`.

Expected:

- In Study, mentor/family child routes are not surfaced.
- Direct/deep link to child routes either redirects to a safe Study surface or shows a protected/no-access fallback.
- Profile-as-lens should not leak or mutate mentor/family context into Study.

Actual:

- Direct child-route entry from Study switches app mode to Family and navigates to Family home, altering the user's Study context.

Likely priority: `P1` or `P2` depending triage appetite; broad negative-access breach but no confirmed data leak.

# Coverage Notes So Far

- Billing source inspected: `apps/mobile/src/app/(app)/subscription.tsx` and `subscription.test.tsx`.
- More/account/privacy role gates inspected: subscription row, export/delete, sign out, add-child/family sharing.
- Tab shell and app mode inspected: `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/lib/app-context.tsx`, `apps/mobile/src/lib/use-mode-switch.ts`.
- Child route guard inspected: `RequireFamilyContext`, `useGuardFamilyRoute`, child route layout.
- Progress Study filtering inspected: Study mode forces `selectedProfileId` to active profile and hides child picker.

# Next

- Finish billing/paywall static review and existing E2E flow inspection.
- Finish cross-cutting checks for back fallback, i18n, envelope stripping, stale-send, stable refs, and web backgrounds.
- Search Issue Tracker - Open before creating Notion bug(s).
