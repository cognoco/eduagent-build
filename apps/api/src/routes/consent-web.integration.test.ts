/**
 * Integration: consent-web public routes (GET /consent-page, GET /consent-page/deny-confirm,
 * POST /consent-page/confirm)
 *
 * These routes are PUBLIC — no JWT is required. They render HTML using the
 * parent's consent token to look up the child's display name and drive a
 * two-step approval/denial flow.
 *
 * Boundary: DB and the real Hono app run; no middleware is mocked. The only
 * external boundary (email delivery) is never invoked — we seed consent tokens
 * directly via DB inserts, bypassing `requestConsent()` so no email is sent.
 *
 * Behaviours verified:
 * 1. GET /consent-page   — missing token → 400; not-found token → 404; valid → 200 with child name
 * 2. GET /consent-page/deny-confirm — missing → 400; invalid → 404; valid → 200 with confirm form
 * 3. POST /consent-page/confirm — missing token → 400; approved=true → 200 landing + DB CONSENTED;
 *    approved=false → 200 denial + profile deleted; invalid token → 404 "Link Expired"
 * 4. XSS escaping — child name containing <script> is escaped in every HTML response
 */

import { createHmac } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import {
  consentGrant,
  consentRequest,
  membership,
  organization,
  person,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { CONSENT_PURPOSES } from '@eduagent/schemas';
import { resolve } from 'path';

import { app } from '../index';
import { inngest } from '../inngest/client';
import {
  signWithdrawalToken,
  verifyWithdrawalToken,
} from '../services/consent-withdrawal-token';
import {
  createPendingConsentRequest,
  requestConsentV2,
} from '../services/identity-v2/consent-v2';
import * as emailModule from '../services/notifications/email';

// ---------------------------------------------------------------------------
// DB setup — mirrors pattern from consent.integration.test.ts
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Integration env — tells the Hono app where the DB is
// ---------------------------------------------------------------------------

function buildEnv(): Record<string, string> {
  return {
    ENVIRONMENT: 'test',
    DATABASE_URL: requireDatabaseUrl(),
    // Auth-related bindings are present so middleware doesn't crash.
    // Consent-web routes are on PUBLIC_PATHS so auth is skipped entirely.
    CLERK_JWKS_URL: 'https://clerk.test/.well-known/jwks.json',
    CLERK_AUDIENCE: 'integration-test-audience',
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const PREFIX = 'integration-consent-web';

/** Returns a fresh unique token string each call. */
function freshToken(): string {
  return `${PREFIX}-token-${crypto.randomUUID()}`;
}

interface SeededConsent {
  accountId: string;
  profileId: string;
  token: string;
}

/**
 * Seeds the minimal chain needed to exercise the consent-web routes:
 *   organization → person (child) → membership → consentRequest with a token.
 *
 * [WI-867] Route now calls processConsentResponseV2 which reads consentRequest.
 * [WI-1128] Legacy `accounts`/`profiles` are dropped — this is now a pure v2
 * seed (organization/person/membership/consentRequest); previously it also
 * dual-seeded legacy accounts/profiles rows sharing the same ids.
 */
async function seedConsentToken(opts: {
  displayName: string;
  /** Default is 7 days from now (valid). Pass a past date to create an expired token. */
  expiresAt?: Date;
}): Promise<SeededConsent> {
  const db = createIntegrationDb();
  const token = freshToken();
  const expiresAt =
    opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [org] = await db
    .insert(organization)
    .values({ name: `${PREFIX} Org` })
    .returning();
  const [p] = await db
    .insert(person)
    .values({
      displayName: opts.displayName,
      birthDate: '2013-06-15',
      residenceJurisdiction: 'EU',
    })
    .returning();
  await db.insert(membership).values({
    personId: p!.id,
    organizationId: org!.id,
    roles: ['learner'],
  });
  await db.insert(consentRequest).values(
    CONSENT_PURPOSES.map((purpose) => ({
      chargePersonId: p!.id,
      organizationId: org!.id,
      purpose,
      requestedBasis: 'gdpr_parental_consent' as const,
      token,
      tokenExpiresAt: expiresAt,
      status: 'pending' as const,
      guardianEmail: 'parent@example.com',
    })),
  );

  return { accountId: org!.id, profileId: p!.id, token };
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

const seededAccountIds: string[] = [];

/**
 * [WI-1128] Legacy `accounts` cascade-deleted `profiles` for free; the v2
 * graph has no such cascade from organization → person, so resolve the
 * seeded personIds via membership before tearing down in FK-safe order:
 * consentRequest/consentGrant (restrict/cascade off person) → membership →
 * person → organization.
 */
async function cleanupAll() {
  if (seededAccountIds.length === 0) return;
  const db = createIntegrationDb();
  const orgIds = [...new Set(seededAccountIds)];
  const memberships = await db.query.membership.findMany({
    where: inArray(membership.organizationId, orgIds),
    columns: { personId: true },
  });
  const personIds = memberships.map((m) => m.personId);
  if (personIds.length > 0) {
    await db
      .delete(consentRequest)
      .where(inArray(consentRequest.chargePersonId, personIds));
    await db
      .delete(consentGrant)
      .where(inArray(consentGrant.chargePersonId, personIds));
    await db.delete(membership).where(inArray(membership.personId, personIds));
    await db.delete(person).where(inArray(person.id, personIds));
  }
  await db.delete(organization).where(inArray(organization.id, orgIds));
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Clear the array so each test tracks only its own seeds.
  seededAccountIds.length = 0;
});

afterAll(async () => {
  await cleanupAll();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV = buildEnv();

async function get(path: string): Promise<Response> {
  return app.request(path, { method: 'GET' }, ENV);
}

async function postForm(
  path: string,
  fields: Record<string, string>,
): Promise<Response> {
  const body = new URLSearchParams(fields).toString();
  return app.request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    ENV,
  );
}

async function responseHtml(res: Response): Promise<string> {
  return res.text();
}

// ---------------------------------------------------------------------------
// Suite 1: GET /v1/consent-page
// ---------------------------------------------------------------------------

describe('GET /v1/consent-page', () => {
  it('returns 400 when token query param is missing', async () => {
    const res = await get('/v1/consent-page');
    expect(res.status).toBe(400);
    const html = await responseHtml(res);
    expect(html).toContain('Invalid link');
  });

  it('returns 404 when token is not found in DB', async () => {
    const res = await get('/v1/consent-page?token=not-a-real-token');
    expect(res.status).toBe(404);
    const html = await responseHtml(res);
    expect(html).toContain('Link expired or invalid');
  });

  it('returns 200 with consent form when token is valid', async () => {
    const { accountId, token } = await seedConsentToken({
      displayName: 'Alice',
    });
    seededAccountIds.push(accountId);

    const res = await get(
      `/v1/consent-page?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    const html = await responseHtml(res);
    expect(html).toContain('Alice');
    // Page should contain both Approve and Deny actions
    expect(html).toContain('Approve');
    expect(html).toContain('Deny');
    // Token should appear as a hidden input
    expect(html).toContain(token);
  });

  it('XSS: child name with <script> tag is HTML-escaped in consent page', async () => {
    const xssName = '<script>alert("xss")</script>';
    const { accountId, token } = await seedConsentToken({
      displayName: xssName,
    });
    seededAccountIds.push(accountId);

    const res = await get(
      `/v1/consent-page?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    const html = await responseHtml(res);
    // Raw script tag must NOT appear in output
    expect(html).not.toContain('<script>alert');
    // Escaped version must be present
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns security headers on the consent page', async () => {
    const { accountId, token } = await seedConsentToken({
      displayName: 'Bob',
    });
    seededAccountIds.push(accountId);

    const res = await get(
      `/v1/consent-page?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("script-src 'none'");
  });

  it('returns security headers even on 400 error response', async () => {
    const res = await get('/v1/consent-page');
    expect(res.status).toBe(400);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: GET /v1/consent-page/deny-confirm
// ---------------------------------------------------------------------------

describe('GET /v1/consent-page/deny-confirm', () => {
  it('returns 400 when token query param is missing', async () => {
    const res = await get('/v1/consent-page/deny-confirm');
    expect(res.status).toBe(400);
    const html = await responseHtml(res);
    expect(html).toContain('Invalid link');
  });

  it('returns 404 when token is not found in DB', async () => {
    const res = await get(
      '/v1/consent-page/deny-confirm?token=bogus-token-xyz',
    );
    expect(res.status).toBe(404);
    const html = await responseHtml(res);
    expect(html).toContain('Link expired or invalid');
  });

  it('returns 200 with confirmation form when token is valid', async () => {
    const { accountId, token } = await seedConsentToken({
      displayName: 'Charlie',
    });
    seededAccountIds.push(accountId);

    const res = await get(
      `/v1/consent-page/deny-confirm?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    const html = await responseHtml(res);
    expect(html).toContain('Are you sure?');
    expect(html).toContain('Charlie');
    // Form should have approved=false hidden input and a "Yes, deny" button
    expect(html).toContain('value="false"');
    expect(html).toContain('Yes, deny consent');
    // "Go back" link should also be present
    expect(html).toContain('Go back');
  });

  it('XSS: child name with <script> tag is HTML-escaped on deny-confirm page', async () => {
    const xssName = '"><img src=x onerror=alert(1)>';
    const { accountId, token } = await seedConsentToken({
      displayName: xssName,
    });
    seededAccountIds.push(accountId);

    const res = await get(
      `/v1/consent-page/deny-confirm?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    const html = await responseHtml(res);
    // Raw injection string must not be rendered verbatim
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    // The double-quote character must be entity-escaped
    expect(html).toContain('&quot;');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: POST /v1/consent-page/confirm
// ---------------------------------------------------------------------------

describe('POST /v1/consent-page/confirm', () => {
  it('returns 400 when both token and approved are missing', async () => {
    const res = await postForm('/v1/consent-page/confirm', {});
    expect(res.status).toBe(400);
    const html = await responseHtml(res);
    expect(html).toContain('Invalid link');
  });

  it('returns 400 when token is present but approved is missing', async () => {
    const res = await postForm('/v1/consent-page/confirm', {
      token: 'some-token',
    });
    expect(res.status).toBe(400);
    const html = await responseHtml(res);
    expect(html).toContain('Invalid link');
  });

  it('returns 400 when approved is present but token is missing', async () => {
    const res = await postForm('/v1/consent-page/confirm', {
      approved: 'true',
    });
    expect(res.status).toBe(400);
    const html = await responseHtml(res);
    expect(html).toContain('Invalid link');
  });

  // [Bug #868 — BREAK TEST] The pre-fix code did `approved = approvedParam === 'true'`
  // which silently coerced ANY non-'true' value (including unknown values
  // like 'TRUE', '1', 'on', a corrupted form body, or a link-prefetcher echo)
  // into a DENIAL. Denial cascade-deletes the child profile, so this is a
  // data-loss bug, not just hygiene. The fix requires approvedParam to be
  // exactly 'true' or 'false'; anything else must 400 BEFORE
  // processConsentResponse runs.
  it.each([
    ['TRUE'],
    ['True'],
    ['1'],
    ['on'],
    ['yes'],
    ['approved'],
    ['garbage'],
  ])(
    '[BREAK #868] rejects approved="%s" with 400 and does NOT delete the child profile',
    async (badValue) => {
      const { accountId, profileId, token } = await seedConsentToken({
        displayName: 'BugProof',
      });
      seededAccountIds.push(accountId);

      const res = await postForm('/v1/consent-page/confirm', {
        token,
        approved: badValue,
      });
      expect(res.status).toBe(400);
      const html = await responseHtml(res);
      expect(html).toContain('Invalid link');

      // Critical: profile must still exist. Pre-fix the route silently
      // treated this as denial and cascade-deleted the profile.
      const db = createIntegrationDb();
      const profile = await db.query.person.findFirst({
        where: eq(person.id, profileId),
      });
      expect(profile).toBeDefined();

      // [WI-867] v2: consentRequest must still be pending (not denied/approved).
      const request = await db.query.consentRequest.findFirst({
        where: eq(consentRequest.chargePersonId, profileId),
      });
      expect(request?.status).toBe('pending');
    },
  );

  it('returns 404 "Link Expired" when token does not exist', async () => {
    const res = await postForm('/v1/consent-page/confirm', {
      token: 'does-not-exist-in-db',
      approved: 'true',
    });
    expect(res.status).toBe(404);
    const html = await responseHtml(res);
    expect(html).toContain('Link expired or invalid');
  });

  it('approval: returns 200 landing page and sets consent status to CONSENTED', async () => {
    const { accountId, profileId, token } = await seedConsentToken({
      displayName: 'Dana',
    });
    seededAccountIds.push(accountId);

    const res = await postForm('/v1/consent-page/confirm', {
      token,
      approved: 'true',
    });
    expect(res.status).toBe(200);
    const html = await responseHtml(res);
    // Celebratory landing copy (per UX spec)
    expect(html).toContain('Family account ready');
    expect(html).toContain('Dana');

    // [WI-867] v2: consentRequest status must be 'approved'; consentGrant row created.
    const db = createIntegrationDb();
    const consentReq = await db.query.consentRequest.findFirst({
      where: eq(consentRequest.chargePersonId, profileId),
    });
    expect(consentReq?.status).toBe('approved');
    const grant = await db.query.consentGrant.findFirst({
      where: eq(consentGrant.chargePersonId, profileId),
    });
    expect(grant?.granted).toBe(true);

    // Profile must still exist after approval
    const profile = await db.query.person.findFirst({
      where: eq(person.id, profileId),
    });
    expect(profile).not.toBeNull();
  });

  it('denial: returns 200 landing page and deletes child profile', async () => {
    const { accountId, profileId, token } = await seedConsentToken({
      displayName: 'Eve',
    });
    seededAccountIds.push(accountId);

    const res = await postForm('/v1/consent-page/confirm', {
      token,
      approved: 'false',
    });
    expect(res.status).toBe(200);
    const html = await responseHtml(res);
    // Denial landing copy
    expect(html).toContain('Consent declined');
    expect(html).toContain('Eve');

    // [WI-867] v2 denial: person row is deleted; consentRequest cascade-deletes with it.
    const db = createIntegrationDb();
    const deletedPerson = await db.query.person.findFirst({
      where: eq(person.id, profileId),
    });
    expect(deletedPerson).toBeUndefined();

    // consentRequest.chargePersonId → person.id FK cascade delete.
    const deletedRequest = await db.query.consentRequest.findFirst({
      where: eq(consentRequest.chargePersonId, profileId),
    });
    expect(deletedRequest).toBeUndefined();
  });

  it('XSS: child name with <script> is escaped on the approval landing page', async () => {
    const xssName = '<script>stealCookies()</script>';
    const { accountId, token } = await seedConsentToken({
      displayName: xssName,
    });
    seededAccountIds.push(accountId);

    const res = await postForm('/v1/consent-page/confirm', {
      token,
      approved: 'true',
    });
    expect(res.status).toBe(200);
    const html = await responseHtml(res);
    expect(html).not.toContain('<script>stealCookies');
    expect(html).toContain('&lt;script&gt;');
  });

  it('XSS: child name with <script> is escaped on the denial landing page', async () => {
    const xssName = '<b>EvilName</b>';
    const { accountId, token } = await seedConsentToken({
      displayName: xssName,
    });
    seededAccountIds.push(accountId);

    const res = await postForm('/v1/consent-page/confirm', {
      token,
      approved: 'false',
    });
    expect(res.status).toBe(200);
    const html = await responseHtml(res);
    expect(html).not.toContain('<b>EvilName</b>');
    expect(html).toContain('&lt;b&gt;EvilName&lt;/b&gt;');
  });

  it('[BUG-870] returns 410 + a friendly "link expired" page for an expired token', async () => {
    // Seed a token whose expiresAt is in the past.
    const { accountId, token } = await seedConsentToken({
      displayName: 'Fred',
      expiresAt: new Date(Date.now() - 1000), // already expired
    });
    seededAccountIds.push(accountId);

    // processConsentResponse sees row.expiresAt < now and throws
    // ConsentTokenExpiredError. The route classifies on the error class via
    // `instanceof` and renders a dedicated 410 page (it no longer string-matches
    // 'Invalid consent token', which only ever covered ConsentTokenNotFoundError
    // and left this path re-throwing as a raw 500 — the BUG-870 defect).
    const res = await postForm('/v1/consent-page/confirm', {
      token,
      approved: 'true',
    });
    expect(res.status).toBe(410);
    const html = await res.text();
    expect(html).toContain('This link has expired');
  });

  it('[BUG-870] replay protection: second submission with same token returns 409 + an "already processed" page', async () => {
    const { accountId, token } = await seedConsentToken({
      displayName: 'Grace',
    });
    seededAccountIds.push(accountId);

    // First submission succeeds.
    const res1 = await postForm('/v1/consent-page/confirm', {
      token,
      approved: 'true',
    });
    expect(res1.status).toBe(200);

    // Second submission: token already consumed (CONSENTED row) →
    // processConsentResponse throws ConsentAlreadyProcessedError. The route's
    // instanceof classification renders a dedicated 409 page (previously this
    // fell through to the global error handler and surfaced a raw 500).
    const res2 = await postForm('/v1/consent-page/confirm', {
      token,
      approved: 'true',
    });
    expect(res2.status).toBe(409);
    const html = await res2.text();
    expect(html).toContain('This request has already been processed');
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Rate limiting on POST /consent-page/confirm [BUG-491]
// ---------------------------------------------------------------------------

// [BUG-491] Break test: /consent-page/confirm must apply the same 30/hr
// IP-based rate limit as /consent/respond. Without the limit, an attacker
// with a leaked or guessed token can hammer the destructive cascade-delete
// denial path, causing DoS on the DB and bypassing defense-in-depth.
//
// This test exercises only the in-memory rate-limit guard — DB is not needed
// because the 429 fires before any DB call. We use jest.requireActual to
// access __resetConsentRespondRateLimit without introducing a jest.mock
// (GC1/GC6 compliant).
describe('POST /v1/consent-page/confirm — rate limiting [BUG-491]', () => {
  beforeEach(() => {
    // Reset the shared sliding-window map so counts don't bleed between tests.
    const { __resetConsentRespondRateLimit } = jest.requireActual(
      './consent',
    ) as { __resetConsentRespondRateLimit: () => void };
    __resetConsentRespondRateLimit();
  });

  it('allows the first 30 attempts and blocks the 31st with 429 + Retry-After', async () => {
    const ip = '203.0.113.42';
    const headers = { 'cf-connecting-ip': ip };

    // First 30 attempts against a nonexistent token get 404 "Link Expired"
    // (processConsentResponse throws → caught → 404), not 429.
    // This proves rate limiting is NOT yet active for requests 1-30.
    for (let i = 0; i < 30; i++) {
      const res = await app.request(
        '/v1/consent-page/confirm',
        {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: 'nonexistent-token-for-rate-limit-test',
            approved: 'true',
          }).toString(),
        },
        ENV,
      );
      // Expect 404 (not 429) — rate limiter has not tripped yet
      expect(res.status).toBe(404);
    }

    // 31st request from the same IP must be rate-limited BEFORE hitting the DB
    const blocked = await app.request(
      '/v1/consent-page/confirm',
      {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: 'nonexistent-token-for-rate-limit-test',
          approved: 'true',
        }).toString(),
      },
      ENV,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('3600');
    const html = await blocked.text();
    expect(html).toContain('Too many requests');

    // A different IP must NOT be affected — limiter is per-IP
    const otherRes = await app.request(
      '/v1/consent-page/confirm',
      {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '198.51.100.99',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: 'nonexistent-token-for-rate-limit-test',
          approved: 'true',
        }).toString(),
      },
      ENV,
    );
    // Different IP: reaches the handler → 404 (not 429)
    expect(otherRes.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Rate limiting on the unauthenticated consent-page GET endpoints
// ---------------------------------------------------------------------------

// The unauthenticated GET /consent-page and GET /consent-page/deny-confirm
// token lookups must share the same per-IP 30/hr sliding-window limit as
// POST /consent-page/confirm and /consent/respond. Without it, an attacker
// holding (or guessing) a token can hammer these endpoints to enumerate tokens
// or DoS the consent DB lookups. The 429 fires BEFORE any DB call, so this
// suite needs no seeded data. jest.requireActual keeps it GC1/GC6-compliant.
describe('GET /v1/consent-page — rate limiting [consent-web unauthenticated]', () => {
  beforeEach(() => {
    const { __resetConsentRespondRateLimit } = jest.requireActual(
      './consent',
    ) as { __resetConsentRespondRateLimit: () => void };
    __resetConsentRespondRateLimit();
  });

  function getFromIp(path: string, ip: string): Promise<Response> {
    return app.request(path, { headers: { 'cf-connecting-ip': ip } }, ENV);
  }

  it('allows the first 30 GET /consent-page lookups and blocks the 31st with 429 + Retry-After', async () => {
    const ip = '203.0.113.70';
    for (let i = 0; i < 30; i++) {
      const res = await getFromIp('/v1/consent-page?token=enumerate', ip);
      // Unknown token reaches the handler → 404 (proves limiter not yet tripped)
      expect(res.status).toBe(404);
    }
    const blocked = await getFromIp('/v1/consent-page?token=enumerate', ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('3600');
    const html = await blocked.text();
    expect(html).toContain('Too many requests');

    // A different IP is unaffected — the limiter is per source IP.
    const other = await getFromIp(
      '/v1/consent-page?token=enumerate',
      '198.51.100.71',
    );
    expect(other.status).toBe(404);
  });

  it('applies the same per-IP budget to GET /consent-page/deny-confirm', async () => {
    const ip = '203.0.113.72';
    for (let i = 0; i < 30; i++) {
      const res = await getFromIp(
        '/v1/consent-page/deny-confirm?token=enumerate',
        ip,
      );
      expect(res.status).toBe(404);
    }
    const blocked = await getFromIp(
      '/v1/consent-page/deny-confirm?token=enumerate',
      ip,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('3600');
  });
});

// ---------------------------------------------------------------------------
// Suite 6: P0 email-parent withdrawal / restore (identity-v2 graph)
// ---------------------------------------------------------------------------
//
// These routes operate on the v2 person/consent_grant graph (not the legacy
// consent_states the suites above use) and are authorized by a signed bearer
// token rather than a Clerk session or guardianship edge (MMT-ADR-0027). The
// only external boundary mocked is the Inngest dispatch — spied, not
// jest.mock'd (GC1/GC6-clean; Inngest is a framework boundary). The DB, the
// real Hono app, the token signer/verifier, and the consent service all run
// for real.

const WITHDRAW_SECRET = 'integration-consent-withdrawal-secret-0123456789';
const WITHDRAW_ENV: Record<string, string> = {
  ...buildEnv(),
  CONSENT_WITHDRAWAL_TOKEN_SECRET: WITHDRAW_SECRET,
};

// [WI-2347] Replicates the legacy `cw1` wire format — no live production code
// path mints these anymore (signWithdrawalToken only mints cw2), but real
// links minted before this change are still in parents' inboxes, so
// verifyWithdrawalToken must keep accepting them.
function forgeCw1Token(chargePersonId: string, organizationId: string): string {
  const payload = `cw1:${chargePersonId}:${organizationId}`;
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = createHmac('sha256', WITHDRAW_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

describe('P0 email-parent withdrawal/restore (identity-v2)', () => {
  const v2OrgIds: string[] = [];
  const v2PersonIds: string[] = [];

  beforeEach(() => {
    // The withdraw POST/restore POST share the per-IP limiter; reset it so
    // counts don't bleed in from the rate-limit suites above.
    const { __resetConsentRespondRateLimit } = jest.requireActual(
      './consent',
    ) as {
      __resetConsentRespondRateLimit: () => void;
    };
    __resetConsentRespondRateLimit();
    v2OrgIds.length = 0;
    v2PersonIds.length = 0;
  });

  afterEach(async () => {
    const db = createIntegrationDb();
    for (const pid of v2PersonIds) {
      await db.delete(consentGrant).where(eq(consentGrant.chargePersonId, pid));
      await db.delete(membership).where(eq(membership.personId, pid));
      await db.delete(person).where(eq(person.id, pid));
    }
    for (const oid of v2OrgIds) {
      await db.delete(organization).where(eq(organization.id, oid));
    }
  });

  // Seeds the email-parent end state directly: org → child person → membership
  // → an APPROVED gdpr grant (optionally already withdrawn). Returns a signed
  // withdrawal token for that (child × org), exactly as the approval route
  // would have minted.
  async function seedApprovedGrant(opts: {
    displayName: string;
    withdrawnAt?: Date | null;
    grant?: boolean; // false → membership but NO grant (never-approved case)
  }): Promise<{ orgId: string; childId: string; token: string }> {
    const db = createIntegrationDb();
    const [org] = await db
      .insert(organization)
      .values({ name: 'WV Org' })
      .returning();
    v2OrgIds.push(org!.id);
    const [p] = await db
      .insert(person)
      .values({
        displayName: opts.displayName,
        birthDate: '2013-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning();
    v2PersonIds.push(p!.id);
    await db.insert(membership).values({
      personId: p!.id,
      organizationId: org!.id,
      roles: ['learner'],
    });
    // [WI-2347] The tokenId a `cw2` link is bound to — set on the seeded
    // grant row exactly as `processConsentResponseV2` would on approve, so
    // the mismatch check in the service layer sees a live, matching link.
    const withdrawalTokenId = crypto.randomUUID();
    if (opts.grant !== false) {
      const grantedAt = new Date();
      await db.insert(consentGrant).values(
        CONSENT_PURPOSES.map((purpose) => ({
          chargePersonId: p!.id,
          organizationId: org!.id,
          purpose,
          lawfulBasis: 'gdpr_parental_consent' as const,
          granted: true,
          grantedAt,
          priorValue: null,
          withdrawnAt: opts.withdrawnAt ?? null,
          auditFact: { source: 'consent_response_approved' },
          withdrawalTokenId,
        })),
      );
    }
    const token = signWithdrawalToken(p!.id, org!.id, WITHDRAW_SECRET, {
      tokenId: withdrawalTokenId,
    });
    return { orgId: org!.id, childId: p!.id, token };
  }

  function getW(path: string): Promise<Response> {
    return app.request(
      path,
      { method: 'GET' },
      WITHDRAW_ENV,
    ) as Promise<Response>;
  }
  function postW(
    path: string,
    fields: Record<string, string>,
  ): Promise<Response> {
    return app.request(
      path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      },
      WITHDRAW_ENV,
    ) as Promise<Response>;
  }

  it('GET withdraw: forged/invalid token → 400 invalid-link page', async () => {
    const res = await getW('/v1/consent-page/withdraw?token=not.a.valid.token');
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Invalid link');
  });

  it('GET withdraw: valid token + active grant → "are you sure?" confirm page', async () => {
    const { token } = await seedApprovedGrant({ displayName: 'Wendy' });
    const res = await getW(
      `/v1/consent-page/withdraw?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Withdraw consent for Wendy?');
    expect(html).toContain('Yes, withdraw consent');
    expect(html).toContain('/v1/consent-page/withdraw');
  });

  // [RIDER — WI-2372 Finding 1, MEDIUM-hardening, PM-ratified onto WI-2396]
  // WI-2372's original bounce (AC5 truthfulness): withdrawConfirmBody /
  // withdrawnLandingBody claimed "stops MentoMate from processing X's data" /
  // "We've stopped processing their data" — a blanket claim the landed
  // enforcement didn't fully back at the time. Fixed in 48a52cb3a to name
  // what actually stops ("learning sessions") instead. This regression pair
  // guards that exact defect class from being reintroduced by a future copy
  // edit: assert the truthful claim as a named case, AND assert the absence
  // of the overstatement class — same sweep-audit pattern 48a52cb3a used
  // (`rg -niE "stop(ped|s)? (all )?processing|we've stopped|processing (your|their|his|her) data"`)
  // — on both the confirm page (GET, pre-withdrawal) and the landing page
  // (POST, post-withdrawal).
  it('[RIDER / WI-2372 Finding 1] confirm + landing copy states "learning sessions" truthfully and never overstates as "processing"', async () => {
    const OVERSTATEMENT_PATTERN =
      /stop(ped|s)? (all )?processing|we've stopped|processing (your|their|his|her) data/i;
    const { token } = await seedApprovedGrant({ displayName: 'Riley' });

    // Confirm page (GET, pre-withdrawal) — "learning sessions" truthful case.
    const confirmRes = await getW(
      `/v1/consent-page/withdraw?token=${encodeURIComponent(token)}`,
    );
    expect(confirmRes.status).toBe(200);
    const confirmHtml = await confirmRes.text();
    expect(confirmHtml).toContain('learning sessions');
    expect(confirmHtml).not.toMatch(OVERSTATEMENT_PATTERN);

    // Landing page (POST, post-withdrawal) — same pair.
    const landingRes = await postW('/v1/consent-page/withdraw', { token });
    expect(landingRes.status).toBe(200);
    const landingHtml = await landingRes.text();
    expect(landingHtml).toContain('learning sessions');
    expect(landingHtml).not.toMatch(OVERSTATEMENT_PATTERN);
  });

  it('GET withdraw: valid token + already withdrawn (in grace) → informational landing, no restore form [WI-2348]', async () => {
    const { token } = await seedApprovedGrant({
      displayName: 'Wade',
      withdrawnAt: new Date(),
    });
    const res = await getW(
      `/v1/consent-page/withdraw?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Consent withdrawn');
    expect(html).toContain('signing in');
    // [WI-2348 / OPQ-114] bearer possession no longer restores — the page
    // must not offer a self-service restore form/action anymore.
    expect(html).not.toContain('Undo — restore consent');
    expect(html).not.toContain('/v1/consent-page/restore');
  });

  it('GET withdraw: valid token but no grant → "nothing to withdraw"', async () => {
    const { token } = await seedApprovedGrant({
      displayName: 'Nora',
      grant: false,
    });
    const res = await getW(
      `/v1/consent-page/withdraw?token=${encodeURIComponent(token)}`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Nothing to withdraw');
  });

  it('POST withdraw: stamps withdrawn_at and dispatches app/consent.email-revoked', async () => {
    const sendSpy = jest
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);
    try {
      const { childId, token } = await seedApprovedGrant({
        displayName: 'Pia',
      });
      const res = await postW('/v1/consent-page/withdraw', { token });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Consent withdrawn');

      const db = createIntegrationDb();
      const grant = await db.query.consentGrant.findFirst({
        where: eq(consentGrant.chargePersonId, childId),
      });
      expect(grant?.withdrawnAt).toBeTruthy();
      expect((grant?.auditFact as { source?: string } | null)?.source).toBe(
        'email_parent_revocation',
      );

      // The grace→delete dispatch is fire-and-forget (no executionCtx in the
      // test runtime), so flush the microtask/timer queue before asserting.
      await new Promise((r) => setTimeout(r, 50));
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'app/consent.email-revoked',
          data: expect.objectContaining({ chargePersonId: childId }),
        }),
      );
    } finally {
      sendSpy.mockRestore();
    }
  });

  it('POST withdraw: invalid token → 400 invalid-link page (no mutation)', async () => {
    const res = await postW('/v1/consent-page/withdraw', {
      token: 'forged.token',
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Invalid link');
  });

  // [WI-2348 / OPQ-114, AC-3] The negative path this WI exists to prove: a
  // bare bearer link — valid, unexpired, within the restore grace window —
  // must NOT be able to restore consent anymore. Possession of the link is
  // the only thing this request presents; no authenticated session. The
  // guaranteed property is that the grant stays withdrawn and no new row is
  // appended, not merely that the response text changed.
  it('POST restore: a valid bearer link within grace CANNOT restore consent — no authenticated session (AC-3)', async () => {
    const { childId, token } = await seedApprovedGrant({
      displayName: 'Remy',
      withdrawnAt: new Date(Date.now() - 60_000),
    });
    const res = await postW('/v1/consent-page/restore', { token });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('Consent restored');
    expect(html).toContain('Sign in');

    const db = createIntegrationDb();
    const grants = await db.query.consentGrant.findMany({
      where: eq(consentGrant.chargePersonId, childId),
    });
    // No new row was appended, and the original grant is still withdrawn —
    // the link had zero mutating effect.
    expect(grants).toHaveLength(CONSENT_PURPOSES.length);
    expect(grants.every((grant) => grant.withdrawnAt !== null)).toBe(true);
  });

  it('POST restore: forged/invalid token → 400 invalid-link page (unchanged; still never mutates)', async () => {
    const res = await postW('/v1/consent-page/restore', {
      token: 'forged.token',
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Invalid link');
  });

  it('the signed withdrawal token round-trips through verifyWithdrawalToken', async () => {
    const { childId, orgId, token } = await seedApprovedGrant({
      displayName: 'Val',
    });
    const decoded = verifyWithdrawalToken(token, WITHDRAW_SECRET);
    expect(decoded).toMatchObject({
      chargePersonId: childId,
      organizationId: orgId,
    });
    // [WI-2347] cw2 also carries the per-link tokenId.
    expect(typeof decoded?.tokenId).toBe('string');
  });

  // [WI-2347 review, CONSIDER-2] End-to-end through the actual route (not
  // just the service layer): a legacy cw1 link — no tokenId embedded at
  // all — must be rejected once the grant it names has been superseded by a
  // newer cw2-minted grant. This is the case the route's `payload.tokenId ??
  // null` conversion exists to close: without it, a bare `undefined` would
  // skip the id check entirely rather than being treated as "cw1, expect
  // null".
  it('POST withdraw: a legacy cw1 link is rejected as "nothing to withdraw" once superseded by a newer cw2-minted grant', async () => {
    const { orgId, childId } = await seedApprovedGrant({ displayName: 'Cora' });
    // A newer grant minted after 'Cora's, carrying a withdrawalTokenId —
    // simulates a fresh re-consent cycle under the post-migration code.
    const db = createIntegrationDb();
    const withdrawalTokenId = crypto.randomUUID();
    const grantedAt = new Date();
    await db.insert(consentGrant).values(
      CONSENT_PURPOSES.map((purpose) => ({
        chargePersonId: childId,
        organizationId: orgId,
        purpose,
        lawfulBasis: 'gdpr_parental_consent' as const,
        granted: true,
        grantedAt,
        priorValue: null,
        auditFact: { source: 'consent_response_approved' },
        withdrawalTokenId,
      })),
    );

    const legacyToken = forgeCw1Token(childId, orgId);
    const res = await postW('/v1/consent-page/withdraw', {
      token: legacyToken,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Nothing to withdraw');

    const grants = await db.query.consentGrant.findMany({
      where: eq(consentGrant.chargePersonId, childId),
    });
    expect(grants.every((g) => g.withdrawnAt === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 7: POST /consent-page/confirm — approval mints the withdrawal email
// (identity-v2). Spec §8: on v2 approval the route must email the parent a
// `consent_approved` message carrying a durable, signed withdrawal link
// (MMT-ADR-0027). This is the *origin* of the bearer token that Suite 6
// exercises — verify the confirm route produces a link that round-trips
// through verifyWithdrawalToken to the seeded (child × org).
//
// Email delivery (Resend HTTP) is a true external boundary, so spying on
// sendEmail is GC1/GC6-clean. Everything else — the real Hono app, the v2
// consent service, the token signer — runs for real.
// ---------------------------------------------------------------------------

const CONFIRM_ENV: Record<string, string> = {
  ...buildEnv(),
  IDENTITY_V2_ENABLED: 'true',
  CONSENT_WITHDRAWAL_TOKEN_SECRET: WITHDRAW_SECRET,
  API_ORIGIN: 'https://api.test',
};

/** Extracts the first http(s) URL embedded in an email body. */
function extractUrl(body: string): string {
  const match = body.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`no URL found in email body: ${body}`);
  return match[0];
}

describe('POST /v1/consent-page/confirm — approval mints withdrawal email (identity-v2)', () => {
  const v2OrgIds: string[] = [];
  const v2PersonIds: string[] = [];

  beforeEach(() => {
    const { __resetConsentRespondRateLimit } = jest.requireActual(
      './consent',
    ) as {
      __resetConsentRespondRateLimit: () => void;
    };
    __resetConsentRespondRateLimit();
    v2OrgIds.length = 0;
    v2PersonIds.length = 0;
  });

  afterEach(async () => {
    const db = createIntegrationDb();
    for (const pid of v2PersonIds) {
      // consent_request back-links consent_grant (consent_grant_id FK), so the
      // request rows must be cleared before the grants they reference.
      await db
        .delete(consentRequest)
        .where(eq(consentRequest.chargePersonId, pid));
      await db.delete(consentGrant).where(eq(consentGrant.chargePersonId, pid));
      await db.delete(membership).where(eq(membership.personId, pid));
      await db.delete(person).where(eq(person.id, pid));
    }
    for (const oid of v2OrgIds) {
      await db.delete(organization).where(eq(organization.id, oid));
    }
  });

  // Seeds the pending v2 consent request the email-parent would receive, and
  // returns its (request) token plus the seeded child × org.
  async function seedPendingRequest(opts: {
    displayName: string;
  }): Promise<{ orgId: string; childId: string; token: string }> {
    const db = createIntegrationDb();
    const [org] = await db
      .insert(organization)
      .values({ name: 'Confirm Org' })
      .returning();
    v2OrgIds.push(org!.id);
    const [p] = await db
      .insert(person)
      .values({
        displayName: opts.displayName,
        birthDate: '2013-01-01',
        residenceJurisdiction: 'EU',
      })
      .returning();
    v2PersonIds.push(p!.id);
    await db.insert(membership).values({
      personId: p!.id,
      organizationId: org!.id,
      roles: ['learner'],
    });
    await createPendingConsentRequest(db, p!.id, org!.id, 'GDPR');
    await requestConsentV2(db, {
      chargePersonId: p!.id,
      organizationId: org!.id,
      consentType: 'GDPR',
      guardianEmail: 'parent@example.com',
      childName: opts.displayName,
      appUrl: 'https://api.test',
    });
    const req = await db.query.consentRequest.findFirst({
      where: eq(consentRequest.chargePersonId, p!.id),
    });
    return { orgId: org!.id, childId: p!.id, token: req!.token! };
  }

  function postConfirm(
    fields: Record<string, string>,
    env: Record<string, string>,
  ): Promise<Response> {
    return app.request(
      '/v1/consent-page/confirm',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      },
      env,
    ) as Promise<Response>;
  }

  it('approval emails a consent_approved link that verifyWithdrawalToken resolves to the seeded child', async () => {
    const { orgId, childId, token } = await seedPendingRequest({
      displayName: 'Quinn',
    });
    // Spy AFTER seeding so only the confirm-path send is captured (the v2
    // service seeds purely via DB and sends no email itself).
    const emailSpy = jest
      .spyOn(emailModule, 'sendEmail')
      .mockResolvedValue({ sent: true } as never);
    try {
      const res = await postConfirm({ token, approved: 'true' }, CONFIRM_ENV);
      expect(res.status).toBe(200);

      // The send is fire-and-forget (no executionCtx in the test runtime),
      // so flush the microtask queue before asserting.
      await new Promise((r) => setTimeout(r, 50));

      expect(emailSpy).toHaveBeenCalledTimes(1);
      const payload = emailSpy.mock.calls[0]![0] as emailModule.EmailPayload;
      expect(payload.type).toBe('consent_approved');
      expect(payload.to).toBe('parent@example.com');

      const withdrawalUrl = extractUrl(payload.body);
      const urlToken = new URL(withdrawalUrl).searchParams.get('token');
      expect(urlToken).toBeTruthy();
      const decoded = verifyWithdrawalToken(urlToken!, WITHDRAW_SECRET);
      expect(decoded).toMatchObject({
        chargePersonId: childId,
        organizationId: orgId,
      });
      // [WI-2347] cw2 also carries the per-link tokenId.
      expect(typeof decoded?.tokenId).toBe('string');
    } finally {
      emailSpy.mockRestore();
    }
  });

  it('approval still succeeds (200, no email) when the withdrawal-token secret is absent', async () => {
    const { token } = await seedPendingRequest({ displayName: 'Riley' });
    const emailSpy = jest
      .spyOn(emailModule, 'sendEmail')
      .mockResolvedValue({ sent: true } as never);
    try {
      // No CONSENT_WITHDRAWAL_TOKEN_SECRET / API_ORIGIN — the link cannot be
      // minted, but the already-committed approval must never 500.
      const res = await postConfirm(
        { token, approved: 'true' },
        { ...buildEnv(), IDENTITY_V2_ENABLED: 'true' },
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Family account ready');

      await new Promise((r) => setTimeout(r, 50));
      expect(emailSpy).not.toHaveBeenCalled();
    } finally {
      emailSpy.mockRestore();
    }
  });
});
