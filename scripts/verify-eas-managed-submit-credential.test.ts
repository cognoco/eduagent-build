import {
  ANDROID_APPLICATION_IDENTIFIER,
  PROJECT_FULL_NAME,
  verifyEasManagedSubmitCredential,
} from './verify-eas-managed-submit-credential';

const assignedPayload = {
  data: {
    app: {
      byFullName: {
        androidAppCredentials: [
          { googleServiceAccountKeyForSubmissions: { id: 'metadata-only' } },
        ],
      },
    },
  },
};

const response = (payload: unknown, ok = true) => ({
  ok,
  json: async () => payload,
});

describe('EAS-managed Google Play submission credential preflight', () => {
  it('returns only safe assignment metadata when the app has an assigned key', async () => {
    const fetchImpl = jest.fn(async () => response(assignedPayload));

    await expect(
      verifyEasManagedSubmitCredential({
        accessToken: 'test-token',
        fetchImpl,
      }),
    ).resolves.toEqual({
      projectFullName: PROJECT_FULL_NAME,
      applicationIdentifier: ANDROID_APPLICATION_IDENTIFIER,
      submissionCredentialAssigned: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.expo.dev/graphql',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fails closed when the managed key is absent or unassigned', async () => {
    for (const payload of [
      { data: { app: { byFullName: { androidAppCredentials: [] } } } },
      {
        data: {
          app: {
            byFullName: {
              androidAppCredentials: [
                { googleServiceAccountKeyForSubmissions: null },
              ],
            },
          },
        },
      },
    ]) {
      await expect(
        verifyEasManagedSubmitCredential({
          accessToken: 'test-token',
          fetchImpl: async () => response(payload),
        }),
      ).rejects.toThrow('No EAS-managed Google Play submission credential');
    }
  });

  it('fails closed before upload when auth or Expo metadata is unavailable', async () => {
    await expect(
      verifyEasManagedSubmitCredential({ accessToken: '' }),
    ).rejects.toThrow('EXPO_TOKEN is required');
    await expect(
      verifyEasManagedSubmitCredential({
        accessToken: 'test-token',
        fetchImpl: async () => response({}, false),
      }),
    ).rejects.toThrow('rejected by Expo');
  });
});
