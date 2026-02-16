import {
  calculateUrgencyScore,
  rankSubjectsByUrgency,
  type SubjectUrgencyInput,
} from './subject-urgency';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSubject(
  overrides: Partial<SubjectUrgencyInput> & { subjectId: string }
): SubjectUrgencyInput {
  return {
    overdueRecallCount: 0,
    weakForgottenCount: 0,
    daysSinceLastSession: 0,
    totalTopics: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateUrgencyScore
// ---------------------------------------------------------------------------

describe('calculateUrgencyScore', () => {
  it('returns 0 for subject with no urgency signals', () => {
    const input = createSubject({ subjectId: 'sub-1' });

    expect(calculateUrgencyScore(input)).toBe(0);
  });

  it('weights overdueRecallCount at 3x', () => {
    const input = createSubject({
      subjectId: 'sub-1',
      overdueRecallCount: 4,
    });

    // 4 * 3 = 12
    expect(calculateUrgencyScore(input)).toBe(12);
  });

  it('weights weakForgottenCount at 2x', () => {
    const input = createSubject({
      subjectId: 'sub-1',
      weakForgottenCount: 5,
    });

    // 5 * 2 = 10
    expect(calculateUrgencyScore(input)).toBe(10);
  });

  it('weights daysSinceLastSession at 0.5x', () => {
    const input = createSubject({
      subjectId: 'sub-1',
      daysSinceLastSession: 10,
    });

    // 10 * 0.5 = 5
    expect(calculateUrgencyScore(input)).toBe(5);
  });

  it('combines all factors correctly', () => {
    const input = createSubject({
      subjectId: 'sub-1',
      overdueRecallCount: 2,
      weakForgottenCount: 3,
      daysSinceLastSession: 4,
    });

    // 2*3 + 3*2 + 4*0.5 = 6 + 6 + 2 = 14
    expect(calculateUrgencyScore(input)).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// rankSubjectsByUrgency
// ---------------------------------------------------------------------------

describe('rankSubjectsByUrgency', () => {
  it('sorts subjects by urgency score descending', () => {
    const subjects = [
      createSubject({ subjectId: 'low', overdueRecallCount: 1 }),
      createSubject({ subjectId: 'high', overdueRecallCount: 10 }),
      createSubject({ subjectId: 'mid', overdueRecallCount: 5 }),
    ];

    const ranked = rankSubjectsByUrgency(subjects);

    expect(ranked[0].subjectId).toBe('high');
    expect(ranked[1].subjectId).toBe('mid');
    expect(ranked[2].subjectId).toBe('low');
  });

  it('breaks ties by totalTopics (larger first)', () => {
    const subjects = [
      createSubject({
        subjectId: 'small',
        overdueRecallCount: 3,
        totalTopics: 5,
      }),
      createSubject({
        subjectId: 'large',
        overdueRecallCount: 3,
        totalTopics: 20,
      }),
    ];

    const ranked = rankSubjectsByUrgency(subjects);

    expect(ranked[0].subjectId).toBe('large');
    expect(ranked[1].subjectId).toBe('small');
  });

  it('returns empty array for empty input', () => {
    const ranked = rankSubjectsByUrgency([]);

    expect(ranked).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const subjects = [
      createSubject({ subjectId: 'b', overdueRecallCount: 1 }),
      createSubject({ subjectId: 'a', overdueRecallCount: 5 }),
    ];

    const original = [...subjects];
    rankSubjectsByUrgency(subjects);

    expect(subjects[0].subjectId).toBe(original[0].subjectId);
    expect(subjects[1].subjectId).toBe(original[1].subjectId);
  });

  it('handles single subject', () => {
    const subjects = [
      createSubject({ subjectId: 'only', overdueRecallCount: 3 }),
    ];

    const ranked = rankSubjectsByUrgency(subjects);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].subjectId).toBe('only');
  });
});
