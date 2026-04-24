# LLM Never-Truncate Implementation Plan [LLM-TRUNCATE-01]

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive envelope-wrapped LLM responses to structural completeness without regressing the live-token streaming UX. The previous version of this plan globally replaced incremental streaming with server-side buffering + fake pacing; this revision preserves incremental streaming as the happy path and only buffers-and-retries when the envelope actually fails to parse.

## Revised design principles

1. **Measure before mitigating.** Phase 1 ships instrumentation only. We will not build retry/buffer machinery until the collected `stop_reason=length` rate justifies the cost. If length-rate is <0.5% after 1 week in staging + prod, we stop at Phase 1.
2. **Preserve live-token streaming.** `teeEnvelopeStream` / `streamEnvelopeReply` stay. They are the reason envelope replies can stream at all. Any retry/buffer path is a *fallback* triggered only when the in-stream envelope parse fails at end-of-stream.
3. **Retry only on parse failure, never on `stopReason=length` alone.** A well-formed envelope whose stop reason is `length` (the LLM happened to hit max_tokens on trailing whitespace) is a successful response; retrying wastes latency + spend and yields a worse answer under brevity boost.
4. **Honest goal statement.** We cannot *guarantee* a complete envelope — after retries exhausted, the user sees a typed error state (the one the existing route already emits on onComplete failure). The goal is to minimize both truncated replies and retry-exhaustion errors, not eliminate either in the limit.
5. **Feature-flag every behavioural change.** Brevity prompt addendum and retry orchestrator are behind a config flag so we can roll back without a code deploy.
6. **No product copy changes without eval sign-off.** Brevity clauses run through `pnpm eval:llm --live` across all 5 fixture profiles before they ship. A reply-quality baseline is captured before and compared after.

**Tech Stack:** Cloudflare Workers + Hono (API), Zod schemas (`@eduagent/schemas`), Drizzle ORM, Vitest/Jest, Anthropic/Gemini/OpenAI providers.

**Finding ID for commits:** `[LLM-TRUNCATE-01]`

---

## Phases at a glance

| Phase | Outcome | Ships independently? | Go/no-go for next phase |
|---|---|---|---|
| **Phase 1 — Observe** (Tasks 1–5) | StopReason captured, normalized, logged, surfaced as a metric. Zero behavioural change. | Yes — ship on its own. | Collect 7 days staging + prod. If `length`-rate <0.5% → **STOP**. Raise `maxTokens` (Task 5b) and close the finding. |
| **Phase 2 — Preventive brevity** (Tasks 6–8) | Soft brevity clause in system prompts, eval harness proves no quality regression. | Yes — ship after Phase 1 gate. | Re-measure `length`-rate after 1 week. If <0.3% → **STOP**. |
| **Phase 3 — Hardened parsing + end-of-stream retry** (Tasks 9–14) | Envelope parse failures at stream end trigger a single retry via a *fallback* orchestrator. Live-token streaming remains the happy path. | Gated behind feature flag; dark-launch in staging. | Decision to enable flag is data-driven. |
| **Phase 4 — Cleanup + break tests** (Tasks 15–16) | Real-provider break test; documentation; remove any truly dead branches identified by Phase 3 instrumentation. | Final. | — |

Each phase is its own PR. Do not merge phase N+1 before phase N's gate is cleared.

---

## File Structure

### Created (new files, Phase 1+)

- `apps/api/src/services/llm/stop-reason.ts` — shared `StopReason` type + normalization across providers (Phase 1)
- `apps/api/src/services/llm/stop-reason.test.ts` (Phase 1)
- `apps/api/src/services/llm/with-complete-envelope.ts` — orchestrator: parse → single retry on failure only (Phase 3)
- `apps/api/src/services/llm/with-complete-envelope.test.ts` (Phase 3)
- `apps/api/src/services/llm/truncation-flag.ts` — feature-flag accessor (Phase 3)
- `apps/api/src/services/llm/truncation-break.test.ts` — real-provider break test (Phase 4, gated by `EVAL_LIVE=1`)

### Modified

