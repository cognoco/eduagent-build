import type { Database } from '@eduagent/database';

import {
  createVisibilityNotice,
  deriveVisibilityMoments,
} from './visibility-moment-projections';

const SUPPORTEE_ID = '0190a1b2-c3d4-7e8f-8a9b-0c1d2e3f4a5b';
const SUPPORTERSHIP_ID = '0190a1b2-c3d4-7e8f-8a9b-0c1d2e3f4a60';
const TARGET_ID = '0190a1b2-c3d4-7e8f-8a9b-0c1d2e3f4a61';

// Valid support_link_ended payload (matches supportLinkEndedPayloadSchema).
const validPayload = {
  supporteePersonId: SUPPORTEE_ID,
  revokedAt: '2026-01-01T00:00:00.000Z',
  graceDays: 7,
};

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '0190a1b2-c3d4-7e8f-8a9b-0c1d2e3f4a62',
    supportershipId: SUPPORTERSHIP_ID,
    contractId: null,
    noticeType: 'support_link_ended',
    targetAudience: 'supportee',
    targetPersonId: TARGET_ID,
    payload: validPayload,
    acknowledgedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

// Minimal chained query-builder stub for db.select()...limit() — the DB is an
// external boundary, so this is a fixture, not an internal mock.
function makeSelectDb(rows: unknown[]): Database {
  const builder = {
    from: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: () => Promise.resolve(rows),
  };
  return { select: () => builder } as unknown as Database;
}

function makeInsertDb(row: unknown): Database {
  const builder = {
    values: () => builder,
    returning: () => Promise.resolve([row]),
  };
  return { insert: () => builder } as unknown as Database;
}

describe('deriveVisibilityMoments payload resilience', () => {
  it('returns a moment for a row whose payload matches the schema', async () => {
    const db = makeSelectDb([baseRow()]);
    const moments = await deriveVisibilityMoments(db, {
      targetPersonId: TARGET_ID,
      targetAudience: 'supportee',
    });
    expect(moments).toHaveLength(1);
    expect(moments[0]?.payload).toEqual(validPayload);
  });

  it('skips a malformed-payload row instead of throwing for the whole read', async () => {
    // Without the safeParse fix, this row's `.parse()` throws and the entire
    // deriveVisibilityMoments call rejects — a single bad row 500s every notice.
    const db = makeSelectDb([
      baseRow({ id: 'bad', payload: { not: 'a valid payload' } }),
      baseRow(),
    ]);
    const moments = await deriveVisibilityMoments(db, {
      targetPersonId: TARGET_ID,
      targetAudience: 'supportee',
    });
    // Bad row dropped; the well-formed row still renders.
    expect(moments).toHaveLength(1);
    expect(moments.map((m) => m.id)).not.toContain('bad');
  });
});

describe('createVisibilityNotice', () => {
  it('throws when the just-inserted row fails payload validation', async () => {
    const db = makeInsertDb(baseRow({ payload: { broken: true } }));
    await expect(
      createVisibilityNotice(db, {
        supportershipId: SUPPORTERSHIP_ID,
        noticeType: 'support_link_ended',
        targetAudience: 'supportee',
        targetPersonId: TARGET_ID,
        payload: { broken: true },
      } as never),
    ).rejects.toThrow(/failed validation/);
  });
});
