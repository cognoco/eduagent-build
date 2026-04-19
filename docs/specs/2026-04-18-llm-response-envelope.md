# LLM Response Envelope

**Date:** 2026-04-18
**Status:** Design spec — reference for all structured-output migrations
**Companion to:** [`2026-04-18-llm-reliability-ux-audit.md`](2026-04-18-llm-reliability-ux-audit.md)

## Purpose

Define a single structured-output shape that every LLM call making state-machine decisions must return. Replaces the current pattern of smuggling `[MARKER]` tokens and JSON blobs inside free-text prose.

This spec is the contract every structured-output migration (F1.1 through F2.2 in the reliability audit) follows.

## The envelope

```ts
// packages/schemas/src/llm-envelope.ts (NEW)
import { z } from 'zod';

export const llmResponseEnvelopeSchema = z.object({
  /**
   * The text the learner actually sees. All prose lives here.
   * Nothing else is rendered — no marker, no JSON, nothing.
   */
  reply: z.string().min(1),

  /**
   * Binary / enum state-machine signals. Each signal has a single
   * interpretation. New signals added as a new optional field rather than
   * embedded in reply text.
   */
  signals: z.object({
    /** Interview flow: model believes it has enough to conclude. Ignored by server if exchange < cap. */
    ready_to_finish: z.boolean().optional(),
    /** Main loop: learner response showed partial understanding — hold escalation. */
    partial_progress: z.boolean().optional(),
    /** Main loop: rung-5 exit protocol fired — queue topic for remediation. */
    needs_deepening: z.boolean().optional(),
    /** Main loop: the AI message contains an understanding check. Observational. */
    understanding_check: z.boolean().optional(),
  }).optional(),

  /**
   * Presentation hints — the UI may render a widget based on these, but the
   * learner experience degrades gracefully to "just the reply" if missing.
   * None of these drive control flow on the API side.
   */
  ui_hints: z.object({
    note_prompt: z.object({
      show: z.boolean(),
      post_session: z.boolean().optional(),
    }).optional(),
    fluency_drill: z.object({
      active: z.boolean(),
      duration_s: z.number().int().min(10).max(180).optional(),
      score: z.object({
        correct: z.number().int().min(0),
        total: z.number().int().min(1),
      }).optional(),
    }).optional(),
  }).optional(),

  /**
   * Model's self-reported confidence in its decisions. If present, the UI
   * MAY surface an "Is this right?" tap target when confidence < 'high'.
   * Absent = treat as 'medium'.
   */
  confidence: z.enum(['low', 'medium', 'high']).optional(),
});

export type LlmResponseEnvelope = z.infer<typeof llmResponseEnvelopeSchema>;
```

Lives in `@eduagent/schemas` so both API and mobile can share the type.

## The server-side cap pattern

Structured output alone isn't safe — a model can return `ready_to_finish: false` forever and trap the user. Every signal that drives a terminal state transition needs a matching server-side cap:

```ts
// apps/api/src/services/interview.ts (target shape after F1.1 migration)
const parsed = llmResponseEnvelopeSchema.parse(JSON.parse(jsonStr));
const exchangeNumber = draft.exchange_count + 1;

// Belt + suspenders: after exchange 6, force ready_to_finish regardless
// of what the model returned. Makes the state machine fail-safe in the
// "model never declares done" case.
const MAX_INTERVIEW_EXCHANGES = 6;
const isComplete =
  parsed.signals?.ready_to_finish === true ||
  exchangeNumber >= MAX_INTERVIEW_EXCHANGES;
```

Each migrating flow defines its own cap:

| Flow | Signal | Cap |
|---|---|---|
| Interview | `ready_to_finish` | `MAX_INTERVIEW_EXCHANGES = 6` |
| Escalation hold | `partial_progress` | `MAX_PARTIAL_PROGRESS_HOLDS = 2` (exists) |
| Needs-deepening queue | `needs_deepening` | `MAX_NEEDS_DEEPENING_PER_SUBJECT = 10` (exists) |

