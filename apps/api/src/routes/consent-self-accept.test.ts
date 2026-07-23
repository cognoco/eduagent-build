/**
 * [WI-2547] The pre-service guards on POST /consent/self/accept.
 *
 * Each guard must fail closed BEFORE `acceptAdultSelfConsentV2` runs, so no
 * write transaction is ever opened. That "no service call" property is what is
 * actually asserted here: the request context carries a TRIPWIRE `db` whose
 * every property access throws, so any code path that reached the service would
 * surface as a 500 rather than the expected status.
 *
 * Guards covered:
 *   - missing caller identity (`callerPersonId` unset — documented in
 *     middleware/account.ts as the legacy/pre-graph shape) -> 401;
 *   - a presented `X-Profile-Id` that is not the caller -> 403;
 *   - a missing / empty / whitespace `CONSENT_POLICY_VERSION` -> 503.
 *
 * No module is mocked: the real router is mounted behind a hand-built context.
 */
import { Hono } from 'hono';

import { consentRoutes } from './consent';

const CALLER_PERSON_ID = '11111111-1111-7111-8111-111111111111';
const OTHER_PERSON_ID = '22222222-2222-7222-8222-222222222222';
const GOOD_VERSION = '2026-07-23-wi2547';

/**
 * Any property read on this stands in for "the service was reached". The route
 * pulls `db` out of the context and hands it straight to the service, so a
 * guard that returns first never touches it.
 */
function tripwireDb(): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(
          `service reached the database (accessed "${String(prop)}") — a guard should have returned first`,
        );
      },
    },
  );
}

function buildApp(options: { callerPersonId?: string | undefined }): Hono {
  return new Hono()
    .use('*', async (c, next) => {
      c.set('db' as never, tripwireDb() as never);
      c.set('account' as never, { id: 'org-under-test' } as never);
      c.set('callerPersonId' as never, options.callerPersonId as never);
      await next();
    })
    .route('/', consentRoutes);
}

async function accept(
  app: Hono,
  init: { headers?: Record<string, string>; body?: string } = {},
  env: Record<string, string> = { CONSENT_POLICY_VERSION: GOOD_VERSION },
): Promise<Response> {
  return await app.request(
    '/consent/self/accept',
    { method: 'POST', headers: init.headers, body: init.body },
    env,
  );
}

describe('POST /consent/self/accept — caller identity guard [WI-2547]', () => {
  it('returns 401 and writes nothing when no identity is provisioned for the login', async () => {
    const res = await accept(buildApp({ callerPersonId: undefined }));

    expect(res.status).toBe(401);
    const body = (await res.json()) as unknown;
    expect(JSON.stringify(body)).toContain('No identity is provisioned');
  });

  it('does not accept a caller-supplied person id in the request body', async () => {
    // A body naming someone else must not satisfy the guard — identity comes
    // only from the verified login binding.
    const res = await accept(buildApp({ callerPersonId: undefined }), {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callerPersonId: OTHER_PERSON_ID,
        personId: OTHER_PERSON_ID,
        organizationId: 'attacker-org',
        termsVersion: 'attacker-version',
        lawfulBasis: 'art6_1_f',
      }),
    });

    expect(res.status).toBe(401);
  });
});

describe('POST /consent/self/accept — presented-profile guard [WI-2547]', () => {
  it('returns 403 before any service call when X-Profile-Id is not the caller', async () => {
    const res = await accept(buildApp({ callerPersonId: CALLER_PERSON_ID }), {
      headers: { 'X-Profile-Id': OTHER_PERSON_ID },
    });

    // 403 (not 500) proves the tripwire db was never touched.
    expect(res.status).toBe(403);
    const body = (await res.json()) as unknown;
    // Same message as every other ineligible shape — no enumeration signal.
    expect(JSON.stringify(body)).toContain('not eligible for self-consent');
  });

  it('does not leak whether the presented profile exists — identical 403 for any foreign id', async () => {
    const app = buildApp({ callerPersonId: CALLER_PERSON_ID });

    const known = await accept(app, {
      headers: { 'X-Profile-Id': OTHER_PERSON_ID },
    });
    const bogus = await accept(app, {
      headers: { 'X-Profile-Id': 'not-even-a-uuid' },
    });

    expect(known.status).toBe(bogus.status);
    expect(await known.text()).toBe(await bogus.text());
  });
});

describe('POST /consent/self/accept — policy-version guard [WI-2547]', () => {
  // A blank version would mint an UNVERSIONED acceptance fact — the weak GDPR
  // Art 5(2)/7(1) evidence repairOrSignalAdultSelfConsentV2 refuses to
  // fabricate. The response schema's `.trim().min(1)` rejects a blank version
  // too, but only AFTER the transaction committed, leaving a
  // written-but-unreportable grant, so the route refuses up front.
  const cases: Array<[string, Record<string, string>]> = [
    ['missing', {}],
    ['empty', { CONSENT_POLICY_VERSION: '' }],
    ['whitespace', { CONSENT_POLICY_VERSION: '   ' }],
    ['tab/newline whitespace', { CONSENT_POLICY_VERSION: '\t\n ' }],
  ];

  for (const [label, env] of cases) {
    it(`returns 503 before any service call when CONSENT_POLICY_VERSION is ${label}`, async () => {
      const res = await accept(
        buildApp({ callerPersonId: CALLER_PERSON_ID }),
        {},
        env,
      );

      // 503 (not 500) proves no service call and therefore no write.
      expect(res.status).toBe(503);
      const body = (await res.json()) as unknown;
      expect(JSON.stringify(body)).toContain(
        'Consent policy version is not configured',
      );
    });
  }

  it('still reaches the service when a real version IS configured', async () => {
    // The negative control for the guard above: with every guard satisfied the
    // route proceeds, and the tripwire db proves it by throwing -> 500. This
    // pins that the 503s above come from the version guard specifically and not
    // from some earlier short-circuit.
    const res = await accept(buildApp({ callerPersonId: CALLER_PERSON_ID }), {
      headers: { 'X-Profile-Id': CALLER_PERSON_ID },
    });

    expect(res.status).toBe(500);
  });
});
