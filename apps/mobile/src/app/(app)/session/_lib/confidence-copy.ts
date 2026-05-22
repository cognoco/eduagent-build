import { computeAgeBracket } from '@eduagent/schemas';

/**
 * Age-aware copy for the F6 confidence affordance. Two variants keep the
 * metacognitive intent (learner signals uncertainty about their own
 * understanding) but adjust phrasing to fit the learner's voice.
 *
 * Brackets follow `computeAgeBracket` thresholds (adolescent = 11–17 / adult = 18+).
 * The pre-11 'child' bracket is unreachable in the strictly-11+ product.
 * `null` birthYear falls back to 'adolescent' — the neutral default.
 */
export function getConfidenceCopy(birthYear: number | null): {
  label: string;
  accessibilityLabel: string;
  retryMessage: string;
} {
  // null birthYear defaults to 'adolescent' — neutral copy for unknown age.
  const bracket =
    birthYear == null ? 'adolescent' : computeAgeBracket(birthYear);

  if (bracket === 'adult') {
    return {
      label: 'Not sure about this? Tap to ask',
      accessibilityLabel:
        'Need a different angle? Tap to ask for clarification or an alternate explanation.',
      retryMessage:
        "I'm not sure that was right — can you explain it differently?",
    };
  }

  // adolescent (11–17) — also covers the unreachable 'child' bracket as a
  // defensive fallback, consistent with the strictly-11+ product constraint.
  return {
    label: 'Is this right? Tap to ask',
    accessibilityLabel:
      'Stuck on this answer? Tap to get it explained differently or work through it together.',
    retryMessage: "I'm not sure I get this — can you explain it differently?",
  };
}
