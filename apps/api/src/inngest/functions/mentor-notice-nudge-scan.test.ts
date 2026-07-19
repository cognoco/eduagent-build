const mockGetStepDatabase = jest.fn();
const mockGetStepMentorNoticeEnabled = jest.fn();

jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  getStepDatabase: () => mockGetStepDatabase(),
  getStepMentorNoticeEnabled: () => mockGetStepMentorNoticeEnabled(),
}));

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { mentorNoticeNudgeScan } from './mentor-notice-nudge-scan';

function makeDb(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const innerJoin = jest.fn().mockReturnThis();
  const from = jest.fn().mockReturnValue({ innerJoin, where });
  innerJoin.mockReturnValue({ innerJoin, where });
  return { select: jest.fn().mockReturnValue({ from }) };
}

async function execute() {
  const runner = createInngestStepRunner();
  const result = await (mentorNoticeNudgeScan as any).fn({ step: runner.step });
  return { result, sendEventCalls: runner.sendEventCalls };
}

describe('mentorNoticeNudgeScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepMentorNoticeEnabled.mockResolvedValue(true);
  });

  it('does not query while the feature is disabled', async () => {
    mockGetStepMentorNoticeEnabled.mockResolvedValue(false);

    await expect(execute()).resolves.toMatchObject({
      result: { eligibleCount: 0, sentEvents: 0 },
    });
    expect(mockGetStepDatabase).not.toHaveBeenCalled();
  });

  it('fans out only opaque notice and profile identifiers', async () => {
    mockGetStepDatabase.mockReturnValue(
      makeDb([{ noticeId: 'notice-1', profileId: 'profile-1' }]),
    );

    const { result, sendEventCalls } = await execute();

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
