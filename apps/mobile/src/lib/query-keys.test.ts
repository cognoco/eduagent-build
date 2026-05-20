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
    expect(queryKeys.dashboard.childSessionDetail(mode, childId, sessionId))
      .toEqual(['dashboard', mode, 'child', childId, 'session', sessionId]);
  });

  it('covers dashboard child report keys', () => {
    expect(queryKeys.dashboard.childReports(mode, childId)).toEqual([
      'dashboard',
      mode,
      'child',
      childId,
      'reports',
    ]);
    expect(queryKeys.dashboard.childReportDetail(mode, childId, reportId))
      .toEqual(['dashboard', mode, 'child', childId, 'report', reportId]);
    expect(queryKeys.dashboard.childWeeklyReportDetail(mode, childId, reportId))
      .toEqual([
        'dashboard',
        mode,
        'child',
        childId,
        'weekly-report',
        reportId,
      ]);
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

  it('matches session keys across modes for invalidation', () => {
    expect(
      queryKeys.sessions.matchAnyMode(sessionId)(
        queryKeys.sessions.detail('study', sessionId, profileId),
      ),
    ).toBe(true);
    expect(
      queryKeys.sessions.matchTranscriptAnyMode(sessionId)(
        queryKeys.sessions.transcript('family', sessionId, profileId),
      ),
    ).toBe(true);
    expect(
      queryKeys.sessions.matchSummaryAnyMode(sessionId)(
        queryKeys.sessions.summary('family', sessionId, profileId),
      ),
    ).toBe(true);
  });
});

describe('queryKeys non-mode-scoped factories', () => {
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
  });
});
