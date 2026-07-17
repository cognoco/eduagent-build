/**
 * Guard: refuse to run `drizzle-kit push` against staging or production.
 *
 * AGENTS.md (Schema And Deploy Safety) already bans `drizzle-kit push` against
 * staging/production in prose. This script is the mechanical enforcement: it
 * runs as a `predb:push` hook in packages/database/package.json so the
 * subcommand never reaches Drizzle if the Doppler config resolves to stg/prd.
 *
 * How it works
 * ------------
 * When `doppler run` injects secrets, it also sets `DOPPLER_CONFIG` in the
 * child process env. This script checks that value:
 *
 *   DOPPLER_CONFIG = "dev"           →  push is allowed (Doppler dev config)
 *   DOPPLER_CONFIG = "stg" or "prd" →  push is BLOCKED with a clear error
 *   DOPPLER_CONFIG = anything else  →  push is BLOCKED (unknown config = err on safe side)
 *   DOPPLER_CONFIG absent           →  push is BLOCKED unless DB_PUSH_LOCAL_DEV=1
 *                                      (see "No-Doppler escape" below)
 *
 * This approach is stronger than hostname-substring matching because it does not
 * depend on knowing the actual Neon endpoint names, which can change.
 *
 * Root script safety
 * ------------------
 * The root `pnpm db:push:dev` script explicitly passes `-c dev` to `doppler run`
 * so `DOPPLER_CONFIG` is always set to `dev` through the canonical dev path.
 *
 * No-Doppler escape
 * -----------------
 * `pnpm env:sync` (`scripts/setup-env.js`) writes stg secrets to
 * `.env.development.local` (DOPPLER_CONFIG = 'stg' is hard-coded in that
 * script). Drizzle-kit auto-loads `.env*` files from ancestor directories, so a
 * bare `drizzle-kit push` without Doppler would pick up stg credentials and
 * reach staging. Allowing `DOPPLER_CONFIG=undefined` silently would therefore
 * be unsafe. Instead, the no-Doppler case requires an explicit opt-in:
 *
 *   DB_PUSH_LOCAL_DEV=1 pnpm --filter @eduagent/database run db:push
 *
 * This escape exists only for development setups that do not use Doppler at all
 * (e.g. a clean checkout with a manually written .env.local pointing at a local
 * Postgres). It is NOT for bypassing the check when Doppler is configured.
 *
 * The opt-in alone is not sufficient: `.env.development.local` may still be
 * sitting on disk with stg credentials in it (from an earlier `pnpm env:sync`)
 * even though the dev intends to hit local Postgres. So when DATABASE_URL is
 * set under this escape, its host must resolve to localhost/127.0.0.1 — any
 * other host (in particular a `*.neon.tech` stg/prd host) is blocked (WI-1874).
 *
 * Historical context
 * ------------------
 * `drizzle-kit push` was used to set up the staging database initially (before
 * the `push → migrate` transition, April 2026). This produced schema objects
 * outside the committed migration chain, a discontinuous `drizzle.__drizzle_migrations`
 * journal (rows 107–108 from push artifacts, gap before the migrate era), and
 * tables (`organization_invitations`, `nudges.direction`) that appeared on
 * staging without a committed migration.
 * See `docs/incidents/2026-04-stg-push-incident.md`.
 *
 * Exit codes:
 *   0 — DOPPLER_CONFIG="dev"; or DOPPLER_CONFIG absent AND DB_PUSH_LOCAL_DEV=1
 *       AND (DATABASE_URL unset OR its host is localhost/127.0.0.1)
 *   1 — DOPPLER_CONFIG is stg/prd/unknown; or absent without DB_PUSH_LOCAL_DEV=1;
 *       or absent with DB_PUSH_LOCAL_DEV=1 but DATABASE_URL resolves to a
 *       non-local host
 */

import { extractHost, hostMatchesEnvironment } from './verify-db-target-lib.mjs';

