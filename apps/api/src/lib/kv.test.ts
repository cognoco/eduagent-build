// ---------------------------------------------------------------------------
// Workers KV Helpers — Tests
// ---------------------------------------------------------------------------

import {
  writeSubscriptionStatus,
  readSubscriptionStatus,
  type CachedSubscriptionStatus,
} from './kv';

function createMockKV({ getResult = null as string | null } = {}): KVNamespace {
  return {
    put: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(getResult),
    delete: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ keys: [], list_complete: true }),
    getWithMetadata: jest
      .fn()
      .mockResolvedValue({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

const sampleStatus: CachedSubscriptionStatus = {
  tier: 'plus',
  status: 'active',
  monthlyLimit: 500,
  usedThisMonth: 42,
};

describe('writeSubscriptionStatus', () => {
  it('writes JSON-serialized status with 24h TTL', async () => {
    const kv = createMockKV();
    await writeSubscriptionStatus(kv, 'acc-123', sampleStatus);

    expect(kv.put).toHaveBeenCalledWith(
      'sub:acc-123',
      JSON.stringify(sampleStatus),
      { expirationTtl: 86400 }
    );
  });

  it('uses sub:{accountId} key pattern', async () => {
    const kv = createMockKV();
    await writeSubscriptionStatus(kv, 'my-account-id', sampleStatus);

    const key = (kv.put as jest.Mock).mock.calls[0][0];
    expect(key).toBe('sub:my-account-id');
  });
});

describe('readSubscriptionStatus', () => {
  it('returns parsed status on cache hit', async () => {
    const kv = createMockKV({ getResult: JSON.stringify(sampleStatus) });
    const result = await readSubscriptionStatus(kv, 'acc-123');

    expect(kv.get).toHaveBeenCalledWith('sub:acc-123');
    expect(result).toEqual(sampleStatus);
  });

  it('returns null on cache miss', async () => {
    const kv = createMockKV({ getResult: null });
    const result = await readSubscriptionStatus(kv, 'acc-999');

    expect(result).toBeNull();
  });

  it('returns correct types from parsed JSON', async () => {
    const kv = createMockKV({ getResult: JSON.stringify(sampleStatus) });
    const result = await readSubscriptionStatus(kv, 'acc-123');

    expect(result!.tier).toBe('plus');
    expect(result!.status).toBe('active');
    expect(typeof result!.monthlyLimit).toBe('number');
    expect(typeof result!.usedThisMonth).toBe('number');
  });
});
