import { ForbiddenError } from '../errors';
import { readSupporteeStructuralSubjects } from './supporter-structural-mask';

type SelectResult = Array<Record<string, unknown>>;

interface FakeSelectBuilder {
  from: (...args: unknown[]) => FakeSelectBuilder;
  innerJoin: (...args: unknown[]) => FakeSelectBuilder;
  leftJoin: (...args: unknown[]) => FakeSelectBuilder;
  where: (...args: unknown[]) => FakeSelectBuilder;
  orderBy: (...args: unknown[]) => FakeSelectBuilder;
  limit: (...args: unknown[]) => Promise<SelectResult>;
}

function dbWithSelectResults(results: SelectResult[]) {
  const pending = [...results];
  const select = jest.fn((): FakeSelectBuilder => {
    const builder: FakeSelectBuilder = {
      from: jest.fn((..._args: unknown[]) => builder),
      innerJoin: jest.fn((..._args: unknown[]) => builder),
      leftJoin: jest.fn((..._args: unknown[]) => builder),
      where: jest.fn((..._args: unknown[]) => builder),
      orderBy: jest.fn((..._args: unknown[]) => builder),
      limit: jest.fn(async (..._args: unknown[]) => pending.shift() ?? []),
    };
    return builder;
  });
  return { select } as never;
}

describe('readSupporteeStructuralSubjects', () => {
  it('throws ForbiddenError before reading structure when no active supportership exists', async () => {
    const db = dbWithSelectResults([[]]);

    await expect(
      readSupporteeStructuralSubjects(
        db,
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns only live structural subject/book/topic fields for an active edge', async () => {
    const dueReviewAt = new Date('2026-06-29T12:00:00.000Z');
    const masteredAt = new Date('2026-06-28T12:00:00.000Z');
    const db = dbWithSelectResults([
      [{ edgeId: '00000000-0000-4000-8000-000000000010' }],
      [
        {
          subjectId: '00000000-0000-4000-8000-000000000101',
          subjectName: 'Physics',
          subjectStatus: 'active',
          bookId: '00000000-0000-4000-8000-000000000201',
          bookTitle: 'Motion',
          bookDescription: 'How things move',
          bookEmoji: 'F',
          bookSortOrder: 1,
          topicId: '00000000-0000-4000-8000-000000000301',
          topicTitle: 'Velocity',
          topicDescription: 'Speed with direction',
          topicChapter: 'Vectors',
          topicSortOrder: 1,
          estimatedMinutes: 15,
          skipped: false,
          topicNextReviewAt: dueReviewAt,
          topicMasteredAt: null,
          artifactText: 'SECRET JOURNAL SENTENCE MUST NOT LEAK',
        },
        {
          subjectId: '00000000-0000-4000-8000-000000000101',
          subjectName: 'Physics',
          subjectStatus: 'active',
          bookId: '00000000-0000-4000-8000-000000000201',
          bookTitle: 'Motion',
          bookDescription: 'How things move',
          bookEmoji: 'F',
          bookSortOrder: 1,
          topicId: '00000000-0000-4000-8000-000000000302',
          topicTitle: 'Acceleration',
          topicDescription: 'Changing velocity',
          topicChapter: 'Vectors',
          topicSortOrder: 2,
          estimatedMinutes: 20,
          skipped: false,
          topicNextReviewAt: null,
          topicMasteredAt: masteredAt,
          artifactText: 'PRIVATE NOTE MUST NOT LEAK',
        },
      ],
    ]);

    const result = await readSupporteeStructuralSubjects(
      db,
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    );

    expect(result).toEqual({
      personId: '00000000-0000-4000-8000-000000000002',
      edgeId: '00000000-0000-4000-8000-000000000010',
      subjects: [
        {
          id: '00000000-0000-4000-8000-000000000101',
          name: 'Physics',
          status: 'active',
          books: [
            {
              id: '00000000-0000-4000-8000-000000000201',
              title: 'Motion',
              description: 'How things move',
              emoji: 'F',
              sortOrder: 1,
              topics: [
                {
                  id: '00000000-0000-4000-8000-000000000301',
                  title: 'Velocity',
                  description: 'Speed with direction',
                  chapter: 'Vectors',
                  sortOrder: 1,
                  estimatedMinutes: 15,
                  skipped: false,
                  progressState: 'review-due',
                  nextReviewAt: '2026-06-29T12:00:00.000Z',
                  masteredAt: null,
                },
                {
                  id: '00000000-0000-4000-8000-000000000302',
                  title: 'Acceleration',
                  description: 'Changing velocity',
                  chapter: 'Vectors',
                  sortOrder: 2,
                  estimatedMinutes: 20,
                  skipped: false,
                  progressState: 'mastered',
                  nextReviewAt: null,
                  masteredAt: '2026-06-28T12:00:00.000Z',
                },
              ],
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('SECRET JOURNAL SENTENCE');
    expect(JSON.stringify(result)).not.toContain('PRIVATE NOTE');
  });
});
