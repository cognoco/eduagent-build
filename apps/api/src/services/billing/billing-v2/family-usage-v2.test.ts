// ---------------------------------------------------------------------------
// WI-722 — v2 twin of getUsageBreakdownForProfile (unit).
//
// CUT-B3 (WI-693) deliberately left getUsageBreakdownForProfile un-twinned: it
// reads `family_links` (guardianship — CUT-B2's surface) interleaved with
// `usage_events`. This twin re-points the family-edge reads onto the CUT-B2
// guardianship reader (services/identity-v2/guardianship.ts) — no duplicated
// family-edge logic — and the profile enumeration onto person × membership.
//
// These unit tests mirror the legacy family.test.ts mock-DB shape and assert
// the gating logic (isOwnerBreakdownViewer / child masking / self-scoping)
// behaves identically. The semantic-equivalence crux — same profileId set as
// the legacy family_links query, against a REAL family seed in both stores —
// is proved by family-usage-v2.integration.test.ts.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';

import * as settingsService from '../../settings';
import * as guardianshipService from '../../identity-v2/guardianship';
import { getUsageBreakdownForProfileV2 } from './family-usage-v2';
import type { UsageBreakdown } from '../family';

/**
 * Builds a mock Database that returns the v2-store rows the twin reads in
 * order: (1) subscription → organizationId, (2) viewer person+membership,
 * (3) org members (person+membership), (4) usage_events aggregate.
 *
 * The guardianship reads (getChargePersonIds / getGuardianPersonIds) are
 * spied separately so a test can assert the twin asks the CUT-B2 reader, not
 * `family_links`, for the edge state.
 */
function createV2Db(input: {
  organizationId: string | null;
  viewer: {
    id: string;
    displayName: string;
    roles: string[];
  } | null;
  orgMembers: Array<{ id: string; displayName: string; roles: string[] }>;
  usageRows: Array<{ profileId: string; used: number; usedToday: number }>;
}): Database {
  // subscription.findFirst → { organizationId }
  const subscriptionFindFirst = jest
    .fn()
    .mockResolvedValue(
      input.organizationId != null
        ? { organizationId: input.organizationId }
        : null,
    );

  // Two `db.select()...` chains are issued in sequence:
  //   #1 viewer person+membership row (.limit(1))
  //   #2 org member person+membership rows (no .limit)
  //   #3 usage_events aggregate (.groupBy)
  const viewerChain = {
    from: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest
            .fn()
            .mockResolvedValue(input.viewer ? [input.viewer] : []),
        }),
      }),
    }),
  };
  const membersChain = {
    from: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(input.orgMembers),
      }),
    }),
  };
  const usageChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        groupBy: jest.fn().mockResolvedValue(input.usageRows),
      }),
    }),
  };

  const select = jest
    .fn()
    .mockReturnValueOnce(viewerChain)
    .mockReturnValueOnce(membersChain)
    .mockReturnValueOnce(usageChain);

  return {
    select,
    query: { subscription: { findFirst: subscriptionFindFirst } },
  } as unknown as Database;
}

