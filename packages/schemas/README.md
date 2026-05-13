# @eduagent/schemas

Shared Zod schemas and inferred TypeScript types. The single source of truth for the API contract between `apps/api` and `apps/mobile`.

## Overview

All API-facing types live here. Neither `apps/api` nor `apps/mobile` should redefine types that cross the API boundary — import from `@eduagent/schemas` instead.

## What's in Here

| File | Domain |
|------|--------|
| `common.ts` | Shared primitives and utilities |
| `errors.ts` | `QuotaExceededError`, `ResourceGoneError`, `ForbiddenError` |
| `profiles.ts` | User profile shapes, tab shape resolution |
| `sessions.ts` | Learning session schemas |
| `subjects.ts` | Curriculum subject schemas |
| `assessments.ts` | Quick-check request/response schemas |
| `billing.ts` | Subscription and billing schemas |
| `inngest-events.ts` | Inngest event payload schemas |
| `llm-envelope.ts` | `llmResponseEnvelopeSchema` — structured LLM output contract |
| `filing.ts` | Conversation-first filing flow schemas |
| `retention-status.ts` | SM-2 retention status shapes |
| `progress.ts` | Progress and dashboard schemas |
| `quiz.ts` / `quiz-utils.ts` | Quiz activity schemas |
| `learning-profiles.ts` | Adaptive memory profiles |
| `stream-fallback.ts` | SSE stream frame schemas |
| *(and more)* | |

## Usage

```typescript
import { sessionEventSchema, ApiErrorSchema } from '@eduagent/schemas';
```

Always import from the package barrel (`@eduagent/schemas`), not from individual files.

## Key Constraints

- `@eduagent/schemas` has no workspace dependencies — it is the leaf package.
- Use `.nullable()` for response schemas, `.optional()` for request schemas. Never `.nullable().optional()`.
- The `llmResponseEnvelopeSchema` is mandatory for LLM flows that drive state-machine decisions. Parse with `parseEnvelope()` from `apps/api/src/services/llm/envelope.ts`.
- Error response shapes use `ApiErrorSchema`: `{ code, message, details? }`.

## Development

```bash
pnpm exec nx run schemas:typecheck
pnpm exec nx run schemas:test
```
