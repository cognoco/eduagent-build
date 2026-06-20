/**
 * [ACCOUNT-27 / QA-12] WI-871 — consent-web parent-facing HTML flow.
 *
 * Deterministic, no-DB, no-SMTP coverage for the server-rendered consent
 * decision pages that the flow-revision sweep could only source-check
 * (ACCOUNT-27 "invalid/expired link source-checked; no live expired email
 * link"; QA-12 "yaml is a PLACEHOLDER … real coverage = API integration
 * tests"). The DB-backed end-to-end behaviour stays in
 * `consent-web.integration.test.ts`; this suite locks the pure HTML-branch
 * logic so it runs on every CI lane without a staging Postgres.
 *
 * The ONLY mocked boundary is the database: `consentWebRoutes` is mounted on a
 * fresh Hono app and a per-request `db` stub is injected via middleware. The
 * REAL `getChildNameByToken` / `processConsentResponse` service functions run
 * against that stub — no internal service mock. Email delivery is never
 * reached: these public pages never send mail.
 *
 * Branches covered:
 *   - GET /consent-page                  — missing token → 400 "Invalid link"
 *   - GET /consent-page                  — unknown/expired token → 404 "Link expired"
 *   - GET /consent-page                  — valid token → Approve + Deny controls;
 *                                          child name XSS-escaped
 *   - GET /consent-page/deny-confirm     — two-step "Are you sure?" + Go back  [ACCOUNT-27]
 *   - GET /consent-page/deny-confirm     — missing → 400; unknown → 404
 *   - POST /consent-page/confirm         — missing token/approved → 400
 *   - POST /consent-page/confirm         — approved!=='true'|'false' → 400 data-loss guard (#868)
 *   - POST /consent-page/confirm         — approved=false → denial landing  [QA-12]
 *   - POST /consent-page/confirm         — approved=true  → approval landing
 *   - POST /consent-page/confirm         — invalid token → 404 "Link expired"
 */
import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import { consentWebRoutes } from './consent-web';

// ─── DB stub (external boundary) ───────────────────────────────────────────
// Drives the real getChildNameByToken / processConsentResponse code paths.
// A "row" present + unresponded + unexpired ⇒ child name disclosed.

interface StubConsentRow {
  id: string;
  profileId: string;
  consentType: 'GDPR' | 'COPPA';
  status: 'PENDING' | 'PARENTAL_CONSENT_REQUESTED' | 'CONSENTED' | 'WITHDRAWN';
  parentEmail: string | null;
  consentToken: string;
  requestedAt: Date;
  respondedAt: Date | null;
  expiresAt: Date | null;
}

function makeRow(overrides: Partial<StubConsentRow> = {}): StubConsentRow {
  return {
    id: 'consent-1',
    profileId: 'profile-child-1',
    consentType: 'GDPR',
    status: 'PARENTAL_CONSENT_REQUESTED',
    parentEmail: 'parent@example.com',
    consentToken: 'valid-token',
    requestedAt: new Date(Date.now() - 60_000),
    respondedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

/**
 * Builds a db stub whose `consentStates.findFirst` returns `row` (or undefined)
 * and whose `profiles.findFirst` returns the given display name. The atomic
 * update chain used by processConsentResponse resolves to one matched row so
 * the status transition "succeeds".
 */
function makeDb(opts: {
  row: StubConsentRow | undefined;
  displayName?: string | null;
}): Database {
  const { row, displayName = 'Emma' } = opts;
  const updateReturning = jest
    .fn()
    .mockResolvedValue(row ? [{ ...row, status: 'CONSENTED' }] : []);
  const updateChain = {
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ returning: updateReturning }),
    }),
  };
  return {
    query: {
      consentStates: { findFirst: jest.fn().mockResolvedValue(row) },
      profiles: {
        findFirst: jest
          .fn()
          .mockResolvedValue(displayName == null ? undefined : { displayName }),
      },
    },
    update: jest.fn().mockReturnValue(updateChain),
    delete: jest
      .fn()
      .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
    transaction: jest
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          update: jest.fn().mockReturnValue(updateChain),
          delete: jest
            .fn()
            .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
        }),
      ),
  } as unknown as Database;
}

