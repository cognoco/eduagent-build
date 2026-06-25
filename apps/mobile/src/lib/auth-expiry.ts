// [AUTH-11] Persist the session-expired marker in sessionStorage on web so a
// module-level state reset (Clerk-driven navigation, fast-refresh, or any
// other re-evaluation between markSessionExpired() in _layout.tsx's 401
// handler and peekSessionExpiredNotice() in sign-in.tsx's mount effect)
// cannot silently drop the notice. Native targets fall through to the
// in-memory marker — SecureStore is unnecessary for a 5-minute window.
//
// [BUG-779/780] A revoked-session variant lives alongside the expired one so
// the sign-in screen can show distinct banner copy + testID for forced
// sign-outs that originated from a server-side session revocation
// (vs. a client-side token expiry). Both notices share the same five-minute
// window and the same peek/consume/clear lifecycle.

import {
  AUTH_EXPIRY_EXPIRED_STORAGE_KEY as EXPIRED_STORAGE_KEY,
  AUTH_EXPIRY_REVOKED_STORAGE_KEY as REVOKED_STORAGE_KEY,
} from './secure-store-keys';

const EXPIRY_NOTICE_WINDOW_MS = 5 * 60_000;

let _sessionExpiredAt: number | null = null;
let _sessionRevokedAt: number | null = null;

type WebStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorage(): WebStorage | null {
  const storage = (globalThis as { sessionStorage?: WebStorage })
    .sessionStorage;
  return storage ?? null;
}

function writeToStorage(key: string, timestamp: number | null): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (timestamp == null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, String(timestamp));
    }
  } catch {
    // sessionStorage can throw under quota/permission errors (e.g. private
    // browsing). The in-memory marker is the fallback source of truth.
  }
}

function readFromStorage(key: string): number | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Expired notice
// ---------------------------------------------------------------------------

export function markSessionExpired(): void {
  _sessionExpiredAt = Date.now();
  writeToStorage(EXPIRED_STORAGE_KEY, _sessionExpiredAt);
}

export function consumeSessionExpiredNotice(): boolean {
  const shouldShow = peekSessionExpiredNotice();
  _sessionExpiredAt = null;
  writeToStorage(EXPIRED_STORAGE_KEY, null);
  return shouldShow;
}

export function peekSessionExpiredNotice(): boolean {
  if (_sessionExpiredAt == null) {
    _sessionExpiredAt = readFromStorage(EXPIRED_STORAGE_KEY);
  }
  if (
    _sessionExpiredAt &&
    Date.now() - _sessionExpiredAt < EXPIRY_NOTICE_WINDOW_MS
  ) {
    return true;
  }

  _sessionExpiredAt = null;
  writeToStorage(EXPIRED_STORAGE_KEY, null);
  return false;
}

export function clearSessionExpiredNotice(): void {
  _sessionExpiredAt = null;
  writeToStorage(EXPIRED_STORAGE_KEY, null);
}

// ---------------------------------------------------------------------------
// Revoked notice — [BUG-780] mirrors the expired notice but signals a
// server-side session revocation rather than a client-side token expiry.
// Kept as a separate state so the sign-in screen can render distinct copy +
// testID instead of conflating the two causes.
// ---------------------------------------------------------------------------

export function markSessionRevoked(): void {
  _sessionRevokedAt = Date.now();
  writeToStorage(REVOKED_STORAGE_KEY, _sessionRevokedAt);
}

export function consumeSessionRevokedNotice(): boolean {
  const shouldShow = peekSessionRevokedNotice();
  _sessionRevokedAt = null;
  writeToStorage(REVOKED_STORAGE_KEY, null);
  return shouldShow;
}

export function peekSessionRevokedNotice(): boolean {
  if (_sessionRevokedAt == null) {
    _sessionRevokedAt = readFromStorage(REVOKED_STORAGE_KEY);
  }
  if (
    _sessionRevokedAt &&
    Date.now() - _sessionRevokedAt < EXPIRY_NOTICE_WINDOW_MS
  ) {
    return true;
  }

  _sessionRevokedAt = null;
  writeToStorage(REVOKED_STORAGE_KEY, null);
  return false;
}

export function clearSessionRevokedNotice(): void {
  _sessionRevokedAt = null;
  writeToStorage(REVOKED_STORAGE_KEY, null);
}

// Storage keys are exported so Playwright `addInitScript` (and any other
// test harness that needs to seed the marker before the app boots) can
// reference them without duplicating string literals. Exporting from a
// single module keeps the production code and the test fixtures aligned.
// Key strings are defined in `secure-store-keys.ts` (WI-1090).
export const AUTH_EXPIRY_STORAGE_KEYS = {
  expired: EXPIRED_STORAGE_KEY,
  revoked: REVOKED_STORAGE_KEY,
} as const;
