import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FEATURE_FLAGS } from '../lib/feature-flags';

import en from './locales/en.json';

// Locked to ['en'] until LLM translation lands. The 6 placeholder locale
// JSONs (nb/de/es/pt/pl/ja) were byte-identical English clones — shipping
// them would mislead users who pick their device language and see English.
// `scripts/translate.ts` regenerates the missing files when run; once a
// locale has real content, add it back here AND to the resources object
// below in lockstep.
export const SUPPORTED_LANGUAGES = ['en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<
  SupportedLanguage,
  { english: string; native: string }
> = {
  en: { english: 'English', native: 'English' },
};

const LANGUAGE_STORAGE_KEY = 'app-ui-language';

export async function getStoredLanguage(): Promise<string | null> {
  return AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
}

export async function setStoredLanguage(
  lang: SupportedLanguage
): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

export async function clearStoredLanguage(): Promise<void> {
  await AsyncStorage.removeItem(LANGUAGE_STORAGE_KEY);
  // Without changeLanguage(), i18next keeps using whatever locale was active
  // before the reset, so the UI doesn't actually revert until the next app
  // start. Force the in-memory locale back to English so settings reset has
  // an immediate visible effect.
  await i18next.changeLanguage('en');
}

function getDeviceLanguage(): string {
  const locales = Localization.getLocales();
  const tag = locales[0]?.languageTag ?? 'en';
  return tag.split('-')[0] ?? 'en';
}

export function resolveLanguage(
  stored: string | null,
  deviceLang: string
): SupportedLanguage {
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored as SupportedLanguage;
  }
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(deviceLang)) {
    return deviceLang as SupportedLanguage;
  }
  return 'en';
}

const initPromise = (async () => {
  let resolved: SupportedLanguage = 'en';
  if (FEATURE_FLAGS.I18N_ENABLED) {
    try {
      const stored = await getStoredLanguage();
      const deviceLang = getDeviceLanguage();
      resolved = resolveLanguage(stored, deviceLang);
    } catch {
      resolved = 'en';
    }
  }
  await i18next.use(initReactI18next).init({
    lng: resolved,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
    },
    interpolation: { escapeValue: false },
  });
})();

/**
 * Awaitable handle to the in-flight i18n init. App root MUST await before
 * rendering useTranslation() trees, or non-English users see flash-of-English.
 */
export function ensureI18nReady(): Promise<void> {
  return initPromise;
}

i18next.on('languageChanged', (lang) => {
  // Per-component accessibilityLanguage propagation deferred — TODO: full
  // screen-reader locale wiring for TalkBack/VoiceOver.
  if (__DEV__) console.log(`[i18n] languageChanged → ${lang}`);
});

export { i18next };
