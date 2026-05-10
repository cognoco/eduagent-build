// [BUG-930] Vocabulary quiz rounds carry only `theme` (e.g. "Italian Animals")
// in the persisted history payload — there's no language column on
// quiz_rounds yet (see BUG-926 for the parallel aggregation gap). Until the
// schema gains a real `languageCode`, the most reliable client-side hint
// for "which language was this round in?" is to detect a known language
// name at the start of the theme string.
//
// We mirror SUPPORTED_LANGUAGES from apps/api/src/data/languages.ts here
// rather than reaching across the monorepo boundary — the data is small,
// rarely-changing, and apps/mobile already cannot import from apps/api.
//
// If no known language is detected at the start of theme, callers should
// fall back to the activity-only label so we never invent a language the
// learner didn't actually study.

const KNOWN_LANGUAGE_CODES = [
  'es',
  'fr',
  'it',
  'pt',
  'nl',
  'nb',
  'sv',
  'da',
  'ro',
  'de',
  'id',
  'ms',
  'sw',
] as const;

// Static aliases for languages whose canonical name diverges from
// `Intl.DisplayNames` output. Keys are case-insensitive matches against the
// theme prefix; values are the display name we want to render in the UI.
const ALIAS_TO_DISPLAY: Record<string, string> = {
  // Locale aliases — match if the curriculum LLM emitted theme in target
  // language ("Italiano Animali") rather than English ("Italian Animals").
  italiano: 'Italian',
  espanol: 'Spanish',
  español: 'Spanish',
  castellano: 'Spanish',
  francais: 'French',
  français: 'French',
  portugues: 'Portuguese',
  português: 'Portuguese',
  deutsch: 'German',
};

function getDisplayName(code: string): string | null {
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'language' }).of(
        code.toLowerCase(),
      ) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * If `theme` begins with the display name of any supported language
 * (case-insensitive), returns the canonical display name. Otherwise null.
 *
 * The match boundary is a whitespace character so "Italiana" doesn't
 * spuriously match "Italian"; an exact full-string theme of just the
 * language name (no suffix) also matches because the trailing boundary
 * is end-of-string.
 */
export function extractLanguageFromTheme(
  theme: string | null | undefined,
): string | null {
  if (!theme) return null;
  const trimmed = theme.trim();
  if (trimmed.length === 0) return null;

  const candidates: Array<{ alias: string; display: string }> = [];

  for (const code of KNOWN_LANGUAGE_CODES) {
    const display = getDisplayName(code);
    if (display) {
      candidates.push({ alias: display, display });
    }
  }
  for (const [alias, display] of Object.entries(ALIAS_TO_DISPLAY)) {
    candidates.push({ alias, display });
  }

  // Longest-first so "Brazilian Portuguese" beats "Portuguese" if both ever
  // appear in the candidate set. Stable behaviour even if Intl.DisplayNames
  // returns longer strings on a future runtime.
  candidates.sort((a, b) => b.alias.length - a.alias.length);

  const lowered = trimmed.toLowerCase();
  for (const { alias, display } of candidates) {
    const aliasLower = alias.toLowerCase();
    if (lowered === aliasLower) return display;
    if (
      lowered.startsWith(aliasLower) &&
      /\s/.test(trimmed.charAt(aliasLower.length))
    ) {
      return display;
    }
  }
  return null;
}
