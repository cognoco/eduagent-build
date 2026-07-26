import type { Database } from '@eduagent/database';

const writeVisibilityAuditEventMock = jest.fn();
const createVisibilityNoticeMock = jest.fn();

jest.mock(
  './linking-ceremony' /* gc1-allow: deterministic DB fault injection proves graduation-restamp transaction rollback */,
  () => ({
    writeVisibilityAuditEvent: (...args: unknown[]) =>
      writeVisibilityAuditEventMock(...args),
  }),
);

jest.mock(
  './visibility-moment-projections' /* gc1-allow: deterministic DB fault injection proves graduation-restamp transaction rollback */,
  () => ({
    createVisibilityNotice: (...args: unknown[]) =>
      createVisibilityNoticeMock(...args),
  }),
);

import { restampGraduationContracts } from './graduation-narration';

const OCCURRED_AT = new Date('2026-06-29T09:00:00.000Z');
const SUPPORTER_ID = '00000000-0000-4000-8000-000000000001';
const SUPPORTEE_ID = '00000000-0000-4000-8000-000000000002';
const SUPPORTERSHIP_ID = '00000000-0000-4000-8000-000000000003';
const CONTRACT_ID = '00000000-0000-4000-8000-000000000004';

function makeTransactionalHarness(options: { revokeBeforeTx?: boolean } = {}) {
  let contract = {
    id: CONTRACT_ID,
    supportershipId: SUPPORTERSHIP_ID,
    supporterPersonId: SUPPORTER_ID,
    supporteePersonId: SUPPORTEE_ID,
    status: 'accepted',
    contractVersion: 1,
    supporterAcceptedAt: OCCURRED_AT,
    supporteeAcceptedAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  };
  const edge: {
    id: string;
    supporterPersonId: string;
    supporteePersonId: string;
    revokedAt: Date | null;
  } = {
    id: SUPPORTERSHIP_ID,
    supporterPersonId: SUPPORTER_ID,
    supporteePersonId: SUPPORTEE_ID,
    revokedAt: null,
  };
  const auditEvents: Array<{
    eventType: string;
    payload: Record<string, unknown>;
  }> = [];
  const notices: Array<Record<string, unknown>> = [];
  let pendingUpdate: Partial<typeof contract> = {};

  const returning = jest.fn(async () => {
    contract = { ...contract, ...pendingUpdate };
    return [{ ...contract }];
  });
  const updateWhere = jest.fn(() => {
    contract = { ...contract, ...pendingUpdate };
    return { returning };
  });
  const set = jest.fn((values: Partial<typeof contract>) => {
    pendingUpdate = values;
    return { where: updateWhere };
  });
  const update = jest.fn(() => ({ set }));

  const selectWhere = jest.fn(async () => [
    { edge: { ...edge }, contract: { ...contract } },
  ]);
  const innerJoin = jest.fn(() => ({ where: selectWhere }));
  const from = jest.fn(() => ({ innerJoin }));
  const select = jest.fn(() => ({ from }));
  const findMany = jest.fn(async () => [...auditEvents]);
  const forUpdate = jest.fn(async () =>
    edge.revokedAt === null ? [{ id: edge.id }] : [],
  );
  const txSelectWhere = jest.fn(() => ({ for: forUpdate }));
  const txSelectFrom = jest.fn(() => ({ where: txSelectWhere }));
  const txSelect = jest.fn(() => ({ from: txSelectFrom }));

  const tx = {
    select: txSelect,
    update,
    query: { supportVisibilityAuditEvents: { findMany } },
  };
  const transaction = jest.fn(
    async (callback: (transactionDb: typeof tx) => Promise<unknown>) => {
      const contractSnapshot = { ...contract };
      const auditLength = auditEvents.length;
      const noticeLength = notices.length;
      if (options.revokeBeforeTx) {
        edge.revokedAt = new Date('2026-06-29T08:59:59.000Z');
      }
      try {
        return await callback(tx);
      } catch (error) {
        contract = contractSnapshot;
        auditEvents.length = auditLength;
        notices.length = noticeLength;
        throw error;
      }
    },
  );

  writeVisibilityAuditEventMock.mockImplementation(
    async (_db: Database, input: (typeof auditEvents)[number]) => {
      auditEvents.push(input);
    },
  );
  createVisibilityNoticeMock.mockImplementation(
    async (_db: Database, input: Record<string, unknown>) => {
      notices.push(input);
      return input;
    },
  );

  return {
    db: { select, update, transaction } as unknown as Database,
    transaction,
    forUpdate,
    readContract: () => ({ ...contract }),
    auditEvents,
    notices,
  };
}

describe('restampGraduationContracts atomicity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function expectFullRollback(
    harness: ReturnType<typeof makeTransactionalHarness>,
  ): Promise<void> {
    await expect(
      restampGraduationContracts(harness.db, {
        personId: SUPPORTEE_ID,
        occurredAt: OCCURRED_AT,
      }),
    ).rejects.toThrow(/simulated (audit|notice) failure/);

    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.readContract()).toMatchObject({
      status: 'accepted',
      contractVersion: 1,
      supporterAcceptedAt: OCCURRED_AT,
      supporteeAcceptedAt: OCCURRED_AT,
    });
    expect(harness.auditEvents).toHaveLength(0);
    expect(harness.notices).toHaveLength(0);
  }

  it('rolls back the contract when audit creation fails', async () => {
    const harness = makeTransactionalHarness();
    writeVisibilityAuditEventMock.mockRejectedValueOnce(
      new Error('simulated audit failure'),
    );

    await expectFullRollback(harness);
  });

  it('rolls back the contract and audit when notice creation fails', async () => {
    const harness = makeTransactionalHarness();
    createVisibilityNoticeMock.mockRejectedValueOnce(
      new Error('simulated notice failure'),
    );

    await expectFullRollback(harness);
  });

  it('does not restamp when revocation lands after the optimistic read', async () => {
    const harness = makeTransactionalHarness({ revokeBeforeTx: true });

    await expect(
      restampGraduationContracts(harness.db, {
        personId: SUPPORTEE_ID,
        occurredAt: OCCURRED_AT,
      }),
    ).resolves.toEqual({ restamped: 0 });

    expect(harness.forUpdate).toHaveBeenCalledWith('update');
    expect(harness.readContract()).toMatchObject({
      status: 'accepted',
      contractVersion: 1,
    });
    expect(harness.auditEvents).toHaveLength(0);
    expect(harness.notices).toHaveLength(0);
  });
});
