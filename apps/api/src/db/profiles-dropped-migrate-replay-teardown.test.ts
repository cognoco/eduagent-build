import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { closePoolAndDropScratchDatabase } from './scratch-database-teardown';

describe('profiles-dropped migration replay teardown [WI-2755]', () => {
  it('waits for scratch connections to drain and drops without FORCE', () => {
    const source = readFileSync(
      join(__dirname, 'profiles-dropped-migrate-replay.integration.test.ts'),
      'utf8',
    );

    expect(source).toContain('await closePoolAndDropScratchDatabase({');
    expect(source).toContain('application_name: scratchApplicationName');
    expect(source).toContain('ownedApplicationName: scratchApplicationName');
    expect(source).not.toMatch(/DROP DATABASE[^`]*WITH \(FORCE\)/s);
  });

  it('attributes an owned backend, waits for it to drain, then drops normally', async () => {
    const events: string[] = [];
    const backendRows = [
      [
        {
          pid: 101,
          application_name: 'wi1167-replay-owned',
          state: 'idle',
          backend_type: 'client backend',
          client_addr: '127.0.0.1',
          state_change: '2026-07-26T15:00:00.000Z',
        },
      ],
      [],
    ];
    const query = jest.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes('pg_stat_activity')) {
        expect(values).toEqual(['wi2755_replay_test']);
        expect(sql).toContain('application_name');
        expect(sql).toContain('backend_type');
        expect(sql).toContain('client_addr');
        expect(sql).toContain('state_change');
        const rows = backendRows.shift() ?? [];
        events.push(`connections:${rows.length}`);
        return { rows };
      }
      events.push('drop');
      expect(sql).toBe('DROP DATABASE IF EXISTS "wi2755_replay_test"');
      expect(values).toBeUndefined();
      return { rows: [] };
    });
    const end = jest.fn(async () => {
      events.push('pool:end');
    });
    const sleep = jest.fn(async () => {
      events.push('sleep');
    });

    await closePoolAndDropScratchDatabase({
      adminPool: { query } as unknown as Pick<Pool, 'query'>,
      scratchPool: { end } as unknown as Pick<Pool, 'end'>,
      databaseName: 'wi2755_replay_test',
      ownedApplicationName: 'wi1167-replay-owned',
      sleep,
    });

    expect(events).toEqual([
      'pool:end',
      'connections:1',
      'sleep',
      'connections:0',
      'drop',
    ]);
  });

  it('attributes a foreign backend for the full bound and preserves the database', async () => {
    const query = jest.fn(async (sql: string) => {
      expect(sql).toContain('pg_stat_activity');
      return {
        rows: [
          {
            pid: 202,
            application_name: 'foreign-worker',
            state: 'idle in transaction',
            backend_type: 'client backend',
            client_addr: '10.0.0.8',
            state_change: '2026-07-26T15:01:00.000Z',
          },
        ],
      };
    });
    const nowValues = [0, 9, 10];

    await expect(
      closePoolAndDropScratchDatabase({
        adminPool: { query } as unknown as Pick<Pool, 'query'>,
        scratchPool: {
          end: jest.fn().mockResolvedValue(undefined),
        } as unknown as Pick<Pool, 'end'>,
        databaseName: 'wi2755_replay_test',
        ownedApplicationName: 'wi1167-replay-owned',
        timeoutMs: 10,
        now: () => nowValues.shift() ?? 10,
        sleep: jest.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(
      'Lingering backends: [{"pid":202,"application_name":"foreign-worker","state":"idle in transaction","backend_type":"client backend","client_addr":"10.0.0.8","state_change":"2026-07-26T15:01:00.000Z","ownership":"foreign"}]',
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining('DROP DATABASE'),
    );
  });
});
