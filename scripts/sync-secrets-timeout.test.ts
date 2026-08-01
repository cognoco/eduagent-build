const mockExecSync = jest.fn();
const mockSpawnSync = jest.fn();

jest.mock('node:child_process', () => ({
  execSync: mockExecSync,
  spawnSync: mockSpawnSync,
}));

const { syncSecrets } = require('./sync-secrets.js') as {
  syncSecrets: (targets: string[]) => {
    ok: boolean;
    results: Record<string, boolean>;
  };
};

describe('[WI-1837] bounded rollback secret restore', () => {
  const previousConfig = process.env.WRANGLER_SYNC_CONFIG;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WRANGLER_SYNC_CONFIG = '/tmp/wrangler-secret-sync.jsonc';
    mockExecSync.mockReturnValue('{"DATABASE_URL":"redacted"}');
    mockSpawnSync.mockImplementation((_command: string, args: string[]) => {
      if (args.includes('list')) {
        return {
          status: 0,
          stdout: '[{"name":"DATABASE_URL"}]',
          stderr: '',
        };
      }
      return { status: 0, stdout: '', stderr: '' };
    });
  });

  afterAll(() => {
    if (previousConfig === undefined) {
      delete process.env.WRANGLER_SYNC_CONFIG;
    } else {
      process.env.WRANGLER_SYNC_CONFIG = previousConfig;
    }
  });

  it('caps every transitive Doppler and Wrangler subprocess at 30 seconds', () => {
    expect(syncSecrets(['prd'])).toEqual({
      ok: true,
      results: { prd: true },
    });

    expect(mockExecSync).toHaveBeenCalledTimes(1);
    expect(mockExecSync.mock.calls[0][1]).toMatchObject({ timeout: 30_000 });
    expect(mockSpawnSync).toHaveBeenCalledTimes(3);
    for (const call of mockSpawnSync.mock.calls) {
      expect(call[2]).toMatchObject({ timeout: 30_000 });
    }
  });

  it('turns a timed-out restore into a prompt, alertable sync failure', () => {
    mockSpawnSync.mockImplementation(
      (_command: string, args: string[], options: { timeout?: number }) => {
        if (args.includes('bulk')) {
          expect(options.timeout).toBe(30_000);
          return {
            status: null,
            signal: 'SIGTERM',
            stdout: '',
            stderr: 'restore command timed out',
          };
        }
        return { status: 0, stdout: '', stderr: '' };
      },
    );

    const startedAt = Date.now();
    expect(syncSecrets(['prd'])).toEqual({
      ok: false,
      results: { prd: false },
    });
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});
