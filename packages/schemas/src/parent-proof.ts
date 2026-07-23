import type { VerifiedEvidenceQuote } from './evidence-links.ts';

/**
 * Service-layer receipt for a verified-learning proof, shared between the
 * parent-proof resolver (which produces it) and the recap derivation (which
 * consumes it) — a multi-file type, so it lives in the shared contract package
 * rather than a service module.
 *
 * `masteryVerificationState` mirrors the Challenge-Round read-side gate states
 * (`resolveMasteryVerificationState` in
 * `apps/api/src/services/challenge-round/verification.ts`); the literal union is
 * inlined here to keep the schema package free of any dependency on API service
 * code.
 */
interface VerifiedProofMetadata {
  topicId?: string;
  topicTitle?: string;
  subjectId?: string;
  sessionId?: string;
  verifiedAt?: string;
  masteryVerificationState?: 'unverified' | 'fresh' | 'stale';
  retentionStatus?: 'strong' | 'fading' | 'weak' | 'forgotten';
  nextReviewDate?: string;
}

export type VerifiedProofReceipt =
  | {
      hasProof: false;
      quote: null;
    }
  | ({ hasProof: true } & VerifiedProofMetadata & VerifiedEvidenceQuote);