| File | Phase | Change |
|---|---|---|
| `apps/api/src/services/llm/providers/anthropic.ts` | 1 | Capture `message_delta.delta.stop_reason`; add to return types |
| `apps/api/src/services/llm/providers/gemini.ts` | 1 | Capture `candidates[0].finishReason` |
| `apps/api/src/services/llm/providers/openai.ts` | 1 | Capture `choices[0].finish_reason` |
| `apps/api/src/services/llm/providers/mock.ts` | 1 | Accept configurable `stopReason` for test harness |
| `apps/api/src/services/llm/types.ts` | 1 | Extend `LLMProvider.chat`/`chatStream` return shapes |
| `apps/api/src/services/llm/router.ts` | 1 | Propagate `stopReason`; emit `llm.stop_reason` metric per call |
| `apps/api/src/services/llm/envelope.ts` | 3 | Export `EnvelopeTruncationError` (fallback path only — `parseEnvelope` behaviour unchanged) |
| `apps/api/src/services/exchanges.ts` | 2, 3 | Phase 2: brevity clause behind flag. Phase 3: onComplete parse-failure wraps with orchestrator retry |
| `apps/api/src/services/interview.ts` | 2, 3 | Same pattern; also covers `extractSignals` (no flow left behind) |
| `apps/api/src/services/session/session-exchange.ts` | 3 | `onComplete` calls orchestrator *only* when `parseExchangeEnvelope` fails |
| `apps/api/eval-llm/` (harness) | 2, 4 | Phase 2: reply-quality baseline capture. Phase 4: structural-completeness assert on `--live` |

### Not modified (explicitly preserved)

| File | Why |
|---|---|
| `apps/api/src/services/llm/stream-envelope.ts` (`teeEnvelopeStream`, `streamEnvelopeReply`) | This is the live-token streaming path. It is the happy-path UX. Do not delete, do not bypass. The previous plan's proposal to replace it with `syntheticStream` is explicitly rejected. |

---

# Phase 1 — Observe

**Purpose:** Learn whether this problem is real at our current `maxTokens` budgets (4096 rung ≤2, 8192 rung 3). Cost: ~1 day of work. Ships immediately. Zero UX change.

## Task 1 — Shared StopReason Type

**Files:** Create `apps/api/src/services/llm/stop-reason.ts` + `stop-reason.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeStopReason } from './stop-reason';

describe('normalizeStopReason', () => {
  it('maps anthropic "max_tokens" to "length"', () => {
    expect(normalizeStopReason('anthropic', 'max_tokens')).toBe('length');
  });
  it('maps openai "length" to "length"', () => {
    expect(normalizeStopReason('openai', 'length')).toBe('length');
  });
  it('maps gemini "MAX_TOKENS" to "length"', () => {
    expect(normalizeStopReason('gemini', 'MAX_TOKENS')).toBe('length');
  });
  it('maps anthropic "end_turn" to "stop"', () => {
    expect(normalizeStopReason('anthropic', 'end_turn')).toBe('stop');
  });
  it('returns "unknown" for undefined', () => {
    expect(normalizeStopReason('openai', undefined)).toBe('unknown');
  });
});
```

- [ ] **Step 2: Implement**

```ts
export type StopReason =
  | 'stop'
  | 'length'
  | 'filter'
  | 'tool_use'
  | 'unknown';

export function normalizeStopReason(
  provider: 'anthropic' | 'openai' | 'gemini',
  raw: string | undefined | null
): StopReason {
  if (!raw) return 'unknown';
  const v = String(raw);
  if (provider === 'anthropic') {
    if (v === 'max_tokens') return 'length';
    if (v === 'end_turn' || v === 'stop_sequence') return 'stop';
    if (v === 'tool_use') return 'tool_use';
    return 'unknown';
  }
  if (provider === 'openai') {
    if (v === 'length') return 'length';
    if (v === 'stop') return 'stop';
    if (v === 'content_filter') return 'filter';
    if (v === 'tool_calls' || v === 'function_call') return 'tool_use';
    return 'unknown';
  }
  const up = v.toUpperCase();
  if (up === 'MAX_TOKENS') return 'length';
  if (up === 'STOP') return 'stop';
  if (up === 'SAFETY' || up === 'RECITATION') return 'filter';
  return 'unknown';
}
```

- [ ] **Step 3: Verify pass, commit.**

Commit: `feat(api): add StopReason normalization across providers [LLM-TRUNCATE-01]`

---

## Task 2 — Interface change: `LLMProvider` returns `stopReason`

**Files:** `apps/api/src/services/llm/types.ts` + all three providers + `mock.ts` + every test that constructs a provider.

- [ ] **Step 1: Blast-radius audit**

```bash
grep -rn "\.chat(" apps/api/src | grep -v '\.test\.' > /tmp/chat-callers.txt
grep -rn "\.chatStream(" apps/api/src | grep -v '\.test\.' > /tmp/stream-callers.txt
grep -rn "implements LLMProvider\|: LLMProvider" apps/api/src > /tmp/provider-impls.txt
```

