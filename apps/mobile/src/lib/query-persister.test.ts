import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { QueryClient } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
} from '@tanstack/react-query-persist-client';

import {
  buildPersisterKey,
  createScopedPersister,
  getQueryCacheBuster,
  LEGACY_CACHE_KEY,
  purgePersisterKeys,
  reattemptPersisterPurgeIfSignedOut,
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

  it('excludes library.conceptMastery (mentorAdditions prose) AND library.retention (retentionCardWithMetaSchema.topicTitle — raw learner content per pii-scrub.ts)', () => {
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
    expect(shouldPersistQuery(retention)).toBe(false);
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

  it('excludes retention.subject/evaluate-eligibility (topicTitle — raw learner content per pii-scrub.ts) and retention.teaching-preference (nativeLanguage), persisting only retention.topic (card: uuid/number/enum/date)', () => {
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
    ).toBe(false);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery([
          'retention',
          'evaluate-eligibility',
          'topic-1',
          'profile-1',
        ]),
      ),
    ).toBe(false);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['retention', 'topic', 'topic-1', 'profile-1']),
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

  it('excludes progress.subject/overview/continue/resume-target/review-summary/overdue-topics/inventory/milestones, progress.topic.resolve, AND progress.history (progressDataPointSchema.date is a bare z.string()) — persisting only progress.topic.active-session (sessionId uuid only)', () => {
    const excludedProgress: readonly (readonly unknown[])[] = [
      ['progress', 'study', 'subject', 'subject-1', 'profile-1'],
      ['progress', 'study', 'overview', 'profile-1'],
      ['progress', 'study', 'continue', 'profile-1'],
      ['progress', 'study', 'resume-target', 'profile-1'],
      ['progress', 'study', 'review-summary', 'profile-1'],
      ['progress', 'study', 'overdue-topics', 'profile-1'],
      ['progress', 'study', 'inventory', 'profile-1'],
      ['progress', 'study', 'milestones', 'profile-1'],
      ['progress', 'study', 'topic', 'subject-1', 'resolve', 'profile-1'],
      ['progress', 'study', 'history', 'profile-1'],
    ];
    for (const key of excludedProgress) {
      expect(shouldPersistQuery(makeSuccessfulQuery(key))).toBe(false);
    }

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

  it('persists only the structurally-clean roots (topic-sessions, subscription, subscription-status) and excludes book-sessions (topicTitle), language-progress (milestoneTitle/sublevel), revenuecat (unverifiable raw SDK)', () => {
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['topic-sessions', 'topic-1', 'profile-1']),
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
        makeSuccessfulQuery(['book-sessions', 'book-1', 'profile-1']),
      ),
    ).toBe(false);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['language-progress', 'subject-1', 'profile-1']),
      ),
    ).toBe(false);
    expect(
      shouldPersistQuery(
        makeSuccessfulQuery(['revenuecat', 'customerInfo', 'user-1']),
      ),
    ).toBe(false);
  });

  it('does not persist a non-success query, same as the default (e.g. errored)', () => {
    const client = new QueryClient();
    client.setQueryData(['retention', 'topic', 'topic-1', USER], {
      some: 'data',
    });
    const query = client
      .getQueryCache()
      .find({ queryKey: ['retention', 'topic', 'topic-1', USER] })!;
    // Force the query into an error state — defaultShouldDehydrateQuery only
    // persists 'success' status queries. Uses an allowlisted family
    // (retention.topic) so the error gate is proven to override the allow rule.
    query.setState({ status: 'error', error: new Error('boom') });
    expect(shouldPersistQuery(query)).toBe(false);
  });

  it('[integration] persistQueryClientSave writes allowlisted data but drops transcript/summary/parking-lot/recap/report/dashboard/subjects/profile/subscription-family/vocabulary/usage/subject-sessions/teaching-preference/native-language/subjectName data to AsyncStorage', async () => {
    const client = new QueryClient();
    // Persisted (clean): retention.topic — card is all uuid/number/enum/date.
    client.setQueryData(['retention', 'topic', 'topic-1', USER], {
      card: { topicId: 'topic-1', easeFactor: 2.5, repetitions: 3 },
    });
    // Excluded topicTitle-bearing families (topicTitle is raw learner content
    // per pii-scrub.ts) — each seeded with a distinctive learner string that
    // must NOT reach disk. Red-green counterexample for the structural rule:
    // revert any exclusion above and one of these canaries leaks to AsyncStorage.
    client.setQueryData(['retention', 'subject', 'subject-1', USER], {
      topics: [{ topicTitle: 'learner named this retention subject topic' }],
    });
    client.setQueryData(
      ['book-sessions', 'book-1', USER],
      [{ topicTitle: 'learner named this book session topic' }],
    );
    client.setQueryData(['library', 'retention', USER], {
      subjects: [
        { topics: [{ topicTitle: 'learner named this library topic' }] },
      ],
    });
    client.setQueryData(['language-progress', 'subject-1', USER], {
      nextMilestone: { milestoneTitle: 'learner free text milestone label' },
    });
    client.setQueryData(['progress', 'study', 'history', USER], {
      dataPoints: [{ date: 'progress history bare string leak canary' }],
    });
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
    expect(raw).not.toContain('learner named this retention subject topic');
    expect(raw).not.toContain('learner named this book session topic');
    expect(raw).not.toContain('learner named this library topic');
    expect(raw).not.toContain('learner free text milestone label');
    expect(raw).not.toContain('progress history bare string leak canary');
    expect(raw).toContain('retention');
  });
});

