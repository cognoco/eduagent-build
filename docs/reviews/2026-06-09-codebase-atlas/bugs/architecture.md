# Architecture & conventions — Bug Review

> **Pruned 2026-06-10** — findings verified FIXED against `new-llm` HEAD were removed in this pass; only still-live findings remain below. Full original review is in git history.

Lens: Architecture & conventions. Owned area: `apps/api/src/routes/**` vs `services/**`, `packages/**`, and the `eslint.config.mjs` governance rules (G1/G3/G4/G5/G8 + GC1/GC4/GC5). Branch: `new-llm`.

## Summary of posture

The lint-enforced rules are in genuinely good shape and the ratchets are doing their job:

- **G1** (no `drizzle-orm` imports in routes): 0 violations — `grep "from 'drizzle-orm'" routes/` is empty.
- **G3** (LLM SDK imports confined to `services/llm/providers/**`): clean.
- **G4 / Rule-4** (no `export default` outside Worker entrypoint; no raw `process.env` in API): 0 route violations; every `process.env` read is in an allow-listed file (`inngest/helpers.ts`, `middleware/env-validation.ts`, `middleware/llm.ts`).
- **G5** (no `c.get('db').select()` chains; no `@eduagent/database` value imports in routes): no route calls `db.select/.insert/.update/.delete/.query` directly — every DB access is delegated to a `services/*` function with `db` passed as an argument.
- **G8** (mobile may only type-import `@eduagent/api`): clean — only `import type { AppType }` in `api-client.ts`/`api.ts`.
- **Package barrels**: no deep imports into `@eduagent/{schemas,database,retention,test-utils}/subpath` in production code; no cross-app (`apps/api` ↔ `apps/mobile`) coupling; `@eduagent/test-utils` appears only in test infra.
- **Inngest `safeSend` vs `core-send`** discipline holds — the `safe-non-core.guard.test.ts` ratchet covers it and the bare sends I spot-checked are correctly annotated `// core-send:` and inside try/catch.

The findings below are the residue: business-logic orchestration that lives in route handlers, one route-to-route logic import, and a client contract built inline instead of through `@eduagent/schemas`.

## Critical

None.

## High

### [High] Terminal-assessment transition orchestration lives in the route handler, not a service
- File: `apps/api/src/routes/assessments.ts:135-248`
- What: The `POST /assessments/:assessmentId/answer` handler opens `db.transaction(...)` inline and orchestrates the entire terminal transition: `lockAssessmentForAnswerSubmission` (SELECT … FOR UPDATE), `evaluateAssessmentAnswer`, status resolution (`resolveAssessmentStatus`), `mapEvaluateQualityToSm2(...)` (line 217), `updateRetentionFromSession` (line 223), and the conditional `insertSessionXpEntry` on `newStatus === 'passed'` (line 230-237). The transaction body, the SM-2 quality mapping, and the "XP only on passed" policy are all expressed in the route.
- Impact: This is the canonical "this whole transaction belongs in a service" case. Per CLAUDE.md ("Business logic belongs in `services/`, not route handlers"), the policy here is testable only through the HTTP handler. It is also a drift hazard: the same scoring/XP/retention policy must be kept in lockstep with any non-streaming or alternate completion path, exactly the class of bug the inline SSE `done`-frame (BUG-797, see below) was created to prevent. The `[CR #8]` comment (line 199-210) documents that this co-commit logic was already reworked once after a prior split-transaction bug — evidence the orchestration is non-trivial and belongs behind one service function with its own unit tests.
- Fix direction: Extract a `submitAssessmentAnswer(db, profileId, assessmentId, answer, ctx)` service that owns the transaction, the SM-2 mapping, and the XP/retention policy, returning a typed result the route maps to `submitAssessmentAnswerResponseSchema`. Do NOT apply — flag for the route-shrink epic.

## Medium

### [Medium] Stream completion fallback policy (stream → non-streaming retry, quota refund) is orchestrated in the route handler
- File: `apps/api/src/routes/sessions.ts:697-1224`
- What: The `POST /sessions/:sessionId/stream` handler contains the full failure-recovery policy inline: drain the LLM stream, on error decide whether to attempt a non-streaming `processMessage` fallback (skipping only `RateLimitedError`/safety-filter), classify the error into a stable `errorCode`, and conditionally call `safeRefundQuota` against the same pool the metering middleware decremented (`c.get('quotaDecrementSource')` etc., repeated at lines 844-846, 944-946, 1066-1068, 1213-1215). The zero-token-recovery branch and the fallback-frame branch each re-implement the refund call.
- Impact: This is substantial business logic (failure classification + compensating quota refund + fallback selection) in a route handler. The refund-source plumbing is copy-pasted across ~4 branches, which is precisely the drift surface the BUG-797 `buildDoneFramePayload` consolidation was meant to fix on the done-frame side. The recovery policy is testable only end-to-end through the SSE handler.
- Fix direction: Lift the failure-classification + fallback-selection + quota-refund policy into the streaming service (e.g. the `onComplete`/error surface returned by `streamMessage`), leaving the route to forward frames. Do NOT apply.

## Low

### [Low] A service couples to the Hono web framework via `Context` parameters
- File: `apps/api/src/services/family-access.ts:12,80,131,150`
- What: `family-access.ts` is under `services/` but imports `Context, Env, Input` from `hono` (type-only) and several exports (`assertCanManageOwnConsent`, `assertOwnerAndParentAccess`, `assertOwnerProfile`) take a Hono `Context` and read `c.get('profileMeta')`.
- Impact: A service reaching into the web framework's request context blurs the route/service boundary — these are really middleware/guard helpers, not framework-agnostic business logic. It is a minor smell, type-only, and documented in-file as a deliberate ergonomic tradeoff (each route keeps its own env type while the helper preserves the concrete shape). Low because it does not break any rule and the alternative (passing `profileMeta` explicitly) is a readability wash.
- Fix direction: Optionally accept the resolved `profileMeta` (and `db`) as plain arguments instead of the whole `Context`, so the guards are pure functions. Defer / leave as-is unless the file is touched anyway.

## Cross-lens findings

- **Reliability / correctness (Reliability lens):** Both in-memory rate limiters (`routes/consent.ts:79` `consentRespondTimestamps`, `routes/feedback.ts:39` `feedbackTimestamps`) are per-isolate `Map`s on Cloudflare Workers. They reset on every cold start and are not shared across isolates, so the effective rate limit is weaker and non-deterministic in production. The architecture fix (extract to a service) does not by itself fix the durability problem — it needs a Workers-appropriate backing store (KV/Durable Object/DB). Flagged here only as the architecture-adjacent half.
- **Security / authz (Security lens):** `apps/api/src/routes/test-seed.ts` is a tracked, mounted route (`apps/api/src/index.ts:282`) exposing `/__test/seed`, `/__test/reset`, and `/__test/debug/:email`. It delegates correctly to `services/test-seed` and claims a production-rejection middleware guard + `TEST_SEED_SECRET`/`LLM_PING_ENABLED` gating (file header, lines 1-50). The architecture is sound; the security lens should verify the production-rejection middleware is actually wired and that the debug-by-email endpoint cannot leak account→profile chains in any non-prod-but-internet-reachable environment (staging).
- **Contract validation lens:** Per-`c.json()` response-schema-parse coverage was not exhaustively audited (25 `c.json` sites in `sessions.ts` alone). The concrete gap found is the SSE `done` frame (above); a dedicated contract lens should verify every `c.json` response goes through a `@eduagent/schemas` `.parse()` rather than returning a bare object literal.
