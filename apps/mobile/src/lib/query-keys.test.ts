/**
 * Key-identity snapshot tests for the query-key registry.
 *
 * Each test calls a factory with sample args and asserts the returned array
 * equals the inline literal it replaced — byte-for-byte. If any factory drifts
 * from the original inline key, this file catches it immediately.
 */

import { queryKeys } from './query-keys';

describe('queryKeys.progress', () => {
  const profileId = 'prof-abc';
  const subjectId = 'sub-1';
  const topicId = 'topic-1';
  const reportId = 'report-1';

  it('subject', () => {
    expect(queryKeys.progress.subject(subjectId, profileId)).toEqual([
      'progress',
      'subject',
      subjectId,
      profileId,
    ]);
  });

  it('overview', () => {
    expect(queryKeys.progress.overview(profileId)).toEqual([
      'progress',
      'overview',
      profileId,
    ]);
  });

  it('continue', () => {
    expect(queryKeys.progress.continue(profileId)).toEqual([
      'progress',
      'continue',
      profileId,
    ]);
  });

  it('resumeTarget — with all scope fields', () => {
    expect(
      queryKeys.progress.resumeTarget(profileId, {
        subjectId: 'sub-1',
        bookId: 'book-1',
        topicId: 'topic-1',
      }),
    ).toEqual([
      'progress',
      'resume-target',
      profileId,
      'sub-1',
      'book-1',
      'topic-1',
    ]);
  });

  it('resumeTarget — missing fields become null', () => {
    expect(queryKeys.progress.resumeTarget(profileId, {})).toEqual([
      'progress',
      'resume-target',
      profileId,
      null,
      null,
      null,
    ]);
  });

  it('activeSessionForTopic', () => {
    expect(
      queryKeys.progress.activeSessionForTopic(topicId, profileId),
    ).toEqual(['progress', 'topic', topicId, 'active-session', profileId]);
  });

  it('resolveTopicSubject', () => {
    expect(queryKeys.progress.resolveTopicSubject(topicId, profileId)).toEqual([
      'progress',
      'topic',
      topicId,
      'resolve',
      profileId,
    ]);
  });

  it('reviewSummary', () => {
    expect(queryKeys.progress.reviewSummary(profileId)).toEqual([
      'progress',
      'review-summary',
      profileId,
    ]);
  });

  it('overdueTopics', () => {
    expect(queryKeys.progress.overdueTopics(profileId)).toEqual([
      'progress',
      'overdue-topics',
      profileId,
    ]);
  });

  it('topicProgress', () => {
    expect(
      queryKeys.progress.topicProgress(subjectId, topicId, profileId),
    ).toEqual(['progress', 'topic', subjectId, topicId, profileId]);
  });

  it('inventory', () => {
    expect(queryKeys.progress.inventory(profileId)).toEqual([
      'progress',
      'inventory',
      profileId,
    ]);
  });

  it('history — with query object', () => {
    const query = { from: '2026-01-01', granularity: 'weekly' as const };
    expect(queryKeys.progress.history(profileId, query)).toEqual([
      'progress',
      'history',
      profileId,
      query,
    ]);
  });

  it('history — with undefined query', () => {
    expect(queryKeys.progress.history(profileId, undefined)).toEqual([
      'progress',
      'history',
      profileId,
      undefined,
    ]);
  });

  it('milestones', () => {
    expect(queryKeys.progress.milestones(profileId, 5)).toEqual([
      'progress',
      'milestones',
      profileId,
      5,
    ]);
  });

  it('profileSessions', () => {
    const activeProfileId = 'viewer-prof';
    expect(
      queryKeys.progress.profileSessions(profileId, activeProfileId),
    ).toEqual(['progress', 'profile', profileId, 'sessions', activeProfileId]);
  });

  it('profileReports', () => {
    const activeProfileId = 'viewer-prof';
    expect(
      queryKeys.progress.profileReports(profileId, activeProfileId),
    ).toEqual(['progress', 'profile', profileId, 'reports', activeProfileId]);
  });

  it('profileWeeklyReports', () => {
    const activeProfileId = 'viewer-prof';
    expect(
      queryKeys.progress.profileWeeklyReports(profileId, activeProfileId),
    ).toEqual([
      'progress',
      'profile',
      profileId,
      'weekly-reports',
      activeProfileId,
    ]);
  });

  it('profileReportDetail', () => {
    expect(queryKeys.progress.profileReportDetail(profileId, reportId)).toEqual(
      ['progress', 'profile', profileId, 'report', reportId],
    );
  });

  it('profileWeeklyReportDetail', () => {
    expect(
      queryKeys.progress.profileWeeklyReportDetail(profileId, reportId),
    ).toEqual(['progress', 'profile', profileId, 'weekly-report', reportId]);
  });
});

