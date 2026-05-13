import { describe, expect, it } from '@jest/globals';

import type { KnowledgeInventory } from '@eduagent/schemas';

import {
  buildProgressSummaryPrompt,
  classifyActivityState,
  computeNudgeRecommended,
  deterministicProgressSummaryFallback,
} from './progress-summary';

describe('classifyActivityState', () => {
  const now = new Date('2026-05-13T12:00:00Z');

  it('returns fresh when summary is based on latest session and session is recent', () => {
    expect(
      classifyActivityState(
        new Date('2026-05-12T10:00:00Z'),
        new Date('2026-05-12T10:00:00Z'),
        now,
      ),
    ).toBe('fresh');
  });

  it('returns stale when latest session is newer than summary basis', () => {
    expect(
      classifyActivityState(
        new Date('2026-05-11T10:00:00Z'),
        new Date('2026-05-12T10:00:00Z'),
        now,
      ),
    ).toBe('stale');
  });

  it('returns no_recent_activity when summary is current but session is old', () => {
    expect(
      classifyActivityState(
        new Date('2026-05-10T10:00:00Z'),
        new Date('2026-05-10T10:00:00Z'),
        now,
      ),
    ).toBe('no_recent_activity');
  });

  it('returns no_recent_activity when no summary and no session', () => {
    expect(classifyActivityState(null, null, now)).toBe('no_recent_activity');
  });

  it('returns stale when no summary but session exists', () => {
    expect(
      classifyActivityState(null, new Date('2026-05-12T10:00:00Z'), now),
    ).toBe('stale');
  });
});

describe('computeNudgeRecommended', () => {
  const now = new Date('2026-05-13T12:00:00Z');

  it('returns false when session is within 3 days', () => {
    expect(computeNudgeRecommended(new Date('2026-05-11T12:00:00Z'), now)).toBe(
      false,
    );
  });

  it('returns true when session is 3+ days old', () => {
    expect(computeNudgeRecommended(new Date('2026-05-10T11:00:00Z'), now)).toBe(
      true,
    );
  });

  it('returns true when no session exists', () => {
    expect(computeNudgeRecommended(null, now)).toBe(true);
  });
});

describe('deterministicProgressSummaryFallback', () => {
  it('uses child name without requiring a generated summary', () => {
    expect(deterministicProgressSummaryFallback('Emma', null)).toContain(
      'Emma',
    );
  });
});

