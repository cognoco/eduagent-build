export const FEATURE_FLAGS = {
  // Subject onboarding fast path (spec 2026-05-05). Build-time only:
  // defaults to true everywhere. Set EXPO_PUBLIC_ONBOARDING_FAST_PATH=false
  // to disable in any environment. Doppler config changes require a new OTA
  // update or native build before live users see them.
  ONBOARDING_FAST_PATH:
    process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH === 'true' ||
    process.env.EXPO_PUBLIC_ONBOARDING_FAST_PATH !== 'false',
  COACH_BAND_ENABLED: true,
  MIC_IN_PILL_ENABLED: true,
  // Live multi-language pipeline (docs/_archive/plans/done/2026-05-03-llm-powered-i18n.md).
  // When true:
  //   - i18n/index.ts resolves device locale → one of the 7 target languages
  //     and calls i18next.changeLanguage(); when false, app stays pinned to
  //     English regardless of device settings.
  //   - more.tsx: shows the App-language picker row.
  I18N_ENABLED: true,
} as const;
