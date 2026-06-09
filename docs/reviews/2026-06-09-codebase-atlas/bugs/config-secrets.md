# Configuration & Secrets — Bug Review

**Lens:** Configuration & secrets  
**Owned area:** `apps/api/src/**` (process.env), config objects, eas.json, app.config, wrangler/doppler usage  
**Reviewed:** 2026-06-09 on branch `new-llm`  
**Investigator:** config-secrets lens agent

---

## Critical

_No Critical findings._

---

## High

### H1 — Staging API accessible via `*.workers.dev`, bypassing WAF and rate-limiting

**File:** `apps/api/wrangler.toml:142`  
**Code:** `workers_dev = true`

The staging environment (`[env.staging]`) has `workers_dev = true`, which means Cloudflare auto-publishes the worker on `mentomate-api-stg.<subdomain>.workers.dev` in addition to the custom domain `api-stg.mentomate.com`. The `*.workers.dev` route bypasses any Cloudflare WAF, rate-limiting, or IP-allowlist rules that apply to the custom domain. Attackers and scrapers can reach staging auth, LLM, and data endpoints directly. Production correctly sets `workers_dev = false` (line 179).

There is no guard test for the staging value. `apps/api/src/wrangler-config.test.ts` guards only production (`workers_dev = false`); staging is unguarded.

**Fix direction:** Set `workers_dev = false` in `[env.staging]` and add a test assertion parallel to the production guard.

---

### H2 — `Bindings` type in `index.ts` is stale — missing 10+ bindings actually used at runtime

**File:** `apps/api/src/index.ts:93-124`

The `Bindings` type declared at the app root is the TypeScript interface Hono uses for `c.env`. The following bindings exist in `wrangler.toml` and/or `config.ts` and are actively accessed at runtime but are absent from the type:

| Missing binding | Used in |
|---|---|
| `ANTHROPIC_API_KEY` | `apps/api/src/middleware/llm.ts:95` — provider registration |
| `CEREBRAS_API_KEY` | `apps/api/src/middleware/llm.ts:96` — v2 routing provider |
| `MISTRAL_API_KEY` | `apps/api/src/middleware/llm.ts:97` — v2 routing provider |
| `INNGEST_SIGNING_KEY` | Required key in `config.ts:76`; passed to `c.env` in env-validation middleware |
| `INNGEST_EVENT_KEY` | Required key in `config.ts:77`; same |
| `COACHING_KV` | Bound in wrangler.toml for dev/staging/production (lines 159, 196); `KVNamespace` type needed |
| `LLM_ROUTING_V2_ENABLED` | `apps/api/src/middleware/llm.ts:72` — `c.env?.LLM_ROUTING_V2_ENABLED` |
| `ADULT_OWNER_GATE_ENABLED` | `config.ts:131`, accessed through env-validation middleware |
| `CHALLENGE_ROUND_RUNTIME_ENABLED` | `config.ts:145` |
| `EMPTY_REPLY_GUARD_ENABLED` | `config.ts:86` |
| `RETENTION_PURGE_ENABLED` | `config.ts:90` |
| `MEMORY_FACTS_READ_ENABLED` | `config.ts:95` |
| `MEMORY_FACTS_RELEVANCE_RETRIEVAL` | `config.ts:96` |
| `MEMORY_FACTS_DEDUP_ENABLED` | `config.ts:97` |
| `MEMORY_FACTS_DEDUP_THRESHOLD` | `config.ts:98` |
| `MAX_DEDUP_LLM_CALLS_PER_SESSION` | `config.ts:99` |
| `MEMORY_FACTS_DEDUP_ROLLOUT_PCT` | `config.ts:105` |
| `MATCHER_ENABLED` | `config.ts:114` |
| `ALLOW_MISSING_IDEMPOTENCY_KV` | `config.ts:125` |
| `APP_URL` | `config.ts:19` |