Attach the file contents to the commit PR description. Every caller listed must be updated in this task. If the list exceeds 12 callers, split Task 2 into 2a/2b by caller.

- [ ] **Step 2: Update types**

```ts
// types.ts
import type { StopReason } from './stop-reason';

export interface ChatResult {
  content: string;
  stopReason: StopReason;
}

export interface ChatStreamResult {
  stream: AsyncIterable<string>;
  stopReasonPromise: Promise<StopReason>;
}

export interface LLMProvider {
  id: string;
  chat(messages: ChatMessage[], config: ModelConfig): Promise<ChatResult>;
  chatStream(messages: ChatMessage[], config: ModelConfig): ChatStreamResult;
}
```

- [ ] **Step 3: Update each provider**

For each of anthropic/gemini/openai:
- Non-streaming `chat`: pluck provider-native stop field, return `{ content, stopReason: normalize(...) }`.
- Streaming `chatStream`: change signature from `async *` to a regular function returning `ChatStreamResult`. Internal generator captures the raw stop field and resolves `stopReasonPromise` in a `finally` block so it settles on both normal drain *and* error.

Mock provider accepts `stopReason?: StopReason` in its config and defaults to `'stop'`.

- [ ] **Step 4: Update `router.ts`** — `RouteResult` gains `stopReason: StopReason`; `StreamResult` gains `stopReasonPromise: Promise<StopReason>`. Fallback-chain code returns the stopReason of whichever provider ultimately succeeded.

- [ ] **Step 5: Update all callers from Step 1 blast-radius list.** No TypeScript errors allowed through.

- [ ] **Step 6: Provider SSE tests — real bytes, not mocks of our own parser**

For each provider, add a test that replays a known-good raw SSE byte sequence captured from the real provider (Anthropic/Gemini/OpenAI docs include these). Assert `stopReasonPromise` resolves correctly. This catches provider-format regressions the previous plan's parser-internal mocks would miss.

- [ ] **Step 7: `pnpm exec nx run api:typecheck && pnpm exec nx run api:test`, commit.**

Commit: `feat(api): providers + router expose stopReason [LLM-TRUNCATE-01]`

---

## Task 3 — Metric emission

**Files:** Modify `router.ts` + `session-exchange.ts` + `interview.ts` wherever the LLM response is consumed.

- [ ] **Step 1:** In `router.ts` `routeAndCall` / `routeAndStream`, log one structured line per call after the stop reason is known:

```ts
logger.info('llm.stop_reason', {
  provider, model, rung, stop_reason: stopReason,
  flow: opts.flow, // passed in by caller
  session_id: opts.sessionId,
  response_chars: response.length, // only for chat(); streaming logs at drain
});
```

- [ ] **Step 2:** Confirm this lands in the existing observability pipeline. Ask the user to confirm the log field names match the dashboard query they want (do not guess).

- [ ] **Step 3:** Add a dashboard query spec to `docs/plans/2026-04-23-llm-never-truncate.md` (this file) in an appendix: "Query: `count by stop_reason, flow over 24h`". We need this before Phase 1 gate review.

- [ ] **Step 4: Commit.**

Commit: `feat(api): emit llm.stop_reason metric per call [LLM-TRUNCATE-01]`

---

## Task 4 — Phase 1 gate (not code — a decision point)

- [ ] Ship Tasks 1–3 to staging.
- [ ] After 7 days staging + 7 days prod, collect `stop_reason=length` rate per flow (exchange, interview, extractSignals, dictation, quiz, etc.).
- [ ] Decision:
  - `length`-rate **<0.5%** across all flows → **STOP HERE.** Raise maxTokens one tier (Task 5) and close the finding. Phases 2–4 not needed.
  - `length`-rate **0.5–2%** → continue with Phase 2 only. Re-measure. If Phase 2 drops it below 0.5%, stop.
  - `length`-rate **>2%** → continue with Phase 2 and Phase 3.

Record the measurement + decision in this plan file before opening the Phase 2 PR.

---

## Task 5 — maxTokens adjustment (cheap knob)

**Files:** `apps/api/src/services/llm/router.ts`

- [ ] **Step 1:** If Phase 1 data shows any specific flow with `length`-rate >0.5%, raise that rung's `maxTokens` by one step (4096 → 6144, 8192 → 12288) rather than globally. Flow-specific limits already thread through `ModelConfig` — add a per-flow override map.

- [ ] **Step 2:** Re-run eval harness to confirm no quality regression.

- [ ] **Step 3:** Commit.

