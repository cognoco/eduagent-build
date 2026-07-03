export function isLocalHour9ForTimezone(
  timezone: string | null,
  nowUtc: Date,
): boolean {
  if (!timezone) return nowUtc.getUTCHours() === 9;
  try {
    const localTimeStr = nowUtc.toLocaleString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(localTimeStr, 10) === 9;
  } catch {
    return nowUtc.getUTCHours() === 9;
  }
}
