import {
  shouldTriggerTeachBack,
  mapTeachBackRubricToSm2,
  parseTeachBackAssessment,
} from './teach-back';
import type { TeachBackAssessment } from '@eduagent/schemas';

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
  it('parses a valid JSON assessment', () => {
    const response =
      'Can you explain more about that?\n' +
      '{"completeness": 4, "accuracy": 3, "clarity": 5, "overallQuality": 4, "weakestArea": "accuracy", "gapIdentified": "missed energy conservation"}';
    const result = parseTeachBackAssessment(response);
    expect(result).toEqual({
      completeness: 4,
      accuracy: 3,
      clarity: 5,
      overallQuality: 4,
      weakestArea: 'accuracy',
      gapIdentified: 'missed energy conservation',
    });
  });

  it('parses assessment with null gapIdentified', () => {
    const response =
      '{"completeness": 5, "accuracy": 5, "clarity": 4, "overallQuality": 5, "weakestArea": "clarity", "gapIdentified": null}';
    const result = parseTeachBackAssessment(response);
    expect(result?.gapIdentified).toBeNull();
  });

  it('returns null when no JSON found', () => {
    expect(parseTeachBackAssessment('Just a plain response')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseTeachBackAssessment('{completeness: not valid}')).toBeNull();
  });

  it('clamps scores to 0-5 range', () => {
    const response =
      '{"completeness": 10, "accuracy": -1, "clarity": 3, "overallQuality": 7, "weakestArea": "accuracy", "gapIdentified": null}';
    const result = parseTeachBackAssessment(response);
    expect(result?.completeness).toBe(5);
    expect(result?.accuracy).toBe(0);
    expect(result?.clarity).toBe(3);
    expect(result?.overallQuality).toBe(5);
  });

  it('defaults missing numeric fields to 3', () => {
    const response =
      '{"completeness": 4, "accuracy": 4, "clarity": 4, "overallQuality": 4, "weakestArea": "clarity"}';
    const result = parseTeachBackAssessment(response);
    expect(result?.gapIdentified).toBeNull();
  });

  it('infers weakestArea when invalid value provided', () => {
    const response =
      '{"completeness": 4, "accuracy": 2, "clarity": 3, "overallQuality": 3, "weakestArea": "invalid", "gapIdentified": null}';
    const result = parseTeachBackAssessment(response);
    expect(result?.weakestArea).toBe('accuracy'); // lowest score
  });

  it('breaks weakestArea ties favoring accuracy', () => {
    const response =
      '{"completeness": 3, "accuracy": 3, "clarity": 3, "overallQuality": 3, "weakestArea": "invalid", "gapIdentified": null}';
    const result = parseTeachBackAssessment(response);
    expect(result?.weakestArea).toBe('accuracy');
  });
});
