/**
 * Age-aware copy for the F6 confidence affordance. Three variants keep the
 * metacognitive intent (learner signals uncertainty about their own
 * understanding) but adjust phrasing to fit the learner's voice.
 *
 * Brackets follow `computeAgeBracket` thresholds (under 13 / 13–17 / 18+).
 * `null` birthYear falls back to the middle bracket — neutral default.
 */
export function getConfidenceCopy(birthYear: number | null): {
  label: string;
  accessibilityLabel: string;
  retryMessage: string;
} {
  const age = birthYear == null ? null : new Date().getFullYear() - birthYear;
  if (age != null && age < 13) {
    return {
      label: 'Does this feel right? Tap to ask',
      accessibilityLabel:
        "If something doesn't make sense yet, that's okay! Tap here to ask the mentor to explain it a different way.",
      retryMessage: "I don't get this — can you say it another way?",
    };
  }
  if (age != null && age >= 18) {
    return {
      label: 'Not sure about this? Tap to ask',
      accessibilityLabel:
        'Need a different angle? Tap to ask for clarification or an alternate explanation.',
      retryMessage:
        "I'm not sure that was right — can you explain it differently?",
    };
  }
  return {
    label: 'Is this right? Tap to ask',
    accessibilityLabel:
      'Stuck on this answer? Tap to get it explained differently or work through it together.',
    retryMessage: "I'm not sure I get this — can you explain it differently?",
  };
}
