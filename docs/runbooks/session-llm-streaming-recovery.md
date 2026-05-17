# Session LLM Streaming Recovery - PR 301/302/303 Incident Note

Last updated: 2026-05-17

This note records the likely fix chain for the May 16, 2026 chat issue where learners could see empty assistant turns and the LLM appeared to stop answering after roughly three rounds. The relevant merged PRs were:

- PR 301: `fix(learning): stabilize library shelves and completion status`
- PR 302: `fix(llm): harden streaming failures and app help prompts`
- PR 303: `fix(observability): harden transient error reporting`

## Short Answer

The most likely fix was the combination of PR 302 and PR 303.

PR 302 addressed the LLM provider failure path: it split circuit breaker state by provider capability (`gemini:text` vs `gemini:vision`), added fallback behavior for zero-token streams, and mapped circuit-open failures to a typed `LLM_UNAVAILABLE` response instead of an opaque server failure.

PR 303 addressed the client session race: it prevented delayed active-session auto-resume and transcript hydration from overwriting a local learner turn that had already started. That race could make freshly sent user messages or assistant placeholders disappear, which looked like empty chat behavior.

PR 301 is probably not the direct fix for "LLM stopped answering," but it matters adjacent to the "three rounds" wording: it made topic/book completion require meaningful completed sessions and introduced `MIN_EXCHANGES_FOR_TOPIC_COMPLETION = 3`, reducing false progress/completion signals from short or failed chats.

## Likely Failure Chain

1. The LLM circuit breaker was provider-wide before PR 302.

   A transient failure in a vision/OCR call could count against the same provider circuit used by text chat. The circuit threshold is three consecutive failures with a 60-second recovery window. Once the provider circuit opened, normal text chat could be blocked even though the text path itself was healthy.

2. Zero-token or pre-first-byte streams could produce an empty-looking assistant turn.

   Gemini can complete a streaming request with no text chunks. Without a fallback before the client rendered the turn, the UI could end up with a blank assistant bubble or a generic retry state instead of a useful answer.

3. Active-session auto-resume could race with a new local turn.

   On a learning topic route with no explicit `sessionId`, the mobile screen looks up an active session and then hydrates transcript messages. If the learner sends a message before that lookup resolves, the late transcript hydration could overwrite the local user message or streaming assistant placeholder.

4. Transient database noise made diagnosis harder and may have amplified the issue.

   PR 303 reduced `/v1/subjects` database fan-out by batching curriculum status lookups and classified Neon "timeout exceeded when trying to connect" errors as retryable. That is more likely a stability and observability improvement than the direct LLM fix, but it reduced noisy failures around the same user flows.

## What Changed

### PR 302 - LLM streaming hardening

- Circuit breaker keys are now provider plus capability, not provider alone. A vision failure opens `provider:vision`; a text chat uses `provider:text`.
- Circuit-open failures now carry `circuitKey` through `CircuitOpenError`, route logs, and session error handling.
- The sessions route maps circuit-open LLM failures to `LLM_UNAVAILABLE` with HTTP 503 instead of treating them as a generic 500.
- Zero-token primary streams try the fallback provider before falling back to a session-level empty-reply recovery frame.
- The route emits structured logs around pre-stream setup, stream drain, fallback, and post-stream processing.
- App-help prompt content is only injected when the learner actually asks for app help, reducing prompt bulk in normal learning turns.

### PR 303 - Client race and observability hardening

- The session screen no longer performs active-session lookup while there is a local learner turn, an active session id, or a stream in progress.
- Transcript hydration now checks the current message ref before replacing messages. If there is a streaming message or a local user message not present in the transcript, hydration returns without overwriting.
- Mobile captures typed LLM stream failures with Sentry tags such as `surface=session_stream`, `feature=llm`, `code=LLM_UNAVAILABLE`, and `mode`.
- Recovered transient DB retries are breadcrumbs rather than Sentry exceptions.
- Expected typed temporary DB outage query errors are suppressed on mobile.
- A protected `/maintenance/sentry-smoke` endpoint was added to verify Sentry capture in the deployed API.

### PR 301 - Adjacent progress semantics

- Topic/book completion now depends on meaningful completed sessions or accepted summaries instead of any short/failed session.
- `MIN_EXCHANGES_FOR_TOPIC_COMPLETION = 3` is the canonical threshold for topic completion.
- This likely fixed false completion/progress behavior around short chats, but it is less likely to be the root cause of the LLM no-answer symptom.

## Files To Check First Next Time

- `apps/api/src/services/llm/router.ts`
  - Check circuit keying, zero-token stream fallback, provider fallback, and circuit threshold behavior.
- `apps/api/src/routes/sessions.ts`
  - Check SSE error frames, fallback frames, quota refund paths, and `CircuitOpenError` / `LLM_UNAVAILABLE` mapping.
- `apps/mobile/src/components/session/use-session-streaming.ts`
  - Check client classification of reconnectable stream errors and Sentry capture for typed LLM failures.
- `apps/mobile/src/app/(app)/session/index.tsx`
  - Check active-session auto-resume gating and transcript hydration guards.
- `apps/api/src/services/transient-db-retry.ts`
  - Check retryable Neon/connection timeout classification.

## Debug Checklist

1. In API logs, search for `surface=sessions.stream`, then inspect `phase`, `chunkCount`, `errorName`, `causeName`, and `circuitKey`.
2. If the learner saw no assistant text, look for `Primary stream completed with zero chunks`, `Zero-token stream completed`, or `type=fallback` SSE frames.
3. If the LLM stopped after around three failures, check whether the circuit key is capability-scoped (`gemini:text`, `gemini:vision`) and whether the same key has three consecutive failures.
4. If local messages disappear or the chat resets, inspect `shouldLookupActiveSession`, `hasLocalLearnerTurn`, and the transcript hydration guard in the session screen.
5. If Sentry is quiet when logs show failures, use the protected maintenance smoke endpoint to verify API Sentry capture.

## Regression Tests Added Around This Fix

- API LLM router tests for streaming fallback, zero-token streams, circuit behavior, and provider capability isolation.
- API session route tests for empty messages, fallback SSE frames, and `LLM_UNAVAILABLE` mapping.
- Mobile session streaming tests for reconnect prompts and Sentry capture of LLM stream errors.
- Mobile session screen test: `does not auto-resume over a local turn when the learner sends before lookup settles`.
- API transient DB retry tests for Neon connection timeout classification.