const ENV = {
  DATABASE_URL: 'postgres://stub',
  CONSENT_POLICY_VERSION: 'v1-test',
  // IDENTITY_V2_ENABLED unset ⇒ legacy consent_states path (isIdentityV2Enabled === false)
} as const;

/** Hono env mirroring consentWebRoutes' own (ConsentWebEnv is not exported). */
type ConsentWebTestEnv = {
  Bindings: {
    DATABASE_URL: string;
    CONSENT_POLICY_VERSION: string;
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: { db: Database };
};

/** Mount consentWebRoutes standalone with the db stub injected per request. */
function mountWith(db: Database) {
  return new Hono<ConsentWebTestEnv>()
    .use('*', async (c, next) => {
      c.set('db', db);
      await next();
    })
    .route('/', consentWebRoutes);
}

async function getPage(db: Database, path: string): Promise<Response> {
  return mountWith(db).request(path, {}, ENV);
}

async function postConfirm(
  db: Database,
  form: Record<string, string>,
): Promise<Response> {
  const body = new URLSearchParams(form).toString();
  return mountWith(db).request(
    '/consent-page/confirm',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
    ENV,
  );
}

afterEach(() => jest.clearAllMocks());

describe('[ACCOUNT-27] GET /consent-page — decision page + link guards', () => {
  it('400s with "Invalid link" when the token query param is missing', async () => {
    const res = await getPage(makeDb({ row: makeRow() }), '/consent-page');
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Invalid link');
  });

  it('404s with "Link expired" when the token resolves to no child (unknown/expired)', async () => {
    const res = await getPage(
      makeDb({ row: undefined }),
      '/consent-page?token=ghost',
    );
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('Link expired or invalid');
  });

  it('404s when the token row exists but is already responded (used link cannot disclose the name)', async () => {
    const res = await getPage(
      makeDb({ row: makeRow({ respondedAt: new Date() }) }),
      '/consent-page?token=used',
    );
    expect(res.status).toBe(404);
  });

  it('renders both Approve and Deny controls for a valid token', async () => {
    const res = await getPage(
      makeDb({ row: makeRow(), displayName: 'Emma' }),
      '/consent-page?token=valid-token',
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Consent required for Emma');
    expect(html).toContain('Approve');
    // Deny routes to the two-step confirmation, never directly to confirm.
    expect(html).toContain('/consent-page/deny-confirm?token=valid-token');
  });

  it('escapes a malicious child display name in the rendered page (XSS guard)', async () => {
    const res = await getPage(
      makeDb({ row: makeRow(), displayName: '<script>alert(1)</script>' }),
      '/consent-page?token=valid-token',
    );
    const html = await res.text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('[ACCOUNT-27] GET /consent-page/deny-confirm — two-step denial', () => {
  it('renders the "Are you sure?" confirmation with an irreversible-deletion warning and a Go-back escape', async () => {
    const res = await getPage(
      makeDb({ row: makeRow(), displayName: 'Emma' }),
      '/consent-page/deny-confirm?token=valid-token',
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Are you sure?');
    // The destructive consequence is spelled out before the parent confirms.
    expect(html).toContain('permanently deleted');
    // Confirm posts approved=false; Go back returns to the decision page.
    expect(html).toContain('name="approved" value="false"');
    expect(html).toContain('/consent-page?token=valid-token');
  });

  it('400s when the deny-confirm token is missing', async () => {
    const res = await getPage(
      makeDb({ row: makeRow() }),
      '/consent-page/deny-confirm',
    );
    expect(res.status).toBe(400);
  });

  it('404s when the deny-confirm token is unknown/expired', async () => {
    const res = await getPage(
      makeDb({ row: undefined }),
      '/consent-page/deny-confirm?token=ghost',
    );
    expect(res.status).toBe(404);
  });
});

describe('[QA-12] POST /consent-page/confirm — deny-confirmation + invalid handling', () => {
  it('400s when token or approved is missing from the form body', async () => {
    const res = await postConfirm(makeDb({ row: makeRow() }), {
      token: 'valid-token',
    });
    expect(res.status).toBe(400);
  });

  it('[#868] 400s the data-loss guard when approved is neither "true" nor "false"', async () => {
    // 'True'/'1'/'on' previously coerced to a DENIAL → cascade-deleted the
    // child profile. The strict-enum guard must reject before any mutation.
    const db = makeDb({ row: makeRow() });
    const res = await postConfirm(db, {
      token: 'valid-token',
      approved: 'True',
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Invalid link');
    // No status transition was attempted on the malformed value.
    expect(db.update).not.toHaveBeenCalled();
  });

  it('renders the denial landing and processes approved=false', async () => {
    const db = makeDb({ row: makeRow(), displayName: 'Emma' });
    const res = await postConfirm(db, {
      token: 'valid-token',
      approved: 'false',
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Consent declined');
    // Denial is a destructive transaction (status flip + cascade profile
    // delete) — the real service opened it over the stub.
    expect(db.transaction).toHaveBeenCalled();
  });

  it('renders the approval landing and processes approved=true', async () => {
    const db = makeDb({ row: makeRow(), displayName: 'Emma' });
    const res = await postConfirm(db, {
      token: 'valid-token',
      approved: 'true',
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Family account ready');
    expect(html).toContain("Emma's account is now active");
  });

  it('404s with "Link expired" when the token is invalid at confirm time', async () => {
    // getChildNameByToken returns null (no row) → fallback name; the real
    // processConsentResponse then throws ConsentTokenNotFoundError ("Invalid
    // consent token"), which the route maps to a 404 expired-link page.
    const res = await postConfirm(makeDb({ row: undefined }), {
      token: 'ghost',
      approved: 'true',
    });
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('Link expired or invalid');
  });

  // [BUG-870] Before the fix the confirm handler classified errors by
  // string-matching `error.message === 'Invalid consent token'`. Only
  // ConsentTokenNotFoundError carries that message; the two other known errors
  // thrown by the real processConsentResponse —
  //   - ConsentAlreadyProcessedError ('This consent request has already been processed')
  //   - ConsentTokenExpiredError    ('Consent token has expired')
  // — did not match, fell through the catch, and re-threw, surfacing a raw 500
  // to the parent instead of an actionable friendly page. The fix classifies on
  // the error CLASS. These tests drive the REAL service to throw each class and
  // assert the friendly page (never a 500).

  it('[BUG-870] renders the "already processed" page (409, not 500) when the token was already responded to', async () => {
    // A terminal status (CONSENTED) makes the real processConsentResponse throw
    // ConsentAlreadyProcessedError at the replay-protection check.
    const db = makeDb({
      row: makeRow({ status: 'CONSENTED', respondedAt: new Date() }),
    });
    const res = await postConfirm(db, {
      token: 'valid-token',
      approved: 'true',
    });
    expect(res.status).not.toBe(500);
    expect(res.status).toBe(409);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('already');
    // No status transition is attempted once it is already terminal.
    expect(db.update).not.toHaveBeenCalled();
  });

  it('[BUG-870] renders the "link expired" page (410, not 500) when the token has expired', async () => {
    // A non-terminal row with a past expiresAt makes the real
    // processConsentResponse throw ConsentTokenExpiredError.
    const db = makeDb({
      row: makeRow({ expiresAt: new Date(Date.now() - 1000) }),
    });
    const res = await postConfirm(db, {
      token: 'valid-token',
      approved: 'true',
    });
    expect(res.status).not.toBe(500);
    expect(res.status).toBe(410);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('expired');
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Rate limiting on the UNAUTHENTICATED consent-page GET endpoints
// (Notion "consent-web: Unauthenticated GET /consent-page endpoints lack rate
// limiting"). GET /consent-page and GET /consent-page/deny-confirm are
// reachable by anyone holding (or guessing) a token and each fires a DB lookup
// (dispatchGetChildNameByToken). Without rate limiting they can be hammered for
// token enumeration / DoS of the consent DB lookups. They must share the same
// IP-based sliding-window limiter as POST /consent-page/confirm and
// /consent/respond (consent.ts) — the established pattern for this flow.
// ---------------------------------------------------------------------------

/** Issue a GET with explicit IP headers so the per-IP limiter buckets it. */
async function getPageFromIp(
  db: Database,
  path: string,
  ip: string,
): Promise<Response> {
  return mountWith(db).request(
    path,
    { headers: { 'cf-connecting-ip': ip } },
    ENV,
  );
}

describe('GET /consent-page — rate limiting on unauthenticated lookups', () => {
  beforeEach(() => {
    // Reset the SHARED sliding-window map (owned by consent.ts) so counts don't
    // bleed between tests. jest.requireActual keeps this GC1/GC6-compliant —
    // no internal jest.mock.
    const { __resetConsentRespondRateLimit } = jest.requireActual(
      './consent',
    ) as {
      __resetConsentRespondRateLimit: () => void;
    };
    __resetConsentRespondRateLimit();
  });

  it('allows the first 30 GET /consent-page lookups then blocks the 31st with 429 + Retry-After', async () => {
    const ip = '203.0.113.50';
    // First 30 unknown-token lookups reach the handler → 404 "Link expired".
    for (let i = 0; i < 30; i++) {
      const res = await getPageFromIp(
        makeDb({ row: undefined }),
        '/consent-page?token=enumerate',
        ip,
      );
      expect(res.status).toBe(404);
    }
    // 31st from the same IP must be rate-limited BEFORE the DB lookup.
    const blocked = await getPageFromIp(
      makeDb({ row: undefined }),
      '/consent-page?token=enumerate',
      ip,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('3600');
    const html = await blocked.text();
    expect(html).toContain('Too many requests');
    // GET is a page VIEW, not a submission — the parent merely reloaded the
    // page and has submitted nothing. The body must use view-appropriate copy
    // and must NOT imply a submission (the POST-only "submitted" wording).
    expect(html).toContain(
      'Too many requests to this page. Please try again in a little while.',
    );
    expect(html).not.toContain('submitted too many consent responses');
  });

  it('blocks GET /consent-page/deny-confirm on the same per-IP budget', async () => {
    const ip = '203.0.113.51';
    for (let i = 0; i < 30; i++) {
      const res = await getPageFromIp(
        makeDb({ row: undefined }),
        '/consent-page/deny-confirm?token=enumerate',
        ip,
      );
      expect(res.status).toBe(404);
    }
    const blocked = await getPageFromIp(
      makeDb({ row: undefined }),
      '/consent-page/deny-confirm?token=enumerate',
      ip,
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('3600');
    const html = await blocked.text();
    expect(html).toContain(
      'Too many requests to this page. Please try again in a little while.',
    );
    expect(html).not.toContain('submitted too many consent responses');
  });

  it('does not affect a different IP — the limiter is per source IP', async () => {
    const hammered = '203.0.113.52';
    for (let i = 0; i < 31; i++) {
      await getPageFromIp(
        makeDb({ row: undefined }),
        '/consent-page?token=enumerate',
        hammered,
      );
    }
    // A fresh IP reaches the handler → 404, never 429.
    const other = await getPageFromIp(
      makeDb({ row: undefined }),
      '/consent-page?token=enumerate',
      '198.51.100.7',
    );
    expect(other.status).toBe(404);
  });

  it('does not rate-limit a single legitimate consent-link open', async () => {
    // The common case: a parent opens the link once. Must render the decision
    // page (200), never a 429.
    const res = await getPageFromIp(
      makeDb({ row: makeRow(), displayName: 'Emma' }),
      '/consent-page?token=valid-token',
      '203.0.113.60',
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Consent required for Emma');
  });
});
