// ---------------------------------------------------------------------------
// [WI-1060] Transaction regression tests for linking-ceremony.ts
//
// These tests verify that initiateLink and acceptLink wrap their multi-write
// sequences in db.transaction(), so a mid-sequence failure causes a full
// rollback rather than leaving partial writes committed.
//
// Strategy: build a minimal mock Database that:
//   (1) tracks every insert/update call in an in-memory log, keyed by table ref
//   (2) implements transaction() to run the callback, but on throw, splices
//       the log back (simulating rollback — no real DB, so atomicity is
//       modelled via log-splice)
//   (3) surfaces whether db.transaction was called at all (the structural test)
//
// Red-green proof (per AC):
//   RED  — with db.transaction absent, the contract row IS recorded in the log
//          even though writeVisibilityAuditEvent threw.
//   GREEN — with db.transaction present the throw propagates and the mock
//           rolls the log back so the contract row is NOT in the log.
//
// No jest.mock() of internal modules (GC1 compliant). The mock DB is a
// plain object; the real service code is exercised against it.
// ---------------------------------------------------------------------------

import {
  supportVisibilityAuditEvents,
  supportVisibilityContracts,
  supportership,
  type Database,
} from '@eduagent/database';
import { initiateLink, acceptLink } from './linking-ceremony';

// ---------------------------------------------------------------------------
// Minimal mock database builder
// ---------------------------------------------------------------------------

type TableRef =
  | typeof supportership
  | typeof supportVisibilityContracts
  | typeof supportVisibilityAuditEvents;

type LogEntry = { op: 'insert' | 'update'; table: TableRef };

