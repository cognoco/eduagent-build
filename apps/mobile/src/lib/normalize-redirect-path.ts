export function normalizeRedirectPath(
  value: string | undefined,
  fallback = '/home',
): string {
  const safeFallback = fallback.startsWith('/') ? fallback : '/home';

  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return safeFallback;
  }

  // [BUG-766] Split off query string + hash so the route-group strip below
  // does not corrupt them, and so the query string survives all
  // pendingAuthRedirect round-trips (sign-in → replay). Hash carries no
  // server semantics for the app today but is preserved defensively.
  const queryIndex = value.search(/[?#]/);
  const pathPart = queryIndex === -1 ? value : value.slice(0, queryIndex);
  const suffix = queryIndex === -1 ? '' : value.slice(queryIndex);

  const normalizedPath = pathPart.replace(/\/\([^/]+\)/g, '') || safeFallback;
  if (!normalizedPath.startsWith('/')) {
    return safeFallback;
  }

  return `${normalizedPath}${suffix}`;
}

export function toInternalAppRedirectPath(
  value: string | undefined,
  fallback = '/(app)/home',
): string {
  const normalized = normalizeRedirectPath(value, '/home');
  // [BUG-766] Separate suffix so the route-group prefix wraps the path only.
  const queryIndex = normalized.search(/[?#]/);
  const pathPart =
    queryIndex === -1 ? normalized : normalized.slice(0, queryIndex);
  const suffix = queryIndex === -1 ? '' : normalized.slice(queryIndex);
  const target = pathPart === '/' ? '/home' : pathPart;

  const prefixed = target.startsWith('/(app)/') ? target : `/(app)${target}`;
  return `${prefixed}${suffix}`;
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
