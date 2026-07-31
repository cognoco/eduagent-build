import type { Database } from '@eduagent/database';
import type { AssessmentRecord } from '@eduagent/schemas';
import {
  submitAssessmentAnswer,
  type SubmitAssessmentAnswerDependencies,
} from './assessments';

const PROFILE_ID = 'profile-1';
const ASSESSMENT_ID = 'assessment-1';

function makeAssessment(
  overrides: Partial<AssessmentRecord> = {},
): AssessmentRecord {
  return {
    id: ASSESSMENT_ID,
    profileId: PROFILE_ID,
    subjectId: 'subject-1',
    topicId: 'topic-1',
    sessionId: null,
    verificationDepth: 'recall',
    status: 'in_progress',
    masteryScore: 0,
    qualityRating: null,
    exchangeHistory: [],
    createdAt: '2026-07-08T10:00:00.000Z',
    updatedAt: '2026-07-08T10:00:00.000Z',
    ...overrides,
  };
}

describe('submitAssessmentAnswer', () => {
  it('keeps status update, retention update, and XP grant in one transaction', async () => {
    const tx = { tx: true } as unknown as Database;
    const db = {
      transaction: jest.fn(async (callback: (tx: Database) => unknown) =>
        callback(tx),
      ),
    } as unknown as Database;
    const snapshot = makeAssessment();
    const updated = makeAssessment({
      status: 'passed',
      masteryScore: 0.8,
      qualityRating: 4,
      exchangeHistory: [
        { role: 'user', content: 'My answer' },
        { role: 'assistant', content: 'Good next step.' },
      ],
      updatedAt: '2026-07-08T10:05:00.000Z',
    });
    const deps: SubmitAssessmentAnswerDependencies = {
      getAssessment: jest.fn().mockResolvedValue(snapshot),
      buildAssessmentAppHelpEvaluation: jest.fn().mockReturnValue(null),
      loadAssessmentTopicContext: jest.fn().mockResolvedValue({
        topicTitle: 'Gravity',
        topicDescription: 'Forces',
        subjectName: 'Physics',
        pedagogyMode: undefined,
        languageCode: null,
      }),
      lockAssessmentForAnswerSubmission: jest.fn().mockResolvedValue(snapshot),
      shouldEndAssessmentForReview: jest.fn().mockReturnValue(false),
      buildNeedsReviewEvaluation: jest.fn(),
      evaluateAssessmentAnswer: jest.fn().mockResolvedValue({
        feedback: 'Good next step.',
        passed: true,
        shouldEscalateDepth: false,
        masteryScore: 0.8,
        qualityRating: 4,
      }),
      resolveAssessmentStatus: jest.fn().mockReturnValue('passed'),
      updateAssessment: jest.fn().mockResolvedValue(updated),
      mapEvaluateQualityToSm2: jest.fn().mockReturnValue(4),
      updateRetentionFromSession: jest.fn().mockResolvedValue(undefined),
      insertSessionXpEntry: jest.fn().mockResolvedValue(undefined),
      recordAssessmentCompletionActivity: jest
        .fn()
        .mockResolvedValue(undefined),
      logger: {
        error: jest.fn(),
      },
      captureException: jest.fn(),
    };

    const result = await submitAssessmentAnswer(
      db,
      PROFILE_ID,
      ASSESSMENT_ID,
      'My answer',
      { deps },
    );

    if (!result) {
      throw new Error('expected assessment answer result');
    }
    expect(result.status).toBe('passed');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(deps.updateAssessment).toHaveBeenCalledWith(
      tx,
      PROFILE_ID,
      ASSESSMENT_ID,
      expect.objectContaining({ status: 'passed' }),
    );
    expect(deps.updateRetentionFromSession).toHaveBeenCalledWith(
      tx,
      PROFILE_ID,
      'topic-1',
      4,
      '2026-07-08T10:05:00.000Z',
    );
    expect(deps.insertSessionXpEntry).toHaveBeenCalledWith(
      tx,
      PROFILE_ID,
      'topic-1',
      'subject-1',
    );
    expect(deps.recordAssessmentCompletionActivity).toHaveBeenCalledWith(
      db,
      PROFILE_ID,
      updated,
      'passed',
      expect.objectContaining({ masteryScore: 0.8 }),
    );
  });

  // [WI-2472] The app-help branch is reached before the transaction, so only
  // the two deps below run. The rest satisfy the dependency contract.
  describe('[WI-2472] active app shell', () => {
    function makeAppHelpDeps(): SubmitAssessmentAnswerDependencies {
      return {
        getAssessment: jest
          .fn()
          .mockResolvedValue(makeAssessment({ masteryScore: 0.4 })),
        buildAssessmentAppHelpEvaluation: jest.fn().mockReturnValue({
          feedback: 'app-help reply',
          passed: false,
          shouldEscalateDepth: false,
          masteryScore: 0.4,
          qualityRating: 0,
          weakAreas: [],
        }),
        loadAssessmentTopicContext: jest.fn(),
        lockAssessmentForAnswerSubmission: jest.fn(),
        shouldEndAssessmentForReview: jest.fn(),
        buildNeedsReviewEvaluation: jest.fn(),
        evaluateAssessmentAnswer: jest.fn(),
        resolveAssessmentStatus: jest.fn(),
        updateAssessment: jest.fn(),
        mapEvaluateQualityToSm2: jest.fn(),
        updateRetentionFromSession: jest.fn(),
        insertSessionXpEntry: jest.fn(),
        recordAssessmentCompletionActivity: jest.fn(),
        logger: { error: jest.fn() },
        captureException: jest.fn(),
      };
    }

    const db = {
      transaction: jest.fn(),
    } as unknown as Database;

    it('forwards the reported v2 shell to the app-help evaluation', async () => {
      const deps = makeAppHelpDeps();

      const result = await submitAssessmentAnswer(
        db,
        PROFILE_ID,
        ASSESSMENT_ID,
        'Where are my notes?',
        { deps, shell: 'v2' },
      );

      expect(result?.kind).toBe('app_help');
      expect(deps.buildAssessmentAppHelpEvaluation).toHaveBeenCalledWith(
        'Where are my notes?',
        0.4,
        'v2',
      );
    });

    it('forwards the reported v0 shell to the app-help evaluation', async () => {
      const deps = makeAppHelpDeps();

      await submitAssessmentAnswer(
        db,
        PROFILE_ID,
        ASSESSMENT_ID,
        'Where are my notes?',
        { deps, shell: 'v0' },
      );

      expect(deps.buildAssessmentAppHelpEvaluation).toHaveBeenCalledWith(
        'Where are my notes?',
        0.4,
        'v0',
      );
    });

    it('forwards no shell when the caller reported none', async () => {
      const deps = makeAppHelpDeps();

      await submitAssessmentAnswer(
        db,
        PROFILE_ID,
        ASSESSMENT_ID,
        'Where are my notes?',
        { deps },
      );

      expect(deps.buildAssessmentAppHelpEvaluation).toHaveBeenCalledWith(
        'Where are my notes?',
        0.4,
        undefined,
      );
    });
  });
});
