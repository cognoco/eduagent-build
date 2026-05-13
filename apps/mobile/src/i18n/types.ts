import 'i18next';
import type { ParseKeys, TFunction } from 'i18next';
import type en from './locales/en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}

export type TranslateKey = ParseKeys;
export type Translate = TFunction<'translation', undefined>;
