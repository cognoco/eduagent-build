# Security Reviewer — apps/api/src (eduagent-build)

**Scope:** Path-scoped security audit of `apps/api/src` and its direct dependencies (`packages/database/src`) in the eduagent-build monorepo. Multi-tenant family education app: Hono on Cloudflare Workers, Drizzle/Neon, Clerk JWT auth, Inngest, Stripe/RevenueCat billing, Gemini/OpenAI LLM router. All findings classified **[PRE-EXISTING]** per scope (no PR diff).

## Executive Summary

This is an **exceptionally well-hardened codebase**. Every one of the seven repo-specific invariants I was asked to audit holds in the code I read, and each is backed by tracked fixes (`[CR-...]`, `[BUG-...]`, `[SEC-...]`, `[WI-...]` tags) and guard tests. I found **no exploitable cross-tenant, auth-bypass, or children's-data-exposure vulnerability.** The classic vectors are all explicitly closed:

- **JWT (`middleware/jwt.ts`, `middleware/auth.ts`):** `alg:"none"` rejected, RS→HS downgrade blocked via allowlist + JWK-alg cross-check, mandatory issuer **and** audience validation (audience-undefined hard-fails rather than silently skipping — `[SEC-1/BUG-717]`), `exp`/`nbf` with clock-skew leeway, `iat` max-age backstop, JWKS key-rotation with in-flight dedup, and JWKS-outage → 503 (not 401) to avoid mass forced sign-out.
- **Tenant isolation (`packages/database/src/repository.ts`):** `createScopedRepository(profileId)` injects `WHERE profile_id = $1` on every single-table read; multi-table reads (curriculum topics, topic suggestions) enforce ownership via the `books→subjects.profileId` join chain inside a single SELECT (TOCTOU-collapsed, `[BUG-218]`). No raw `db.select`/`update`/`delete` in any route handler — all logic is in `services/`.
- **IDOR / parent→child (`routes/dashboard.ts`, `services/family-access.ts`):** every child-data route calls `assertOwnerAndParentAccess` (isOwner gate + `family_links` parent→child link check); the topic-snapshot route deliberately returns 404 (not 403) to avoid leaking child-profile-UUID existence, with audit logging on denied probes.
- **isOwner / role gating (`routes/account.ts`, `middleware/proxy-guard.ts`):** delete/export account are `assertOwnerProfile`-gated server-side; proxy mode is **server-derived** from `profileMeta.isOwner` (not the client `X-Proxy-Mode` header) and fails closed when `profileMeta` is absent (`[SEC-2/BUG-718/BUG-975]`). Minor-on-parent-account consent self-toggle blocked by `assertCanManageOwnConsent`.
- **LLM trust boundary (`services/llm/envelope.ts`, `services/challenge-round/evaluation.ts`):** state-machine decisions go through `llmResponseEnvelopeSchema` + `parseEnvelope`. Challenge-round mastery is server-owned: `decideMasteryAndReview` requires EVERY concept `solid`, empty array → `invalid` (CRIT-9 `0===0` guard), and `validateEvaluationEventIds` re-fetches every LLM-supplied `answerEventId` through the scoped repo and replaces `learnerQuote` with real DB content before any note is drafted.
- **Webhooks (`stripe-webhook.ts`, `revenuecat-webhook.ts`, `resend-webhook.ts`, `services/stripe.ts`):** all three verify signatures on the raw body before trusting it (Stripe `constructEventAsync`, RevenueCat bearer HMAC constant-time compare, Resend/Svix HMAC-SHA256 + 5-min timestamp window), with test-mode/SANDBOX-in-production rejection, atomic idempotency claims, and timing-safe comparisons everywhere.
- **Seed/test routes (`routes/test-seed.ts`):** `/__test/*` fail-closed in production (undefined `ENVIRONMENT` treated as prod), require `TEST_SEED_SECRET` (constant-time compared) outside dev, and the LLM-ping diagnostic is additionally opt-in (`LLM_PING_ENABLED`) to prevent token-burn even with the secret.
- **Secrets:** No hardcoded credentials. Config flows through typed `c.env` bindings (Doppler-sourced). The only raw `process.env` reads are in `inngest/helpers.ts`/Inngest functions, which run outside the Hono request context where `c.env` is unavailable — acceptable pattern, not a leak.
- **Injection/SSRF:** Drizzle parameterizes all queries; the one `sql.raw` site is UUID-validated (see L1 below). All outbound `fetch` targets are hardcoded provider URLs (Anthropic/OpenAI/Gemini/Voyage/Expo/Resend) — no user-controlled URL, so no SSRF. pgvector literal is built only from a finite-number-validated array.

