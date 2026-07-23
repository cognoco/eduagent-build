// ---------------------------------------------------------------------------
// Policy Engine — barrel export (WI-571 WP-W1-spine)
//
// Two slices:
//   engine   — two-primitive policy evaluation (MMT-ADR-0013)
//   router   — 3-param runtime model picker (MMT-ADR-0014)
//
// (The former `judge` slice — vendor-independent safety/judge constraints,
// MMT-ADR-0016 — was a structural-constraint stub with no production caller;
// removed as orphaned by WI-2624, which replaced its `!<vendor>`-string
// constraint shape with the typed `JudgeIndependence` union enforced directly
// in the router, apps/api/src/services/llm/router.ts.)
// ---------------------------------------------------------------------------

export { evaluatePolicyCell } from './engine';
export type { PolicyKnowledge, PolicyCellResult } from './engine';

export { resolveExchangeRouter, NoEligibleModelError } from './router';
export type {
  ExchangeRouterInput,
  ExchangeRouterResult,
  ExchangeRouterRow,
} from './router';