Because `c.env` uses the stale `Bindings` type, TypeScript silently allows `c.env?.ANTHROPIC_API_KEY` and all other missing keys only because they're accessed with optional chaining. Any typo in a downstream binding name will not be caught at compile time. More critically, if a new handler accesses a binding using `c.env.COACHING_KV` (no optional chaining), TypeScript will produce a type error rather than catching a misconfiguration — causing confusing compiler failures rather than a clear "binding not in type" message.

**Fix direction:** Extend the `Bindings` type to match the full `Env` in `config.ts` plus all KV namespaces from `wrangler.toml`. Consider deriving `Bindings` from `Env` to keep them in sync.

---

### H3 — IDEMPOTENCY_KV missing for staging and production — replay deduplication is not operational

**File:** `apps/api/wrangler.toml:121-130, 162-167`  
**Config:** `apps/api/src/config.ts:125` (`ALLOW_MISSING_IDEMPOTENCY_KV`)

The IDEMPOTENCY_KV KV namespace binding is commented out for all three environments with a TODO `[BUG-12]`. The namespace has not been created in the Cloudflare account. This means:

- Billing webhooks (`apps/api/src/routes/resend-webhook.ts:322`) cannot deduplicate replayed events — a webhook replay can double-charge or double-credit a user.
- RevenueCat webhooks similarly have no replay protection.
- Production will refuse to start unless `ALLOW_MISSING_IDEMPOTENCY_KV="true"` is set in Doppler (the pre-launch override path). If that flag has been flipped to get staging/production running, the billing replay window is fully open.

**Fix direction:** Create the IDEMPOTENCY_KV namespace in Cloudflare (Workers & Pages → KV → Create) for both staging and production. Uncomment the three bindings in `wrangler.toml`. Clear `ALLOW_MISSING_IDEMPOTENCY_KV` from Doppler. Add a wrangler-config.test.ts guard asserting IDEMPOTENCY_KV is bound in staging and production after it's wired.

---

## Medium

### M1 — Hardcoded test seed password committed to repository

**File:** `apps/api/src/services/test-seed.ts:62`  
**Code:** `const DEFAULT_SEED_PASSWORD = 'Mentomate2026xK';`

A concrete password string is committed to source. The comment acknowledges it must not appear in HaveIBeenPwned, but the risk is credential leakage through:
1. Anyone with git clone access has the password.
2. If any staging seed user is inadvertently created in production (wrong DB URL, schema drift), the password is known.
3. If the same password is reused anywhere by a developer, that account is now exposed to anyone who reads this file.

The code already reads from `SEED_PASSWORD` env var when available — the fallback exists solely for local convenience, but the convenience value is committed.

**Fix direction:** Remove the hardcoded default. Require `SEED_PASSWORD` to be set from the environment; throw if absent in the seed routes rather than falling back to a committed value.

---

### M2 — `EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1` not injected in OTA update step

**File:** `.github/workflows/ci.yml:304-323`  
**Related:** `apps/mobile/src/lib/analytics.ts:113`

