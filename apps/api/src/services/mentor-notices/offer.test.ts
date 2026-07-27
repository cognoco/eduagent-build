import type { Database } from '@eduagent/database';

import { resolveMentorNoticeRecheckContext } from './offer';

const baseNotice = {
  id: 'notice-1',
  concept: 'Changing signs',
  correctionHint: 'Use inverse operations.',
  lastRecheckOutcome: null,
  lastDeferredAt: null,
  lastOfferedAt: new Date('2026-07-19T10:00:00.000Z'),
};

function existingDb(notice: unknown | null): Database {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(notice ? [notice] : []) }),
      }),
    }),
  } as unknown as Database;
}

describe('resolveMentorNoticeRecheckContext', () => {
  it('continues an explicit offer for at most three exchanges', async () => {
    const session = {
      id: 'session-1',
      subjectId: 'subject-1',
      exchangeCount: 4,
      metadata: {
        recheckNoticeId: 'notice-1',
        recheckOfferExchangeCount: 2,
      },
    };

    await expect(
      resolveMentorNoticeRecheckContext(
        existingDb(baseNotice),
        'profile-1',
        session,
      ),
    ).resolves.toMatchObject({ id: 'notice-1', exchangeNumber: 3 });
    await expect(
      resolveMentorNoticeRecheckContext(existingDb(baseNotice), 'profile-1', {
        ...session,
        exchangeCount: 5,
      }),
    ).resolves.toBeNull();
  });

  it('stops injecting after a defer in the current offer', async () => {
    await expect(
      resolveMentorNoticeRecheckContext(
        existingDb({
          ...baseNotice,
          lastRecheckOutcome: 'deferred',
          lastDeferredAt: new Date('2026-07-19T11:00:00.000Z'),
        }),
        'profile-1',
        {
          id: 'session-1',
          subjectId: 'subject-1',
          exchangeCount: 2,
          metadata: { recheckNoticeId: 'notice-1' },
        },
      ),
    ).resolves.toBeNull();
  });

  it('never interrupts the first turn of a natural same-subject session', async () => {
    const db = { select: jest.fn() } as unknown as Database;

    await expect(
      resolveMentorNoticeRecheckContext(db, 'profile-1', {
        id: 'session-1',
        subjectId: 'subject-1',
        exchangeCount: 0,
        metadata: null,
      }),
    ).resolves.toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('transactionally stamps one natural offer into the notice and session', async () => {
    const timezoneLimit = jest.fn().mockResolvedValue([{ timezone: 'UTC' }]);
    const timezoneInnerJoin = jest.fn().mockReturnThis();
    const dbSelect = jest.fn().mockReturnValue({
      from: () => ({
        innerJoin: timezoneInnerJoin,
        where: () => ({ limit: timezoneLimit }),
      }),
    });
    timezoneInnerJoin.mockReturnValue({
      innerJoin: timezoneInnerJoin,
      where: () => ({ limit: timezoneLimit }),
    });
    const forUpdate = jest.fn().mockResolvedValue([baseNotice]);
    const txSelect = jest.fn().mockReturnValue({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => ({ for: forUpdate }) }),
        }),
      }),
    });
    const updateWhere = jest.fn().mockResolvedValue([]);
    const tx = {
      execute: jest.fn().mockResolvedValue(undefined),
      select: txSelect,
      update: jest.fn().mockReturnValue({
        set: () => ({ where: updateWhere }),
      }),
    };
    const db = {
      select: dbSelect,
      transaction: (callback: (value: unknown) => unknown) => callback(tx),
    } as unknown as Database;

    await expect(
      resolveMentorNoticeRecheckContext(
        db,
        'profile-1',
        {
          id: 'session-1',
          subjectId: 'subject-1',
          exchangeCount: 1,
          metadata: null,
        },
        new Date('2026-07-19T12:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ id: 'notice-1', exchangeNumber: 1 });
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(updateWhere).toHaveBeenCalledTimes(2);
  });
});
