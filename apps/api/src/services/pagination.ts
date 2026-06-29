/**
 * Shared cursor-based pagination helper.
 *
 * Callers must query `limit + 1` rows so this function can detect whether a
 * next page exists. The extra row is sliced off before the page is returned.
 *
 * @param rows   Raw query result (length up to limit + 1).
 * @param limit  Page size requested by the caller.
 * @returns      `page` capped to `limit` rows and a `nextCursor` pointing at
 *               the last item's id, or null when no further pages exist.
 */
export function paginateRows<T extends { id: string }>(
  rows: T[],
  limit: number,
): { page: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    page,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}
