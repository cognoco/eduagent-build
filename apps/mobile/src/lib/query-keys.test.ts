import { queryKeys } from './query-keys';

describe('queryKeys mode-scoped factories', () => {
  const mode = 'family' as const;
  const profileId = 'prof-abc';
  const childId = 'child-1';
  const subjectId = 'sub-1';
  const topicId = 'topic-1';
  const sessionId = 'sess-1';
  const reportId = 'report-1';

  it('adds mode after the progress prefix', () => {
    expect(queryKeys.progress.overview(mode, profileId)).toEqual([
      'progress',
      mode,
      'overview',
      profileId,
    ]);
    expect(queryKeys.progress.inventory('study', profileId)).toEqual([
      'progress',
      'study',
      'inventory',
      profileId,
    ]);
  });

  it('keeps effective profile ids in progress keys', () => {
    expect(
      queryKeys.progress.profileSessions(mode, childId, profileId),
    ).toEqual(['progress', mode, 'profile', childId, 'sessions', profileId]);
    expect(queryKeys.progress.profileReports(mode, childId, profileId)).toEqual(
      ['progress', mode, 'profile', childId, 'reports', profileId],
    );
    expect(
      queryKeys.progress.profileWeeklyReports(mode, childId, profileId),
    ).toEqual([
      'progress',
      mode,
      'profile',
      childId,
      'weekly-reports',
      profileId,
    ]);
  });

  it('covers representative progress factories', () => {
    expect(queryKeys.progress.subject(mode, subjectId, profileId)).toEqual([
      'progress',
      mode,
      'subject',
      subjectId,
      profileId,
    ]);
    expect(
      queryKeys.progress.topicProgress(mode, subjectId, topicId, profileId),
    ).toEqual(['progress', mode, 'topic', subjectId, topicId, profileId]);
    expect(
      queryKeys.progress.resumeTarget(mode, profileId, {
        subjectId,
        topicId,
      }),
    ).toEqual([
      'progress',
      mode,
      'resume-target',
      profileId,
      subjectId,
      null,
      topicId,
    ]);
  });

  it('adds mode after the dashboard prefix', () => {
    expect(queryKeys.dashboard.root(mode, profileId)).toEqual([
      'dashboard',
      mode,
      profileId,
    ]);
    expect(queryKeys.dashboard.childDetail(mode, childId)).toEqual([
      'dashboard',
      mode,
      'child',
      childId,
    ]);
    expect(
      queryKeys.dashboard.childSessionDetail(mode, childId, sessionId),
    ).toEqual(['dashboard', mode, 'child', childId, 'session', sessionId]);
  });

  it('covers dashboard child report keys', () => {
    expect(queryKeys.dashboard.childReports(mode, childId)).toEqual([
      'dashboard',
      mode,
      'child',
      childId,
      'reports',
    ]);
    expect(
      queryKeys.dashboard.childReportDetail(mode, childId, reportId),
    ).toEqual(['dashboard', mode, 'child', childId, 'report', reportId]);
    expect(
      queryKeys.dashboard.childWeeklyReportDetail(mode, childId, reportId),
    ).toEqual(['dashboard', mode, 'child', childId, 'weekly-report', reportId]);
  });

  it('adds mode after session-domain prefixes', () => {
    expect(queryKeys.sessions.detail(mode, sessionId, profileId)).toEqual([
      'session',
      mode,
      sessionId,
      profileId,
    ]);
    expect(queryKeys.sessions.transcript(mode, sessionId, profileId)).toEqual([
      'session-transcript',
      mode,
      sessionId,
      profileId,
    ]);
    expect(queryKeys.sessions.summary(mode, sessionId, profileId)).toEqual([
      'session-summary',
      mode,
      sessionId,
      profileId,
    ]);
    expect(queryKeys.sessions.parkingLot(mode, sessionId, profileId)).toEqual([
      'parking-lot',
      mode,
      sessionId,
      profileId,
    ]);
  });

  it('matches session keys across modes for the same profileId [BUG-553]', () => {
    expect(
      queryKeys.sessions.matchAnyMode(
        sessionId,
        profileId,
      )(queryKeys.sessions.detail('study', sessionId, profileId)),
    ).toBe(true);
    expect(
      queryKeys.sessions.matchTranscriptAnyMode(
        sessionId,
        profileId,
      )(queryKeys.sessions.transcript('family', sessionId, profileId)),
    ).toBe(true);
    expect(
      queryKeys.sessions.matchSummaryAnyMode(
        sessionId,
        profileId,
      )(queryKeys.sessions.summary('family', sessionId, profileId)),
    ).toBe(true);
  });

  // [BUG-553] Break test: matchers must NOT match keys from a different profileId.
  // Pre-fix, matchAnyMode(sessionId) matched any profileId sharing the same
  // sessionId — invalidating User A's cache when User B triggered a mutation.
  it('[break-test] rejects session keys with a different profileId [BUG-553]', () => {
    const otherProfileId = 'prof-other';

    expect(
      queryKeys.sessions.matchAnyMode(
        sessionId,
        profileId,
      )(queryKeys.sessions.detail('study', sessionId, otherProfileId)),
    ).toBe(false);

    expect(
      queryKeys.sessions.matchTranscriptAnyMode(
        sessionId,
        profileId,
      )(queryKeys.sessions.transcript('family', sessionId, otherProfileId)),
    ).toBe(false);

    expect(
      queryKeys.sessions.matchSummaryAnyMode(
        sessionId,
        profileId,
      )(queryKeys.sessions.summary('family', sessionId, otherProfileId)),
    ).toBe(false);
  });
});

