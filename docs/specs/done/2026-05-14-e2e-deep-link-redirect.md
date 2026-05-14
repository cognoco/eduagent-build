# E2E Spec — Deep-link Auth Redirect Preservation

**Status:** Draft 2026-05-14 (corrected 2026-05-14: `__test/seed-pending-redirect` → `dev-only/seed-pending-redirect` — Expo Router treats `_`-prefixed paths as private routes; using `dev-only/` so the route is reachable via openLink)
**Owner:** _TBD — pick up by E2E rotation_
**Related Notion:** Android E2E Issues Tracker `AUTH-13 Deep-link auth redirect preservation` (High)

## Goal

A signed-out user opens `mentomate:///library` (or any internal deep-link target, optionally as an `https://` Universal Link) from email, push, or another app. The auth layout must:

1. Intercept and route the user to sign-in.
2. Preserve the original target across the sign-in handoff.
3. After Clerk activates the session, deliver the user to that target — not the fallback `/(app)/home`.

The production code path is implemented in three coordinated places:

- `apps/mobile/src/app/(app)/_layout.tsx:1455-1463` is the actual entry point for the signed-out deep-link case: when an unauthenticated user lands on any `(app)/*` route, the layout calls `rememberPendingAuthRedirect(resolveAuthRedirectPath(pathname))` and does `<Redirect href="/sign-in?redirectTo=<encoded>" />`. This is the persistence write that survives the sign-in detour.
- `apps/mobile/src/app/(auth)/_layout.tsx:32-78` reads `redirectTo` from local + global + web search params, normalises via `toInternalAppRedirectPath`, re-persists via `rememberPendingAuthRedirect`, and `router.replace`s after `isSignedIn` flips.
- `apps/mobile/src/app/(auth)/sign-in.tsx:215-233` re-stores the same value from sign-in params on every render.
- `apps/mobile/src/lib/pending-auth-redirect.ts` keeps a 5-minute TTL — **in-process memory (native) + sessionStorage (web only)**. There is no SecureStore / AsyncStorage layer; on native, the record is RAM-only and is **lost on app cold start**. Cold-start recovery relies on Expo Router re-firing the deep-link intent and the `(app)/_layout.tsx` redirect re-running.

No Maestro flow currently asserts the end-to-end behaviour on Android. A regression — e.g. accidentally stripping `redirectTo` in a `router.replace`, breaking the 5-minute TTL, or routing through a redirect that drops query params — would silently land the user on `/home` instead of the deep-link target.

## Surface to cover

Note on URL shape: external deep links use the **rendered** path, not the Expo Router group syntax — `mentomate:///library`, not `mentomate://(app)/library`. Group segments like `(app)` only appear in **internal** redirect-target strings (the value of `?redirectTo=` and the `pendingAuthRedirect` record). Maestro `openLink` and `adb am start` must use the rendered shape.

| Entry path | Trigger | Target route | Coverage today |
|---|---|---|---|
| `mentomate:///library` while signed-out | external link / push | sign-in → library | none |
| `mentomate:///library` while signed-in | external link / push | library directly | none |
| `mentomate:///quiz/<roundId>` while signed-in | push notification (round-result reminder) | quiz round screen (`apps/mobile/src/app/(app)/quiz/[roundId].tsx`) | none |
| TTL expiry (any deep link, wait >5 min, sign-in) | open link, wait, then sign-in | sign-in → fallback `/home` | none |
| Web URL `?redirectTo=%2F(app)%2Flibrary` | Playwright covers it | library | covered ([BUG-530] note in `_layout.tsx`) |

Note: there is no `(app)/quiz/[id].tsx` — the quiz round route is `(app)/quiz/[roundId].tsx`. Use a stable route like `/(app)/library` (testID `library-screen`) as the default deep-link target for these flows; it has no per-row data dependency and survives any seeded user.

The TTL row is the one easy to miss: if a user takes >5 minutes to enter credentials (forgot password, MFA detour, swapping apps **without killing the app**), the redirect should silently fall back to `/home` per `PENDING_AUTH_REDIRECT_TTL_MS = 5 * 60_000`. That should be asserted, not assumed. (Caveat: on native, an app cold start during the wait wipes the in-memory record anyway, and Expo Router will re-fire the original intent on resume, so TTL only fires when the app stays alive the whole time. The test must guarantee this.)

