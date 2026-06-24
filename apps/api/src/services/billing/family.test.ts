const mockFindSubscriptionById = jest.fn();

jest.mock(
  '@eduagent/database' /* gc1-allow: service unit test — db boundary mocked; real DB covered by sibling .integration.test.ts where present */,
  () => {
    const actual = jest.requireActual('@eduagent/database');
    return {
      ...actual,
      // [BUG-565] renamed to __unscoped suffix
      findSubscriptionById__unscoped: (...args: unknown[]) =>
        mockFindSubscriptionById(...args),
    };
  },
);

import type { Database } from '@eduagent/database';

import * as sentryModule from '../sentry';
import * as settingsService from '../settings';
import * as subscriptionCore from './subscription-core';
import {
  downgradeAllFamilyProfiles,
  getUsageBreakdownForProfile,
  listFamilyMembers,
  type UsageBreakdown,
} from './family';

function createUsageBreakdownDb(input: {
  viewer: {
    id: string;
    displayName: string;
    isOwner: boolean;
    familyOwnerProfileId: string | null;
    hasChildLink: boolean;
    isChild: boolean;
  };
  profileRows: Array<{
    profileId: string;
    name: string;
    used: number;
    usedToday: number;
  }>;
}): Database {
  const selectLimit = (rows: unknown[]) => ({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(rows),
      }),
    }),
  });

  const select = jest
    .fn()
    .mockReturnValueOnce(
      selectLimit([
        {
          id: input.viewer.id,
          displayName: input.viewer.displayName,
          isOwner: input.viewer.isOwner,
          accountId: 'account-1',
        },
      ]),
    )
    .mockReturnValueOnce(
      selectLimit(
        input.viewer.familyOwnerProfileId
          ? [{ id: input.viewer.familyOwnerProfileId }]
          : [],
      ),
    )
    .mockReturnValueOnce(
      selectLimit(input.viewer.hasChildLink ? [{ id: 'parent-link-1' }] : []),
    )
    .mockReturnValueOnce(
      selectLimit(input.viewer.isChild ? [{ id: 'child-link-1' }] : []),
    )
    .mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            groupBy: jest.fn().mockResolvedValue(input.profileRows),
          }),
        }),
      }),
    });

  return { select } as unknown as Database;
}

