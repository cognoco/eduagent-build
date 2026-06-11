// ---------------------------------------------------------------------------
// Policy Engine — two-primitive model (MMT-ADR-0013)
//
// Scaffold for WP-W1-spine (WI-571). W2/W3 obligations land enforcement here.
// Today: returns the safe-default (most-restrictive) for all inputs because
// the policy_rules / policy_cells tables are not yet populated (WP-W1-schema
// created the schema; C2-B compliance-population workstream fills the data).
//
// The two-primitive model (prohibition-floor + consent-edge) is encoded in the
// PolicyCellResult shape — W2 wires real DB reads and the engine evaluates both
// primitives against live data.
// ---------------------------------------------------------------------------

export interface PolicyKnowledge {
  /** Whether the user's age is positively known. */
  age: 'known' | 'unknown';
  /** Whether the user's residence is positively known. */
  residence: 'known' | 'unknown';
}

export interface PolicyCellResult {
  /**
   * Whether a prohibition-floor rule blocks this cell (unconditional).
   * Prohibition-floor rules bind regardless of consent (MMT-ADR-0013 §1).
   */
  prohibited: boolean;
  /**
   * Whether this cell requires an active consent-edge to proceed.
   * Consent-edge rules are unlockable by guardian/user consent (MMT-ADR-0013 §1).
   */
  consentRequired: boolean;
}

/**
 * Evaluate the policy cell for (age × residence × knowledge).
 *
 * Default-for-unknown = most-restrictive (MMT-ADR-0013 §3):
 *   - unknown age → treat as sub-13 → consentRequired: true
 *   - unknown residence → treat as strictest regime → consentRequired: true
 *
 * Scaffold default (before C2-B populates policy_cells):
 *   - Even `known` inputs are treated as requiring consent — the `known` flag
 *     only signals that age/residence information is present, not its actual
 *     value. Without a populated `policy_cells` table the engine cannot
 *     determine the correct prohibition-floor or consent-edge, so it stays
 *     fail-closed until W2/W3 wires real DB reads.
 *
 * W2/W3 will wire real DB reads into this function once the policy tables
 * are populated by the C2-B compliance-population workstream.
 */
export function evaluatePolicyCell(
  knowledge: PolicyKnowledge,
): PolicyCellResult {
  if (knowledge.age === 'unknown' || knowledge.residence === 'unknown') {
    return { prohibited: false, consentRequired: true };
  }
  // Scaffold: policy_cells / policy_rules tables not yet populated.
  // Stay fail-closed until W2/W3 wires real DB reads.
  return { prohibited: false, consentRequired: true };
}