const dopplerConfig = process.env.DOPPLER_CONFIG;

/** Redact username:password from a DATABASE_URL before logging. */
function redactUrl(url) {
  if (!url) return '(not set)';
  try {
    const parsed = new URL(url);
    parsed.username = parsed.username ? '***' : '';
    parsed.password = parsed.password ? '***' : '';
    return parsed.toString();
  } catch {
    return '(unparseable URL)';
  }
}

function blocked(reason) {
  const displayUrl = redactUrl(process.env.DATABASE_URL);
  console.error(
    '\n' +
      '✗  drizzle-kit push is blocked against non-dev databases.\n' +
      '\n' +
      '   AGENTS.md (Schema And Deploy Safety): "Never run drizzle-kit push\n' +
      '   against staging or production."\n' +
      '\n' +
      '   Reason: ' + reason + '\n' +
      '   Doppler config: ' + dopplerConfig + '\n' +
      '   DATABASE_URL resolved to: ' + displayUrl + '\n' +
      '\n' +
      '   To push against the dev database:\n' +
      '     pnpm db:push:dev            (from the repo root)\n' +
      '\n' +
      '   To apply schema changes to staging or production:\n' +
      '     pnpm db:push:dev            (dev)\n' +
      '     drizzle-kit migrate         (stg/prd — via the deploy workflow)\n' +
      '\n' +
      '   If you are running without Doppler (no stg creds loaded), set:\n' +
      '     DB_PUSH_LOCAL_DEV=1 pnpm --filter @eduagent/database run db:push\n',
  );
  process.exit(1);
}

if (dopplerConfig === undefined || dopplerConfig === '') {
  // No Doppler — could be a bare invocation that auto-loaded .env.development.local
  // (which contains stg credentials via pnpm env:sync). Require an explicit opt-in.
  if (!process.env.DB_PUSH_LOCAL_DEV) {
    blocked(
      'DOPPLER_CONFIG is not set. pnpm env:sync writes stg credentials to\n' +
        '   .env.development.local; a bare drizzle-kit push may target staging.\n' +
        '   Run via `pnpm db:push:dev` (uses `doppler run -c dev`), or set\n' +
        '   DB_PUSH_LOCAL_DEV=1 if you are on a local Postgres with no Doppler.',
    );
  }

  // The opt-in alone doesn't prove DATABASE_URL actually points at local
  // Postgres — .env.development.local may still hold stg creds from an
  // earlier `pnpm env:sync`. If DATABASE_URL is set, its host must be
  // localhost/127.0.0.1; anything else (in particular *.neon.tech) is blocked.
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const host = extractHost(databaseUrl);
    const isLocalHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      Boolean(host?.startsWith('localhost:')) ||
      Boolean(host?.startsWith('127.0.0.1:'));

    if (!isLocalHost) {
      const neonCheck = hostMatchesEnvironment({ host: host ?? '', wrongEnvSubstring: 'neon.tech' });
      blocked(
        'DB_PUSH_LOCAL_DEV=1 is set, but DATABASE_URL resolves to host "' +
          (host ?? '(unparseable)') +
          '", not localhost/127.0.0.1.' +
          (neonCheck.status === 'mismatch' ? ' ' + neonCheck.reason + '.' : '') +
          ' pnpm env:sync writes staging credentials into .env.development.local,\n' +
          '   which drizzle-kit auto-loads — this looks like it would push to a\n' +
          '   non-local database. Point DATABASE_URL at your local Postgres instance.',
      );
    }
  }

  console.log('✓ drizzle-kit push: no Doppler config — DB_PUSH_LOCAL_DEV=1 override accepted');
  process.exit(0);
}

if (dopplerConfig !== 'dev') {
  blocked('Doppler config is "' + dopplerConfig + '" — only "dev" is allowed for push');
}

console.log('✓ drizzle-kit push: dev Doppler config confirmed (DOPPLER_CONFIG=dev)');
process.exit(0);
