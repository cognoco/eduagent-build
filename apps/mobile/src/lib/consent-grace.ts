export const GRACE_PERIOD_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getGracePeriodDaysRemaining(
  respondedAt: string | Date | null,
): number {
  if (!respondedAt) return 0;

  const responded =
    typeof respondedAt === 'string' ? new Date(respondedAt) : respondedAt;
  const expiresAt = responded.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY;
  const msLeft = expiresAt - Date.now();

  if (!Number.isFinite(expiresAt) || msLeft <= 0) return 0;
  return Math.ceil(msLeft / MS_PER_DAY);
}

export function isInGracePeriod(respondedAt: string | Date | null): boolean {
  return getGracePeriodDaysRemaining(respondedAt) > 0;
}