## Mechanism decision

| Mechanism | What it does | Use when |
|---|---|---|
| **Maestro `openLink: mentomate:///library`** | Maestro sends an `ACTION_VIEW` intent via the underlying device driver. Works on AVDs. | Default for signed-out entry — keeps the flow self-contained. |
| **ADB `am start -W -a android.intent.action.VIEW -d 'mentomate:///library' com.mentomate.app`** | Manual intent dispatch with `-W` to wait for activity. | Use inside the seed wrapper when the link must fire BEFORE Maestro takes over (race-free precondition). |
| **HTTPS Universal Link (`https://mentomate.app/library`)** | Real production entry path; requires the AssetLinks JSON + Chrome handler. | NOT in scope — covered by manual QA. Asserting this in Maestro is fragile because Chrome may intercept. |
| **Time travel for TTL** | Date.now mock / fake clock | NOT available at the OS layer. Maestro cannot fast-forward the native clock. |

**TTL test mechanism.** Server-side endpoints cannot help here: the `pendingAuthRedirect` record lives entirely on the device (in-memory + sessionStorage on web). Nothing from the network ever writes into it. The three options that actually work, ranked:

1. **Dev-only test seed route inside the mobile app.** Register an Expo Router screen at `apps/mobile/src/app/dev-only/seed-pending-redirect.tsx`, guarded by `if (process.env.NODE_ENV !== 'production' && Constants.appOwnership === 'expo')` (or a build-time `EXPO_PUBLIC_E2E === 'true'` flag), that reads `path` and `staleMs` from search params and calls `rememberPendingAuthRedirect(path)` with a manually back-dated `savedAt`. Maestro hits it via `openLink: mentomate:///dev-only/seed-pending-redirect?path=%2F(app)%2Flibrary&staleMs=360000`. Preferred — keeps test-only behaviour in the mobile bundle that already has dev-client variants.
2. **`EXPO_PUBLIC_PENDING_AUTH_REDIRECT_TTL_MS` override.** Make `PENDING_AUTH_REDIRECT_TTL_MS` read from env with a 5-min default, and set a 2-second value in E2E builds. Simpler, but the production binary diverges from the test binary, and the TTL is no longer the production TTL — so the test is no longer asserting production behaviour. Lower confidence.
3. **Wait it out (≥5 min).** Honest and high-fidelity, but blows the regression-suite time budget.

Pick option 1. The existing `TEST_SEED_SECRET`-gated API endpoint in `apps/api/src/routes/test-seed.ts` is **not** the right place — that endpoint can seed server-side state (DB rows, Clerk users) but cannot reach into the device's RAM. A server `/v1/__test/seed-pending-redirect` would be inert.

Alternative if dev-only mobile routes are unwelcome: skip the TTL flow for now and document the gap. The signed-out + signed-in flows still close the critical regression risk.

## Flows to add

### 1. `e2e/flows/auth/deep-link-redirect-signed-out.yaml`

| Step | Mechanism | Assertion |
|---|---|---|
| Cold start at sign-in screen | `seed-and-run.sh --no-seed` | `sign-in-screen` visible |
| Fire `openLink: mentomate:///library` | Maestro | `sign-in-screen` stays visible (auth layout did NOT navigate). The signed-out bounce in `(app)/_layout.tsx` may briefly show its own `ActivityIndicator` placeholder before the redirect resolves — allow up to 2 s. |
| Sign in with seeded credentials | seed-and-run.sh standard flow | session activated |
| Wait for navigation | `extendedWaitUntil` (timeout 8 s) | `library-screen` visible, NOT `home-screen` |

### 2. `e2e/flows/auth/deep-link-redirect-signed-in.yaml`

| Step | Mechanism | Assertion |
|---|---|---|
| Cold start with seeded session | seed-and-run.sh | `home-screen` visible |
| Fire `openLink: mentomate:///library` | Maestro | `library-screen` visible within 3 s |

This one is shorter — no sign-in detour, just verifying the existing Expo Router deep-link wiring routes correctly when signed-in.

### 3. `e2e/flows/auth/deep-link-redirect-ttl-expired.yaml` (conditional on dev-only seed route)

