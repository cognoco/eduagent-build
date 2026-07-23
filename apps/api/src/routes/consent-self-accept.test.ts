/**
 * [WI-2547] The missing-caller-identity guard on POST /consent/self/accept.
 *
 * `callerPersonId` is set by accountMiddleware from the verified Clerk JWT and
 * is documented as unset on the legacy path and pre-graph (middleware/account.ts).
 * The route must fail closed with 401 in that case — never fall back to the
 * X-Profile-Id-selectable active profile, and never reach the writer.
 *
 * This branch is unreachable through the real middleware chain (which always
 * resolves a person for an authenticated v2 caller), so it is exercised by
 * mounting the real router behind a context that leaves `callerPersonId` unset.
 * No module is mocked: the assertion is that the guard returns before any
 * service call, so the stub `db`/`account` are never touched.
 */
import { Hono } from 'hono';

import { consentRoutes } from './consent';

function buildApp(callerPersonId: string | undefined) {
  return new Hono()
    .use('*', async (c, next) => {
      // Real shapes are irrelevant: a 401 must be returned before either is read.
      c.set('db' as never, {} as never);
      c.set('account' as never, { id: 'org-under-test' } as never);
      c.set('callerPersonId' as never, callerPersonId as never);
      await next();
    })
    .route('/', consentRoutes);
}

const ENV = { CONSENT_POLICY_VERSION: '2026-07-23-wi2547' };

describe('POST /consent/self/accept — caller identity guard [WI-2547]', () => {
  it('returns 401 and writes nothing when no identity is provisioned for the login', async () => {
    const res = await buildApp(undefined).request(
      '/consent/self/accept',
      { method: 'POST' },
      ENV,
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(JSON.stringify(body)).toContain('No identity is provisioned');
  });

  it('does not accept a caller-supplied person id in the request body', async () => {
    // A body naming someone else must not satisfy the guard — identity comes
    // only from the verified login binding.
    const res = await buildApp(undefined).request(
      '/consent/self/accept',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callerPersonId: 'attacker-supplied',
          personId: 'attacker-supplied',
          organizationId: 'attacker-org',
          termsVersion: 'attacker-version',
          lawfulBasis: 'art6_1_f',
        }),
      },
      ENV,
    );

    expect(res.status).toBe(401);
  });
});
