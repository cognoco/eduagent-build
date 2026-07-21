import type { Database } from '@eduagent/database';

const mockSendPushNotification = jest.fn();

jest.mock(
  '../notifications' /* gc1-allow: isolates the external push-notification boundary; delivery behavior has integration coverage */,
  () => ({
    ...jest.requireActual('../notifications'),
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
  }),
);

import {
  findEligibleMentorNoticeNudges,
  reserveMentorNoticeNudge,
  sendReservedMentorNoticeNudge,
} from './nudge';

function makeEligibilityDb(rows: unknown[]) {
  const limit = jest.fn().mockResolvedValue(rows);
  const where = jest.fn().mockReturnValue({ limit });
  const innerJoin = jest.fn().mockReturnThis();
  const from = jest.fn().mockReturnValue({ innerJoin, where });
  innerJoin.mockReturnValue({ innerJoin, where });
  return { select: jest.fn().mockReturnValue({ from }) } as unknown as Database;
}

function makeReservationDb(counts: { family: number; daily: number }) {
  const noticeForUpdate = jest.fn().mockResolvedValue([{ id: 'notice-1' }]);
  const select = jest
    .fn()
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => ({ for: noticeForUpdate }),
        }),
      }),
    })
    .mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([counts]) }),
    });
  const updateWhere = jest.fn().mockResolvedValue([]);
  const update = jest.fn().mockReturnValue({
    set: () => ({ where: updateWhere }),
  });
  const insertValues = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn().mockReturnValue({ values: insertValues });
  const tx = {
    execute: jest.fn().mockResolvedValue(undefined),
    select,
    update,
    insert,
  };
  const db = {
    transaction: (callback: (value: unknown) => unknown) => callback(tx),
  } as unknown as Database;
  return { db, insertValues, update, updateWhere };
}

function makeSendDb(notice: unknown | null) {
  const select = jest.fn().mockReturnValue({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: () => Promise.resolve(notice ? [notice] : []),
        }),
      }),
    }),
  });
  const returning = jest.fn().mockResolvedValue([{ id: 'notice-1' }]);
  const update = jest.fn().mockReturnValue({
    set: () => ({ where: () => ({ returning }) }),
  });
  // [WI-2503] The recheck, the push and the state transition run inside one
  // Knotice-locked transaction, so the send path now needs a tx handle.
  const tx = {
    execute: jest.fn().mockResolvedValue(undefined),
    select,
    update,
  };
  const db = {
    transaction: (callback: (value: unknown) => unknown) => callback(tx),
  } as unknown as Database;
  return { db, tx, update };
}

describe('mentor notice nudge reservation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reserves below both the shared-family and daily limits', async () => {
    const { db, insertValues } = makeReservationDb({ family: 0, daily: 2 });

    await expect(
      reserveMentorNoticeNudge(db, {
        profileId: 'profile-1',
        noticeId: 'notice-1',
        localDayStart: new Date('2026-07-19T04:00:00.000Z'),
        now: new Date('2026-07-19T16:00:00.000Z'),
      }),
    ).resolves.toBe(true);
    expect(insertValues).toHaveBeenCalledWith({
      profileId: 'profile-1',
      type: 'notice_recheck',
      sentAt: new Date('2026-07-19T16:00:00.000Z'),
    });
  });

  it.each([
    [{ family: 1, daily: 1 }, 'shared 24-hour family'],
    [{ family: 0, daily: 3 }, 'three-per-day cap'],
  ])('skips at the %s limit', async (counts) => {
    const { db, insertValues, update } = makeReservationDb(counts);

    await expect(
      reserveMentorNoticeNudge(db, {
        profileId: 'profile-1',
        noticeId: 'notice-1',
        localDayStart: new Date('2026-07-19T04:00:00.000Z'),
      }),
    ).resolves.toBe(false);
    expect(insertValues).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('mentor notice nudge eligibility', () => {
  it('returns only opaque notice and profile identifiers', async () => {
    const db = makeEligibilityDb([
      { noticeId: 'notice-1', profileId: 'profile-1' },
    ]);

    await expect(findEligibleMentorNoticeNudges(db)).resolves.toEqual([
      { noticeId: 'notice-1', profileId: 'profile-1' },
    ]);
  });
});

describe('reserved mentor notice delivery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('suppresses a notice deferred after scan but before send', async () => {
    const { db } = makeSendDb(null);

    await expect(
      sendReservedMentorNoticeNudge(db, {
        profileId: 'profile-1',
        noticeId: 'notice-1',
      }),
    ).resolves.toEqual({ sent: false, reason: 'suppressed' });
    expect(mockSendPushNotification).not.toHaveBeenCalled();
  });

  it('disables duplicate rate-limit logging and retains a failed reservation', async () => {
    const { db, tx, update } = makeSendDb({
      id: 'notice-1',
      subjectId: 'subject-1',
      subjectName: 'Algebra',
    });
    mockSendPushNotification.mockResolvedValue({
      sent: false,
      reason: 'no_valid_tokens',
    });

    await expect(
      sendReservedMentorNoticeNudge(db, {
        profileId: 'profile-1',
        noticeId: 'notice-1',
      }),
    ).resolves.toEqual({ sent: false, reason: 'no_valid_tokens' });
    expect(mockSendPushNotification).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        profileId: 'profile-1',
        type: 'notice_recheck',
        data: { noticeId: 'notice-1', subjectId: 'subject-1' },
      }),
      // [WI-2503] the push is aborted before the delivery transaction's own
      // hold cap, so a hung Expo call cannot stall a concurrent defer.
      {
        skipRateLimitLog: true,
        skipDailyCap: true,
        pushTimeoutMs: expect.any(Number),
      },
    );
    expect(update).toHaveBeenCalledTimes(1);
  });
});
