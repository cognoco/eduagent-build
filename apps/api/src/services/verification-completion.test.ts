// ---------------------------------------------------------------------------
// Verification Completion Service — Tests
// ---------------------------------------------------------------------------

import { createDatabaseModuleMock } from '../test-utils/database-module';

const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  exports: {
    createScopedRepository: jest.fn(),
  },
});

jest.mock('@eduagent/database', () => mockDatabaseModule.module);

jest.mock('./evaluate', () => ({
  parseEvaluateAssessment: jest.fn(),
  mapEvaluateQualityToSm2: jest.fn(),
  handleEvaluateFailure: jest.fn(),
}));

jest.mock('./teach-back', () => ({
  parseTeachBackAssessment: jest.fn(),
  mapTeachBackRubricToSm2: jest.fn(),
}));

import type { Database } from '@eduagent/database';
import {
  processEvaluateCompletion,
  processTeachBackCompletion,
} from './verification-completion';
import {
  parseEvaluateAssessment,
  mapEvaluateQualityToSm2,
  handleEvaluateFailure,
} from './evaluate';
import {
  parseTeachBackAssessment,
  mapTeachBackRubricToSm2,
} from './teach-back';

const profileId = 'profile-001';
const sessionId = 'session-001';
const topicId = 'topic-001';

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

function createMockDb({ selectResults = [] as unknown[][] } = {}): Database {
  let selectCallIndex = 0;
  const selectMock = jest.fn(() => {
    const result = selectResults[selectCallIndex] ?? [];
    selectCallIndex++;

    const limitReturn = Object.assign(Promise.resolve(result), {});
    const orderByReturn = Object.assign(Promise.resolve(result), {
      limit: jest.fn().mockReturnValue(limitReturn),
    });
    const whereReturn = Object.assign(Promise.resolve(result), {
      orderBy: jest.fn().mockReturnValue(orderByReturn),
      limit: jest.fn().mockReturnValue(limitReturn),
    });

    return {
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue(whereReturn),
      }),
    };
  });

  return {
    select: selectMock,
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Database;
}

// ---------------------------------------------------------------------------
// processEvaluateCompletion
// ---------------------------------------------------------------------------

