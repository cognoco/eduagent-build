export function normalizeRedirectPath(
  value: string | undefined,
  fallback = '/home',
): string {
  const safeFallback = fallback.startsWith('/') ? fallback : '/home';

  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return safeFallback;
  }

  const normalized = value.replace(/\/\([^/]+\)/g, '') || safeFallback;
  return normalized.startsWith('/') ? normalized : safeFallback;
}

export function toInternalAppRedirectPath(
  value: string | undefined,
  fallback = '/(app)/home',
): string {
  const normalized = normalizeRedirectPath(value, '/home');
  const target = normalized === '/' ? '/home' : normalized;

  return target.startsWith('/(app)/') ? target : `/(app)${target}`;
}

export function readWebSearchParam(name: string): string | null {
  const win = (
    globalThis as {
      window?: { location?: { search?: string } };
    }
  ).window;

  if (typeof win?.location?.search !== 'string') {
    return null;
  }

  try {
    return new URLSearchParams(win.location.search).get(name);
  } catch {
    return null;
  }
}
