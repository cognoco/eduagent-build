# eduagent-build

## What this codebase does

MentoMate is an Nx/pnpm TypeScript monorepo for an AI tutoring app serving
learner profiles and guardian/family accounts. `apps/mobile` is Expo React
Native with Expo Router, Clerk, TanStack Query, NativeWind, SecureStore,
RevenueCat, and typed Hono RPC. `apps/api` is a Hono API on Cloudflare Workers
using Clerk JWTs, Neon/Postgres with Drizzle, Inngest jobs, SSE LLM streaming,
Sentry, and shared Zod contracts from `@eduagent/schemas`.

## Auth shape

- `authMiddleware` verifies Clerk JWTs from JWKS and requires
  `CLERK_AUDIENCE`; only `PUBLIC_PATHS` skip Clerk.
- `accountMiddleware` maps Clerk `sub` + email to a local `Account`;
  account-level handlers use `requireAccount()` or `c.get('account').id`.
- `profileScopeMiddleware` verifies `X-Profile-Id` belongs to the
  authenticated account, auto-resolves the owner profile when absent, and sets
  `profileId` plus `profileMeta`.
- Route handlers unwrap profile context through `requireProfileId()` or
  `withProfile()`; profile-owned service calls should receive that
  server-verified profile id.
- `assertNotProxyMode()` is the write guard for parent-on-child proxy
  sessions, using server-derived `profileMeta.isOwner` plus the client
  `X-Proxy-Mode` flag.

## Threat model

Highest impact is cross-profile or cross-family data access by swapping
`X-Profile-Id`, racing mobile profile switches, or bypassing parent proxy mode
on writes. Billing and quota state is sensitive: RevenueCat/Stripe webhooks,
top-ups, subscription KV, and LLM metering must resist duplicate/replayed
events and silent drift. LLM prompts ingest user transcripts, memory facts,
homework images, profile metadata, and language settings, so user text must
stay data and state transitions must come from structured envelopes with server
hard caps. Consent, withdrawal, export, and deletion paths are
regulatory-critical and need observable, retryable background work.

## Project-specific patterns to flag

- Protected Hono routes under `apps/api/src/routes/**` that do not use
  `requireProfileId()`, `withProfile()`, `requireAccount()`, or an equivalent
  service-level account/profile check.
- Drizzle reads of profile-owned tables outside
  `createScopedRepository(profileId)`, unless the query is a parent-chain join
  that filters through the closest owning ancestor; writes missing a
  `profileId` guard or verified parent-chain ownership.
- Direct LLM provider calls or direct SDK/fetch usage instead of
  `routeAndCall()` / `routeAndStream()` from `services/llm`.
- LLM-driven state decisions that skip `llmResponseEnvelopeSchema` +
  `parseEnvelope()` or rely only on free-text markers without a server hard cap.
- Durable async side effects fired directly from routes: non-core dispatches
  should use `safeSend()`, while direct `inngest.send()` needs a nearby
  `core-send:` reason.

## Known false-positives

- Intentional public paths include `/v1/health`, `/v1/inngest`,
  `/v1/consent-page*`, `/v1/consent/respond`, `/v1/billing/success`,
  `/v1/billing/cancel`, `/v1/stripe/webhook`, `/v1/revenuecat/webhook`,
  `/v1/__test/*`, and `/v1/maintenance/*`.
- `/v1/__test/*` skips Clerk by design but is blocked in production and
  guarded by `X-Test-Secret` outside local development; `llm-ping` also
  requires explicit opt-in outside dev.
- Stripe and RevenueCat webhooks skip Clerk by design; Stripe uses raw-body
  signature verification and stale/test-mode guards, while RevenueCat uses
  bearer `REVENUECAT_WEBHOOK_SECRET`, schema validation, idempotency, and
  sandbox-production rejection.
- Public consent HTML is token-based and deliberate; user-controlled strings
  should pass through `escapeHtml()`, and destructive confirmation is POST-only.
- `apps/mobile` imports `AppType` from `@eduagent/api` for Hono RPC as a
  type-only dependency; this is allowed as long as no runtime API code enters
  the mobile bundle.
