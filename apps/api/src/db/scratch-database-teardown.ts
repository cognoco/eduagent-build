import type { Pool } from 'pg';

interface ClosePoolAndDropScratchDatabaseOptions {
  adminPool: Pick<Pool, 'query'>;
  scratchPool: Pick<Pool, 'end'> | undefined;
  databaseName: string;
  ownedApplicationName: string;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
}

export async function closePoolAndDropScratchDatabase({
  adminPool,
  scratchPool,
  databaseName,
  ownedApplicationName,
  timeoutMs = 30_000,
  now = Date.now,
  sleep = (delayMs) =>
    new Promise<void>((resolve) => setTimeout(resolve, delayMs)),
}: ClosePoolAndDropScratchDatabaseOptions): Promise<void> {
  await scratchPool?.end();
  const deadline = now() + timeoutMs;

  while (true) {
    const result = await adminPool.query<{
      pid: number;
      application_name: string;
      state: string | null;
      backend_type: string;
      client_addr: string | null;
      state_change: string | null;
    }>(
      `SELECT pid,
              application_name,
              state,
              backend_type,
              client_addr::text AS client_addr,
              state_change::text AS state_change
       FROM pg_stat_activity
       WHERE datname = $1
       ORDER BY pid`,
      [databaseName],
    );
    if (result.rows.length === 0) break;
    if (now() >= deadline) {
      const backends = result.rows.map((backend) => ({
        ...backend,
        ownership:
          backend.application_name === ownedApplicationName
            ? 'owned'
            : 'foreign',
      }));
      throw new Error(
        `Timed out waiting for connections to close for scratch database "${databaseName}". Lingering backends: ${JSON.stringify(backends)}`,
      );
    }
    await sleep(25);
  }

  const quotedDatabaseName = `"${databaseName.replaceAll('"', '""')}"`;
  await adminPool.query(`DROP DATABASE IF EXISTS ${quotedDatabaseName}`);
}
