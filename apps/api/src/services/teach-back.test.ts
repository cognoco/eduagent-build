import {
  shouldTriggerTeachBack,
  mapTeachBackRubricToSm2,
  parseTeachBackAssessment,
  teachBackAssessmentFromEnvelopeSignal,
} from './teach-back';
import type { TeachBackAssessment } from '@eduagent/schemas';

function eventWithEnvelopeSignal(signal: Record<string, unknown> | null): {
  content: string;
  metadata: unknown;
} {
  return {
    content: 'Want to try something? Teach it to me. [prose only]',
    metadata: signal ? { signals: { teach_back_assessment: signal } } : null,
  };
}

function eventWithRawEnvelopeContent(envelope: Record<string, unknown>): {
  content: string;
  metadata: unknown;
} {
  return {
    content: JSON.stringify(envelope),
    metadata: null,
  };
}

// ---------------------------------------------------------------------------
// shouldTriggerTeachBack
// ---------------------------------------------------------------------------

describe('shouldTriggerTeachBack', () => {
  it('returns true for moderate-to-strong retention', () => {
    expect(shouldTriggerTeachBack(2.3, 1)).toBe(true);
    expect(shouldTriggerTeachBack(2.5, 3)).toBe(true);
    expect(shouldTriggerTeachBack(3.0, 10)).toBe(true);
  });

  it('returns false when easeFactor < 2.3', () => {
    expect(shouldTriggerTeachBack(2.2, 5)).toBe(false);
    expect(shouldTriggerTeachBack(1.3, 10)).toBe(false);
  });

  it('returns false when repetitions is 0 (never reviewed)', () => {
    expect(shouldTriggerTeachBack(2.5, 0)).toBe(false);
  });

  it('has lower threshold than EVALUATE (2.3 vs 2.5)', () => {
    // easeFactor 2.3 with repetitions qualifies for teach_back but not evaluate
    expect(shouldTriggerTeachBack(2.3, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mapTeachBackRubricToSm2
// ---------------------------------------------------------------------------

describe('mapTeachBackRubricToSm2', () => {
  it('computes weighted average (accuracy 50%, completeness 30%, clarity 20%)', () => {
    const assessment: TeachBackAssessment = {
      accuracy: 4,
      completeness: 4,
      clarity: 4,
      overallQuality: 4,
      weakestArea: 'clarity',
      gapIdentified: null,
    };
    // 4 * 0.5 + 4 * 0.3 + 4 * 0.2 = 2.0 + 1.2 + 0.8 = 4.0
    expect(mapTeachBackRubricToSm2(assessment)).toBe(4);
  });

  it('weights accuracy more heavily', () => {
    const highAccuracy: TeachBackAssessment = {
      accuracy: 5,
      completeness: 0,
      clarity: 0,
      overallQuality: 2,
      weakestArea: 'completeness',
      gapIdentified: null,
    };
    // 5 * 0.5 + 0 * 0.3 + 0 * 0.2 = 2.5 → rounds to 3
    expect(mapTeachBackRubricToSm2(highAccuracy)).toBe(3);

    const lowAccuracy: TeachBackAssessment = {
      accuracy: 0,
      completeness: 5,
      clarity: 5,
      overallQuality: 3,
      weakestArea: 'accuracy',
      gapIdentified: null,
    };
    // 0 * 0.5 + 5 * 0.3 + 5 * 0.2 = 0 + 1.5 + 1.0 = 2.5 → rounds to 3
    expect(mapTeachBackRubricToSm2(lowAccuracy)).toBe(3);
  });

  it('clamps result to 0-5', () => {
    const perfect: TeachBackAssessment = {
      accuracy: 5,
      completeness: 5,
      clarity: 5,
      overallQuality: 5,
      weakestArea: 'clarity',
      gapIdentified: null,
    };
    expect(mapTeachBackRubricToSm2(perfect)).toBe(5);

    const zero: TeachBackAssessment = {
      accuracy: 0,
      completeness: 0,
      clarity: 0,
      overallQuality: 0,
      weakestArea: 'accuracy',
      gapIdentified: null,
    };
    expect(mapTeachBackRubricToSm2(zero)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    const mixed: TeachBackAssessment = {
      accuracy: 3,
      completeness: 4,
      clarity: 5,
      overallQuality: 4,
      weakestArea: 'accuracy',
      gapIdentified: null,
    };
    // 3 * 0.5 + 4 * 0.3 + 5 * 0.2 = 1.5 + 1.2 + 1.0 = 3.7 → rounds to 4
    expect(mapTeachBackRubricToSm2(mixed)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// parseTeachBackAssessment
// ---------------------------------------------------------------------------

describe('parseTeachBackAssessment', () => {
  it('parses a valid assessment from envelope signal in metadata (canonical path)', () => {
    const event = eventWithEnvelopeSignal({
      completeness: 4,
      accuracy: 3,
      clarity: 5,
      overall_quality: 4,
      weakest_area: 'accuracy',
      gap_identified: 'missed energy conservation',
    });
    const result = parseTeachBackAssessment(event);
    expect(result).toEqual({
      completeness: 4,
      accuracy: 3,
      clarity: 5,
      overallQuality: 4,
      weakestArea: 'accuracy',
      gapIdentified: 'missed energy conservation',
    });
  });

  it('parses assessment with null gap_identified', () => {
    const event = eventWithEnvelopeSignal({
      completeness: 5,
      accuracy: 5,
      clarity: 4,
      overall_quality: 5,
      weakest_area: 'clarity',
      gap_identified: null,
    });
    const result = parseTeachBackAssessment(event);
    expect(result?.gapIdentified).toBeNull();
  });

  it('parses from raw envelope JSON in content (transition path)', () => {
    const event = eventWithRawEnvelopeContent({
      reply: 'Hmm — can you tell me more about why?',
      signals: {
        teach_back_assessment: {
          completeness: 3,
          accuracy: 4,
          clarity: 3,
          overall_quality: 3,
          weakest_area: 'completeness',
          gap_identified: 'skipped definition of equilibrium',
        },
      },
    });
    const result = parseTeachBackAssessment(event);
    expect(result).toEqual({
      completeness: 3,
      accuracy: 4,
      clarity: 3,
      overallQuality: 3,
      weakestArea: 'completeness',
      gapIdentified: 'skipped definition of equilibrium',
    });
  });

  it('returns null when no envelope signal and content is plain prose', () => {
    expect(
      parseTeachBackAssessment({
        content: 'Just a plain response with no JSON anywhere.',
        metadata: null,
      }),
    ).toBeNull();
  });

  it('returns null when raw envelope JSON content is malformed', () => {
    expect(
      parseTeachBackAssessment({
        content: '{completeness: not valid}',
        metadata: null,
      }),
    ).toBeNull();
  });

  it('returns null when legacy free-text JSON blob is embedded in prose (post-migration contract)', () => {
    // [CR-2026-05-19-C5] After envelope migration, free-text JSON blobs in
    // prose violate the contract and MUST NOT be parseable. The envelope
    // signal in metadata is now the only path.
    const response =
      'Can you explain more about that?\n' +
      '{"completeness": 4, "accuracy": 3, "clarity": 5, "overallQuality": 4, "weakestArea": "accuracy", "gapIdentified": "missed energy conservation"}';
    expect(parseTeachBackAssessment(response)).toBeNull();
  });

  it('clamps scores to 0-5 range in envelope signal', () => {
    const event = eventWithEnvelopeSignal({
      completeness: 10,
      accuracy: -1,
      clarity: 3,
      overall_quality: 7,
      weakest_area: 'accuracy',
      gap_identified: null,
    });
    const result = parseTeachBackAssessment(event);
    expect(result?.completeness).toBe(5);
    expect(result?.accuracy).toBe(0);
    expect(result?.clarity).toBe(3);
    expect(result?.overallQuality).toBe(5);
  });

  it('defaults missing numeric fields to 3', () => {
    const event = eventWithEnvelopeSignal({
      completeness: 4,
      accuracy: 4,
      // clarity, overall_quality, gap_identified missing
      weakest_area: 'clarity',
    });
    const result = parseTeachBackAssessment(event);
    expect(result?.clarity).toBe(3);
    expect(result?.overallQuality).toBe(3);
    expect(result?.gapIdentified).toBeNull();
  });

  it('infers weakest_area when invalid value provided', () => {
    const event = eventWithEnvelopeSignal({
      completeness: 4,
      accuracy: 2,
      clarity: 3,
      overall_quality: 3,
      weakest_area: 'invalid',
      gap_identified: null,
    });
    const result = parseTeachBackAssessment(event);
    expect(result?.weakestArea).toBe('accuracy'); // lowest score
  });

  it('breaks weakestArea ties favoring accuracy', () => {
    const event = eventWithEnvelopeSignal({
      completeness: 3,
      accuracy: 3,
      clarity: 3,
      overall_quality: 3,
      weakest_area: 'invalid',
      gap_identified: null,
    });
    const result = parseTeachBackAssessment(event);
    expect(result?.weakestArea).toBe('accuracy');
  });

  it('returns null when envelope signal lacks both required fields (completeness and accuracy)', () => {
    const event = eventWithEnvelopeSignal({
      clarity: 4,
      overall_quality: 4,
    });
    expect(parseTeachBackAssessment(event)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// teachBackAssessmentFromEnvelopeSignal — direct mapping helper
// ---------------------------------------------------------------------------

describe('teachBackAssessmentFromEnvelopeSignal', () => {
  it('maps a complete envelope signal to consumer shape', () => {
    const result = teachBackAssessmentFromEnvelopeSignal({
      completeness: 4,
      accuracy: 5,
      clarity: 3,
      overall_quality: 4,
      weakest_area: 'clarity',
      gap_identified: 'glossed analogy',
    });
    expect(result).toEqual({
      completeness: 4,
      accuracy: 5,
      clarity: 3,
      overallQuality: 4,
      weakestArea: 'clarity',
      gapIdentified: 'glossed analogy',
    });
  });

  it('returns null when both required fields are missing', () => {
    const result = teachBackAssessmentFromEnvelopeSignal({
      clarity: 4,
      overall_quality: 4,
    } as unknown as {
      completeness: number;
      accuracy: number;
    });
    expect(result).toBeNull();
  });
});
