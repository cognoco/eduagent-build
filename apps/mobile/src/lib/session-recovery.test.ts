import * as SecureStore from './secure-storage';
import {
  readSessionRecoveryMarker,
  writeSessionRecoveryMarker,
} from './session-recovery';

jest.mock('./secure-storage' /* gc1-allow: unit test boundary */, () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  sanitizeSecureStoreKey: (raw: string) => raw.replace(/[^a-zA-Z0-9._-]/g, '_'),
}));

const mockGet = jest.mocked(SecureStore.getItemAsync);
const mockSet = jest.mocked(SecureStore.setItemAsync);
const mockDelete = jest.mocked(SecureStore.deleteItemAsync);

describe('session-recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue();
    mockDelete.mockResolvedValue();
  });

  it('writes recovery markers under the profile-scoped key', async () => {
    await writeSessionRecoveryMarker(
      {
        sessionId: 'session-1',
        profileId: 'profile-1',
        updatedAt: new Date().toISOString(),
      },
      'profile-1',
    );

    expect(mockSet).toHaveBeenCalledWith(
      'session-recovery-marker-profile-1',
      expect.stringContaining('"sessionId":"session-1"'),
    );
  });

  it('migrates legacy unscoped markers (no profileId field) to the scoped key', async () => {
    // A legacy marker stored without a profileId field — e.g. written before
    // profile-scoped keys were introduced. The code lets it through and
    // rewrites it under the scoped key so the fallback only fires once.
    const legacyMarker = {
      sessionId: 'session-from-legacy',
      updatedAt: new Date().toISOString(),
    };
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'session-recovery-marker-profile-2') return null;
      if (key === 'session-recovery-marker') {
        return JSON.stringify(legacyMarker);
      }
      return null;
    });

    const result = await readSessionRecoveryMarker('profile-2');
    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe('session-from-legacy');
    // Migration: rewritten under scoped key, legacy key deleted.
    expect(mockSet).toHaveBeenCalledWith(
      'session-recovery-marker-profile-2',
      expect.stringContaining('"sessionId":"session-from-legacy"'),
    );
    expect(mockDelete).toHaveBeenCalledWith('session-recovery-marker');
  });

  it('rejects a scoped marker belonging to a different profile', async () => {
    // A marker that explicitly carries a different profileId is rejected
    // (cross-profile contamination guard).
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'session-recovery-marker-profile-2') {
        return JSON.stringify({
          sessionId: 'session-from-profile-1',
          profileId: 'profile-1',
          updatedAt: new Date().toISOString(),
        });
      }
      return null;
    });

    await expect(readSessionRecoveryMarker('profile-2')).resolves.toBeNull();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
