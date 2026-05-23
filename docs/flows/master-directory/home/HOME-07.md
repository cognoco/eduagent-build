# HOME-07 - Add First Child Setup

> **Status:** Draft  
> **Access label:** Family-only  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `audience-matrix.md`, `apps/mobile/src/app/(app)/home.tsx`, `apps/mobile/src/components/home/LearnerScreen.tsx`, `apps/mobile/src/components/home/ParentHomeScreen.tsx`, `apps/mobile/src/lib/app-context.tsx`, `apps/mobile/src/lib/profile.ts`, `apps/mobile/src/app/(app)/own-learning.tsx`

## Purpose

Invite an eligible adult owner to create the first child profile so Family support can become useful, while preserving the adult's ability to continue studying as themselves. This is optional family setup, not a gate that blocks Study.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Not required and not blocking. A Study user with no subjects should be guided to create a subject, not a child profile. |
| Mentor / Family | Eligible adult owner without linked children can see setup CTA to add the first child. The flow should also provide continue-studying/skip recovery. |
| Owner/account | Adult owner can enter `/create-profile?for=child` if allowed. Subscription/family-plan limits may affect adding additional children, but the first-child setup invitation must not trap the owner. |
| Wrong-audience deep link | Child/non-owner/underage users should not be forced into child creation. Direct `/create-profile?for=child` attempts must be role/age/subscription guarded by the profile creation flow. |

## Shared Scope Decision

`Family-only`

This is a Family setup flow. It is not Study, and it is not the final Family home. The important product rule is negative: add-first-child must never be a prerequisite for learner Study. Current code still has a V0/family-plan branch where `LearnerScreen` can render `ParentHomeScreen` and show `add-first-child-screen`; that is compatibility/setup behavior, not the target Study shell.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Current add-first-child card | `ParentHomeScreen` -> `add-first-child-screen` | No target; possible only through current V0/shared home branch | Yes, setup state | Card copy says the family dashboard starts after adding the first child. |
| Primary setup CTA | `add-first-child-screen-primary` -> `/create-profile?for=child` | No | Yes | On native uses `router.push({ pathname: '/create-profile', params: { for: 'child' } })`; on web assigns `/create-profile?for=child`. |
| Family management add profile row | `parent-home-add-child` -> `/create-profile?for=child` or subscription/limit alert | Optional owner setup only | Yes | For existing families, this becomes add-another-child management with plan-limit checks. |
| Study activation bridge | `parent-home-study-activation-action` -> `switchMode('study')` | N/A | Yes when linked children exist | Current compact bridge appears in recent child activity, so the no-child empty state lacks an equally explicit visible Study escape inside `ParentHomeScreen`. |
| Home tab fallback | `/(app)/home` | Yes | Yes current V0 | `HomeScreen` test asserts owner with no children renders `LearnerScreen`; `LearnerScreen` component test separately covers family/pro owner branch showing add-first-child. |
| Own learning legacy route | `/(app)/own-learning` -> `LearnerScreen showParentHome={false}` | Legacy/transition | Legacy guardian bridge | Ensures guardian V0 can mount adult learner home without parent branch. Target removes top-level `own-learning` in favor of Study context. |
| Profile creation flow | `/create-profile?for=child` | Owner setup only | Yes | Covered by ACCOUNT-03/ACCOUNT-19 family/profile setup flows, not by Home alone. |

## Data Ownership And Privacy

- Creating the first child creates or links a child profile under account/family rules; it must not mutate the adult's own learner subjects, sessions, progress, or resume target.
- Current no-child setup can be reached by a family/pro owner branch (`isFamilyPlanOwner`) even before an actual child link exists. Target contract says Family setup is not an app context until family capability exists.
- `showAddChild` in `ParentHomeScreen` uses `isAdultOwner({ role, birthYear })`; underage, child, and impersonated-child roles should not see family setup as a normal action.
- Plan-limit checks apply to adding additional profiles and may route to subscription, but entitlement logic must not obscure the basic Study escape.
- Direct child setup routes should be guarded by server/account ownership and consent requirements. Home setup copy alone is not authorization.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Do not show add-child as the only visible app path while profile/subscription state is unknown. Start with neutral or Study-safe loading. |
| Empty | Eligible adult without linked children sees a clear Family setup invitation plus a way to continue studying. Current empty card has add-child primary; target should make the non-blocking Study path explicit. |
| Success | Tapping the setup CTA opens child profile creation. After child creation/linking, Family Home can show child cards, reports, nudges, and conversation starters. |
| Error/recovery | If profile creation is unavailable, subscription-gated, or fails, user can return to Home/More/Study. Do not strand them on a setup-only branch. |
| No access | Non-owner, child, underage, and proxy states should not receive this setup CTA. They remain in Study-safe or role-appropriate gates. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Verify `add-first-child-screen`, web assignment to `/create-profile?for=child`, and a visible Study/continue path once contract/setup UX is updated. |
| Native/emulator | `e2e/flows/parent/add-child-profile.yaml` and `regression/bug-239-parent-add-child.yaml` cover add-child broadly; add a focused no-child adult setup smoke when the Family setup design lands. |
| API/unit tests | `ParentHomeScreen.test.tsx` covers `add-first-child-screen` routing to `/create-profile?for=child`. `LearnerScreen.test.tsx` covers family owner with no linked children rendering add-first-child. `home.test.tsx` guards the solo owner Home route against forced add-child at the top level. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Product risk | `feedback_never_force_add_child` memory / navigation contract | Add-child must remain optional; solo/Study path is required for parent accounts. |
| Contract drift | Navigation contract matrix row 2 | Adult owner with Family intent but no links should remain Study shell plus setup CTA, not full Family shell. |
| UX gap | `ParentHomeScreen` empty branch | Current no-child `add-first-child-screen` has primary add-child CTA; the visible Study escape is clearer once children exist than in the empty state. |
| Implementation drift | `LearnerScreen` fallback branch | With `MODE_NAV_V0_ENABLED` off, family/pro subscription can trigger parent home even without linked children. Target says setup is not an app context. |
| Inventory drift | HOME-07 row | Row describes a "gate"; product framing should be "optional setup state" because Study must not be blocked. |

## Open Questions

- What exact secondary action should no-child setup show: "Continue studying", "Not now", or a mode switch in global chrome?
- Should choosing Family during onboarding create a temporary setup screen before profile completion, or should the user land in Study Home with setup CTA after sign-in?
- If an adult has Family/Pro but no child link, should Home show setup at all in Study mode, or should setup live only in More/onboarding intent?
