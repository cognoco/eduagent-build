const originalFetch = globalThis.fetch;
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
  // no-op
});
const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {
  // no-op
});

afterEach(() => {
  warnSpy.mockClear();
  infoSpy.mockClear();
  jest.resetModules();
  globalThis.fetch = originalFetch;
  delete process.env.EXPO_PUBLIC_GIT_SHA;
});

afterAll(() => {
  warnSpy.mockRestore();
  infoSpy.mockRestore();
});

function freshModule() {
  return require('./contract-drift-check') as {
    checkContractDrift: () => Promise<void>;
  };
}

function healthResponse(deploySha: string | null) {
  return {
    status: 'ok',
    timestamp: '2026-05-25T10:00:00.000Z',
    deploySha,
    llm: {
      providers: ['openai'],
    },
  };
}

describe('checkContractDrift', () => {
  it('logs info when API has no DEPLOY_SHA', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthResponse(null)),
    });
    await freshModule().checkContractDrift();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('no DEPLOY_SHA'),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('CONTRACT DRIFT'),
    );
  });

  it('logs warning when SHAs differ', async () => {
    process.env.EXPO_PUBLIC_GIT_SHA = 'aabbccdd1234';
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthResponse('11223344')),
    });
    await freshModule().checkContractDrift();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('CONTRACT DRIFT DETECTED'),
    );
  });

  it('logs success when SHAs match', async () => {
    process.env.EXPO_PUBLIC_GIT_SHA = 'aabbccdd1234';
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthResponse('aabbccdd')),
    });
    await freshModule().checkContractDrift();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('same commit'),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('CONTRACT DRIFT'),
    );
  });

  it('swallows fetch errors silently', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(freshModule().checkContractDrift()).resolves.toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('CONTRACT DRIFT'),
    );
  });

  it('runs at most once per module load', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthResponse(null)),
    });
    const mod = freshModule();
    await mod.checkContractDrift();
    await mod.checkContractDrift();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
