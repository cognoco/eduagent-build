# [BUG] system-prompt / events / flag handlers return 500 (+ Sentry capture) instead of 404 for unknown sessionId

**File:** [`apps/api/src/routes/sessions.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/routes/sessions.ts#L1268-L1336) (lines 1268, 1283, 1336)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-error-handling`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

recordSystemPrompt (session-crud.ts L1461-1464), recordSessionEvent (L1481-1484), and flagContent (L1502-1505) throw a raw `new Error('Session not found')` when getSession returns null (i.e. the sessionId does not exist or does not belong to the authenticated profile). The corresponding route handlers — POST /sessions/:sessionId/system-prompt (L1255), /events (L1273), /flag (L1328) — do not wrap these calls in try/catch and do not throw the typed NotFoundError. Since a plain Error matches none of the typed branches in the global onError handler (index.ts L304-499), it falls through to captureException(err) + a 500 'Internal server error'. The correct behavior — used by sibling handlers in the same file (e.g. clear-continuation-depth, retry-filing, transcript, evaluate-depth all do `if (!session) return notFound(c, ...)`) — is a clean 404. Impact: clients probing or replaying a stale/foreign sessionId on these three endpoints receive a 500 instead of 404, and every such routine 'not found' generates a spurious Sentry event, contradicting the codebase's own error-classification discipline and adding observability noise. Not a security vulnerability (the IDs are still profile-scoped, so no data leaks), but a genuine correctness/observability defect.

## Recommendation

Have recordSystemPrompt, recordSessionEvent, and flagContent throw the typed NotFoundError (from ../errors) instead of a raw Error, OR add `if (!session) return notFound(c, 'Session not found')`-style handling in the three route handlers. Either makes the global onError handler emit a 404 with no Sentry capture, matching the rest of the file.

## Revalidation

**Verdict:** true-positive

Verified verbatim. recordSystemPrompt (session-crud.ts L1455), recordSessionEvent (L1475), and flagContent (L1495) each do `if (!session) { throw new Error('Session not found'); }` — a RAW Error, even though NotFoundError is imported in that file (L56) and used elsewhere. The three route handlers (system-prompt L1268, events L1283, flag L1336) invoke these with no try/catch and no `if (!session) return notFound(...)` guard. I read the global onError handler (index.ts L304-499): a plain Error matches none of the typed branches (HTTPException, ForbiddenError, ConsentRequiredError, NotFoundError, ConflictError, RateLimitedError, BadRequestError, SchemaDriftError, UpstreamLlmError, CircuitOpenError, LlmStreamError, transient-DB) and falls through to captureException(err) + 500 INTERNAL_ERROR. zValidator already 400s a malformed sessionId, so a well-formed-but-nonexistent/foreign UUID is the trigger: getSession returns null (it scopes by profileId, so no data leaks) → raw Error → 500 + a spurious Sentry event. Sibling handlers (clear-continuation-depth, retry-filing, transcript, evaluate-depth, recall-bridge) correctly return notFound(). The cited lines (1268, 1283, 1336) match the current code exactly. This is a real correctness/observability defect, not a security issue — BUG severity is appropriate.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-27)
