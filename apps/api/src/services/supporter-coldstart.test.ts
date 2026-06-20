import { resolveSupporterColdStart } from './supporter-coldstart';

type SelectResult = Array<Record<string, unknown>>;

interface FakeSelectBuilder {
  from: (...args: unknown[]) => FakeSelectBuilder;
  leftJoin: (...args: unknown[]) => FakeSelectBuilder;
  where: (...args: unknown[]) => FakeSelectBuilder;
  orderBy: (...args: unknown[]) => FakeSelectBuilder;
  limit: (...args: unknown[]) => Promise<SelectResult>;
}

function dbWithSelectResults(results: SelectResult[]) {
  const pending = [...results];
  const select = jest.fn((): FakeSelectBuilder => {
    const builder: FakeSelectBuilder = {
      from: jest.fn((..._args: unknown[]) => builder),
      leftJoin: jest.fn((..._args: unknown[]) => builder),
      where: jest.fn((..._args: unknown[]) => builder),
      orderBy: jest.fn((..._args: unknown[]) => builder),
      limit: jest.fn(async (..._args: unknown[]) => pending.shift() ?? []),
    };
    return builder;
  });
  return { select } as never;
}

const supporterPersonId = '00000000-0000-4000-8000-000000000001';

describe('resolveSupporterColdStart', () => {
  it('returns variant-zero when no accepted supportership edge exists', async () => {
    const db = dbWithSelectResults([[]]);

    await expect(
      resolveSupporterColdStart(db, supporterPersonId),
    ).resolves.toEqual({
      variant: 'variant-zero',
      cards: [{ state: 'none', anchor: 'add-child' }],
      selfLearningDoorway: true,
    });
  });

  it('branches accepted edges into managed, granted-idle, and active states', async () => {
    const db = dbWithSelectResults([
      [
        {
          edgeId: '00000000-0000-4000-8000-000000000101',
          personId: '00000000-0000-4000-8000-000000000201',
          displayName: 'Managed Child',
          hasOwnAccount: false,
        },
        {
          edgeId: '00000000-0000-4000-8000-000000000102',
          personId: '00000000-0000-4000-8000-000000000202',
          displayName: 'Idle Teen',
          hasOwnAccount: true,
        },
        {
          edgeId: '00000000-0000-4000-8000-000000000103',
          personId: '00000000-0000-4000-8000-000000000203',
          displayName: 'Active Teen',
          hasOwnAccount: true,
        },
      ],
      [],
      [],
      [{ surfaceCount: 3 }],
      [{ id: 'subject-1' }],
    ]);

    await expect(
      resolveSupporterColdStart(db, supporterPersonId),
    ).resolves.toEqual({
      variant: 'per-child',
      selfLearningDoorway: true,
      cards: [
        {
          personId: '00000000-0000-4000-8000-000000000201',
          edgeId: '00000000-0000-4000-8000-000000000101',
          displayName: 'Managed Child',
          state: 'managed',
          anchor: 'handoff',
        },
        {
          personId: '00000000-0000-4000-8000-000000000202',
          edgeId: '00000000-0000-4000-8000-000000000102',
          displayName: 'Idle Teen',
          state: 'granted-idle',
          anchor: 'kickstart',
          staleIdleStep: 2,
        },
      ],
    });
  });

  it('does not synthesize consent-pending cards without an S5 pending-link source', async () => {
    const db = dbWithSelectResults([[]]);

    const result = await resolveSupporterColdStart(db, supporterPersonId);

    expect(JSON.stringify(result)).not.toContain('consent-pending');
  });
});