describe('queryKeys non-mode-scoped factories', () => {
  it('keeps Now projections bound to exact actor/profile/epoch keys', () => {
    const actorId = 'actor-abc';
    const profileId = 'prof-abc';
    const policyEpoch = 'epoch-enabled';

    expect(queryKeys.now.feed(actorId, profileId, policyEpoch)).toEqual([
      'now-feed',
      actorId,
      profileId,
      policyEpoch,
    ]);
    expect(queryKeys.now.overflow(actorId, profileId, policyEpoch)).toEqual([
      'now-overflow',
      actorId,
      profileId,
      policyEpoch,
    ]);
  });

  it.each([
    ['feed', 'now-feed'],
    ['overflow', 'now-overflow'],
  ] as const)(
    'rejects narrowed or wrongly bound Now %s keys',
    (projection, prefix) => {
      const actorId = 'actor-abc';
      const profileId = 'prof-abc';
      const policyEpoch = 'epoch-enabled';
      const key = queryKeys.now[projection](actorId, profileId, policyEpoch);

      expect(key).toHaveLength(4);
      expect(key).not.toEqual([prefix, profileId, policyEpoch]);
      expect(key).not.toEqual([prefix, 'actor-other', profileId, policyEpoch]);
      expect(key).not.toEqual([prefix, actorId, 'prof-other', policyEpoch]);
      expect(key).not.toEqual([prefix, actorId, profileId, 'epoch-disabled']);
    },
  );

  it.each(['feed', 'overflow'] as const)(
    'normalizes unloaded Now %s scope IDs',
    (projection) => {
      expect(
        queryKeys.now[projection](null, undefined, 'epoch-enabled'),
      ).toEqual([
        projection === 'feed' ? 'now-feed' : 'now-overflow',
        undefined,
        undefined,
        'epoch-enabled',
      ]);
    },
  );

  it('[WI-2184] matches only completed-session history keys for one profile', () => {
    const matchProfileHistory = queryKeys.historySessionsMatch('prof-abc');

    expect(
      matchProfileHistory(
        queryKeys.topicSessions('subject-1', 'topic-1', 'prof-abc'),
      ),
    ).toBe(true);
    expect(
      matchProfileHistory(
        queryKeys.bookSessions('subject-1', 'book-1', 'prof-abc'),
      ),
    ).toBe(true);
    expect(
      matchProfileHistory(queryKeys.subjectSessions('subject-1', 'prof-abc')),
    ).toBe(true);
    expect(
      matchProfileHistory(
        queryKeys.topicSessions('subject-1', 'topic-1', 'prof-other'),
      ),
    ).toBe(false);
    expect(
      matchProfileHistory(['session', 'study', 'session-1', 'prof-abc']),
    ).toBe(false);
  });

  it('leaves retention and library keys unchanged', () => {
    expect(queryKeys.retention.subject('sub-1', 'prof-abc')).toEqual([
      'retention',
      'subject',
      'sub-1',
      'prof-abc',
    ]);
    expect(queryKeys.library.retention('prof-abc')).toEqual([
      'library',
      'retention',
      'prof-abc',
    ]);
    expect(
      queryKeys.library.conceptMastery('prof-abc', ['topic-1', 'topic-2']),
    ).toEqual([
      'library',
      'concept-mastery',
      'prof-abc',
      ['topic-1', 'topic-2'],
    ]);
  });

  it('scopes subscription and usage keys by profileId', () => {
    expect(queryKeys.subscription('prof-abc')).toEqual([
      'subscription',
      'prof-abc',
    ]);
    expect(queryKeys.usage('prof-abc')).toEqual(['usage', 'prof-abc']);
    expect(queryKeys.subscriptionFamily('prof-abc')).toEqual([
      'subscription-family',
      'prof-abc',
    ]);
    expect(queryKeys.subscriptionStatus('prof-abc')).toEqual([
      'subscription-status',
      'prof-abc',
    ]);
  });

  it('scopes RevenueCat keys by Clerk userId', () => {
    expect(queryKeys.revenuecat.customerInfo('user-abc')).toEqual([
      'revenuecat',
      'customerInfo',
      'user-abc',
    ]);
    expect(queryKeys.revenuecat.offerings('user-abc')).toEqual([
      'revenuecat',
      'offerings',
      'user-abc',
    ]);
  });

  it('scopes profile keys by Clerk userId or profileId', () => {
    expect(queryKeys.profiles.list('user-abc')).toEqual([
      'profiles',
      'user-abc',
    ]);
    expect(queryKeys.profiles.active('prof-abc')).toEqual([
      'profile',
      'prof-abc',
    ]);
  });

  it('scopes settings keys by profileId as the final segment', () => {
    expect(queryKeys.settings.notifications('prof-abc')).toEqual([
      'settings',
      'notifications',
      'prof-abc',
    ]);
    expect(queryKeys.settings.celebrationLevel('prof-abc')).toEqual([
      'settings',
      'celebration-level',
      'prof-abc',
    ]);
    expect(queryKeys.settings.withdrawalArchive('prof-abc')).toEqual([
      'settings',
      'withdrawal-archive',
      'prof-abc',
    ]);
    expect(queryKeys.settings.familyPoolBreakdownSharing('prof-abc')).toEqual([
      'settings',
      'family-pool-breakdown-sharing',
      'prof-abc',
    ]);
    expect(
      queryKeys.settings.childCelebrationLevel('child-abc', 'prof-abc'),
    ).toEqual(['settings', 'celebration-level', 'child-abc', 'prof-abc']);
    expect(queryKeys.settings.analogyDomain('subject-abc', 'prof-abc')).toEqual(
      ['settings', 'analogy-domain', 'subject-abc', 'prof-abc'],
    );
    expect(
      queryKeys.settings.nativeLanguage('subject-abc', 'prof-abc'),
    ).toEqual(['settings', 'native-language', 'subject-abc', 'prof-abc']);
  });

  it('scopes onboarding invalidation keys by profileId', () => {
    expect(queryKeys.onboarding.learnerProfile('prof-abc')).toEqual([
      'learner-profile',
      'prof-abc',
    ]);
  });
});
