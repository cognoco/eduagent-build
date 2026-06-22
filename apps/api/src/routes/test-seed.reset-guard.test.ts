// ---------------------------------------------------------------------------
// [BUG-902] /__test/reset second, independent production guard
//
// The destructive reset endpoint is otherwise protected only by the single
// ENVIRONMENT+secret check in the /__test/* middleware. A Doppler mislabel
// (ENVIRONMENT='staging' inside the production Worker) would defeat that one
// check and let /reset seed/wipe the production database. The DB host is an
// independent signal: isProductionDatabaseUrl refuses the wipe whenever
// DATABASE_URL points at a known production Neon endpoint.
//
// Break test: delete the isProductionDatabaseUrl branch in the /__test/reset
// handler (or empty PRODUCTION_DATABASE_HOST_MARKERS) and the
// "refuses reset when DATABASE_URL is production even with a valid env+secret"
// case stops returning 403 — proving the second guard is load-bearing.
//
// No internal code is mocked. The handler's second guard runs and returns 403
// BEFORE any DB access, so the route is exercised without a real database.
// ---------------------------------------------------------------------------

import { testSeedRoutes, isProductionDatabaseUrl } from './test-seed';

const STAGING_DB_URL =
  'postgresql://u:p@ep-fancy-cherry-12345.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const PRODUCTION_DB_URL =
  'postgresql://u:p@ep-holy-leaf-67890.eu-central-1.aws.neon.tech/neondb?sslmode=require';

describe('[BUG-902] isProductionDatabaseUrl', () => {
  it('returns true for the production Neon endpoint marker', () => {
    expect(isProductionDatabaseUrl(PRODUCTION_DB_URL)).toBe(true);
  });

  it('is case-insensitive on the host marker', () => {
    expect(isProductionDatabaseUrl(PRODUCTION_DB_URL.toUpperCase())).toBe(true);
  });

  it('returns false for the staging endpoint', () => {
    expect(isProductionDatabaseUrl(STAGING_DB_URL)).toBe(false);
  });

  it('returns false for an undefined/empty connection string', () => {
    expect(isProductionDatabaseUrl(undefined)).toBe(false);
    expect(isProductionDatabaseUrl('')).toBe(false);
  });
});

async function callReset(env: Record<string, string | undefined>) {
  const headers: Record<string, string> = {};
  if (env['TEST_SEED_SECRET']) {
    headers['X-Test-Secret'] = env['TEST_SEED_SECRET'];
  }
  const req = new Request('http://test.local/__test/reset', {
    method: 'POST',
    headers,
  });
  return testSeedRoutes.request(req, undefined, env);
}

describe('[BUG-902] /__test/reset production-database guard', () => {
  it('refuses reset when DATABASE_URL is production even with a valid env + secret', async () => {
    // The primary guard PASSES here: ENVIRONMENT='staging' (a Doppler mislabel
    // scenario) and the shared secret matches. Only the second, DB-host guard
    // can stop this — and it must.
    const res = await callReset({
      ENVIRONMENT: 'staging',
      TEST_SEED_SECRET: 'test-secret',
      DATABASE_URL: PRODUCTION_DB_URL,
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/production database host/i);
  });

  it('refuses reset when ENVIRONMENT is mislabelled development against a production DATABASE_URL', async () => {
    // development skips the secret requirement, so the env+secret layer is wide
    // open — the DB-host guard is the only thing standing between a mislabel and
    // a production wipe.
    const res = await callReset({
      ENVIRONMENT: 'development',
      DATABASE_URL: PRODUCTION_DB_URL,
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/production database host/i);
  });
});
