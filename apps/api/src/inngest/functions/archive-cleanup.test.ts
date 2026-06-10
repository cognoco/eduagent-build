const { createInngestTransportCapture } =
  require('../../test-utils/inngest-transport-capture') as typeof import('../../test-utils/inngest-transport-capture');

const mockInngestTransport = createInngestTransportCapture();

jest.mock('../client' /* gc1-allow: pattern-a conversion */, () => {
  const actual = jest.requireActual('../client') as typeof import('../client');
  return {
    ...actual,
    ...mockInngestTransport.module,
  };
});

const mockGetConsentStatus = jest.fn();
const mockGetProfileForConsentRevocation = jest.fn();
jest.mock(
  '../../services/consent' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/consent',
    ) as typeof import('../../services/consent');
    return {
      ...actual,
      getConsentStatus: (...args: unknown[]) => mockGetConsentStatus(...args),
      getProfileForConsentRevocation: (...args: unknown[]) =>
        mockGetProfileForConsentRevocation(...args),
    };
  },
);

// [F-122] archive-cleanup now performs an ATOMIC conditional delete via
// deleteArchivedProfileIfStillEligible (eligibility folded into the DELETE's
// WHERE) instead of the unconditional deleteProfile. Mock the atomic helper.
const mockDeleteArchivedProfileIfStillEligible = jest
  .fn()
  .mockResolvedValue(true);
jest.mock(
  '../../services/deletion' /* gc1-allow: pattern-a conversion */,
  () => {
    const actual = jest.requireActual(
      '../../services/deletion',
    ) as typeof import('../../services/deletion');
    return {
      ...actual,
      deleteArchivedProfileIfStillEligible: (...args: unknown[]) =>
        mockDeleteArchivedProfileIfStillEligible(...args),
    };
  },
);

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
  mockGetConsentStatus.mockResolvedValue('WITHDRAWN');
  mockGetProfileForConsentRevocation.mockResolvedValue({
    displayName: 'Liam',
    birthYear: 2012,
    archivedAt: new Date('2026-04-01T12:00:00.000Z'),
  });
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env['DATABASE_URL'];
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

    // [F-122] The terminal delete is the atomic helper, called with the
    // profileId and a retention-cutoff Date.
    expect(mockDeleteArchivedProfileIfStillEligible).toHaveBeenCalledWith(
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
