# Security — authn/authz — Bug Review

Lens: API + mobile authentication / authorization. Branch `new-llm`. Read-only review.

Scope walked exhaustively:
- `apps/api/src/middleware/**` — auth, jwt, account, profile-scope, proxy-guard, consent, metering, database, idempotency, cors, env-validation.
- `apps/api/src/routes/**` — every route group; focused read on parent/child IDOR-prone routes (learner-profile, dashboard, recaps, progress, notifications, consent, settings, onboarding, account, billing) and public/webhook routes (test-seed, maintenance, consent-web, stripe/revenuecat/resend webhooks).
- `apps/api/src/services/{consent,family-access,clerk-user,deletion,export,profile}*`.
- `apps/mobile/src/app/(app)/_components/*Gate.tsx`, `apps/mobile/src/components/ClerkGate.tsx`, mobile api-client header injection.

## Headline assessment

The authz layer is unusually well-hardened: the JWT verifier enforces an alg allowlist + downgrade guard + audience + maxAge (`jwt.ts`), the proxy guard derives proxy-mode server-side from `isOwner` rather than the client header (`proxy-guard.ts`), and every parent→child route I read uses `assertOwnerAndParentAccess` (isOwner gate + family-link IDOR check). Consent tokens are 128-bit `crypto.randomUUID()`, rate-limited, replay-protected, and the deny path is POST-only. Export/deletion are strictly account-scoped.

There is **one architectural soft spot** that produces a real privilege-escalation vector against the owner-only account and billing routes, plus several lower-severity items. Details below.

---

## High

### [HIGH] Owner-only account/billing routes bypassable by omitting `X-Profile-Id` (auto-resolve elevates any caller to owner)
- File: `apps/api/src/middleware/profile-scope.ts:113-166` (auto-resolve), `apps/api/src/services/profile.ts:249-318` (`findOwnerProfile` always returns the `is_owner=true` row), `apps/api/src/services/family-access.ts:145-157` (`assertOwnerProfile` trusts `profileMeta.isOwner`), call sites `apps/api/src/routes/account.ts:87,151,178,63` and `apps/api/src/routes/billing.ts:103,296,640,679,809,852,899`.
- What: All profiles on a family account share ONE Clerk login — the account is keyed on `clerkUserId` (`account.ts:81`, `findOrCreateAccount`), and "child on a parent's account" is not a separate Clerk identity. The active profile is asserted purely by the client `X-Profile-Id` header. When that header is **absent**, `profileScopeMiddleware` auto-resolves to the account's owner profile and sets `profileMeta.isOwner = true` unconditionally (the owner row is always `is_owner=true`). The owner-only routes gate via `assertOwnerProfile(c)` / `assertCanManageOwnConsent(c)`, which read `profileMeta.isOwner`. So a non-owner child operating on the shared account can simply omit `X-Profile-Id` on a raw request and be treated as the owner.
- Impact: A non-owner profile-holder can: schedule/cancel account deletion (`POST /v1/account/delete`, `/cancel-deletion`), export the entire account's data including every sibling profile (`GET /v1/account/export` → `generateExport` returns ALL account profileIds, `export.ts:199`), change the account email (`PATCH /v1/account/email`), and perform every owner-gated billing action (subscribe, cancel subscription, family add/remove). Same root cause also lets a child *write to the parent's profile data* by omitting the header on metered LLM routes (auto-resolve → owner profileId, `metering.ts:534-549` proxy guard passes because `isOwner=true`), and lets a minor be evaluated against the *owner's* (adult) birthYear in the consent gate (`consent.ts` middleware reads `profileMeta.birthYear`), bypassing their own consent block. The existing break tests (`account.test.ts:577-654`) only cover the case where the non-owner *sends* their own `X-Profile-Id`; the header-omission path is not tested and the test harness mock (`account.test.ts:95-110`) hardcodes auto-resolve to `isOwner:true`, masking it.
- Severity rationale: Not remotely exploitable by an unrelated attacker (requires a valid session for the shared account, i.e. a person operating a child profile on the device). But it defeats an explicit, security-relevant gating control with destructive/data-disclosure consequences (account delete, full cross-profile export). High, not Critical.
- Fix direction: The server must not let "header absent" mean "owner." Options, in order of robustness: (a) require `X-Profile-Id` on all owner-gated and metered routes — return 400 if absent rather than auto-resolving to owner (the account routes deliberately don't call `requireProfileId`, which is why they're exposed); (b) track the active profile server-side (e.g. bind it to the session / a server-issued switch token) instead of trusting the header; (c) at minimum, have `assertOwnerProfile` / `assertCanManageOwnConsent` reject when the resolved profile came from the *auto-resolve fallback* rather than an explicit header — add a `profileSource: 'header' | 'auto'` field to `ProfileMeta` and require `'header'` for owner-gated destructive routes. Add a break test that omits `X-Profile-Id` from a child session and asserts 403/400 on `/account/delete`, `/account/export`, `/billing/*`.

