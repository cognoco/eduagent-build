import type { Database } from '@eduagent/database';
import type { AssessmentRecord } from '@eduagent/schemas';
import {
  submitAssessmentAnswer,
  type SubmitAssessmentAnswerDependencies,
} from './assessments';
import { ConsentWithdrawnError } from './session';

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
  function makeHarness(
    overrides: {
      buildAssessmentAppHelpEvaluation?: jest.Mock;
      shouldEndAssessmentForReview?: jest.Mock;
      assertLlmConsent?: jest.Mock;
    } = {},
  ) {
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
      buildAssessmentAppHelpEvaluation:
        overrides.buildAssessmentAppHelpEvaluation ??
        jest.fn().mockReturnValue(null),
      loadAssessmentTopicContext: jest.fn().mockResolvedValue({
        topicTitle: 'Gravity',
        topicDescription: 'Forces',
        subjectName: 'Physics',
        pedagogyMode: undefined,
        languageCode: null,
      }),
      lockAssessmentForAnswerSubmission: jest.fn().mockResolvedValue(snapshot),
      shouldEndAssessmentForReview:
        overrides.shouldEndAssessmentForReview ??
        jest.fn().mockReturnValue(false),
      buildNeedsReviewEvaluation: jest.fn().mockReturnValue({
        feedback: 'Review needed.',
        passed: false,
        shouldEscalateDepth: false,
        masteryScore: 0,
        qualityRating: 0,
      }),
      assertLlmConsent:
        overrides.assertLlmConsent ?? jest.fn().mockResolvedValue(undefined),
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
      logger: { error: jest.fn() },
      captureException: jest.fn(),
    };
    return { db, tx, deps, updated };
  }

  it('keeps status update, retention update, and XP grant in one transaction', async () => {
    const { db, tx, deps, updated } = makeHarness();

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

  it('keeps the deterministic app-help reply available after consent withdrawal', async () => {
    const appHelpEvaluation = {
      feedback: 'Explorer mode lets you investigate a topic.',
      passed: false,
      shouldEscalateDepth: false,
      masteryScore: 0,
      qualityRating: 0,
    };
    const assertLlmConsent = jest
      .fn()
      .mockRejectedValue(new ConsentWithdrawnError());
    const { db, deps } = makeHarness({
      buildAssessmentAppHelpEvaluation: jest
        .fn()
        .mockReturnValue(appHelpEvaluation),
      assertLlmConsent,
    });

    await expect(
      submitAssessmentAnswer(db, PROFILE_ID, ASSESSMENT_ID, 'explorer mode', {
        deps,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'app_help',
        evaluation: appHelpEvaluation,
      }),
    );
    expect(assertLlmConsent).not.toHaveBeenCalled();
    expect(deps.evaluateAssessmentAnswer).not.toHaveBeenCalled();
  });

  it('keeps the deterministic force-review branch available after consent withdrawal', async () => {
    const assertLlmConsent = jest
      .fn()
      .mockRejectedValue(new ConsentWithdrawnError());
    const { db, deps } = makeHarness({
      shouldEndAssessmentForReview: jest.fn().mockReturnValue(true),
      assertLlmConsent,
    });

    await expect(
      submitAssessmentAnswer(db, PROFILE_ID, ASSESSMENT_ID, 'I need review', {
        deps,
      }),
    ).resolves.toEqual(expect.objectContaining({ kind: 'evaluated' }));
    expect(assertLlmConsent).not.toHaveBeenCalled();
    expect(deps.buildNeedsReviewEvaluation).toHaveBeenCalledTimes(1);
    expect(deps.evaluateAssessmentAnswer).not.toHaveBeenCalled();
  });

  it('fails closed before assessment evaluation when consent is withdrawn', async () => {
    const assertLlmConsent = jest
      .fn()
      .mockRejectedValue(new ConsentWithdrawnError());
    const { db, tx, deps } = makeHarness({ assertLlmConsent });

    await expect(
      submitAssessmentAnswer(db, PROFILE_ID, ASSESSMENT_ID, 'My answer', {
        deps,
      }),
    ).rejects.toBeInstanceOf(ConsentWithdrawnError);
    expect(assertLlmConsent).toHaveBeenCalledWith(tx, PROFILE_ID);
    expect(deps.evaluateAssessmentAnswer).not.toHaveBeenCalled();
    expect(deps.updateAssessment).not.toHaveBeenCalled();
  });
});
