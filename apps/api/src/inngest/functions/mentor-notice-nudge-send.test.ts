const mockGetStepDatabase = jest.fn();
const mockGetStepMentorNoticeEnabled = jest.fn();
const mockGetStepMentorNoticePushPostMvpEnabled = jest.fn();
const mockReserve = jest.fn();
const mockSend = jest.fn();

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
  '../../services/mentor-notices' /* gc1-allow: service orchestration boundary; service behavior has direct tests */,
  () => ({
    ...jest.requireActual('../../services/mentor-notices'),
    getProfileTimeZone: jest.fn().mockResolvedValue('UTC'),
    reserveMentorNoticeNudge: (...args: unknown[]) => mockReserve(...args),
    sendReservedMentorNoticeNudge: (...args: unknown[]) => mockSend(...args),
  }),
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { mentorNoticeNudgeSend } from './mentor-notice-nudge-send';

const event = {
  id: 'event-1',
  data: { profileId: 'profile-1', noticeId: 'notice-1' },
};

async function execute() {
  return (mentorNoticeNudgeSend as any).fn({
    event,
    step: createInngestStepRunner().step,
  });
}

describe('mentorNoticeNudgeSend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStepDatabase.mockReturnValue({ marker: 'db' });
    mockGetStepMentorNoticeEnabled.mockResolvedValue(true);
    // [WI-2573] These cases describe the delivery path, which only exists with
    // the post-MVP push boundary open. The MVP default (contained) is asserted
    // separately below and end-to-end in
    // tests/integration/mentor-notice-push-containment.integration.test.ts.
    mockGetStepMentorNoticePushPostMvpEnabled.mockResolvedValue(true);
  });

  it('[WI-2573] reserves nothing and sends nothing while the post-MVP push boundary is closed', async () => {
    mockGetStepMentorNoticePushPostMvpEnabled.mockResolvedValue(false);
    mockReserve.mockResolvedValue(true);
    mockSend.mockResolvedValue({ sent: true, ticketId: 'ticket-1' });

    await expect(execute()).resolves.toEqual({
      status: 'skipped',
      reason: 'push_post_mvp',
    });
    expect(mockGetStepMentorNoticeEnabled).not.toHaveBeenCalled();
    expect(mockGetStepDatabase).not.toHaveBeenCalled();
    expect(mockReserve).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('is once-per-event with no provider retry', () => {
    expect((mentorNoticeNudgeSend as any).opts).toMatchObject({
      id: 'mentor-notice-nudge-send',
      retries: 0,
      idempotency: 'event.id',
    });
  });

  it('does nothing with the feature disabled', async () => {
    mockGetStepMentorNoticeEnabled.mockResolvedValue(false);

    await expect(execute()).resolves.toEqual({
      status: 'skipped',
      reason: 'feature_disabled',
    });
    expect(mockReserve).not.toHaveBeenCalled();
  });

  it('does not send when the atomic reservation loses eligibility', async () => {
    mockReserve.mockResolvedValue(false);

    await expect(execute()).resolves.toEqual({
      status: 'skipped',
      reason: 'not_eligible',
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends only after a successful reservation', async () => {
    mockReserve.mockResolvedValue(true);
    mockSend.mockResolvedValue({ sent: true, ticketId: 'ticket-1' });

    await expect(execute()).resolves.toEqual({
      status: 'sent',
      ticketId: 'ticket-1',
    });
    expect(mockReserve).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({ marker: 'db' }, event.data);
  });
});
