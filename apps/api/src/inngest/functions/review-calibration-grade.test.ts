import { reviewCalibrationGrade } from './review-calibration-grade';

async function executeHandler(eventData: unknown) {
  const mockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
  const handler = (reviewCalibrationGrade as any).fn;
  const result = await handler({
    event: { data: eventData, name: 'app/review.calibration.requested' },
    step: mockStep,
  });
  return { result, mockStep };
}

describe('reviewCalibrationGrade', () => {
  it('skips invalid payloads before running any steps', async () => {
    const { result, mockStep } = await executeHandler({
      profileId: 'profile-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      learnerMessage: 'Plants turn sunlight into food.',
      topicTitle: 'Photosynthesis',
      // Missing timestamp: every durable app event payload must carry one.
    });

    expect(result).toEqual({ skipped: 'invalid_payload' });
    expect(mockStep.run).not.toHaveBeenCalled();
  });
});
