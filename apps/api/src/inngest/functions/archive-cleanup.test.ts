const mockInngestSend = jest.fn().mockResolvedValue(undefined);

jest.mock('../client', () => {
  // gc1-allow: keeps the real Inngest function wrapper while stubbing dispatch side effects
  const realInngest = jest.requireActual('inngest').Inngest;
  const realInstance = new realInngest({ id: 'eduagent-test' });
  return {
    inngest: {
      createFunction: realInstance.createFunction.bind(realInstance),
      send: (...args: unknown[]) => mockInngestSend(...args),
    },
  };
});

const mockGetConsentStatus = jest.fn();
const mockGetProfileForConsentRevocation = jest.fn();
jest.mock('../../services/consent', () => ({
  // gc1-allow: isolates archive cleanup guards from consent service DB access
  getConsentStatus: (...args: unknown[]) => mockGetConsentStatus(...args),
  getProfileForConsentRevocation: (...args: unknown[]) =>
    mockGetProfileForConsentRevocation(...args),
}));

const mockDeleteProfile = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/deletion', () => ({
  // gc1-allow: prevents destructive profile deletion while asserting the handler boundary
  deleteProfile: (...args: unknown[]) => mockDeleteProfile(...args),
}));

import { archiveCleanup } from './archive-cleanup';

interface MockStep {
  run: jest.Mock;
  sleep: jest.Mock;
}

async function executeArchiveCleanup(profileId = 'profile-001'): Promise<{
  result: unknown;
  mockStep: MockStep;
}> {
  const mockStep: MockStep = {
    run: jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sleep: jest.fn().mockResolvedValue(undefined),
  };

  const handler = (archiveCleanup as { fn: (ctx: unknown) => Promise<unknown> })
    .fn;
  const result = await handler({
    event: { data: { profileId }, name: 'app/profile.archived' },
    step: mockStep,
  });

  return { result, mockStep };
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
    const { mockStep } = await executeArchiveCleanup();

    expect(mockStep.sleep).toHaveBeenCalledWith('archive-window', '30d');
  });

  it('hard-deletes after consent remains withdrawn and 30 days elapsed', async () => {
    await executeArchiveCleanup('profile-delete');

    expect(mockDeleteProfile).toHaveBeenCalledWith(
      expect.anything(),
      'profile-delete'
    );
  });

  it('does not delete when consent was restored', async () => {
    mockGetConsentStatus.mockResolvedValue('CONSENTED');

    await executeArchiveCleanup('profile-restored');

    expect(mockDeleteProfile).not.toHaveBeenCalled();
  });

  it('does not delete when archivedAt was cleared', async () => {
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
      archivedAt: null,
    });

    await executeArchiveCleanup('profile-active');

    expect(mockDeleteProfile).not.toHaveBeenCalled();
  });

  it('does not delete when archivedAt is younger than 30 days', async () => {
    mockGetProfileForConsentRevocation.mockResolvedValue({
      displayName: 'Liam',
      birthYear: 2012,
      archivedAt: new Date('2026-04-20T12:00:00.000Z'),
    });

    await executeArchiveCleanup('profile-too-new');

    expect(mockDeleteProfile).not.toHaveBeenCalled();
  });
});
