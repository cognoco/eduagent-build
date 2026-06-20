export const FEATURE_FLAGS = {
  COACH_BAND_ENABLED: true,
  MIC_IN_PILL_ENABLED: true,
  // Live multi-language pipeline (docs/_archive/plans/done/2026-05-03-llm-powered-i18n.md).
  // When true:
  //   - i18n/index.ts resolves device locale → one of the 7 target languages
  //     and calls i18next.changeLanguage(); when false, app stays pinned to
  //     English regardless of device settings.
  //   - more.tsx: shows the App-language picker row.
  I18N_ENABLED: true,
  // Pre-signup intent + post-signup save wizard.
  // Spec: docs/specs/2026-05-18-trial-intent-save-onboarding-v0.md
  // When false:
  //   - sign-in.tsx: "Try MentoMate" CTA hidden, /preview/* unreachable via UI.
  //   - (app)/_layout.tsx: no-profile gate ignores preview state, falls through to CreateProfileGate.
  //   - (app)/_layout.tsx: preview/save tab entry not registered (defensive; route is unreachable anyway).
  // isFamilyCapableProfile() and the mentomate_preview_intent entry in sign-out-cleanup ship UNCONDITIONALLY.
  PREVIEW_ONBOARDING_ENABLED: true,

  // Narrow gate for the "Try MentoMate" entry CTA on the sign-in screen. The
  // CTA is only meaningful when the preview engine is also enabled, and the
  // pre-auth welcome flow (docs/plans/2026-05-27-pre-auth-welcome-flow.md)
  // makes the main front door the welcome cards + LightBulb bridge — not the
  // preview demo. Keep the engine alive (PREVIEW_ONBOARDING_ENABLED:true) so
  // existing deep-links + the SaveWizard handoff still function, but hide
  // the visible CTA by default. Sign-in renders the CTA only when BOTH flags
  // are on:  PREVIEW_ONBOARDING_ENABLED && PREVIEW_ENTRY_CTA_ENABLED.
  PREVIEW_ENTRY_CTA_ENABLED: false,

  MODE_NAV_V0_ENABLED: process.env.EXPO_PUBLIC_ENABLE_MODE_NAV === 'true',
  MODE_NAV_V1_ENABLED: process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V1 === 'true',
  MODE_NAV_V2_ENABLED: process.env.EXPO_PUBLIC_ENABLE_MODE_NAV_V2 === 'true',

  // [OPT-C] Independent adult-owner gate flag — toggles the 18+ requirement
  // for a parent creating a child profile. Defense-in-depth: paired with the
  // API-side ADULT_OWNER_GATE_ENABLED config (apps/api/src/config.ts).
  //
  // When false:
  //   - save.tsx ProfileBasicsStep: the adult-age UI gate is bypassed.
  //     `canSubmit` falls back to today's behaviour (only the existing
  //     display-name + valid-4-digit-year checks; no adult-age check).
  //     The `save-basics-adult-required` warning view is not rendered.
  //   - With this flag OFF and the API flag also OFF, the system is
  //     identical to today (no adult-age constraint exists anywhere).
  //
  // This flag is INDEPENDENT of PREVIEW_ONBOARDING_ENABLED. The preview
  // feature can ship while the adult-owner gate stays off (or vice versa).
  ADULT_OWNER_GATE_ENABLED: true,
} as const;
