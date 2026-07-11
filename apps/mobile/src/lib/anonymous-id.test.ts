import {
  getAnonymousId,
  __resetAnonymousIdCacheForTests,
} from './anonymous-id';
import * as SecureStore from './secure-storage';
import { ACTIVATION_ANONYMOUS_ID_KEY } from './secure-store-keys';

beforeEach(async () => {
  __resetAnonymousIdCacheForTests();
  await SecureStore.deleteItemAsync(ACTIVATION_ANONYMOUS_ID_KEY);
});

describe('getAnonymousId', () => {
  it('generates and persists a UUID on first call', async () => {
    const id = await getAnonymousId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    await expect(
      SecureStore.getItemAsync(ACTIVATION_ANONYMOUS_ID_KEY),
    ).resolves.toBe(id);
  });

  it('returns the same id on subsequent calls (in-memory cache)', async () => {
    const first = await getAnonymousId();
    const second = await getAnonymousId();
    expect(second).toBe(first);
  });

  it('reads an existing persisted id instead of generating a new one', async () => {
    await SecureStore.setItemAsync(
      ACTIVATION_ANONYMOUS_ID_KEY,
      'existing-anon-id',
    );
    __resetAnonymousIdCacheForTests();

    const id = await getAnonymousId();
    expect(id).toBe('existing-anon-id');
  });

  it('survives a cache reset by re-reading the persisted value', async () => {
    const first = await getAnonymousId();
    __resetAnonymousIdCacheForTests();
    const second = await getAnonymousId();
    expect(second).toBe(first);
  });
});
