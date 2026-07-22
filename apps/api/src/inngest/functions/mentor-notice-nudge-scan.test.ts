const mockGetStepDatabase = jest.fn();
const mockGetStepMentorNoticeEnabled = jest.fn();
const mockGetStepMentorNoticePushPostMvpEnabled = jest.fn();
const mockFindEligibleNudges = jest.fn();

jest.mock(
  '../helpers' /* gc1-allow: Inngest step DB and feature-flag boundary */,
  () => ({
    ...jest.requireActual('../helpers'),
    getStepDatabase: () => mockGetStepDatabase(),
    getStepMentorNoticeEnabled: () => mockGetStepMentorNoticeEnabled(),
    getStepMentorNoticePushPostMvpEnabled: () =>
      mockGetStepMentorNoticePushPostMvpEnabled(),
  }),
);

jest.mock(
  '../../services/mentor-notices' /* gc1-allow: service orchestration boundary; query behavior has direct tests */,
  () => ({
    ...jest.requireActual('../../services/mentor-notices'),
    findEligibleMentorNoticeNudges: (...args: unknown[]) =>
      mockFindEligibleNudges(...args),
  }),
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { mentorNoticeNudgeScan } from './mentor-notice-nudge-scan';

async function execute() {
  const runner = createInngestStepRunner();
  const result = await (mentorNoticeNudgeScan as any).fn({ step: runner.step });
  return { result, sendEventCalls: runner.sendEventCalls };
}

describe('mentorNoticeNudgeScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue({ marker: 'db' });
    mockGetStepMentorNoticeEnabled.mockResolvedValue(true);
    mockFindEligibleNudges.mockResolvedValue([]);
    // [WI-2573] See the sibling send suite — these cases describe the delivery
    // path, which only exists with the post-MVP push boundary open.
    mockGetStepMentorNoticePushPostMvpEnabled.mockResolvedValue(true);
  });

  it('[WI-2573] scans nothing and fans out nothing while the post-MVP push boundary is closed', async () => {
    mockGetStepMentorNoticePushPostMvpEnabled.mockResolvedValue(false);
    mockFindEligibleNudges.mockResolvedValue([
      { noticeId: 'notice-1', profileId: 'profile-1' },
    ]);

    const { result, sendEventCalls } = await execute();

    expect(result).toEqual({
      eligibleCount: 0,
      sentEvents: 0,
      reason: 'push_post_mvp',
    });
    expect(sendEventCalls).toHaveLength(0);
    expect(mockGetStepMentorNoticeEnabled).not.toHaveBeenCalled();
    expect(mockGetStepDatabase).not.toHaveBeenCalled();
    expect(mockFindEligibleNudges).not.toHaveBeenCalled();
  });

  it('does not query while the feature is disabled', async () => {
    mockGetStepMentorNoticeEnabled.mockResolvedValue(false);

    await expect(execute()).resolves.toMatchObject({
      result: { eligibleCount: 0, sentEvents: 0 },
    });
    expect(mockGetStepDatabase).not.toHaveBeenCalled();
    expect(mockFindEligibleNudges).not.toHaveBeenCalled();
  });

  it('fans out only opaque notice and profile identifiers', async () => {
    mockFindEligibleNudges.mockResolvedValue([
      { noticeId: 'notice-1', profileId: 'profile-1' },
    ]);

    const { result, sendEventCalls } = await execute();

    expect(mockFindEligibleNudges).toHaveBeenCalledWith({ marker: 'db' });
    expect(result).toEqual({ eligibleCount: 1, sentEvents: 1 });
    expect(sendEventCalls).toEqual([
      {
        name: 'fan-out-mentor-notice-nudges',
        payload: [
          {
            id: 'mentor-notice-nudge-notice-1',
            name: 'app/mentor-notice.nudge',
            data: { noticeId: 'notice-1', profileId: 'profile-1' },
          },
        ],
      },
    ]);
  });
});
