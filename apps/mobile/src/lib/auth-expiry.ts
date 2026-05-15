let _sessionExpiredAt: number | null = null;

const EXPIRY_NOTICE_WINDOW_MS = 5 * 60_000;

export function markSessionExpired(): void {
  _sessionExpiredAt = Date.now();
}

export function consumeSessionExpiredNotice(): boolean {
  const shouldShow = peekSessionExpiredNotice();
  _sessionExpiredAt = null;
  return shouldShow;
}

export function peekSessionExpiredNotice(): boolean {
  if (
    _sessionExpiredAt &&
    Date.now() - _sessionExpiredAt < EXPIRY_NOTICE_WINDOW_MS
  ) {
    return true;
  }

  _sessionExpiredAt = null;
  return false;
}

export function clearSessionExpiredNotice(): void {
  _sessionExpiredAt = null;
}