describe('getUsageBreakdownForProfile family-pool sharing', () => {
  let sharingSpy: jest.SpiedFunction<
    typeof settingsService.getFamilyPoolBreakdownSharing
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    sharingSpy = jest
      .spyOn(settingsService, 'getFamilyPoolBreakdownSharing')
      .mockResolvedValue(false);
    mockFindSubscriptionById.mockResolvedValue({
      id: 'sub-1',
      accountId: 'account-1',
    });
  });

  afterEach(() => {
    sharingSpy.mockRestore();
  });

  it('shows the full breakdown to a non-owner adult when the owner shares it', async () => {
    sharingSpy.mockResolvedValue(true);
    const db = createUsageBreakdownDb({
      viewer: {
        id: 'coparent-1',
        displayName: 'Co-parent',
        isOwner: false,
        familyOwnerProfileId: 'owner-1',
        hasChildLink: true,
        isChild: false,
      },
      profileRows: [
        { profileId: 'owner-1', name: 'Owner', used: 10, usedToday: 1 },
        {
          profileId: 'coparent-1',
          name: 'Co-parent',
          used: 5,
          usedToday: 2,
        },
        { profileId: 'child-1', name: 'Child', used: 7, usedToday: 3 },
      ],
    });

    const result = await getUsageBreakdownForProfile(db, {
      subscriptionId: 'sub-1',
      activeProfileId: 'coparent-1',
      monthlyLimit: 100,
      cycleStartAt: '2026-05-01T00:00:00.000Z',
      dayStartAt: '2026-05-06T00:00:00.000Z',
    });

    expect(result.isOwnerBreakdownViewer).toBe(true);
    expect(
      result.byProfile.map(
        (row: UsageBreakdown['byProfile'][number]) => row.profile_id,
      ),
    ).toEqual(['owner-1', 'coparent-1', 'child-1']);
    expect(result.familyAggregate).toEqual({ used: 22, limit: 100 });
  });

  it('hides breakdown from child viewers when owner sharing is disabled', async () => {
    sharingSpy.mockResolvedValue(false);
    const db = createUsageBreakdownDb({
      viewer: {
        id: 'child-1',
        displayName: 'Child',
        isOwner: false,
        familyOwnerProfileId: 'owner-1',
        hasChildLink: false,
        isChild: true,
      },
      profileRows: [
        { profileId: 'owner-1', name: 'Owner', used: 10, usedToday: 1 },
        { profileId: 'child-1', name: 'Child', used: 7, usedToday: 3 },
      ],
    });

    const result = await getUsageBreakdownForProfile(db, {
      subscriptionId: 'sub-1',
      activeProfileId: 'child-1',
      monthlyLimit: 100,
      cycleStartAt: '2026-05-01T00:00:00.000Z',
      dayStartAt: '2026-05-06T00:00:00.000Z',
    });

    expect(result.isOwnerBreakdownViewer).toBe(false);
    expect(result.byProfile).toHaveLength(0);
    expect(result.familyAggregate).toBeNull();
    expect(result.selfUsedToday).toBe(3);
    expect(result.selfUsedThisMonth).toBe(7);
  });

  it('hides breakdown from child viewers even when owner sharing is enabled', async () => {
    sharingSpy.mockResolvedValue(true);
    const db = createUsageBreakdownDb({
      viewer: {
        id: 'child-1',
        displayName: 'Child',
        isOwner: false,
        familyOwnerProfileId: 'owner-1',
        hasChildLink: false,
        isChild: true,
      },
      profileRows: [
        { profileId: 'owner-1', name: 'Owner', used: 10, usedToday: 1 },
        { profileId: 'child-1', name: 'Child', used: 7, usedToday: 3 },
      ],
    });

    const result = await getUsageBreakdownForProfile(db, {
      subscriptionId: 'sub-1',
      activeProfileId: 'child-1',
      monthlyLimit: 100,
      cycleStartAt: '2026-05-01T00:00:00.000Z',
      dayStartAt: '2026-05-06T00:00:00.000Z',
    });

    // Children must never see the full family breakdown, even when the owner
    // enables sharing. Sharing is for non-owner adults (co-parents) only (C2).
    expect(result.isOwnerBreakdownViewer).toBe(false);
    expect(result.byProfile).toHaveLength(0);
    expect(result.familyAggregate).toBeNull();
    // selfUsedToday and selfUsedThisMonth must reflect the child's own events
    // only — never the family aggregate.
    expect(result.selfUsedToday).toBe(3);
    expect(result.selfUsedThisMonth).toBe(7);
  });

  it('keeps non-owner adult viewers scoped to their own row when owner sharing is disabled', async () => {
    sharingSpy.mockResolvedValue(false);
    const db = createUsageBreakdownDb({
      viewer: {
        id: 'coparent-1',
        displayName: 'Co-parent',
        isOwner: false,
        familyOwnerProfileId: 'owner-1',
        hasChildLink: true,
        isChild: false,
      },
      profileRows: [
        { profileId: 'owner-1', name: 'Owner', used: 10, usedToday: 1 },
        {
          profileId: 'coparent-1',
          name: 'Co-parent',
          used: 5,
          usedToday: 2,
        },
        { profileId: 'child-1', name: 'Child', used: 7, usedToday: 3 },
      ],
    });

    const result = await getUsageBreakdownForProfile(db, {
      subscriptionId: 'sub-1',
      activeProfileId: 'coparent-1',
      monthlyLimit: 100,
      cycleStartAt: '2026-05-01T00:00:00.000Z',
      dayStartAt: '2026-05-06T00:00:00.000Z',
    });

    expect(result.isOwnerBreakdownViewer).toBe(false);
    expect(result.byProfile).toHaveLength(1);
    expect(result.byProfile[0]?.profile_id).toBe('coparent-1');
    expect(result.familyAggregate).toBeNull();
    expect(result.selfUsedToday).toBe(2);
    expect(result.selfUsedThisMonth).toBe(5);
  });

  it('does not share the full breakdown with unrelated adult profiles', async () => {
    sharingSpy.mockResolvedValue(true);
    const db = createUsageBreakdownDb({
      viewer: {
        id: 'adult-1',
        displayName: 'Adult',
        isOwner: false,
        familyOwnerProfileId: 'owner-1',
        hasChildLink: false,
        isChild: false,
      },
      profileRows: [
        { profileId: 'owner-1', name: 'Owner', used: 10, usedToday: 1 },
        { profileId: 'adult-1', name: 'Adult', used: 5, usedToday: 2 },
        { profileId: 'child-1', name: 'Child', used: 7, usedToday: 3 },
      ],
    });

    const result = await getUsageBreakdownForProfile(db, {
      subscriptionId: 'sub-1',
      activeProfileId: 'adult-1',
      monthlyLimit: 100,
      cycleStartAt: '2026-05-01T00:00:00.000Z',
      dayStartAt: '2026-05-06T00:00:00.000Z',
    });

    expect(result.isOwnerBreakdownViewer).toBe(false);
    expect(
      result.byProfile.map(
        (row: UsageBreakdown['byProfile'][number]) => row.profile_id,
      ),
    ).toEqual(['adult-1']);
    expect(result.familyAggregate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Subscription-not-found escalation (errors-api F-022 review follow-up):
// billing recovery paths must pair logger.warn with captureException —
// console.warn alone is banned in billing code.
// ---------------------------------------------------------------------------

describe('subscription-not-found escalation', () => {
  let captureExceptionSpy: jest.SpiedFunction<
    typeof sentryModule.captureException
  >;
  let warnSpy: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindSubscriptionById.mockResolvedValue(null);
    captureExceptionSpy = jest
      .spyOn(sentryModule, 'captureException')
      .mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    captureExceptionSpy.mockRestore();
    warnSpy.mockRestore();
  });

  function findWarnEntry(
    needle: string,
  ): { context?: { event?: string } } | undefined {
    return warnSpy.mock.calls
      .map((call) => {
        try {
          return JSON.parse(call[0] as string) as {
            message?: string;
            context?: { event?: string };
          };
        } catch {
          return undefined;
        }
      })
      .find((entry) => entry?.message?.includes(needle));
  }

  it('listFamilyMembers logs warn + captureException when subscription not found', async () => {
    const result = await listFamilyMembers(
      {} as unknown as Database,
      'missing-sub-id',
    );

    expect(result).toEqual([]);

    const warnEntry = findWarnEntry(
      'listFamilyMembers: subscription not found',
    );
    expect(warnEntry).toBeDefined();
    expect(warnEntry?.context?.event).toBe(
      'billing.family.list_members.subscription_not_found',
    );

    expect(captureExceptionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'listFamilyMembers: subscription not found',
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'billing.family.list_members.subscription_not_found',
          subscriptionId: 'missing-sub-id',
        }),
      }),
    );
  });

  it('downgradeAllFamilyProfiles logs warn + captureException when subscription not found', async () => {
    const result = await downgradeAllFamilyProfiles(
      {} as unknown as Database,
      'missing-sub-id',
      new Map(),
    );

    expect(result).toEqual([]);

    const warnEntry = findWarnEntry(
      'downgradeAllFamilyProfiles: subscription not found',
    );
    expect(warnEntry).toBeDefined();
    expect(warnEntry?.context?.event).toBe(
      'billing.family.downgrade_all.subscription_not_found',
    );

    expect(captureExceptionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'downgradeAllFamilyProfiles: subscription not found',
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'billing.family.downgrade_all.subscription_not_found',
          subscriptionId: 'missing-sub-id',
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// [WI-960] downgradeAllFamilyProfiles — parallel provisioning + bounded query
//
// Problem: the original implementation awaited db.update(profile) and then
// ensureFreeSubscription sequentially per non-owner profile — N*2 serial
// round-trips for a family with N non-owner members. The unbounded findMany
// also had no limit guard.
//
// Fix:
//   1. Adds `limit: DOWNGRADE_PROFILE_QUERY_LIMIT` (100) to the profiles query.
//   2. Collects all non-owner profiles to downgrade, then fans out with
//      Promise.all: each profile's update + provision pair runs as an
//      independent async task, so all updates fire before any provision
//      completes (parallel execution).
//
// Red-green evidence:
//   GREEN (fix): callOrder = ['update-a', 'update-b', 'provision-a',
//     'provision-b'] — both updates fire before either provision resolves.
//   RED (revert to serial loop): callOrder = ['update-a', 'provision-a',
//     'update-b', 'provision-b'] — provision-a blocks update-b.
// ---------------------------------------------------------------------------

describe('[WI-960] downgradeAllFamilyProfiles — parallel provisioning + bounded query', () => {
  let ensureFreeSpy: jest.SpiedFunction<
    typeof subscriptionCore.ensureFreeSubscription
  >;
  let updateQuotaSpy: jest.SpiedFunction<
    typeof subscriptionCore.updateQuotaPoolLimit
  >;

  // Execution-order tracker. The profile updates are synchronous (resolved
  // immediately), whereas ensureFreeSubscription for profile-a is deferred by
  // one microtask tick. With parallel execution both updates fire before either
  // provision resolves; with serial execution provision-a would block update-b.
  const callOrder: string[] = [];

  const SUBSCRIPTION_ID = 'sub-family-960';
  const ACCOUNT_ID = 'account-family-960';
  const PROFILE_OWNER = 'profile-owner';
  const PROFILE_NON_OWNER_A = 'profile-non-owner-a';
  const PROFILE_NON_OWNER_B = 'profile-non-owner-b';
  const NEW_ACCOUNT_A = 'new-account-a';
  const NEW_ACCOUNT_B = 'new-account-b';

  function buildFakeDb(): Database {
    // profile update mock: records call synchronously, returns a resolved value.
    const profileUpdateMock = jest
      .fn()
      .mockImplementation((_updateArg: unknown) => ({
        set: jest.fn().mockImplementation((setArg: { accountId?: string }) => ({
          where: jest.fn().mockImplementation(() => {
            const newAccountId = setArg.accountId;
            // Identify which profile is being updated by the new account id.
            if (newAccountId === NEW_ACCOUNT_A) {
              callOrder.push('update-a');
            } else if (newAccountId === NEW_ACCOUNT_B) {
              callOrder.push('update-b');
            } else {
              // owner subscription tier downgrade
              callOrder.push('update-owner-sub');
            }
            return Promise.resolve([]);
          }),
        })),
      }));

    const db = {
      query: {
        profiles: {
          findMany: jest.fn().mockResolvedValue([
            { id: PROFILE_OWNER, isOwner: true, accountId: ACCOUNT_ID },
            { id: PROFILE_NON_OWNER_A, isOwner: false, accountId: ACCOUNT_ID },
            { id: PROFILE_NON_OWNER_B, isOwner: false, accountId: ACCOUNT_ID },
          ]),
        },
      },
      update: profileUpdateMock,
    } as unknown as Database;

    return db;
  }

  beforeEach(() => {
    callOrder.length = 0;
    jest.clearAllMocks();

    // mockFindSubscriptionById is declared at the top of this test file and
    // patches findSubscriptionById__unscoped via the @eduagent/database mock.
    mockFindSubscriptionById.mockResolvedValue({
      id: SUBSCRIPTION_ID,
      accountId: ACCOUNT_ID,
    });

    // Spy on ensureFreeSubscription:
    //   - for NEW_ACCOUNT_A: deferred one microtask tick, records 'provision-a'
    //   - for NEW_ACCOUNT_B: resolves synchronously, records 'provision-b'
    // This guarantees that with PARALLEL execution both updates fire before
    // either provision records its entry, whereas SERIAL execution would record
    // provision-a between update-a and update-b.
    ensureFreeSpy = jest
      .spyOn(subscriptionCore, 'ensureFreeSubscription')
      .mockImplementation(async (_db, accountId) => {
        if (accountId === NEW_ACCOUNT_A) {
          // Defer to next microtask so concurrent update-b can fire first.
          await new Promise<void>((resolve) => resolve());
          callOrder.push('provision-a');
        } else {
          callOrder.push('provision-b');
        }
        return { id: `sub-${accountId}` } as ReturnType<
          typeof subscriptionCore.ensureFreeSubscription
        > extends Promise<infer T>
          ? T
          : never;
      });

    updateQuotaSpy = jest
      .spyOn(subscriptionCore, 'updateQuotaPoolLimit')
      .mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    ensureFreeSpy.mockRestore();
    updateQuotaSpy.mockRestore();
  });

  it('returns all non-owner profile ids and performs parallel update + provision', async () => {
    const db = buildFakeDb();
    const profileToAccountMap = new Map([
      [PROFILE_NON_OWNER_A, NEW_ACCOUNT_A],
      [PROFILE_NON_OWNER_B, NEW_ACCOUNT_B],
    ]);

    const downgraded = await downgradeAllFamilyProfiles(
      db,
      SUBSCRIPTION_ID,
      profileToAccountMap,
    );

    // All non-owner profiles are in the returned downgraded list.
    expect(downgraded.sort()).toEqual(
      [PROFILE_NON_OWNER_A, PROFILE_NON_OWNER_B].sort(),
    );

    // ensureFreeSubscription called once per non-owner profile.
    expect(ensureFreeSpy).toHaveBeenCalledTimes(2);
    expect(ensureFreeSpy).toHaveBeenCalledWith(db, NEW_ACCOUNT_A);
    expect(ensureFreeSpy).toHaveBeenCalledWith(db, NEW_ACCOUNT_B);

    // updateQuotaPoolLimit called once for the owner subscription.
    expect(updateQuotaSpy).toHaveBeenCalledTimes(1);
    expect(updateQuotaSpy).toHaveBeenCalledWith(
      db,
      SUBSCRIPTION_ID,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('fan-out is parallel: both profile updates fire before any provision completes', async () => {
    // THE KEY GUARD: with the old serial loop, provision-a would block
    // update-b, producing ['update-a', 'provision-a', 'update-b', ...].
    // With Promise.all both updates fire before any provision resolves:
    // ['update-a', 'update-b', 'provision-a', 'provision-b'].
    const db = buildFakeDb();
    const profileToAccountMap = new Map([
      [PROFILE_NON_OWNER_A, NEW_ACCOUNT_A],
      [PROFILE_NON_OWNER_B, NEW_ACCOUNT_B],
    ]);

    await downgradeAllFamilyProfiles(db, SUBSCRIPTION_ID, profileToAccountMap);

    const updateAIdx = callOrder.indexOf('update-a');
    const updateBIdx = callOrder.indexOf('update-b');
    const provisionAIdx = callOrder.indexOf('provision-a');
    const provisionBIdx = callOrder.indexOf('provision-b');

    // Both updates must have been recorded.
    expect(updateAIdx).toBeGreaterThanOrEqual(0);
    expect(updateBIdx).toBeGreaterThanOrEqual(0);
    expect(provisionAIdx).toBeGreaterThanOrEqual(0);
    expect(provisionBIdx).toBeGreaterThanOrEqual(0);

    // With parallel execution update-b fires BEFORE provision-a resolves
    // (since provision-a is deferred by one microtask tick).
    // Restoring the serial loop would cause provision-a to land between
    // update-a and update-b, making this assertion fail.
    expect(updateBIdx).toBeLessThan(provisionAIdx);
  });

  it('skips profiles not in the profileToAccountMap without error', async () => {
    const db = buildFakeDb();
    // Only profile-a is in the map; profile-b is absent.
    const profileToAccountMap = new Map([[PROFILE_NON_OWNER_A, NEW_ACCOUNT_A]]);

    const downgraded = await downgradeAllFamilyProfiles(
      db,
      SUBSCRIPTION_ID,
      profileToAccountMap,
    );

    expect(downgraded).toEqual([PROFILE_NON_OWNER_A]);
    expect(ensureFreeSpy).toHaveBeenCalledTimes(1);
    expect(ensureFreeSpy).toHaveBeenCalledWith(db, NEW_ACCOUNT_A);
  });
});