Caps are always `max > 0` — they bound abuse but don't block legitimate use.

## How the prompt asks for this

Two provider strategies, picked per-provider by the router:

### Strategy 1 — Tool-calling / response_format (preferred)

For providers supporting JSON mode (OpenAI, Gemini, Anthropic all do on their newer models), we pass the schema directly as a response format. Model returns parseable JSON without needing regex extraction.

### Strategy 2 — In-prompt instruction (fallback)

For providers without JSON mode, prompt ends with:

```
Respond with ONLY valid JSON in this exact shape — no prose before or after:
{
  "reply": "<your message to the learner>",
  "signals": { "partial_progress": <bool>, "needs_deepening": <bool>, "understanding_check": <bool> },
  "ui_hints": { "note_prompt": { "show": <bool> } },
  "confidence": "<low|medium|high>"
}
```

Parser uses the existing `response.match(/\{[\s\S]*\}/)` + `JSON.parse` + Zod pattern already used by 15+ flows.

The router picks strategy based on the provider it selects. Migration code uses the same `parseEnvelope(result.response)` helper in both paths.

## Migration order

Per the reliability audit's backlog, in priority order:

1. **F1.1 INTERVIEW_COMPLETE** — reference implementation. Smallest scope (one flow), highest user risk. Goes first so other migrations can follow the pattern.
2. **F1.2 + F1.3 (exchange main loop)** — biggest blast radius. Migrate together because they share the `buildSystemPrompt` instruction text.
3. **F2.1 + F2.2 (note prompt + fluency drill)** — UI-hints-only, safe fallbacks. Same envelope, done at the same time.

Later: every new LLM-gated state transition uses this envelope by default.

## Rollout telemetry

During migration, log every disagreement between old-parser result and new-parser result on a shadow-run:

```ts
// Temporary during migration — remove after 2 weeks of clean data
if (OLD_MARKER_RESULT !== NEW_SIGNAL_RESULT) {
  logger.warn('envelope_migration.disagreement', {
    flow, profile_id, old_result, new_result,
  });
}
```

If disagreement rate > 2% after a week, the prompt change isn't sufficient and we switch the flow to provider JSON mode (Strategy 1 above) before full cutover.

## Break tests (mandatory per fix-verification rules)

Every migrated flow ships with at least one break test:

| Flow | Break test |
|---|---|
| Interview | Mock LLM returns `ready_to_finish: false` on exchange 7 → assert close fires via cap |
| Exchange partial-progress | Mock LLM returns malformed JSON (no signals) → assert no crash, no false hold |
| Needs-deepening | Mock LLM returns 11th flag in a subject → assert 11th is dropped |
| Note prompt | Mock LLM returns `ui_hints` missing entirely → assert UI state gracefully defaults |

These tests live alongside the service file (`*.test.ts`) — same file — so regressions are caught in the targeted test run.

## Eval-harness integration

The eval harness ([`apps/api/eval-llm/`](../../apps/api/eval-llm/)) extends `FlowDefinition` with an optional `expectedResponseSchema`:

```ts
interface FlowDefinition<Input> {
  // ...existing...
  expectedResponseSchema?: ZodType; // Zod schema the live response must conform to
}
```

When Tier 2 (`--live`) runs, the response is validated against the schema and any failures render as a "schema violation" section in the snapshot markdown. That lets a tuning session catch prompt regressions before they ship.

## Non-goals

- **Not** changing how the LLM router works — it stays streaming-capable, provider-agnostic.
- **Not** deprecating free-text output for flows that legitimately just return text (e.g., dictation-prepare-homework returning sentences). Envelope is only for state-machine decisions.
- **Not** rewriting the mobile SSE consumer — the `reply` field streams like today's free text; signals arrive at close.

## Acceptance

This spec is complete when every flow listed in F1.1 through F2.2 of the reliability audit has migrated and passed its break tests. Telemetry disagreement rate stays below 2% for two weeks post-migration per flow.
