/**
 * Formats the source line for a bookmark card.
 * Returns "Saved from chat · {Month Day}" — optionally suffixed with the
 * subject or topic title when present, so the row is scannable on screens
 * that mix bookmarks from multiple subjects.
 */
export function formatBookmarkSourceLine(input: {
  createdAt: string;
  subjectName?: string | null;
  topicTitle?: string | null;
}): string {
  const monthDay = new Date(input.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const context = input.topicTitle ?? input.subjectName ?? null;
  return context
    ? `Saved from chat · ${monthDay} · ${context}`
    : `Saved from chat · ${monthDay}`;
}
