// ---------------------------------------------------------------------------
// Daily Reminder Scan — Tests
//
// The scan function uses a drizzle chained query (select/from/innerJoin/where)
// that is difficult to mock at the ORM level. The canonical approach here is
// to stub getStepDatabase() and use createInngestStepRunner's `runResults`
// option to inject pre-cooked `find-streak-profiles` outcomes. This lets every
// test scenario control exactly which profiles are returned without replicating
// the full drizzle builder surface.
// ---------------------------------------------------------------------------

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

import { dailyReminderScan } from './daily-reminder-scan';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EligibleProfile = { profileId: string; streakDays: number };

interface ScanResult {
  status: string;
  eligibleCount: number;
  sentEvents: number;
}

/**
 * Runs the scan handler with a pre-cooked list of eligible profiles.
 *
 * Using `runResults` bypasses the drizzle query entirely — the step runner
 * returns the provided array directly from the `find-streak-profiles` step
 * without ever calling the callback, so no DB connection is needed.
 */
async function executeHandler(
  eligibleProfiles: EligibleProfile[] = [],
): Promise<{
  result: ScanResult;
  sendEventCalls: ReturnType<typeof createInngestStepRunner>['sendEventCalls'];
  runCalls: ReturnType<typeof createInngestStepRunner>['runCalls'];
}> {
  const { step, sendEventCalls, runCalls } = createInngestStepRunner({
    runResults: {
      'find-streak-profiles': eligibleProfiles,
    },
  });

  const handler = (dailyReminderScan as any).fn;
  const result = (await handler({
    event: { id: 'evt-scan-001', name: 'inngest/scheduled' },
    step,
  })) as ScanResult;

  return { result, sendEventCalls, runCalls };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProfiles(count: number, startIdx = 1): EligibleProfile[] {
  return Array.from({ length: count }, (_, i) => ({
    profileId: `profile-${startIdx + i}`,
    streakDays: startIdx + i,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dailyReminderScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockGetStepDatabase.mockReturnValue({});
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  describe('configuration', () => {
    it('is defined as an Inngest function with the expected id', () => {
      expect((dailyReminderScan as { opts?: { id?: string } }).opts?.id).toBe(
        'daily-reminder-scan',
      );
    });

    it('has a cron trigger (runs hourly)', () => {
      const trigger = (dailyReminderScan as any).trigger;
      expect(trigger.cron).toBe('0 * * * *');
    });
  });

  // -------------------------------------------------------------------------
  // Zero-eligible path
  // -------------------------------------------------------------------------

  describe('zero eligible profiles', () => {
    it('returns completed status with eligibleCount=0 and sentEvents=0', async () => {
      const { result } = await executeHandler([]);

      expect(result).toEqual({
        status: 'completed',
        eligibleCount: 0,
        sentEvents: 0,
      });
    });

    it('does not call step.sendEvent when there are no eligible profiles', async () => {
      const { sendEventCalls } = await executeHandler([]);

      expect(sendEventCalls).toHaveLength(0);
    });

    it('does not call bare inngest.send when there are no eligible profiles', async () => {
      await executeHandler([]);

      expect(mockInngestTransport.sentEvents).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Single eligible profile
  // -------------------------------------------------------------------------

  describe('single eligible profile', () => {
    it('dispatches one fan-out-0 step.sendEvent with one app/daily-reminder.send event', async () => {
      const { sendEventCalls } = await executeHandler([
        { profileId: 'profile-abc', streakDays: 7 },
      ]);

      expect(sendEventCalls).toHaveLength(1);
      expect(sendEventCalls[0]!.name).toBe('fan-out-0');
      expect(sendEventCalls[0]!.payload).toEqual([
        {
          name: 'app/daily-reminder.send',
          data: { profileId: 'profile-abc', streakDays: 7 },
        },
      ]);
    });

    it('returns eligibleCount=1 and sentEvents=1', async () => {
      const { result } = await executeHandler([
        { profileId: 'profile-abc', streakDays: 7 },
      ]);

      expect(result).toEqual({
        status: 'completed',
        eligibleCount: 1,
        sentEvents: 1,
      });
    });

    it('maps streakDays from currentStreak correctly', async () => {
      const { sendEventCalls } = await executeHandler([
        { profileId: 'p-streak', streakDays: 42 },
      ]);

      const payload = sendEventCalls[0]!.payload as Array<{
        data: { streakDays: number };
      }>;
      expect(payload[0]!.data.streakDays).toBe(42);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple profiles — single chunk (< 500)
  // -------------------------------------------------------------------------

  describe('multiple profiles in a single chunk', () => {
    it('dispatches all profiles in one fan-out-0 sendEvent call', async () => {
      const profiles = makeProfiles(3);
      const { sendEventCalls } = await executeHandler(profiles);

      expect(sendEventCalls).toHaveLength(1);
      expect(sendEventCalls[0]!.name).toBe('fan-out-0');

      const events = sendEventCalls[0]!.payload as Array<{
        name: string;
        data: { profileId: string; streakDays: number };
      }>;
      expect(events).toHaveLength(3);
      expect(events.map((e) => e.data.profileId)).toEqual([
        'profile-1',
        'profile-2',
        'profile-3',
      ]);
    });

    it('uses app/daily-reminder.send as the event name for every event', async () => {
      const profiles = makeProfiles(3);
      const { sendEventCalls } = await executeHandler(profiles);

      const events = sendEventCalls[0]!.payload as Array<{ name: string }>;
      expect(events.every((e) => e.name === 'app/daily-reminder.send')).toBe(
        true,
      );
    });

    it('returns sentEvents equal to the number of eligible profiles', async () => {
      const profiles = makeProfiles(5);
      const { result } = await executeHandler(profiles);

      expect(result.eligibleCount).toBe(5);
      expect(result.sentEvents).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Chunking at 500 boundaries
  // -------------------------------------------------------------------------

  describe('chunked fan-out (batch size 500)', () => {
    it('sends exactly one step.sendEvent call for 500 profiles (boundary)', async () => {
      const profiles = makeProfiles(500);
      const { sendEventCalls, result } = await executeHandler(profiles);

      expect(sendEventCalls).toHaveLength(1);
      expect(sendEventCalls[0]!.name).toBe('fan-out-0');
      expect(result.sentEvents).toBe(500);
    });

    it('sends two step.sendEvent calls for 501 profiles (boundary + 1)', async () => {
      const profiles = makeProfiles(501);
      const { sendEventCalls, result } = await executeHandler(profiles);

      expect(sendEventCalls).toHaveLength(2);
      expect(sendEventCalls[0]!.name).toBe('fan-out-0');
      expect(sendEventCalls[1]!.name).toBe('fan-out-500');
      expect(result.sentEvents).toBe(501);
    });

    it('first chunk has 500 events and second chunk has the remainder', async () => {
      const profiles = makeProfiles(503);
      const { sendEventCalls } = await executeHandler(profiles);

      const chunk1 = sendEventCalls[0]!.payload as unknown[];
      const chunk2 = sendEventCalls[1]!.payload as unknown[];
      expect(chunk1).toHaveLength(500);
      expect(chunk2).toHaveLength(3);
    });

    it('sends three step.sendEvent calls for 1001 profiles', async () => {
      const profiles = makeProfiles(1001);
      const { sendEventCalls, result } = await executeHandler(profiles);

      expect(sendEventCalls).toHaveLength(3);
      expect(sendEventCalls[0]!.name).toBe('fan-out-0');
      expect(sendEventCalls[1]!.name).toBe('fan-out-500');
      expect(sendEventCalls[2]!.name).toBe('fan-out-1000');
      expect(result.sentEvents).toBe(1001);
    });

    it('fan-out step names are fan-out-{offset} (0, 500, 1000, ...)', async () => {
      const profiles = makeProfiles(1100);
      const { sendEventCalls } = await executeHandler(profiles);

      const names = sendEventCalls.map((c) => c.name);
      expect(names).toEqual(['fan-out-0', 'fan-out-500', 'fan-out-1000']);
    });

    it('does not use bare inngest.send — only memoized step.sendEvent', async () => {
      const profiles = makeProfiles(501);
      await executeHandler(profiles);

      expect(mockInngestTransport.sentEvents).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------

  describe('return shape', () => {
    it('always includes status, eligibleCount, and sentEvents', async () => {
      const { result } = await executeHandler(makeProfiles(2));

      expect(result).toHaveProperty('status', 'completed');
      expect(result).toHaveProperty('eligibleCount', 2);
      expect(result).toHaveProperty('sentEvents', 2);
    });

    it('eligibleCount matches sentEvents for a single chunk', async () => {
      const profiles = makeProfiles(10);
      const { result } = await executeHandler(profiles);

      expect(result.eligibleCount).toBe(result.sentEvents);
    });

    it('eligibleCount matches sentEvents for a multi-chunk run', async () => {
      const profiles = makeProfiles(750);
      const { result } = await executeHandler(profiles);

      expect(result.eligibleCount).toBe(750);
      expect(result.sentEvents).toBe(750);
    });
  });

  // -------------------------------------------------------------------------
  // Step name assertion
  // -------------------------------------------------------------------------

  describe('step names', () => {
    it('runs find-streak-profiles as the first step', async () => {
      const { runCalls } = await executeHandler([]);

      expect(runCalls).toHaveLength(1);
      expect(runCalls[0]!.name).toBe('find-streak-profiles');
    });

    it('does not run additional named steps beyond find-streak-profiles', async () => {
      const { runCalls } = await executeHandler(makeProfiles(3));

      // All fan-out work is done via step.sendEvent, not step.run
      expect(runCalls).toHaveLength(1);
      expect(runCalls[0]!.name).toBe('find-streak-profiles');
    });
  });
});

// ---------------------------------------------------------------------------
// Break tests — guard specific behaviors against regression
// ---------------------------------------------------------------------------

describe('[BREAK] daily-reminder-scan fan-out event shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    mockGetStepDatabase.mockReturnValue({});
  });

  it('[BREAK] each event carries profileId and streakDays at data root', async () => {
    // Guards the contract consumed by dailyReminderSend:
    // event.data.profileId and event.data.streakDays must be present.
    const { step, sendEventCalls } = createInngestStepRunner({
      runResults: {
        'find-streak-profiles': [{ profileId: 'p-x', streakDays: 12 }],
      },
    });
    const handler = (dailyReminderScan as any).fn;
    await handler({ event: { id: 'evt-break-001' }, step });

    const events = sendEventCalls[0]!.payload as Array<{
      name: string;
      data: unknown;
    }>;
    expect(events[0]).toEqual({
      name: 'app/daily-reminder.send',
      data: { profileId: 'p-x', streakDays: 12 },
    });
  });

  it('[BREAK] zero eligible → status:completed not status:skipped', async () => {
    // The source returns { status: 'completed', ... } even for zero eligible.
    // Guards against a future refactor changing to a different status string.
    const { step } = createInngestStepRunner({
      runResults: { 'find-streak-profiles': [] },
    });
    const handler = (dailyReminderScan as any).fn;
    const result = await handler({ event: { id: 'evt-break-002' }, step });
    expect(result.status).toBe('completed');
  });

  it('[BREAK] profiles are not deduplicated client-side — each eligible profile gets exactly one event', async () => {
    // Server-side dedup is handled by the SQL query (notExists on notificationLog).
    // The scan function must NOT apply its own in-memory dedup — if two entries
    // arrive for the same profileId, both events must be dispatched so the
    // per-profile send handler can apply its own idempotency guard.
    const duplicateProfiles: EligibleProfile[] = [
      { profileId: 'p-dup', streakDays: 5 },
      { profileId: 'p-dup', streakDays: 5 },
    ];
    const { step, sendEventCalls } = createInngestStepRunner({
      runResults: { 'find-streak-profiles': duplicateProfiles },
    });
    const handler = (dailyReminderScan as any).fn;
    const result = await handler({ event: { id: 'evt-break-003' }, step });

    const events = sendEventCalls[0]!.payload as unknown[];
    expect(events).toHaveLength(2);
    expect(result.sentEvents).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// [WI-777] Identity-V2 wiring guard (CUT-B2).
//
// The find-streak-profiles step branches on isIdentityV2EnabledInStep():
//   - v2:     SELECT … FROM person  (person × membership × organization +
//             consentGateSatisfiedSql; no consentStates subquery)
//   - legacy: SELECT … FROM profiles (profiles × accounts × consentStates)
// The runResults-based tests above bypass the step body, so they cannot see
// this branch. These tests run the real find-streak-profiles query against a
// chainable DB stub and assert the correct query root per flag — guarding the
// v2 wiring against regression before WP-FLAG drops the legacy tables. The DB
// module is NOT mocked here, so `person` / `profiles` / `consentStates` are the
// real Drizzle table objects the source passes to `.from(...)`.
// ---------------------------------------------------------------------------

function buildChainableDb(
  rows: Array<{ profileId: string; currentStreak: number }>,
): { select: jest.Mock; builder: Record<string, jest.Mock> } {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['from', 'innerJoin', 'leftJoin', 'orderBy', 'limit']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  // The scan awaits the builder after `.where(...)`; resolve the rows there.
  builder['where'] = jest.fn().mockResolvedValue(rows);

  return {
    select: jest.fn().mockReturnValue(builder),
    builder,
  };
}

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

describe('[WI-777] dailyReminderScan identity-v2 wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInngestTransport.clear();
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  });

  afterEach(() => {
    delete process.env['DATABASE_URL'];
  });

  it('flag-on: query reads the canonical `person` model, not legacy `profiles`', async () => {
    const prev = process.env['IDENTITY_V2_ENABLED'];
    process.env['IDENTITY_V2_ENABLED'] = 'true';
    try {
      const db = buildChainableDb([]);
      mockGetStepDatabase.mockReturnValue(db);

      const { step } = createInngestStepRunner();
      const handler = (dailyReminderScan as any).fn;
      await handler({ event: { id: 'evt-v2-on' }, step });

      expect(db.builder.from).toHaveBeenCalledWith(person);
      expect(db.builder.from).not.toHaveBeenCalledWith(profiles);
      expect(db.builder.from).not.toHaveBeenCalledWith(consentStates);
    } finally {
      restoreFlag(prev);
    }
  });

  // [WI-867] flag collapsed — legacy path is dead; flag-off now routes to v2.
  it('flag-off → v2: query still reads `person`, not legacy `profiles`', async () => {
    const prev = process.env['IDENTITY_V2_ENABLED'];
    delete process.env['IDENTITY_V2_ENABLED'];
    try {
      const db = buildChainableDb([]);
      mockGetStepDatabase.mockReturnValue(db);

      const { step } = createInngestStepRunner();
      const handler = (dailyReminderScan as any).fn;
      await handler({ event: { id: 'evt-v2-off' }, step });

      // Flag is collapsed; source always uses person even when env var is absent.
      expect(db.builder.from).toHaveBeenCalledWith(person);
      expect(db.builder.from).not.toHaveBeenCalledWith(profiles);
    } finally {
      restoreFlag(prev);
    }
  });
});
