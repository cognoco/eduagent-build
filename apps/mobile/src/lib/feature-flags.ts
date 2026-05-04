export const FEATURE_FLAGS = {
  COACH_BAND_ENABLED: true,
  MIC_IN_PILL_ENABLED: true,
  // Gates the live multi-language pipeline introduced by
  // docs/superpowers/plans/2026-05-03-llm-powered-i18n.md:
  //   - i18n/index.ts: when true, resolve the device locale into one of the
  //     six target languages and call i18next.changeLanguage(); when false,
  //     stay pinned to English regardless of device settings.
  //   - hooks/use-conversation-language-suggest.ts: dormant until true (the
  //     in-app suggestion banner is suppressed otherwise).
  //   - more.tsx: hides the user-facing language picker row + modal when false.
  // Flip to true once the launch markets' translations have shipped through
  // a full release cycle and the suggest-language flow has been validated.
  I18N_ENABLED: false,
} as const;
