# ACCOUNT-03 - Add Child Profile From More Or Profiles

> **Status:** Draft  
> **Access label:** Owner/account shared  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/app/(app)/more/index.tsx`, `apps/mobile/src/app/profiles.tsx`, `apps/mobile/src/app/create-profile.tsx`, `apps/mobile/src/components/home/ParentHomeScreen.tsx`, `apps/mobile/e2e/flows/parent/add-child-profile.yaml`, `apps/mobile/e2e/flows/regression/bug-239-parent-add-child.yaml`

## Purpose

Let an eligible adult account owner create a child profile so Family/Mentor support can begin: dashboard cards, child detail, reports, consent management, child memory, and family subscription/profile-limit checks.

This is setup for Family support, not a requirement for Study. An adult can sign up, create only their own profile, and keep learning in Study without adding a child. Add-child should be presented as an optional owner action when the user wants family support, never as a blocking step or the only route out of onboarding/home.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Not required for Study. Adult owners may see Add child as an optional setup affordance from More or setup prompts, but the Study shell must continue to provide Home, Library, Progress, and More for the adult's own learning. Child/non-owner students should not see Add child. |
| Mentor / Family | Primary setup path for adult family-support users. If the adult has no linked child yet, setup can invite adding a child, but the target contract keeps the user in a Study-safe shell until a real family link exists. |
| Owner/account | Owner-only. Current More uses `isAdultOwner({ role, birthYear })`; Profiles uses `activeProfile?.isOwner`; create-profile then keeps a parent adding a child on the parent profile after creation. |
| Wrong-audience deep link | Signed-out `/create-profile` redirects to sign-in. A child/non-owner profile should not be surfaced Add child, and server profile creation/profile-limit rules must reject unauthorized or over-limit attempts. A solo adult choosing not to add a child must be able to return to Study. |

## Shared Scope Decision

`Owner/account shared`

The control is account-owner setup shared across Study and Family surfaces, but its product meaning is Family setup. It must not be classified as a Study prerequisite. Study can surface a lightweight bridge; Family/setup can surface it as a primary action.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| More hub family section | `/(app)/more` -> `add-child-link` -> `/create-profile?for=child` | Optional owner setup only | Yes, owner setup | Current More shows the row for adult owners and gates by Family/Pro unless no subscription data yet. |
| Profiles manager | `/profiles` -> `profiles-add-button` -> `/create-profile` | Owner only | Owner only | First child is allowed regardless of tier; additional children require Family/Pro and profile-limit availability. |
| Family home empty state | `ParentHomeScreen` -> `add-first-child-screen` -> `/create-profile?for=child` | Transitional/setup prompt only | Yes | Target says this is setup, not a Family app context until a child link exists. The prompt must not strand adults who want to keep studying. |
| Family summary panel | `ParentHomeScreen` -> `parent-home-add-child` -> `/create-profile?for=child` | No direct Study surface | Yes | Uses the same subscription and max-profile gates after the first child. |
| Create child form | `/create-profile?for=child` | Reachable for adult owner setup | Reachable for adult owner setup | Copy changes to child-referent labels. Birth date drives age/privacy handling; persona/region selectors are gone. |
| Upgrade path | `/(app)/subscription` | Owner only | Owner only | Shown when adding another child exceeds non-Family/Pro entitlement or Family max-profile limits. |
| Cancel/close | `create-profile-cancel` -> `goBackOrReplace('/(app)/home')` | Yes | Yes | Deep-link/no-back fallback returns Home, which must be the correct context root after navigation-contract work. |

## Data Ownership And Privacy

- Creating a child profile is an account-owner write, not a child self-service write.
- `create-profile.tsx` treats `activeProfile.isOwner && profiles.length > 0` as parent-adding-child even without `?for=child`; when successful, it does not switch to the new child profile.
- Parent-created child profiles receive inline consent handling from the API; the app does not send the parent through the child self-consent request flow after this setup path.
- The client invalidates profile queries and adds the new profile optimistically before invalidation to avoid a profile-gate flash.
- Add-child visibility is UI gating only. Server profile creation, profile limits, ownership, consent, and subscription rules remain authoritative.
- The target navigation contract requires server-backed family capability (`hasFamilyLinks`) rather than inferring Family access from `profiles.some(!isOwner)`.
- A new child profile should unlock parent-native Family routes; it should not force the adult into proxy/view-as-child mode.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | If subscription data is still loading, More shows a non-blocking "try again" notice instead of asserting an upgrade. `/create-profile` shows auth loading until Clerk resolves. |
| Empty | Adult with no children may see a setup CTA, but also retains a Study path. Profiles with no profiles shows first-profile creation, which is distinct from Add child. |
| Success | The child profile is created, profile data refreshes, the parent remains on the owner profile, and the user returns to the previous/root context with confirmation. |
| Error/recovery | Profile limit errors show an upgrade CTA. Slow creation times out after 30 seconds with an inline retryable error. General API errors use `formatApiError`. |
| No access | Signed-out users redirect to sign-in. Child/non-owner profiles do not see Add child. Under-18/non-owner attempts and tampered server calls must fail outside the UI. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Not rerun in this mapping pass. Web-specific branch in `ParentHomeScreen` uses `location.assign('/create-profile?for=child')`, so route/query handling should be checked when Family setup is retested on web. |
| Native/emulator | `e2e/flows/parent/add-child-profile.yaml` exercises seeded parent -> Family dashboard -> Profiles -> Create profile. Its comments still mention older persona/region/consent behavior and should be refreshed. |
| API/unit tests | `create-profile.test.tsx` covers child-referent copy, auth gate, parent-add-child behavior, timeout, and profile-limit handling. `profiles.test.tsx` covers Add button visibility and first-child/additional-child gates. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product guardrail | `feedback_never_force_add_child.md` / navigation contract | Add child must remain optional. Any onboarding, Family setup, or home state that traps an adult into child creation is product drift. |
| Current V0 drift | `apps/mobile/src/lib/app-context.tsx` | Family capability is inferred from local profiles; target requires server-sourced `hasFamilyLinks`. |
| Proxy drift | `apps/mobile/src/app/create-profile.tsx`, `apps/mobile/src/app/profiles.tsx` | Parent-created child correctly keeps the parent active, but Profiles later lets the owner switch into the child via proxy. Normal Family review should use child routes instead. |
| Coverage drift | `apps/mobile/e2e/flows/parent/add-child-profile.yaml` | The flow enters through Family dashboard and Profile text; current More hub routes profile through Account/Profile, and old comments mention removed setup fields. |
| Stale docs risk | Older parent setup docs | Any doc that says child creation is required to use the app is stale. The real product rule is optional mentor/family setup. |

## Open Questions

- Should the first-child exception remain after Family subscription packaging is final, or should it become an explicit free setup allowance in billing copy?
- Where should the optional setup CTA live for adult owners without children once `default_app_context` is server-backed: Study Home, More, onboarding intent, or all three with one shared component?
- Should `/create-profile?for=child` refuse to render for non-owner active profiles client-side before submit, or is hiding entry points plus server enforcement sufficient?
