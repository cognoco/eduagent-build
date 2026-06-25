/**
 * [#11] Hermes-safe date/time formatting.
 *
 * `Intl.DateTimeFormat` with `dateStyle`/`timeStyle` can THROW on React Native
 * (Hermes) builds that lack full ICU data. A thrown error inside a render path
 * crashes the whole subtree (e.g. the child-cap banner). These helpers guard
 * the call and fall back to a safe string instead of propagating the throw.
 */

/**
 * Format an ISO timestamp as a localized medium-date + short-time string,
 * falling back gracefully on invalid input or a missing ICU build.
 *
 * @returns the formatted string, the original value if it isn't a valid date,
 *   or a `toLocaleString`/ISO fallback if `Intl` throws.
 */
export function formatMediumDateTime(isoValue: string | undefined): string {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return isoValue;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    try {
      return date.toLocaleString();
    } catch {
      return date.toISOString();
    }
  }
}

export function formatShortDate(
  isoValue: string | Date | undefined,
  locale?: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!isoValue) return '';
  const date = isoValue instanceof Date ? isoValue : new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return typeof isoValue === 'string' ? isoValue : '';
  }
  const formatOptions = options ?? { dateStyle: 'medium' };
  try {
    return new Intl.DateTimeFormat(locale, formatOptions).format(date);
  } catch {
    try {
      return date.toLocaleDateString(locale, formatOptions);
    } catch {
      return date.toISOString();
    }
  }
}