| Step | Mechanism | Assertion |
|---|---|---|
| Cold start at sign-in | `seed-and-run.sh --no-seed` | sign-in screen visible |
| Fire `openLink: mentomate:///dev-only/seed-pending-redirect?path=%2F(app)%2Flibrary&staleMs=360000` | Maestro | screen shows `pending-redirect-seeded` testID confirming the record was written with stale `savedAt` |
| Navigate back to sign-in (the seed route auto-redirects) | seed route handler | sign-in screen visible |
| Sign in | seed-and-run.sh standard | session activated |
| Wait for navigation | `extendedWaitUntil` | `home-screen` visible (TTL fallback fired), NOT `library-screen` |

Pre-req for flow 3: implement the dev-only seed route described in the "TTL test mechanism" section above. Gate it behind `process.env.NODE_ENV !== 'production'` (or an `EXPO_PUBLIC_E2E` flag) so the screen is not registered in production bundles. The route module should be the only test surface — no server endpoint is required.

Alternative if a dev-only mobile route is unwelcome: skip flow 3 for now and document the gap. The signed-out + signed-in flows still close the critical regression risk.

## Pre-reqs / wiring

- Default deep-link target is `/(app)/library` (route file `apps/mobile/src/app/(app)/library.tsx`). It must expose a stable testID `library-screen` — grep first; add if missing. Avoid quiz routes as the target: `(app)/quiz/[roundId].tsx` requires a real round row in the DB, and `(app)/quiz/launch.tsx` requires session prerequisites — both add seed surface for no extra coverage.
- `home-screen` testID must exist on `apps/mobile/src/app/(app)/home.tsx` for the negative-path assertion ("NOT home"). Verify before authoring; add if missing.
- Verify the `mentomate` scheme intent filter is registered on the AVD: `adb shell pm dump com.mentomate.app | grep -A2 'android.intent.action.VIEW'`. Expo's `scheme` value lives in `apps/mobile/app.config.ts` / `app.json`.
- Manual sanity check before adding the YAML: `adb shell am start -W -a android.intent.action.VIEW -d 'mentomate:///library' com.mentomate.app` and observe the app foreground the library screen (when signed-in) or the sign-in screen (when signed-out).

## Failure Modes table

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Deep-link fires while sign-in screen is mid-mount | race with sign-in.tsx useEffect that reads params | Sign-in screen renders, but `redirectTo` lost from local params | `peekPendingAuthRedirect` recovers from sessionStorage on web; on native, the in-memory record set by `(app)/_layout.tsx:1461` survives the bounce — verify the test catches this race by firing the link BEFORE Maestro begins typing credentials |
| User signs in after TTL | >5 min between link click and credential submit, **app stays alive throughout** | Lands on `/home` silently | Acceptable per design — TTL is 5 min |
| App is cold-started during the wait | OS kills app while waiting; user reopens via app icon | Sign-in screen visible, no pending-redirect record (RAM-only on native) | Lands on `/home` — same outcome as TTL expiry, but via a different path. Not separately tested. |
| Deep-link target route requires guard | e.g. quiz route requires active round row | Navigates to quiz, then in-app guard bounces to `/home` or shows ErrorFallback | Out of scope — guards tested elsewhere. Avoid quiz routes as the default target for this reason. |
| Malformed deep-link | `mentomate://random` not normalisable | `toInternalAppRedirectPath` falls back to `/(app)/home` | Lands on home — assert this explicitly in a unit test on `toInternalAppRedirectPath` rather than Maestro (cheaper) |

## Tests this spec spawns

- `e2e/flows/auth/deep-link-redirect-signed-out.yaml`
- `e2e/flows/auth/deep-link-redirect-signed-in.yaml`
- `e2e/flows/auth/deep-link-redirect-ttl-expired.yaml` (conditional on the dev-only seed route)
- New dev-only route `apps/mobile/src/app/dev-only/seed-pending-redirect.tsx` (gated by `NODE_ENV !== 'production'`), if pursuing option 1 of the TTL test mechanism
- Unit test on `toInternalAppRedirectPath` malformed-input fallback (likely already exists at `apps/mobile/src/lib/normalize-redirect-path.test.ts` — verify before adding)

## Non-goals

- HTTPS Universal Links (real Chrome handoff) — manual QA only.
- iOS deep-link parity — separate iOS suite.
- Web `?redirectTo=` parsing — Playwright covers `[BUG-530]` already.