describe('processEvaluateCompletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when no assessment is found in events', async () => {
    (parseEvaluateAssessment as jest.Mock).mockReturnValue(null);

    const db = createMockDb({
      selectResults: [
        // ai_response events
        [{ id: 'event-1', content: 'No JSON here', createdAt: new Date() }],
      ],
    });

    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    expect(mapEvaluateQualityToSm2).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates retention card difficulty rung on successful challenge', async () => {
    const assessment = {
      challengePassed: true,
      flawIdentified: 'wrong formula',
      quality: 4,
    };
    (parseEvaluateAssessment as jest.Mock).mockReturnValue(assessment);
    (mapEvaluateQualityToSm2 as jest.Mock).mockReturnValue(4);

    const db = createMockDb({
      selectResults: [
        // ai_response events
        [
          {
            id: 'event-1',
            content: '{"challengePassed": true, "quality": 4}',
            createdAt: new Date(),
          },
        ],
        // retention card
        [
          {
            id: 'card-1',
            topicId,
            profileId,
            evaluateDifficultyRung: 2,
            easeFactor: 2.7,
            repetitions: 3,
          },
        ],
      ],
    });

    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    // Should update retention card (rung advances from 2 to 3)
    expect(db.update).toHaveBeenCalled();
    const setFn = (db.update as jest.Mock).mock.results[0].value.set;
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluateDifficultyRung: 3, // advanced from 2
      })
    );
  });

  it('handles failure with lower difficulty action', async () => {
    const assessment = {
      challengePassed: false,
      quality: 1,
    };
    (parseEvaluateAssessment as jest.Mock).mockReturnValue(assessment);
    (mapEvaluateQualityToSm2 as jest.Mock).mockReturnValue(2);
    (handleEvaluateFailure as jest.Mock).mockReturnValue({
      action: 'lower_difficulty',
      message: 'Lowering difficulty',
      newDifficultyRung: 1,
    });

    const db = createMockDb({
      selectResults: [
        // ai_response events
        [
          {
            id: 'event-1',
            content: '{"challengePassed": false, "quality": 1}',
            createdAt: new Date(),
          },
        ],
        // retention card
        [
          {
            id: 'card-1',
            topicId,
            profileId,
            evaluateDifficultyRung: 2,
          },
        ],
      ],
    });

    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    const setFn = (db.update as jest.Mock).mock.results[0].value.set;
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluateDifficultyRung: 1, // lowered
      })
    );
  });

  it('counts consecutive EVALUATE failures from prior events (2nd failure)', async () => {
    const assessment = {
      challengePassed: false,
      quality: 1,
    };
    (parseEvaluateAssessment as jest.Mock).mockReturnValue(assessment);
    (mapEvaluateQualityToSm2 as jest.Mock).mockReturnValue(2);
    (handleEvaluateFailure as jest.Mock).mockReturnValue({
      action: 'lower_difficulty',
      message: 'Lowering difficulty',
      newDifficultyRung: 1,
    });

    const db = createMockDb({
      selectResults: [
        // ai_response events — most recent first (desc createdAt)
        // event-1 is current (failed), event-2 is prior (also failed)
        [
          {
            id: 'event-1',
            content: '{"challengePassed": false, "quality": 1}',
            createdAt: new Date('2026-01-01T10:02:00Z'),
            structuredAssessment: {
              type: 'evaluate',
              challengePassed: false,
            },
          },
          {
            id: 'event-2',
            content: '{"challengePassed": false, "quality": 1}',
            createdAt: new Date('2026-01-01T10:01:00Z'),
            structuredAssessment: {
              type: 'evaluate',
              challengePassed: false,
            },
          },
        ],
        // retention card
        [
          {
            id: 'card-1',
            topicId,
            profileId,
            evaluateDifficultyRung: 3,
          },
        ],
      ],
    });

    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    // handleEvaluateFailure should be called with 2 (not hardcoded 1)
    expect(handleEvaluateFailure).toHaveBeenCalledWith(2, 3);
  });

  it('counts consecutive EVALUATE failures — stops at first non-failure', async () => {
    // Per-call mocks: events[0] = current failure, events[1] = prior success, events[2] = older failure
    (parseEvaluateAssessment as jest.Mock)
      .mockReturnValueOnce({ challengePassed: false, quality: 1 }) // events[0]: current assessment
      .mockReturnValueOnce({ challengePassed: true, quality: 4 }) // events[1]: backward walk — success breaks chain
      .mockReturnValueOnce({ challengePassed: false, quality: 1 }); // events[2]: never reached
    (mapEvaluateQualityToSm2 as jest.Mock).mockReturnValue(2);
    (handleEvaluateFailure as jest.Mock).mockReturnValue({
      action: 'reveal_flaw',
      message: 'Reveal flaw',
    });

    const db = createMockDb({
      selectResults: [
        // events: current failed, prior succeeded, older failed
        [
          {
            id: 'event-1',
            content: '{"challengePassed": false}',
            createdAt: new Date('2026-01-01T10:03:00Z'),
            structuredAssessment: {
              type: 'evaluate',
              challengePassed: false,
            },
          },
          {
            id: 'event-2',
            content: '{"challengePassed": true}',
            createdAt: new Date('2026-01-01T10:02:00Z'),
            structuredAssessment: {
              type: 'evaluate',
              challengePassed: true,
            },
          },
          {
            id: 'event-3',
            content: '{"challengePassed": false}',
            createdAt: new Date('2026-01-01T10:01:00Z'),
            structuredAssessment: {
              type: 'evaluate',
              challengePassed: false,
            },
          },
        ],
        // retention card
        [
          {
            id: 'card-1',
            topicId,
            profileId,
            evaluateDifficultyRung: 2,
          },
        ],
      ],
    });

    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    // Only 1 consecutive failure (the current one) because event-2 passed
    expect(handleEvaluateFailure).toHaveBeenCalledWith(1, 2);
  });

  it('resets to rung 1 on exit_to_standard action', async () => {
    const assessment = {
      challengePassed: false,
      quality: 0,
    };
    (parseEvaluateAssessment as jest.Mock).mockReturnValue(assessment);
    (mapEvaluateQualityToSm2 as jest.Mock).mockReturnValue(2);
    (handleEvaluateFailure as jest.Mock).mockReturnValue({
      action: 'exit_to_standard',
      message: 'Exit to standard',
    });

    const db = createMockDb({
      selectResults: [
        [
          {
            id: 'event-1',
            content: '{"challengePassed": false}',
            createdAt: new Date(),
          },
        ],
        [
          {
            id: 'card-1',
            topicId,
            profileId,
            evaluateDifficultyRung: 3,
          },
        ],
      ],
    });

    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    const setFn = (db.update as jest.Mock).mock.results[0].value.set;
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluateDifficultyRung: 1,
      })
    );
  });

  it('defaults evaluateDifficultyRung to 1 when null on card', async () => {
    const assessment = {
      challengePassed: true,
      quality: 5,
    };
    (parseEvaluateAssessment as jest.Mock).mockReturnValue(assessment);
    (mapEvaluateQualityToSm2 as jest.Mock).mockReturnValue(5);

    const db = createMockDb({
      selectResults: [
        [
          {
            id: 'event-1',
            content: '{"challengePassed": true, "quality": 5}',
            createdAt: new Date(),
          },
        ],
        [
          {
            id: 'card-1',
            topicId,
            profileId,
            evaluateDifficultyRung: null,
          },
        ],
      ],
    });

    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    // Default rung 1, on success advances to 2
    const setFn = (db.update as jest.Mock).mock.results[0].value.set;
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluateDifficultyRung: 2,
      })
    );
  });

  it('does nothing when no retention card exists', async () => {
    const assessment = {
      challengePassed: true,
      quality: 4,
    };
    (parseEvaluateAssessment as jest.Mock).mockReturnValue(assessment);

    const db = createMockDb({
      selectResults: [
        [
          {
            id: 'event-1',
            content: 'some content',
            createdAt: new Date(),
          },
        ],
        [], // no retention card
      ],
    });

    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    expect(db.update).not.toHaveBeenCalled();
  });

  it('persists structuredAssessment to the assessment-producing event, not events[0], when a later non-assessment event is first [CR-PR129-M3]', async () => {
    // events[0] is a later ai_response that has no parseable assessment.
    // events[1] is the actual assessment-producing event.
    // The fix must write structuredAssessment to events[1].id, not events[0].id.
    const assessment = { challengePassed: true, quality: 4 };
    (parseEvaluateAssessment as jest.Mock)
      .mockReturnValueOnce(null) // events[0]: no assessment (later non-assessment event)
      .mockReturnValueOnce(assessment); // events[1]: assessment found here
    (mapEvaluateQualityToSm2 as jest.Mock).mockReturnValue(4);

    const laterEvent = {
      id: 'event-latest',
      content: 'just a follow-up message',
      createdAt: new Date('2026-01-01T10:05:00Z'),
    };
    const assessmentEvent = {
      id: 'event-assessment',
      content: '{"challengePassed": true, "quality": 4}',
      createdAt: new Date('2026-01-01T10:04:00Z'),
    };

    // Track the id passed into the where() clause of the session event update.
    // We build a custom update mock that records the structured-assessment set payload
    // and the where arguments separately for the two update calls (card vs event).
    const eventUpdateWhereSpy = jest.fn().mockResolvedValue(undefined);
    const eventUpdateSetSpy = jest
      .fn()
      .mockReturnValue({ where: eventUpdateWhereSpy });
    const cardUpdateWhereSpy = jest.fn().mockResolvedValue(undefined);
    const cardUpdateSetSpy = jest
      .fn()
      .mockReturnValue({ where: cardUpdateWhereSpy });

    let updateCallCount = 0;
    const updateSpy = jest.fn(() => {
      // First call = retention card, second call = session event
      updateCallCount++;
      return {
        set: updateCallCount === 1 ? cardUpdateSetSpy : eventUpdateSetSpy,
      };
    });

    const db = createMockDb({
      selectResults: [
        [laterEvent, assessmentEvent],
        [{ id: 'card-1', topicId, profileId, evaluateDifficultyRung: 2 }],
      ],
    });
    // Override the update mock with our tracking version
    (db as unknown as { update: jest.Mock }).update = updateSpy;

    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    // Must have been called twice: once for card, once for event
    expect(updateSpy).toHaveBeenCalledTimes(2);

    // The event update must carry a structuredAssessment for 'evaluate'
    expect(eventUpdateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAssessment: expect.objectContaining({ type: 'evaluate' }),
      })
    );

    // The where clause for the event update must reference 'event-assessment', not 'event-latest'.
    // We inspect via the drizzle eq() call: eq(sessionEvents.id, id) returns an SQL object
    // whose queryChunks contain the id value as a param.
    // Extract param values from the drizzle SQL `and(eq(...), eq(...))` passed to .where().
    // Drizzle SQL objects have a `queryChunks` array; `Param` instances have a `.value` field.
    // We collect all non-circular leaf string/number values from queryChunks recursively.
    function extractParamValues(
      node: unknown,
      visited = new WeakSet<object>()
    ): string[] {
      if (node === null || node === undefined) return [];
      if (typeof node !== 'object') return [String(node)];
      if (visited.has(node as object)) return [];
      visited.add(node as object);
      const values: string[] = [];
      const obj = node as Record<string, unknown>;
      // Drizzle Param has a `.value` property that is the raw SQL parameter
      if (
        'value' in obj &&
        (typeof obj['value'] === 'string' || typeof obj['value'] === 'number')
      ) {
        values.push(String(obj['value']));
      }
      // Recurse into queryChunks (SQL) and left/right (BinaryOperator / and/or)
      for (const key of ['queryChunks', 'left', 'right', 'conditions']) {
        if (key in obj) {
          const child = obj[key];
          if (Array.isArray(child)) {
            for (const item of child)
              values.push(...extractParamValues(item, visited));
          } else {
            values.push(...extractParamValues(child, visited));
          }
        }
      }
      return values;
    }

    const whereCallArgs: unknown[] = eventUpdateWhereSpy.mock.calls[0] ?? [];
    const paramValues = whereCallArgs.flatMap((a) => extractParamValues(a));
    expect(paramValues).toContain('event-assessment');
    expect(paramValues).not.toContain('event-latest');
  });

  it('caps difficulty rung at 4 on success', async () => {
    const assessment = {
      challengePassed: true,
      quality: 5,
    };
    (parseEvaluateAssessment as jest.Mock).mockReturnValue(assessment);
    (mapEvaluateQualityToSm2 as jest.Mock).mockReturnValue(5);

    const db = createMockDb({
      selectResults: [
        [
          {
            id: 'event-1',
            content: '{"challengePassed": true, "quality": 5}',
            createdAt: new Date(),
          },
        ],
        [
          {
            id: 'card-1',
            topicId,
            profileId,
            evaluateDifficultyRung: 4,
          },
        ],
      ],
    });

    await processEvaluateCompletion(db, profileId, sessionId, topicId);

    const setFn = (db.update as jest.Mock).mock.results[0].value.set;
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluateDifficultyRung: 4, // stays at 4, doesn't go to 5
      })
    );
  });
});

