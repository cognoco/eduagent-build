const mockGetStepDatabase = jest.fn();

jest.mock('../helpers', () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return { ...actual, getStepDatabase: () => mockGetStepDatabase() };
});

import { createInngestTransportCapture } from '../../test-utils/inngest-transport-capture';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const mockInngestTransport = createInngestTransportCapture();
jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return { ...actual, inngest: mockInngestTransport.inngest };
});

import { person } from '@eduagent/database';

import { reviewDueScan } from './review-due-scan';

const ORIGINAL_IDENTITY_V2_ENABLED = process.env['IDENTITY_V2_ENABLED'];

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
  delete process.env['IDENTITY_V2_ENABLED'];
});

afterEach(() => {
  delete process.env['DATABASE_URL'];
  restoreFlag(ORIGINAL_IDENTITY_V2_ENABLED);
});

describe('reviewDueScan — find-overdue-profiles step DB path', () => {
  it('[WI-80] joins retention cards through owned topic parents before aggregating', async () => {
    const db = buildChainableDb([]);
    mockGetStepDatabase.mockReturnValue(db);

    const { step } = createInngestStepRunner();
    const handler = (reviewDueScan as any).fn;
    await handler({ step });

    // [WI-867] v2-only collapse: query now joins person×membership×organization
    // (3) + retentionCards + curriculumTopics + curriculumBooks + curricula +
    // subjects + notificationPreferences = 8. Pre-collapse v1 path had 7.
    expect(db.builder.innerJoin).toHaveBeenCalledTimes(8);
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

// ---------------------------------------------------------------------------
// [WI-777] Identity-V2 wiring guard (CUT-B2 → [WI-867] v2-only).
//
// [WI-867] The flag branch was removed; the find-overdue-profiles step is
// v2-only (person × membership × organization + consentGateSatisfiedSql).
// The flag-on assertion still verifies the correct query root. The flag-off
// legacy-path test is dropped: the legacy branch no longer exists in source.
// ---------------------------------------------------------------------------

describe('[WI-777] reviewDueScan identity-v2 wiring', () => {
  it('query reads the canonical `person` model, not legacy `profiles`', async () => {
    const db = buildChainableDb([]);
    mockGetStepDatabase.mockReturnValue(db);

    const { step } = createInngestStepRunner();
    const handler = (reviewDueScan as any).fn;
    await handler({ step });

    // [WI-867] v2-only: source always queries from person; profiles /
    // consentStates surfaces are absent (consent gate via consentGateSatisfiedSql).
    // [WI-1139] Those legacy table defs are gone, so the "not
    // toHaveBeenCalledWith" counter-assertions were removed with them.
    expect(db.builder.from).toHaveBeenCalledWith(person);
  });
});

/**
 * Restore IDENTITY_V2_ENABLED to its prior value. Assigning `undefined`
 * directly coerces to the string "undefined", so delete when there was no
 * prior value.
 */
function restoreFlag(prev: string | undefined): void {
  if (prev === undefined) {
    delete process.env['IDENTITY_V2_ENABLED'];
  } else {
    process.env['IDENTITY_V2_ENABLED'] = prev;
  }
}
