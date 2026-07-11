import {
  blockedSafetyDailyBuckets,
  blockedSafetyDigestReceipts,
  type Database,
} from '@eduagent/database';
import type { BlockedSafetyDigestEvent } from '@eduagent/schemas';

import {
  deliverBlockedSafetyDigestBucket,
  recordBlockedSafetyDigestEvent,
} from './blocked-safety-digest';

const NOW = new Date('2026-07-11T23:59:59.000Z');
const EVENT_ID = '00000000-0000-4000-8000-000000001691';

function event(
  name: BlockedSafetyDigestEvent['name'],
): BlockedSafetyDigestEvent {
  return { name, eventId: EVENT_ID, timestamp: NOW.toISOString() };
}

function makeDb(receiptRows: Array<{ eventId: string }>) {
  const receiptReturning = jest.fn().mockResolvedValue(receiptRows);
  const receiptConflict = jest.fn().mockReturnValue({
    returning: receiptReturning,
  });
  const receiptValues = jest.fn().mockReturnValue({
    onConflictDoNothing: receiptConflict,
  });
  const bucketConflict = jest.fn().mockResolvedValue(undefined);
  const bucketValues = jest.fn().mockReturnValue({
    onConflictDoUpdate: bucketConflict,
  });
  const txInsert = jest.fn((table: unknown) => {
    if (table === blockedSafetyDigestReceipts) {
      return { values: receiptValues };
    }
    if (table === blockedSafetyDailyBuckets) {
      return { values: bucketValues };
    }
    throw new Error('unexpected table');
  });
  const transaction = jest.fn(
    async (callback: (tx: { insert: typeof txInsert }) => Promise<unknown>) =>
      callback({ insert: txInsert }),
  );

  return {
    db: { transaction } as unknown as Database,
    transaction,
    receiptValues,
    bucketValues,
    bucketConflict,
    txInsert,
  };
}

describe('[WI-1691] recordBlockedSafetyDigestEvent', () => {
  it.each([
    [
      'app/safety.dangerous_procedure_blocked',
      'dangerousProcedureBlockedCount',
    ],
    ['app/safety.minor_pii_echo_redacted', 'minorPiiEchoRedactedCount'],
    ['app/safety.suitability_blocked', 'suitabilityBlockedCount'],
  ] as const)(
    'records %s once and increments only %s in the same transaction',
    async (name, counterKey) => {
      const harness = makeDb([{ eventId: EVENT_ID }]);

      await expect(
        recordBlockedSafetyDigestEvent(harness.db, event(name), NOW),
      ).resolves.toEqual({ recorded: true, bucketDate: '2026-07-11' });

      expect(harness.transaction).toHaveBeenCalledTimes(1);
      expect(harness.receiptValues).toHaveBeenCalledWith({
        eventId: EVENT_ID,
        eventName: name,
        bucketDate: '2026-07-11',
        recordedAt: NOW,
      });
      expect(harness.bucketValues).toHaveBeenCalledWith({
        bucketDate: '2026-07-11',
        [counterKey]: 1,
      });
      expect(harness.bucketConflict).toHaveBeenCalledTimes(1);
      const conflict = harness.bucketConflict.mock.calls[0]?.[0] as {
        set: Record<string, unknown>;
      };
      expect(Object.keys(conflict.set).sort()).toEqual(
        [counterKey, 'updatedAt'].sort(),
      );
    },
  );

  it('treats a replayed event ID as a duplicate without touching the bucket', async () => {
    const harness = makeDb([]);

    await expect(
      recordBlockedSafetyDigestEvent(
        harness.db,
        event('app/safety.suitability_blocked'),
        NOW,
      ),
    ).resolves.toEqual({ recorded: false, bucketDate: '2026-07-11' });

    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.txInsert).toHaveBeenCalledTimes(1);
    expect(harness.bucketValues).not.toHaveBeenCalled();
  });
});

