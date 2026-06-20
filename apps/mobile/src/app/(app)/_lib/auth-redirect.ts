import { Platform } from 'react-native';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';
import { toInternalAppRedirectPath } from '../../../lib/normalize-redirect-path';

export function getPostAuthDefaultPath(): string {
  return FEATURE_FLAGS.MODE_NAV_V2_ENABLED ? '/(app)/mentor' : '/(app)/home';
}

export function resolveAuthRedirectPath(pathname: string | undefined): string {
  if (Platform.OS === 'web') {
    // Access window via globalThis to avoid TS DOM-lib requirement in RN tsconfig.
    const win = (
      globalThis as {
        window?: { location?: { pathname?: string; search?: string } };
      }
    ).window;
    if (typeof win?.location?.pathname === 'string') {
      // [BUG-766] Concatenate search so a hard-reload at e.g.
      // /child/{id}?mode=progress preserves `?mode=progress` through the
      // sign-in redirect round-trip; previously `pathname` alone dropped the
      // query, landing the user on the child detail with no mode filter.
      const search =
        typeof win.location.search === 'string' ? win.location.search : '';
      return toInternalAppRedirectPath(
        `${win.location.pathname}${search}`,
        getPostAuthDefaultPath(),
      );
    }
  }

  return toInternalAppRedirectPath(pathname, getPostAuthDefaultPath());
}
