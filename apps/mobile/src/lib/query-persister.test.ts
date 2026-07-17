import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';

import {
  buildPersisterKey,
  createScopedPersister,
  getQueryCacheBuster,
  shouldPersistQuery,
} from './query-persister';

// expo-updates is a native module (external boundary) — mock it so each test
// can control the "running update id". Read lazily via a getter so the value
// can change between tests without re-mocking.
let mockUpdateId: string | null = null;
jest.mock('expo-updates', () => ({
  get updateId() {
    return mockUpdateId;
  },
}));

const MAX_AGE = 24 * 60 * 60_000;
const USER = 'user-1';

beforeEach(async () => {
  mockUpdateId = null;
  await AsyncStorage.clear();
});

describe('buildPersisterKey', () => {
  it('partitions per Clerk user and falls back to anon when signed out', () => {
    expect(buildPersisterKey('abc')).toBe('eduagent-query-cache::abc');
    expect(buildPersisterKey(null)).toBe('eduagent-query-cache::anon');
    expect(buildPersisterKey(undefined)).toBe('eduagent-query-cache::anon');
  });
});

describe('getQueryCacheBuster', () => {
  it('returns the running update id so the cache busts on every OTA/build', () => {
    mockUpdateId = 'update-aaa';
    expect(getQueryCacheBuster()).toBe('update-aaa');
    mockUpdateId = 'update-bbb';
    expect(getQueryCacheBuster()).toBe('update-bbb');
  });

  it('falls back to a stable dev constant when no update is running (Metro)', () => {
    mockUpdateId = null;
    expect(getQueryCacheBuster()).toBe('dev');
  });
});

describe('persisted cache invalidation across bundle versions (boot-crash regression)', () => {
  /** Persist a query whose shape could differ across bundle versions. */
  async function saveCache(buster?: string): Promise<void> {
    const client = new QueryClient();
    client.setQueryData(['subjects', USER], [{ id: 's1', legacyShape: true }]);
    await persistQueryClientSave({
      queryClient: client,
      persister: createScopedPersister(USER),
      buster,
    });
    client.clear();
  }

  async function restore(buster?: string): Promise<QueryClient> {
    const fresh = new QueryClient();
    await persistQueryClientRestore({
      queryClient: fresh,
      persister: createScopedPersister(USER),
      maxAge: MAX_AGE,
      buster,
    });
    return fresh;
  }

  it('DROPS stale-shape data when the bundle changed (the fix)', async () => {
    // Old bundle wrote the cache under its update id...
    await saveCache('update-OLD');
    // ...new bundle cold-starts with a different update id (an OTA happened).
    const fresh = await restore('update-NEW');
    // The persisted cache is discarded, so the new render code never receives
    // the previous bundle's shape — this is what prevents the boot crash.
    expect(fresh.getQueryData(['subjects', USER])).toBeUndefined();
  });

  it('KEEPS the cache when the bundle is unchanged (offline paint preserved)', async () => {
    await saveCache('update-SAME');
    const fresh = await restore('update-SAME');
    expect(fresh.getQueryData(['subjects', USER])).toEqual([
      { id: 's1', legacyShape: true },
    ]);
  });

  it('self-heals: cache written by the old no-buster bundle is dropped on first fixed-bundle launch', async () => {
    // The crashing device wrote its cache with the pre-fix bundle (no buster).
    await saveCache(undefined);
    // It then OTA-updates to the fixed bundle, which restores WITH a buster.
    const fresh = await restore('update-FIXED');
    // The old cache is discarded, so an already-broken device recovers on the
    // next launch of the fixed bundle — no manual "clear data" required.
    expect(fresh.getQueryData(['subjects', USER])).toBeUndefined();
  });

  it('reproduces the bug with no buster: stale-shape data always rehydrates', async () => {
    // Pre-fix persistOptions passed no buster. Document that the cache then
    // survives across bundle versions — the exact crash path this fix closes.
    await saveCache(undefined);
    const fresh = await restore(undefined);
    expect(fresh.getQueryData(['subjects', USER])).toEqual([
      { id: 's1', legacyShape: true },
    ]);
  });
});

// ---------------------------------------------------------------------------
// [WI-1987] Dehydration denylist — transcript/PII queries never hit disk
//
// Pre-fix, persistOptions passed no shouldDehydrateQuery, so the persister's
// default (defaultShouldDehydrateQuery: persist every successful query)
// wrote EVERY query to AsyncStorage — including ['session-transcript', ...],
// which holds real learner/mentor chat text (packages/schemas/src/sessions.ts
// sessionTranscriptSchema.exchanges). shouldPersistQuery adds an explicit
// denylist so transcript queries are excluded while every other query keeps
// its existing offline-paint behavior.
// ---------------------------------------------------------------------------

describe('shouldPersistQuery [WI-1987]', () => {
  function makeSuccessfulQuery(queryKey: readonly unknown[]) {
    const client = new QueryClient();
    client.setQueryData(queryKey as unknown[], { some: 'data' });
    return client.getQueryCache().find({ queryKey })!;
  }

  it('excludes session-transcript queries (real chat text) from persistence', () => {
    const query = makeSuccessfulQuery([
      'session-transcript',
      'study',
      'session-1',
      'profile-1',
    ]);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('persists an ordinary successful query (default behavior preserved)', () => {
    const query = makeSuccessfulQuery(['subjects', USER]);
    expect(shouldPersistQuery(query)).toBe(true);
  });

  it('does not persist a non-success query, same as the default (e.g. errored)', () => {
    const client = new QueryClient();
    client.setQueryData(['subjects', USER], { some: 'data' });
    const query = client
      .getQueryCache()
      .find({ queryKey: ['subjects', USER] })!;
    // Force the query into an error state — defaultShouldDehydrateQuery only
    // persists 'success' status queries.
    query.setState({ status: 'error', error: new Error('boom') });
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('[integration] persistQueryClientSave writes ordinary data but drops transcript data to AsyncStorage', async () => {
    const client = new QueryClient();
    client.setQueryData(['subjects', USER], [{ id: 's1' }]);
    client.setQueryData(['session-transcript', 'study', 'session-1', USER], {
      session: { sessionId: 'session-1' },
      exchanges: [{ role: 'learner', text: 'my real chat message' }],
    });

    await persistQueryClientSave({
      queryClient: client,
      persister: createScopedPersister(USER),
      dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
    });

    const raw = await AsyncStorage.getItem(buildPersisterKey(USER));
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('my real chat message');
    expect(raw).not.toContain('session-transcript');
    expect(raw).toContain('subjects');
  });
});