function bucket(
  overrides: Partial<typeof blockedSafetyDailyBuckets.$inferSelect> = {},
): typeof blockedSafetyDailyBuckets.$inferSelect {
  return {
    bucketDate: '2026-07-10',
    dangerousProcedureBlockedCount: 2,
    minorPiiEchoRedactedCount: 3,
    suitabilityBlockedCount: 4,
    deliveredAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeDeliveryDb(
  markedRows: Array<{ bucketDate: string }> = [{ bucketDate: '2026-07-10' }],
  reread: { deliveredAt: Date | null } | null = null,
  lockedRows: Array<ReturnType<typeof bucket>> = [bucket()],
) {
  const returning = jest.fn().mockResolvedValue(markedRows);
  const where = jest.fn().mockReturnValue({ returning });
  const set = jest.fn().mockReturnValue({ where });
  const update = jest.fn().mockReturnValue({ set });
  const findFirst = jest.fn().mockResolvedValue(reread);
  const forUpdate = jest.fn().mockResolvedValue(lockedRows);
  const selectWhere = jest.fn().mockReturnValue({ for: forUpdate });
  const from = jest.fn().mockReturnValue({ where: selectWhere });
  const select = jest.fn().mockReturnValue({ from });
  const dbShape = {
    select,
    update,
    query: { blockedSafetyDailyBuckets: { findFirst } },
  };
  const transaction = jest.fn(
    async (callback: (tx: typeof dbShape) => Promise<unknown>) =>
      callback(dbShape),
  );
  return {
    db: { ...dbShape, transaction } as unknown as Database,
    transaction,
    forUpdate,
    update,
    set,
  };
}

describe('[WI-1691] deliverBlockedSafetyDigestBucket', () => {
  const emailConfig = {
    to: 'operator@example.test',
    resendApiKey: 'resend-test-key',
    emailFrom: 'noreply@example.test',
  };

  it('sends no email for an empty bucket', async () => {
    const emptyBucket = bucket({
      dangerousProcedureBlockedCount: 0,
      minorPiiEchoRedactedCount: 0,
      suitabilityBlockedCount: 0,
    });
    const harness = makeDeliveryDb(undefined, undefined, [emptyBucket]);
    const send = jest.fn();

    await expect(
      deliverBlockedSafetyDigestBucket(
        harness.db,
        emptyBucket,
        emailConfig,
        send,
      ),
    ).resolves.toEqual({ delivered: false, reason: 'empty' });

    expect(send).not.toHaveBeenCalled();
    expect(harness.update).not.toHaveBeenCalled();
  });

  it('sends only UTC date/count labels and marks delivered after success', async () => {
    const harness = makeDeliveryDb();
    const send = jest.fn().mockResolvedValue({
      sent: true,
      messageId: 'email-1',
    });

    await expect(
      deliverBlockedSafetyDigestBucket(
        harness.db,
        bucket(),
        emailConfig,
        send,
        NOW,
      ),
    ).resolves.toEqual({ delivered: true });

    const [payload, options] = send.mock.calls[0] as [
      { to: string; subject: string; body: string; type: string },
      { idempotencyKey: string },
    ];
    expect(payload).toEqual({
      to: emailConfig.to,
      subject: 'Blocked-safety digest — 2026-07-10 UTC',
      body: [
        'Blocked-safety operator digest',
        'UTC date: 2026-07-10',
        'Dangerous procedure blocks: 2',
        'Minor PII echo redactions: 3',
        'Suitability blocks: 4',
      ].join('\n'),
      type: 'blocked_safety_digest',
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /profile|session|learner|message|model|content/i,
    );
    expect(options.idempotencyKey).toBe(
      'value(blocked-safety-digest):value(2026-07-10)',
    );
    expect(harness.set).toHaveBeenCalledWith({ deliveredAt: NOW });
  });

  it('throws without marking when email delivery fails', async () => {
    const harness = makeDeliveryDb();
    const send = jest
      .fn()
      .mockResolvedValue({ sent: false, reason: 'network_error' });

    await expect(
      deliverBlockedSafetyDigestBucket(harness.db, bucket(), emailConfig, send),
    ).rejects.toThrow('blocked-safety digest email failed: network_error');

    expect(harness.update).not.toHaveBeenCalled();
  });

  it('throws when delivery succeeds but the bucket cannot be marked', async () => {
    const harness = makeDeliveryDb([]);
    const send = jest.fn().mockResolvedValue({ sent: true });

    await expect(
      deliverBlockedSafetyDigestBucket(harness.db, bucket(), emailConfig, send),
    ).rejects.toThrow('blocked-safety digest bucket was not marked delivered');

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('locks and skips a bucket that a concurrent delivery already marked', async () => {
    const harness = makeDeliveryDb([], { deliveredAt: NOW }, [
      bucket({ deliveredAt: NOW }),
    ]);
    const send = jest.fn().mockResolvedValue({ sent: true });

    await expect(
      deliverBlockedSafetyDigestBucket(harness.db, bucket(), emailConfig, send),
    ).resolves.toEqual({ delivered: true });

    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.forUpdate).toHaveBeenCalledWith('update');
    expect(send).not.toHaveBeenCalled();
    expect(harness.update).not.toHaveBeenCalled();
  });
});
