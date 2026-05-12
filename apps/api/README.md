# @eduagent/api

Hono REST API running on Cloudflare Workers. Provides all backend endpoints for the MentoMate mobile app.

## Overview

| Attribute | Value |
|-----------|-------|
| Framework | Hono 4.11 |
| Runtime | Cloudflare Workers |
| Database | Neon (PostgreSQL) via `@eduagent/database` |
| Auth | Clerk JWKS verification |
| Background jobs | Inngest v3 (45 functions) |
| LLM | Multi-provider via `services/llm/router.ts` |

## Structure

```
src/
  config.ts           Typed environment config (use this; never raw process.env)
  index.ts            Hono app entry + route mounting
  routes/             One file per route group — handlers only, no business logic
  services/           Business logic, LLM prompts, billing, session management
  inngest/            Inngest client, function registry, background function files
  middleware/         Auth (Clerk JWT), error handling, env validation
  data/               Static seed data
```

## Key Patterns

- All routes are prefixed `/v1/`. App Store binaries cannot be force-updated.
- Route handlers are inline for Hono RPC type inference. Logic lives in `services/`.
- Route files must not import ORM primitives — call a service function instead.
- Services must not import from `hono` — they receive typed args, return typed results.
- Use the typed `config` object from `config.ts`. Raw `process.env` reads are banned by eslint G4.
- Error responses use `ApiErrorSchema` from `@eduagent/schemas`. Never ad-hoc JSON.
- Durable background work goes through Inngest. No fire-and-forget from route handlers.
- LLM structured responses use `llmResponseEnvelopeSchema` + `parseEnvelope()`.

## Development

```bash
# Local dev server (Wrangler)
pnpm exec nx dev api

# Lint
pnpm exec nx run api:lint

# Type check
pnpm exec nx run api:typecheck

# Tests
pnpm exec nx run api:test

# LLM eval harness (snapshot — no LLM call)
pnpm eval:llm

# LLM eval harness (live — real LLM call)
pnpm eval:llm --live
```

## Deploy

```bash
# Deploy to Cloudflare Workers
pnpm exec nx deploy api
```

Secrets are managed via Doppler. Never use `wrangler secret put` directly.
