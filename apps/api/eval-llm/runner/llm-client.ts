// ---------------------------------------------------------------------------
// Eval-LLM — Harness LLM client wrapper [AUDIT-EVAL-2 / 2026-05-02]
//
// Single seam between the eval harness and the production LLM router. Flow
// adapters call `runHarnessLlm` from their `runLive` implementation; this
// wrapper threads through to `routeAndCall` with one harness-specific
// override:
//
//   - `flow: "eval-harness"` — tags the `llm.stop_reason` telemetry so
//     dashboard queries (`count by stop_reason, flow over 24h` per
//     services/llm/router.ts:27) can filter eval runs out of production
//     metrics. The router's `flow` field already exists as a first-class
//     dimension; tagging is the entire telemetry-isolation strategy. No
//     "silent mode" plumbing is needed.
//
// Everything else mirrors production. Same provider, same model selection
// (driven by `escalationRung`), same safety preamble. If `runLive` returned
// a response that the production router would not have produced, the
// downstream Tier 2 envelope-shape validation would be theater.
// ---------------------------------------------------------------------------

import { routeAndCall } from '../../src/services/llm/router';
import type { ChatMessage, EscalationRung } from '../../src/services/llm/types';

const HARNESS_FLOW_TAG = 'eval-harness';

type RouteAndCallOptions = NonNullable<Parameters<typeof routeAndCall>[2]>;

/** Options accepted by the harness wrapper — the same shape `routeAndCall`
 *  accepts, minus `flow` (the wrapper hardcodes that). */
export type HarnessLlmOptions = Omit<RouteAndCallOptions, 'flow'>;

/**
 * Run a real LLM call from the eval harness.
 *
 * Returns the raw response string — the runner handles JSON extraction
 * and schema validation downstream (see runner/runner.ts:246).
 */
export async function runHarnessLlm(
  messages: ChatMessage[],
  escalationRung: EscalationRung,
  options?: HarnessLlmOptions
): Promise<string> {
  const result = await routeAndCall(messages, escalationRung, {
    ...options,
    flow: HARNESS_FLOW_TAG,
  });
  return result.response;
}
