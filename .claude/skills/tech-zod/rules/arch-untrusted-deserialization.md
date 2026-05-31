# arch-untrusted-deserialization

**Priority:** CRITICAL · **Category:** Architecture & Boundaries

## Why it matters

`JSON.parse()` returns `any`. A TypeScript `as` cast on that value is a **lie to the
compiler** — it asserts a shape that was never checked at runtime. Three boundaries are
routinely mis-trusted this way because the bytes *look* structured:

1. **LLM / AI model output** — a model can emit malformed JSON, omit fields, hallucinate
   extra ones, or be steered by prompt injection. Output that drives a state machine,
   tool call, or DB write is untrusted input, not a typed object.
2. **Decoded auth-token claims** — the payload of a JWT (or any signed token) is
   attacker-influenced data. Signature verification proves *integrity*, not *shape*: a
   validly signed token can still carry `sub: 123` (number) or a missing claim.
3. **Third-party API / webhook bodies** — external schemas drift silently; an error
   envelope deserializes to a different shape than the success body.

In every case `JSON.parse(x) as T` produces a value typed `T` that may not *be* `T`.
Downstream code dereferences fields that are `undefined` at runtime, or feeds
attacker-shaped data into privileged paths. The type system actively hides the bug.

## Incorrect

```typescript
// LLM output driving a decision — cast, not parsed
const decision = JSON.parse(llmText) as { action: "close" | "hold"; reason: string }
if (decision.action === "close") closeSession()   // action may be undefined/any string

// Decoded token claims — cast, not parsed
const claims = JSON.parse(base64UrlDecode(payload)) as { sub: string; role: string }
const user = await lookup(claims.sub)             // sub may be a number, or absent

// External API body — cast, not parsed
const body = (await res.json()) as PaymentResult
grantEntitlement(body.tier)                       // tier undefined on an error envelope
```

## Correct

```typescript
// Define the expected shape once, parse at the boundary, branch on success
const Decision = z.object({
  action: z.enum(["close", "hold"]),
  reason: z.string(),
})

const parsed = Decision.safeParse(JSON.parse(llmText))
if (!parsed.success) {
  logger.warn("llm_output_schema_mismatch", { fieldErrors: z.flattenError(parsed.error).fieldErrors })
  return holdAndEscalate()        // explicit, safe fallback — never proceed on unparsed data
}
if (parsed.data.action === "close") closeSession()   // now provably shaped

// Token claims — verify signature, THEN parse the payload shape
const Claims = z.object({ sub: z.string().min(1), role: z.enum(["user", "admin"]) })
const claims = Claims.parse(JSON.parse(base64UrlDecode(verifiedPayload)))

// JWKS / external body — parse before first use
const Jwks = z.object({ keys: z.array(z.object({ kid: z.string(), kty: z.string() })) })
const jwks = Jwks.parse(await res.json())
```

## Rules of thumb

- **Never `JSON.parse(x) as T`.** If the next token after `JSON.parse(` would be `as`,
  reach for a schema instead. `JSON.parse()` and a Zod schema are a pair.
- **Signature ≠ shape.** Verifying a token authenticates the issuer; it does not validate
  claim types. Parse the decoded payload.
- **LLM output is input.** Any model response that selects a branch, emits a tool/function
  call, or is persisted must pass through `safeParse` with a server-side fallback for the
  failure case. Do not embed control tokens in free text and string-match them.
- **Fail closed.** On parse failure, take the safe path (reject, hold, re-fetch, 4xx/5xx) and
  emit a structured log/metric — never silently continue with partially-shaped data.

## Decision table

| Source of bytes | Integrity already proven? | Still parse the shape? |
|---|---|---|
| LLM / AI model output | n/a | **Yes** — always |
| JWT / signed token payload | Yes (signature) | **Yes** — signature ≠ shape |
| Third-party API / webhook body | Maybe (HMAC) | **Yes** — schemas drift |
| Your own typed ORM result | Yes (generated types) | Usually no |
