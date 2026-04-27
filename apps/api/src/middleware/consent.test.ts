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
};

const CHILD_REQUESTED_META: ProfileMeta = {
  birthYear: new Date().getFullYear() - 10,
  location: null,
  consentStatus: 'PARENTAL_CONSENT_REQUESTED',
  hasPremiumLlm: false,
  isOwner: false,
};

const WITHDRAWN_CHILD_META: ProfileMeta = {
  birthYear: new Date().getFullYear() - 12,
  location: null,
  consentStatus: 'WITHDRAWN',
  hasPremiumLlm: false,
  isOwner: false,
};

const CONSENTED_CHILD_META: ProfileMeta = {
  birthYear: new Date().getFullYear() - 12,
  location: null,
  consentStatus: 'CONSENTED',
  hasPremiumLlm: false,
  isOwner: false,
};

const ADULT_META: ProfileMeta = {
  birthYear: new Date().getFullYear() - 25,
  location: null,
  consentStatus: null,
  hasPremiumLlm: false,
  isOwner: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('consentMiddleware', () => {
  it('passes through when no profileId is set (account-level route)', async () => {
    const app = createApp({});
    const res = await app.request('/v1/subjects');
    expect(res.status).toBe(200);
  });

  it('passes through when profileMeta is not set', async () => {
    const app = createApp({ profileId: 'p-1' });
    const res = await app.request('/v1/subjects');
    expect(res.status).toBe(200);
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

  it('passes through for exempt path /v1/consent/', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
    });
    const res = await app.request('/v1/consent/my-status');
    expect(res.status).toBe(200);
  });

  it('passes through for exempt path /v1/profiles', async () => {
    const app = createApp({
      profileId: 'p-1',
      profileMeta: CHILD_PENDING_META,
    });
    const res = await app.request('/v1/profiles');
    expect(res.status).toBe(200);
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
});
