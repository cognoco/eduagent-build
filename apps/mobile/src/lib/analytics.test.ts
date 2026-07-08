import { readFileSync } from 'fs';
import { resolve } from 'path';

import { Sentry } from './sentry';
import {
  hashProfileId,
  track,
  trackHomeworkOcrGateAccepted,
  __TEST_ONLY__,
} from './analytics';

const ANALYTICS_SOURCE_PATH = resolve(__dirname, 'analytics.ts');
// Root-relative CI workflow — used for the build-injection guard below.
const CI_YML_PATH = resolve(__dirname, '../../../../.github/workflows/ci.yml');

function createHashClient(options?: {
  hash?: string;
  reject?: boolean;
  rejectError?: Error;
}): {
  analytics: {
    'hash-profile-id': {
      $post: jest.Mock;
    };
  };
} {
  return {
    analytics: {
      'hash-profile-id': {
        $post: jest.fn(async () => {
          if (options?.reject) {
            throw options.rejectError ?? new Error('network down');
          }
          return new Response(
            JSON.stringify({
              hash: options?.hash ?? 'v3_server_hash_for_profile',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }),
      },
    },
  };
}

describe('analytics telemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records analytics events as breadcrumbs, not standalone Sentry issues', () => {
    track('subscription_breakdown_viewed', {
      breakdown_section_visible: true,
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics',
      level: 'info',
      message: 'subscription_breakdown_viewed',
      data: {
        event: 'subscription_breakdown_viewed',
        breakdown_section_visible: true,
      },
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('records OCR gate telemetry as breadcrumbs', () => {
    trackHomeworkOcrGateAccepted({
      source: 'local',
      tokens: 12,
      words: 6,
      confidence: 0.87654,
    });

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics.homework_ocr_gate',
      level: 'info',
      message: 'homework_ocr_gate_accepted',
      data: {
        source: 'local',
        tokens: 12,
        words: 6,
        confidence: 0.877,
      },
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe('hashProfileId — server-side hashing [WI-1046]', () => {
  afterEach(() => {
    __TEST_ONLY__.resetUnkeyedWarning();
  });

  it('[BREAK] analytics.ts does not read the old public HMAC key from the client bundle', () => {
    const source = readFileSync(ANALYTICS_SOURCE_PATH, 'utf8');
    expect(source).not.toContain('EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1');
  });

  it('[BREAK] ci.yml OTA publish step does not inject the HMAC key into the client bundle (WI-1046 review-gap guard)', () => {
    // EXPO_PUBLIC_* vars are inlined into the JS bundle at OTA build time.
    // The pattern checked below is the YAML env-var assignment form:
    //   EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1: <value>
    // Hashing is now server-side (ANALYTICS_HASH_KEY in Workers/Doppler, PR #1491).
    // Any re-introduction of this injection re-embeds the secret in the OTA bundle.
    const ciYml = readFileSync(CI_YML_PATH, 'utf8');
    // Match the assignment form (key followed by a colon) — this catches any
    // env-block injection without false-positiving on explanatory comments that
    // use the key name as prose (which never have a colon directly after the name).
    expect(ciYml).not.toMatch(/EXPO_PUBLIC_ANALYTICS_HASH_KEY_V1\s*:/);
  });

  it('[BREAK] requests the hash from the server using the selected profile scope header', async () => {
    const client = createHashClient({
      hash: 'v3_11111111111111111111111111111111',
    });

    await expect(hashProfileId('profile-abc', client)).resolves.toBe(
      'v3_11111111111111111111111111111111',
    );

    expect(client.analytics['hash-profile-id'].$post).toHaveBeenCalledWith(
      { json: { profileId: 'profile-abc' } },
      { headers: { 'X-Profile-Id': 'profile-abc' } },
    );
  });

  it('[BREAK] caches a successful server hash for the current app session', async () => {
    const client = createHashClient({
      hash: 'v3_22222222222222222222222222222222',
    });

    await expect(hashProfileId('profile-cache', client)).resolves.toBe(
      'v3_22222222222222222222222222222222',
    );
    await expect(hashProfileId('profile-cache', client)).resolves.toBe(
      'v3_22222222222222222222222222222222',
    );

    expect(client.analytics['hash-profile-id'].$post).toHaveBeenCalledTimes(1);
  });

  it('returns the invalid-empty sentinel when profileId is empty (no sha256-of-empty collision bucket)', () => {
    const client = createHashClient();
    return expect(hashProfileId('', client)).resolves.toBe('v3_invalid_empty');
  });

  it('does not call the hash endpoint when profileId is empty', async () => {
    const client = createHashClient();
    await hashProfileId('', client);
    expect(client.analytics['hash-profile-id'].$post).not.toHaveBeenCalled();
  });

  it('[BREAK] returns a non-identifying sentinel when the hash request fails', async () => {
    const client = createHashClient({ reject: true });
    jest.clearAllMocks();

    await expect(hashProfileId('profile-failure', client)).resolves.toBe(
      'v3_unavailable',
    );

    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'analytics.config',
      level: 'warning',
      message: 'analytics.hashProfileId: server hash unavailable',
    });
    const serializedBreadcrumbs = JSON.stringify(
      (Sentry.addBreadcrumb as jest.Mock).mock.calls,
    );
    expect(serializedBreadcrumbs).not.toContain('profile-failure');
  });

  it('calls captureException when hash endpoint fails', async () => {
    __TEST_ONLY__.resetUnkeyedWarning();
    const hashError = new Error('network down');
    const client = createHashClient({ reject: true, rejectError: hashError });
    jest.clearAllMocks();

    await expect(hashProfileId('profile-failure', client)).resolves.toBe(
      'v3_unavailable',
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(hashError);
  });
});
