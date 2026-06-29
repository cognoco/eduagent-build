import { paginateRows } from './pagination';

describe('paginateRows', () => {
  type Row = { id: string; value: number };

  const makeRows = (count: number): Row[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `id-${i + 1}`,
      value: i + 1,
    }));

  it('returns empty page and null cursor for empty rows', () => {
    const result = paginateRows([], 10);
    expect(result.page).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('returns all rows and null cursor when rows < limit', () => {
    const rows = makeRows(3);
    const result = paginateRows(rows, 5);
    expect(result.page).toEqual(rows);
    expect(result.nextCursor).toBeNull();
  });

  it('returns all rows and null cursor when rows === limit (no extra row)', () => {
    const rows = makeRows(5);
    const result = paginateRows(rows, 5);
    expect(result.page).toEqual(rows);
    expect(result.nextCursor).toBeNull();
  });

  it('trims to limit and sets nextCursor to last kept row id when rows === limit + 1', () => {
    const rows = makeRows(6); // limit=5, fetched limit+1=6
    const result = paginateRows(rows, 5);
    expect(result.page).toHaveLength(5);
    expect(result.page).toEqual(rows.slice(0, 5));
    // cursor is the id of the last row kept (5th row, id-5)
    expect(result.nextCursor).toBe('id-5');
  });

  it('does not mutate the input array', () => {
    const rows = makeRows(4);
    const original = [...rows];
    paginateRows(rows, 3);
    expect(rows).toEqual(original);
  });
});