The findings below are **low-severity, defense-in-depth observations**, not exploitable bugs.

---

## [PRE-EXISTING] Findings

### L1 — RLS helper `withProfileScope` is defined but never wired; scoped-repo is the only isolation layer
- **Severity:** LOW (MEDIUM if a future scoped-repo predicate is ever missed)
- **Category:** Authorization / Defense in depth
- **Location:** `packages/database/src/rls.ts:46-66` (and its absence of callers)
- **Description:** `docs/architecture.md` advertises "Neon RLS as defense-in-depth, not primary enforcement." The helper that would establish the per-transaction GUC (`SET LOCAL app.current_profile_id`) exists, but a repo-wide search shows **no caller in `apps/api/src` or `packages/database/src`** (only the file itself and its tests reference it). Net effect: tenant isolation rests **entirely** on application-layer `WHERE profile_id = ...` predicates. That layer is currently correct and well-tested (`profile-isolation.test.ts`), but there is no DB-level backstop — a single future query that forgets the predicate (e.g. a new multi-table join added directly in a service) would silently leak across tenants with no second line of defense. This is the highest-impact *latent* risk in the subtree precisely because the primary control is the only control.
- **Recommendation:** Either (a) wire `withProfileScope` + actual RLS policies on the tenant tables so the DB enforces isolation independently, or (b) explicitly downgrade the "RLS defense-in-depth" claim in `docs/architecture.md` so reviewers don't assume a backstop exists that doesn't. If keeping app-layer-only, strengthen the forward-only guard: a lint/AST rule forbidding raw `db.select().from(<tenant table>)` outside `repository.ts` would convert "someone forgot the predicate" from a runtime data breach into a CI failure.

### L2 — `SET LOCAL` GUC built via `sql.raw` with string interpolation (mitigated, but fragile)
- **Severity:** LOW (currently not exploitable)
- **Category:** Injection (SQL)
- **Location:** `packages/database/src/rls.ts:62` — `sql.raw(`SET LOCAL app.current_profile_id = '${profileId}'`)`
- **Description:** `profileId` is interpolated directly into a raw SQL string because `SET LOCAL` does not accept bound parameters (`$1`). This is **currently safe**: line 51 rejects any `profileId` that doesn't match a strict UUID regex (`UUID_RE`) before the interpolation, so no injection payload can reach the raw string. Flagging it because it is the only string-interpolated SQL in the subtree and its safety depends entirely on the validation guard staying immediately above it — a refactor that moves/relaxes the UUID check (or a future caller that constructs the value differently) would reopen a SQL-injection path into a session-scoped GUC. Compounded by L1: since the helper is unused today, the guard is also untested in a live path.
- **Recommendation:** Keep the UUID validation co-located and covered by a regression test that asserts a non-UUID throws. Consider using `set_config('app.current_profile_id', $1, true)` (a function that *does* accept a bound parameter) instead of `SET LOCAL`, eliminating the raw-string interpolation entirely.

