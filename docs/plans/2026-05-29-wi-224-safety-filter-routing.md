---
title: WI-224 Safety Filter Routing — Implementation Plan
date: 2026-05-29
profile: code
work_items: [WI-224]
spec: ZDX WI-224
status: in-progress
---

# WI-224 Safety Filter Routing — Implementation Plan

**Goal:** Provider safety/content-filter blocks are terminal policy decisions, not transient outages, so the LLM router must not retry, fail over, or trip provider circuits for them.
**Approach:** Add router-level safety-block classification around the existing shared `SafetyFilterError`, then gate retry, circuit failure recording, and fallback on transient classification. Preserve existing 429/5xx/network retry and fallback behavior.

## Scope

In scope:
- `apps/api/src/services/llm/router.ts` — retry/fallback/circuit classification.
- `apps/api/src/services/llm/router.test.ts` — red/green regression coverage.
- `docs/plans/2026-05-29-wi-224-safety-filter-routing.md` — execution plan.

Out of scope:
- Provider prompt text or safety policy copy.
- Gemini request payloads and provider safety settings.
- LLM eval snapshots, unless prompt files are unexpectedly changed.
- Route-level user-facing error formatting.

## Surface Map

- `apps/api/src/services/llm/router.ts`: import `SafetyFilterError`; add an explicit helper such as `isSafetyPolicyError(err)`; make `withRetry` stop before scheduling retries for non-transient errors; make non-streaming primary and fallback paths rethrow non-transient failures before fallback; make streaming fallback only happen for transient pre-first-byte failures.
- `apps/api/src/services/llm/router.test.ts`: add provider doubles that throw `SafetyFilterError` from `chat()` and `chatStream()`; assert call counts, no fallback calls, rejected safety error, and no circuit-open side effects. Keep positive transient tests green.

## Tasks

- [x] T1: Non-stream prompt-level safety block regression — done when: a new `router.test.ts` test using a primary Gemini double that throws `SafetyFilterError` from `chat()` fails red because current code retries/falls back, then passes with exactly one primary call, zero fallback calls, and the original safety error rejected.
- [x] T2: Non-stream candidate/output safety block regression — done when: a second `router.test.ts` test using a distinct `SafetyFilterError` message fails red for the same retry/fallback reason, then passes with one primary call and no fallback.
- [x] T3: Fallback-provider safety block regression — done when: a transient primary failure reaches fallback, the fallback throws `SafetyFilterError`, and the test fails red because current fallback retry/circuit behavior treats it as transient; green requires one fallback call, safety rejection, and a later normal fallback call proving its circuit was not opened.
- [x] T4: Streaming pre-first-byte safety block regression — done when: a `chatStream()` primary that throws `SafetyFilterError` before yielding fails red because current code falls back, then passes with no fallback chunks/calls and the safety error surfaced.
- [x] T5: Keep transient behavior intact — done when: existing retry/fallback tests for statusless `Error`, 429/5xx style failures, and stream fallback still pass after the safety guard is added.
- [x] T6: Local verification — done when: focused router tests pass, `pnpm exec nx run api:lint` passes, and `pnpm exec nx run api:typecheck` passes.
