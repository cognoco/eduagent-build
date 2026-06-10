// ---------------------------------------------------------------------------
// Policy Engine — barrel export (WI-571 WP-W1-spine)
//
// Three slices:
//   engine   — two-primitive policy evaluation (MMT-ADR-0013)
//   router   — 3-param runtime model picker (MMT-ADR-0014)
//   judge    — vendor-independent safety/judge constraints (MMT-ADR-0016)
// ---------------------------------------------------------------------------

export { evaluatePolicyCell } from './engine';
export type { PolicyKnowledge, PolicyCellResult } from './engine';

export { resolveExchangeRouter, NoEligibleModelError } from './router';
export type {
  ExchangeRouterInput,
  ExchangeRouterResult,
  ExchangeRouterRow,
} from './router';

export { resolveJudgeConfig } from './judge';
export type { JudgeConfigInput, JudgeConfig } from './judge';
