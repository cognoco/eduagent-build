export function getSentryQueryKeyTag(queryKey: unknown): string {
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    return 'unknown';
  }

  for (const segment of queryKey) {
    if (typeof segment !== 'string') continue;
    const value = segment.trim();
    if (!value) continue;
    if (isLikelyIdentifier(value)) continue;
    return value;
  }

  return 'unknown';
}

function isLikelyIdentifier(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ) ||
    /^\d+$/.test(value) ||
    (/^[A-Za-z0-9_-]{20,}$/.test(value) && /\d/.test(value))
  );
}
