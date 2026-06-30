/**
 * Pauses execution for the given number of milliseconds.
 * Shared by session-crud, transient-db-retry, and test-seed;
 * consolidated from three identical file-private copies (WI-812).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