### L3 — CORS allows any `localhost`/`127.0.0.1` origin with `credentials: true` in all environments
- **Severity:** LOW
- **Category:** Configuration / CORS
- **Location:** `apps/api/src/index.ts:165-191`
- **Description:** The CORS origin callback reflects any `http(s)://localhost(:port)` or `127.0.0.1(:port)` origin and sends `Access-Control-Allow-Credentials: true`. Production origins are correctly a tight exact-match allowlist (the `*.mentomate.com` subdomain-wildcard takeover risk was already fixed — `[BUG-244]`), but the localhost branch is **not gated by `ENVIRONMENT`**, so it is live in production too. Browser same-origin policy makes this hard to weaponize (an attacker page at `https://evil.com` cannot forge an `Origin: http://localhost` request, and the API's primary client is a native app using bearer tokens, not cookies). Still, malware or a hostile app running on a victim's machine and serving from localhost could make credentialed cross-origin calls the policy would accept.
- **Recommendation:** Gate the localhost/127.0.0.1 reflection behind `c.env.ENVIRONMENT !== 'production'`. Dev tooling (Metro, Expo web, Playwright) only needs it in dev/staging.

### L4 — `X-Maintenance-Secret` and `X-Test-Secret` accepted via header on GET-style flows; ensure they never land in query strings
- **Severity:** LOW (informational)
- **Category:** Data Exposure
- **Location:** `routes/maintenance.ts:58`, `routes/test-seed.ts:92`
- **Description:** Both privileged secrets are read from request **headers** (correct — headers don't leak into access logs/referrers the way query params do) and compared in constant time. No issue in the current code. Noting it as a guardrail: these endpoints are reachable without Clerk auth (they're under the `/v1/maintenance/` and `/v1/__test/` public-path prefixes by design and self-verify their own secret), so the header-only transport must be preserved. If any future client or doc is tempted to pass these as `?secret=` query params (visible in CF logs / proxies), that would become a real exposure.
- **Recommendation:** No code change. Keep secret transport header-only; consider a brief comment at each route asserting "secret is header-only — never accept via query param" to lock the invariant.

### L5 — Non-production `/__test/*` is reachable without a secret in `development`
- **Severity:** LOW (informational / by-design)
- **Category:** Configuration
- **Location:** `routes/test-seed.ts:75-89` (`isDev` branch skips the secret requirement)
- **Description:** On `ENVIRONMENT === 'development'`, `TEST_SEED_SECRET` is optional and the seed/reset/debug endpoints run with no secret. This is intentional dev ergonomics and is **fail-closed for production** (undefined `ENVIRONMENT` → 403, and staging requires the secret). The residual risk is solely "a real database is ever run with `ENVIRONMENT=development`," which would expose seeding/reset and the `/__test/debug/:email` account-enumeration endpoint. Acceptable given the production guard, but worth an explicit operational note.
- **Recommendation:** No code change required. Ensure deployment config can never set `ENVIRONMENT=development` against a shared/real DB; the existing fail-closed prod guard is the right primary control.

---

## Areas Verified Clean (no finding)

- **JWT verification** — `middleware/jwt.ts`: alg allowlist, downgrade/none rejection, issuer+audience mandatory, skew/maxAge bounds, signature via WebCrypto. Solid.
- **Webhook signature verification** — Stripe (`services/stripe.ts` `constructEventAsync`), RevenueCat (bearer + constant-time HMAC compare), Resend/Svix (HMAC-SHA256 + timestamp window + replay dedup). All verify before trusting body; all timing-safe.
- **Cross-tenant reads** — `repository.ts` scoped namespaces + parent-chain joins; `quizMissedItems.insertMany` even re-validates that each `sourceRoundId` belongs to the profile (`[BUG-566]`).
- **Parent→child IDOR** — `routes/dashboard.ts` (every route), `routes/learner-profile.ts` (self vs `:profileId` split), `services/family-access.ts`. Consistent owner+link gating.
- **LLM state-machine trust** — envelope parsing with structured failure reasons; challenge-round mastery server-owned and conservative; LLM-supplied event IDs re-validated against scoped DB rows.
- **SSRF** — all outbound `fetch` targets are constant provider URLs; no user-controlled destination.
- **Secrets** — no hardcoded credentials; typed `c.env` bindings; PII (appUserId, recipient email) deliberately kept out of Sentry/Inngest payloads (`[SEC-11]`, `[SEC-6/BUG-722]`).
- **Error leakage** — `app.onError` (`index.ts:304-499`) returns generic messages in production and only echoes `err.message`/stack when `ENVIRONMENT !== 'production'`.
- **Consent enforcement** — `middleware/consent.ts`: method-scoped exemptions (closed `[WI-130]` onboarding-PATCH and `[CR-2026-05-21-085]` profiles-mutation bypasses), GDPR Art. 7(3) WITHDRAWN block before the age check, fail-closed on missing `profileMeta`/transient DB error.
- **Account resolution** — `middleware/account.ts`: email-verified gate with Clerk Backend API fallback; `findOwnerProfile` returns the real `isOwner` flag and never elevates a non-owner (`[BUG-410]`); fallback scoped to same `accountId` (no cross-account leak).

---

## ERROR / Coverage Notes

No tool errors. Time-boxed: I read the auth/scope/consent/proxy/account middleware, the index entry, the scoped repository, all three webhook routes + Stripe service, test-seed, maintenance, dashboard, family-access, challenge-round evaluation, LLM envelope, RLS helper, and `findOwnerProfile`, and grepped the full subtree for raw `db.*` in routes, `process.env`, hardcoded secrets, `sql.raw`/template interpolation, and outbound `fetch`. I did **not** exhaustively read every one of the 45 route groups or all 58 Inngest functions; the audited slice is the security-critical trust-boundary core, and the consistency of the patterns observed (scoped repo + `assertNotProxyMode` + owner/parent gating at every write) gives high confidence the remaining routes follow suit. A focused follow-up could spot-check Inngest functions, which run outside the Hono auth chain and resolve scope from event payloads (`process.env`-based config in `inngest/helpers.ts`) — that is the part of the surface least covered by this pass.
