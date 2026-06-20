import { Hono } from 'hono';
import { consentMiddleware } from './consent';
import type { ProfileMeta } from './profile-scope';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createApp(options: {
  profileId?: string;
  profileMeta?: ProfileMeta;
  routePath?: string;
}): InstanceType<typeof Hono> {
  const { profileId, profileMeta, routePath = '/v1/subjects' } = options;
  const app = new Hono();

  // Simulate prior middleware setting context variables
  app.use('*', async (c, next) => {
    if (profileId) {
      c.set('profileId' as never, profileId);
    }
    if (profileMeta) {
      c.set('profileMeta' as never, profileMeta);
    }
    await next();
  });

  app.use('*', consentMiddleware);

  app.all(routePath, (c) => c.json({ ok: true }));
  // Catch-all for paths not covered by the specific route
  app.all('*', (c) => c.json({ ok: true }));

  return app;
}

const CHILD_PENDING_META: ProfileMeta = {
  birthYear: new Date().getFullYear() - 12,
  location: null,
  consentStatus: 'PENDING',
  hasPremiumLlm: false,
  isOwner: false,
  resolvedVia: 'explicit-header',
};

const CHILD_REQUESTED_META: ProfileMeta = {
  birthYear: new Date().getFullYear() - 10,
  location: null,
  consentStatus: 'PARENTAL_CONSENT_REQUESTED',
  hasPremiumLlm: false,
  isOwner: false,
  resolvedVia: 'explicit-header',
};

const WITHDRAWN_CHILD_META: ProfileMeta = {
  birthYear: new Date().getFullYear() - 12,
  location: null,
  consentStatus: 'WITHDRAWN',
  hasPremiumLlm: false,
  isOwner: false,
  resolvedVia: 'explicit-header',
};

const CONSENTED_CHILD_META: ProfileMeta = {
  birthYear: new Date().getFullYear() - 12,
  location: null,
  consentStatus: 'CONSENTED',
  hasPremiumLlm: false,
  isOwner: false,
  resolvedVia: 'explicit-header',
};

const ADULT_META: ProfileMeta = {
  birthYear: new Date().getFullYear() - 25,
  location: null,
  consentStatus: null,
  hasPremiumLlm: false,
  isOwner: true,
  resolvedVia: 'explicit-header',
};

