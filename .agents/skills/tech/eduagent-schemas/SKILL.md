---
name: eduagent-schemas
description: >
  Use when working with cross-package type contracts, API-facing schema
  definitions, or trust-boundary parse discipline in this repo. Triggers on:
  @eduagent/schemas imports, redefining types that already exist in packages/schemas/,
  adding new API request/response shapes, handling JWT or Clerk token claims,
  consuming Inngest event payloads, parsing deep-link or route params,
  working with LLM response envelopes, or syncing device/i18n state to profiles.
user-invocable: false
agentic: false
---

# @eduagent/schemas — Trust-Boundary Parse Discipline

## Relationship to `tech/zod`

This skill is **repo-specific overlay** on top of `tech/zod`. Do not re-read
the Zod mechanics. Instead, load `.agents/skills/tech/zod/SKILL.md` for:

- **`arch-boundary-parsing`** — parse at system boundaries; pass typed data
  inward (not raw objects).
- **`arch-untrusted-deserialization`** — never `JSON.parse(x) as T`; use
  `safeParse` + fail closed.

The two rules above are **prerequisites**. Everything below is repo-specific
*application* of those rules to the MentoMate stack.

---

## 1. `@eduagent/schemas` is the single source of truth

**Rule (from AGENTS.md — Non-Negotiable Engineering Rules):**

> Do not redefine API-facing types locally.

`packages/schemas/` is the shared contract between `apps/api`, `apps/mobile`,
and any shared package. It is the only place API-facing types and the schemas
that validate them are defined.

What this means in practice:

- **Need a type for an API request/response body?** Find or add it in
  `packages/schemas/src/`, export from the package barrel, import from
  `@eduagent/schemas`.
- **Need a Zod schema for an Inngest event payload?** If the payload shape is
  shared or reused, it belongs in `packages/schemas/`. Handler-local schemas
  for single-function internal shapes are acceptable, but must not duplicate or
  shadow an existing shared schema.
- **Never** create a local `type Foo = { ... }` that mirrors a type already
  exported from `@eduagent/schemas`. The divergence is invisible until runtime.

---

## 2. Mandatory trust boundaries — use `safeParse`, not `parse`

Five boundary categories exist in this codebase where untrusted data crosses
into typed application code. All five require `safeParse`. A `parse()` call at
any of these boundaries is a bug — it turns a validation failure into an
unhandled exception.

### 2a. JWT / Clerk token claims

JWT payloads arrive as `JSON.parse` casts from the verification library.
`sub`, `email`, and `email_verified` are not guaranteed to be present or the
right type in a malformed token.

**Canonical example:**

```
apps/api/src/middleware/auth.ts:18   — schema definition (clerkJWTClaimsSchema)
apps/api/src/middleware/auth.ts:138  — safeParse at the boundary
```

Pattern:
```typescript
// F-021: Runtime validation at the JWT trust boundary
const claims = clerkJWTClaimsSchema.safeParse(rawPayload);
if (!claims.success) throw new Error('Invalid JWT: missing or invalid required claims');
```

Rationale: `verifyJWT` validates the *signature*; it does not guarantee the
payload fields conform to any schema. The explicit `safeParse` is the guard
between "cryptographically valid token" and "application-trusted user identity."

### 2b. Inngest event payloads

Inngest event payloads arrive as `unknown`. Using `.parse(event.data)` at the
top of a function handler — before any `step.run` — causes a `ZodError` to be
treated as a transient function failure, burning the retry budget on a
permanently-bad payload.

**Canonical example:**

```
apps/api/src/inngest/functions/ask-silent-classify.ts:50
```

Pattern:
```typescript
// safeParse prevents retries on permanently-bad payloads (see ask-silent-classify.ts:44-60)
const validated = eventDataSchema.safeParse(event.data);
if (!validated.success) {
  logger.warn('[my-function] invalid payload — skipping retries', {
    issues: validated.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
  return { skipped: true };
}
```

Rationale: an invalid event will never become valid through retries. Exit
cleanly and emit a structured failure event so the bad payload is queryable.

### 2c. Deep-link and route params (enum values)

Expo Router's `useLocalSearchParams` returns all path segments and query
parameters as plain strings — including values that originated from an external
deep link (a URL opened from another app, a push-notification tap, or a
clipboard paste). Those strings are untrusted at the app boundary.

Where a param maps to a **bounded enum** in the schema package, clamp it with
`safeParse` before using it to drive navigation, API calls, or profile writes.

**Example — validating a route param against a known schema value:**

```typescript
import { someEnumSchema } from '@eduagent/schemas';
import { useLocalSearchParams } from 'expo-router';

const { type } = useLocalSearchParams<{ type: string }>();
const parsed = someEnumSchema.safeParse(type);
if (!parsed.success) {
  // redirect to fallback or show error — do not pass untrusted string onward
  return;
}
// parsed.data is now a typed enum value
```

