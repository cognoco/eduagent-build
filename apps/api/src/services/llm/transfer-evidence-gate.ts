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