The OTA bundle step in CI injects `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, and feature flags — but not `EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1`. Because `EXPO_PUBLIC_*` variables are baked into the bundle at build time, any OTA update published without this key will produce bundles that fall through to the unkeyed code path in `analytics.ts`:

```
// analytics.ts:113 (approximate) — falls through to 'unkeyed_' prefix
```

Profiles hashed with `unkeyed_` cannot be correlated across events in analytics, breaking attribution. More critically, if the unkeyed output ever reaches a logging pipeline expecting consistent profile identifiers, the privacy boundary (HMAC keying) is silently absent.

The key is correctly excluded from `eas.json` via `EAS_JSON_DENYLIST` in `scripts/setup-env.js`, but the OTA CI step does not re-inject it from GitHub Secrets.

**Fix direction:** Add `EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1: ${{ secrets.EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1 }}` to the OTA update step env block in `ci.yml`. Add the GitHub secret in the repository settings (via Doppler sync or manual entry).

---

### M3 — New-routing LLM vendor keys (Cerebras, Mistral, OpenAI) have no production boot-time guard

**File:** `apps/api/src/config.ts:255-262` (`PRODUCTION_REQUIRED_KEYS`)  
**Related:** `apps/api/src/middleware/llm.ts:124` (`hasAnyProvider` check)

`PRODUCTION_REQUIRED_KEYS` requires `GEMINI_API_KEY` (line 256). Under the new LLM routing v2 plan (MMT-ADR-0016 §1.5), Cerebras (`gpt-oss-120b`) is the universal default text provider and Gemini is banned for under-18 users. When `LLM_ROUTING_V2_ENABLED` is flipped on in Doppler, the routing matrix selects Cerebras as the primary provider — but `CEREBRAS_API_KEY` is optional in the schema and not in `PRODUCTION_REQUIRED_KEYS`. If Cerebras key is absent at cutover, the provider is simply not registered, routing silently falls to OpenAI or Anthropic, then throws "no provider" if those are also absent.

`GEMINI_API_KEY` remains required even though Gemini is blocked for under-18 users (per `project_google_gemini_vendor_under18_blocked.md`). This is a latent correctness issue: the required-key gate enforces the presence of a banned provider while not enforcing the presence of the replacement.

**Fix direction:** When `LLM_ROUTING_V2_ENABLED` is set to `true` in production, `CEREBRAS_API_KEY` (and whichever secondary provider is chosen) should be required. Consider adding a conditional required-keys check in `validateProductionKeys()` that reads the routing flag and enforces the correct provider key set. At minimum, add `CEREBRAS_API_KEY` to `PRODUCTION_REQUIRED_KEYS` before flipping the v2 flag.

---

### M4 — `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS/ANDROID` not injected in OTA update step

**File:** `.github/workflows/ci.yml:304-323`  
**Related:** `apps/mobile/src/lib/revenuecat.ts:18-21`

Like M2, the OTA update CI step does not inject `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` or `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`. These are baked `EXPO_PUBLIC_*` vars excluded from `eas.json` via `EAS_JSON_DENYLIST`. An OTA update deployed without them will produce a bundle where `Purchases.configure()` receives empty strings, silently disabling in-app purchases for all users on that OTA channel until they reinstall a native build.

`apps/mobile/src/lib/revenuecat.ts:18-21` returns `''` (empty string) with only a `console.error` when keys are missing — there is no hard fail that would surface the misconfiguration at configuration time.

**Fix direction:** Add both RevenueCat key secrets to the OTA CI step env block. Add GitHub secrets. Additionally, harden `revenuecat.ts` to throw (or at least warn via Sentry) in non-development environments when the keys are absent.

---

## Low

### L1 — `COACHING_KV` binding absent from `Bindings` type but present in wrangler.toml for all three environments

**File:** `apps/api/src/index.ts:93-124` (missing entry); `apps/api/wrangler.toml:159, 196`

`COACHING_KV` is bound as a `KVNamespace` in `[env.staging]` and `[env.production]`. It is not in the `Bindings` type, so accessing `c.env.COACHING_KV` in route handlers requires a cast or optional-chain and produces no type error on typos. This is a subset of H2 but worth calling out explicitly as a KV namespace (a different type from string bindings).

**Fix direction:** Add `COACHING_KV?: KVNamespace` to the `Bindings` type. Include in the broader H2 fix.

---

### L2 — `SENTRY_DSN` not in `PRODUCTION_REQUIRED_KEYS` — Sentry silently absent in production if misconfigured

**File:** `apps/api/src/config.ts:54, 255-262`

`SENTRY_DSN` is optional in `envSchema` and not listed in `PRODUCTION_REQUIRED_KEYS`. If the Doppler production config is missing or misconfigured, the API boots and serves traffic with no error telemetry. Production bugs go unreported until a user complains.

**Fix direction:** Add `SENTRY_DSN` to `PRODUCTION_REQUIRED_KEYS`. Alternatively, add it to `STAGING_AND_PRODUCTION_REQUIRED_KEYS` so both environments are covered (staging errors are also valuable).

---

### L3 — `GEMINI_API_KEY` required in production despite Gemini being banned for under-18 users

**File:** `apps/api/src/config.ts:256`  
**Context:** `project_google_gemini_vendor_under18_blocked.md` — Google Gemini blocked for under-18 end users; current production routing still uses Gemini as default (`LLM_ROUTING_V2_ENABLED=false`).

The production required key gate enforces `GEMINI_API_KEY`. This is correct for the current (V1-off) routing posture. However, when `LLM_ROUTING_V2_ENABLED` flips on and Cerebras becomes the universal default, `GEMINI_API_KEY` should either be removed from `PRODUCTION_REQUIRED_KEYS` or remain only as long as Gemini is still in the fallback path. Keeping a banned-for-users key as a hard required key is confusing and will cause deployment failures if the Gemini key is intentionally rotated out.

**Fix direction:** Document the intent in the required-keys list with a comment. Track removal in the LLM v2 cutover checklist.

---

### L4 — Dev environment `workers_dev` not explicitly set to `false`; relies on Cloudflare default

**File:** `apps/api/wrangler.toml` (top-level `[env]`, no explicit `workers_dev`)

The dev environment (top-level wrangler config) does not set `workers_dev` explicitly. The Cloudflare default is `true` for dev environments. While this is intentional for local testing, it means dev workers are also published on `*.workers.dev` — developers testing against staging data or API keys over the dev route could expose secrets unintentionally.

**Fix direction:** Add `workers_dev = true` explicitly with a comment "intentional for dev-tier testing" so future reviewers don't assume this is an oversight.

---

### L5 — `SUPPORT_EMAIL` binding is in `Bindings` type but not in `config.ts` `envSchema`

**File:** `apps/api/src/index.ts:121` (`SUPPORT_EMAIL?: string`)  
**Config:** `apps/api/src/config.ts` (no `SUPPORT_EMAIL` entry)

`SUPPORT_EMAIL` appears in the `Bindings` type but not in `envSchema`. This means it bypasses Zod validation — it is never validated as a proper email format, never listed as optional/required for a given tier, and not exported through the typed `Env` interface. Any code that reads `SUPPORT_EMAIL` through the typed env object instead of `c.env` will not find it.

**Fix direction:** Add `SUPPORT_EMAIL: z.string().email().optional()` to `envSchema` in `config.ts` to bring it under the same validation and documentation as the other env vars.

---

### L6 — `DEPLOY_SHA` binding in `Bindings` type is undocumented in config schema

**File:** `apps/api/src/index.ts:122` (`DEPLOY_SHA?: string`)  
**Config:** `apps/api/src/config.ts` (no `DEPLOY_SHA` entry)

Same class of issue as L5. `DEPLOY_SHA` is injected at deploy time (presumably from `GITHUB_SHA`) and is accessed as `c.env.DEPLOY_SHA` by some handlers or logging. It is not in `envSchema`, so it gets no validation or documentation alongside other bindings.

**Fix direction:** Add `DEPLOY_SHA: z.string().optional()` to `envSchema`. Alternatively, if this binding is only used for observability metadata and never in business logic, add a comment to the `Bindings` type explaining why it lives outside the schema.

---

### L7 — `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` absent from `Bindings` type

**File:** `apps/api/src/index.ts:93-124`

These keys are listed in `STAGING_AND_PRODUCTION_REQUIRED_KEYS` (config.ts:245-246), meaning their absence causes a boot-time failure in staging and production. Despite being required bindings, they are not in the `Bindings` type. This is a subset of H2 but is worth highlighting: a required key that TypeScript doesn't know about is effectively invisible to code that calls `c.env.INNGEST_SIGNING_KEY`. The currently-working pattern is to pass the full `c.env` object to `validateEnv()` and use the resulting `Env` object — so the omission from `Bindings` is not blocking today, but it risks a future PR adding a handler that reads the key directly from `c.env` and gets `unknown`.

**Fix direction:** Add `INNGEST_SIGNING_KEY?: string` and `INNGEST_EVENT_KEY?: string` to the `Bindings` type. Part of the H2 fix.

---

## Cross-Lens Findings

The following issues were observed in the owned area but have primary ownership in another lens. They are flagged here for routing to the correct reviewer.

### XL1 — Analytics profile hash silently degrades to `unkeyed_` in production builds [auth/privacy lens]

**File:** `apps/mobile/src/lib/analytics.ts:113`

When `EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1` is absent, the analytics helper falls back to a prefix of `unkeyed_` instead of throwing. The HMAC keying is the privacy boundary — an unkeyed hash is not a safe pseudonym for analytics. This is partially covered by M2 (OTA injection gap) but also exposes a design gap: the key absence should be a hard error in non-development environments, not a silent degradation.

**Owner suggestion:** auth/security lens or privacy/data lens.

### XL2 — RevenueCat `Purchases.configure()` called with empty strings on missing key [billing lens]

**File:** `apps/mobile/src/lib/revenuecat.ts:18-21`

Silent degradation in billing configuration when `EXPO_PUBLIC_REVENUECAT_API_KEY_*` is missing — `console.error` but no throw, no Sentry event. This belongs to the billing or resilience lens for the `revenuecat.ts` hardening recommendation.

**Owner suggestion:** billing lens.

### XL3 — Webhook replay deduplication gap in billing webhook handler [billing/security lens]

**File:** `apps/api/src/routes/resend-webhook.ts:322` (cross-reference of H3)

H3 documents that IDEMPOTENCY_KV is not yet wired. The primary risk is in webhook replay on billing/RevenueCat routes. The security implication of an open replay window on billing webhooks belongs in both the config/infra lens (wrangler binding) and the billing/security lens (replay attack vector).

**Owner suggestion:** security lens for the threat model; billing lens for RevenueCat webhook handler hardening.

### XL4 — Hardcoded seed password in test-seed.ts may share namespace with real Clerk accounts [auth lens]

**File:** `apps/api/src/services/test-seed.ts:62` (cross-reference of M1)

If `SEED_CLERK_PREFIX` users are ever created in a non-test Clerk instance (wrong `DATABASE_URL` or wrong `CLERK_SECRET_KEY`), the committed password is known to anyone with repo access. The auth scoping of seed routes belongs with the auth or test-infrastructure lens.

**Owner suggestion:** auth lens.

---

## Summary

The configuration posture is generally sound: Doppler manages secrets, `config.ts` provides Zod-validated typed access, `scripts/setup-env.js` prevents sensitive keys from leaking into committed `eas.json`, and the deploy pipeline has explicit DATABASE_URL guards. The G4 ESLint rule is correctly enforced and raw `process.env` reads in production code are limited to explicitly-allowed files.

The most significant gaps are:

1. **Staging WAF bypass** (H1): `workers_dev = true` on staging exposes auth and LLM endpoints on an unguarded URL.
2. **Bindings type staleness** (H2): 20+ active bindings are absent from the TypeScript `Bindings` type, eliminating compile-time safety for all middleware and route handlers accessing `c.env`.
3. **IDEMPOTENCY_KV** (H3): Replay deduplication for billing webhooks is not operational in any environment; production requires an explicit prelaunch override to even boot.
4. **OTA injection gaps** (M2, M4): RevenueCat and analytics HMAC keys are not injected in the OTA CI step, silently degrading in-app purchases and analytics privacy on OTA-updated builds.

Counts: Critical 0, High 3, Medium 4, Low 7.
