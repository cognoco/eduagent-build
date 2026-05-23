# HOME-03 - Parent Tabs And Parent-Mode Navigation

> **Status:** Draft  
> **Access label:** Family-only  
> **Last mapped:** 2026-05-23  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `audience-matrix.md`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/app/(app)/home.tsx`, `apps/mobile/src/components/home/ParentHomeScreen.tsx`, `apps/mobile/src/lib/app-context.tsx`, `apps/mobile/src/lib/profile.ts`

## Purpose

Define what an adult family-support user sees in the app shell: a parent-native Family context for reviewing linked children, opening child progress/reports/detail/nudges, managing family setup, and switching back to the adult's own Study context without losing their student identity.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Not a Study surface. Students, child profiles, and adults studying as themselves should see Study tabs: `home`, `library`, `progress`, `more`. |
| Mentor / Family | Adult owner with child access should see Family tabs. Target: `home`, `recaps`, `progress`, `more`; current V0: `home`, `progress`, `more` in mode nav or legacy guardian tabs including `own-learning`/`library`. |
| Owner/account | Adult owner can be both mentor and student. Family shell is available only when family-capable; owner-only settings/billing remain in More/Account, while Study remains reachable. |
| Wrong-audience deep link | Child/non-owner and solo learner attempts should resolve to Study-safe shell. Family-only child routes should require linked-child access; normal parent review should not enter proxy mode. |

## Shared Scope Decision

`Family-only`

The product target is Family-only: this flow owns parent-mode navigation. Current code is shared with different scope because the same tab shell, `/(app)/home`, `/(app)/progress`, and `/(app)/more` are reused across Study, Family V0, guardian V0, and parent-proxy compatibility states. The reconciled navigation contract is intended to centralize these differences and stop per-screen recomputation.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| App tab shell | `/(app)/_layout.tsx` | Yes, Study shape | Yes, current V0 Family shape | Computes visible tabs from `mode`, `resolveTabShape`, and `isParentProxy`. |
| Current Family home tab | `/(app)/home` -> `ParentHomeScreen` when `mode === 'family'` | No | Yes | Target still has Family home, but under contract and with server-backed capability. |
| Current Family progress tab | `/(app)/progress` | Study self progress | Family child progress | In Family V0, tab is shared route with child selector/child APIs. |
| Current Family More tab | `/(app)/more` | Yes, self/account settings | Yes, family/account settings | Rows are still gated inside screens rather than by a single contract. |
| Target Recaps tab | `/(app)/recaps` | No | Yes in V1 | Minimal route/API exists in the navigation-contract branch and opens parent-native child session detail for full context. |
| Legacy guardian own-learning tab | `/(app)/own-learning` | No | Legacy/transition only | V0 guardian shape exposes this, but FULL target removes top-level `own-learning`; Study itself becomes adult self-learning. |
| Legacy guardian library tab | `/(app)/library` | Yes | Legacy/transition only | FULL target says Family child curriculum should use child routes, not top-level adult Library. |
| Child card progress action | `/(app)/child/[profileId]?mode=progress` | No | Yes | Parent-native linked-child drill-down from `ParentHomeScreen`. |
| Child reports action | `/(app)/child/[profileId]/reports` | No | Yes | Parent-native reports list and report details. |
| Add child setup | `/create-profile?for=child` | Optional owner setup only | Yes, setup state | Must not trap adult; continue-studying path remains required. |
| Study activation card | local `switchMode('study')` | N/A | Yes | Current `ParentHomeScreen` contains "Want to study too?" bridge back to Study. |

## Data Ownership And Privacy

- Family shell data belongs to linked children that the adult owner is allowed to see, not to every profile on the account and not to arbitrary `profileId` params.
- Current family capability is inferred client-side by `isFamilyCapableProfile(activeProfile, profiles)`: owner, adult age bracket, and at least one non-owner profile. Target requires server-sourced `hasFamilyLinks`.
- Family Progress and child Home cards use dashboard/child APIs (`dashboard.children`, child inventory, child sessions, reports, weekly reports) when viewing a child. These must remain server-authorized by family-link/consent rules.
- Adult self-learning is still private Study data. Family mode can show a parent learning summary/bridge, but direct learning routes should switch/write as the adult, not as a child.
- Parent proxy is a retained compatibility state. In proxy, visible tabs are `home`, `library`, `progress`; More is hidden and a proxy banner is required. Normal Family review should use child routes and Recaps/Progress, not proxy.
- Diagnostics and analytics for navigation should include IDs/enums only; do not log child display names, birth years, or raw profiles.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Least-surprising Study-safe shell until active profile/capability is known. Do not flash Family-only tabs to non-family users. |
| Empty | Adult with no linked children stays in Study-safe shell with optional Family setup CTA. Current `ParentHomeScreen` has `add-first-child-screen`, but target says setup is not an app context. |
| Success | Family-capable adult in Family sees Family home, child progress/recap/report routes, More, and a clear bridge back to Study. V1 adds Recaps; V0 still uses the legacy tab shape. |
| Error/recovery | Route failures should recover to context root: Family home or Recaps for Family routes, Study home for Study routes. Child access failures should show protected/not-found recovery, not fallback to proxy. |
| No access | Child/non-owner, solo child owner, adult without family links, and profile-not-loaded states should not see Family tabs. Tampered child IDs must fail server-side and in route guards. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Existing shell tests cover tab visibility; manual/web verification should check no hidden tab spacing, no full-screen tab leakage, and correct opaque backgrounds. |
| Native/emulator | `e2e/flows/parent/parent-tabs.yaml` is listed for this flow, but it reflects the current/legacy parent tab journey and should be updated when Recaps and contract routing land. |
| API/unit tests | `apps/mobile/src/app/(app)/_layout.test.tsx` covers current tab shapes and mode tab sets. Future validation needs `navigation-contract.test.ts`, snapshot/guard tests, and Family route access cases. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product drift | Reconciled navigation contract | Current Family V0 tabs are `home`, `progress`, `more`; target Family tabs are `home`, `recaps`, `progress`, `more`. |
| Verification gap | Recaps | Minimal `/(app)/recaps` route/API/schema now exist in the navigation-contract branch; dedicated Maestro coverage still needs to be added or folded into `parent-tabs.yaml`. |
| Legacy drift | Guardian tabs | `GUARDIAN_TABS` still include `own-learning` and `library`; FULL target removes top-level `own-learning` and excludes top-level Library from Family. |
| Capability drift | Client-side family inference | Current family capability is derived from the local profile list; target requires server-backed `hasFamilyLinks` and `profiles.default_app_context`. |
| Proxy drift | Parent proxy normality | Proxy still affects tab visibility and can be entered through profile switching paths. Target says normal parent review must be parent-native. |
| Scope drift | Shared `progress` route | Progress currently handles self-vs-child filtering inside the screen and hooks. Target contract wants `progressScope: self | children` owned centrally. |

## Open Questions

- What is the first minimal Recaps implementation that is good enough to make the Family tab real without duplicating child session detail?
- During rollout, should the V0 guardian shape remain behind `MODE_NAV_V0_ENABLED`, or should it be deleted once the contract shell migrates?
- How should push notification taps choose between Study and Family when an adult is in an active Study session?
- Should Family setup for adults without children live on Study Home, More, or a dedicated onboarding intent route before profile completion?
