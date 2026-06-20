import { ForbiddenError } from '../errors';
import {
  markSupporterFeedCandidateSurfaced,
  readSupporterFeedSurfaceState,
  snoozeSupporterFeedCandidate,
} from './supporter-feed-state';

type SelectResult = Array<Record<string, unknown>>;

interface FakeSelectBuilder {
  from: (...args: unknown[]) => FakeSelectBuilder;
  where: (...args: unknown[]) => FakeSelectBuilder;
  limit: (...args: unknown[]) => Promise<SelectResult>;
}

interface FakeInsertBuilder {
  values: (...args: unknown[]) => FakeInsertBuilder;
  onConflictDoUpdate: (...args: unknown[]) => FakeInsertBuilder;
  returning: (...args: unknown[]) => Promise<SelectResult>;
}

function dbWithResults(results: SelectResult[]) {
  const pending = [...results];
  const select = jest.fn((): FakeSelectBuilder => {
    const builder: FakeSelectBuilder = {
      from: jest.fn((..._args: unknown[]) => builder),
      where: jest.fn((..._args: unknown[]) => builder),
      limit: jest.fn(async (..._args: unknown[]) => pending.shift() ?? []),
    };
    return builder;
  });
  const insert = jest.fn((): FakeInsertBuilder => {
    const builder: FakeInsertBuilder = {
      values: jest.fn((..._args: unknown[]) => builder),
      onConflictDoUpdate: jest.fn((..._args: unknown[]) => builder),
      returning: jest.fn(async (..._args: unknown[]) => pending.shift() ?? []),
    };
    return builder;
  });
  return { select, insert } as never;
}

const key = {
  viewerPersonId: '00000000-0000-4000-8000-000000000001',
  scopeKind: 'person' as const,
  sourceKind: 'retention_due',
  sourceKey:
    'supportership:00000000-0000-4000-8000-000000000010:retention_due:topic-1',
  supportershipId: '00000000-0000-4000-8000-000000000010',
  targetPersonId: '00000000-0000-4000-8000-000000000002',
};

describe('supporter feed surface state', () => {
  it('rejects writes through a missing or revoked supportership', async () => {
    const db = dbWithResults([[]]);

    await expect(
      markSupporterFeedCandidateSurfaced(db, key),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('upserts surfaced and snoozed state after asserting the active edge', async () => {
    const now = new Date('2026-06-20T12:00:00.000Z');
    const snoozedUntil = new Date('2026-06-21T12:00:00.000Z');
    const db = dbWithResults([
      [{ id: key.supportershipId }],
      [{ id: 'state-1', surfacedAt: now, snoozedUntil: null }],
      [{ id: key.supportershipId }],
      [{ id: 'state-1', surfacedAt: now, snoozedUntil }],
    ]);

    await expect(
      markSupporterFeedCandidateSurfaced(db, key, { now }),
    ).resolves.toMatchObject({ id: 'state-1', surfacedAt: now });
    await expect(
      snoozeSupporterFeedCandidate(db, key, snoozedUntil, { now }),
    ).resolves.toMatchObject({ id: 'state-1', snoozedUntil });
  });

  it('reads state only after active-edge assertion', async () => {
    const db = dbWithResults([
      [{ id: key.supportershipId }],
      [{ id: 'state-1', dismissedAt: null }],
    ]);

    await expect(readSupporterFeedSurfaceState(db, key)).resolves.toMatchObject(
      {
        id: 'state-1',
      },
    );
  });
});
