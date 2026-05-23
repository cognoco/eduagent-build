# ACCOUNT-30 - Proxy-Only More Restrictions

> **Status:** Draft  
> **Access label:** Owner/account shared  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `audience-matrix.md`, `apps/mobile/src/app/(app)/more/index.tsx`, `apps/mobile/src/app/(app)/more/account.tsx`, `apps/mobile/src/app/(app)/more/privacy.tsx`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/hooks/use-active-profile-role.ts`, `apps/mobile/src/hooks/use-parent-proxy.ts`, `apps/mobile/src/app/profiles.tsx`, `apps/mobile/e2e/flows/account/more-impersonated-child.yaml`

## Purpose

Prevent a parent who is temporarily viewing a child profile through legacy proxy mode from accidentally performing account-level actions that belong to the parent's underlying account: sign out, subscription management, export data, and delete account.

This is a safety guard for retained proxy compatibility only. It must not define normal Study access. A real active student profile should keep its own Study shell and permitted account settings; normal parent/mentor review should use parent-native Family routes, not proxy mode.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Normal Study access must not be replaced by proxy restrictions. A child or adult studying as themselves should see Study-appropriate More rows, with owner/non-owner account actions gated by role. |
| Mentor / Family | Normal Family review should not enter proxy. Parents should open child detail, reports, recaps, and child progress through parent-native routes while remaining on the adult owner profile. |
| Owner/account | In owner context, sign out, subscription, export, and delete are available from the correct More sub-screens. In proxy, those account-level controls are hidden because they would affect the parent account while the UI says the child is active. |
| Wrong-audience deep link | Direct More/account/privacy links while proxy is active must still respect role gates. Direct child route links should require Family context. A non-family or child profile should not use proxy-only restrictions as a substitute for real route access checks. |

## Shared Scope Decision

`Owner/account shared`

The underlying controls are owner/account settings shared across Study and Family, but this flow maps the special proxy-only suppression state. It should be kept only as long as parent proxy exists; it is not the target Family navigation model.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Owner switches to child profile | `/profiles` -> `proxy-confirm-modal` -> `switchProfile(childId)` | Compatibility only | Compatibility only | Current Profiles confirmation explicitly enters "Viewing child's account"; target Family review should route to child detail instead. |
| Proxy app shell | `/(app)/_layout.tsx` | Compatibility only | Compatibility only | `isParentProxy` forces learner tab shape and visible tabs `home`, `library`, `progress`; More tab is removed from shell-level tabs. |
| More hub direct/deep access | `/(app)/more` | Reachable only if pushed/deep-linked | Reachable only if pushed/deep-linked | If rendered in proxy, the screen shows `more-proxy-preview-locked` instead of settings rows. |
| Account/Profile sub-screen | `/(app)/more/account` | Role-gated | Role-gated | `more-row-subscription` renders only for `role === 'owner'`; proxy role is `impersonated-child`, so it is hidden. Profile row and app language may still render if directly opened. |
| Privacy & Data sub-screen | `/(app)/more/privacy` | Role-gated | Role-gated | Export and delete rows render only for `role === 'owner'`; proxy role hides them. Privacy policy and terms remain neutral. |
| Sign out | `/(app)/more` -> `sign-out-button` | Owner/non-proxy only | Owner/non-proxy only | Hidden in proxy so the child-context UI cannot sign out the parent account. |
| Switch back | Proxy banner in app layout | N/A | N/A | Proxy banner is the intended escape, not a More-row sign-out/account action. |

## Data Ownership And Privacy

- `useParentProxy()` currently defines proxy as `activeProfile && !activeProfile.isOwner && parentProfile`, then sets `X-Proxy-Mode` and persists `parent-proxy-active`.
- `useActiveProfileRole()` gives proxy precedence and returns `impersonated-child`; More/account/privacy use that role to hide destructive or billing actions.
- Proxy rows protect account-level operations, but they do not fix the deeper modeling issue: a child profile on a shared account is treated as parent proxy even when the child may be using Study legitimately.
- More restrictions are UI protection only. API export/delete/subscription endpoints must still enforce owner/account authorization.
- Push token registration, post-session notification prompts, learning layouts, transcript links, and saved-message delete controls also branch on proxy today. Those are compatibility safeguards, not target Family behavior.
- The target navigation contract requires parent-native Family routes for child review and proxy only for retained internal/test paths until removed.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | Role/profile loading should avoid briefly exposing owner-only rows. Screens that need loading-aware role checks should use `useActiveProfileRoleState()` rather than treating null as owner. |
| Empty | Proxy More hub does not show a normal empty settings state; it shows a locked preview explanation and app version. |
| Success | In proxy, account-level actions are absent. In normal owner Study/Family, those same actions remain available from their proper surfaces. |
| Error/recovery | If proxy persistence fails, Sentry receives the error; the in-memory proxy flag still gates the current session. If direct sub-screen navigation occurs, role gates still hide subscription/export/delete. |
| No access | Child/non-owner profiles cannot manage owner account actions. Tampered route/API calls must fail server-side. Proxy must include a clear switch-back path so the user is not stranded. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | Not rerun in this mapping pass. Web should verify direct URL entry to `/(app)/more`, `/(app)/more/account`, and `/(app)/more/privacy` while proxy is active, because the More tab itself is hidden. |
| Native/emulator | `e2e/flows/account/more-impersonated-child.yaml` seeds a parent, switches to a child, opens More, and asserts sign-out/subscription/export/delete are absent. The YAML comments reference older file paths and only partially cover nested sub-screens. |
| API/unit tests | `use-active-profile-role.test.ts`, `use-parent-proxy.test.ts`, More/account/privacy screen tests, subscription tests, saved-bookmark tests, and layout tab-shape tests cover pieces of the current proxy guard. Future contract tests should prove proxy does not replace real Study access. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Current P1 bug | https://www.notion.so/3688bce91f7c814a9182e9324c21a6d2 | `[ACCOUNT-04] Shared-account child profile is forced into parent proxy`. This is the same root cause that makes ACCOUNT-30 dangerous if interpreted as normal child Study behavior. |
| Product drift | `docs/specs/2026-05-21-navigation-contract.md` | Target says parent proxy is compatibility/internal only; normal parent review should be parent-native Family routes. |
| Coverage drift | `apps/mobile/e2e/flows/account/more-impersonated-child.yaml` | The test expects More to be reachable after switching to child, but current app shell hides the More tab in proxy. It also asserts nested rows from the hub without necessarily opening Account/Profile or Privacy & Data. |
| Stale comments | `apps/mobile/e2e/flows/account/more-impersonated-child.yaml` | Comments point at old `more.tsx` line numbers and say rows live on the old long More page; current More is split into hub/account/privacy sub-screens. |
| Architecture drift | `apps/mobile/src/hooks/use-parent-proxy.ts` | Proxy detection cannot distinguish "child using their own profile" from "parent previewing child", so proxy safeguards can suppress legitimate Study affordances. |

## Open Questions

- What explicit action or state should remain for parent proxy after normal child review moves to Family child routes?
- Should direct `/(app)/more/account` and `/(app)/more/privacy` render a locked proxy explanation too, or is hiding owner-only rows enough?
- How should a shared-device child enter their own Study profile without being treated as an impersonated child?
- Should ACCOUNT-30 be deleted from the product flow directory once proxy is fully internal/test-only?
