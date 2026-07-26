// ---------------------------------------------------------------------------
// [WI-2628] Stage 2 — the referral payload that binds a `refer` disposition to
// the exact text and producer vendor the deterministic scan saw.
//
// WHY THIS EXISTS. Stage 2 originally took `scan`, `text` and `producerVendor`
// as three independent parameters and only checked `scan.disposition`. Nothing
// tied them together, so a caller could:
//   (a) pair a `refer` from one LLM-authored field with UNRELATED user- or
//       migration-authored text, sending that text to the external judge and
//       applying the resulting allowance to the wrong field — routing straight
//       around Stage 1's deterministic fail-closed matrix; or
//   (b) pass a producer vendor that disagrees with the one that made the scan
//       referable, so the router excludes the wrong vendor and can select the
//       PRODUCING vendor to judge its own output — silently defeating
//       independence.
// Stage 3 batches persistence fields, which is exactly the shape that produces
// both. So the binding is structural: the scan is the ONLY source of the text
// and the vendor, and the judge takes neither as a parameter. A mismatched
// triple is now unrepresentable rather than merely wrong.
//
// WHY A SYMBOL KEY. Stage 1's contract is that a scan result never carries the
// scanned text — its observability-safe fields (field kind, reason, lexeme
// COUNT, corpus confidence) are designed to be logged, and Stage 3 will log
// them. An ordinary `text` property would leak the moment anyone logged a whole
// result. A symbol-keyed property is invisible to `JSON.stringify`,
// `Object.keys` and every structured logger, so the invariant survives while
// the judge can still reach the value. The symbol is module-scoped and
// deliberately NOT re-exported from any barrel: only this folder can unseal it.
// ---------------------------------------------------------------------------

/**
 * Private key for the referral payload on a `refer` scan result.
 *
 * Deliberately NOT SCREAMING_CASE, despite being a module constant. The
 * computed-property form `[SCREAMING_CASE]` is indistinguishable from a
 * free-text `[MARKER]` token to `scripts/check-prompt-markers.sh`, the guard
 * that stops LLM markers being used instead of the structured envelope. This
 * file sits in `services/` and is prompt-adjacent, so the guard scans it and
 * fails the required `main` check on the false positive. Renaming here is the
 * correct fix — widening the guard's ALLOWLIST_RE to accommodate this code
 * would also let a genuine `[REFERRAL_PAYLOAD]` inside a real prompt string
 * through unnoticed. Do not rename it back.
 */
export const referralPayloadKey = Symbol('learningTextSafety.referralPayload');

export interface LearningTextReferralPayload {
  /**
   * The EXACT text the scan ran over. Not normalized — normalization is
   * match-only and never escapes `scan.ts`.
   */
  readonly text: string;
  /** The producer vendor, already validated non-blank and trimmed by the scan. */
  readonly producerVendor: string;
}
