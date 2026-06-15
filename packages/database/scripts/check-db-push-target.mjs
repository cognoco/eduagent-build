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
 *   DOPPLER_CONFIG absent or "dev"  →  push is allowed (local dev, CI unit tests)
 *   DOPPLER_CONFIG = "stg" or "prd" →  push is BLOCKED with a clear error
 *   DOPPLER_CONFIG = anything else  →  push is BLOCKED (unknown config = err on safe side)
 *
 * This approach is stronger than hostname-substring matching because it does not
 * depend on knowing the actual Neon endpoint names, which can change.
 *
 * Root script safety
 * ------------------
 * The root `pnpm db:push:dev` script currently calls drizzle-kit directly via
 * `pnpm exec` (bypassing this pre-script). To close that gap without cross-env
 * or platform-specific hacks, `db:push:dev` was changed to call `pnpm run
 * db:push` on this package (which triggers this pre-script), and is only
 * invoked via `doppler run` with the `dev` config — so `DOPPLER_CONFIG=dev`
 * is set by Doppler when the intent is dev.
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
 *   0 — DOPPLER_CONFIG is absent or "dev"; push is permitted
 *   1 — DOPPLER_CONFIG is stg/prd/unknown; push is blocked
 */

const dopplerConfig = process.env.DOPPLER_CONFIG;
const ALLOWED_CONFIGS = new Set([undefined, 'dev']);

if (!ALLOWED_CONFIGS.has(dopplerConfig)) {
  const url = process.env.DATABASE_URL ?? '(not set)';
  // Redact credentials before logging — keep host visible for diagnostics.
  let displayUrl = url;
  try {
    const parsed = new URL(url);
    parsed.username = parsed.username ? '***' : '';
    parsed.password = parsed.password ? '***' : '';
    displayUrl = parsed.toString();
  } catch {
    // Not a parseable URL — show as-is (no credentials to redact).
  }

  console.error(
    '\n' +
      '✗  drizzle-kit push is blocked against non-dev databases.\n' +
      '\n' +
      '   AGENTS.md (Schema And Deploy Safety): "Never run drizzle-kit push\n' +
      '   against staging or production."\n' +
      '\n' +
      '   Doppler config: ' + dopplerConfig + '\n' +
      '   DATABASE_URL resolved to: ' + displayUrl + '\n' +
      '\n' +
      '   To push against the dev database:\n' +
      '     pnpm db:push:dev            (from the repo root)\n' +
      '\n' +
      '   To apply schema changes to staging or production:\n' +
      '     pnpm db:migrate:dev         (dev)\n' +
      '     drizzle-kit migrate         (stg/prd — via the deploy workflow)\n',
  );
  process.exit(1);
}

if (dopplerConfig === 'dev') {
  console.log('✓ drizzle-kit push: dev Doppler config confirmed (DOPPLER_CONFIG=dev)');
} else {
  console.log('✓ drizzle-kit push: no Doppler config set — local dev assumed');
}
process.exit(0);
