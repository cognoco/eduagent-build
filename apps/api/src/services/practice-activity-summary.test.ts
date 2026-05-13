import { buildSummaryFromRows } from './practice-activity-summary';

describe('buildSummaryFromRows', () => {
  it('returns empty summary for empty rows and zero celebrations', () => {
    const result = buildSummaryFromRows([], 0);
    expect(result.quizzesCompleted).toBe(0);
    expect(result.reviewsCompleted).toBe(0);
    expect(result.totals.activitiesCompleted).toBe(0);
    expect(result.totals.pointsEarned).toBe(0);
    expect(result.totals.celebrations).toBe(0);
    expect(result.totals.distinctActivityTypes).toBe(0);
    expect(result.scores.accuracy).toBeNull();
    expect(result.byType).toEqual([]);
    expect(result.bySubject).toEqual([]);
    expect(result.comparison).toBeUndefined();
  });

  it('counts quizzes, reviews, and activitiesCompleted correctly', () => {
    const result = buildSummaryFromRows(
      [
        {
          subjectId: null,
          subjectName: null,
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 10,
          score: null,
          total: null,
        },
        {
          subjectId: null,
          subjectName: null,
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 10,
          score: null,
          total: null,
        },
        {
          subjectId: null,
          subjectName: null,
          activityType: 'review',
          activitySubtype: null,
          pointsEarned: 5,
          score: null,
          total: null,
        },
      ],
      0,
    );
    expect(result.quizzesCompleted).toBe(2);
    expect(result.reviewsCompleted).toBe(1);
    expect(result.totals.activitiesCompleted).toBe(3);
    expect(result.totals.pointsEarned).toBe(25);
    expect(result.totals.distinctActivityTypes).toBe(2);
  });

  it('propagates celebration count from the parameter', () => {
    const result = buildSummaryFromRows([], 7);
    expect(result.totals.celebrations).toBe(7);
  });

  it('calculates accuracy from scored rows', () => {
    const result = buildSummaryFromRows(
      [
        {
          subjectId: null,
          subjectName: null,
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 10,
          score: 8,
          total: 10,
        },
        {
          subjectId: null,
          subjectName: null,
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 10,
          score: 6,
          total: 10,
        },
      ],
      0,
    );
    expect(result.scores.scoredActivities).toBe(2);
    expect(result.scores.score).toBe(14);
    expect(result.scores.total).toBe(20);
    expect(result.scores.accuracy).toBeCloseTo(0.7);
  });

  it('skips score accumulation for rows with null or zero total', () => {
    const result = buildSummaryFromRows(
      [
        {
          subjectId: null,
          subjectName: null,
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 10,
          score: 8,
          total: null,
        },
        {
          subjectId: null,
          subjectName: null,
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 10,
          score: 8,
          total: 0,
        },
      ],
      0,
    );
    expect(result.scores.scoredActivities).toBe(0);
    expect(result.scores.accuracy).toBeNull();
  });

  it('groups rows by subject with nested byType', () => {
    const MATHS_ID = '00000000-0000-4000-8000-000000000001';
    const SCIENCE_ID = '00000000-0000-4000-8000-000000000002';
    const result = buildSummaryFromRows(
      [
        {
          subjectId: MATHS_ID,
          subjectName: 'Maths',
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 10,
          score: null,
          total: null,
        },
        {
          subjectId: MATHS_ID,
          subjectName: 'Maths',
          activityType: 'review',
          activitySubtype: null,
          pointsEarned: 5,
          score: null,
          total: null,
        },
        {
          subjectId: SCIENCE_ID,
          subjectName: 'Science',
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 8,
          score: null,
          total: null,
        },
      ],
      0,
    );
    expect(result.bySubject).toHaveLength(2);
    const maths = result.bySubject.find((s) => s.subjectId === MATHS_ID);
    expect(maths?.count).toBe(2);
    expect(maths?.pointsEarned).toBe(15);
    expect(maths?.byType).toHaveLength(2);
    const science = result.bySubject.find((s) => s.subjectId === SCIENCE_ID);
    expect(science?.count).toBe(1);
  });

  it('excludes rows without subjectId from bySubject', () => {
    const result = buildSummaryFromRows(
      [
        {
          subjectId: null,
          subjectName: null,
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 10,
          score: null,
          total: null,
        },
      ],
      0,
    );
    expect(result.bySubject).toHaveLength(0);
    expect(result.byType).toHaveLength(1);
  });

  it('groups by activityType and activitySubtype in byType', () => {
    const result = buildSummaryFromRows(
      [
        {
          subjectId: null,
          subjectName: null,
          activityType: 'quiz',
          activitySubtype: 'multiple_choice',
          pointsEarned: 5,
          score: null,
          total: null,
        },
        {
          subjectId: null,
          subjectName: null,
          activityType: 'quiz',
          activitySubtype: 'multiple_choice',
          pointsEarned: 5,
          score: null,
          total: null,
        },
        {
          subjectId: null,
          subjectName: null,
          activityType: 'quiz',
          activitySubtype: 'fill_blank',
          pointsEarned: 5,
          score: null,
          total: null,
        },
      ],
      0,
    );
    expect(result.byType).toHaveLength(2);
    const mc = result.byType.find(
      (t) => t.activitySubtype === 'multiple_choice',
    );
    expect(mc?.count).toBe(2);
  });

  it('attaches comparison when provided', () => {
    const comparison = {
      previous: {
        activitiesCompleted: 5,
        reviewsCompleted: 1,
        pointsEarned: 50,
        celebrations: 0,
        distinctActivityTypes: 1,
      },
      delta: {
        activitiesCompleted: -5,
        reviewsCompleted: -1,
        pointsEarned: -50,
        celebrations: 0,
        distinctActivityTypes: 0,
      },
    };
    const result = buildSummaryFromRows([], 0, comparison);
    expect(result.comparison).toEqual(comparison);
  });

  it('sorts bySubject alphabetically by subject name', () => {
    const result = buildSummaryFromRows(
      [
        {
          subjectId: '00000000-0000-4000-8000-000000000010',
          subjectName: 'Zoology',
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 5,
          score: null,
          total: null,
        },
        {
          subjectId: '00000000-0000-4000-8000-000000000011',
          subjectName: 'Algebra',
          activityType: 'quiz',
          activitySubtype: null,
          pointsEarned: 5,
          score: null,
          total: null,
        },
      ],
      0,
    );
    expect(result.bySubject[0].subjectName).toBe('Algebra');
    expect(result.bySubject[1].subjectName).toBe('Zoology');
  });
});
