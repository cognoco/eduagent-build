const { createInngestTransportCapture } =
  require('../../test-utils/inngest-transport-capture') as typeof import('../../test-utils/inngest-transport-capture');

const mockInngestTransport = createInngestTransportCapture();
const mockSafeSend = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../services/safe-non-core' /* gc1-allow: external Inngest dispatch boundary */,
  () => {
    const actual = jest.requireActual(
      '../../services/safe-non-core',
    ) as typeof import('../../services/safe-non-core');
    return {
      ...actual,
      safeSend: (...args: unknown[]) => mockSafeSend(...args),
    };
  },
);

jest.mock('../client', () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
    ...mockInngestTransport.module,
  };
});

const mockGetConsentStatus = jest.fn();
const mockGetProfileForConsentRevocation = jest.fn();
jest.mock('../../services/consent', () => {
  const actual = jest.requireActual(
    '../../services/consent',
  ) as typeof import('../../services/consent');
  return {
    ...actual,
    getConsentStatus: (...args: unknown[]) => mockGetConsentStatus(...args),
    getProfileForConsentRevocation: (...args: unknown[]) =>
      mockGetProfileForConsentRevocation(...args),
  };
});

// [CUT-B2] v2 consent service mocks
const mockResolveOrgIdForPerson = jest.fn();
jest.mock('../../services/identity-v2/family-v2', () => {
  const actual = jest.requireActual(
    '../../services/identity-v2/family-v2',
  ) as typeof import('../../services/identity-v2/family-v2');
  return {
    ...actual,
    resolveOrgIdForPerson: (...args: unknown[]) =>
      mockResolveOrgIdForPerson(...args),
  };
});

const mockResolveLatestConsentSetStatusAnyBasis = jest.fn();
jest.mock('../../services/identity-v2/consent-status-v2', () => {
  const actual = jest.requireActual(
    '../../services/identity-v2/consent-status-v2',
  ) as typeof import('../../services/identity-v2/consent-status-v2');
  return {
    ...actual,
    resolveLatestConsentSetStatusAnyBasis: (...args: unknown[]) =>
      mockResolveLatestConsentSetStatusAnyBasis(...args),
  };
});

const mockGetPersonForConsentRevocationV2 = jest.fn();
const mockDeleteArchivedPersonIfStillEligibleV2 = jest
  .fn()
  .mockResolvedValue(true);
const mockGetPersonClerkUserIdsV2 = jest.fn().mockResolvedValue([]);
const mockGetPersonErasureSnapshotV2 = jest.fn();
const mockAttemptArchivedPersonErasureV2 = jest.fn();
const mockDeleteClerkUser = jest.fn().mockResolvedValue({ deleted: true });
const mockEnsurePendingClerkErasures = jest.fn().mockResolvedValue(true);
const mockMarkPendingClerkErasuresComplete = jest
  .fn()
  .mockResolvedValue(undefined);
jest.mock('../../services/identity-v2/consent-v2', () => {
  const actual = jest.requireActual(
    '../../services/identity-v2/consent-v2',
  ) as typeof import('../../services/identity-v2/consent-v2');
  return {
    ...actual,
    getPersonForConsentRevocationV2: (...args: unknown[]) =>
      mockGetPersonForConsentRevocationV2(...args),
  };
});

// Internal-service exception: this suite pins the durable Inngest step ABI and
// external-cleanup recovery. The real erasure functions require transactional
// graph reads and advisory locks, which this unit harness cannot provide and
// which deletion-v2 integration tests cover. requireActual preserves every
// untouched export; only the step effects/results are controlled here.
jest.mock('../../services/identity-v2/deletion-v2', () => {
  const actual = jest.requireActual(
    '../../services/identity-v2/deletion-v2',
  ) as typeof import('../../services/identity-v2/deletion-v2');
  return {
    ...actual,
    deleteArchivedPersonIfStillEligibleV2: (...args: unknown[]) =>
      mockDeleteArchivedPersonIfStillEligibleV2(...args),
    getPersonClerkUserIdsV2: (...args: unknown[]) =>
      mockGetPersonClerkUserIdsV2(...args),
    getPersonErasureSnapshotV2: (...args: unknown[]) =>
      mockGetPersonErasureSnapshotV2(...args),
    attemptArchivedPersonErasureV2: (...args: unknown[]) =>
      mockAttemptArchivedPersonErasureV2(...args),
    ensurePendingClerkErasures: (...args: unknown[]) =>
      mockEnsurePendingClerkErasures(...args),
    markPendingClerkErasuresComplete: (...args: unknown[]) =>
      mockMarkPendingClerkErasuresComplete(...args),
  };
});

