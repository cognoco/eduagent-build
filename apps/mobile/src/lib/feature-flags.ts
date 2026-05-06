export const FEATURE_FLAGS = {
  // Subject onboarding fast path (spec 2026-05-05). Build-time only:
  // enabled for dev/staging unless explicitly disabled, false in production.
  ONBOARDING_FAST_PATH:
    process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH === 'true' ||
    (process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH !== 'false' &&
      process.env.NODE_ENV !== 'production'),
  COACH_BAND_ENABLED: true,
  MIC_IN_PILL_ENABLED: true,
  // Live multi-language pipeline (docs/_archive/plans/done/2026-05-03-llm-powered-i18n.md).
  // When true:
  //   - i18n/index.ts resolves device locale → one of the 7 target languages
  //     and calls i18next.changeLanguage(); when false, app stays pinned to
  //     English regardless of device settings.
  //   - hooks/use-conversation-language-suggest.ts: enables the in-app
  //     suggest-language banner.
  //   - more.tsx: shows the App-language picker row.
  //   - onboarding/language-picker.tsx: enables the post-save prompt to
  //     swap the app interface to the picked mentor language.
  I18N_ENABLED: true,
} as const;
