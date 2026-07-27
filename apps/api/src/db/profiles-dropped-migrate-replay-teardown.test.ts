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
    expect(source).not.toMatch(/DROP DATABASE[^`]*WITH \(FORCE\)/s);
  });

  it('closes the pool, waits until every backend is gone, then drops normally', async () => {
    const events: string[] = [];
    const connectionCounts = ['2', '1', '0'];
    const query = jest.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes('pg_stat_activity')) {
        expect(values).toEqual(['wi2755_replay_test']);
        events.push(`connections:${connectionCounts[0]}`);
        return {
          rows: [{ connection_count: connectionCounts.shift() ?? '0' }],
        };
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
      sleep,
    });

    expect(events).toEqual([
      'pool:end',
      'connections:2',
      'sleep',
      'connections:1',
      'sleep',
      'connections:0',
      'drop',
    ]);
  });

  it('continues past the observed ten-second backend linger before dropping', async () => {
    const events: string[] = [];
    const connectionCounts = ['1', '0'];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('pg_stat_activity')) {
        const connectionCount = connectionCounts.shift() ?? '0';
        events.push(`connections:${connectionCount}`);
        return { rows: [{ connection_count: connectionCount }] };
      }
      events.push('drop');
      return { rows: [] };
    });
    const nowValues = [0, 10_000];

    await closePoolAndDropScratchDatabase({
      adminPool: { query } as unknown as Pick<Pool, 'query'>,
      scratchPool: {
        end: jest.fn(async () => events.push('pool:end')),
      } as unknown as Pick<Pool, 'end'>,
      databaseName: 'wi2755_replay_test',
      now: () => nowValues.shift() ?? 10_001,
      sleep: jest.fn(async (delayMs: number) => {
        events.push(`sleep:${delayMs}`);
      }),
    });

    expect(events).toEqual([
      'pool:end',
      'connections:1',
      'sleep:25',
      'connections:0',
      'drop',
    ]);
  });

  it('times out without force-dropping a database that still has connections', async () => {
    const query = jest.fn(async (sql: string) => {
      expect(sql).toContain('pg_stat_activity');
      return { rows: [{ connection_count: '1' }] };
    });
    const nowValues = [0, 9, 10];

    await expect(
      closePoolAndDropScratchDatabase({
        adminPool: { query } as unknown as Pick<Pool, 'query'>,
        scratchPool: {
          end: jest.fn().mockResolvedValue(undefined),
        } as unknown as Pick<Pool, 'end'>,
        databaseName: 'wi2755_replay_test',
        timeoutMs: 10,
        now: () => nowValues.shift() ?? 10,
        sleep: jest.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow(
      'Timed out waiting for connections to close for scratch database "wi2755_replay_test"',
    );

    expect(query).toHaveBeenCalledTimes(2);
  });
});
