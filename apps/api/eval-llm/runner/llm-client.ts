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

import {
  routeAndCall,
  withSafetyPreamble,
} from '../../src/services/llm/router';
import type { ChatMessage, EscalationRung } from '../../src/services/llm/types';
import { callOpenRouterModel } from './llm-bootstrap';

const HARNESS_FLOW_TAG = 'eval-harness';

type RouteAndCallOptions = NonNullable<Parameters<typeof routeAndCall>[2]>;

// WI-2624: RouteAndCallOptions is a discriminated union (capability:'judge'
// requires judgeIndependence). A plain `Omit<Union, K>` does not distribute
// over a union — `keyof` of a union collapses to the shared keys only — which
// would silently widen this back to a non-discriminated shape and let a
// judge-capability harness call through without `judgeIndependence`. This
// distributes Omit over each union member instead, preserving the contract.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** Options accepted by the harness wrapper — the same shape `routeAndCall`
 *  accepts, minus `flow` (the wrapper hardcodes that). */
export type HarnessLlmOptions = DistributiveOmit<RouteAndCallOptions, 'flow'>;

// ---------------------------------------------------------------------------
// Candidate-model override (`--openrouter-model <slug>`)
//
// When set, EVERY runHarnessLlm call bypasses the production router and goes
// to the named model via the eval-only OpenRouter adapter — same messages,
// same prompts, verbatim (the prompts are model-agnostic by policy; per-model
// overlays, if ever needed, are a separate routing concern, not a harness
// concern). This is the executable form of the model-selection memo's §6
// validation gate: run any flow's live evals against a candidate model before
// adopting it, e.g.
//
//   doppler run -- pnpm eval:llm -- --flow safety-probes --live \
//     --openrouter-model mistralai/mistral-small-2603
//
// NOTE: live runs overwrite the checked-in snapshot files with the candidate's
// responses. After a candidate run, restore them before committing:
//   git checkout -- apps/api/eval-llm/snapshots
// ---------------------------------------------------------------------------

let openRouterModelOverride: string | null = null;
let openRouterReasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | null =
  null;

export function setOpenRouterModelOverride(
  model: string | null,
  opts?: { reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' },
): void {
  openRouterModelOverride = model;
  openRouterReasoningEffort = opts?.reasoningEffort ?? null;
}

/**
 * The currently-pinned candidate slug (`--openrouter-model`), or null when
 * live calls go through production routing. Flows that need to name the model
 * that produced a turn — e.g. the review-continuity opener flow, to two-model-
 * guard it against an independent judge — read it here.
 */
export function getOpenRouterModelOverride(): string | null {
  return openRouterModelOverride;
}

/**
 * Run a real LLM call from the eval harness.
 *
 * Returns the raw response string — the runner handles JSON extraction
 * and schema validation downstream (see runner/runner.ts:246).
 */
export async function runHarnessLlm(
  messages: ChatMessage[],
  escalationRung: EscalationRung,
  options?: HarnessLlmOptions,
): Promise<string> {
  if (openRouterModelOverride) {
    // CRITICAL: replicate the production preamble. `routeAndCall` prepends the
    // personalization + safety preamble (router.ts:~872) — including the
    // `getPersonalizationPreamble` language directive that tells the model
    // which language the learner-visible `reply` must be in. The candidate
    // path bypasses `routeAndCall`, so without this the candidate would see a
    // prompt missing that directive and its language eval would not reflect
    // production. We apply the SAME `withSafetyPreamble` to keep the candidate
    // and production prompts identical apart from the model itself.
    const safeMessages = withSafetyPreamble(messages, options?.ageBracket, {
      conversationLanguage: options?.conversationLanguage,
      pronouns: options?.pronouns,
    });
    return callOpenRouterModel(safeMessages, openRouterModelOverride, {
      ...(options?.responseFormat === 'json'
        ? { responseFormat: 'json' as const }
        : {}),
      ...(openRouterReasoningEffort
        ? { reasoningEffort: openRouterReasoningEffort }
        : {}),
    });
  }
  const result = await routeAndCall(messages, escalationRung, {
    ...options,
    flow: HARNESS_FLOW_TAG,
  });
  return result.response;
}
