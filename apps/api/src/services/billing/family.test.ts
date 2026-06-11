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
