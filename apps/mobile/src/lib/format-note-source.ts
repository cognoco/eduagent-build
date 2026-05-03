import type { NoteResponse } from '@eduagent/schemas';

/**
 * Formats the source line for a note card.
 * Returns "From session · {Month Day}" for session-linked notes,
 * or "Note · {Month Day}" for standalone notes.
 */
export function formatSourceLine(note: NoteResponse): string {
  const date = new Date(note.createdAt);
  const monthDay = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return note.sessionId ? `From session · ${monthDay}` : `Note · ${monthDay}`;
}
