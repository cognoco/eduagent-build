export function normalizeRedirectPath(
  value: string | undefined,
  fallback = '/home'
): string {
  const safeFallback = fallback.startsWith('/') ? fallback : '/home';

  if (!value || !value.startsWith('/')) {
    return safeFallback;
  }

  const normalized = value.replace(/\/\([^/]+\)/g, '') || safeFallback;
  return normalized.startsWith('/') ? normalized : safeFallback;
}
