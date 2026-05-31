# [MEDIUM] Unmetered LLM endpoint: POST /sessions/:sessionId/quick-check has no quota decrement or rate limit

**File:** [`apps/api/src/routes/assessments.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/routes/assessments.ts#L370-L407) (lines 370, 371, 395, 396, 407)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The quick-check handler (routes/assessments.ts:370-416) calls evaluateQuickCheckAnswer(...), which invokes routeAndCall(messages, 2, ...) — a billable Gemini LLM call (services/assessments.ts:425-453). However, the metering middleware (middleware/metering.ts) gates LLM consumption purely by request-path regex (LLM_ROUTE_PATTERNS_ANY_METHOD / LLM_ROUTE_PATTERNS_POST_ONLY, lines 135-229), and NO pattern matches '/sessions/<uuid>/quick-check'. Verified by grep: zero references to quick-check in metering.ts or services/metering.ts. Therefore isLlmRoute() returns false, meteringMiddleware short-circuits via `await next()` (line 515-518), and the request reaches the LLM with no quota decrement, no daily/monthly cap enforcement, no idempotency, and no rate limiting. The only gate is getSession(db, profileId, sessionId), which merely requires the caller to own one valid session (trivially cheap to create). An authenticated user can then POST to /v1/sessions/<their-session-id>/quick-check in a tight loop, each call hitting the paid LLM provider at zero quota cost — unbounded cost amplification / financial DoS. This is the exact bug class the team has explicitly fixed and annotated elsewhere in the same allowlist: BUG-623/A-6 (recall-bridge, 'burn unlimited LLM capacity at zero cost'), BUG-653/A-5 (evaluate-depth), BUG-93/A1-CRIT (subjects/resolve), and WI-141/DS-052 (generate-topics) — all sibling session/subject sub-routes that WERE added to the allowlist. quick-check appears to have been overlooked. Note: because the route is not a metered route, the proxy-mode guard that metering applies (assertNotProxyMode at metering.ts:549) is also skipped here, so a parent in proxy mode on a child session can drive these LLM calls too.

## Recommendation

Add a path pattern for quick-check to LLM_ROUTE_PATTERNS_POST_ONLY in apps/api/src/middleware/metering.ts, mirroring the existing UUID-anchored session sub-route patterns, e.g. /\/sessions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/quick-check\/?$/ . Add a regression test asserting POST /sessions/:id/quick-check decrements quota (and returns 402 when exhausted), matching the coverage tests for recall-bridge/evaluate-depth. Consider whether the proxy-mode guard should also apply.

## Revalidation

**Verdict:** true-positive

Confirmed exploitable. The handler (assessments.ts:370-416) calls `evaluateQuickCheckAnswer`, which invokes `routeAndCall(messages, 2, {flow:'assessment.evaluate'})` — a billable Gemini call (services/assessments.ts:446-449). The metering middleware gates purely on `c.req.path` via `isLlmRoute` (metering.ts:238-248); I checked every pattern in SESSION_MESSAGE_STREAM_PATTERNS, LLM_ROUTE_PATTERNS_ANY_METHOD, and LLM_ROUTE_PATTERNS_POST_ONLY and none matches `/sessions/<uuid>/quick-check`. So `isLlmRoute` returns false, the middleware short-circuits via `await next()` (515-518), and the request reaches the LLM with no quota decrement, no daily/monthly cap, no idempotency, and no rate limit. Because metering short-circuits, the `assertNotProxyMode(c)` call at metering.ts:549 is also skipped, and the handler itself never calls it — so a parent in proxy mode on a child session can drive these calls too. The sole gate is `getSession(db, profileId, sessionId)` ownership; one legitimately-created session suffices to loop POST /v1/sessions/<id>/quick-check unboundedly at zero quota cost (financial DoS / cost amplification). The file-level coverage manifest masks this: services/assessments.ts is listed in LLM_CALL_SITE_FILES as 'covered' because the /answer route reaches the file, but the guard cannot see that a different function in the same file (evaluateQuickCheckAnswer) is reached from an unmetered route. This is the identical bug class to the already-fixed siblings recall-bridge (BUG-623), evaluate-depth (BUG-653), and subjects/resolve (BUG-93); quick-check was overlooked.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-28)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-25)