describe('getUsageBreakdownForProfileV2 (WI-722)', () => {
  let sharingSpy: jest.SpiedFunction<
    typeof settingsService.getFamilyPoolBreakdownSharing
  >;
  let chargeSpy: jest.SpiedFunction<
    typeof guardianshipService.getChargePersonIds
  >;
  let guardianSpy: jest.SpiedFunction<
    typeof guardianshipService.getGuardianPersonIds
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    sharingSpy = jest
      .spyOn(settingsService, 'getFamilyPoolBreakdownSharing')
      .mockResolvedValue(false);
    chargeSpy = jest
      .spyOn(guardianshipService, 'getChargePersonIds')
      .mockResolvedValue([]);
    guardianSpy = jest
      .spyOn(guardianshipService, 'getGuardianPersonIds')
      .mockResolvedValue([]);
  });

  afterEach(() => {
    sharingSpy.mockRestore();
    chargeSpy.mockRestore();
    guardianSpy.mockRestore();
  });

  it('reads guardianship edges via the CUT-B2 reader, never family_links', async () => {
    // The viewer is an owner (admin) WITH an active guardianship edge over a
    // child. The twin must call getChargePersonIds (guardian-side) and
    // getGuardianPersonIds (charge-side) — the family_links replacement.
    chargeSpy.mockResolvedValue(['child-1']); // viewer is a guardian
    guardianSpy.mockResolvedValue([]); // viewer is not a charge

    const db = createV2Db({
      organizationId: 'org-1',
      viewer: { id: 'owner-1', displayName: 'Owner', roles: ['admin'] },
      orgMembers: [
        { id: 'owner-1', displayName: 'Owner', roles: ['admin'] },
        { id: 'child-1', displayName: 'Child', roles: ['learner'] },
      ],
      usageRows: [
        { profileId: 'owner-1', used: 10, usedToday: 1 },
        { profileId: 'child-1', used: 7, usedToday: 3 },
      ],
    });

    const result = await getUsageBreakdownForProfileV2(db, {
      subscriptionId: 'sub-1',
      activeProfileId: 'owner-1',
      monthlyLimit: 100,
      cycleStartAt: '2026-05-01T00:00:00.000Z',
      dayStartAt: '2026-05-06T00:00:00.000Z',
    });

    // Edge state came from the guardianship reader (not family_links).
    expect(chargeSpy).toHaveBeenCalledWith(db, 'owner-1');
    expect(guardianSpy).toHaveBeenCalledWith(db, 'owner-1');

    // Owner-with-child viewer sees the full family breakdown + aggregate.
    expect(result.isOwnerBreakdownViewer).toBe(true);
    expect(
      result.byProfile.map(
        (row: UsageBreakdown['byProfile'][number]) => row.profile_id,
      ),
    ).toEqual(['owner-1', 'child-1']);
    expect(result.familyAggregate).toEqual({ used: 17, limit: 100 });
  });

  it('keeps the former-member bucket owner-visible after the last active child is removed', async () => {
    const db = createV2Db({
      organizationId: 'org-1',
      viewer: { id: 'owner-1', displayName: 'Owner', roles: ['admin'] },
      orgMembers: [{ id: 'owner-1', displayName: 'Owner', roles: ['admin'] }],
      usageRows: [{ profileId: 'owner-1', used: 1, usedToday: 1 }],
    });
    const result = await getUsageBreakdownForProfileV2(db, {
      subscriptionId: 'sub-1',
      activeProfileId: 'owner-1',
      monthlyLimit: 100,
      cycleStartAt: '2026-05-01T00:00:00.000Z',
      dayStartAt: '2026-05-06T00:00:00.000Z',
      inactiveMemberUsedThisMonth: 5,
    });

    expect(result.isOwnerBreakdownViewer).toBe(true);
    expect(
      result.byProfile.find((row) => row.profile_id === 'owner-1'),
    ).toEqual(expect.objectContaining({ used: 1 }));
    expect(result.familyAggregate).toEqual({
      used: 6,
      limit: 100,
      formerMemberUsed: 5,
    });
  });

  it('shows the full breakdown to a non-owner adult when the owner shares it', async () => {
    sharingSpy.mockResolvedValue(true);
    chargeSpy.mockResolvedValue(['child-1']); // co-parent is a guardian
    guardianSpy.mockResolvedValue([]); // co-parent is not a charge

    const db = createV2Db({
      organizationId: 'org-1',
      viewer: {
        id: 'coparent-1',
        displayName: 'Co-parent',
        roles: ['learner'],
      },
      orgMembers: [
        { id: 'owner-1', displayName: 'Owner', roles: ['admin'] },
        { id: 'coparent-1', displayName: 'Co-parent', roles: ['learner'] },
        { id: 'child-1', displayName: 'Child', roles: ['learner'] },
      ],
      usageRows: [
        { profileId: 'owner-1', used: 10, usedToday: 1 },
        { profileId: 'coparent-1', used: 5, usedToday: 2 },
        { profileId: 'child-1', used: 7, usedToday: 3 },
      ],
    });

    const result = await getUsageBreakdownForProfileV2(db, {
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

  it('hides the breakdown from child viewers even when owner sharing is enabled', async () => {
    sharingSpy.mockResolvedValue(true);
    chargeSpy.mockResolvedValue([]); // child is not a guardian
    guardianSpy.mockResolvedValue(['owner-1']); // child IS a charge

    const db = createV2Db({
      organizationId: 'org-1',
      viewer: { id: 'child-1', displayName: 'Child', roles: ['learner'] },
      orgMembers: [
        { id: 'owner-1', displayName: 'Owner', roles: ['admin'] },
        { id: 'child-1', displayName: 'Child', roles: ['learner'] },
      ],
      usageRows: [
        { profileId: 'owner-1', used: 10, usedToday: 1 },
        { profileId: 'child-1', used: 7, usedToday: 3 },
      ],
    });

    const result = await getUsageBreakdownForProfileV2(db, {
      subscriptionId: 'sub-1',
      activeProfileId: 'child-1',
      monthlyLimit: 100,
      cycleStartAt: '2026-05-01T00:00:00.000Z',
      dayStartAt: '2026-05-06T00:00:00.000Z',
    });

    // Children never see the full family breakdown, even with sharing on.
    expect(result.isOwnerBreakdownViewer).toBe(false);
    expect(result.byProfile).toHaveLength(0);
    expect(result.familyAggregate).toBeNull();
    // Self-scoped values reflect the child's own events only.
    expect(result.selfUsedToday).toBe(3);
    expect(result.selfUsedThisMonth).toBe(7);
  });

  it('keeps non-owner adult viewers scoped to their own row when sharing is disabled', async () => {
    sharingSpy.mockResolvedValue(false);
    chargeSpy.mockResolvedValue(['child-1']); // co-parent is a guardian
    guardianSpy.mockResolvedValue([]);

    const db = createV2Db({
      organizationId: 'org-1',
      viewer: {
        id: 'coparent-1',
        displayName: 'Co-parent',
        roles: ['learner'],
      },
      orgMembers: [
        { id: 'owner-1', displayName: 'Owner', roles: ['admin'] },
        { id: 'coparent-1', displayName: 'Co-parent', roles: ['learner'] },
        { id: 'child-1', displayName: 'Child', roles: ['learner'] },
      ],
      usageRows: [
        { profileId: 'owner-1', used: 10, usedToday: 1 },
        { profileId: 'coparent-1', used: 5, usedToday: 2 },
        { profileId: 'child-1', used: 7, usedToday: 3 },
      ],
    });

    const result = await getUsageBreakdownForProfileV2(db, {
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

  it('returns the empty breakdown when the subscription is missing', async () => {
    const db = createV2Db({
      organizationId: null,
      viewer: null,
      orgMembers: [],
      usageRows: [],
    });

    const result = await getUsageBreakdownForProfileV2(db, {
      subscriptionId: 'missing-sub',
      activeProfileId: 'owner-1',
      monthlyLimit: 100,
      cycleStartAt: '2026-05-01T00:00:00.000Z',
      dayStartAt: '2026-05-06T00:00:00.000Z',
    });

    expect(result).toEqual({
      byProfile: [],
      familyAggregate: null,
      isOwnerBreakdownViewer: false,
      selfUsedToday: null,
      selfUsedThisMonth: null,
    });
  });

  it('returns the empty breakdown when the viewer is not a member of the org', async () => {
    const db = createV2Db({
      organizationId: 'org-1',
      viewer: null, // viewer person+membership lookup returns no row
      orgMembers: [],
      usageRows: [],
    });

    const result = await getUsageBreakdownForProfileV2(db, {
      subscriptionId: 'sub-1',
      activeProfileId: 'stranger-1',
      monthlyLimit: 100,
      cycleStartAt: '2026-05-01T00:00:00.000Z',
      dayStartAt: '2026-05-06T00:00:00.000Z',
    });

    expect(result).toEqual({
      byProfile: [],
      familyAggregate: null,
      isOwnerBreakdownViewer: false,
      selfUsedToday: null,
      selfUsedThisMonth: null,
    });
  });
});