// Clerk deletion is a live external API boundary; keep the real module shape
// while replacing only the outbound delete call.
jest.mock(
  '../../services/clerk-user' /* gc1-allow: external Clerk HTTP boundary */,
  () => {
    const actual = jest.requireActual(
      '../../services/clerk-user',
    ) as typeof import('../../services/clerk-user');
    return {
      ...actual,
      deleteClerkUser: (...args: unknown[]) => mockDeleteClerkUser(...args),
    };
  },
);

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import * as sentry from '../../services/sentry';
import { archiveCleanup } from './archive-cleanup';

async function executeArchiveCleanup(profileId = 'profile-001'): Promise<{
  result: unknown;
  runCalls: ReturnType<typeof createInngestStepRunner>['runCalls'];
  sleepCalls: ReturnType<typeof createInngestStepRunner>['sleepCalls'];
  sendEventCalls: ReturnType<typeof createInngestStepRunner>['sendEventCalls'];
}> {
  const { step, runCalls, sleepCalls, sendEventCalls } =
    createInngestStepRunner();

  const handler = (
    archiveCleanup as unknown as { fn: (ctx: unknown) => Promise<unknown> }
  ).fn;
  const result = await handler({
    event: { data: { profileId }, name: 'app/profile.archived' },
    step,
  });

  return { result, runCalls, sleepCalls, sendEventCalls };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-05-06T12:00:00.000Z'));
  jest.clearAllMocks();
  process.env['DATABASE_URL'] = 'postgresql://test:test@localhost/test';
  delete process.env['IDENTITY_V2_ENABLED'];

  // Legacy path defaults
  mockGetConsentStatus.mockResolvedValue('WITHDRAWN');
  mockGetProfileForConsentRevocation.mockResolvedValue({
    displayName: 'Liam',
    birthYear: 2012,
    archivedAt: new Date('2026-04-01T12:00:00.000Z'),
  });

  // V2 path defaults
  mockResolveOrgIdForPerson.mockResolvedValue('org-001');
  mockResolveLatestConsentSetStatusAnyBasis.mockResolvedValue('WITHDRAWN');
  mockGetPersonForConsentRevocationV2.mockResolvedValue({
    displayName: 'Liam',
    birthYear: 2012,
    archivedAt: new Date('2026-04-01T12:00:00.000Z'),
  });
  mockDeleteArchivedPersonIfStillEligibleV2.mockResolvedValue(true);
  mockGetPersonClerkUserIdsV2.mockResolvedValue([]);
  mockGetPersonErasureSnapshotV2.mockResolvedValue({
    personExists: true,
    personId: 'profile-001',
    organizationId: 'org-001',
    clerkUserIds: [],
    loginEmails: [],
    organizationPersonIds: ['profile-001'],
    subscriptionStoreTeardownTargets: [],
  });
  mockAttemptArchivedPersonErasureV2.mockResolvedValue({
    status: 'deleted',
    clerkUserIds: [],
    organizationId: 'org-001',
    organizationDeleted: true,
    subscriptionStoreTeardownTargets: [],
  });
  mockDeleteClerkUser.mockResolvedValue({ deleted: true });
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env['DATABASE_URL'];
  delete process.env['IDENTITY_V2_ENABLED'];
});