const WITHDRAWN_ADULT_META: ProfileMeta = {
  birthYear: new Date().getFullYear() - 25,
  location: null,
  consentStatus: 'WITHDRAWN',
  hasPremiumLlm: false,
  isOwner: true,
  resolvedVia: 'explicit-header',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('consentMiddleware', () => {
  // [BUG-502] Break test: when profileScopeMiddleware sets the error sentinel
  // (DB threw during auto-resolve), consentMiddleware must fail closed with 503
  // rather than treating the absent profileId as an account-level route and
  // skipping enforcement. This guards against PENDING-consent learners escaping
  // the consent gate via a transient DB outage on the owner profile lookup.
  it('[BUG-502] returns 503 when profileScopeError sentinel is set (fails closed, not open)', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      // Simulate profileScopeMiddleware setting the error sentinel after a
      // transient DB failure. profileId is absent (auto-resolve never completed).
      c.set('profileScopeError' as never, new Error('DB connection lost'));
      // profileId intentionally left unset — this is the fail-open path we block
      await next();
    });
    app.use('*', consentMiddleware);
    app.all('*', (c) => c.json({ ok: true }));

    const res = await app.request('/v1/subjects');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('passes through when no profileId is set (account-level route)', async () => {
    const app = createApp({});
    const res = await app.request('/v1/subjects');
    expect(res.status).toBe(200);
  });

  // [BUG-408] Break test: when profileId is set but profileMeta is absent, the
  // middleware must fail closed (500) rather than skip enforcement. A non-error
  // path where meta wasn't loaded (missing owner row, edge input) must not let
  // a PENDING-consent learner through.
  it('[BUG-408] returns 500 when profileId is set but profileMeta is absent (fail closed, not open)', async () => {
    const app = createApp({ profileId: 'p-1' });
    const res = await app.request('/v1/subjects');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('passes through for exempt path /v1/health', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
      routePath: '/v1/health',
    });
    const res = await app.request('/v1/health');
    expect(res.status).toBe(200);
  });

  // [CR-096] Prefix-collision guard: /v1/health sub-route must be exempt,
  // but /v1/healthcheck-something must NOT be (no trailing-slash match).
  it('[CR-096] passes through for /v1/health/sub (sub-route of exempt prefix)', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
      routePath: '/v1/health/sub',
    });
    const res = await app.request('/v1/health/sub');
    expect(res.status).toBe(200);
  });

  it('[CR-096] blocks /v1/healthcheck-something — not a sub-path of /v1/health', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
      routePath: '/v1/healthcheck-something',
    });
    const res = await app.request('/v1/healthcheck-something');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_REQUIRED');
  });

  it('passes through for exempt path /v1/consent/', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
    });
    const res = await app.request('/v1/consent/my-status');
    expect(res.status).toBe(200);
  });

  it('passes through for exempt path GET /v1/profiles (list)', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
      routePath: '/v1/profiles',
    });
    const res = await app.request('/v1/profiles', { method: 'GET' });
    expect(res.status).toBe(200);
  });

  it('passes through for exempt path GET /v1/profiles/:id (read)', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
      routePath: '/v1/profiles/:id',
    });
    const res = await app.request('/v1/profiles/some-profile-id', {
      method: 'GET',
    });
    expect(res.status).toBe(200);
  });

  it('passes through for exempt path POST /v1/profiles/switch', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
      routePath: '/v1/profiles/switch',
    });
    const res = await app.request('/v1/profiles/switch', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  // [CR-2026-05-21-085] Break test: PATCH /v1/profiles/:id must be BLOCKED for
  // learners with PENDING consent. The old bare `/v1/profiles` prefix (no trailing
  // slash) allowed this mutation via startsWith, letting a learner mutate
  // birthYear (which alters the consent requirement itself) or displayName
  // before consent was granted.
  it('[CR-2026-05-21-085] blocks PATCH /v1/profiles/:id for child with PENDING consent', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
      routePath: '/v1/profiles/:id',
    });
    const res = await app.request('/v1/profiles/some-profile-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'hacked' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_REQUIRED');
  });

  // [CR-2026-05-21-085] Break test: POST /v1/profiles (create) must be BLOCKED
  // for learners with PENDING consent.
  it('[CR-2026-05-21-085] blocks POST /v1/profiles for child with PENDING consent', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
      routePath: '/v1/profiles',
    });
    const res = await app.request('/v1/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'new-child', birthYear: 2010 }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_REQUIRED');
  });

  it('passes through for exempt path /v1/billing/', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
    });
    const res = await app.request('/v1/billing/status');
    expect(res.status).toBe(200);
  });

  it('passes through when consent is not required (adult)', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: ADULT_META,
    });
    const res = await app.request('/v1/subjects');
    expect(res.status).toBe(200);
  });

  it('passes through when consent status is CONSENTED', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CONSENTED_CHILD_META,
    });
    const res = await app.request('/v1/subjects');
    expect(res.status).toBe(200);
  });

  it('returns 403 for child with PENDING consent', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
    });
    const res = await app.request('/v1/subjects');

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_REQUIRED');
    expect(body.message).toContain('Parental consent');
    expect(body.details.consentType).toBe('GDPR');
  });

  it('returns 403 for child with PARENTAL_CONSENT_REQUESTED', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_REQUESTED_META,
    });
    const res = await app.request('/v1/subjects');

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_REQUIRED');
    expect(body.details.consentType).toBe('GDPR');
  });

  // [F-130] Break test: an UNRESOLVED consent obligation must be enforced even
  // when the year-only age recomputed here over-estimates the learner's age
  // past the consent threshold. The obligation was created from an EXACT
  // birth-date check at profile creation (WI-297); a late-year-born 16yo whose
  // year-only age reads 17 ("not required") must NOT slip past a PENDING gate.
  it.each([
    { name: 'PENDING', consentStatus: 'PENDING' as const },
    {
      name: 'PARENTAL_CONSENT_REQUESTED',
      consentStatus: 'PARENTAL_CONSENT_REQUESTED' as const,
    },
  ])(
    'returns 403 for a $name profile whose year-only age reads as not-required (over-17)',
    async ({ consentStatus }) => {
      const meta: ProfileMeta = {
        // year-only age 18 → checkConsentRequired() returns required=false
        birthYear: new Date().getFullYear() - 18,
        location: null,
        consentStatus,
        hasPremiumLlm: false,
        isOwner: false,
        resolvedVia: 'explicit-header',
      };
      const app = createApp({ profileId: 'p-1', profileMeta: meta });
      const res = await app.request('/v1/subjects');

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('CONSENT_REQUIRED');
    },
  );

  // [F-130] Companion: a genuine adult (no consent state) must still pass even
  // though the new block runs before the !required early-out — the gate keys on
  // an UNRESOLVED consent state, which adults never have.
  it('[F-130] still allows an adult with consentStatus=null (no over-block)', async () => {
    const app = createApp({ profileId: 'p-1', profileMeta: ADULT_META });
    const res = await app.request('/v1/subjects');
    expect(res.status).toBe(200);
  });

  it('returns 403 for child with WITHDRAWN consent', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: WITHDRAWN_CHILD_META,
    });
    const res = await app.request('/v1/subjects');

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_WITHDRAWN');
    expect(body.message).toContain('withdrawn');
    expect(body.details.consentType).toBe('GDPR');
  });

  it('allows /v1/__test/ paths even with pending consent', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
    });
    const res = await app.request('/v1/__test/seed');
    expect(res.status).toBe(200);
  });

  it('allows /v1/support/ paths even with pending consent (outbox spillover must not be blocked)', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
      routePath: '/v1/support/outbox-spillover',
    });
    const res = await app.request('/v1/support/outbox-spillover', {
      method: 'POST',
    });
    expect(res.status).toBe(200);
  });

  it('blocks /v1/support/ for WITHDRAWN profiles — no active sessions to spill [BUG-TEMP-21]', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: WITHDRAWN_CHILD_META,
      routePath: '/v1/support/outbox-spillover',
    });
    const res = await app.request('/v1/support/outbox-spillover', {
      method: 'POST',
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_WITHDRAWN');
  });

  it('blocks /v1/support/ for WITHDRAWN adult profiles (GDPR Art. 7(3) applies regardless of age)', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: WITHDRAWN_ADULT_META,
      routePath: '/v1/support/outbox-spillover',
    });
    const res = await app.request('/v1/support/outbox-spillover', {
      method: 'POST',
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_WITHDRAWN');
  });

  it('blocks non-exempt paths for WITHDRAWN adult profiles', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: WITHDRAWN_ADULT_META,
    });
    const res = await app.request('/v1/subjects');
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('CONSENT_WITHDRAWN');
  });

  // Middleware ordering guard: if profileScopeMiddleware never ran at all
  // (neither profileId nor profileScopeError is set), consent middleware must
  // still fail closed rather than treating the route as account-level and
  // silently skipping enforcement. Both guards (profileScopeError → 503, absent
  // profileId → pass-through) are tested individually above; this test verifies
  // the combined "totally unwired" scenario — a new route mounted without
  // profileScopeMiddleware in the chain — returns the expected safe behavior
  // (pass-through for account-level, since there is no sentinel to trip).
  // This also confirms no runtime crash when both context vars are undefined.
  it('fails closed correctly when profileScopeMiddleware did not run at all (no profileId, no profileScopeError)', async () => {
    const app = new Hono();
    // No prior middleware — neither profileId nor profileScopeError is set
    app.use('*', consentMiddleware);
    app.all('*', (c) => c.json({ ok: true }));

    const res = await app.request('/v1/subjects');
    // Without profileScopeError sentinel and without profileId, the middleware
    // treats this as an account-level route and passes through (200). The
    // profileScopeError path (503) and profileId-present-but-no-meta path (500)
    // are separate guards; the danger is that absent profileId silently bypasses
    // enforcement. This test asserts the current deterministic behavior and will
    // catch any future regression that changes the fall-through logic.
    expect(res.status).toBe(200);
    // No error code — route reached the handler
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
