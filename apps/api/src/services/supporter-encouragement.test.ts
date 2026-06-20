import { RateLimitedError } from '@eduagent/schemas';

import { ForbiddenError } from '../errors';
import { sendSupporterEncouragementChip } from './supporter-encouragement';

type SelectResult = Array<Record<string, unknown>>;

interface FakeSelectBuilder {
  from: (...args: unknown[]) => FakeSelectBuilder;
  innerJoin: (...args: unknown[]) => FakeSelectBuilder;
  where: (...args: unknown[]) => FakeSelectBuilder;
  limit: (...args: unknown[]) => Promise<SelectResult>;
}

interface FakeInsertBuilder {
  values: (...args: unknown[]) => FakeInsertBuilder;
  returning: (...args: unknown[]) => Promise<SelectResult>;
}

function dbWithResults(results: SelectResult[]) {
  const pending = [...results];
  const select = jest.fn((): FakeSelectBuilder => {
    const builder: FakeSelectBuilder = {
      from: jest.fn((..._args: unknown[]) => builder),
      innerJoin: jest.fn((..._args: unknown[]) => builder),
      where: jest.fn((..._args: unknown[]) => builder),
      limit: jest.fn(async (..._args: unknown[]) => pending.shift() ?? []),
    };
    return builder;
  });
  const insert = jest.fn((): FakeInsertBuilder => {
    const builder: FakeInsertBuilder = {
      values: jest.fn((..._args: unknown[]) => builder),
      returning: jest.fn(async (..._args: unknown[]) => pending.shift() ?? []),
    };
    return builder;
  });
  return { select, insert } as never;
}

const request = {
  supporterPersonId: '00000000-0000-4000-8000-000000000001',
  supporteePersonId: '00000000-0000-4000-8000-000000000002',
  source: 'kickstart' as const,
  suggestedText: 'Want to start with fractions?',
  now: new Date('2026-06-20T22:00:00.000Z'),
};

describe('sendSupporterEncouragementChip', () => {
  it('rejects missing or revoked supportership edges', async () => {
    const db = dbWithResults([[]]);

    await expect(
      sendSupporterEncouragementChip(db, request),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('writes a fillable chip through an active supportership without ledger writes', async () => {
    const db = dbWithResults([
      [
        {
          edgeId: '00000000-0000-4000-8000-000000000010',
          supporterDisplayName: 'Zuzana',
          timezone: 'UTC',
        },
      ],
      [{ count: 0 }],
      [
        {
          id: '00000000-0000-4000-8000-000000000020',
          supportershipId: '00000000-0000-4000-8000-000000000010',
          supporterPersonId: request.supporterPersonId,
          supporteePersonId: request.supporteePersonId,
          source: 'kickstart',
          suggestedText: request.suggestedText,
          createdAt: request.now,
          dismissedAt: null,
          consumedAt: null,
        },
      ],
    ]);

    await expect(sendSupporterEncouragementChip(db, request)).resolves.toEqual({
      chip: expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000020',
        supportershipId: '00000000-0000-4000-8000-000000000010',
        supporterDisplayName: 'Zuzana',
        suggestedText: request.suggestedText,
      }),
      pushSuppressedByQuietHours: true,
    });
  });

  it('rejects the fifth encouragement chip in the 24 hour window', async () => {
    const db = dbWithResults([
      [
        {
          edgeId: '00000000-0000-4000-8000-000000000010',
          supporterDisplayName: 'Zuzana',
          timezone: 'UTC',
        },
      ],
      [{ count: 4 }],
    ]);

    await expect(
      sendSupporterEncouragementChip(db, request),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });
});
