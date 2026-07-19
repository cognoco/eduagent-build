const mockGetStepDatabase = jest.fn();
const mockGetStepMentorNoticeEnabled = jest.fn();
const mockFade = jest.fn();

jest.mock(
  '../helpers' /* gc1-allow: Inngest step DB and feature-flag boundary */,
  () => ({
    ...jest.requireActual('../helpers'),
    getStepDatabase: () => mockGetStepDatabase(),
    getStepMentorNoticeEnabled: () => mockGetStepMentorNoticeEnabled(),
  }),
);

jest.mock(
  '../../services/mentor-notices' /* gc1-allow: service orchestration boundary; service behavior has direct tests */,
  () => ({
    ...jest.requireActual('../../services/mentor-notices'),
    fadeStaleMentorNotices: (...args: unknown[]) => mockFade(...args),
  }),
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { mentorNoticeFade } from './mentor-notice-fade';

async function execute() {
  return (mentorNoticeFade as any).fn({
    step: createInngestStepRunner().step,
  });
}

describe('mentorNoticeFade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue({ marker: 'db' });
    mockGetStepMentorNoticeEnabled.mockResolvedValue(true);
  });

  it('does not touch notices while the feature is disabled', async () => {
    mockGetStepMentorNoticeEnabled.mockResolvedValue(false);

    await expect(execute()).resolves.toEqual({ faded: 0 });
    expect(mockFade).not.toHaveBeenCalled();
  });

  it('uses a 21-day inactivity cutoff', async () => {
    const now = new Date('2026-07-22T03:45:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    mockFade.mockResolvedValue(2);
    try {
      await expect(execute()).resolves.toEqual({ faded: 2 });
      expect(mockFade).toHaveBeenCalledWith(
        { marker: 'db' },
        new Date('2026-07-01T03:45:00.000Z'),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
