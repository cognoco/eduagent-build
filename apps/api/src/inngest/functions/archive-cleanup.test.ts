const { createInngestTransportCapture } =
  require('../../test-utils/inngest-transport-capture') as typeof import('../../test-utils/inngest-transport-capture');

const mockInngestTransport = createInngestTransportCapture();

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

// [F-122] archive-cleanup now performs an ATOMIC conditional delete via
// deleteArchivedProfileIfStillEligible (eligibility folded into the DELETE's
// WHERE) instead of the unconditional deleteProfile. Mock the atomic helper.
const mockDeleteArchivedProfileIfStillEligible = jest
  .fn()
  .mockResolvedValue(true);
jest.mock('../../services/deletion', () => {
  const actual = jest.requireActual(
    '../../services/deletion',
  ) as typeof import('../../services/deletion');
  return {
    ...actual,
    deleteArchivedProfileIfStillEligible: (...args: unknown[]) =>
      mockDeleteArchivedProfileIfStillEligible(...args),
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

const mockResolveLatestConsentStatusAnyBasis = jest.fn();
jest.mock('../../services/identity-v2/consent-status-v2', () => {
  const actual = jest.requireActual(
    '../../services/identity-v2/consent-status-v2',
  ) as typeof import('../../services/identity-v2/consent-status-v2');
  return {
    ...actual,
    resolveLatestConsentStatusAnyBasis: (...args: unknown[]) =>
      mockResolveLatestConsentStatusAnyBasis(...args),
  };
});

const mockGetPersonForConsentRevocationV2 = jest.fn();
const mockDeleteArchivedPersonIfStillEligibleV2 = jest
  .fn()
  .mockResolvedValue(true);
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

jest.mock('../../services/identity-v2/deletion-v2', () => {
  const actual = jest.requireActual(
    '../../services/identity-v2/deletion-v2',
  ) as typeof import('../../services/identity-v2/deletion-v2');
  return {
    ...actual,
    deleteArchivedPersonIfStillEligibleV2: (...args: unknown[]) =>
      mockDeleteArchivedPersonIfStillEligibleV2(...args),
  };
});

import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import { archiveCleanup } from './archive-cleanup';

async function executeArchiveCleanup(profileId = 'profile-001'): Promise<{
  result: unknown;
  runCalls: ReturnType<typeof createInngestStepRunner>['runCalls'];
  sleepCalls: ReturnType<typeof createInngestStepRunner>['sleepCalls'];
}> {
  const { step, runCalls, sleepCalls } = createInngestStepRunner();

  const handler = (
    archiveCleanup as unknown as { fn: (ctx: unknown) => Promise<unknown> }
  ).fn;
  const result = await handler({
    event: { data: { profileId }, name: 'app/profile.archived' },
    step,
  });

  return { result, runCalls, sleepCalls };
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
  mockResolveLatestConsentStatusAnyBasis.mockResolvedValue('WITHDRAWN');
  mockGetPersonForConsentRevocationV2.mockResolvedValue({
    displayName: 'Liam',
    birthYear: 2012,
    archivedAt: new Date('2026-04-01T12:00:00.000Z'),
  });
  mockDeleteArchivedPersonIfStillEligibleV2.mockResolvedValue(true);
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
    expect(mockDeleteArchivedPersonIfStillEligibleV2).toHaveBeenCalledWith(
      expect.anything(),
      'profile-delete',
      expect.any(Date),
    );
  });

  it('does not delete when consent was restored', async () => {
    mockGetConsentStatus.mockResolvedValue('CONSENTED');

    await executeArchiveCleanup('profile-restored');

    expect(mockDeleteArchivedProfileIfStillEligible).not.toHaveBeenCalled();
  });

  it('does not delete when archivedAt was cleared', async () => {
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
      archivedAt: null,
    });

    await executeArchiveCleanup('profile-active');

    expect(mockDeleteArchivedProfileIfStillEligible).not.toHaveBeenCalled();
  });

  it('does not delete when archivedAt is younger than 30 days', async () => {
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
      archivedAt: new Date('2026-04-20T12:00:00.000Z'),
    });

    await executeArchiveCleanup('profile-too-new');

    expect(mockDeleteArchivedProfileIfStillEligible).not.toHaveBeenCalled();
  });
});

// [CUT-B2] v2 path tests — run with IDENTITY_V2_ENABLED=true
describe('archiveCleanup (v2 path)', () => {
  beforeEach(() => {
    process.env['IDENTITY_V2_ENABLED'] = 'true';
  });

  it('hard-deletes via v2 atomic helper after consent withdrawn and 30 days elapsed', async () => {
    await executeArchiveCleanup('person-delete-v2');

    expect(mockDeleteArchivedPersonIfStillEligibleV2).toHaveBeenCalledWith(
      expect.anything(),
      'person-delete-v2',
      expect.any(Date),
    );
    expect(mockDeleteArchivedProfileIfStillEligible).not.toHaveBeenCalled();
  });

  it('does not delete when v2 consent status is CONSENTED', async () => {
    mockResolveLatestConsentStatusAnyBasis.mockResolvedValue('CONSENTED');

    await executeArchiveCleanup('person-restored-v2');

    expect(mockDeleteArchivedPersonIfStillEligibleV2).not.toHaveBeenCalled();
  });

  it('does not delete when v2 person has no archivedAt', async () => {
    mockGetPersonForConsentRevocationV2.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
      archivedAt: null,
    });

    await executeArchiveCleanup('person-active-v2');

    expect(mockDeleteArchivedPersonIfStillEligibleV2).not.toHaveBeenCalled();
  });

  it('does not delete when v2 archivedAt is younger than 30 days', async () => {
    mockGetPersonForConsentRevocationV2.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
      archivedAt: new Date('2026-04-20T12:00:00.000Z'),
    });

    await executeArchiveCleanup('person-too-new-v2');

    expect(mockDeleteArchivedPersonIfStillEligibleV2).not.toHaveBeenCalled();
  });

  it('skips consent check when org graph is not yet provisioned (orgId null)', async () => {
    mockResolveOrgIdForPerson.mockResolvedValue(null);

    await executeArchiveCleanup('person-no-org-v2');

    // No consent lookup possible without an org; proceeds to person/delete checks.
    expect(mockResolveLatestConsentStatusAnyBasis).not.toHaveBeenCalled();
    expect(mockDeleteArchivedPersonIfStillEligibleV2).toHaveBeenCalledWith(
      expect.anything(),
      'person-no-org-v2',
      expect.any(Date),
    );
  });
});