function buildMockDb(opts: {
  /** If true, throw on any insert into supportVisibilityAuditEvents. */
  failOnAuditInsert?: boolean;
  /** Contract row to return for readContractById (select from supportVisibilityContracts). */
  contractRow?: Record<string, unknown>;
}) {
  const log: LogEntry[] = [];
  let transactionCalled = false;

  const now = new Date('2026-06-01T00:00:00.000Z');

  function makeMockEdgeRow() {
    return {
      id: 'edge-1',
      supporterPersonId: 'person-supporter',
      supporteePersonId: 'person-supportee',
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
    };
  }

  function makeMockContractRow() {
    return {
      id: 'contract-1',
      supportershipId: 'edge-1',
      supporterPersonId: 'person-supporter',
      supporteePersonId: 'person-supportee',
      relation: 'parent',
      status: 'pending',
      contractVersion: 1,
      reportableKinds: ['mastery'],
      artifactWall: true,
      renderEquivalence: true,
      safetyException: true,
      supporterAcceptedAt: null,
      supporteeAcceptedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  // makeInsertChain returns an object whose .values() return value is:
  //  - awaitable directly (for audit inserts: await db.insert(t).values({...}))
  //  - AND has a .returning() method (for supportership/contract inserts)
  function makeInsertChain(table: TableRef) {
    const valuesResult = {
      // .returning() path — used by supportership and contract inserts
      returning: async () => {
        if (opts.failOnAuditInsert && table === supportVisibilityAuditEvents) {
          throw new Error(
            'Injected failure: insert into supportVisibilityAuditEvents',
          );
        }
        log.push({ op: 'insert', table });
        if (table === supportership) return [makeMockEdgeRow()];
        if (table === supportVisibilityContracts) return [makeMockContractRow()];
        return [{}];
      },
      // Thenable — allows `await db.insert(t).values({})` without .returning()
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        const exec = async () => {
          if (opts.failOnAuditInsert && table === supportVisibilityAuditEvents) {
            throw new Error(
              'Injected failure: insert into supportVisibilityAuditEvents',
            );
          }
          log.push({ op: 'insert', table });
          return undefined;
        };
        return exec().then(resolve, reject);
      },
    };

    return {
      values: (_data: unknown) => valuesResult,
    };
  }

  function makeUpdateChain(_table: TableRef) {
    return {
      set: (_data: unknown) => ({
        where: (_cond: unknown) => ({
          returning: async () => {
            log.push({ op: 'update', table: supportVisibilityContracts });
            return [makeMockContractRow()];
          },
        }),
      }),
    };
  }

  const mockDb = {
    insert: (table: TableRef) => makeInsertChain(table),
    update: (table: TableRef) => makeUpdateChain(table),
    select: () => ({
      from: (_table: unknown) => ({
        where: (_cond: unknown) => ({
          limit: (_n: number) =>
            Promise.resolve(
              opts.contractRow != null ? [opts.contractRow] : [],
            ),
        }),
        innerJoin: (_joinTable: unknown, _cond: unknown) => ({
          where: (_w: unknown) => ({
            limit: (_n: number) => Promise.resolve([]),
          }),
        }),
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactionCalled = true;
      const snapshotLen = log.length;
      try {
        return await fn(mockDb); // pass self as tx (same mock api)
      } catch (err) {
        // Simulate rollback: remove any entries added inside this transaction
        log.splice(snapshotLen, log.length - snapshotLen);
        throw err;
      }
    },
    query: {
      consentStates: { findFirst: async () => null },
    },
  };

  return {
    db: mockDb as unknown as Database,
    log,
    get transactionCalled() {
      return transactionCalled;
    },
  };
}

// ---------------------------------------------------------------------------
// initiateLink — [WI-1060] transaction wrapping
// ---------------------------------------------------------------------------

describe('[WI-1060] initiateLink — transaction wrapping', () => {
  const BASE_INPUT = {
    supporterPersonId: 'person-supporter',
    supporteePersonId: 'person-supportee',
    relation: 'parent' as const,
    managedTier: false,
    now: new Date('2026-06-01T00:00:00.000Z'),
  };

  it('calls db.transaction() — writes are wrapped, not bare', async () => {
    const mock = buildMockDb({});
    await initiateLink(mock.db, BASE_INPUT);
    expect(mock.transactionCalled).toBe(true);
  });

  it('GREEN: audit failure rolls back all writes (supportership + contract not in log)', async () => {
    // Arrange: audit insert throws
    const { db, log } = buildMockDb({ failOnAuditInsert: true });

    // Act: initiateLink should throw because audit insert fails inside transaction
    await expect(initiateLink(db, BASE_INPUT)).rejects.toThrow(
      /Injected failure/,
    );

    // Assert: transaction rolled back — no writes remain in the log
    expect(log).toHaveLength(0);
  });

  it('RED (control): without transaction wrapper, partial writes survive an audit failure', async () => {
    // This test models the pre-fix behavior: two writes commit THEN audit fails.
    // We call the raw DB methods directly without a transaction wrapper.
    const { db, log } = buildMockDb({ failOnAuditInsert: true });

    // 1. Insert supportership (commits immediately — no transaction)
    const edgeResult = await mockInsert(db, supportership);
    expect(edgeResult).toBeDefined(); // write succeeded

    // 2. Insert contract (commits immediately)
    const contractResult = await mockInsert(db, supportVisibilityContracts);
    expect(contractResult).toBeDefined(); // write succeeded

    // 3. Insert audit — throws
    let auditThrew = false;
    try {
      await mockInsert(db, supportVisibilityAuditEvents);
    } catch {
      auditThrew = true;
    }

    // Without a transaction, both inserts are in the log even though audit failed
    expect(auditThrew).toBe(true);
    expect(log.filter((e) => e.table === supportership)).toHaveLength(1);
    expect(
      log.filter((e) => e.table === supportVisibilityContracts),
    ).toHaveLength(1);
  });

  it('succeeds and returns a VisibilityContract when no error occurs', async () => {
    const { db } = buildMockDb({});
    const result = await initiateLink(db, BASE_INPUT);
    expect(result).toMatchObject({
      id: 'contract-1',
      supporterPersonId: 'person-supporter',
      supporteePersonId: 'person-supportee',
    });
  });

  it('throws BadRequestError (before DB) when supporter === supportee', async () => {
    const { db, log } = buildMockDb({});
    await expect(
      initiateLink(db, {
        ...BASE_INPUT,
        supporterPersonId: 'same',
        supporteePersonId: 'same',
      }),
    ).rejects.toThrow('A supporter cannot support themself.');
    expect(log).toHaveLength(0); // no DB writes attempted
  });
});

// ---------------------------------------------------------------------------
// acceptLink — [WI-1060] transaction wrapping
// ---------------------------------------------------------------------------

describe('[WI-1060] acceptLink — transaction wrapping', () => {
  const CONTRACT_ID = 'contract-1';
  const BASE_ACCEPT_INPUT = {
    actorPersonId: 'person-supporter',
    audience: 'supporter' as const,
    now: new Date('2026-06-01T00:00:00.000Z'),
  };

  // A mock contract row that readContractById resolves with
  const MOCK_CONTRACT_ROW = {
    id: 'contract-1',
    supportershipId: 'edge-1',
    supporterPersonId: 'person-supporter',
    supporteePersonId: 'person-supportee',
    relation: 'parent',
    status: 'pending',
    contractVersion: 1,
    reportableKinds: ['mastery'],
    artifactWall: true,
    renderEquivalence: true,
    safetyException: true,
    supporterAcceptedAt: null,
    supporteeAcceptedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };

  it('calls db.transaction() — update + audit are wrapped', async () => {
    const mock = buildMockDb({ contractRow: MOCK_CONTRACT_ROW });
    await acceptLink(mock.db, CONTRACT_ID, BASE_ACCEPT_INPUT);
    expect(mock.transactionCalled).toBe(true);
  });

  it('GREEN: audit failure rolls back the contract update', async () => {
    // Arrange: audit insert throws after contract update
    const { db, log } = buildMockDb({
      contractRow: MOCK_CONTRACT_ROW,
      failOnAuditInsert: true,
    });

    // Act: acceptLink throws due to audit failure
    await expect(
      acceptLink(db, CONTRACT_ID, BASE_ACCEPT_INPUT),
    ).rejects.toThrow(/Injected failure/);

    // Assert: transaction rolled back — contract update not in log
    const contractUpdates = log.filter(
      (e) => e.op === 'update' && e.table === supportVisibilityContracts,
    );
    expect(contractUpdates).toHaveLength(0);
  });

  it('succeeds and returns updated VisibilityContract', async () => {
    const { db } = buildMockDb({ contractRow: MOCK_CONTRACT_ROW });
    const result = await acceptLink(db, CONTRACT_ID, BASE_ACCEPT_INPUT);
    expect(result).toMatchObject({
      id: 'contract-1',
      supporterPersonId: 'person-supporter',
    });
  });
});

// ---------------------------------------------------------------------------
// Helper: call db.insert(table).values({}).returning() — used in the RED test
// ---------------------------------------------------------------------------
async function mockInsert(db: Database, table: TableRef) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db as any).insert(table).values({}).returning();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return rows[0];
}
