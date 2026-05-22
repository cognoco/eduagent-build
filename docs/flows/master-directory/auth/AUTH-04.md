# AUTH-04 - Sign In With Email And Password

> **Status:** Draft  
> **Access label:** Shared same behavior  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/app/(auth)/sign-in.tsx`, `apps/mobile/src/app/(auth)/_layout.tsx`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/e2e/flows/auth/sign-in-navigation.yaml`, `apps/mobile/e2e/flows/auth/sign-in-validation-devclient.yaml`, `docs/flows/plans/student-flow-revision-checkpoints/agent-1-auth-account.md`

## Purpose

Let an existing user authenticate with email and password, recover from ordinary form mistakes, complete any supported Clerk verification step, and enter the app context they were trying to reach.

This is an account-entry flow, not a Study or Family feature. The app does not know the final audience until Clerk signs the user in and the authenticated profile list loads. After sign-in, `/(app)/_layout.tsx` becomes the authority for profile loading, consent gates, pending redirect replay, and the current Study/Family shell.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Can sign in from the shared auth gate. If the user requested a reachable Study route, the redirect should preserve it and then load the active profile's Study context. |
| Mentor / Family | Can sign in from the same shared auth gate. If the requested route is a Family route, post-auth routing must still pass through profile/family-link authorization before surfacing child data. |
| Owner/account | Owner account access is supported. Account-level settings, billing, export, delete, and profile management are only available after the owner profile is loaded and role gates pass. |
| Wrong-audience deep link | The sign-in screen should not decide audience access. It preserves a sanitized requested path; the authenticated app shell and destination route must reject or reroute unauthorized Study/Family/owner-only destinations. |

## Shared Scope Decision

`Shared same behavior`

Email/password sign-in is shared by all users. Scope differences begin after authentication, when the active profile, consent status, family capability, parent proxy state, and requested route are known.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Cold launch while signed out | `/`, then `/(auth)/sign-in` through auth gates | Yes | Yes | `app-launch*.yaml` expects the sign-in controls. |
| Auth route direct entry | `/(auth)/sign-in` | Yes | Yes | Shared signed-out surface; renders `sign-in-screen`, SSO buttons, email/password fields, forgot-password, sign-up, and optional preview CTA. |
| App-route bounce while signed out | `/(app)/*` -> `/sign-in?redirectTo=...` | Yes | Yes | `/(app)/_layout.tsx` calls `rememberPendingAuthRedirect(resolveAuthRedirectPath(pathname))` before redirecting. |
| Web/browser redirect param | `/(auth)/sign-in?redirectTo=...` | Yes | Yes | `sign-in.tsx` reads Expo params and `window.location.search`; browser param is important on web when Expo search params are percent-encoded. |
| Forgot password link | `/(auth)/forgot-password` | Yes | Yes | Secondary recovery path from the sign-in form. |
| Sign-up link | `/(auth)/sign-up` | Yes | Yes | Carries typed email as a convenience param when present. |
| Additional verification continuation | inline verification state in `sign-in.tsx` | Yes | Yes | Email code, phone code, TOTP, and backup-code branches are handled when Clerk reports them. Unsupported factors show contact-support guidance. |

## Data Ownership And Privacy

- The signed-out form must not show profile, subscription, family, consent, or learning data.
- The email address and password are sent only to Clerk via `signIn.create`; no app profile data is loaded by this screen.
- `rememberPendingAuthRedirect()` stores only an internal route path plus timestamp. It must not store names, emails, profile IDs, session IDs, or child data.
- Unsafe redirect targets are normalized away by `toInternalAppRedirectPath()`: external URLs, protocol-relative URLs, and non-slash values fall back to `/(app)/home`.
- After `setActive()` succeeds, the sign-in screen intentionally waits for auth layout/app layout state rather than directly pushing app routes. This prevents stale Clerk state from bouncing the user back to the form.
- Profile and child-data privacy is enforced after sign-in by profile scope, family-link checks, consent gates, and route-specific guards. The auth form is only a gate opener.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | While Clerk or session activation is in progress, the user sees either a disabled/loading form control or the `sign-in-transitioning` spinner with "Signing you in...". |
| Empty | Empty email/password fields keep the primary button disabled and show the inline hint for the missing field. |
| Success | Clerk returns a created session, `setActive()` succeeds, `markSessionActivated()` records the transition, and the auth/app layouts redirect to the remembered route or `/(app)/home`. |
| Error/recovery | Clerk errors render inline. Unsupported verification methods show explanatory copy and contact-support. Activation failures expose a retry action. A stuck post-activation transition renders `sign-in-transitioning-stuck` with Try again and Sign up escapes. |
| No access | Signed-out users remain on auth screens. Signed-in users trying to view `/(auth)/sign-in` are redirected by `/(auth)/_layout.tsx` to the requested app route or home. Unauthorized app destinations must be handled after auth, not by this screen. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | 2026-05-22 checkpoint confirmed anonymous `/` and `/sign-in` load the shared sign-in gate. Seeded authenticated web sign-in was blocked by the existing AUTH-04 session-expired bug. |
| Native/emulator | `e2e/flows/auth/sign-in-navigation.yaml` covers screen discovery, sign-up/forgot navigation, keyboard state, and scroll-to-CTA behavior. `e2e/flows/auth/sign-in-validation-devclient.yaml` covers empty submit, email-only submit, password entry/toggle, and sign-up link. |
| API/unit tests | Auth-layout tests cover redirect target preservation, unsafe target fallback, route-group normalization, signed-in re-redirect, and changed redirect targets. App-layout tests cover signed-out redirect to sign-in, pending redirect replay, timeout fallback, and clearing stable home redirects. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Existing bug | https://www.notion.so/3688bce91f7c81818b81c045870cfedd | `[AUTH-04] Web email sign-in returns to sign-in with session-expired banner`; this blocked authenticated runtime confirmation in the 2026-05-22 checkpoint. |
| Product drift | `docs/specs/2026-05-21-navigation-contract.md` | Current post-auth shell is V0/V0-compatible. Final Family mode requires server-backed context and Recaps before all mentor routes can be restored according to the target contract. |
| Coverage gap | AUTH-05 adjacency | Supported additional verification branches exist in code, but there is no dedicated E2E seed for MFA/TOTP/backup-code paths. |

## Open Questions

- Should the sign-in form expose audience-neutral wording forever, or should first-run Study/Family intent later influence pre-auth copy after the onboarding-intent work lands?
- Once `resolveNavigationContract()` exists, should AUTH-04 validation include a matrix of post-auth redirect outcomes for Study, Family, owner-only, child, and unauthorized child-route targets?
