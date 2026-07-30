import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyEasManagedSubmitCredential } from './verify-eas-managed-submit-credential';

const appConfig = JSON.parse(
  readFileSync(join(process.cwd(), 'apps/mobile/app.json'), 'utf8'),
).expo;
const expectedProjectFullName = `@${appConfig.owner}/${appConfig.slug}`;
const expectedApplicationIdentifier = appConfig.android.package;

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
  it('uses the canonical app identity and returns no account identifier', async () => {
    const fetchImpl = jest.fn(async () => response(assignedPayload));

    await expect(
      verifyEasManagedSubmitCredential({
        accessToken: 'test-token',
        fetchImpl,
      }),
    ).resolves.toEqual({
      applicationIdentifier: expectedApplicationIdentifier,
      submissionCredentialAssigned: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.expo.dev/graphql',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = fetchImpl.mock.calls[0][1];
    expect(JSON.parse(request.body).variables).toEqual({
      projectFullName: expectedProjectFullName,
      applicationIdentifier: expectedApplicationIdentifier,
    });
  });

  it('fails closed when the managed key is absent, unassigned, or malformed', async () => {
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
      {
        data: {
          app: {
            byFullName: {
              androidAppCredentials: [
                { googleServiceAccountKeyForSubmissions: {} },
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

  it('fails closed before the network request when a stale local credential exists', async () => {
    const fetchImpl = jest.fn();

    await expect(
      verifyEasManagedSubmitCredential({
        accessToken: 'test-token',
        fetchImpl,
        legacyCredentialExists: () => true,
      }),
    ).rejects.toThrow('Remove the stale local credential file');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
