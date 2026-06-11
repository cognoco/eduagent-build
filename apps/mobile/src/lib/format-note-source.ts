import type { NoteResponse } from '@eduagent/schemas';

/**
 * Formats the source line for a note card.
 * Returns "From session · {Month Day}" for session-linked notes,
 * or "Note · {Month Day}" for standalone notes.
 *
 * @param locale - The active i18n locale (e.g. i18n.language from useTranslation).
 *   Pass `undefined` to fall back to the device's default locale.
 */
export function formatSourceLine(
  note: NoteResponse,
  locale: string | undefined,
): string {
  const date = new Date(note.createdAt);
  const monthDay = date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });
  return note.sessionId ? `From session · ${monthDay}` : `Note · ${monthDay}`;
}
