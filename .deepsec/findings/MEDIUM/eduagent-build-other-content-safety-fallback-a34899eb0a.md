# [MEDIUM] Only 'SAFETY' block reason is treated as a safety filter; other Gemini block reasons trigger cross-provider failover

**File:** [`apps/api/src/services/llm/providers/gemini.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/llm/providers/gemini.ts#L175-L301) (lines 175, 182, 197, 296, 301)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `other-content-safety-fallback`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

Gemini's safety enforcement for this minors-only app (SAFETY_SETTINGS_FOR_MINORS) is only honored when the block reason is the exact literal 'SAFETY'. extractResponseText() (L175, L182) and the streaming parser (L296, L301) raise SafetyFilterError only for promptFeedback.blockReason === 'SAFETY' or candidates[0].finishReason === 'SAFETY'. The Gemini API also returns the distinct, content-blocking reasons PROHIBITED_CONTENT, BLOCKLIST, SPII, and RECITATION. When Gemini blocks for one of those, the non-streaming path falls through to `throw new Error('Gemini returned empty response')` (L197) and the streaming path simply yields zero text chunks. Neither is a SafetyFilterError, so the router (services/llm/router.ts) classifies them via isTransientError() as transient (no HTTP status, not a SafetyFilterError, not a validation error => returns true). Consequence: routeAndCall retries up to 4x and then getFallbackConfig() routes the identical prompt to OpenAI/Anthropic; routeAndStream treats the zero-chunk completion as a pre-first-byte failure (wrapStreamWithCircuitBreaker, chunksYielded === 0) and likewise fails over. A learner whose input is blocked by Gemini for a non-'SAFETY' policy bucket therefore gets a second attempt on a provider with different (and for Anthropic, no explicit) content-block handling, weakening the safety guarantee the app is built around. Independent of the safety angle this is also a clean efficiency bug: a deterministically-blocked request consumes the full retry budget plus a paid fallback call. NOTE: confidence is low for the safety-bypass impact because OpenAI's content_filter and Anthropic's own moderation partially mitigate, and the Gemini block taxonomy is provider-internal and not reliably attacker-steerable; the retry/fallback waste is high-confidence.

## Recommendation

Treat all terminal block reasons as safety blocks, not just 'SAFETY'. Map promptFeedback.blockReason ∈ {SAFETY, PROHIBITED_CONTENT, BLOCKLIST, SPII} and candidates[0].finishReason ∈ {SAFETY, PROHIBITED_CONTENT, BLOCKLIST, SPII, RECITATION} to SafetyFilterError in both extractResponseText() and the streaming parser. Because SafetyFilterError is already excluded from transient/fallback handling (isSafetyPolicyError in router.ts), this both preserves the safety decision (no silent failover to another provider) and stops the wasted retry+fallback on deterministically-blocked prompts. Keep a generic empty-response error only for the genuinely-empty case where no block reason is present.

## Revalidation

**Verdict:** true-positive

Live in current code and distinct from Finding 1 (which concerns SafetyFilterError already being terminal; this concerns blocks that never BECOME a SafetyFilterError). extractResponseText raises SafetyFilterError only for promptFeedback.blockReason === 'SAFETY' (line 175) or candidates[0].finishReason === 'SAFETY' (line 182), and the streaming parser only for the same literal (lines 296, 301). For Gemini's other terminal block buckets — PROHIBITED_CONTENT, BLOCKLIST, SPII, RECITATION — the response is HTTP 200 with no text and no `data.error`, so the non-streaming path falls through to `throw new Error('Gemini returned empty response')` (line 197) and the streaming path simply yields zero chunks. I traced the router classification of that generic Error: isSafetyPolicyError → false (name 'Error', no markers, no cause), findHttpStatus → undefined (createProviderHttpError is only used for non-2xx HTTP, not for 200-with-block), isValidationPolicyError → false ⇒ isTransientError returns true. Consequently routeAndCall retries up to 4x and then getFallbackConfig routes the identical prompt to OpenAI/Anthropic, and routeAndStream's wrapStreamWithCircuitBreaker treats chunksYielded===0 as a pre-first-byte failure and fails over (router.ts:1108). The commit on this file (7df790bf9) only added HTTP-status preservation for 4xx transport errors and did not touch the block-reason mapping, so the gap remains. The retry-budget + paid-fallback waste on a deterministically-blocked request is high-confidence and clearly real; the safety-bypass impact is genuine for a minors-only app (Gemini's stricter minor-safety block gets a second attempt on a provider with weaker/absent explicit blocking) but is partially mitigated by OpenAI/Anthropic's own moderation and is not reliably attacker-steerable (the block taxonomy is provider-internal) — consistent with the finding's own low-confidence safety caveat. Mechanism verified; MEDIUM is appropriate.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-29)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-29)
