import { resolveScopesForPerson } from './scope-resolution';

type SelectResult = Array<Record<string, unknown>>;

interface FakeSelectBuilder {
  from: (...args: unknown[]) => FakeSelectBuilder;
  innerJoin: (...args: unknown[]) => FakeSelectBuilder;
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
      innerJoin: jest.fn((..._args: unknown[]) => builder),
      leftJoin: jest.fn((..._args: unknown[]) => builder),
      where: jest.fn((..._args: unknown[]) => builder),
      orderBy: jest.fn((..._args: unknown[]) => builder),
      limit: jest.fn(async (..._args: unknown[]) => pending.shift() ?? []),
    };
    return builder;
  });
  return { select } as never;
}

describe('resolveScopesForPerson', () => {
  it('returns learner shape without a chip when the person has no supportees', async () => {
    const db = dbWithSelectResults([[], [], []]);

    await expect(resolveScopesForPerson(db, 'person-owner')).resolves.toEqual({
      shape: 'learner',
    });
  });

  it('returns hub and person scopes for active supportership edges', async () => {
    const db = dbWithSelectResults([
      [
        {
          edgeId: '00000000-0000-4000-8000-000000000001',
          personId: '00000000-0000-4000-8000-000000000101',
          displayName: 'Emma',
          revokedAt: null,
        },
        {
          edgeId: '00000000-0000-4000-8000-000000000002',
          personId: '00000000-0000-4000-8000-000000000102',
          displayName: 'Liam',
          revokedAt: null,
        },
        {
          edgeId: '00000000-0000-4000-8000-000000000003',
          personId: '00000000-0000-4000-8000-000000000103',
          displayName: 'Revoked',
          revokedAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ],
      [],
      [],
    ]);

    await expect(
      resolveScopesForPerson(db, '00000000-0000-4000-8000-000000000201'),
    ).resolves.toEqual({
      shape: 'supporter',
      defaultScopeIndex: 0,
      scopes: [
        { kind: 'supporter-hub' },
        {
          kind: 'person',
          personId: '00000000-0000-4000-8000-000000000101',
          edgeId: '00000000-0000-4000-8000-000000000001',
          displayName: 'Emma',
        },
        {
          kind: 'person',
          personId: '00000000-0000-4000-8000-000000000102',
          edgeId: '00000000-0000-4000-8000-000000000002',
          displayName: 'Liam',
        },
      ],
    });
  });

  it('adds Me only after the supporter has durable self-learning state', async () => {
    const db = dbWithSelectResults([
      [
        {
          edgeId: '00000000-0000-4000-8000-000000000001',
          personId: '00000000-0000-4000-8000-000000000101',
          displayName: 'Emma',
          revokedAt: null,
        },
      ],
      [{ id: 'subject-1' }],
      [],
    ]);

    await expect(
      resolveScopesForPerson(db, '00000000-0000-4000-8000-000000000201'),
    ).resolves.toEqual({
      shape: 'supporter',
      defaultScopeIndex: 0,
      scopes: [
        { kind: 'supporter-hub' },
        {
          kind: 'person',
          personId: '00000000-0000-4000-8000-000000000101',
          edgeId: '00000000-0000-4000-8000-000000000001',
          displayName: 'Emma',
        },
        { kind: 'me' },
      ],
    });
  });
});
