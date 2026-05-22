# AUTH-13 - Deep-Link Auth Redirect Preservation

> **Status:** Draft  
> **Access label:** Shared different scope  
> **Last mapped:** 2026-05-22  
> **Sources:** `mobile-app-flow-inventory.md`, `student-flow-access-inventory.md`, `mentor-flow-access-inventory.md`, `2026-05-21-navigation-contract.md`, `apps/mobile/src/app/(auth)/_layout.tsx`, `apps/mobile/src/app/(auth)/sign-in.tsx`, `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/lib/pending-auth-redirect.ts`, `apps/mobile/src/lib/normalize-redirect-path.ts`, `apps/mobile/e2e/flows/auth/deep-link-redirect-ttl-expired.yaml`, `docs/_archive/plans/done/2026-05-14-deep-link-ttl-expired-flow.md`, `docs/flows/plans/student-flow-revision-checkpoints/agent-1-auth-account.md`

## Purpose

Preserve the user's intended destination when they open a protected app route while signed out, sign in, and should return to that route if it is still fresh and authorized.

The product outcome is continuity: tapping a notification, web URL, or saved link should not dump the user on Home after authentication unless the requested route is invalid, stale, unsafe, or unavailable to the active profile.

## Audience Access

| Audience | Expected behavior |
| --- | --- |
| Student / Study | Student routes such as Library, Progress, sessions, Homework, Quiz, Dictation, Practice, and More may be restored after sign-in when reachable by the active profile. |
| Mentor / Family | Mentor routes may be restored only after the signed-in adult profile is proven family-capable and authorized for the requested child/report/recap data. The auth redirect mechanism preserves the path; it does not grant child access. |
| Owner/account | Owner-only routes such as subscription, account, privacy/export/delete, and profile management may be restored only for owner profiles after app gates load. |
| Wrong-audience deep link | The redirect path is sanitized and replayed through the app shell. The final route must block, reroute, or fall back if the active profile is a child/non-owner, not family-capable, in consent gate, or not linked to the requested child. |

## Shared Scope Decision

`Shared different scope`

The preservation mechanism is shared by all signed-out users, but the restored destination's scope is different for Study, Family, owner, child, consent-gated, and parent-proxy contexts.

## Entry Points And Routes

| Entry point | Route/screen | Surfaced from Study? | Surfaced from Family? | Notes |
| --- | --- | --- | --- | --- |
| Signed-out protected route | `/(app)/*` -> `/sign-in?redirectTo=...` | Yes | Yes | `/(app)/_layout.tsx` remembers the current path before redirecting. |
| Auth layout with redirect param | `/(auth)/_layout.tsx` | Yes | Yes | Resolves `redirectTo`, stores it with `rememberPendingAuthRedirect()`, and redirects signed-in users to the effective target. |
| Sign-in form with redirect param | `/(auth)/sign-in.tsx` | Yes | Yes | Reads local params plus web search params, remembers the target before `setActive()`, then waits for auth/app layouts to route. |
| Pending redirect replay | `/(app)/_layout.tsx` | Yes | Yes | If signed-in app shell lands somewhere else, it shows `auth-redirect-replay` and calls `router.replace(pendingAuthRedirect)`. |
| TTL-expired redirect | `pending-auth-redirect.ts` | Yes | Yes | Records older than 5 minutes are ignored and fall back to `/(app)/home`. |
| Web storage fallback | `window.sessionStorage` key `mentomate_pending_auth_redirect` | Yes | Yes | Used on web to survive auth-route param loss during the handoff. Native uses the in-memory record for the current process. |
| Dev/E2E stale seed | `/dev-only/seed-pending-redirect` | Test-only | Test-only | E2E-only helper seeds a stale record and routes to bare sign-in so the TTL branch can be verified. |

## Data Ownership And Privacy

- The pending record contains only `{ path, savedAt }`.
- `toInternalAppRedirectPath()` normalizes paths into the internal `/(app)` group and rejects unsafe external or protocol-relative redirects.
- Route-group segments are stripped and re-added so both `/quiz` and `/(app)/quiz` resolve to `/(app)/quiz`.
- TTL is 5 minutes. A stale record is discarded before replay, preventing old links from unexpectedly hijacking a later sign-in.
- Preserving a path is not authorization. Child, Family, account-owner, consent, subscription, and profile-scope rules must be enforced by the app shell, the destination screen, and the API.
- Diagnostics/tests should assert IDs and route keys only. No child names, profile names, emails, or raw profile objects belong in redirect storage.

## Expected States

| State | Expected user experience |
| --- | --- |
| Loading | After sign-in, if the shell is not yet on the pending target, the user sees the `auth-redirect-replay` spinner. |
| Empty | With no pending record or redirect param, signed-in users go to `/(app)/home`. |
| Success | A fresh sanitized route is replayed after sign-in and cleared after the target path remains stable for the settle window. |
| Error/recovery | If replay takes too long, `auth-redirect-timeout` appears with a Go Home recovery action. Malformed or unsafe targets fall back to home. |
| No access | The destination route should show its own no-access behavior or redirect to a safe root. Examples: Family child routes require linked-child access; owner-only routes require owner role; consent gates override normal app routes. |

## Validation Notes

| Lane | Coverage |
| --- | --- |
| Web preview | 2026-05-22 checkpoint confirmed signed-out `/library` and `/progress` redirect to sign-in with `redirectTo` params. Post-sign-in restoration was blocked by the existing AUTH-04 seeded web sign-in bug. |
| Native/emulator | `e2e/flows/auth/deep-link-redirect-ttl-expired.yaml` covers the TTL-expired fallback with a dev-only seed route. The inventory notes ordinary ADB deep-link restoration remains unreliable on Maestro 2.2.0. |
| API/unit tests | `pending-auth-redirect.test.ts` covers remember/peek/clear, stale vs fresh records, and dev/E2E guard errors. Auth-layout tests cover redirect param preservation, unsafe fallback, global/local/web param handling, remembered-route fallback, and changed redirect target rerouting. App-layout tests cover signed-out redirect capture, replay, stable-target clearing, default-home clearing, and timeout fallback. |

## Known Bugs And Drift

| Type | Link or ID | Note |
| --- | --- | --- |
| Historical bug | BUG-530 | Web `redirectTo` values could be percent-encoded in Expo params, causing deep-link targets to fall back to home. Current auth layout prefers `window.location.search` on web so decoded browser params win. |
| Existing blocker | https://www.notion.so/3688bce91f7c81818b81c045870cfedd | AUTH-04 web seeded sign-in returns to sign-in with a session-expired banner, so current post-sign-in restoration could not be rechecked in the 2026-05-22 web pass. |
| Harness limitation | Maestro 2.2.0 ADB deep-link unreliability | Inventory marks normal AUTH-13 mobile deep-link restoration as deferred; TTL fallback has a purpose-built dev-only path. |
| Product drift | `docs/specs/2026-05-21-navigation-contract.md` | Final Family/Study contract should move route reachability into `canEnter()` and `isSurfaced()` so preserved routes are evaluated consistently after auth. |

## Open Questions

- Should pending redirects to future Family Recaps be queued until Recaps exists, or should they fall back to Family Home with a soft notice?
- Should the TTL remain 5 minutes once OAuth and email verification flows are both considered, or should verification-specific handoffs get a longer server-backed resume token?
- Which route keys should be restored vs intentionally collapsed to context roots under the final `resolveNavigationContract()` matrix?