describe('queryKeys.dashboard', () => {
  const profileId = 'prof-abc';
  const childProfileId = 'child-1';
  const subjectId = 'sub-1';
  const sessionId = 'sess-1';
  const reportId = 'report-1';

  it('root', () => {
    expect(queryKeys.dashboard.root(profileId)).toEqual([
      'dashboard',
      profileId,
    ]);
  });

  it('childDetail', () => {
    expect(queryKeys.dashboard.childDetail(childProfileId)).toEqual([
      'dashboard',
      'child',
      childProfileId,
    ]);
  });

  it('childSubject', () => {
    expect(queryKeys.dashboard.childSubject(childProfileId, subjectId)).toEqual(
      ['dashboard', 'child', childProfileId, 'subject', subjectId],
    );
  });

  // NOTE: plural 'children' — preserved from inline literal in useChildSessions
  it('childSessions (uses plural "children")', () => {
    expect(queryKeys.dashboard.childSessions(childProfileId)).toEqual([
      'dashboard',
      'children',
      childProfileId,
      'sessions',
    ]);
  });

  // NOTE: plural 'children' — preserved from inline literal in useChildSessionDetail
  it('childSessionDetail (uses plural "children")', () => {
    expect(
      queryKeys.dashboard.childSessionDetail(childProfileId, sessionId),
    ).toEqual(['dashboard', 'children', childProfileId, 'session', sessionId]);
  });

  // NOTE: plural 'children' — preserved from inline literal in useChildMemory
  it('childMemory (uses plural "children")', () => {
    expect(queryKeys.dashboard.childMemory(childProfileId)).toEqual([
      'dashboard',
      'children',
      childProfileId,
      'memory',
    ]);
  });

  it('childInventory', () => {
    expect(queryKeys.dashboard.childInventory(childProfileId)).toEqual([
      'dashboard',
      'child',
      childProfileId,
      'inventory',
    ]);
  });

  it('childHistory', () => {
    const query = { from: '2026-01-01' };
    expect(queryKeys.dashboard.childHistory(childProfileId, query)).toEqual([
      'dashboard',
      'child',
      childProfileId,
      'history',
      query,
    ]);
  });

  it('childProgressSummary', () => {
    expect(queryKeys.dashboard.childProgressSummary(childProfileId)).toEqual([
      'dashboard',
      'child',
      childProfileId,
      'progress-summary',
    ]);
  });

  it('childReports', () => {
    expect(queryKeys.dashboard.childReports(childProfileId)).toEqual([
      'dashboard',
      'child',
      childProfileId,
      'reports',
    ]);
  });

  it('childReportDetail', () => {
    expect(
      queryKeys.dashboard.childReportDetail(childProfileId, reportId),
    ).toEqual(['dashboard', 'child', childProfileId, 'report', reportId]);
  });

  it('childWeeklyReports', () => {
    expect(queryKeys.dashboard.childWeeklyReports(childProfileId)).toEqual([
      'dashboard',
      'child',
      childProfileId,
      'weekly-reports',
    ]);
  });

  it('childWeeklyReportDetail', () => {
    expect(
      queryKeys.dashboard.childWeeklyReportDetail(childProfileId, reportId),
    ).toEqual([
      'dashboard',
      'child',
      childProfileId,
      'weekly-report',
      reportId,
    ]);
  });
});

