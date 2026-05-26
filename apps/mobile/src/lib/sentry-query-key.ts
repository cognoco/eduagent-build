export function getSentryQueryKeyTag(queryKey: unknown): string {
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    return 'unknown';
  }

  const [firstSegment] = queryKey;
  if (typeof firstSegment === 'string' && firstSegment.trim().length > 0) {
    return firstSegment;
  }
  if (typeof firstSegment === 'number' || typeof firstSegment === 'boolean') {
    return String(firstSegment);
  }

  return 'unknown';
}