Opaque string IDs passed straight to the API (e.g. `roundId`, `subjectId`)
do not need Zod validation in the mobile layer — the API validates them
server-side. The rule applies where the **value itself drives branching** in
mobile code (a status code, a locale, a mode flag).

### 2d. LLM response envelopes

LLM responses arrive as freeform strings. The structured envelope schema
(`llmResponseEnvelopeSchema` from `@eduagent/schemas`) is the boundary between
raw LLM output and typed application state.

**Schema definition:**
```
packages/schemas/src/llm-envelope.ts  — llmResponseEnvelopeSchema
```

**Parse implementation:**
```
apps/api/src/services/llm/envelope.ts:205  — llmResponseEnvelopeSchema.safeParse(parsed)
```

**Rule (from AGENTS.md — Non-Negotiable Engineering Rules):**

> LLM responses that drive state-machine decisions must use the structured
> response envelope (`llmResponseEnvelopeSchema`). Parse with `parseEnvelope()`
> from `services/llm/envelope.ts`. Never embed `[MARKER]` tokens or JSON blobs
> in free-text replies.

Always call `parseEnvelope()` — never call `llmResponseEnvelopeSchema.safeParse`
directly in a handler. `parseEnvelope()` wraps the safeParse, adds structured
logging per call-site surface, and normalises the reply text.

```typescript
import { parseEnvelope } from '../services/llm/envelope';

const result = parseEnvelope(rawLlmResponse, 'exchange.session');
if (!result.ok) {
  // result.reason: 'no_json_found' | 'invalid_json' | 'schema_violation'
  // handle + log — never let the flow continue with unvalidated LLM output
}
const envelope = result.envelope; // typed LlmResponseEnvelope
```

### 2e. Device/i18n state written to profile (enum clamping)

Device-level values (i18next language, system locale) are freeform strings.
Before writing one to a profile field backed by a DB CHECK constraint, clamp it
through the relevant schema.

**Canonical example — conversation language sync:**

```
apps/mobile/src/hooks/use-mentor-language-sync.ts:21
```

```typescript
import { conversationLanguageSchema } from '@eduagent/schemas';

const parsed = conversationLanguageSchema.safeParse(i18next.language);
if (!parsed.success) return; // unsupported locale — do not write
```

Rationale: `conversationLanguageSchema` is a `z.enum` of the 10 supported
conversation-language codes. The DB has a matching CHECK constraint
(`profiles_conversation_language_check`). A raw write of an arbitrary
`i18next.language` value would trigger a constraint violation at the database
level. `safeParse` + early return keeps the invalid value out of the mutation
path entirely.

The same pattern applies anywhere a device or user-supplied value maps to a
bounded enum in the schema package.

---

## 3. What does NOT need `safeParse`

Not every boundary requires explicit runtime validation:

- **Typed API client calls via Hono RPC** — the client already infers types
  from `AppType`. The route handler validates the body; the client picks up the
  inferred response type. No extra `safeParse` in the caller.
- **Internal service-to-service calls within `apps/api/`** — values that never
  left the process and are already typed do not need re-validation.
- **Opaque string ID params from `useLocalSearchParams`** — Expo Router
  returns strings for all params. For string IDs (`roundId`, `subjectId`, etc.)
  passed straight to the API without branching on the value, no Zod validation
  is needed in the mobile layer — the API validates server-side. The exception is
  enum values that drive mobile-side branching: those require `safeParse` (§2c).

---

## 4. Adding schemas to `packages/schemas/`

When adding a new API-facing type:

1. Define the Zod schema in `packages/schemas/src/<domain>.ts`.
2. Export it from the package barrel (`packages/schemas/src/index.ts`).
3. Import via `@eduagent/schemas` everywhere it is used — never via a relative
   path that crosses package boundaries.
4. Derive TypeScript types with `z.infer<typeof MySchema>` — do not hand-write
   a parallel type.

Additive changes are non-breaking. Use `.optional()` for new fields on existing
schemas used at network boundaries, or introduce a new schema alongside the old
one and migrate call-sites.

---

## 5. Quick checklist

Before opening a PR that touches a trust boundary, verify:

- [ ] All untrusted inputs (`event.data`, JWT payloads, LLM strings,
      device-locale values) are validated with `safeParse`, not `parse`.
- [ ] No local type duplicates a type already exported from `@eduagent/schemas`.
- [ ] New API-facing schemas live in `packages/schemas/`, not in the app.
- [ ] `parseEnvelope()` (not raw `safeParse`) is used for LLM envelopes.
- [ ] Failed `safeParse` at Inngest boundaries exits cleanly without throwing
      (so Inngest does not schedule retries).
- [ ] Enum clamps (e.g. language values) return early on `!parsed.success`
      rather than falling through with an invalid value.
