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

  // [round 3 re-audit finding] The 2-element profile/profiles factory shapes
  // that round 2 kept ('profiles'/'profile' — publicProfileSchema) themselves
  // carry PII under the AC's broad reading: displayName, avatarUrl,
  // birthMonth/birthDay, location, pronouns, consentStatus. Round 2's
  // segment-0-collision fix (excluding the unaudited scope-context shape) is
  // still correct and still tested, but the audited 2-element shape is now
  // ALSO excluded — nothing rooted at 'profile'/'profiles' persists.
  it("excludes every 'profile'/'profiles'-rooted query, including the previously-allowed 2-element profile/profiles factory shapes (publicProfileSchema PII: displayName/avatarUrl/birthMonth/birthDay/location/pronouns/consentStatus)", () => {
    const scopesQuery = makeSuccessfulQuery(['profile', 'profile-1', 'scopes']);
    expect(shouldPersistQuery(scopesQuery)).toBe(false);

    const activeProfile = makeSuccessfulQuery(['profile', 'profile-1']);
    expect(shouldPersistQuery(activeProfile)).toBe(false);

    const profilesList = makeSuccessfulQuery(['profiles', 'user-1']);
    expect(shouldPersistQuery(profilesList)).toBe(false);
  });

  it('excludes subscription-family (familySubscriptionSchema.members[].displayName — PII)', () => {
    const query = makeSuccessfulQuery(['subscription-family', 'profile-1']);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('excludes vocabulary (vocabularySchema.term/translation — user-created via the vocabulary create API)', () => {
    const query = makeSuccessfulQuery(['vocabulary', 'profile-1', 'subject-1']);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('excludes usage (usageSchema.byProfile[].name — family member display name, PII)', () => {
    const query = makeSuccessfulQuery(['usage', 'profile-1']);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('excludes subject-sessions (subjectSessionSchema.bookTitle — learner-controlled via the focused-book creation path)', () => {
    const query = makeSuccessfulQuery([
      'subject-sessions',
      'subject-1',
      'profile-1',
    ]);
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('excludes retention.teaching-preference (nativeLanguage free text) while still persisting retention.subject/topic/evaluate-eligibility', () => {
    const teachingPreference = makeSuccessfulQuery([
      'retention',
      'teaching-preference',
      'subject-1',
      'profile-1',
    ]);
    expect(shouldPersistQuery(teachingPreference)).toBe(false);

    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['retention', 'subject', 'subject-1', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['retention', 'topic', 'topic-1', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery([
          'retention',
          'evaluate-eligibility',
          'topic-1',
          'profile-1',
        ]),
      ),
    ).toBe(true);
  });

  it('excludes settings.native-language (unconstrained user-typed string) while still persisting the other settings sub-queries', () => {
    const nativeLanguage = makeSuccessfulQuery([
      'settings',
      'native-language',
      'subject-1',
      'profile-1',
    ]);
    expect(shouldPersistQuery(nativeLanguage)).toBe(false);

    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['settings', 'notifications', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['settings', 'celebration-level', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['settings', 'withdrawal-archive', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery([
          'settings',
          'family-pool-breakdown-sharing',
          'profile-1',
        ]),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery([
          'settings',
          'analogy-domain',
          'subject-1',
          'profile-1',
        ]),
      ),
    ).toBe(true);
  });

  it('excludes progress.subject/overview/continue/resume-target/review-summary/overdue-topics/inventory/milestones and progress.topic.resolve (subjectName — the learner-typed subject title, per subjectCreateSchema.name / create-subject.tsx resolvedName-fallback) while still persisting progress.history and progress.topic.active-session', () => {
    const subjectNameBearing: readonly (readonly unknown[])[] = [
      ['progress', 'study', 'subject', 'subject-1', 'profile-1'],
      ['progress', 'study', 'overview', 'profile-1'],
      ['progress', 'study', 'continue', 'profile-1'],
      ['progress', 'study', 'resume-target', 'profile-1'],
      ['progress', 'study', 'review-summary', 'profile-1'],
      ['progress', 'study', 'overdue-topics', 'profile-1'],
      ['progress', 'study', 'inventory', 'profile-1'],
      ['progress', 'study', 'milestones', 'profile-1'],
      ['progress', 'study', 'topic', 'subject-1', 'resolve', 'profile-1'],
    ];
    for (const key of subjectNameBearing) {
      expect(shouldPersistQuery(makeSuccessfulQuery(key))).toBe(false);
    }

    const history = makeSuccessfulQuery([
      'progress',
      'study',
      'history',
      'profile-1',
    ]);
    expect(shouldPersistQuery(history)).toBe(true);

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

  it('persists other verified-clean query-key roots (book-sessions, topic-sessions, language-progress, subscription, subscription-status, revenuecat)', () => {
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['book-sessions', 'book-1', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['topic-sessions', 'topic-1', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['language-progress', 'subject-1', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(makeSuccessfulQuery(['subscription', 'profile-1'])),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['subscription-status', 'profile-1']),
      ),
    ).toBe(true);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['revenuecat', 'customerInfo', 'user-1']),
      ),
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

  it('[integration] persistQueryClientSave writes allowlisted data but drops transcript/summary/parking-lot/recap/report/dashboard/subjects/profile/subscription-family/vocabulary/usage/subject-sessions/teaching-preference/native-language/subjectName data to AsyncStorage', async () => {
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
    client.setQueryData(
      ['profiles', USER],
      [{ displayName: 'Jorn Real Name' }],
    );
    client.setQueryData(
      ['subscription-family', USER],
      [{ members: [{ displayName: 'Wife Real Name' }] }],
    );
    client.setQueryData(
      ['vocabulary', USER, 'subject-1'],
      [
        {
          term: 'raw learner vocab term',
          translation: 'raw learner translation',
        },
      ],
    );
    client.setQueryData(
      ['usage', USER],
      [{ byProfile: [{ name: 'Child Real Name' }] }],
    );
    client.setQueryData(
      ['subject-sessions', 'subject-1', USER],
      [{ bookTitle: 'the raw focus text the learner typed as a book title' }],
    );
    client.setQueryData(
      ['retention', 'teaching-preference', 'subject-1', USER],
      [{ nativeLanguage: 'a custom native language the learner typed' }],
    );
    client.setQueryData(
      ['settings', 'native-language', 'subject-1', USER],
      [{ nativeLanguage: 'a custom native language typed in settings' }],
    );
    client.setQueryData(
      ['progress', 'study', 'overview', USER],
      [{ subjectName: 'the raw subject title the learner typed' }],
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
    expect(raw).not.toContain('Jorn Real Name');
    expect(raw).not.toContain('Wife Real Name');
    expect(raw).not.toContain('raw learner vocab term');
    expect(raw).not.toContain('raw learner translation');
    expect(raw).not.toContain('Child Real Name');
    expect(raw).not.toContain('the raw focus text the learner typed');
    expect(raw).not.toContain('a custom native language the learner typed');
    expect(raw).not.toContain('a custom native language typed in settings');
    expect(raw).not.toContain('the raw subject title the learner typed');
    expect(raw).toContain('retention');
  });
});
