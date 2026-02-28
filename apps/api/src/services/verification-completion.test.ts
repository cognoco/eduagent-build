// ---------------------------------------------------------------------------
// Verification Completion Service — Tests
// ---------------------------------------------------------------------------

jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    createScopedRepository: jest.fn(),
  };
});

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

function createMockDb({
  selectResults = [] as unknown[][],
} = {}): Database {
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
            easeFactor: '2.70',
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

    await processTeachBackCompletion(db, profileId, sessionId, topicId);

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

    await processTeachBackCompletion(db, profileId, sessionId, topicId);

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

    await processTeachBackCompletion(db, profileId, sessionId, topicId);

    expect(db.update).not.toHaveBeenCalled();
  });
});
