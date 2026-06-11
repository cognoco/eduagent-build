// ---------------------------------------------------------------------------
// Exchange Router stub — 3-param runtime key (MMT-ADR-0014)
//
// Scaffold for WP-W1-spine (WI-571). The full vetting pipeline + allowed_models
// table are populated by the vetting-research workstream (WP-4). Today: throws
// NoEligibleModelError when the eligibility set is empty (fail-closed by default).
//
// NOTE: This is the POLICY-ENGINE-LEVEL router (picks a model row from the
// vetted + policy-filtered set). It is DISTINCT from services/llm/router.ts
// (the LLM call dispatcher that routes the actual HTTP request to a provider).
//
// The hard split between vetting and routing (MMT-ADR-0014 §3) means this
// router never sees vetting criteria — only the filtered eligibility set.
// ---------------------------------------------------------------------------

/**
 * Thrown when the policy-filtered eligibility set is empty (fail-closed).
 *
 * **Wiring note (W3 obligation):** when this router is wired into the LLM call
 * path in WP-W3-envelope-router, callers must map `NoEligibleModelError` to
 * `CircuitOpenError` (or replace it) so the existing `503 LLM_UNAVAILABLE`
 * handlers at `apps/api/src/index.ts:394` and `routes/sessions.ts` continue to
 * handle this case correctly. The policy-engine router is not wired into those
 * handlers in this WP-W1 scaffold — the mapping is W3 scope.
 */
export class NoEligibleModelError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'No eligible model in the policy-filtered set');
    this.name = 'NoEligibleModelError';
  }
}

export interface ExchangeRouterRow {
  /** The model identifier (e.g. 'claude-opus-4-8', 'gpt-5'). */
  model: string;
  /** Who exposes the API (e.g. 'anthropic-direct', 'azure-openai'). */
  serviceProvider: string;
  /** Where the inference runs (e.g. 'us-east-1', 'eu-west-1'). */
  servingRegion: string;
}

export interface ExchangeRouterInput {
  /**
   * Rows from allowed_models filtered by the policy engine's eligibility output.
   * Ordered by preference tier (tier 1 first).
   */
  eligibleRows: ReadonlyArray<ExchangeRouterRow>;
}

export interface ExchangeRouterResult {
  model: string;
  serviceProvider: string;
  servingRegion: string;
}

/**
 * Pick a model row from the policy-filtered eligibility set.
 *
 * v1 strategy: first row (tier-ordered by the vetting pipeline).
 * Fallback: throws NoEligibleModelError (fail-closed per MMT-ADR-0014 §2).
 *
 * W3 (WP-W3-envelope-router) will harden the fallback tiers here.
 */
export function resolveExchangeRouter(
  input: ExchangeRouterInput,
): ExchangeRouterResult {
  const first = input.eligibleRows[0];
  if (!first) {
    throw new NoEligibleModelError();
  }
  return {
    model: first.model,
    serviceProvider: first.serviceProvider,
    servingRegion: first.servingRegion,
  };
}