// ---------------------------------------------------------------------------
// Sign-out purge failure contract [WI-1987]
//
// Operator ruling (4th-review escalation): on a scoped-persister purge failure
// (1) sign-out always completes, (2) the failure escalates to Sentry carrying
// KEY NAMES ONLY — never cached values, and (3) the survivor is re-attempted at
// the next definitively-signed-out moment (app start / before next sign-in).
// The Fix Development Rule bans silent recovery in auth code; these prove the
// two swallowed .catch(() => {}) blocks are gone.
// ---------------------------------------------------------------------------

describe('purgePersisterKeys — escalate-on-failure, key names only [WI-1987]', () => {
  beforeEach(() => {
    (Sentry.captureMessage as jest.Mock).mockClear();
    (AsyncStorage.multiRemove as jest.Mock).mockClear();
  });

  it('removes the given keys on the happy path and does not escalate', async () => {
    const key = buildPersisterKey('user-x');
    await AsyncStorage.setItem(key, 'cache-with-transcript');

    await purgePersisterKeys([key]);

    expect(await AsyncStorage.getItem(key)).toBeNull();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('escalates to Sentry with KEY NAMES ONLY (never cached values) when removal fails, and does not throw', async () => {
    const key = buildPersisterKey('user-y');
    const secretValue =
      'private learner transcript that must never leave the device';
    await AsyncStorage.setItem(key, secretValue);
    (AsyncStorage.multiRemove as jest.Mock).mockRejectedValueOnce(
      new Error('AsyncStorage disk failure'),
    );

    // Must not throw — sign-out always completes.
    await expect(purgePersisterKeys([key])).resolves.toBeUndefined();

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [message, ctx] = (Sentry.captureMessage as jest.Mock).mock.calls[0];
    expect(message).toContain('persister purge failed');
    expect(ctx.tags.feature).toBe('auth');
    // Key NAME is reported for remediation…
    expect(ctx.extra.keyNames).toEqual([key]);
    // …but the cached VALUE never appears anywhere in the escalation payload.
    expect(JSON.stringify(ctx)).not.toContain(secretValue);
  });

  it('is a no-op for an empty key list', async () => {
    await purgePersisterKeys([]);
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe('reattemptPersisterPurgeIfSignedOut — next-start / pre-sign-in re-sweep [WI-1987]', () => {
  beforeEach(() => {
    (Sentry.captureMessage as jest.Mock).mockClear();
    (AsyncStorage.multiRemove as jest.Mock).mockClear();
  });

  it('sweeps a survivor scoped cache when DEFINITIVELY signed out (next app start / before next sign-in)', async () => {
    const survivor = buildPersisterKey('user-whose-signout-purge-failed');
    await AsyncStorage.setItem(survivor, 'orphaned-cache-with-transcript');
    await AsyncStorage.setItem(LEGACY_CACHE_KEY, 'pre-BUG-357-orphan');
    // A non-persister key must survive the sweep.
    await AsyncStorage.setItem('unrelated-app-key', 'keep-me');

    const swept = await reattemptPersisterPurgeIfSignedOut({
      isLoaded: true,
      isSignedIn: false,
    });

    expect(swept).toBe(true);
    expect(await AsyncStorage.getItem(survivor)).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY_CACHE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem('unrelated-app-key')).toBe('keep-me');
  });

  it('does NOT sweep while Clerk is still loading — a returning user’s cold-start cache is preserved', async () => {
    // The load-bearing guard: during Clerk's initial load useAuth reports
    // !isSignedIn even for a returning user whose session is about to restore.
    // Sweeping here would destroy their own offline-paint cache.
    const returningUserCache = buildPersisterKey('returning-user');
    await AsyncStorage.setItem(returningUserCache, 'legit-offline-paint-cache');

    const swept = await reattemptPersisterPurgeIfSignedOut({
      isLoaded: false,
      isSignedIn: false,
    });

    expect(swept).toBe(false);
    expect(await AsyncStorage.getItem(returningUserCache)).toBe(
      'legit-offline-paint-cache',
    );
  });

  it('does NOT sweep when signed in — the current user keeps their cache', async () => {
    const currentUserCache = buildPersisterKey('signed-in-user');
    await AsyncStorage.setItem(currentUserCache, 'current-user-cache');

    const swept = await reattemptPersisterPurgeIfSignedOut({
      isLoaded: true,
      isSignedIn: true,
    });

    expect(swept).toBe(false);
    expect(await AsyncStorage.getItem(currentUserCache)).toBe(
      'current-user-cache',
    );
  });

  it('escalates (not throws) when the survivor sweep itself hits a storage failure', async () => {
    await AsyncStorage.setItem(buildPersisterKey('user-z'), 'orphan');
    (AsyncStorage.multiRemove as jest.Mock).mockRejectedValueOnce(
      new Error('disk failure during re-sweep'),
    );

    await expect(
      reattemptPersisterPurgeIfSignedOut({ isLoaded: true, isSignedIn: false }),
    ).resolves.toBe(true);

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
  });
});
