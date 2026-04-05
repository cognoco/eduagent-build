/**
 * Integration: Consent email delivery plumbing
 *
 * Validates that RESEND_API_KEY flows from the worker environment bindings
 * through the consent route → consent service → sendEmail → fetch.
 *
 * Background: A production issue occurred where the staging worker's
 * RESEND_API_KEY secret was stale (not synced from Doppler), causing
 * sendEmail() to bail early with { sent: false, reason: 'no_api_key' }.
 * The consent request returned emailStatus: 'failed' and users could
 * not complete the parental consent flow.
 *
 * Mocked: JWT, Inngest, Resend HTTP (intercepted via global.fetch spy)
 * Real:   Database, consent service, notification service plumbing
 */

import { consentStates } from '@eduagent/database';
import { eq, and } from 'drizzle-orm';
import { jwtMock, configureValidJWT, inngestClientMock } from './mocks';
import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';

// --- Mock boundaries ---
const jwt = jwtMock();
jest.mock('../../apps/api/src/middleware/jwt', () => jwt);
jest.mock('../../apps/api/src/inngest/client', () => inngestClientMock());

import { app } from '../../apps/api/src/index';

// --- Constants ---
const CONSENT_USER_ID = 'integration-consent-email';
const CONSENT_EMAIL = 'consent-email@integration.test';
const PARENT_EMAIL = 'parent@integration.test';
const CHILD_BIRTH_YEAR = 2015; // Age 11 in 2026 — requires GDPR consent
const FAKE_RESEND_KEY = 're_test_integration_consent';

// --- Fetch interceptor ---
const originalFetch = global.fetch;
let resendCalls: Array<{ url: string; init: RequestInit | undefined }> = [];

function interceptResendFetch(): void {
  resendCalls = [];
  global.fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : (input as Request).url;

      if (url.includes('api.resend.com')) {
        resendCalls.push({ url, init });
        return new Response(JSON.stringify({ id: 'test-msg-id' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Pass through for database and other calls
      return originalFetch(input, init);
    }
  ) as typeof global.fetch;
}

// --- Helpers ---
function authHeaders(profileId?: string): HeadersInit {
  return {
    Authorization: 'Bearer valid.jwt.token',
    'Content-Type': 'application/json',
    ...(profileId ? { 'X-Profile-Id': profileId } : {}),
  };
}

async function createChildProfile(): Promise<string> {
  configureValidJWT(jwt, { sub: CONSENT_USER_ID, email: CONSENT_EMAIL });

  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        displayName: 'Consent Test Child',
        birthYear: CHILD_BIRTH_YEAR,
      }),
    },
    buildIntegrationEnv()
  );

  expect(res.status).toBe(201);
  const body = (await res.json()) as { profile: { id: string } };
  return body.profile.id;
}

// --- Tests ---
describe('Integration: Consent email delivery', () => {
  let childProfileId: string;

  beforeAll(async () => {
    await cleanupAccounts({
      emails: [CONSENT_EMAIL],
      clerkUserIds: [CONSENT_USER_ID],
    });
    childProfileId = await createChildProfile();
  });

  afterAll(async () => {
    global.fetch = originalFetch;
    await cleanupAccounts({
      emails: [CONSENT_EMAIL],
      clerkUserIds: [CONSENT_USER_ID],
    });
  });

  beforeEach(() => {
    interceptResendFetch();
    configureValidJWT(jwt, { sub: CONSENT_USER_ID, email: CONSENT_EMAIL });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns emailStatus "sent" when RESEND_API_KEY is in env', async () => {
    const env = {
      ...buildIntegrationEnv(),
      RESEND_API_KEY: FAKE_RESEND_KEY,
      EMAIL_FROM: 'test@mentomate.test',
    };

    const res = await app.request(
      '/v1/consent/request',
      {
        method: 'POST',
        headers: authHeaders(childProfileId),
        body: JSON.stringify({
          childProfileId,
          parentEmail: PARENT_EMAIL,
          consentType: 'GDPR',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { emailStatus: string };
    expect(body.emailStatus).toBe('sent');

    // Verify Resend API was called with the correct key
    expect(resendCalls).toHaveLength(1);
    expect(resendCalls[0].url).toBe('https://api.resend.com/emails');
    const headers = resendCalls[0].init?.headers as Record<string, string>;
    expect(headers?.Authorization).toBe(`Bearer ${FAKE_RESEND_KEY}`);

    // Verify email payload
    const payload = JSON.parse(resendCalls[0].init?.body as string);
    expect(payload.to).toContain(PARENT_EMAIL);
    expect(payload.from).toBe('test@mentomate.test');
    expect(payload.subject).toContain('consent');
  });

  it('returns emailStatus "failed" when RESEND_API_KEY is missing from env', async () => {
    // No RESEND_API_KEY — reproduces the stale-secret bug
    const env = buildIntegrationEnv();

    // Clean up consent state from previous test so the insert isn't a resend
    const db = createIntegrationDb();
    await db
      .delete(consentStates)
      .where(eq(consentStates.profileId, childProfileId));

    const res = await app.request(
      '/v1/consent/request',
      {
        method: 'POST',
        headers: authHeaders(childProfileId),
        body: JSON.stringify({
          childProfileId,
          parentEmail: PARENT_EMAIL,
          consentType: 'GDPR',
        }),
      },
      env
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { emailStatus: string };
    expect(body.emailStatus).toBe('failed');

    // Resend API should NOT have been called
    expect(resendCalls).toHaveLength(0);
  });
});
