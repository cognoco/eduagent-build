# Parent Home End-User Audit

Date: 2026-05-11
Branch: `parent-profile-carveout`
Verified: 2026-05-11 (6-agent cross-check + coordinator fix pass)

Scope:
- Seeded single learner profile.
- Seeded parent profile with children.
- Expo web smoke path using the local API and seeded auth state.

Notion:
- Not recorded to Notion from this session because the Notion connector was not available. This file is the local bug ledger.

## Findings

| ID | Area | User impact | Status | Verified By |
| --- | --- | --- | --- | --- |
| PH-AUDIT-1 | Database migration drift | Seed setup initially hit missing nudge/book-suggestion database shape. | **Resolved** — `0070_omniscient_landau.sql` matches schema definitions exactly. Orphaned `0070_create_nudges_table.sql` deleted. | `verified: schema↔migration 1:1 match, journal consistent, orphan deleted` |
| PH-AUDIT-2 | Parent smoke expectation | Parent seed setup waited for the old learner screen even though the parent correctly landed on the new Parent Home. | **Fixed** — `scenarios.ts` `ownerWithChildren.landingTestId` now `parent-home-screen`. All e2e-web journey specs (j03–j17) updated to use `parent-home-screen`, `parent-home-check-child-*`, `child-detail-scroll`. | `verified: grep scenarios.ts + all j-specs show correct testIDs` |
| PH-AUDIT-3 | Parent Home orientation copy | First-time parent Home still said "family hub" and referenced family settings. | **Fixed** — all 7 locale files updated: EN "This is your home" / "Kids' progress and your own learning, all in one place." with matching translations in nb, de, es, pt, ja, pl. Dead `tabs.familyLabel` key also removed. | `verified: grep orientationCueTitle shows new copy in all 7 locales` |
| PH-AUDIT-4 | Onboarding route registration | Expo web bundling failed because onboarding declared `initialRouteName: 'index'` but `onboarding/index.tsx` was missing. | **Fixed** — `onboarding/index.tsx` exists, redirects to `/(app)/onboarding/pronouns`. | `verified: file exists, layout initialRouteName matches, redirect target exists` |
| PH-AUDIT-5 | Smoke runtime | The seeded smoke flow exceeded the 3-minute cap while parent setup was waiting for the stale learner landing marker. | **Fixed** — resolved by PH-AUDIT-2 (scenarios.ts now uses correct marker). | `verified: scenarios.ts ownerWithChildren uses parent-home-screen` |

## Additional Issues Found and Fixed

| ID | Area | Severity | Fix |
| --- | --- | --- | --- |
| PH-AUDIT-NEW-1 | E2E stale parent markers | High | Fixed j04, j05, j06, j07, j14, j16, j17 — all now use `parent-home-screen` and `child-detail-scroll` instead of `learner-screen`/`dashboard-scroll`/`home-child-card`/`dashboard-child-*-primary`. j05 and j06 rewritten (old `/family` route no longer exists). |
| PH-AUDIT-NEW-2 | Maestro shared setup | High | `seed-and-sign-in.yaml`: added `parent-home-screen` as valid landing. `return-to-home-safe.yaml`: added parent-home-screen guard. New `return-to-home-check-parent-home.yaml` guard file. `return-to-home.yaml`: accepts both landings. |
| PH-AUDIT-NEW-3 | Maestro parent flows (testID) | High | 15 Maestro flows updated: `dashboard-child-*-primary` → `parent-home-check-child-*`, `dashboard-scroll` → `parent-home-screen`. |
| PH-AUDIT-NEW-4 | Maestro stale text assertions | High | `multi-child-dashboard.yaml` rewritten — dead "Family"/"Everyone you're learning alongside" text replaced with actual `parent-home-screen` assertions and real i18n strings. |
| PH-AUDIT-NEW-5 | Dead E2E setup flow | Medium | `switch-to-parent.yaml` deleted (zero callers, referenced removed persona tap). |
| PH-AUDIT-NEW-6 | Dead i18n keys | Low | `tabs.familyLabel` removed from all 7 locales. |
| PH-AUDIT-NEW-7 | Dead hook | Low | `useFamilyPresence` hook + test deleted (zero production callers). |
| PH-AUDIT-NEW-8 | Stale code comment | Low | `more/index.tsx:171` comment updated to reflect Family tab removal. |

## Notes

- Earlier targeted component tests passed but emitted React `act(...)` warnings around parent transition/push registration code. Not treated as end-user blockers.
- `dashboard-scroll` references remain in Maestro setup YAML comments and optional/guard blocks. These are functionally safe (the testID is checked with `optional: true` or `when: not visible` patterns) and will silently pass through. Cleanup is optional.
- `family.title` and `family.subtitle` i18n keys remain in locale files — zero code callers but kept pending explicit cleanup decision.
