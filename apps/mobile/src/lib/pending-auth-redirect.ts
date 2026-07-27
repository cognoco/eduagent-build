import { toInternalAppRedirectPath } from './normalize-redirect-path';

const PENDING_AUTH_REDIRECT_KEY = 'mentomate_pending_auth_redirect';
const PENDING_AUTH_REDIRECT_TTL_MS = 5 * 60_000;

interface PendingAuthRedirectRecord {
  path: string;
  savedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let pendingAuthRedirectRecord: PendingAuthRedirectRecord | null = null;

function getSessionStorage(): StorageLike | null {
  const win = (
    globalThis as {
      window?: { sessionStorage?: StorageLike };
    }
  ).window;

  return win?.sessionStorage ?? null;
}

function isFreshRecord(
  record: PendingAuthRedirectRecord | null,
): record is PendingAuthRedirectRecord {
  return !!record && Date.now() - record.savedAt < PENDING_AUTH_REDIRECT_TTL_MS;
}

function writeSessionRecord(record: PendingAuthRedirectRecord | null): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    if (record) {
      storage.setItem(PENDING_AUTH_REDIRECT_KEY, JSON.stringify(record));
      return;
    }

    storage.removeItem(PENDING_AUTH_REDIRECT_KEY);
  } catch {
    // sessionStorage can throw in privacy-constrained browsers; memory fallback
    // is enough for the current runtime.
  }
}

function readSessionRecord(): PendingAuthRedirectRecord | null {
  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(PENDING_AUTH_REDIRECT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingAuthRedirectRecord>;
    if (typeof parsed.path !== 'string' || typeof parsed.savedAt !== 'number') {
      storage.removeItem(PENDING_AUTH_REDIRECT_KEY);
      return null;
    }

    const record: PendingAuthRedirectRecord = {
      path: toInternalAppRedirectPath(parsed.path),
      savedAt: parsed.savedAt,
    };

    if (!isFreshRecord(record)) {
      storage.removeItem(PENDING_AUTH_REDIRECT_KEY);
      return null;
    }

    return record;
  } catch {
    storage.removeItem(PENDING_AUTH_REDIRECT_KEY);
    return null;
  }
}

export function rememberPendingAuthRedirect(path: string): string {
  const record: PendingAuthRedirectRecord = {
    path: toInternalAppRedirectPath(path),
    savedAt: Date.now(),
  };

  pendingAuthRedirectRecord = record;
  writeSessionRecord(record);
  return record.path;
}

export function peekPendingAuthRedirect(): string | null {
  if (isFreshRecord(pendingAuthRedirectRecord)) {
    return pendingAuthRedirectRecord.path;
  }

  pendingAuthRedirectRecord = readSessionRecord();
  return pendingAuthRedirectRecord?.path ?? null;
}

export function clearPendingAuthRedirect(): void {
  pendingAuthRedirectRecord = null;
  writeSessionRecord(null);
}

/**
 * Dev/E2E only. Writes a pending-redirect record whose `savedAt` is
 * artificially backdated by `staleMs` milliseconds, so callers can
 * simulate a TTL-expired record without waiting.
 *
 * Throws unless the dedicated E2E bundle flag is enabled. Native CI uses a
 * release-mode bundle, so NODE_ENV alone cannot distinguish it from a store
 * build; production/store bundles keep EXPO_PUBLIC_E2E unset.
 */
export function seedPendingAuthRedirectForTesting(
  path: string,
  staleMs: number,
): void {
  if (process.env.EXPO_PUBLIC_E2E !== 'true') {
    // [BUG-324] Spell out the required flag so the developer/CI operator
    // hitting this guard knows exactly what's missing — the original
    // A vague test-only message left operators guessing which build flag was
    // missing, so name the sole release-E2E authorization explicitly.
    throw new Error(
      'seedPendingAuthRedirectForTesting is E2E-only — requires EXPO_PUBLIC_E2E=true',
    );
  }

  const record: PendingAuthRedirectRecord = {
    path: toInternalAppRedirectPath(path),
    savedAt: Date.now() - staleMs,
  };

  pendingAuthRedirectRecord = record;
  writeSessionRecord(record);
}
