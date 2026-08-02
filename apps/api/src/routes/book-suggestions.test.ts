// ---------------------------------------------------------------------------
// Real JWT + real auth middleware — no jwt module mock
// ---------------------------------------------------------------------------

import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';

// ---------------------------------------------------------------------------
// Mock database module — middleware creates a stub db per request
// ---------------------------------------------------------------------------

import {
  createDatabaseModuleMock,
  createTransactionalMockDb,
} from '../test-utils/database-module';

// WI-867: includeActual required so resolveIdentityV2 (now unconditional) can
// import Drizzle table schemas (login.clerkUserId etc.) from @eduagent/database.
const mockDatabaseModule = createDatabaseModuleMock({
  includeActual: true,
  db: createTransactionalMockDb({
    execute: jest.fn().mockResolvedValue(undefined),
  }),
});

jest.mock(
  '@eduagent/database' /* gc1-allow: route unit test — DB middleware injected via mock; real DB covered by route integration / e2e tests */,
  () => mockDatabaseModule.module,
);

// ---------------------------------------------------------------------------
// Mock account service — resolves Clerk user → local Account
// ---------------------------------------------------------------------------

jest.mock('../services/account', () => {
  const actual = jest.requireActual(
    '../services/account',
  ) as typeof import('../services/account');
  return {
    ...actual,
    findOrCreateAccount: jest.fn().mockResolvedValue({
      id: 'test-account-id',
      clerkUserId: 'user_test',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock profile-v2 — profile-scope middleware calls findOwnerPersonScope /
// getPersonScope (db.select() join chains, unrunnable on unit mock DB).
// WI-867 flag-collapse: services/profile seam removed; real path covered by
// identity integration suite.
// ---------------------------------------------------------------------------

import { personScope } from '../test-utils/identity-v2-scope-mock';

// book-suggestions uses makeAuthHeaders() with no X-Profile-Id → auto-resolve
// path; findOwnerPersonScope must return a valid scope for 200 responses.
const mockFindOwnerPersonScope = jest.fn().mockResolvedValue(personScope());
const mockGetPersonScope = jest.fn().mockResolvedValue(personScope());
jest.mock(
  '../services/identity-v2/profile-v2' /* gc1-allow: continuity — post-collapse profile-scope middleware calls findOwnerPersonScope/getPersonScope (db.select() join chains, unrunnable on unit mock DB); real path covered by identity integration suite */,
  () => ({
    ...jest.requireActual('../services/identity-v2/profile-v2'),
    findOwnerPersonScope: (...a: unknown[]) => mockFindOwnerPersonScope(...a),
    getPersonScope: (...a: unknown[]) => mockGetPersonScope(...a),
  }),
);

// ---------------------------------------------------------------------------
// Mock suggestion services — stubs for route handler
// ---------------------------------------------------------------------------

jest.mock('../services/suggestions', () => {
  const actual = jest.requireActual(
    '../services/suggestions',
  ) as typeof import('../services/suggestions');
  const stubSuggestion = {
    id: 'a0000000-0000-4000-a000-000000000001',
    subjectId: 'a0000000-0000-4000-a000-000000000201',
    title: 'Suggested Book',
    emoji: '📖',
    description: 'A suggested book',
    category: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    pickedAt: null,
  };
  return {
    ...actual,
    getUnpickedBookSuggestionsEnvelope: jest.fn().mockResolvedValue({
      suggestions: [stubSuggestion],
      curriculumBookCount: 3,
    }),
    getUnpickedBookSuggestionsWithTopup: jest.fn().mockResolvedValue({
      suggestions: [stubSuggestion],
      curriculumBookCount: 3,
    }),
    getAllBookSuggestions: jest.fn().mockResolvedValue([stubSuggestion]),
  };
});

// ---------------------------------------------------------------------------
// Mock LLM services — routeAndCall is the external LLM HTTP boundary;
// all other exports (registerProvider, _clearProviders, etc.) run real code.
// ---------------------------------------------------------------------------

jest.mock('../services/llm', () => {
  const actual = jest.requireActual(
    '../services/llm',
  ) as typeof import('../services/llm');
  return {
    ...actual,
    routeAndCall: jest.fn(),
    registerProvider: jest.fn(),
    getRegisteredProviders: jest.fn().mockReturnValue([]),
    _clearProviders: jest.fn(),
    _resetCircuits: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// [WI-2398 / WI-2396] assertNotProxyMode now also calls assertCanWriteProfile
// (verifyPersonOwnershipV2), a raw db.select() membership query the mocked
// stub db cannot satisfy — this file previously had no write-success test for
// POST /topup (only 400/401 negatives) so the gap was latent. Every
// X-Profile-Id-explicit scenario added below is a caller-self write; the
// cross-account write attack this guard exists to close is covered by the
// real-DB break test in tests/integration/wi2398-write-idor.integration.test.ts.
// gc1-allow: verifyPersonOwnershipV2 runs a raw db.select() membership query
// with no real implementation available in this file's stub-db environment
// (same class as the identical mock in subjects.test.ts / assessments.test.ts).
// ---------------------------------------------------------------------------

jest.mock('../services/identity-v2/ownership-v2', () => ({
  ...jest.requireActual('../services/identity-v2/ownership-v2'),
  verifyPersonOwnershipV2: jest.fn().mockResolvedValue(undefined),
}));

// The top-up service owns assertLlmConsent, but this route harness stubs that
// service and injects a bare `{}` db. Keep a controllable consent mock as a
// tripwire proving the mixed route itself does not invoke the gate.
// gc1-allow: isLlmExchangeConsentAllowed runs real db.query.membership /
// consentGrant reads with no real implementation available in this file's
// stub-db environment (same class as verifyPersonOwnershipV2 above).
jest.mock('../services/identity-v2/consent-status-v2', () => ({
  ...jest.requireActual('../services/identity-v2/consent-status-v2'),
  assertLlmConsent: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock Sentry (used by global error handler)
// captureException delegates to @sentry/cloudflare which is the real external
// boundary; override only captureException to prevent Sentry SDK init noise.
// ---------------------------------------------------------------------------

jest.mock('../services/sentry', () => {
  const actual = jest.requireActual(
    '../services/sentry',
  ) as typeof import('../services/sentry');
  return {
    ...actual,
    captureException: jest.fn(),
  };
});

// ---------------------------------------------------------------------------
// Import app AFTER all mocks are in place
// ---------------------------------------------------------------------------

import { Hono } from 'hono';
import { app } from '../index';
import { bookSuggestionRoutes } from './book-suggestions';
import {
  getUnpickedBookSuggestionsWithTopup,
  getUnpickedBookSuggestionsEnvelope,
  getAllBookSuggestions,
} from '../services/suggestions';
import { verifyPersonOwnershipV2 } from '../services/identity-v2/ownership-v2';
import { assertLlmConsent } from '../services/identity-v2/consent-status-v2';
import { ConsentWithdrawnError } from '../services/session';
import { makeAuthHeaders, BASE_AUTH_ENV } from '../test-utils/test-env';

const TEST_ENV = {
  ...BASE_AUTH_ENV,
  DATABASE_URL: 'postgresql://mock/test',
};

const AUTH_HEADERS = makeAuthHeaders();

// [WI-2396] POST /topup's consent-gate tests use a dedicated mini-app (not
// the real `app`) — the real app's metering middleware is not fully mocked
// in this file (billing-v2 / metering-v2 continuity mocks are absent here,
// unlike dictation.test.ts / filing.test.ts), so routing through it 500s.
// Mirrors this file's own makeProxyApp() pattern below, but isOwner: true.
function makeWriteApp(
  profileMetaOverrides: {
    birthYear?: number;
    birthMonth?: number | null;
    birthDay?: number | null;
  } = {},
) {
  const writeApp = new Hono();
  writeApp.use('*', async (c, next) => {
    c.set('db' as never, {});
    c.set('profileId' as never, 'test-profile-id');
    c.set('user' as never, { id: 'test-user' });
    c.set('account' as never, { id: 'test-account-id' });
    c.set('callerPersonId' as never, 'test-profile-id');
    c.set('profileMeta' as never, {
      birthYear: 2000,
      birthMonth: null,
      birthDay: null,
      isOwner: true,
      resolvedVia: 'explicit-header',
      ...profileMetaOverrides,
    });
    await next();
  });
  writeApp.onError((err, c) => {
    if (err instanceof ConsentWithdrawnError) {
      return c.json({ code: 'CONSENT_WITHDRAWN', message: err.message }, 403);
    }
    return c.json({ code: 'INTERNAL_ERROR', message: String(err) }, 500);
  });
  writeApp.route('/', bookSuggestionRoutes);
  return writeApp;
}

describe('book-suggestions routes', () => {
  beforeAll(() => {
    installTestJwksInterceptor();
  });

  afterAll(() => {
    restoreTestFetch();
  });

  beforeEach(() => {
    clearJWKSCache();
  });

  it('exports a Hono instance', async () => {
    const { bookSuggestionRoutes } = await import('./book-suggestions');
    expect(typeof bookSuggestionRoutes).toBe('object');
    expect(typeof bookSuggestionRoutes.fetch).toBe('function');
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/book-suggestions
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/book-suggestions', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/a0000000-0000-4000-a000-000000000201/book-suggestions',
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 200 with auth (envelope shape)', async () => {
      const res = await app.request(
        '/v1/subjects/a0000000-0000-4000-a000-000000000201/book-suggestions',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        suggestions: unknown[];
        curriculumBookCount: number;
      };
      expect(Array.isArray(body.suggestions)).toBe(true);
      expect(typeof body.curriculumBookCount).toBe('number');
    });

    // [BUG-392] UUID validation guard — non-UUID path params must be rejected
    // with 400 before reaching the DB layer.
    it('returns 400 for non-UUID subjectId', async () => {
      const res = await app.request(
        '/v1/subjects/not-a-uuid/book-suggestions',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /v1/subjects/:subjectId/book-suggestions/all
  // -------------------------------------------------------------------------

  describe('GET /v1/subjects/:subjectId/book-suggestions/all', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/a0000000-0000-4000-a000-000000000201/book-suggestions/all',
        {},
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 200 with auth', async () => {
      const res = await app.request(
        '/v1/subjects/a0000000-0000-4000-a000-000000000201/book-suggestions/all',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    // [BUG-392] UUID validation guard — non-UUID path params must be rejected
    // with 400 before reaching the DB layer.
    it('returns 400 for non-UUID subjectId on /all endpoint', async () => {
      const res = await app.request(
        '/v1/subjects/not-a-uuid/book-suggestions/all',
        { headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // [WI-2876] read-authority guard (G11). The header-resolved profileId is
  // only org-checked (getPersonScope); these cases prove a credentialed
  // caller spoofing another profile via X-Profile-Id is rejected (403) by
  // assertCanReadProfile BEFORE the suggestions read runs.
  // -------------------------------------------------------------------------

  describe('[WI-2876] read-authority guard', () => {
    const VICTIM_PROFILE_ID = 'victim-profile-id';

    it.each([
      [
        '/v1/subjects/a0000000-0000-4000-a000-000000000201/book-suggestions',
        () => jest.mocked(getUnpickedBookSuggestionsEnvelope),
      ],
      [
        '/v1/subjects/a0000000-0000-4000-a000-000000000201/book-suggestions/all',
        () => jest.mocked(getAllBookSuggestions),
      ],
    ] as const)(
      '%s rejects a cross-profile X-Profile-Id spoof with 403 before the service read',
      async (path, getServiceMock) => {
        const serviceMock = getServiceMock();
        // This file has no global clearAllMocks — clear the service mock's
        // call log so the not-called assertion below is about THIS request.
        serviceMock.mockClear();
        // Header selects another org member's profile...
        mockGetPersonScope.mockResolvedValueOnce(
          personScope({ profileId: VICTIM_PROFILE_ID }),
        );
        // ...and the caller (seeded person 'test-profile-id') holds no
        // self/guardianship authority over it — the real
        // verifyPersonOwnershipV2 would throw against a real membership
        // table (covered by wi2416-read-idor.integration.test.ts).
        jest
          .mocked(verifyPersonOwnershipV2)
          .mockRejectedValueOnce(
            new Error('caller cannot read selected profile'),
          );

        const res = await app.request(
          path,
          { headers: makeAuthHeaders({ 'X-Profile-Id': VICTIM_PROFILE_ID }) },
          TEST_ENV,
        );

        expect(res.status).toBe(403);
        const body = (await res.json()) as { code: string };
        expect(body.code).toBe('FORBIDDEN');
        expect(serviceMock).not.toHaveBeenCalled();
      },
    );
  });

  // -------------------------------------------------------------------------
  // [WI-258] POST /v1/subjects/:subjectId/book-suggestions/topup
  //
  // The side-effecting top-up generation path. Verified for auth + UUID
  // validation here; metering coverage is asserted in the metering tests.
  // -------------------------------------------------------------------------

  describe('POST /v1/subjects/:subjectId/book-suggestions/topup', () => {
    it('returns 401 without auth header', async () => {
      const res = await app.request(
        '/v1/subjects/a0000000-0000-4000-a000-000000000201/book-suggestions/topup',
        { method: 'POST' },
        TEST_ENV,
      );

      expect(res.status).toBe(401);
    });

    it('returns 400 for non-UUID subjectId on /topup endpoint', async () => {
      const res = await app.request(
        '/v1/subjects/not-a-uuid/book-suggestions/topup',
        { method: 'POST', headers: AUTH_HEADERS },
        TEST_ENV,
      );
      expect(res.status).toBe(400);
    });

    // [WI-2543] Mixed-route consent gate lives inside the top-up service.
    it('returns 200 and delegates deterministic service branches after consent withdrawal', async () => {
      (getUnpickedBookSuggestionsWithTopup as jest.Mock).mockClear();
      (assertLlmConsent as jest.Mock).mockRejectedValue(
        new ConsentWithdrawnError(),
      );

      try {
        const res = await makeWriteApp().request(
          '/subjects/a0000000-0000-4000-a000-000000000201/book-suggestions/topup',
          { method: 'POST' },
        );

        expect(res.status).toBe(200);
        expect(getUnpickedBookSuggestionsWithTopup).toHaveBeenCalled();
        expect(assertLlmConsent).not.toHaveBeenCalled();
      } finally {
        (assertLlmConsent as jest.Mock).mockResolvedValue(undefined);
      }
    });

    it('uses the exact birth date for the safety age bracket before the 18th birthday', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-31T12:00:00Z'));
      (getUnpickedBookSuggestionsWithTopup as jest.Mock).mockClear();

      try {
        const res = await makeWriteApp({
          birthYear: 2008,
          birthMonth: 12,
          birthDay: 31,
        }).request(
          '/subjects/a0000000-0000-4000-a000-000000000201/book-suggestions/topup',
          { method: 'POST' },
        );

        expect(res.status).toBe(200);
        expect(getUnpickedBookSuggestionsWithTopup).toHaveBeenCalledWith(
          expect.anything(),
          'test-profile-id',
          'a0000000-0000-4000-a000-000000000201',
          expect.objectContaining({ ageBracket: 'adolescent' }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('maps a service-boundary consent refusal to 403 CONSENT_WITHDRAWN', async () => {
      (getUnpickedBookSuggestionsWithTopup as jest.Mock).mockClear();
      (getUnpickedBookSuggestionsWithTopup as jest.Mock).mockRejectedValueOnce(
        new ConsentWithdrawnError(),
      );

      const res = await makeWriteApp().request(
        '/subjects/a0000000-0000-4000-a000-000000000201/book-suggestions/topup',
        { method: 'POST' },
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe('CONSENT_WITHDRAWN');
      expect(getUnpickedBookSuggestionsWithTopup).toHaveBeenCalled();
      expect(assertLlmConsent).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// [WI-138 / DS-049] Proxy-mode write guard
//
// Only the POST /topup branch triggers writes (LLM call + DB insert). Reads
// of existing suggestions remain allowed in proxy mode by design.
//
// [WI-258] After splitting the side-effecting top-up into its own POST
// route, the proxy guard is applied to the POST handler. The legacy GET
// ?topup=1 query parameter is no longer side-effecting (the handler ignores
// it now), so the proxy guard is intentionally NOT applied to the GET path.
// ---------------------------------------------------------------------------
describe('[WI-138 / DS-049 / WI-258] book-suggestions proxy-mode guard', () => {
  function makeProxyApp() {
    const proxyApp = new Hono();
    proxyApp.use('*', async (c, next) => {
      c.set('db' as never, {});
      c.set('profileId' as never, 'a0000000-0000-4000-a000-000000000001');
      c.set('user' as never, { id: 'test-user' });
      c.set('profileMeta' as never, { isOwner: false });
      await next();
    });
    proxyApp.route('/', bookSuggestionRoutes);
    return proxyApp;
  }

  beforeEach(() => jest.clearAllMocks());

  it('[WI-258] POST /subjects/:subjectId/book-suggestions/topup returns 403 when caller is in proxy mode', async () => {
    const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/book-suggestions/topup`,
      { method: 'POST' },
    );
    expect(res.status).toBe(403);
  });

  it('GET /subjects/:subjectId/book-suggestions (no topup) allows proxy mode — reads are intentional', async () => {
    const SUBJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
    // We only assert the guard does NOT intercept. The handler then runs
    // against the empty stub db and is expected to throw → 500, OR return
    // 200/empty for resilient code paths. Either is fine; the test only
    // proves assertNotProxyMode did not fire on the read path.
    const res = await makeProxyApp().request(
      `/subjects/${SUBJECT_ID}/book-suggestions`,
    );
    expect([200, 500]).toContain(res.status);
  });
});
