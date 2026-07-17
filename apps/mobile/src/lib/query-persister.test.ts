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
// [WI-1987, reworked] Dehydration ALLOWLIST — default-deny closes the class
//
// Pre-fix, persistOptions passed no shouldDehydrateQuery, so the persister's
// default (defaultShouldDehydrateQuery: persist every successful query)
// wrote EVERY query to AsyncStorage — including ['session-transcript', ...],
// which holds real learner/mentor chat text (packages/schemas/src/sessions.ts
// sessionTranscriptSchema.exchanges). A first pass added a denylist for
// session-transcript/session-summary/parking-lot; review bounced it because
// a denylist fails OPEN — every new/overlooked query-key family persists by
// default. shouldPersistQuery is now default-DENY: a query only persists if
// its key matches a verified-clean allow rule (query-persister.ts). The red
// case that proves the class is closed is the DEFAULT-DENY case below — an
// arbitrary/unaudited key must NOT persist, full stop — plus spot-checks of
// the specific families the two review rounds named.
// ---------------------------------------------------------------------------

describe('shouldPersistQuery [WI-1987]', () => {
  function makeSuccessfulQuery(queryKey: readonly unknown[]) {
    const client = new QueryClient();
    client.setQueryData(queryKey as unknown[], { some: 'data' });
    return client.getQueryCache().find({ queryKey })!;
  }

  it('DEFAULT-DENY: an arbitrary/unaudited query key does not persist', () => {
    const query = makeSuccessfulQuery(['some-brand-new-query-nobody-audited']);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('excludes session-transcript queries (real chat text) from persistence', () => {
    const query = makeSuccessfulQuery([
      'session-transcript',
      'study',
      'session-1',
      'profile-1',
    ]);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('excludes session-summary queries (AI paraphrase/quotes) from persistence', () => {
    const query = makeSuccessfulQuery([
      'session-summary',
      'study',
      'session-1',
      'profile-1',
    ]);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('excludes parking-lot queries (verbatim child-typed questions) from persistence, including the topic-parking-lot variant', () => {
    const parkingLot = makeSuccessfulQuery([
      'parking-lot',
      'study',
      'session-1',
      'profile-1',
    ]);
    expect(shouldPersistQuery(parkingLot)).toBe(false);

    const topicParkingLot = makeSuccessfulQuery([
      'parking-lot',
      'study',
      'topic',
      'subject-1',
      'topic-1',
      'profile-1',
    ]);
    expect(shouldPersistQuery(topicParkingLot)).toBe(false);
  });

  it("excludes session detail queries (learningSessionSchema.rawInput — the learner's raw typed text)", () => {
    const query = makeSuccessfulQuery([
      'session',
      'study',
      'session-1',
      'profile-1',
    ]);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('excludes recaps and journal-recaps queries (displaySummary/highlight/narrative/conversationPrompt/learner quote)', () => {
    const recaps = makeSuccessfulQuery(['recaps', 'study', 'profile-1', null]);
    expect(shouldPersistQuery(recaps)).toBe(false);

    const journalRecaps = makeSuccessfulQuery([
      'journal-recaps',
      'profile-1',
      10,
    ]);
    expect(shouldPersistQuery(journalRecaps)).toBe(false);
  });

  it('excludes my-reports queries, both monthly and weekly (highlights/nextSteps)', () => {
    const monthly = makeSuccessfulQuery(['my-reports', 'monthly', 'profile-1']);
    expect(shouldPersistQuery(monthly)).toBe(false);

    const weekly = makeSuccessfulQuery(['my-reports', 'weekly', 'profile-1']);
    expect(shouldPersistQuery(weekly)).toBe(false);
  });

  it('excludes learner-profile queries (communicationNotes free text)', () => {
    const query = makeSuccessfulQuery(['learner-profile', 'profile-1']);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it("excludes the subjects list query (subjectSchema.rawInput — the learner's raw subject-creation text)", () => {
    const query = makeSuccessfulQuery(['subjects', USER, false]);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('excludes every dashboard.* query wholesale, including the root/childDetail/childSessions/childReports/childMemory/childVerifiedProof shapes', () => {
    const shapes: readonly unknown[][] = [
      ['dashboard', 'family', 'profile-1'],
      ['dashboard', 'family', 'child', 'child-1'],
      ['dashboard', 'family', 'child', 'child-1', 'sessions'],
      ['dashboard', 'family', 'child', 'child-1', 'session', 'session-1'],
      ['dashboard', 'family', 'child', 'child-1', 'reports'],
      ['dashboard', 'family', 'child', 'child-1', 'report', 'report-1'],
      ['dashboard', 'family', 'child', 'child-1', 'weekly-reports'],
      ['dashboard', 'family', 'child', 'child-1', 'weekly-report', 'report-1'],
      ['dashboard', 'family', 'child', 'child-1', 'memory'],
      ['dashboard', 'family', 'child', 'child-1', 'verified-proof'],
    ];
    for (const key of shapes) {
      expect(shouldPersistQuery(makeSuccessfulQuery(key))).toBe(false);
    }
  });

  it('excludes progress.profile* queries (self-view mirror of dashboard reports/sessions) and topicProgress (summaryExcerpt)', () => {
    const profileSessions = makeSuccessfulQuery([
      'progress',
      'study',
      'profile',
      'profile-1',
      'sessions',
      'profile-1',
    ]);
    expect(shouldPersistQuery(profileSessions)).toBe(false);

    const profileReports = makeSuccessfulQuery([
      'progress',
      'study',
      'profile',
      'profile-1',
      'reports',
      'profile-1',
    ]);
    expect(shouldPersistQuery(profileReports)).toBe(false);

    const topicProgress = makeSuccessfulQuery([
      'progress',
      'study',
      'topic',
      'subject-1',
      'topic-1',
      'profile-1',
    ]);
    expect(shouldPersistQuery(topicProgress)).toBe(false);
  });

  it('excludes library.conceptMastery (mentorAdditions prose) but allows library.retention (clean)', () => {
    const conceptMastery = makeSuccessfulQuery([
      'library',
      'concept-mastery',
      'profile-1',
      ['topic-1'],
    ]);
    expect(shouldPersistQuery(conceptMastery)).toBe(false);

    const retention = makeSuccessfulQuery([
      'library',
      'retention',
      'profile-1',
    ]);
    expect(shouldPersistQuery(retention)).toBe(true);
  });

  it('persists verified-clean progress sub-queries (metrics/enums/ids only)', () => {
    const overview = makeSuccessfulQuery([
      'progress',
      'study',
      'overview',
      'profile-1',
    ]);
    expect(shouldPersistQuery(overview)).toBe(true);

    const activeSessionForTopic = makeSuccessfulQuery([
      'progress',
      'study',
      'topic',
      'topic-1',
      'active-session',
      'profile-1',
    ]);
    expect(shouldPersistQuery(activeSessionForTopic)).toBe(true);
  });

  it('persists other verified-clean query-key roots (retention, vocabulary, settings, subscription, profiles, ...)', () => {
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['retention', 'subject', 'subject-1', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['vocabulary', 'profile-1', 'subject-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['settings', 'notifications', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(makeSuccessfulQuery(['subscription', 'profile-1'])),
    ).toBe(true);
    expect(
      shouldPersistQuery(makeSuccessfulQuery(['profiles', 'user-1'])),
    ).toBe(true);
  });

  it('does not persist a non-success query, same as the default (e.g. errored)', () => {
    const client = new QueryClient();
    client.setQueryData(['retention', 'subject', 'subject-1', USER], {
      some: 'data',
    });
    const query = client
      .getQueryCache()
      .find({ queryKey: ['retention', 'subject', 'subject-1', USER] })!;
    // Force the query into an error state — defaultShouldDehydrateQuery only
    // persists 'success' status queries.
    query.setState({ status: 'error', error: new Error('boom') });
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('[integration] persistQueryClientSave writes allowlisted data but drops transcript/summary/parking-lot/recap/report/dashboard/subjects data to AsyncStorage', async () => {
    const client = new QueryClient();
    client.setQueryData(
      ['retention', 'subject', 'subject-1', USER],
      [{ id: 's1' }],
    );
    client.setQueryData(['session-transcript', 'study', 'session-1', USER], {
      session: { sessionId: 'session-1' },
      exchanges: [{ role: 'learner', text: 'my real chat message' }],
    });
    client.setQueryData(['session-summary', 'study', 'session-1', USER], {
      content: 'AI paraphrase of the session',
      aiFeedback: 'great work identifying the pattern',
      closingLine: 'see you next time',
      learnerRecap: 'I learned about fractions',
    });
    client.setQueryData(
      ['parking-lot', 'study', 'session-1', USER],
      [{ id: 'q1', text: 'why does the sky look blue at sunset' }],
    );
    client.setQueryData(
      ['journal-recaps', USER, 10],
      [{ displaySummary: 'a private recap of the session' }],
    );
    client.setQueryData(
      ['my-reports', 'monthly', USER],
      [{ highlights: ['a private highlight about the learner'] }],
    );
    client.setQueryData(
      ['dashboard', 'family', 'child', 'child-1', 'sessions'],
      [{ narrative: 'a private narrative about the child session' }],
    );
    client.setQueryData(
      ['subjects', USER, false],
      [{ rawInput: 'the raw text the learner typed to create this subject' }],
    );

    await persistQueryClientSave({
      queryClient: client,
      persister: createScopedPersister(USER),
      dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
    });

    const raw = await AsyncStorage.getItem(buildPersisterKey(USER));
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('my real chat message');
    expect(raw).not.toContain('session-transcript');
    expect(raw).not.toContain('AI paraphrase of the session');
    expect(raw).not.toContain('learnerRecap');
    expect(raw).not.toContain('session-summary');
    expect(raw).not.toContain('why does the sky look blue at sunset');
    expect(raw).not.toContain('parking-lot');
    expect(raw).not.toContain('a private recap of the session');
    expect(raw).not.toContain('a private highlight about the learner');
    expect(raw).not.toContain('a private narrative about the child session');
    expect(raw).not.toContain('the raw text the learner typed');
    expect(raw).toContain('retention');
  });
});
