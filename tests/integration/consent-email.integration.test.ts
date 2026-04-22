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
 * Mocked: Inngest, Resend HTTP (intercepted via global fetch interceptor)
 * Real:   JWT verification, Database, consent service, notification service plumbing
 */

import { consentStates } from '@eduagent/database';
import { eq } from 'drizzle-orm';
import { inngestClientMock } from './mocks';
import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { buildAuthHeaders } from './test-keys';
import { mockResendEmail } from './external-mocks';
import { getFetchCalls, clearFetchCalls } from './fetch-interceptor';

// --- Mock boundaries ---
jest.mock('../../apps/api/src/inngest/client', () => inngestClientMock());

import { app } from '../../apps/api/src/index';

// --- Constants ---
const CONSENT_USER_ID = 'integration-consent-email';
const CONSENT_EMAIL = 'consent-email@integration.test';
const PARENT_EMAIL = 'parent@integration.test';
const CHILD_BIRTH_YEAR = 2015; // Age 11 in 2026 — requires GDPR consent
const FAKE_RESEND_KEY = 're_test_integration_consent';

async function createChildProfile(): Promise<string> {
  const res = await app.request(
    '/v1/profiles',
    {
      method: 'POST',
      headers: buildAuthHeaders({ sub: CONSENT_USER_ID, email: CONSENT_EMAIL }),
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
    mockResendEmail();
    await cleanupAccounts({
      emails: [CONSENT_EMAIL],
      clerkUserIds: [CONSENT_USER_ID],
    });
    childProfileId = await createChildProfile();
  });

  afterAll(async () => {
    await cleanupAccounts({
      emails: [CONSENT_EMAIL],
      clerkUserIds: [CONSENT_USER_ID],
    });
  });

  beforeEach(() => {
    clearFetchCalls();
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
        headers: buildAuthHeaders(
          { sub: CONSENT_USER_ID, email: CONSENT_EMAIL },
          childProfileId
        ),
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
    const calls = getFetchCalls('resend.com');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].headers['Authorization']).toBe(`Bearer ${FAKE_RESEND_KEY}`);

    // Verify email payload
    const emailBody = JSON.parse(calls[0].body!);
    expect(emailBody.to).toContain(PARENT_EMAIL);
    expect(emailBody.from).toBe('test@mentomate.test');
    expect(emailBody.subject).toContain('consent');
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
        headers: buildAuthHeaders(
          { sub: CONSENT_USER_ID, email: CONSENT_EMAIL },
          childProfileId
        ),
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
    expect(getFetchCalls('resend.com')).toHaveLength(0);
  });
});