---

## Medium

### [MEDIUM] `assertNotProxyMode` / owner gates depend on a header the server cannot authenticate — defense relies on client cooperation for the *direction* of the elevation
- File: `apps/api/src/middleware/proxy-guard.ts:34-74`, `apps/api/src/middleware/metering.ts:534-549`.
- What: The SEC-2/BUG-718 hardening correctly removed the client's ability to *downgrade* a proxy request (a non-owner can no longer omit `X-Proxy-Mode` to gain child writes — `isOwner=false` still blocks). That direction is solid. The residual gap is the inverse, covered in the HIGH above: the header controls *which profile* is active, and absence resolves to owner. Calling this out separately because the proxy-guard's own doc comment ("any non-owner profile is a proxy session regardless of any header") is true only when a non-owner profileId is actually resolved — it is silently false when the header is omitted and the owner is auto-resolved.
- Impact: Same elevation surface as the HIGH; listed here as the proxy-guard-specific manifestation so a fix to proxy-guard alone is not mistaken for closing the hole.
- Fix direction: Fold into the HIGH fix — distinguish auto-resolved owner from header-asserted owner before treating the request as a privileged owner session.

### [MEDIUM] `/v1/consent-page` and `/v1/consent/respond` are unauthenticated and act on a UUID token only — no per-token attempt lockout beyond a shared IP window
- File: `apps/api/src/middleware/auth.ts:50-51` (public), `apps/api/src/routes/consent-web.ts:280-411` (confirm), `apps/api/src/routes/consent.ts` (`isConsentRespondRateLimited`, IP sliding window 30/hr).
- What: The consent approval/denial endpoints are intentionally public (a parent clicking an email link has no app session). Authorization is the unguessable 128-bit token (`crypto.randomUUID()`, `consent.ts:450`), with replay protection (`consent.ts:833`) and expiry (`consent.ts:838`). The only rate limit is a process-local, IP-keyed sliding window. On Cloudflare Workers this limiter is per-isolate in-memory (not shared across isolates/regions), so the effective cap is softer than 30/hr globally, and it is keyed on `cf-connecting-ip` / `x-forwarded-for`.
- Impact: Low real risk — the token space is 122 effective bits, so brute force is infeasible regardless of rate limiting; the limiter exists mainly to dampen DB/compute abuse. Flagging because the limiter's effectiveness is overstated by the comments (it is not a durable global limiter) and a denial confirm cascade-deletes a child profile (`consent.ts:898-901`), so abuse cost is real if a token ever leaks (e.g. via referrer/email-forwarding).
- Fix direction: Move the consent-respond rate limit to a durable store (KV/Durable Object) keyed by token-prefix + IP so it survives isolate churn; ensure the `Referrer-Policy: strict-origin-when-cross-origin` already set on consent-web pages (`consent-web.ts:145`) covers the redirect landing too, and avoid putting the raw token in any client-side navigable URL after confirm.

### [MEDIUM] `findOwnerProfile` corrupt-state fallback returns the oldest profile with its real `isOwner=false`, but several owner-gated routes never observe that path because they rely on auto-resolve setting `isOwner=true`
- File: `apps/api/src/services/profile.ts:268-318`.
- What: This is defensively coded — when no `is_owner=true` row exists, it returns the oldest profile with `isOwner=false` and escalates via Sentry + Inngest (good). But it confirms that the "owner" the system trusts is whatever row carries `is_owner=true`, and there is no cross-check that the *caller* is entitled to that row. Combined with the HIGH, an account in the (rare) no-owner-row state would have all owner-gated routes fail-closed (403) — which is correct — but a healthy account's owner row is handed to any header-omitting caller.
- Impact: No standalone exploit; documents that owner identity = a DB flag, not an authenticated subject. Reinforces the HIGH.
- Fix direction: Same as HIGH. Consider asserting that owner-gated actions also verify the *Clerk subject* maps to an account whose owner profile the request is acting as — but since one Clerk user owns the whole account, the real fix is server-side active-profile binding.

---

## Low

