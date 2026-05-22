# HOME-08 - Home Loading Timeout Fallback

> **Status:** Draft  
> **Access label:** Shared different scope  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/app/(app)/home.tsx`, `apps/mobile/src/app/(app)/home.test.tsx`, `apps/mobile/src/components/home/LearnerScreen.tsx`, `apps/mobile/src/app/(app)/_layout.tsx`

## Purpose

Prevent Home from becoming an endless spinner when profile or home data loading stalls. The user should get an actionable recovery path that is safe for their current context: Study users can retry or move to Study-safe areas, while Family users should recover to Family-safe roots instead of being sent to student-only surfaces.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Retry loading Home, go to Library, or open More. Current fallback is Study-safe and uses `home-loading-timeout`, `home-loading-retry`, `timeout-library-button`, and `timeout-more-button`. |
| Mentor / Family | Retry loading Family Home or go to Family-safe destination. Target should not offer top-level Library because Family mode should not surface Library; More is safe, and Recaps/Family Home is safe only once implemented. |
| Owner/account | Owner can use More/account recovery. Billing/account actions remain role-gated inside More. |
| Wrong-audience deep link | If profile/context is unknown, fallback should degrade to Study-safe recovery and avoid exposing Family-only child routes. |

## Shared Scope Decision

`Shared different scope`

The timeout pattern is shared across app contexts, but the secondary actions differ by scope. Current implementation is Study-biased: after 10 seconds of `useProfile().isLoading`, Home offers Retry, Library, and More. That is appropriate for Study but not for the target Family shell, where top-level Library is intentionally not surfaced.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Home profile-load stall | `/(app)/home` -> `home-loading-timeout` after 10s | Yes | Current V0 yes; target needs context-aware actions | Triggered by `HomeScreen` while `isLoading` remains true. |
| Retry action | `home-loading-retry` -> `setLoadingTimedOut(false)` | Yes | Yes | Resets local timeout flag so loading indicator can reappear while profile load continues. |
| Study secondary action | `timeout-library-button` -> `router.replace('/(app)/library')` | Yes | Current V0 yes; target no | Safe for Study. Drift for Family target because top-level Library is Study-only. |
| Shared/account secondary action | `timeout-more-button` -> `router.replace('/(app)/more')` | Yes | Yes | More is the safest cross-context recovery root, with rows gated by role/context. |
| Subject-load timeout inside learner home | `learner-loading-timeout` after 15s subject loading | Yes | No target | Offers retry and `learner-loading-go-home`; separate from route-level Home profile timeout. |
| App shell profile timeout | `profile-loading-timeout` after 20s in `/(app)/_layout.tsx` | Shared | Shared | Higher-level gate fallback offers Retry or Sign out before Home mounts. |
| Auth redirect timeout | `auth-redirect-timeout` after 15s in `/(app)/_layout.tsx` | Shared | Shared | Offers Go Home recovery for pending auth redirect replay. |

## Data Ownership And Privacy

- Home timeout should not infer or expose Family capability while `activeProfile` is unknown. The navigation contract explicitly says profile-not-loaded states degrade to Study-safe shell.
- Retry does not change active profile or clear server state; it only allows the current loading path to continue. A future retry should also invalidate/refetch the profile query if the stall is caused by cached query state.
- Library recovery is safe only when the effective context is Study or proxy compatibility. In Family target, child curriculum must be reached through child routes, not top-level Library.
- More recovery is shared but its account, export/delete, subscription, family rows, and child controls must remain gated by owner/role/context.
- Timeout diagnostics should include route/context enums and IDs only; do not log display names, birth years, or raw profile data.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | For the first 10 seconds, show a neutral centered activity indicator and do not flash learner or parent content. |
| Empty | Not an empty-data state. If loading resolves to no subjects, HOME-05 handles learner empty subjects; if no children, HOME-07 handles optional setup. |
| Success | If loading completes before timeout, the timeout flag clears and Home renders the correct Study or Family content. |
| Error/recovery | After timeout, user sees clear copy, Retry, and context-safe secondary navigation. Current Study actions are Retry, Library, More. Target Family should use Retry plus More and/or Family Home/Recaps when available. |
| No access | Higher auth/profile/consent gates should intercept before Home. If context cannot be resolved, recovery remains Study-safe rather than Family-only. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Hard to trigger manually because it depends on a 10s profile-loading stall; use controlled query/network delay or unit tests. Verify no wrong home content flashes before timeout. |
| Native/emulator | Inventory marks this deferred because the 10s timeout is hard to trigger reliably in Maestro. A future flow could inject a profile-loading stall at the harness level. |
| API/unit tests | `apps/mobile/src/app/(app)/home.test.tsx` covers timeout render, Retry reset, Library replace, and More replace. `/(app)/_layout.tsx` has separate profile-loading and auth-redirect timeout coverage. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product drift | Navigation contract route rules | Family target excludes top-level Library, but current Home timeout always offers `timeout-library-button`. |
| Coverage gap | Inventory HOME-08 deferred | Maestro coverage is deferred because controlled 10s home loading stalls are hard to trigger. |
| Recovery gap | `home-loading-retry` | Retry only clears local timeout state; it does not explicitly refetch profiles. If the profile query is wedged, user may time out again. |
| Scope overlap | `profile-loading-timeout` vs `home-loading-timeout` | App shell has a 20s profile-loading timeout before Home; Home also has a 10s profile-loading timeout. Future contract work should clarify which fallback owns which stall. |
| Family setup interaction | HOME-07 | If a no-child Family setup branch is loading, recovery should not send the user into add-child as the only path. |

## Open Questions

- Should Home timeout retry invalidate/refetch the profiles query instead of only resetting local UI state?
- What should the Family secondary action be before Recaps exists: More only, Family Home retry only, or a tracked disabled Recaps-safe fallback?
- Should the Home route keep its own profile-loading timeout once the app shell already has `profile-loading-timeout`, or should the two be consolidated under the navigation contract?
