import { promises as fs } from 'node:fs';
import path from 'node:path';
import { authStateDir } from './runtime';

/**
 * Storage-state mutators for mentor-audit pre-shell scenarios.
 *
 * The plan (`docs/plans/2026-05-25-mentor-chrome-audit-seed-pack.md` §9, §9b,
 * §10) requires three pre-shell states that no DB seeder can produce alone:
 *
 * - `session-expired`: a captured signed-in storage state whose persisted
 *   `__session` cookie is mutated to an unparseable token so Clerk
 *   middleware rejects on the next request → forced sign-out + expired banner.
 * - `session-revoked`: the seeder revokes the Clerk session server-side; the
 *   storage state still carries the now-invalid token, exercising the
 *   revoked-token-refresh code path in the Hono RPC client (distinct from
 *   the cookie-corruption path above — both are needed for AUTH-11).
 * - `mfa-totp`: a fresh storage state captured AFTER satisfying the TOTP
 *   prompt with `otplib.authenticator.generate(seedResult.ids.totpSecret)`.
 *
 * The mutators take a base storage-state JSON path (produced by the normal
 * sign-in flow) and write a derived JSON the smoke spec consumes via
 * Playwright's `use.storageState`.
 */

type MutatorName = 'session-expired' | 'session-revoked' | 'mfa-totp';

interface StorageStateCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

interface StorageStateOrigin {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
}

interface StorageStateJson {
  cookies: StorageStateCookie[];
  origins: StorageStateOrigin[];
}

async function readJson(file: string): Promise<StorageStateJson> {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as StorageStateJson;
}

async function writeJson(file: string, value: StorageStateJson): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

/**
 * Mutate the `__session` cookie value to an unparseable token. Clerk
 * middleware rejects malformed JWTs and the SDK forces a sign-out — exactly
 * the AUTH-11 "expired banner + forced sign-out" path.
 */
function expireSessionCookie(state: StorageStateJson): StorageStateJson {
  return {
    ...state,
    cookies: state.cookies.map((cookie) =>
      cookie.name === '__session'
        ? {
            ...cookie,
            // Truncate + corrupt — leaves the cookie present (so the app sees
            // an attempt) but unparseable as a JWT.
            value: 'expired.invalid.token',
            expires: Math.floor(Date.now() / 1000) - 60,
          }
        : cookie,
    ),
  };
}

/**
 * Apply the named mutator to the base storage-state file and write the
 * mutated derivative. Returns the derived file path so the spec can pass it
 * to `test.use({ storageState })`.
 */
export async function applyMentorAuditStorageStateMutator(opts: {
  mutator: MutatorName;
  baseStorageStatePath: string;
  scenarioKey: string;
}): Promise<string> {
  const baseState = await readJson(opts.baseStorageStatePath);
  const derivedPath = path.join(authStateDir, `${opts.scenarioKey}.json`);

  switch (opts.mutator) {
    case 'session-expired': {
      await writeJson(derivedPath, expireSessionCookie(baseState));
      return derivedPath;
    }
    case 'session-revoked':
      // The Clerk Backend revoke has already happened in the seeder; the
      // storage state is still the captured signed-in one. We write it
      // verbatim so the spec can `use({ storageState })` it uniformly.
      await writeJson(derivedPath, baseState);
      return derivedPath;
    case 'mfa-totp':
      // Same — the captured storage state already represents the post-TOTP
      // authenticated session. Written under the scenario key so the spec
      // doesn't need to know which base state was used.
      await writeJson(derivedPath, baseState);
      return derivedPath;
    default: {
      const exhaustive: never = opts.mutator;
      throw new Error(`Unknown mentor-audit mutator: ${String(exhaustive)}`);
    }
  }
}
