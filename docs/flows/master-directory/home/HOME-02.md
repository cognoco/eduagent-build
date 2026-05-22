# HOME-02 - Parent Gateway Home

> **Status:** Draft  
> **Access label:** Family-only  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `audience-matrix.md`, `apps/mobile/src/app/(app)/home.tsx`, `apps/mobile/src/components/home/LearnerScreen.tsx`, `apps/mobile/src/components/home/ParentHomeScreen.tsx`, `apps/mobile/src/lib/app-context.tsx`, `apps/mobile/src/lib/profile.ts`

## Purpose

Give an adult family-support user a parent-native starting point for checking linked children, opening child progress and reports, sending nudges, seeing conversation starters, managing family setup, and switching back to their own Study context. This flow must not replace the adult's learner home; adults can be mentors and students at the same time.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Not surfaced as Study. Study users, including adults who also have family access, should see `LearnerScreen` / My Learning home for their own learning. |
| Mentor / Family | Surfaced for adult owners with family access as Family/Children home. Current V0 renders `ParentHomeScreen` from `/(app)/home` when local `mode === 'family'`; target contract resolves this through Family shell. |
| Owner/account | Adult owner status is required, but ownership alone is not enough for final Family mode. Target capability requires adult owner plus server-sourced family links. |
| Wrong-audience deep link | Child/non-owner, underage, solo learner, and profile-not-loaded states should resolve to Study-safe home or setup, not child-review content. Tampered child IDs must be handled by child route/server checks, not by parent proxy fallback. |

## Shared Scope Decision

`Family-only`

The product flow is Family-only: it is the Family home for adults supporting linked children. The implementation is currently a shared `/(app)/home` route with a V0 mode/content switch. That shared route shape should not blur the product rule: Study learner home remains the active user's own learning space, while parent gateway content belongs to Family.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Current Family home tab | `/(app)/home` -> `HomeScreen` -> `LearnerScreen` -> `ParentHomeScreen` | No target; current route can be reached but should render Study when mode is Study | Yes | `LearnerScreen` delegates when `MODE_NAV_V0_ENABLED ? mode === 'family' : hasLinkedChildren || isFamilyPlanOwner`. |
| Mode chip | `home-mode-chip` -> `switchMode('family')` | Current V0 bridge from Study | Current V0 bridge back to Study | Local-only V0. Target moves mode switching to global chrome and persists context server-side. |
| Child progress card | `parent-home-check-child-{id}`, `parent-home-child-progress-{id}` -> `/(app)/child/[profileId]?mode=progress` | No | Yes | Parent-native child drill-down; normal use should not switch into child proxy. |
| Child profile/settings avatar | `parent-home-child-profile-{id}` -> `/(app)/child/[profileId]?mode=settings` | No | Yes | Opens linked-child detail/settings surface. |
| Child reports action | `parent-home-weekly-report-{id}` -> `/(app)/child/[profileId]/reports` | No | Yes | Parent report list/detail surface. |
| Nudge action | `parent-home-send-nudge-{id}` -> `NudgeActionSheet` | No | Yes | Sends a child support nudge through mentor-side controls. |
| Account avatar | `parent-home-account-avatar` -> `/(app)/more/account` | Owner/account route | Yes | Account settings remain owner-scoped, not child-scoped. |
| Add child management row | `parent-home-add-child` -> `/create-profile?for=child` or subscription limit/upgrade alert | Optional owner setup only | Yes | Adding more children is family setup/management, not a Study prerequisite. |
| Add-first-child empty card | `add-first-child-screen` -> `/create-profile?for=child` | No target; see HOME-07 | Setup-only | Empty Family home state when no linked children exist in current V0/family-plan branch. |
| Study activation card | `parent-home-study-activation-action` -> `switchMode('study')` | N/A | Yes | Keeps the adult's own learning reachable from Family. |

## Data Ownership And Privacy

- Family home data is child-support data for linked children visible to the adult owner. It should be authorized by family-link and consent rules in the API, not by trusting local profile arrays.
- Current V0 capability is inferred from `isFamilyCapableProfile(activeProfile, profiles)`: adult owner plus at least one non-owner profile. The target contract requires `hasFamilyLinks` from the server and `profiles.default_app_context`.
- `ParentHomeScreen` combines dashboard child data, linked child profiles, child consent grace banners, family subscription limits, nudge actions, and the adult's own resume target. The adult resume target is shown only as "you can study too" context; it must remain adult-owned Study data.
- Child routes opened from this flow (`/(app)/child/[profileId]`, reports, future Recaps) must enforce linked-child access. Family home should not broaden access to every profile on an account.
- Parent proxy is compatibility/internal. This flow should route to parent-native child pages, not switch active profile to a child as the default review mechanism.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | App shell should start Study-safe until profile/family capability is known. Current `HomeScreen` shows a neutral spinner before rendering either learner or parent content. |
| Empty | Adult with no linked children should see setup choices and a continue-studying path. Current `ParentHomeScreen` shows `add-first-child-screen`; target says this is setup, not a blocking Family context. |
| Success | Adult sees family summary, recent child activity, child command cards, conversation starters, reports/progress/nudge actions, family management, and a clear Study bridge. |
| Error/recovery | Dashboard or child data errors should recover inside Family home or linked child routes. Fallbacks must not leak child data, force parent proxy, or send a Family user to a dead Recaps tab before Recaps exists. |
| No access | Non-owners, child profiles, underage users, adults without family links, and profile-not-loaded sessions should not see parent gateway content. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Verify current V0 mode chip, `parent-home-screen`, child cards, account avatar, add-child state, and no tab leakage. Future check should validate Family tabs only after Recaps exists. |
| Native/emulator | Inventory lists `e2e/flows/parent/parent-tabs.yaml` and `parent-dashboard.yaml`, but these reflect current/legacy parent behavior and need revalidation against the Study/Family contract. |
| API/unit tests | `apps/mobile/src/app/(app)/home.test.tsx` covers owner/child home routing and V0 mode switch. `ParentHomeScreen.test.tsx` covers child routes, add-first-child, nudge, reports, and Study activation. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product drift | Reconciled navigation contract | Current Family V0 uses `/(app)/home` and tabs `home, progress, more`; target Family shell is `home, recaps, progress, more`. |
| Naming drift | Inventory HOME-02 | Inventory says `ParentGateway`, but current code uses `ParentHomeScreen`; no current `ParentGateway` component was found in the active home path. |
| Capability drift | `apps/mobile/src/lib/profile.ts` | Family capability is inferred client-side from profiles; target requires server-sourced `hasFamilyLinks`. |
| Scope drift | `apps/mobile/src/components/home/LearnerScreen.tsx` | Parent home can render from inside `LearnerScreen`; Study-vs-Family ownership is therefore controlled by local mode/flags rather than a single navigation contract. |
| Missing surface | Recaps | Family target depends on Recaps, but `/(app)/recaps` does not exist yet and must not be surfaced as a dead tab. |

## Open Questions

- Should `ParentHomeScreen` become the long-term Family Home component, or should it be split into a clearer `FamilyHome` boundary when the contract lands?
- Where should Family setup live for adults who choose Family before linking a child: Study Home CTA, onboarding intent, More, or a dedicated setup screen?
- Should the adult self-learning summary remain visible on Family Home, or should Family Home only show a simple switch back to Study?