describe('queryKeys.sessions', () => {
  const sessionId = 'sess-1';
  const profileId = 'prof-abc';
  const subjectId = 'sub-1';
  const topicId = 'topic-1';

  it('detail', () => {
    expect(queryKeys.sessions.detail(sessionId, profileId)).toEqual([
      'session',
      sessionId,
      profileId,
    ]);
  });

  it('transcript', () => {
    expect(queryKeys.sessions.transcript(sessionId, profileId)).toEqual([
      'session-transcript',
      sessionId,
      profileId,
    ]);
  });

  it('summary', () => {
    expect(queryKeys.sessions.summary(sessionId, profileId)).toEqual([
      'session-summary',
      sessionId,
      profileId,
    ]);
  });

  it('parkingLot', () => {
    expect(queryKeys.sessions.parkingLot(sessionId, profileId)).toEqual([
      'parking-lot',
      sessionId,
      profileId,
    ]);
  });

  it('topicParkingLot', () => {
    expect(
      queryKeys.sessions.topicParkingLot(subjectId, topicId, profileId),
    ).toEqual(['parking-lot', 'topic', subjectId, topicId, profileId]);
  });
});

describe('queryKeys.retention', () => {
  const profileId = 'prof-abc';
  const subjectId = 'sub-1';
  const topicId = 'topic-1';

  it('subject', () => {
    expect(queryKeys.retention.subject(subjectId, profileId)).toEqual([
      'retention',
      'subject',
      subjectId,
      profileId,
    ]);
  });

  it('topic', () => {
    expect(queryKeys.retention.topic(topicId, profileId)).toEqual([
      'retention',
      'topic',
      topicId,
      profileId,
    ]);
  });

  it('evaluateEligibility', () => {
    expect(queryKeys.retention.evaluateEligibility(topicId, profileId)).toEqual(
      ['evaluate-eligibility', topicId, profileId],
    );
  });

  it('teachingPreference', () => {
    expect(
      queryKeys.retention.teachingPreference(subjectId, profileId),
    ).toEqual(['retention', 'teaching-preference', subjectId, profileId]);
  });
});

describe('queryKeys.languageProgress', () => {
  it('subject', () => {
    expect(queryKeys.languageProgress.subject('prof-abc', 'sub-1')).toEqual([
      'language-progress',
      'prof-abc',
      'sub-1',
    ]);
  });
});

describe('queryKeys.vocabulary', () => {
  it('subject', () => {
    expect(queryKeys.vocabulary.subject('prof-abc', 'sub-1')).toEqual([
      'vocabulary',
      'prof-abc',
      'sub-1',
    ]);
  });
});

describe('queryKeys.resumeNudge', () => {
  it('root', () => {
    expect(queryKeys.resumeNudge.root('prof-abc')).toEqual([
      'resume-nudge',
      'prof-abc',
    ]);
  });

  it('root — undefined profileId', () => {
    expect(queryKeys.resumeNudge.root(undefined)).toEqual([
      'resume-nudge',
      undefined,
    ]);
  });
});

describe('key isolation — different profileIds produce different keys', () => {
  it('progress.overview — profile A vs B', () => {
    const keyA = queryKeys.progress.overview('prof-A');
    const keyB = queryKeys.progress.overview('prof-B');
    expect(keyA).not.toEqual(keyB);
  });

  it('progress.inventory — undefined vs defined', () => {
    const keyDefined = queryKeys.progress.inventory('prof-A');
    const keyUndefined = queryKeys.progress.inventory(undefined);
    expect(keyDefined).not.toEqual(keyUndefined);
  });

  it('dashboard.root — profile A vs B', () => {
    expect(queryKeys.dashboard.root('prof-A')).not.toEqual(
      queryKeys.dashboard.root('prof-B'),
    );
  });

  it('sessions.detail — same session, different profiles', () => {
    expect(queryKeys.sessions.detail('sess-1', 'prof-A')).not.toEqual(
      queryKeys.sessions.detail('sess-1', 'prof-B'),
    );
  });

  // Parent-proxy isolation: same target child, different viewer/parent profiles
  it('progress.profileReports — same child, different active viewers', () => {
    const childId = 'child-1';
    const keyParentA = queryKeys.progress.profileReports(childId, 'parent-A');
    const keyParentB = queryKeys.progress.profileReports(childId, 'parent-B');
    expect(keyParentA).not.toEqual(keyParentB);
  });

  it('progress.profileSessions — same child, different active viewers', () => {
    const childId = 'child-1';
    const keyParentA = queryKeys.progress.profileSessions(childId, 'parent-A');
    const keyParentB = queryKeys.progress.profileSessions(childId, 'parent-B');
    expect(keyParentA).not.toEqual(keyParentB);
  });
});