Commit: `tune(api): raise maxTokens for flows with elevated length-rate [LLM-TRUNCATE-01]`

---

# Phase 2 — Preventive brevity (conditional on Phase 1 gate)

**Purpose:** Reduce truncation probability at the source by gently nudging the LLM to be concise. **This is a product copy change.** It will not ship without eval-harness proof that reply quality does not regress.

## Task 6 — Brevity addendum behind a feature flag

**Files:** `apps/api/src/services/exchanges.ts`, `apps/api/src/services/interview.ts`, new `apps/api/src/services/llm/truncation-flag.ts`

- [ ] **Step 1: Add flag helper**

```ts
// truncation-flag.ts
import type { AppConfig } from '../../config';
export function brevityEnabled(config: AppConfig): boolean {
  return config.flags?.LLM_BREVITY_ENABLED === true;
}
export function orchestratorEnabled(config: AppConfig): boolean {
  return config.flags?.LLM_TRUNCATION_ORCHESTRATOR_ENABLED === true;
}
```

Flags default to `false`. They come from Doppler (per project rule: all secrets/flags via Doppler).

- [ ] **Step 2: Add soft brevity clause**

Important: this is intentionally softer than the rejected earlier draft (no "MUST be under 100 words" cap, no punitive "IMPORTANT: your previous attempt ran too long" boost). The goal is a gentle preference, not a hard ceiling — the product owner has not signed off on a hard word-count cap.

```ts
const BREVITY_CLAUSE = `\n\nStyle: prefer concise replies. Answer the user's question directly; add depth only when the question requires it. Long explanations should be broken into a short lead plus an offer to go deeper.`;

function _buildSystemPrompt(context: ExchangeContext, opts?: { brevity?: boolean }): string {
  const base = /* existing assembly */;
  return opts?.brevity ? `${base}${BREVITY_CLAUSE}` : base;
}
```

Callers pass `brevity: brevityEnabled(config)`.

- [ ] **Step 3: Eval harness quality baseline**

Before toggling the flag on anywhere, run `pnpm eval:llm --live` with the flag off and capture fixture outputs as a baseline. Run again with the flag on. Compare qualitatively (snapshot diff) across all 5 fixture profiles. If any reply becomes noticeably shallow or misses information the baseline included, stop and redesign the clause wording.

Attach the before/after comparison to the PR description.

- [ ] **Step 4: Unit test** — prompt includes `BREVITY_CLAUSE` when flag on, excludes when off.

- [ ] **Step 5: Commit behind flag OFF.** Enable in staging via Doppler; observe for 1 week; enable in prod only after staging data looks clean.

Commit: `feat(api): gated brevity clause in system prompts [LLM-TRUNCATE-01]`

---

## Task 7 — Re-measure

- [ ] After Phase 2 has been enabled in prod for 7 days, pull `stop_reason=length` rate again.
- [ ] If rate <0.3% across all flows → **STOP.** Phase 3 not needed.
- [ ] Otherwise continue.

---

## Task 8 — Interview-specific brevity (if Phase 2 continues)

Interview flows have tighter natural length (they ask one short question at a time). The brevity clause for `interview.ts` uses a different wording emphasizing "ask one question, wait for answer":

```ts
const INTERVIEW_BREVITY = `\n\nAsk one short question at a time. Wait for the learner's answer before asking the next.`;
```

Same flag, same eval-harness gate. Commit separately.

Commit: `feat(api): interview-specific brevity clause [LLM-TRUNCATE-01]`

---

# Phase 3 — Hardened parsing + fallback retry (conditional)

**Purpose:** When `parseEnvelope` fails at end-of-stream (the user got a live-streamed reply that turned out to be malformed JSON), fall back to a single non-streaming retry. This path is only entered on parse failure — NOT on `stopReason=length` when the envelope parsed cleanly. The happy path (live token stream + successful parse at close) is unchanged.

## Task 9 — `EnvelopeTruncationError` (typed error at boundaries)

**Files:** `apps/api/src/services/llm/envelope.ts` + tests

- [ ] **Step 1: Add error class only (no change to `parseEnvelope` return contract)**

```ts
export class EnvelopeTruncationError extends Error {
  constructor(
    public raw: string,
    public reason: ParseEnvelopeFailureReason,
    public stopReason: string
  ) {
    super(`Envelope parse failed after retry: ${reason} (stop=${stopReason})`);
    this.name = 'EnvelopeTruncationError';
  }
}
```

Note: the rejected earlier plan also added an `isStructurallyIncomplete` brace-counter. It is not added here — `parseEnvelope` already via `extractFirstJsonObject + JSON.parse + zod` detects structural incompleteness correctly. A second brace counter would duplicate logic and diverge over time.

- [ ] **Step 2: Test the error class.** No behavioural change yet.

- [ ] **Step 3: Commit.**

Commit: `feat(api): add EnvelopeTruncationError typed error [LLM-TRUNCATE-01]`

---

## Task 10 — Fallback orchestrator (non-streaming only, parse-failure-only trigger)

**Files:** Create `apps/api/src/services/llm/with-complete-envelope.ts` + tests

Key contract differences from the rejected draft:
- **Single retry** (total attempts = 2). Beyond that is pure cost spiral.
- **Trigger is `!parsed.ok` only.** `stopReason=length` with `parsed.ok === true` is a success, not a retry trigger. We log the length signal as a metric but do not act on it.
- **Retry reuses the same prompt** — no punitive "you truncated last time" addendum. We already have a brevity clause (Phase 2); the retry just asks again. Empirically, LLMs drift on retry anyway; adding a punitive prompt adds variance without reliability gain.
- **No streaming variant.** The orchestrator is a fallback called *after* the live stream fails to parse at close. The live stream (via `teeEnvelopeStream`) stays the happy path.

```ts
import { parseEnvelope, EnvelopeTruncationError } from './envelope';
import type { LlmResponseEnvelope } from '@eduagent/schemas';
import type { StopReason } from './stop-reason';

