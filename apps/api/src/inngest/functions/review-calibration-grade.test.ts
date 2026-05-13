import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { handleReviewCalibrationGrade } from './review-calibration-grade';

async function executeHandler(eventData: unknown) {
  const { step, runCalls } = createInngestStepRunner();
  const result = await handleReviewCalibrationGrade({
    // handleReviewCalibrationGrade declares `event: { data: unknown }` and
    // TS2353 rejects excess properties on object literals — `name` is
    // intentionally omitted here. Do not add it back.
    event: { data: eventData },
    step: step as unknown as {
      run: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>;
    },
  });
  return { result, runCalls };
}

describe('reviewCalibrationGrade', () => {
  it('skips invalid payloads before running any steps', async () => {
    const { result, runCalls } = await executeHandler({
      profileId: 'profile-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      learnerMessage: 'Plants turn sunlight into food.',
      topicTitle: 'Photosynthesis',
      // Missing timestamp: every durable app event payload must carry one.
    });

    expect(result).toEqual({ skipped: 'invalid_payload' });
    expect(runCalls).toHaveLength(0);
  });
});
