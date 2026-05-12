// ---------------------------------------------------------------------------
// Workers KV Helpers — Tests
// ---------------------------------------------------------------------------

// KVNamespace is a Cloudflare Workers type absent from tsconfig.spec.json.
// Use Record<string, unknown> as a structural stand-in so return-type annotations compile.
type KVNamespace = Record<string, unknown>;

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
  subscriptionId: 'sub-123',
  tier: 'plus',
  status: 'active',
  monthlyLimit: 500,
  usedThisMonth: 42,
  dailyLimit: null,
  usedToday: 0,
};

describe('writeSubscriptionStatus', () => {
  it('writes JSON-serialized status with 24h TTL', async () => {
    const kv = createMockKV();
    await writeSubscriptionStatus(kv, 'acc-123', sampleStatus);

    expect(kv.put).toHaveBeenCalledWith(
      'sub:acc-123',
      JSON.stringify(sampleStatus),
      { expirationTtl: 86400 },
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
    expect(result!.dailyLimit).toBeNull();
    expect(result!.usedToday).toBe(0);
  });

  it('handles legacy cache entries without daily fields', async () => {
    // Old cache entries won't have dailyLimit/usedToday
    const legacyEntry = {
      subscriptionId: 'sub-123',
      tier: 'plus',
      status: 'active',
      monthlyLimit: 500,
      usedThisMonth: 42,
    };
    const kv = createMockKV({ getResult: JSON.stringify(legacyEntry) });
    const result = await readSubscriptionStatus(kv, 'acc-123');

    // Should default dailyLimit to null and usedToday to 0
    expect(result).not.toBeNull();
    expect(result!.dailyLimit).toBeNull();
    expect(result!.usedToday).toBe(0);
  });

  it('handles free tier with daily limit', async () => {
    const freeStatus: CachedSubscriptionStatus = {
      subscriptionId: 'sub-free',
      tier: 'free',
      status: 'active',
      monthlyLimit: 100,
      usedThisMonth: 30,
      dailyLimit: 10,
      usedToday: 5,
    };
    const kv = createMockKV({ getResult: JSON.stringify(freeStatus) });
    const result = await readSubscriptionStatus(kv, 'acc-free');

    expect(result!.dailyLimit).toBe(10);
    expect(result!.usedToday).toBe(5);
  });
});
