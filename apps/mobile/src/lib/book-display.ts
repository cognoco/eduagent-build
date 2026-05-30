/**
 * Some books carry a tautological description that just echoes the title —
 * e.g. "Learn about The Middle Ages" for a book titled "The Middle Ages".
 * This came from the filing fallback path (fixed at the source in
 * `apps/api/src/services/filing.ts`), but books created before that fix still
 * have the stored description, and a future LLM response could echo the title
 * too. Rendering it adds a redundant line under the heading.
 *
 * Returns the description to display, or `null` when it is empty or merely
 * repeats the title — so callers render nothing in that case.
 */
export function displayBookDescription(
  title: string,
  description?: string | null,
): string | null {
  const desc = description?.trim();
  if (!desc) return null;

  const normalizedTitle = title.trim().toLowerCase();
  const normalizedDesc = desc.toLowerCase();

  if (normalizedDesc === normalizedTitle) return null;
  if (normalizedDesc === `learn about ${normalizedTitle}`) return null;

  return desc;
}