export interface LlmCallOutput {
  response: string;
  stopReason: StopReason;
}
export type LlmCaller = () => Promise<LlmCallOutput>;

export interface CallWithCompleteEnvelopeOptions {
  flow?: string;
  sessionId?: string;
  profileId?: string;
}

export interface CallWithCompleteEnvelopeResult {
  envelope: LlmResponseEnvelope;
  rawResponse: string;
  attempts: number;
}

export async function callWithCompleteEnvelope(
  call: LlmCaller,
  opts: CallWithCompleteEnvelopeOptions = {}
): Promise<CallWithCompleteEnvelopeResult> {
  const MAX_ATTEMPTS = 2;
  let last: LlmCallOutput | null = null;
  let lastReason: ParseEnvelopeFailureReason = 'no_json_found';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await call();
    const parsed = parseEnvelope(last.response);
    if (parsed.ok) {
      if (attempt > 1) {
        logger.info('envelope.retry_succeeded', {
          flow: opts.flow, session_id: opts.sessionId, attempts: attempt,
        });
      }
      return { envelope: parsed.envelope, rawResponse: last.response, attempts: attempt };
    }
    lastReason = parsed.reason;
    logger.warn('envelope.parse_failed', {
      flow: opts.flow, session_id: opts.sessionId,
      attempt, reason: parsed.reason, stop_reason: last.stopReason,
      raw_len: last.response.length,
    });
  }

  throw new EnvelopeTruncationError(last!.response, lastReason, last!.stopReason);
}
```

- [ ] **Tests: 3 scenarios**

```ts
it('returns envelope on first attempt when parse succeeds (even if stopReason=length)', async () => {
  const call = vi.fn().mockResolvedValue({
    response: '{"reply":"hi","signals":{}}', stopReason: 'length',
  });
  const res = await callWithCompleteEnvelope(call);
  expect(res.attempts).toBe(1);
  expect(call).toHaveBeenCalledTimes(1); // ← key: length alone does NOT trigger retry
});

it('retries once on parse failure and returns envelope', async () => {
  const call = vi.fn()
    .mockResolvedValueOnce({ response: '{"reply":"trunc', stopReason: 'length' })
    .mockResolvedValueOnce({ response: '{"reply":"ok","signals":{}}', stopReason: 'stop' });
  const res = await callWithCompleteEnvelope(call);
  expect(res.envelope.reply).toBe('ok');
  expect(res.attempts).toBe(2);
});