### [LOW] `/__test/*` and `/v1/maintenance/*` are public paths; security rests entirely on env + secret guards (correctly fail-closed, but single-layer)
- File: `apps/api/src/middleware/auth.ts:52-53`, `apps/api/src/routes/test-seed.ts:62-90`, `apps/api/src/routes/maintenance.ts:27-61`.
- What: Both bypass Clerk auth. test-seed fails closed when `ENVIRONMENT` is not `development`/`staging` (treats unset as production → 403) and requires `TEST_SEED_SECRET` off-dev. maintenance uses an HMAC constant-time compare of `X-Maintenance-Secret`. Both are well-built. The residual risk is that a single Doppler misconfiguration (e.g. `ENVIRONMENT` accidentally set to `staging` in prod) re-opens test-seed, which can seed/reset DB data.
- Impact: Low — requires a specific env misconfig; the secret is still required on staging.
- Fix direction: Add a second independent guard for the most destructive test-seed routes (`/reset`) — e.g. also require the Neon database host to be a non-prod host, so an `ENVIRONMENT` mislabel alone cannot expose reset. No code change strictly required; document as a deploy-config invariant.

### [LOW] JWT `maxAge` defense-in-depth is 24h; a leaked-but-unexpired session token is accepted for up to 24h even though Clerk rotates ~1 min
- File: `apps/api/src/middleware/jwt.ts:338,406-413`.
- What: `DEFAULT_MAX_AGE_SEC = 24h`. Clerk session tokens rotate roughly every minute, so a captured token is normally short-lived, but the server will accept any validly-signed token up to 24h past `iat` regardless of Clerk's intended ~1-min lifetime, as long as `exp` hasn't elapsed. This is intentional defense-in-depth against far-future `exp`, not a bug, but the window is large relative to the IdP's design.
- Impact: Low — `exp` is the primary bound and is short for Clerk; `maxAge` only matters if `exp` is mis-set. No revocation list (acceptable for a stateless Worker, but means a leaked token cannot be force-revoked before `exp`).
- Fix direction: If feasible, lower `maxAgeSec` for the Clerk audience to a few minutes (matching token TTL) so a far-future-`exp` anomaly is caught sooner. Leave as-is if Clerk template TTL varies by environment.

### [LOW] CORS `credentials: true` with localhost-any-port wildcard in the same config as the production exact-match allowlist
- File: `apps/api/src/index.ts:163-192`.
- What: Production origins are exact-match (good — explicitly removed subdomain wildcards per BUG comment). But `credentials: true` is combined with a regex that reflects any `http(s)://localhost:*` / `127.0.0.1:*` origin. In production these regexes will not match real browsers (no localhost origin), and the API is primarily a native client, so cookies aren't the main vector. Still, `credentials: true` + origin-reflection for localhost means a malicious page served from `http://localhost:<port>` on a developer/CI machine could make credentialed requests to whatever API base it targets.
- Impact: Low — requires the victim to load attacker content from their own localhost while the API base points at a sensitive environment; native app uses bearer tokens, not cookies.
- Fix direction: Gate the localhost regex on a non-production `ENVIRONMENT`, so production CORS never reflects localhost origins even with `credentials: true`.

---

## Cross-lens findings

- **(Mobile UX / nav lens)** Mobile `ClerkGate.tsx:107-124` offers a "Continue without account" path on Clerk init timeout. This is not an auth bypass (the API still 401s without a token), but it routes the user into an offline/degraded app state — verify downstream screens fail-closed and don't render stale/cross-account cached data. Belongs to the mobile-state/cache lens.
- **(Data-integrity / Inngest lens)** `deleteProfile(db, profileId)` (`services/deletion.ts:314-321`) deletes by profileId with NO account scoping; safe today because its only caller is the `archive-cleanup` Inngest job (`inngest/functions/archive-cleanup.ts:50`). Flag for the background-jobs lens: any future route-layer caller must add ownership scoping, or this becomes an IDOR primitive.
- **(Compliance lens)** The consent-gate age evaluation reading the *auto-resolved owner's* birthYear (HIGH, third manifestation) has a GDPR/COPPA angle — a minor could transact under an adult's consent state. Worth the compliance lens confirming the under-13/under-16 enforcement is robust to the header-omission path.
- **(Billing lens)** Owner-gated billing routes (`billing.ts` subscribe/cancel/family) share the HIGH's header-omission elevation; billing lens should confirm RevenueCat/Stripe state changes are additionally idempotency- and ownership-checked at the service layer, not only at the `assertOwnerProfile` route gate.
- **(Test-quality lens)** `account.test.ts:95-110` mocks `findOwnerProfile`/auto-resolve to always return `isOwner:true`, and the break tests only exercise the explicit-header non-owner path. This is an internal-mock-shaped gap that hides the HIGH; the test lens should note the missing header-omission negative test.
