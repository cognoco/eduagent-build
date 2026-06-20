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

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  profiles,
  consentStates,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { app } from '../index';

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
 *   account → profile (child) → consent_state with a token.
 */
async function seedConsentToken(opts: {
  displayName: string;
  /** Default is 7 days from now (valid). Pass a past date to create an expired token. */
  expiresAt?: Date;
}): Promise<SeededConsent> {
  const db = createIntegrationDb();
  const clerkId = `${PREFIX}-clerk-${crypto.randomUUID()}`;
  const email = `${PREFIX}-${crypto.randomUUID()}@integration.test`;
  const token = freshToken();
  const expiresAt =
    opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId: clerkId, email })
    .returning();

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: opts.displayName,
      birthYear: 2013,
      isOwner: false,
    })
    .returning();

  await db.insert(consentStates).values({
    profileId: profile!.id,
    consentType: 'GDPR',
    status: 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: 'parent@example.com',
    consentToken: token,
    expiresAt,
  });

  return { accountId: account!.id, profileId: profile!.id, token };
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

const seededAccountIds: string[] = [];

async function cleanupAll() {
  if (seededAccountIds.length === 0) return;
  const db = createIntegrationDb();
  await db
    .delete(accounts)
    .where(inArray(accounts.id, [...new Set(seededAccountIds)]));
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
      const profile = await db.query.profiles.findFirst({
        where: eq(profiles.id, profileId),
      });
      expect(profile).toBeDefined();

      // Consent row must still be PARENTAL_CONSENT_REQUESTED (not WITHDRAWN).
      const consent = await db.query.consentStates.findFirst({
        where: eq(consentStates.profileId, profileId),
      });
      expect(consent?.status).toBe('PARENTAL_CONSENT_REQUESTED');
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

    // Verify DB state: consent row must now be CONSENTED
    const db = createIntegrationDb();
    const consent = await db.query.consentStates.findFirst({
      where: eq(consentStates.profileId, profileId),
    });
    expect(consent?.status).toBe('CONSENTED');

    // Profile must still exist after approval
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
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

    // Profile must be cascade-deleted after denial (FR10)
    const db = createIntegrationDb();
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.id, profileId),
    });
    expect(profile).toBeUndefined();

    // Consent state is also gone (cascaded from profile delete)
    const consent = await db.query.consentStates.findFirst({
      where: eq(consentStates.profileId, profileId),
    });
    expect(consent).toBeUndefined();
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