it('throws EnvelopeTruncationError after exhausted retry', async () => {
  const call = vi.fn().mockResolvedValue({ response: '{"reply":"bad', stopReason: 'length' });
  await expect(callWithCompleteEnvelope(call)).rejects.toThrow(EnvelopeTruncationError);
  expect(call).toHaveBeenCalledTimes(2);
});
```

- [ ] **Commit.**

Commit: `feat(api): add callWithCompleteEnvelope fallback orchestrator [LLM-TRUNCATE-01]`

---

## Task 11 — Wire orchestrator into non-streaming `processExchange` (flag-gated)

**Files:** `apps/api/src/services/exchanges.ts`

- [ ] **Step 1:** When `parseExchangeEnvelope(result.response, ...)` returns a failure and `orchestratorEnabled(config)` is true, re-invoke the LLM through `callWithCompleteEnvelope`. Otherwise, fall through to existing behaviour (preserves rollback path).

- [ ] **Step 2:** `parseExchangeEnvelope` itself is **not** changed to throw. It keeps its `{ok:false}` failure shape — the orchestrator wraps it. This is a rollback safety property: if the flag flips off, behaviour reverts to exactly today's code path.

- [ ] **Step 3:** Tests cover both flag on and flag off.

- [ ] **Step 4:** Commit.

Commit: `feat(api): processExchange fallback retry on envelope parse failure [LLM-TRUNCATE-01]`

---

## Task 12 — Streaming `streamMessage` / `streamExchange` — parse-failure-only fallback

**Files:** `apps/api/src/services/session/session-exchange.ts`, `apps/api/src/services/exchanges.ts`

**This is where the previous plan went wrong. Re-read before touching.**

The current flow:
1. `teeEnvelopeStream(source)` returns `{ cleanReplyStream, rawResponsePromise }`.
2. Mobile SSE consumer drains `cleanReplyStream` (live token display).
3. `onComplete` awaits `rawResponsePromise`, calls `parseExchangeEnvelope(raw)`, extracts signals.

We keep 1–3 exactly as-is. We only change what happens when step 3's `parseExchangeEnvelope` fails:

- [ ] **Step 1:** In `onComplete`, when parse fails AND `orchestratorEnabled(config)` is true:
  - Log `envelope.stream_parse_failed` with stopReason + raw length.
  - Call `callWithCompleteEnvelope(() => routeAndCall(...))` to get a complete envelope via a *non-streaming* retry.
  - Use the resulting envelope for signal extraction + DB persistence.
  - Do **not** re-emit the reply to the client — they already saw the live-streamed (possibly malformed) text. Re-emitting would cause a visible flicker / duplicate message.

  The user-visible outcome: they saw the live-streamed reply; signals + persistence happened correctly off the retry. This is a conscious tradeoff — the reply text they saw may be malformed/truncated, but the server state is consistent, and the frequency should be <0.5% after Phase 2.

- [ ] **Step 2:** When parse fails AND flag is off: existing behaviour (silent fallback with default signals). This is explicitly the rollback target — it is the known-safe state we ship today.

- [ ] **Step 3:** Tests:
  - Parse-success path: no retry call, envelope used as today.
  - Parse-failure + flag on: orchestrator invoked, signals come from retried envelope.
  - Parse-failure + flag off: current behaviour preserved.

- [ ] **Step 4:** Commit.

Commit: `feat(api): stream onComplete falls back to orchestrator on parse failure [LLM-TRUNCATE-01]`

---

## Task 13 — Interview parity (incl. `extractSignals`)

**Files:** `apps/api/src/services/interview.ts`

Scope note: the rejected draft left `extractSignals` as a TODO. This plan does not. If the orchestrator is worth having for interviews, it is worth having for *every* parse boundary in interviews. Consistency matters for both correctness reasoning and test coverage.

- [ ] **Step 1:** `processInterviewExchange` (non-streaming) wraps its `parseEnvelope`-failure branch with the orchestrator, same pattern as Task 11.
- [ ] **Step 2:** `streamInterviewExchange` (streaming) wraps its `parseEnvelope`-failure branch in `onComplete`, same pattern as Task 12.
- [ ] **Step 3:** `extractSignals` wraps its parse-failure branch in the orchestrator. If the existing failure path is "return empty signals", that remains the flag-off path.
- [ ] **Step 4:** Tests + commit.

Commit: `feat(api): interview flows (incl. extractSignals) use orchestrator on parse failure [LLM-TRUNCATE-01]`

---

## Task 14 — Feature-flag staging bake

- [ ] Enable `LLM_TRUNCATION_ORCHESTRATOR_ENABLED=true` in staging via Doppler.
- [ ] Observe for 7 days:
  - `envelope.parse_failed` rate per flow
  - `envelope.retry_succeeded` rate (measures orchestrator effectiveness)
  - `EnvelopeTruncationError` rate (measures retry-exhaustion)
  - p95 latency for the non-streaming flows (retry adds latency in the failure case only)
- [ ] If retry-succeeded rate > retry-exhausted rate by ≥10×, enable in prod. Otherwise, investigate.

---

# Phase 4 — Cleanup

## Task 15 — Real-provider break test

**Files:** Create `apps/api/src/services/llm/truncation-break.test.ts`. Gate with `process.env.EVAL_LIVE === '1'` so CI does not hit real providers by default.

The rejected draft's break test mocked the provider. That proves our plumbing works but does not prove the actual Anthropic/OpenAI/Gemini SSE parser captures `stop_reason` at the right stream position in the real byte sequence.

- [ ] **Step 1:** Test constructs a real Anthropic call with `maxTokens: 50` against a prompt known to produce a long reply.
- [ ] **Step 2:** Asserts `stopReasonPromise` resolves to `'length'`.
- [ ] **Step 3:** Asserts `callWithCompleteEnvelope` around this call throws `EnvelopeTruncationError` (because 50 tokens cannot hold the full envelope for the given prompt).
- [ ] **Step 4:** Same for OpenAI + Gemini, guarded by provider API keys being present.
- [ ] **Step 5:** Document how to run: `EVAL_LIVE=1 C:/Tools/doppler/doppler.exe run -c stg -- pnpm exec jest src/services/llm/truncation-break.test.ts`.

Commit: `test(api): real-provider break test for LLM truncation detection [LLM-TRUNCATE-01]`

---

## Task 16 — Eval harness structural completeness check

**Files:** `apps/api/eval-llm/*`

- [ ] Add a post-run assertion to the `--live` path: for every fixture whose flow uses the envelope, the final response parses. Any `EnvelopeTruncationError` fails the eval with the fixture name.
- [ ] Run `pnpm eval:llm --live` with the flag on + off to confirm behaviour.

Commit: `test(api): eval harness asserts envelope structural completeness [LLM-TRUNCATE-01]`

---

## Task 17 — Full validation (end of Phase 4)

- [ ] `pnpm exec nx run api:lint`
- [ ] `pnpm exec nx run api:typecheck`
- [ ] `pnpm exec nx run api:test`
- [ ] Integration: `pnpm exec jest --selectProjects api --testPathPattern integration`
- [ ] Eval harness: `pnpm eval:llm --live`
- [ ] Manual smoke in staging: with flag on, send a prompt known to produce a long reply; verify live-token streaming still works and signals are captured.

---

## Verified-By Matrix (per global CLAUDE.md Fix Verification Rules)

| Defense | Task | Verified By |
|---|---|---|
| Stop reason detection across providers | 1, 2 | `test: stop-reason.test.ts:"normalizeStopReason"` + `test: providers/{anthropic,gemini,openai}.test.ts:"stopReasonPromise resolves to 'length' from real SSE bytes"` |
| Metric emission | 3 | `manual: dashboard query returns non-empty series for llm.stop_reason in staging after 24h` |
| Phase 1 gate | 4 | `manual: 7-day observation window + recorded decision in plan file` |
| maxTokens adjustment | 5 | `test: router.test.ts:"per-flow maxTokens overrides applied"` + eval harness quality diff |
| Brevity prompt no-regression | 6 | `manual: before/after eval-harness --live snapshot diff attached to PR` |
| Phase 2 re-measurement | 7 | `manual: 7-day observation + recorded decision` |
| Interview brevity | 8 | `test: interview.test.ts:"brevity clause present when flag on"` + eval diff |
| Typed error | 9 | `test: envelope.test.ts:"EnvelopeTruncationError carries raw + stopReason"` |
| Orchestrator: length alone does not retry | 10 | `test: with-complete-envelope.test.ts:"returns envelope on first attempt when stopReason=length"` |
| Orchestrator: parse-failure retries once | 10 | `test: with-complete-envelope.test.ts:"retries once on parse failure"` |
| Orchestrator: exhaustion throws | 10 | `test: with-complete-envelope.test.ts:"throws EnvelopeTruncationError after exhausted retry"` |
| processExchange fallback | 11 | `test: exchanges.test.ts:"orchestrator invoked when parse fails and flag on"` + `test: exchanges.test.ts:"existing behaviour preserved when flag off"` |
| streamMessage fallback | 12 | `test: session-exchange.test.ts:"stream onComplete uses orchestrator on parse failure"` + `test: session-exchange.test.ts:"live-token stream unchanged on parse success"` |
| Interview parity (incl. extractSignals) | 13 | `test: interview.test.ts:"extractSignals uses orchestrator on parse failure"` |
| Staging bake | 14 | `manual: 7-day staging observation with recorded retry_succeeded vs EnvelopeTruncationError rates` |
| Real-provider break test | 15 | `test: truncation-break.test.ts:"Anthropic SSE reports stop_reason=length at maxTokens:50"` (EVAL_LIVE gated) |
| Eval harness guard | 16 | `test: eval-llm --live (CI-run on Phase 2/3 PRs)` |

Any row whose Verified-By cell lists a test must have that test in code before the corresponding task's commit.

---

## Commit message tagging

Every commit in every phase carries `[LLM-TRUNCATE-01]` so `git log --grep='LLM-TRUNCATE-01'` reconstructs the full change set.

---

## Rollback plan (per global CLAUDE.md Fix Verification Rules)

This is structured so rollback is trivial at every stage:

| Change | Rollback |
|---|---|
| Phase 1 interface changes | Not easily reversible (type-level). But behavioural impact is zero — safe to keep even if Phases 2–4 are abandoned. |
| Phase 2 brevity clause | Set `LLM_BREVITY_ENABLED=false` in Doppler. No code deploy. |
| Phase 3 orchestrator | Set `LLM_TRUNCATION_ORCHESTRATOR_ENABLED=false` in Doppler. Behaviour returns to exact current state (silent fallback signals) because `parseExchangeEnvelope` / `interpretInterviewResponse` keep their current `{ok:false}` shape. |
| Phase 4 break tests | Non-production code; no rollback needed. |

Rollback is not possible for: nothing. All behavioural changes are flag-gated.

---

## Out of scope (deliberately)

- **Replacing `teeEnvelopeStream` / `streamEnvelopeReply` with server-side buffering + synthetic streaming.** Rejected: would convert time-to-first-token from ~500 ms to full-generation latency for 100% of requests in order to defend against a <1% edge case. Live-token streaming stays.
- **Retrying when `stopReason=length` but envelope parsed cleanly.** Pure cost/latency waste; no correctness gain.
- **Anthropic "continue generation from partial" as a recovery mechanism.** Technically supported by the provider but requires significant new plumbing. Revisit only if Phase 2+3 retry rate is unacceptable.
- **Hard word-count cap in the brevity prompt** (e.g., "MUST be under 100 words"). Rejected as a unilateral product-copy change; soft preference only, gated by eval.
- **Punitive retry prompt** ("your last attempt ran too long — MUST be under 50 words"). Rejected: worsens the retry reply to solve a problem that may not have been length in the first place.

---

## Appendix A — Dashboard query specs (populate in Task 3)

```
# Staging + prod dashboard — add after Task 3 lands
Q1: count(llm.stop_reason) by stop_reason, flow, bucket(24h)
Q2: rate(llm.stop_reason{stop_reason="length"}) / rate(llm.stop_reason{*}) by flow
Q3: (Phase 3) count(envelope.parse_failed) by flow, reason, bucket(24h)
Q4: (Phase 3) count(envelope.retry_succeeded) vs count(EnvelopeTruncationError) by flow
```

---

## Appendix B — Phase 1 gate decision log

Populate before opening the Phase 2 PR:

```
Measurement window: YYYY-MM-DD to YYYY-MM-DD
length-rate by flow:
  exchange:          _____%
  interview:         _____%
  extractSignals:    _____%
  dictation:         _____%
  quiz:              _____%
  (other flows):     _____%

Decision: [ ] Stop at Phase 1  [ ] Continue to Phase 2  [ ] Continue to Phase 2+3
Signed off by: _______
```

---

## Self-Review

- **Plan critique response coverage:**
  - Live-token streaming preserved → Task 12 explicitly wraps only `onComplete` parse failures; `teeEnvelopeStream` untouched.
  - Retry condition tightened → Task 10 tests lock in "length alone does not retry".
  - Measure-first discipline → Phase 1 ships alone; Phase 2/3 are conditional.
  - Brevity softened + eval-gated → Task 6 has a soft clause with mandatory quality diff.
  - Feature flag everywhere → Task 6, 11, 12 all gate behind Doppler flags; rollback table explicit.
  - Real-provider break test → Task 15.
  - Blast-radius audit for `LLMProvider` change → Task 2 step 1.
  - `extractSignals` no longer orphaned → Task 13.
  - `isStructurallyIncomplete` helper dropped → Task 9 explicitly notes why.
  - Verified-By matrix → included.
- **No outstanding TBDs.** Every task has concrete code or a concrete decision rule.
- **Type consistency:** `StopReason`, `LlmCaller`, `LlmCallOutput`, `CallWithCompleteEnvelopeResult`, `EnvelopeTruncationError` used consistently across Tasks 1, 2, 9, 10, 11, 12, 13.
