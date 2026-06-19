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
 *   Clerk session cookies are cleared so the next request lands pre-auth →
 *   forced sign-out + expired banner.
 * - `session-revoked`: the seeder revokes the Clerk session server-side; the
 *   storage state still carries the now-invalid token, exercising the
 *   revoked-token-refresh code path in the Hono RPC client (distinct from
 *   the cookie-corruption path above — both are needed for AUTH-11).
 * - `mfa-totp`: a fresh storage state captured AFTER satisfying the TOTP
 *   prompt with `otplib.authenticator.generate(seedResult.ids.totpSecret)`.
 *
 * The mutators take a base storage-state JSON path (produced by the normal
 * sign-in flow) and return a derived JSON file path the smoke spec consumes
 * via Playwright's `use.storageState`.
 *
 * **[BUG-779/780] Banner-state init script.** Cookie / Clerk-token mutations
 * alone do not surface the sign-in banner — the production app reads
 * `mentomate_session_expired_at` / `mentomate_session_revoked_at` from
 * `sessionStorage`, NOT cookies. Playwright's storage-state only persists
 * cookies + localStorage, so the mutator additionally returns a small
 * `sessionStorageInit` snippet the spec installs via `addInitScript()` before
 * the first navigation. This deterministically primes the banner state in
 * the same atomic step that mutates the auth token — without it, the spec
 * would have to rely on triggering a real 401 round-trip first, which races
 * with the redirect to /sign-in and silently lands on the home shell.
 *
 * Clerk also stores instance-suffixed cookie names on web, for example
 * `__session_o7qfR7ot` and `__clerk_db_jwt_o7qfR7ot`. Clearing only the
 * legacy unsuffixed `__session` cookie leaves the user signed in and the
 * pre-shell banner rows fail by landing on Home.
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

export interface MentorAuditStorageStateResult {
  /** Path to the derived Playwright storage-state JSON. Spec passes this to
   *  `browser.newContext({ storageState })`. */
  storageStatePath: string;
  /** Optional init script the spec must install via
   *  `context.addInitScript(sessionStorageInit)` before the first
   *  `page.goto(...)`. Seeds sessionStorage markers that the in-app
   *  `peekSessionExpiredNotice()` / `peekSessionRevokedNotice()` checks read
   *  on mount — without this the sign-in screen does not render the banner. */
  sessionStorageInit?: string;
}

async function readJson(file: string): Promise<StorageStateJson> {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw) as StorageStateJson;
}

async function writeJson(file: string, value: StorageStateJson): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

function isActiveClerkSessionCookie(name: string): boolean {
  return (
    name === '__session' ||
    name.startsWith('__session_') ||
    name === '__clerk_db_jwt' ||
    name.startsWith('__clerk_db_jwt_') ||
    name === '__client_uat' ||
    name.startsWith('__client_uat_') ||
    name === 'clerk_active_context'
  );
}

/**
 * Clear all app-origin Clerk cookies that can keep the captured context signed
 * in. The banner marker itself is seeded separately via sessionStorage.
 */
export function clearClerkSessionCookies(
  state: StorageStateJson,
): StorageStateJson {
  return {
    ...state,
    cookies: state.cookies.filter(
      (cookie) => !isActiveClerkSessionCookie(cookie.name),
    ),
  };
}

/**
 * Returns the init-script source that seeds the named sessionStorage marker
 * to `Date.now()` so the in-app peek reads it as a fresh notice. Keys are
 * duplicated from `apps/mobile/src/lib/auth-expiry.ts` (`AUTH_EXPIRY_STORAGE_KEYS`)
 * — the e2e-web bundle has no path back into mobile source at runtime, so
 * the literal lives here and the production module is the cross-check.
 */
function bannerInitScript(reason: 'expired' | 'revoked'): string {
  const key =
    reason === 'expired'
      ? 'mentomate_session_expired_at'
      : 'mentomate_session_revoked_at';
  // Single-quoted JS string — Playwright runs this before any page script.
  return `try { window.sessionStorage.setItem(${JSON.stringify(
    key,
  )}, String(Date.now())); } catch (_) {}`;
}

/**
 * Apply the named mutator to the base storage-state file and write the
 * mutated derivative. Returns the derived file path so the spec can pass it
 * to `browser.newContext({ storageState })`, plus an optional init script
 * the spec must install on the context so the in-app banner state is primed
 * before the first navigation.
 */
export async function applyMentorAuditStorageStateMutator(opts: {
  mutator: MutatorName;
  baseStorageStatePath: string;
  scenarioKey: string;
}): Promise<MentorAuditStorageStateResult> {
  const baseState = await readJson(opts.baseStorageStatePath);
  const derivedPath = path.join(authStateDir, `${opts.scenarioKey}.json`);

  switch (opts.mutator) {
    case 'session-expired': {
      await writeJson(derivedPath, clearClerkSessionCookies(baseState));
      return {
        storageStatePath: derivedPath,
        sessionStorageInit: bannerInitScript('expired'),
      };
    }
    case 'session-revoked':
      // The Clerk Backend revoke has already happened in the seeder; the
      // captured storage state can still contain web cookies that make Clerk
      // treat the context as signed in before it refreshes. Clear those
      // cookies so the pre-shell sign-in route can render the revoked banner.
      await writeJson(derivedPath, clearClerkSessionCookies(baseState));
      return {
        storageStatePath: derivedPath,
        sessionStorageInit: bannerInitScript('revoked'),
      };
    case 'mfa-totp':
      // Same — the captured storage state already represents the post-TOTP
      // authenticated session. Written under the scenario key so the spec
      // doesn't need to know which base state was used. No banner init —
      // the MFA flow lands on the in-app shell, not the sign-in banner.
      await writeJson(derivedPath, baseState);
      return { storageStatePath: derivedPath };
    default: {
      const exhaustive: never = opts.mutator;
      throw new Error(`Unknown mentor-audit mutator: ${String(exhaustive)}`);
    }
  }
}
