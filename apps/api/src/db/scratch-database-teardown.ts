import type { Pool } from 'pg';

interface ClosePoolAndDropScratchDatabaseOptions {
  adminPool: Pick<Pool, 'query'>;
  scratchPool: Pick<Pool, 'end'> | undefined;
  databaseName: string;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
}

export async function closePoolAndDropScratchDatabase({
  adminPool,
  scratchPool,
  databaseName,
  timeoutMs = 10_000,
  now = Date.now,
  sleep = (delayMs) =>
    new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
}: ClosePoolAndDropScratchDatabaseOptions): Promise<void> {
  await scratchPool?.end();
  const deadline = now() + timeoutMs;

  while (true) {
    const result = await adminPool.query<{ connection_count: string }>(
      `SELECT count(*) AS connection_count
       FROM pg_stat_activity
       WHERE datname = $1`,
      [databaseName],
    );
    if (Number(result.rows[0]?.connection_count ?? 0) === 0) break;
    if (now() >= deadline) {
      throw new Error(
        `Timed out waiting for connections to close for scratch database "${databaseName}"`,
      );
    }
    await sleep(25);
  }

  const quotedDatabaseName = `"${databaseName.replaceAll('"', '""')}"`;
  await adminPool.query(`DROP DATABASE IF EXISTS ${quotedDatabaseName}`);
}
