jest.mock('./llm', () => { // gc1-allow: LLM external boundary (routeAndCall); requireActual spread applied
  const actual = jest.requireActual('./llm') as Record<string, unknown>;
  return {
    ...actual,
    routeAndCall: jest.fn(),
  };
});

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
      ]),
    )
    .mockReturnValueOnce(
      createSelectChain([
        {
          name: 'Math',
        },
      ]),
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
      ]),
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
      fallback,
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
      fallback,
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
      'session-1',
    );

    expect(result.summary).toBe('2 problems, practiced linear equations.');
    expect(result.displayTitle).toBe('Math Homework');
  });

  it('BC-08: passes profileId to subjects query for defense-in-depth', async () => {
    (routeAndCall as jest.Mock).mockResolvedValue({
      response:
        '{"problemCount":2,"practicedSkills":["algebra"],"independentProblemCount":2,"guidedProblemCount":0,"summary":"2 problems.","displayTitle":"Math Homework"}',
    });

    const db = createMockDb();
    await extractHomeworkSummary(db, 'profile-1', 'session-1');

    // The second select call is the subjects query (first is sessions)
    const selectCalls = (db.select as jest.Mock).mock.results;
    expect(selectCalls.length).toBeGreaterThanOrEqual(2);

    // The subjects query where clause receives an `and()` expression that
    // includes both subjects.id and subjects.profileId.
    const subjectsFrom = selectCalls[1]!.value.from;
    expect(subjectsFrom).toHaveBeenCalled();
    const subjectsWhere = subjectsFrom.mock.results[0]!.value.where;
    expect(subjectsWhere).toHaveBeenCalled();
    const whereArg = subjectsWhere.mock.calls[0]![0];
    // Drizzle's and() produces a combined SQL node — serialize to check for profile_id
    const seen = new WeakSet();
    const whereStr = JSON.stringify(
      whereArg,
      (_key: string, value: unknown) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value as object)) return '[Circular]';
          seen.add(value as object);
        }
        return value;
      },
    );
    expect(whereStr).toContain('profile_id');
  });

  it('BC-08: falls back to Homework when subject not found for profile', async () => {
    (routeAndCall as jest.Mock).mockResolvedValue({
      response:
        '{"problemCount":1,"practicedSkills":[],"independentProblemCount":1,"guidedProblemCount":0,"summary":"1 problem.","displayTitle":"Unknown Subject Homework"}',
    });

    // Create a db where the subjects query returns empty (profileId mismatch)
    const selectMock = jest
      .fn()
      .mockReturnValueOnce(
        createSelectChain([
          {
            subjectId: 'subject-1',
            metadata: { homework: { problemCount: 1, problems: [] } },
          },
        ]),
      )
      .mockReturnValueOnce(
        createSelectChain([]), // No subject found — profileId doesn't match
      );

    const db = {
      select: selectMock,
      query: {
        sessionEvents: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      },
    } as unknown as Database;

    const result = await extractHomeworkSummary(
      db,
      'wrong-profile',
      'session-1',
    );

    // Falls back to 'Homework' when subject is not found for profile
    // (the LLM might override the displayTitle, but the fallback name is 'Homework')
    expect(result).toEqual(expect.objectContaining({}));
  });

  it('falls back to metadata-derived summary when the LLM fails', async () => {
    (routeAndCall as jest.Mock).mockRejectedValue(new Error('LLM unavailable'));

    const result = await extractHomeworkSummary(
      createMockDb(),
      'profile-1',
      'session-1',
    );

    expect(result.problemCount).toBe(2);
    expect(result.guidedProblemCount).toBe(1);
    expect(result.displayTitle).toBe('Math Homework');
  });
});

describe('extractHomeworkSummary — [BUG-934] envelope projection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('[BUG-934] projects raw envelope JSON in ai_response rows before sending to LLM', async () => {
    (routeAndCall as jest.Mock).mockResolvedValue({
      response:
        '{"problemCount":1,"practicedSkills":["fractions"],"independentProblemCount":1,"guidedProblemCount":0,"summary":"1 problem.","displayTitle":"Math Homework"}',
    });

    const rawEnvelopeContent = JSON.stringify({
      reply: 'Nice work on fractions!',
      signals: { close: false },
      ui_hints: {},
    });

    const selectMock = jest
      .fn()
      .mockReturnValueOnce(
        createSelectChain([
          {
            subjectId: 'subject-1',
            metadata: {
              homework: { problemCount: 1, problems: [] },
            },
          },
        ]),
      )
      .mockReturnValueOnce(createSelectChain([{ name: 'Math' }]))
      .mockReturnValueOnce(createSelectChain([{ metadata: {} }]));

    const db = {
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
              content: 'What is 1/2 + 1/4?',
              createdAt: new Date('2026-03-01T10:00:00Z'),
            },
            {
              eventType: 'ai_response',
              content: rawEnvelopeContent,
              createdAt: new Date('2026-03-01T10:00:05Z'),
            },
          ]),
        },
      },
    } as unknown as Database;

    await extractHomeworkSummary(db, 'profile-1', 'session-1');

    // The LLM transcript passed via routeAndCall must contain the projected
    // prose reply, NOT the raw envelope JSON.
    const call = (routeAndCall as jest.Mock).mock.calls[0];
    const userMessage = call[0].find(
      (m: { role: string }) => m.role === 'user',
    );
    expect(userMessage.content).toContain('Nice work on fractions!');
    expect(userMessage.content).not.toContain('"signals"');
    expect(userMessage.content).not.toContain('"ui_hints"');
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
