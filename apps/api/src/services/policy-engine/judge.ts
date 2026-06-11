// ---------------------------------------------------------------------------
// Safety / Judge stub — vendor-independent, non-reasoning (MMT-ADR-0016)
//
// Scaffold for WP-W1-spine (WI-571). The actual model picks live in
// docs/registers/llm-models/master.md (register data, not ADR).
// Today: resolveJudgeConfig() returns the structural constraint shape only;
// W3 (WP-W3-envelope-router) wires real model selection against these constraints.
//
// The judge is vendor-independent of the tutor and always non-reasoning:
//   - Vendor-independent: cannot share a vendor with the tutor it evaluates
//     (an evaluator sharing blind spots cannot catch them — MMT-ADR-0016 §2).
//   - Non-reasoning: reasoning mode breaks the JSON envelope the state machine
//     depends on (MMT-ADR-0016 §2).
// ---------------------------------------------------------------------------

export interface JudgeConfigInput {
  /** The tutor model's vendor (e.g. 'anthropic', 'openai', 'google'). */
  tutorVendor: string;
}

export interface JudgeConfig {
  /**
   * The judge is always vendor-independent of the tutor (MMT-ADR-0016 §2).
   * Literal true — the type encodes the invariant.
   */
  vendorIndependent: true;
  /** The judge always runs in non-reasoning mode (MMT-ADR-0016 §2). */
  reasoningMode: 'off';
  /**
   * The vendor constraint string — encodes which vendor is excluded.
   * Format: `!<tutorVendor>`. W3 resolves the actual model from register data
   * subject to this constraint.
   */
  vendorConstraint: string;
}

/**
 * Resolve the structural constraints for the judge role.
 *
 * Does NOT return a specific model — that is register data in
 * docs/registers/llm-models/master.md. Returns the constraint shape
 * that W3 (WP-W3-envelope-router) uses when wiring real model selection.
 */
export function resolveJudgeConfig(input: JudgeConfigInput): JudgeConfig {
  return {
    vendorIndependent: true,
    reasoningMode: 'off',
    vendorConstraint: `!${input.tutorVendor}`,
  };
}
