import { BadRequestError } from '../errors';

// WI-1195: this is deliberately a narrow attribution guard, not a medical
// classifier. It blocks the explicit health/disability characterisations named
// by the Art 9 decision while allowing educational discussion of those terms.
const CLINICAL_LABEL = String.raw`(?:adhd|autis(?:m|tic)|dyslexi(?:a|c)|dyscalculi(?:a|c)|learning disabilit(?:y|ies)|mental[- ]health condition|physical[- ]health condition)`;
const GENERIC_PERSON = String.raw`(?:i|you|learner|student|child|user|profile|they|he|she)`;
const PERSON_NAME = String.raw`(?<person>[\p{L}\p{M}][\p{L}\p{M}'’-]{1,39})`;
const ATTRIBUTION_QUALIFIER = String.raw`(?:(?:probably|possibly)\s+)?`;
const ATTRIBUTION_PHRASE = String.raw`(?:may have|might have|could have|likely has|appears to have|seems to have|shows signs of|is diagnosed with|was diagnosed with|were diagnosed with|has|have|had|is|am|are|was|were)`;
const ATTRIBUTION_MODIFIER = String.raw`(?:(?:likely|probably|possibly|suspected)\s+)?(?:a\s+|an\s+)?`;
const GENERIC_CLINICAL_ATTRIBUTION = new RegExp(
  String.raw`(?<![\p{L}\p{M}])${GENERIC_PERSON}(?![\p{L}\p{M}])\s+${ATTRIBUTION_QUALIFIER}${ATTRIBUTION_PHRASE}\s+${ATTRIBUTION_MODIFIER}${CLINICAL_LABEL}(?![\p{L}\p{M}])`,
  'iu',
);
const NAMED_CLINICAL_ATTRIBUTION = new RegExp(
  String.raw`(?<![\p{L}\p{M}])${PERSON_NAME}(?![\p{L}\p{M}])\s+${ATTRIBUTION_QUALIFIER}${ATTRIBUTION_PHRASE}\s+${ATTRIBUTION_MODIFIER}${CLINICAL_LABEL}(?![\p{L}\p{M}])`,
  'giu',
);
const GENERIC_POSSESSIVE_CLINICAL_ATTRIBUTION = new RegExp(
  String.raw`(?<![\p{L}\p{M}])(?:learner|student|child|user|profile|their|his|her|your|my)(?:['’]s)?\s+${CLINICAL_LABEL}(?![\p{L}\p{M}])`,
  'iu',
);
const NAMED_POSSESSIVE_CLINICAL_ATTRIBUTION = new RegExp(
  String.raw`(?<![\p{L}\p{M}])${PERSON_NAME}['’]s\s+${CLINICAL_LABEL}(?![\p{L}\p{M}])`,
  'giu',
);
const CLINICAL_TERM_ONLY = new RegExp(String.raw`^${CLINICAL_LABEL}$`, 'iu');
const STARTS_WITH_UPPERCASE_LETTER = /^\p{Lu}/u;

function containsNamedClinicalAttribution(value: string): boolean {
  return [
    NAMED_CLINICAL_ATTRIBUTION,
    NAMED_POSSESSIVE_CLINICAL_ATTRIBUTION,
  ].some((pattern) =>
    Array.from(value.matchAll(pattern)).some(({ groups }) => {
      const person = groups?.['person'];
      return (
        person !== undefined &&
        STARTS_WITH_UPPERCASE_LETTER.test(person) &&
        !CLINICAL_TERM_ONLY.test(person)
      );
    }),
  );
}

export function scrubClinicalInferenceFromLearningRecord(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  return GENERIC_CLINICAL_ATTRIBUTION.test(value) ||
    GENERIC_POSSESSIVE_CLINICAL_ATTRIBUTION.test(value) ||
    containsNamedClinicalAttribution(value)
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
