import type { CurriculumBook, Subject } from '@eduagent/schemas';

import { buildSubjectsIndex } from './use-subjects-index';
import type { OverallProgressResponse } from './use-progress';

const SUBJECT_A = '550e8400-e29b-41d4-a716-446655440000';
const SUBJECT_B = '660e8400-e29b-41d4-a716-446655440001';

function subject(id: string, name: string, status = 'active'): Subject {
  return {
    id,
    profileId: '770e8400-e29b-41d4-a716-446655440002',
    name,
    status: status as Subject['status'],
    curriculumStatus: 'ready',
    pedagogyMode: 'socratic',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

function book(
  subjectId: string,
  overrides: Partial<CurriculumBook> = {},
): CurriculumBook {
  return {
    id: `880e8400-e29b-41d4-a716-44665544000${subjectId === SUBJECT_A ? 3 : 4}`,
    subjectId,
    title: 'Book',
    description: null,
    emoji: null,
    sortOrder: 1,
    topicsGenerated: true,
    status: 'IN_PROGRESS',
    topicCount: 5,
    completedTopicCount: 2,
    masteredTopicCount: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function progress(
  subjectId: string,
  overrides: Partial<OverallProgressResponse['subjects'][number]> = {},
): OverallProgressResponse['subjects'][number] {
  return {
    subjectId,
    name: subjectId === SUBJECT_A ? 'Spanish' : 'Algebra',
    topicsTotal: 5,
    topicsCompleted: 2,
    topicsVerified: 1,
    topicsMastered: 1,
    topicsLearning: 1,
    urgencyScore: 0,
    retentionStatus: 'strong',
    lastSessionAt: null,
    ...overrides,
  };
}

describe('buildSubjectsIndex', () => {
  it('keeps the full active subject list and derives concrete progress', () => {
    const result = buildSubjectsIndex({
      subjects: [
        subject(SUBJECT_A, 'Spanish'),
        subject(SUBJECT_B, 'Algebra'),
        subject('990e8400-e29b-41d4-a716-446655440005', 'Archived', 'archived'),
      ],
      librarySubjects: [
        {
          subjectId: SUBJECT_A,
          subjectName: 'Spanish',
          books: [book(SUBJECT_A, { status: 'REVIEW_DUE' })],
        },
        {
          subjectId: SUBJECT_B,
          subjectName: 'Algebra',
          books: [book(SUBJECT_B)],
        },
      ],
      progressSubjects: [
        progress(SUBJECT_A, {
          topicsTotal: 6,
          topicsMastered: 2,
          topicsLearning: 3,
        }),
      ],
    });

    expect(
      result.map((item: { subjectName: string }) => item.subjectName),
    ).toEqual(['Spanish', 'Algebra']);
    expect(result[0]).toEqual(
      expect.objectContaining({
        subjectId: SUBJECT_A,
        mastered: 2,
        learning: 3,
        total: 6,
        dueReviews: 1,
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        subjectId: SUBJECT_B,
        mastered: 1,
        learning: 1,
        total: 5,
        dueReviews: 0,
      }),
    );
  });
});
