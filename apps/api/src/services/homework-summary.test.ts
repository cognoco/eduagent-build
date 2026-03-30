jest.mock('./llm', () => ({
  routeAndCall: jest.fn(),
}));

import type { Database } from '@eduagent/database';
import { routeAndCall } from './llm';
import {
  extractAndStoreHomeworkSummary,
  extractHomeworkSummary,
  parseHomeworkSummaryResponse,
} from './homework-summary';

function createSelectChain(result: unknown[]) {
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createMockDb(): Database {
  const selectMock = jest
    .fn()
    .mockReturnValueOnce(
      createSelectChain([
        {
          subjectId: 'subject-1',
          metadata: {
            homework: {
              problemCount: 2,
              currentProblemIndex: 1,
              problems: [
                {
                  id: 'problem-1',
                  text: 'Solve 2x + 5 = 17',
                  source: 'ocr',
                  selectedMode: 'help_me',
                },
                {
                  id: 'problem-2',
                  text: 'Factor x^2 + 3x + 2',
                  source: 'manual',
                  selectedMode: 'check_answer',
                },
              ],
            },
          },
        },
      ])
    )
    .mockReturnValueOnce(
      createSelectChain([
        {
          name: 'Math',
        },
      ])
    )
    .mockReturnValueOnce(
      createSelectChain([
        {
          metadata: {
            homework: {
              problemCount: 2,
              currentProblemIndex: 1,
              problems: [],
            },
          },
        },
      ])
    );

  return {
    select: selectMock,
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    query: {
      sessionEvents: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventType: 'user_message',
            content: 'I think x = 6',
            createdAt: new Date('2026-03-01T10:00:00Z'),
          },
          {
            eventType: 'ai_response',
            content: 'Nice start. Check the subtraction first.',
            createdAt: new Date('2026-03-01T10:00:05Z'),
          },
        ]),
      },
    },
  } as unknown as Database;
}

describe('parseHomeworkSummaryResponse', () => {
  it('parses valid JSON from the LLM response', () => {
    const fallback = {
      problemCount: 1,
      practicedSkills: [],
      independentProblemCount: 1,
      guidedProblemCount: 0,
      summary: '1 problem completed.',
      displayTitle: 'Math Homework',
    };

    const result = parseHomeworkSummaryResponse(
      '{"problemCount":2,"practicedSkills":["linear equations"],"independentProblemCount":1,"guidedProblemCount":1,"summary":"2 problems, practiced linear equations.","displayTitle":"Math Homework"}',
      fallback
    );

    expect(result.problemCount).toBe(2);
    expect(result.practicedSkills).toEqual(['linear equations']);
    expect(result.guidedProblemCount).toBe(1);
  });

  it('falls back gracefully on malformed JSON', () => {
    const fallback = {
      problemCount: 1,
      practicedSkills: [],
      independentProblemCount: 1,
      guidedProblemCount: 0,
      summary: '1 problem completed.',
      displayTitle: 'Math Homework',
    };

    expect(parseHomeworkSummaryResponse('not-json', fallback)).toEqual(
      fallback
    );
  });
});

describe('extractHomeworkSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the parsed homework summary from the LLM', async () => {
    (routeAndCall as jest.Mock).mockResolvedValue({
      response:
        '{"problemCount":2,"practicedSkills":["linear equations"],"independentProblemCount":1,"guidedProblemCount":1,"summary":"2 problems, practiced linear equations.","displayTitle":"Math Homework"}',
    });

    const result = await extractHomeworkSummary(
      createMockDb(),
      'profile-1',
      'session-1'
    );

    expect(result.summary).toBe('2 problems, practiced linear equations.');
    expect(result.displayTitle).toBe('Math Homework');
  });

  it('falls back to metadata-derived summary when the LLM fails', async () => {
    (routeAndCall as jest.Mock).mockRejectedValue(new Error('LLM unavailable'));

    const result = await extractHomeworkSummary(
      createMockDb(),
      'profile-1',
      'session-1'
    );

    expect(result.problemCount).toBe(2);
    expect(result.guidedProblemCount).toBe(1);
    expect(result.displayTitle).toBe('Math Homework');
  });
});

describe('extractAndStoreHomeworkSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes homeworkSummary back into session metadata', async () => {
    (routeAndCall as jest.Mock).mockResolvedValue({
      response:
        '{"problemCount":2,"practicedSkills":["linear equations"],"independentProblemCount":1,"guidedProblemCount":1,"summary":"2 problems, practiced linear equations.","displayTitle":"Math Homework"}',
    });

    const db = createMockDb();
    await extractAndStoreHomeworkSummary(db, 'profile-1', 'session-1');

    expect(db.update).toHaveBeenCalled();
  });
});
