# [MEDIUM] Unmetered LLM endpoint: quick-check answer evaluation bypasses quota enforcement

**File:** [`apps/api/src/services/assessments.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/assessments.ts#L425-L446) (lines 425, 446)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

`evaluateQuickCheckAnswer` (lines 425-453) calls the LLM unconditionally via `routeAndCall(messages, 2, …)` (line 446, Gemini Flash). It is exposed at `POST /v1/sessions/:sessionId/quick-check` (apps/api/src/routes/assessments.ts:370-416). Quota/abuse protection for LLM routes is enforced ONLY by `meteringMiddleware` (apps/api/src/middleware/metering.ts), which short-circuits and skips metering for any path not matching `LLM_ROUTE_PATTERNS_ANY_METHOD` or `LLM_ROUTE_PATTERNS_POST_ONLY` (lines 140-248). The quick-check path matches NEITHER list (verified by enumeration: only `/messages`, `/stream`, `/recall-bridge`, `/evaluate-depth`, `/summary`, `/retry-filing`, etc. are covered). The middleware stack in apps/api/src/index.ts:215-241 contains no other rate limiter. The route only verifies session ownership via `getSession(db, profileId, sessionId)` — an attacker uses their own valid account and a single owned session, then replays the endpoint in a tight loop. `quickCheckRequestSchema` (packages/schemas/src/assessments.ts:109-113) is just `{answer: string(1-5000)}` with no call cap, idempotency key, or session-state gating, and the handler mutates no durable state, so there is nothing to throttle repeats. Result: an authenticated user can drive unlimited LLM calls at zero quota cost, incurring direct financial cost and provider rate-limit exhaustion. This is the exact vulnerability class the codebase explicitly fixed for sibling endpoints — see the metering.ts comments for BUG-623 (recall-bridge: 'any authenticated user could call recall-bridge in a tight loop and burn unlimited LLM capacity at zero cost'), BUG-653 (evaluate-depth), and BUG-93 (subjects/resolve). quick-check was simply missed.

## Recommendation

Add the quick-check route to the metering allowlist in apps/api/src/middleware/metering.ts — e.g. add `/\/sessions\/[0-9a-fA-F-]{36}\/quick-check\/?$/` (UUID-scoped, consistent with the existing summary/retry-filing patterns) to `LLM_ROUTE_PATTERNS_POST_ONLY`. Add a regression test asserting the endpoint returns 402 when quota is exhausted, mirroring the assessments-answer metering test.

## Revalidation

**Verdict:** true-positive

Confirmed live. POST /sessions/:sessionId/quick-check (routes/assessments.ts:371) unconditionally calls evaluateQuickCheckAnswer → routeAndCall(messages, 2) (Gemini Flash, assessments.ts:446). The route path matches NO entry in LLM_ROUTE_PATTERNS_ANY_METHOD or LLM_ROUTE_PATTERNS_POST_ONLY (enumerated: messages/stream/recall-bridge/evaluate-depth/explain, and POST quiz/dictation/subjects(.resolve/.classify)/retry-filing/summary/answer/filing/ocr/learner-profile.tell/recall-test/generate-topics/curriculum.topics/curriculum.challenge/book-suggestions.topup). grep for 'quick-check' in metering.ts returns zero matches, so meteringMiddleware no-ops on this path. No other rate limiter exists in the app (grep for rateLimit/throttle across apps/api/src returns nothing; index.ts stack is cors→db→auth→account→profileScope→metering→consent). The coverage guard is FILE-level (LLM_CALL_SITE_FILES lists assessments.ts), and it's satisfied by the metered /answer route in the same file — so quick-check slips through unnoticed, which is why it was missed while the sibling endpoints (recall-bridge BUG-623, evaluate-depth BUG-653, subjects/resolve BUG-93) were fixed. Concrete attack: an authenticated, consented user creates one owned session (passes getSession ownership), then replays POST quick-check with {answer:'x'} in a tight loop; each call burns a Gemini Flash call at zero quota cost. The handler mutates no durable state and the schema has no idempotency key or call cap, so there is nothing to throttle replays — yielding unbounded LLM spend and provider rate-limit exhaustion. Recommendation stands: add /sessions/{uuid}/quick-check to LLM_ROUTE_PATTERNS_POST_ONLY with a 402-on-exhaustion regression test.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-29)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-29)
