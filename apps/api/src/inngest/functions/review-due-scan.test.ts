const mockGetStepDatabase = jest.fn();

jest.mock('../helpers' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return { ...actual, getStepDatabase: () => mockGetStepDatabase() };
});

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return { ...actual, inngest: mockInngestTransport.inngest };
});

import { reviewDueScan } from './review-due-scan';

function buildChainableDb(
  rows: Array<{
    profileId: string;
    overdueCount: number;
    topTopicIds: string[] | null;
  }>,
): { select: jest.Mock; builder: Record<string, jest.Mock> } {
  const builder: Record<string, jest.Mock> = {};
  for (const method of [
    'from',
    'innerJoin',
    'leftJoin',
    'where',
    'having',
    'orderBy',
    'limit',
    'offset',
  ]) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder['groupBy'] = jest.fn().mockResolvedValue(rows);

  return {
    select: jest.fn().mockReturnValue(builder),
    builder,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInngestTransport.clear();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
});

afterEach(() => {
  delete process.env['DATABASE_URL'];
});

describe('reviewDueScan — find-overdue-profiles step DB path', () => {
  it('[WI-80] joins retention cards through owned topic parents before aggregating', async () => {
    const db = buildChainableDb([]);
    mockGetStepDatabase.mockReturnValue(db);

    const { step } = createInngestStepRunner();
    const handler = (reviewDueScan as any).fn;
    await handler({ step });

    expect(db.builder.innerJoin).toHaveBeenCalledTimes(7);
  });

  it('maps null topTopicIds to an empty array before fan-out', async () => {
    const db = buildChainableDb([
      {
        profileId: 'profile-1',
        overdueCount: 2,
        topTopicIds: null,
      },
    ]);
    mockGetStepDatabase.mockReturnValue(db);

    const { step, sendEventCalls } = createInngestStepRunner();
    const handler = (reviewDueScan as any).fn;
    await handler({ step });

    const payload = sendEventCalls[0]?.payload as Array<{
      data: { topTopicIds: string[] };
    }>;
    expect(payload[0]?.data.topTopicIds).toEqual([]);
  });
});
