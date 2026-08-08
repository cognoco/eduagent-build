interface JournalBackRouter {
  canGoBack(): boolean;
  back(): void;
  replace(path: '/(app)/journal'): void;
}

export function navigateBackToJournal(router: JournalBackRouter): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/(app)/journal');
}
