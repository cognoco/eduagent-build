// [AUTH-11] Persist the session-expired marker in sessionStorage on web so a
// module-level state reset (Clerk-driven navigation, fast-refresh, or any
// other re-evaluation between markSessionExpired() in _layout.tsx's 401
// handler and peekSessionExpiredNotice() in sign-in.tsx's mount effect)
// cannot silently drop the notice. Native targets fall through to the
// in-memory marker — SecureStore is unnecessary for a 5-minute window.

const STORAGE_KEY = 'mentomate_session_expired_at';
const EXPIRY_NOTICE_WINDOW_MS = 5 * 60_000;

let _sessionExpiredAt: number | null = null;

type WebStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getStorage(): WebStorage | null {
  const storage = (globalThis as { sessionStorage?: WebStorage })
    .sessionStorage;
  return storage ?? null;
}

function writeToStorage(timestamp: number | null): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (timestamp == null) {
      storage.removeItem(STORAGE_KEY);
    } else {
      storage.setItem(STORAGE_KEY, String(timestamp));
    }
  } catch {
    // sessionStorage can throw under quota/permission errors (e.g. private
    // browsing). The in-memory marker is the fallback source of truth.
  }
}

function readFromStorage(): number | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function markSessionExpired(): void {
  _sessionExpiredAt = Date.now();
  writeToStorage(_sessionExpiredAt);
}

export function consumeSessionExpiredNotice(): boolean {
  const shouldShow = peekSessionExpiredNotice();
  _sessionExpiredAt = null;
  writeToStorage(null);
  return shouldShow;
}

export function peekSessionExpiredNotice(): boolean {
  if (_sessionExpiredAt == null) {
    _sessionExpiredAt = readFromStorage();
  }
  if (
    _sessionExpiredAt &&
    Date.now() - _sessionExpiredAt < EXPIRY_NOTICE_WINDOW_MS
  ) {
    return true;
  }

  _sessionExpiredAt = null;
  writeToStorage(null);
  return false;
}

export function clearSessionExpiredNotice(): void {
  _sessionExpiredAt = null;
  writeToStorage(null);
}
