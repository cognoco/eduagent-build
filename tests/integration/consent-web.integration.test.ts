/**
 * Integration: Public consent web pages
 *
 * Exercises the real consent web routes through the full app + real database.
 * Profile setup uses real JWT verification via the global fetch interceptor.
 */

import { eq } from 'drizzle-orm';
import { consentStates, profiles } from '@eduagent/database';

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  createProfileViaRoute,
  getIntegrationDb,
  seedConsentRequest,
} from './route-fixtures';

import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();
const CONSENT_WEB_USER = {
  userId: 'integration-consent-web-user',
  email: 'integration-consent-web@integration.test',
};

function postConfirm(body: Record<string, string>) {
  return app.request(
    '/v1/consent-page/confirm',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
    },
    TEST_ENV
  );
}

async function createProfileWithConsentToken(token: string) {
  const profile = await createProfileViaRoute({
    app,
    env: TEST_ENV,
    user: CONSENT_WEB_USER,
    displayName: 'Emma',
    birthYear: 2000,
  });

  await seedConsentRequest({
    profileId: profile.id,
    token,
  });

  return profile.id;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [CONSENT_WEB_USER.email],
    clerkUserIds: [CONSENT_WEB_USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [CONSENT_WEB_USER.email],
    clerkUserIds: [CONSENT_WEB_USER.userId],
  });
});

describe('Integration: GET /v1/consent-page', () => {
  it('returns 400 when token is missing', async () => {
    const res = await app.request('/v1/consent-page', {}, TEST_ENV);

    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Invalid link');
  });

  it('returns 404 when token is invalid', async () => {
    const res = await app.request(
      '/v1/consent-page?token=invalid-token',
      {},
      TEST_ENV
    );

    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('Link expired or invalid');
  });

  it('renders the consent page with the real child name and security headers', async () => {
    await createProfileWithConsentToken('valid-token');

    const res = await app.request(
      '/v1/consent-page?token=valid-token',
      {},
      TEST_ENV
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(res.headers.get('content-security-policy')).toContain(
      "script-src 'none'"
    );

    const html = await res.text();
    expect(html).toContain('Consent required for Emma');
    expect(html).toContain('Emma wants to use MentoMate');
    expect(html).toContain('/consent-page/deny-confirm?token=valid-token');
    expect(html).toContain('method="POST"');
    expect(html).toContain('value="true"');
    expect(html).not.toContain('onclick');
  });
});

describe('Integration: GET /v1/consent-page/deny-confirm', () => {
  it('returns 400 when token is missing', async () => {
    const res = await app.request(
      '/v1/consent-page/deny-confirm',
      {},
      TEST_ENV
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid link');
  });

  it('renders the confirm-deny page with the real child name', async () => {
    await createProfileWithConsentToken('deny-token');

    const res = await app.request(
      '/v1/consent-page/deny-confirm?token=deny-token',
      {},
      TEST_ENV
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Are you sure?');
    expect(html).toContain("Emma's account");
    expect(html).toContain('method="POST"');
    expect(html).toContain('action="/v1/consent-page/confirm"');
    expect(html).toContain('value="false"');
    expect(html).toContain('/consent-page?token=deny-token');
  });
});

describe('Integration: POST /v1/consent-page/confirm', () => {
  it('returns 400 when token is missing', async () => {
    const res = await postConfirm({ approved: 'true' });

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid link');
  });

  it('approves consent, keeps the profile, and updates the consent state', async () => {
    const profileId = await createProfileWithConsentToken('approve-token');

    const res = await postConfirm({
      token: 'approve-token',
      approved: 'true',
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Family account ready!');
    expect(html).toContain("Emma's account is now active");
    expect(html).toContain("See Emma's Progress");
    expect(html).toContain('mentomate://home');
    expect(html).toContain('mentomate://onboarding');

    const db = getIntegrationDb();
    const consent = await db.query.consentStates.findFirst({
      where: eq(consentStates.profileId, profileId),
    });
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
    });

    expect(consent?.status).toBe('CONSENTED');
    expect(consent?.respondedAt).not.toBeNull();
    expect(profile).not.toBeUndefined();
  });

  it('denies consent and deletes the profile via the real cascade', async () => {
    const profileId = await createProfileWithConsentToken('deny-confirm-token');

    const res = await postConfirm({
      token: 'deny-confirm-token',
      approved: 'false',
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Consent declined');
    expect(html).toContain("Emma's account will be removed");

    const db = getIntegrationDb();
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
    });
    const consent = await db.query.consentStates.findFirst({
      where: eq(consentStates.profileId, profileId),
    });

    expect(profile).toBeUndefined();
    expect(consent).toBeUndefined();
  });

  it('returns 404 when the consent token is invalid', async () => {
    const res = await postConfirm({
      token: 'missing-token',
      approved: 'true',
    });

    expect(res.status).toBe(404);
    expect(await res.text()).toContain('Link expired or invalid');
  });
});
