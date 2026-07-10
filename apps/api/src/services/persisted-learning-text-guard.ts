import { BadRequestError } from '../errors';

// WI-1195: this is deliberately a narrow attribution guard, not a medical
// classifier. It blocks the explicit health/disability characterisations named
// by the Art 9 decision while allowing educational discussion of those terms.
const CHARACTERISED_PERSON = String.raw`(?:i|you|learner|student|child|user|profile|they|he|she)`;
const CLINICAL_LABEL = String.raw`(?:adhd|autis(?:m|tic)|dyslexi(?:a|c)|dyscalculi(?:a|c)|learning disabilit(?:y|ies)|mental[- ]health condition|physical[- ]health condition)`;
const CLINICAL_ATTRIBUTION = new RegExp(
  String.raw`\b${CHARACTERISED_PERSON}\b[^.!?\n]{0,24}\b(?:has|have|had|may have|might have|could have|likely has|appears to have|seems to have|shows signs of|is|am|are|was|were|diagnosed with)\b[^.!?\n]{0,16}\b${CLINICAL_LABEL}\b`,
  'i',
);
const POSSESSIVE_CLINICAL_ATTRIBUTION = new RegExp(
  String.raw`\b(?:learner|student|child|user|profile|their|his|her|your|my)(?:'s)?\s+${CLINICAL_LABEL}\b`,
  'i',
);

export function scrubClinicalInferenceFromLearningRecord(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  return CLINICAL_ATTRIBUTION.test(value) ||
    POSSESSIVE_CLINICAL_ATTRIBUTION.test(value)
    ? null
    : value;
}

export function assertNoClinicalInferenceInLearningRecord(
  value: string,
): string {
  if (scrubClinicalInferenceFromLearningRecord(value) === null) {
    throw new BadRequestError(
      'Learning records cannot store a health or disability characterisation',
    );
  }
  return value;
}