describe('archiveCleanup', () => {
  it('sleeps for the archive window before checking deletion guards', async () => {
    const { sleepCalls } = await executeArchiveCleanup();

    expect(sleepCalls).toContainEqual({
      name: 'archive-window',
      duration: '30d',
    });
  });

  it('hard-deletes (atomically) after consent remains withdrawn and 30 days elapsed', async () => {
    await executeArchiveCleanup('profile-delete');

    // [WI-867] v2-only: source collapsed to always call deleteArchivedPersonIfStillEligibleV2
    // (v1 deleteArchivedProfileIfStillEligible is no longer reached). Same atomic
    // conditional-delete semantic; profile-scoped → person-scoped.
    expect(mockAttemptArchivedPersonErasureV2).toHaveBeenCalledWith(
      expect.anything(),
      'profile-delete',
      expect.objectContaining({ personExists: true }),
      expect.any(Date),
    );
  });

  it('deletes every captured Clerk identity only after the DB erasure succeeds', async () => {
    mockAttemptArchivedPersonErasureV2.mockResolvedValue({
      status: 'deleted',
      clerkUserIds: ['clerk-archived-person-a', 'clerk-archived-person-b'],
      organizationId: 'org-001',
      organizationDeleted: true,
      subscriptionStoreTeardownTargets: [],
    });

    const { runCalls } = await executeArchiveCleanup('profile-credentialed');

    expect(mockDeleteClerkUser).toHaveBeenCalledTimes(2);
    expect(mockDeleteClerkUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'clerk-archived-person-a' }),
    );
    expect(mockDeleteClerkUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'clerk-archived-person-b' }),
    );
    expect(runCalls.map((call) => call.name)).toEqual(
      expect.arrayContaining([
        'archive-person-erasure-capture-1',
        'archive-person-erasure-database-1',
        'archive-person-erasure-clerk-users',
      ]),
    );
    expect(
      runCalls.findIndex(
        (call) => call.name === 'archive-person-erasure-database-1',
      ),
    ).toBeLessThan(
      runCalls.findIndex(
        (call) => call.name === 'archive-person-erasure-clerk-users',
      ),
    );
  });

  it('refreshes a changed external snapshot once before deleting', async () => {
    mockAttemptArchivedPersonErasureV2
      .mockResolvedValueOnce({
        status: 'snapshot_changed',
        clerkUserIds: [],
        organizationId: null,
        organizationDeleted: false,
        subscriptionStoreTeardownTargets: [],
      })
      .mockResolvedValueOnce({
        status: 'deleted',
        clerkUserIds: [],
        organizationId: 'org-001',
        organizationDeleted: true,
        subscriptionStoreTeardownTargets: [],
      });

    const { runCalls } = await executeArchiveCleanup('profile-raced');

    expect(mockGetPersonErasureSnapshotV2).toHaveBeenCalledTimes(2);
    expect(runCalls.map((call) => call.name)).toEqual(
      expect.arrayContaining([
        'archive-person-erasure-capture-1',
        'archive-person-erasure-database-1',
        'archive-person-erasure-capture-2',
        'archive-person-erasure-database-2',
      ]),
    );
  });

  it('fails non-retriably after two changed snapshots', async () => {
    mockAttemptArchivedPersonErasureV2.mockResolvedValue({
      status: 'snapshot_changed',
      clerkUserIds: [],
      organizationId: null,
      organizationDeleted: false,
      subscriptionStoreTeardownTargets: [],
    });

    await expect(
      executeArchiveCleanup('profile-churning'),
    ).rejects.toMatchObject({ name: 'NonRetriableError' });
    expect(mockGetPersonErasureSnapshotV2).toHaveBeenCalledTimes(2);
    expect(mockAttemptArchivedPersonErasureV2).toHaveBeenCalledTimes(2);
  });

  it('dispatches existing store teardown after an org-of-one erasure', async () => {
    mockAttemptArchivedPersonErasureV2.mockResolvedValue({
      status: 'deleted',
      clerkUserIds: [],
      organizationId: 'org-erased',
      organizationDeleted: true,
      subscriptionStoreTeardownTargets: [
        {
          subscriptionId: 'subscription-1',
          planTier: 'plus',
          status: 'active',
          stripe: { customerId: 'customer-1', subscriptionId: 'stripe-sub-1' },
          revenueCat: {
            originalAppUserId: null,
            storeProductId: null,
            storePlatform: null,
          },
        },
      ],
    });

    const { sendEventCalls } = await executeArchiveCleanup('profile-billed');

    expect(sendEventCalls).toContainEqual(
      expect.objectContaining({
        name: 'archive-person-erasure-subscription-store-teardown',
        payload: expect.objectContaining({
          name: 'app/billing.subscription_store_teardown_requested',
        }),
      }),
    );
  });

  it('emits a structured operator signal when erasure requires admin transfer', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureMessage')
      .mockImplementation(() => undefined);
    mockAttemptArchivedPersonErasureV2.mockResolvedValue({
      status: 'admin_transfer_required',
      clerkUserIds: [],
      organizationId: 'org-001',
      organizationDeleted: false,
      subscriptionStoreTeardownTargets: [],
    });

    await expect(executeArchiveCleanup('profile-admin')).resolves.toMatchObject(
      {
        result: {
          status: 'reroute_required',
          reason: 'admin_transfer_required',
          profileId: 'profile-admin',
        },
      },
    );
    expect(captureSpy).toHaveBeenCalledWith(
      'archive-cleanup: erasure blocked on admin transfer',
      {
        level: 'error',
        extra: {
          surface: 'archive-cleanup.admin_transfer_required',
          reason: 'admin_transfer_required',
          profileId: 'profile-admin',
        },
      },
    );
  });

  it('declares and emits a sanitized terminal erasure signal', async () => {
    const captureSpy = jest
      .spyOn(sentry, 'captureMessage')
      .mockImplementation(() => undefined);
    const onFailure = (archiveCleanup as any).opts.onFailure as (args: {
      event: { data: { event?: { data?: unknown }; run_id?: string } };
      error: unknown;
    }) => Promise<void>;

    expect(typeof onFailure).toBe('function');
    await onFailure({
      event: {
        data: {
          event: { data: { profileId: 'profile-terminal' } },
          run_id: 'run-terminal',
        },
      },
      error: new Error('provider detail must not be forwarded'),
    });

    expect(captureSpy).toHaveBeenCalledWith(
      'archive-cleanup: all retries exhausted during person erasure',
      expect.objectContaining({
        extra: expect.objectContaining({
          surface: 'archive-cleanup.terminal_failure',
          profileId: 'profile-terminal',
          errorClass: 'error',
        }),
      }),
    );
  });
});