// ---------------------------------------------------------------------------
// processTeachBackCompletion
// ---------------------------------------------------------------------------

describe('processTeachBackCompletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when no assessment is found in events', async () => {
    (parseTeachBackAssessment as jest.Mock).mockReturnValue(null);

    const db = createMockDb({
      selectResults: [
        [{ id: 'event-1', content: 'No JSON here', createdAt: new Date() }],
      ],
    });

    await processTeachBackCompletion(db, profileId, sessionId);

    expect(mapTeachBackRubricToSm2).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('stores structured assessment in event on success', async () => {
    const assessment = {
      completeness: 4,
      accuracy: 3,
      clarity: 5,
      overallQuality: 4,
      weakestArea: 'accuracy' as const,
      gapIdentified: 'missed conservation law',
    };
    (parseTeachBackAssessment as jest.Mock).mockReturnValue(assessment);
    (mapTeachBackRubricToSm2 as jest.Mock).mockReturnValue(4);

    const db = createMockDb({
      selectResults: [
        [
          {
            id: 'event-1',
            content: 'some response with JSON',
            createdAt: new Date(),
          },
        ],
      ],
    });

    await processTeachBackCompletion(db, profileId, sessionId);

    // Should update the event with structured assessment
    expect(db.update).toHaveBeenCalled();
    const setFn = (db.update as jest.Mock).mock.results[0].value.set;
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAssessment: expect.objectContaining({
          type: 'teach_back',
          completeness: 4,
          accuracy: 3,
          clarity: 5,
          sm2Quality: 4,
        }),
      })
    );
  });

  it('does nothing when no events found', async () => {
    (parseTeachBackAssessment as jest.Mock).mockReturnValue(null);

    const db = createMockDb({
      selectResults: [[]],
    });

    await processTeachBackCompletion(db, profileId, sessionId);

    expect(db.update).not.toHaveBeenCalled();
  });

  it('persists structuredAssessment to the assessment-producing event, not events[0], when a later non-assessment event is first [CR-PR129-M3]', async () => {
    // events[0] is a later ai_response with no parseable assessment.
    // events[1] is the actual assessment-producing event.
    const assessment = {
      completeness: 4,
      accuracy: 4,
      clarity: 3,
      overallQuality: 4,
      weakestArea: 'clarity' as const,
      gapIdentified: 'missed friction',
    };
    (parseTeachBackAssessment as jest.Mock)
      .mockReturnValueOnce(null) // events[0]: no assessment
      .mockReturnValueOnce(assessment); // events[1]: assessment found here
    (mapTeachBackRubricToSm2 as jest.Mock).mockReturnValue(4);

    const laterEvent = {
      id: 'event-latest',
      content: 'follow-up exchange',
      createdAt: new Date('2026-01-01T10:05:00Z'),
    };
    const assessmentEvent = {
      id: 'event-assessment',
      content: '{"completeness": 4, "accuracy": 4}',
      createdAt: new Date('2026-01-01T10:04:00Z'),
    };

    const eventUpdateWhereSpy = jest.fn().mockResolvedValue(undefined);
    const eventUpdateSetSpy = jest
      .fn()
      .mockReturnValue({ where: eventUpdateWhereSpy });
    const updateSpy = jest.fn(() => ({ set: eventUpdateSetSpy }));

    const db = createMockDb({
      selectResults: [[laterEvent, assessmentEvent]],
    });
    (db as unknown as { update: jest.Mock }).update = updateSpy;

    await processTeachBackCompletion(db, profileId, sessionId);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(eventUpdateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredAssessment: expect.objectContaining({ type: 'teach_back' }),
      })
    );

    function extractParamValues(
      node: unknown,
      visited = new WeakSet<object>()
    ): string[] {
      if (node === null || node === undefined) return [];
      if (typeof node !== 'object') return [String(node)];
      if (visited.has(node as object)) return [];
      visited.add(node as object);
      const values: string[] = [];
      const obj = node as Record<string, unknown>;
      if (
        'value' in obj &&
        (typeof obj['value'] === 'string' || typeof obj['value'] === 'number')
      ) {
        values.push(String(obj['value']));
      }
      for (const key of ['queryChunks', 'left', 'right', 'conditions']) {
        if (key in obj) {
          const child = obj[key];
          if (Array.isArray(child)) {
            for (const item of child)
              values.push(...extractParamValues(item, visited));
          } else {
            values.push(...extractParamValues(child, visited));
          }
        }
      }
      return values;
    }

    const whereCallArgs: unknown[] = eventUpdateWhereSpy.mock.calls[0] ?? [];
    const paramValues = whereCallArgs.flatMap((a) => extractParamValues(a));
    expect(paramValues).toContain('event-assessment');
    expect(paramValues).not.toContain('event-latest');
  });
});
