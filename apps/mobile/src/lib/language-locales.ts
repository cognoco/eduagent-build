const LANGUAGE_LOCALES: Record<string, string> = {
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
  nb: 'nb-NO',
  sv: 'sv-SE',
  da: 'da-DK',
  ro: 'ro-RO',
  de: 'de-DE',
  id: 'id-ID',
  ms: 'ms-MY',
  sw: 'sw-TZ',
};

export function getVoiceLocaleForLanguage(
  languageCode?: string | null,
): string {
  if (!languageCode) {
    return 'en-US';
  }

  return LANGUAGE_LOCALES[languageCode] ?? 'en-US';
}
