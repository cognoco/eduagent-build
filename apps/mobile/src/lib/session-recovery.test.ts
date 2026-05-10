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

  it('rejects unscoped legacy markers and clears the legacy key', async () => {
    // Shared-device protection: an unscoped legacy marker (no profileId
    // field) could belong to any prior profile, so it must NOT be claimed
    // by the currently active profile. The unscoped key is also deleted so
    // the rejection path only fires once per device.
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'session-recovery-marker-profile-2') return null;
      if (key === 'session-recovery-marker') {
        return JSON.stringify({
          sessionId: 'session-from-another-profile',
          updatedAt: new Date().toISOString(),
        });
      }
      return null;
    });

    await expect(readSessionRecoveryMarker('profile-2')).resolves.toBeNull();
    expect(mockSet).not.toHaveBeenCalled();
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
