import type { Href, Router } from 'expo-router';

export function goBackOrReplace(
  router: Pick<Router, 'back' | 'canGoBack' | 'replace'>,
  fallbackHref: Href
): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(fallbackHref);
}
