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

import { person, profiles, consentStates } from '@eduagent/database';

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

// ---------------------------------------------------------------------------
// [WI-777] Identity-V2 wiring guard (CUT-B2).
//
// The find-overdue-profiles step branches on isIdentityV2EnabledInStep():
//   - v2:     SELECT … FROM person  (canonical model — person × membership ×
//             organization + consentGateSatisfiedSql; no consentStates subquery)
//   - legacy: SELECT … FROM profiles (profiles × accounts × consentStates)
// These tests assert the correct query root is chosen per flag, so a future
// regression of the v2 wiring (e.g. dropping the branch) fails CI before
// WP-FLAG removes the legacy tables. The DB module is NOT mocked here, so
// `person` / `profiles` / `consentStates` are the real Drizzle table objects
// the source passes to `.from(...)`.
// ---------------------------------------------------------------------------

describe('[WI-777] reviewDueScan identity-v2 wiring', () => {
  it('flag-on: query reads the canonical `person` model, not legacy `profiles`', async () => {
    const prev = process.env['IDENTITY_V2_ENABLED'];
    process.env['IDENTITY_V2_ENABLED'] = 'true';
    try {
      const db = buildChainableDb([]);
      mockGetStepDatabase.mockReturnValue(db);

      const { step } = createInngestStepRunner();
      const handler = (reviewDueScan as any).fn;
      await handler({ step });

      // v2 query roots on `person`; the legacy `profiles` / `consentStates`
      // surfaces are absent (v2 uses consentGateSatisfiedSql, not a
      // consentStates subquery).
      expect(db.builder.from).toHaveBeenCalledWith(person);
      expect(db.builder.from).not.toHaveBeenCalledWith(profiles);
      expect(db.builder.from).not.toHaveBeenCalledWith(consentStates);
    } finally {
      restoreFlag(prev);
    }
  });

  it('flag-off: legacy path stays intact — query reads `profiles`, not `person`', async () => {
    const prev = process.env['IDENTITY_V2_ENABLED'];
    delete process.env['IDENTITY_V2_ENABLED'];
    try {
      const db = buildChainableDb([]);
      mockGetStepDatabase.mockReturnValue(db);

      const { step } = createInngestStepRunner();
      const handler = (reviewDueScan as any).fn;
      await handler({ step });

      expect(db.builder.from).toHaveBeenCalledWith(profiles);
      expect(db.builder.from).not.toHaveBeenCalledWith(person);
    } finally {
      restoreFlag(prev);
    }
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
