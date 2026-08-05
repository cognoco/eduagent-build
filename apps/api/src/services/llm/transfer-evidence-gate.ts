// ---------------------------------------------------------------------------
// [WI-3020] International-routing launch-stop.
//
// privacy-policy.html §7 commits that production learner data is not routed
// internationally until transfer safeguards are established and verified. Until
// this file existed, that commitment was prose only: the router pins every
// candidate row to `V2_SERVING_REGION_PLACEHOLDER = 'global'` (router.ts) and
// the serving-region axis is unbuilt, so nothing in the runtime could tell an
// approved destination from an unapproved one.
//
// This module is the executable half of that commitment. It does NOT build the
// serving-region axis (that is the vetted `allowed_models` work, out of scope
// here) — it answers one question at the routing choke point: may production
// traffic leave at all, given that no serving region currently carries verified
// OPQ-110 transfer evidence?
//
// Deliberately environment-scoped, not traffic-class-scoped. Scoping to
// "learner data" would have to key on optional routeAndCall options (`flow`,
// `ageBracket`), so any call site that omitted them would fail OPEN — the exact
// inversion of a launch-stop. Every serving region is unapproved while the
// evidence is pending, so no production LLM traffic is routable regardless of
// its class; blocking the environment is both the smaller control and the
// honest one.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// [WI-3020 rework] The launch-stop is an EGRESS control, not an LLM-router
// control.
//
// As first shipped it guarded routeAndCall/routeAndStream only. But
// `services/embeddings.ts` posts the learner's own message text straight to
// Voyage AI (api.voyageai.com) with its own `fetch`, never touching the
// router — so production learner data still left for an international
// provider while the evidence was pending, on the ordinary session-message
// path (`prepareExchangeContext`) and on every background embedding flow
// (session-completed, memory-fact embed + backfill, transcript purge).
//
// The fix is one control, not two: this module owns the predicate, the lever
// and the request-context read, and every learner-data egress boundary calls
// into it. Adding a provider boundary means calling
// `assertLearnerDataEgressAllowed` there — never re-deriving the rule.
// ---------------------------------------------------------------------------

import { createLogger } from '../logger';
import {
  getLlmRequestEnvironment,
  getLlmRequestTransferEvidenceVerified,
  hasLlmRequestContext,
} from './request-context';

const logger = createLogger();

/**
 * The routing seam this gate stands on. Mirrors
 * `V2_SERVING_REGION_PLACEHOLDER` in router.ts — carried into the block log
 * line so an operator reading the warn can see WHICH region was refused,
 * without this module branching on a region axis that does not exist yet.
 */
export const TRANSFER_GATE_SERVING_REGION = 'global';

export interface TransferEvidenceGateInput {
  /** Request-scoped deployment environment (llm request context). */
  environment: string;
  /**
   * Whether the OPQ-110 transfer-evidence release lever is explicitly
   * satisfied — `INTERNATIONAL_TRANSFER_EVIDENCE_VERIFIED === 'true'`.
   */
  evidenceVerified: boolean;
}

/**
 * True when production LLM routing must be refused because the transfer
 * evidence is still pending.
 *
 * Fail-closed on the evidence, inert on the environment: a non-production
 * environment is never blocked (dev/staging/test keep working unchanged), and
 * production is blocked unless the lever is explicitly satisfied.
 */
export function isInternationalRoutingBlocked({
  environment,
  evidenceVerified,
}: TransferEvidenceGateInput): boolean {
  if (environment !== 'production') return false;
  return !evidenceVerified;
}

// ---------------------------------------------------------------------------
// Non-router egress boundaries
// ---------------------------------------------------------------------------

/**
 * Thrown when a non-router learner-data egress boundary is refused by the
 * launch-stop. Deliberately NOT `CircuitOpenError`: that type lives in
 * router.ts, which imports this module, so reusing it here would close an
 * import cycle — and dragging the router into `services/embeddings.ts`'s
 * transitive graph is the same hazard router.ts already documents for
 * services/sentry. The two boundaries share the predicate and the lever; only
 * the thrown type differs, because their HTTP-mapping contracts differ (the
 * router's 503 `LLM_UNAVAILABLE` handler is what forced that type).
 */
export class InternationalTransferBlockedError extends Error {
  readonly surface: string;
  readonly destination: string;

  constructor(params: { surface: string; destination: string }) {
    super(
      `International learner-data transfer refused (${params.surface}) — ` +
        `OPQ-110 transfer evidence is pending. See privacy-policy.html §7.`,
    );
    this.name = 'InternationalTransferBlockedError';
    this.surface = params.surface;
    this.destination = params.destination;
  }
}

/**
 * Guards ONE outbound learner-data boundary. Call this before any request
 * body is built, so a refused call never serialises learner text at all.
 *
 * `nodeTestEnv` is supplied by the caller rather than read here: this module
 * sits inside the LLM router's transitive graph, and importing `../../config`
 * for `isNodeTestEnv()` would pull the config module into it.
 *
 * Fail-closed on a MISSING request context, which is stricter than the router
 * choke points. Both boundaries are reached only through the Hono app (
 * `api.use('*', llmMiddleware)` in index.ts wraps every route including
 * `/v1/inngest`, and the Worker exports no `scheduled`/queue handler), so this
 * is defence in depth rather than a live divergence — but the per-value
 * fallbacks read "no context" as environment `'development'`, i.e. OPEN, and a
 * launch-stop must never be one lost async context away from unarmed.
 */
export function assertLearnerDataEgressAllowed(params: {
  /** Short stable label for the boundary, e.g. `voyage_embeddings`. */
  surface: string;
  /** Provider endpoint the refused request would have reached. */
  destination: string;
  /** `isNodeTestEnv()` from the calling module. */
  nodeTestEnv: boolean;
}): void {
  const contextPresent = hasLlmRequestContext();
  const environment = getLlmRequestEnvironment('development');
  const evidenceVerified = getLlmRequestTransferEvidenceVerified(false);

  const contextMissing = !contextPresent && !params.nodeTestEnv;
  const blocked =
    contextMissing ||
    isInternationalRoutingBlocked({ environment, evidenceVerified });
  if (!blocked) return;

  logger.warn('llm.transfer_evidence.blocked', {
    event: 'llm.transfer_evidence.blocked',
    surface: params.surface,
    destination: params.destination,
    environment: contextMissing ? 'unknown_no_request_context' : environment,
    serving_region: TRANSFER_GATE_SERVING_REGION,
  });

  throw new InternationalTransferBlockedError({
    surface: params.surface,
    destination: params.destination,
  });
}
