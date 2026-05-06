const mockFindSubscriptionById = jest.fn();
const mockGetFamilyPoolBreakdownSharing = jest.fn();

jest.mock('@eduagent/database', () => {
  const actual = jest.requireActual('@eduagent/database');
  return {
    ...actual,
    findSubscriptionById: (...args: unknown[]) =>
      mockFindSubscriptionById(...args),
  };
});

jest.mock('../settings', () => ({
  getFamilyPoolBreakdownSharing: (...args: unknown[]) =>
    mockGetFamilyPoolBreakdownSharing(...args),
}));

import type { Database } from '@eduagent/database';

import { getUsageBreakdownForProfile } from './family';

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
  const select = jest
    .fn()
    .mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([input.viewer]),
        }),
      }),
    })
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindSubscriptionById.mockResolvedValue({
      id: 'sub-1',
      accountId: 'account-1',
    });
  });

  it('shows the full breakdown to a non-owner adult when the owner shares it', async () => {
    mockGetFamilyPoolBreakdownSharing.mockResolvedValue(true);
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
    expect(result.byProfile.map((row) => row.profile_id)).toEqual([
      'owner-1',
      'coparent-1',
      'child-1',
    ]);
    expect(result.familyAggregate).toEqual({ used: 22, limit: 100 });
  });

  it('hides breakdown from child viewers when owner sharing is disabled', async () => {
    mockGetFamilyPoolBreakdownSharing.mockResolvedValue(false);
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

  it('shows child viewers the full breakdown when owner sharing is enabled', async () => {
    mockGetFamilyPoolBreakdownSharing.mockResolvedValue(true);
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

    expect(result.isOwnerBreakdownViewer).toBe(true);
    expect(result.byProfile.map((row) => row.profile_id)).toEqual([
      'owner-1',
      'child-1',
    ]);
    expect(result.familyAggregate).toEqual({ used: 17, limit: 100 });
    expect(result.selfUsedToday).toBeNull();
    expect(result.selfUsedThisMonth).toBeNull();
  });

  it('keeps non-owner adult viewers scoped to their own row when owner sharing is disabled', async () => {
    mockGetFamilyPoolBreakdownSharing.mockResolvedValue(false);
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
});