describe('buildProgressSummaryPrompt', () => {
  function makeInventory(
    overrides: Partial<KnowledgeInventory> = {},
  ): KnowledgeInventory {
    return {
      profileId: '00000000-0000-0000-0000-000000000001',
      snapshotDate: '2026-05-13',
      currentlyWorkingOn: [],
      thisWeekMini: { sessions: 0, wordsLearned: 0, topicsTouched: 0 },
      global: {
        topicsAttempted: 5,
        topicsMastered: 3,
        vocabularyTotal: 20,
        vocabularyMastered: 12,
        weeklyDeltaTopicsMastered: null,
        weeklyDeltaVocabularyTotal: null,
        weeklyDeltaTopicsExplored: null,
        totalSessions: 10,
        totalActiveMinutes: 120,
        totalWallClockMinutes: 150,
        currentStreak: 2,
        longestStreak: 5,
      },
      subjects: [],
      ...overrides,
    };
  }

  function makeSubject(
    overrides: Partial<KnowledgeInventory['subjects'][number]> = {},
  ): KnowledgeInventory['subjects'][number] {
    return {
      subjectId: '00000000-0000-4000-8000-000000000101',
      subjectName: 'Mathematics',
      pedagogyMode: 'socratic',
      sessionsCount: 1,
      activeMinutes: 10,
      wallClockMinutes: 12,
      lastSessionAt: null,
      topics: {
        total: 1,
        explored: 0,
        mastered: 0,
        inProgress: 1,
        notStarted: 0,
      },
      vocabulary: {
        total: 0,
        mastered: 0,
        learning: 0,
        new: 0,
        byCefrLevel: {},
      },
      estimatedProficiency: null,
      estimatedProficiencyLabel: null,
      ...overrides,
    };
  }

  it('returns system and user prompts', () => {
    const result = buildProgressSummaryPrompt({
      childName: 'Emma',
      inventory: makeInventory(),
      latestSessionAt: new Date('2026-05-13T10:00:00Z'),
    });

    expect(result.system).toBeTruthy();
    expect(result.user).toBeTruthy();
    expect(result.system).toContain('warm');
    expect(result.system).toContain('500');
  });

  it('embeds child name in XML tag', () => {
    const result = buildProgressSummaryPrompt({
      childName: 'Emma',
      inventory: makeInventory(),
      latestSessionAt: new Date('2026-05-13T10:00:00Z'),
    });

    expect(result.user).toContain('<child_name>Emma</child_name>');
  });

  it('sanitizes child name with XML-unsafe characters', () => {
    const result = buildProgressSummaryPrompt({
      childName: '<script>alert("xss")</script>',
      inventory: makeInventory(),
      latestSessionAt: new Date('2026-05-13T10:00:00Z'),
    });

    expect(result.user).not.toContain('<script>');
    expect(result.user).toContain('<child_name>');
  });

  it('falls back to "the learner" for empty name', () => {
    const result = buildProgressSummaryPrompt({
      childName: '',
      inventory: makeInventory(),
      latestSessionAt: new Date('2026-05-13T10:00:00Z'),
    });

    expect(result.user).toContain('<child_name>the learner</child_name>');
  });

  it('embeds global totals as escaped JSON', () => {
    const result = buildProgressSummaryPrompt({
      childName: 'Lukas',
      inventory: makeInventory(),
      latestSessionAt: new Date('2026-05-13T10:00:00Z'),
    });

    expect(result.user).toContain('<global_totals>');
    expect(result.user).toContain('</global_totals>');
    expect(result.user).toContain('&quot;sessions&quot;:10');
    expect(result.user).toContain('&quot;currentStreak&quot;:2');
  });

  it('shows "No subject inventory" when subjects array is empty', () => {
    const result = buildProgressSummaryPrompt({
      childName: 'Lukas',
      inventory: makeInventory({ subjects: [] }),
      latestSessionAt: new Date('2026-05-13T10:00:00Z'),
    });

    expect(result.user).toContain('No subject inventory exists yet.');
  });

  it('includes subject details when subjects are present', () => {
    const result = buildProgressSummaryPrompt({
      childName: 'Lukas',
      inventory: makeInventory({
        subjects: [
          makeSubject({
            subjectId: 's1',
            subjectName: 'Mathematics',
            sessionsCount: 5,
            activeMinutes: 60,
            wallClockMinutes: 75,
            lastSessionAt: '2026-05-12T10:00:00.000Z',
            topics: {
              total: 4,
              explored: 3,
              mastered: 2,
              inProgress: 1,
              notStarted: 1,
            },
          }),
        ],
      }),
      latestSessionAt: new Date('2026-05-13T10:00:00Z'),
    });

    expect(result.user).toContain('Mathematics');
    expect(result.user).toContain('5 sessions');
    expect(result.user).toContain('2/4 topics mastered');
  });

  it('truncates to 8 subjects', () => {
    const subjects = Array.from({ length: 12 }, (_, i) =>
      makeSubject({
        subjectId: `s${i}`,
        subjectName: `Subject ${i}`,
        sessionsCount: 1,
        activeMinutes: 10,
        wallClockMinutes: 12,
        lastSessionAt: null,
      }),
    );

    const result = buildProgressSummaryPrompt({
      childName: 'Lukas',
      inventory: makeInventory({ subjects }),
      latestSessionAt: new Date('2026-05-13T10:00:00Z'),
    });

    expect(result.user).toContain('Subject 7');
    expect(result.user).not.toContain('Subject 8');
  });

  it('sanitizes subject names with XML-unsafe characters', () => {
    const result = buildProgressSummaryPrompt({
      childName: 'Lukas',
      inventory: makeInventory({
        subjects: [
          makeSubject({
            subjectId: 's1',
            subjectName: 'Math <advanced>',
            sessionsCount: 1,
            activeMinutes: 10,
            wallClockMinutes: 12,
            lastSessionAt: null,
          }),
        ],
      }),
      latestSessionAt: new Date('2026-05-13T10:00:00Z'),
    });

    expect(result.user).not.toContain('<advanced>');
  });

  it('includes ISO timestamp for latest session', () => {
    const result = buildProgressSummaryPrompt({
      childName: 'Emma',
      inventory: makeInventory(),
      latestSessionAt: new Date('2026-05-13T10:00:00Z'),
    });

    expect(result.user).toContain('2026-05-13T10:00:00.000Z');
  });
});
