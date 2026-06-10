# ACCOUNT-04 - Profile Switching

> **Status:** Draft  
> **Access label:** Shared different scope  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/app/profiles.tsx`, `apps/mobile/src/lib/profile.ts`, `apps/mobile/src/hooks/use-parent-proxy.ts`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/app/(app)/home.tsx`, `apps/mobile/src/app/(app)/more/index.tsx`, `apps/mobile/e2e/flows/account/profile-switching.yaml`, `docs/flows/plans/student-flow-revision-checkpoints/agent-2-home-subject.md`

## Purpose

Let a signed-in account choose which real profile is active on the device, then reload app data and navigation so the user sees the correct learning, account, and family-support context.

This flow is a profile-identity switch, not a data-view filter. The active profile controls `X-Profile-Id`, profile-scoped query caches, tab shape, More/account gates, consent gates, and whether the user is operating as their own student profile or in a parent preview/proxy state.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Any real student profile should load its own Study context: Home, Library, Progress, More, and student-owned learning data. A child profile on a shared account should not lose normal Study affordances merely because an owner profile also exists. |
| Mentor / Family | Adult owners with linked children can switch profiles, but normal child review should use parent-native Family routes. Switching into a child account is currently a proxy/preview compatibility path, not the target Family review experience. |
| Owner/account | Owners can switch among account profiles, rename profiles where allowed, and add profiles subject to subscription/max-profile gates. Owner-only account actions remain gated to owner profiles. |
| Wrong-audience deep link | `/profiles` is auth-gated. A signed-out deep link redirects to sign-in. A non-owner active profile can view/switch profiles but cannot see the Add profile affordance. Unauthorized profile IDs must be rejected by the server switch endpoint. |

## Shared Scope Decision

`Shared different scope`

Profile switching is shared by profile-capable accounts, but the expected scope depends on who is active after the switch: owner account, adult Study, Family-capable adult, child/self Study, consent-gated child, or legacy parent proxy.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| More -> Account/Profile -> Profile row | `/profiles` | Yes | Yes | Current More hub routes Profile through `/(app)/more/account`; `more-row-profile` lives on Account/Profile. |
| Direct profile manager | `/profiles` | Reachable | Reachable | Root-level route, not inside `(app)`. It has its own Clerk auth gate. |
| Owner taps child profile | `/profiles` -> `proxy-confirm-modal` -> `switchProfile(childId)` | Compatibility path | Compatibility path | Current UI asks the owner to confirm "Viewing X's account" before entering child profile/proxy mode. |
| Child/non-owner taps owner profile | `/profiles` -> `switchProfile(ownerId)` | Yes | No | Switches immediately without the proxy confirmation modal. |
| Add profile | `/profiles` -> `/create-profile` | Owner only | Owner only | Button is hidden for non-owner active profiles and gated by subscription/max-profile checks. |
| Close/done | `profiles-close` -> `goBackOrReplace('/(app)/home')` | Yes | Yes | Deep-link entry without back history returns to Home. |

## Data Ownership And Privacy

- `POST /v1/profiles/switch` is the authoritative ownership check. The client list is only a UX hint.
- On successful switch, `ProfileProvider.switchProfile()` persists `mentomate_active_profile_id`, updates the API client's active profile ID, sets proxy mode based on current V0 rules, then resets profile-scoped TanStack queries.
- Query reset uses `PROFILE_SCOPED_KEYS`; account-level `profiles` is intentionally excluded so the app does not blank during every switch.
- If SecureStore persistence fails, the in-memory switch still succeeds but the caller gets `persistenceFailed` and shows a non-blocking warning.
- Non-owner profiles cannot add profiles and can rename only themselves. Owners can rename all profiles.
- Current V0 proxy detection treats any non-owner active profile in an account with an owner as `isParentProxy`. This protects parent-preview writes, but it also collapses legitimate child Study profile switching into parent proxy.
- Parent proxy mode sets an imperative `X-Proxy-Mode` flag for requests and persists `parent-proxy-active`; failures are captured to Sentry.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | `/profiles` shows `profiles-auth-loading` while Clerk hydrates, then `profiles-loading` while profiles load. During a switch, rows dim and duplicate taps are ignored. |
| Empty | If signed in with no profiles, the screen shows "No profiles yet" and a Create profile action. |
| Success | The selected profile becomes active, profile-scoped data reloads, the modal closes, and the user returns to the previous screen or `/(app)/home`. |
| Error/recovery | Switch failure shows "Could not switch profiles" with the typed server/client error. A 20s switch timeout shows "Taking longer than expected". Persistence failure shows a warning that the user may need to pick the profile again after reopening. |
| No access | Signed-out `/profiles` redirects to `/sign-in`. Non-owner active profiles do not see Add profile. Tampered/unlinked profile IDs must fail through the server switch endpoint. Consent gates may block the newly active profile after switch. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | 2026-05-22 student pass did not rerun full authenticated setup because shared sign-in was blocked. Static/code review found the child-profile proxy drift below. |
| Native/emulator | `e2e/flows/account/profile-switching.yaml` seeds `parent-with-children`, opens More/Profile, checks active indicator/add button, optionally taps `Test Teen`, and confirms the switch path. The flow comments note current post-auth landing can vary. |
| API/unit tests | `profiles.test.tsx` covers active checkmark, owner-to-child confirmation, cancel, child-to-owner immediate switch, duplicate-tap guard, persistence warning, add-profile gates, no-back fallback, owner/non-owner edit controls, switch thrown-error handling, non-owner Add profile hiding, and signed-out deep-link auth gate. `profile.test.tsx` covers active-profile persistence and query/proxy effects. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Current P1 bug | https://www.notion.so/3688bce91f7c814a9182e9324c21a6d2 | `[ACCOUNT-04] Shared-account child profile is forced into parent proxy`. Evidence: `use-parent-proxy.ts` and `profile.ts` mark any non-owner profile with an owner in the profile list as proxy mode. This hides Study actions, add-subject affordances, My Notes, empty-subject CTA, CoachBand, and the More tab for switched child profiles. |
| Historical flow result | https://www.notion.so/3608bce91f7c81f49152df527f941d9b | Earlier flow-revision pass marked profile switching pass after targeted web role-transition checks, but the newer Study/Family mapping exposes a stricter requirement: real child profile switching must not automatically become parent proxy. |
| Product drift | `docs/specs/2026-05-21-navigation-contract.md` | Current V0 uses local mode state and proxy precedence. Target V1 requires server-backed `defaultAppContext`, `hasFamilyLinks`, parent-native Family routes, and proxy only as a retained compatibility/internal state. |
| Copy drift | `apps/mobile/src/app/profiles.tsx` | Proxy confirmation says the parent will see "library, progress, recaps and saved bookmarks", but Recaps is not yet a first-class route/tab in current mobile code. |
| Coverage drift | `apps/mobile/e2e/flows/account/profile-switching.yaml` | The flow still expects More -> Profile directly, while current More hub routes profile through Account/Profile. It uses optional waits/taps around child profile availability and landing destination, so it may pass without proving the target Study/Family contract. |

## Open Questions

- Under the final navigation contract, should tapping a child row ever switch active profile, or should it route to parent-native child detail/recaps while leaving the adult owner active?
- If child self-use on a shared account is supported, what explicit signal distinguishes "the child is using their own profile" from "the parent is previewing the child"?
- Should `/profiles` become contract-aware so it routes Family-capable adults to child detail instead of proxy for normal review?
- Should the proxy confirmation copy be updated until Recaps exists, or should Recaps be added before this copy is treated as accurate?
