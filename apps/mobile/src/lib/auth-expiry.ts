let _sessionExpiredAt: number | null = null;

const EXPIRY_NOTICE_WINDOW_MS = 60_000;

export function markSessionExpired(): void {
  _sessionExpiredAt = Date.now();
}

export function consumeSessionExpiredNotice(): boolean {
  if (
    _sessionExpiredAt &&
    Date.now() - _sessionExpiredAt < EXPIRY_NOTICE_WINDOW_MS
  ) {
    _sessionExpiredAt = null;
    return true;
  }

  _sessionExpiredAt = null;
  return false;
}

export function clearSessionExpiredNotice(): void {
  _sessionExpiredAt = null;
}
