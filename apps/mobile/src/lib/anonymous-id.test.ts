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

  // [WI-1689 rework] concurrency dedup. Regression for: two callers that
  // both start before the first SecureStore write resolves (e.g. app_opened
  // + day2_return firing off the same cold-launch render, or relearn.tsx
  // looping over several review_card_seen rows) used to each see an empty
  // cache/store and generate a different UUID, splitting one install's
  // funnel events across multiple anonymousId values.
  it('shares one in-flight resolution across concurrent callers instead of generating divergent UUIDs', async () => {
    // jest.spyOn on this wrapper module persists across tests in this file
    // (it's not restored between them), so start from a clean call count
    // rather than trusting the spy's absolute total.
    const setItemSpy = jest.spyOn(SecureStore, 'setItemAsync');
    setItemSpy.mockClear();

    const [first, second, third] = await Promise.all([
      getAnonymousId(),
      getAnonymousId(),
      getAnonymousId(),
    ]);

    expect(second).toBe(first);
    expect(third).toBe(first);
    // Only the winning caller's resolution should have persisted a value.
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    await expect(
      SecureStore.getItemAsync(ACTIVATION_ANONYMOUS_ID_KEY),
    ).resolves.toBe(first);
  });

  it('clears the in-flight latch after resolution, so a later concurrent burst is independent', async () => {
    const setItemSpy = jest.spyOn(SecureStore, 'setItemAsync');
    setItemSpy.mockClear();

    const firstBurst = await Promise.all([getAnonymousId(), getAnonymousId()]);
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    setItemSpy.mockClear();

    const secondBurst = await Promise.all([getAnonymousId(), getAnonymousId()]);

    expect(secondBurst[0]).toBe(firstBurst[0]);
    expect(secondBurst[1]).toBe(firstBurst[0]);
    // The second burst hits the now-populated in-memory cache — zero further
    // writes, no new in-flight promise.
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
