/**
 * Returns YYYY-MM-DD in the device's local timezone.
 *
 * Convention: client-side "local date" strings (dictation, quiz grouping) are
 * computed with local Date components, not UTC. `new Date().toISOString().slice(0,10)`
 * returns the UTC date, which can be a different calendar day from the device's
 * local date for users west of UTC around midnight. This helper uses
 * `getFullYear / getMonth / getDate` to extract local components correctly.
 *
 * Note: streak/quiz days may shift for users previously near-midnight UTC —
 * that is the CORRECT behavior after this fix.
 */
export function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
