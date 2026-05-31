# [BUG] HALF_OPEN probeInFlight can leak on the lazy streaming path and wedge a provider circuit

**File:** [`apps/api/src/services/llm/router.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/llm/router.ts#L721-L1411) (lines 721, 728, 1299, 1411)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-circuit-breaker-liveness`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

canAttempt() has a synchronous side effect: on an OPEN→HALF_OPEN transition it sets probeInFlight=true (line 721), and in HALF_OPEN it sets probeInFlight=true before returning true (line 728). The paired reset (recordSuccess/recordFailure, which clear probeInFlight) only runs during stream ITERATION inside wrapStreamWithCircuitBreaker, because chatStream() returns a lazy AsyncIterable. routeAndStream() (line 1299) and attemptStreamProvider() (line 1411) call canAttempt() and then return a lazy StreamResult without awaiting it. If the returned stream is never iterated — e.g. the SSE caller throws during setup, the request aborts, or an exception is raised between routeAndStream() resolving and the for-await loop starting — probeInFlight stays true. While stuck, canAttempt() in HALF_OPEN always returns false (line 727), so every subsequent request to that provider:capability fails fast with CircuitOpenError until the Worker isolate is recycled. The non-streaming routeAndCall() path is unaffected because it awaits the provider call inline and always reaches recordSuccess/recordFailure. Impact is limited and self-healing (per-isolate, ephemeral module state; isolates recycle within minutes) and only occurs during the narrow HALF_OPEN recovery window, hence BUG not HIGH_BUG.

## Recommendation

Decouple the HALF_OPEN probe reservation from canAttempt()'s read, or guarantee release: wrap the stream construction so that if the wrapped generator is never started, probeInFlight is reset (e.g. reserve the probe inside the async generator's first step rather than in the synchronous canAttempt(), or add a finalizer/timeout that clears probeInFlight if iteration has not begun within a bounded window).

## Revalidation

**Verdict:** true-positive

The mechanism is real and verified end-to-end. canAttempt() (lines 714-730) has a synchronous side effect: on OPEN→HALF_OPEN it sets probeInFlight=true (721) and in HALF_OPEN it sets probeInFlight=true before returning true (728). The only resets are recordSuccess/recordFailure and the non-transient `else` branches — all of which live INSIDE wrapStreamWithCircuitBreaker, which is an `async function*` whose body does not execute until the returned AsyncIterable is iterated. routeAndStream (line 1299) and attemptStreamProvider (line 1411) call canAttempt() synchronously, build the lazy stream via wrapStreamWithCircuitBreaker + provider.chatStream() (both lazy — gemini.ts's generate() is also a generator), and return without iterating. I traced the consumer: exchanges.ts:1413 awaits routeAndStream, then teeEnvelopeStream(result.stream) wraps it lazily (streamEnvelopeReply over accumulatedSource), and session-exchange.ts streamMessage returns {stream, onComplete} — actual iteration of the wrapped generator is deferred until the SSE route pulls the body. So a throw or client-abort between routeAndStream resolving and iteration starting leaves probeInFlight=true with no reset. Crucially, HALF_OPEN's canAttempt has no time-based recovery (unlike OPEN), so once wedged it fails-fast every subsequent request until the isolate recycles. However, impact is exactly as the finding states: it requires the narrow OPEN-just-recovered/HALF_OPEN window AND a stream that is never iterated; it is per-isolate ephemeral module state and self-heals on recycle (minutes), and even while wedged the request typically routes to the configured fallback rather than hard-failing. Genuine latent liveness bug, negligible/self-healing security impact — BUG severity is correct.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-29)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-27)
