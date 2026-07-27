import type { DashboardChild, RecapListItem } from '@eduagent/schemas';

import { translate } from '../../test-utils/mock-i18n';
import type { Translate } from '../../i18n';
import en from '../../i18n/locales/en.json';
import {
  resolveHouseholdPulse,
  resolveParentCardCopy,
} from './parent-card-copy';

// Pure-function test: drive the real en.json strings through the shared i18n
// mock (same lookup + interpolation as runtime) and assert rendered copy.
const t = translate as unknown as Translate;
const NOW = new Date('2026-05-30T12:00:00.000Z');

function makeChild(overrides: Partial<DashboardChild> = {}): DashboardChild {
  return {
    profileId: 'child-1',
    displayName: 'Lilly',
    consentStatus: null,
    respondedAt: null,
    summary: '',
    sessionsThisWeek: 0,
    sessionsLastWeek: 0,
    totalTimeThisWeek: 0,
    totalTimeLastWeek: 0,
    exchangesThisWeek: 0,
    exchangesLastWeek: 0,
    trend: 'stable',
    subjects: [],
    guidedVsImmediateRatio: 0,
    retentionTrend: 'stable',
    totalSessions: 5,
    currentlyWorkingOn: [],
    currentStreak: 0,
    longestStreak: 0,
    totalXp: 0,
    ...overrides,
  };
}

function makeRecap(overrides: Partial<RecapListItem> = {}): RecapListItem {
  return {
    recapId: 'r1',
    sessionId: 's1',
    childProfileId: 'child-1',
    childDisplayName: 'Lilly',
    subjectId: 'sub-1',
    subjectName: 'Mathematics',
    topicId: null,
    topicTitle: null,
    sessionType: 'learning',
    startedAt: '2026-05-30T10:00:00.000Z',
    endedAt: null,
    exchangeCount: 3,
    displayTitle: 'Session',
    displaySummary: null,
    highlight: null,
    narrative: null,
    conversationPrompt: null,
    engagementSignal: null,
    nextTopicTitle: null,
    nextTopicReason: null,
    verifiedProof: { status: 'absent' },
    ...overrides,
  };
}

describe('resolveParentCardCopy', () => {
  it('uses the recap highlight as the headline in the active state', () => {
    const child = makeChild({ sessionsThisWeek: 2 });
    const recap = makeRecap({ highlight: 'Cracked equivalent fractions' });

    const copy = resolveParentCardCopy(child, recap, t, NOW);

    expect(copy.isActive).toBe(true);
    expect(copy.headline).toBe('Cracked equivalent fractions');
  });

  it('formats the weeklyHeadline object when there is no recap (never the raw object)', () => {
    const child = makeChild({
      sessionsThisWeek: 1,
      weeklyHeadline: {
        label: 'Topics mastered',
        value: 3,
        comparison: 'up from 1',
      },
    });

    const copy = resolveParentCardCopy(child, null, t, NOW);

    expect(copy.headline).toBe('Topics mastered: 3 (up from 1)');
    expect(copy.headline).not.toContain('[object Object]');
  });

  it('renders a quiet-with-focus headline and one starter when there is history but no activity', () => {
    const child = makeChild({
      sessionsThisWeek: 0,
      totalSessions: 8,
      currentlyWorkingOn: ['Programming'],
    });

    const copy = resolveParentCardCopy(child, null, t, NOW);

    expect(copy.isActive).toBe(false);
    expect(copy.headline).toBe(
      'Lilly had a quieter week — last time the focus was Programming.',
    );
    expect(copy.starter).toBe(
      'Ask Lilly what would make Programming easy to restart.',
    );
    expect(copy.momentum).toEqual([]);
  });

  it('renders the new-learner headline when the child has never studied', () => {
    const child = makeChild({
      sessionsThisWeek: 0,
      totalSessions: 0,
      subjects: [{ name: 'Mathematics', retentionStatus: 'unknown' }],
    });

    const copy = resolveParentCardCopy(child, null, t, NOW);

    expect(copy.headline).toBe(
      "Lilly is all set up — chosen subjects: Mathematics. Here's how to help them begin.",
    );
    expect(copy.statusWord).toBe('Just getting started');
  });

  it('includes only positive momentum chips', () => {
    const child = makeChild({
      sessionsThisWeek: 3,
      currentStreak: 5,
      progress: {
        snapshotDate: '2026-05-29',
        topicsMastered: 4,
        vocabularyTotal: 20,
        minutesThisWeek: 30,
        weeklyDeltaTopicsMastered: 2,
        weeklyDeltaVocabularyTotal: 0,
        weeklyDeltaTopicsExplored: 0,
        engagementTrend: 'increasing',
        guidance: null,
      },
    });

    const copy = resolveParentCardCopy(child, null, t, NOW);

    expect(copy.momentum).toHaveLength(2);
    expect(copy.momentum.map((chip) => chip.label)).toEqual([
      '5-day streak',
      '+2 topics',
    ]);
  });

  it('hides the momentum strip when every value is zero', () => {
    const child = makeChild({
      sessionsThisWeek: 3,
      currentStreak: 1,
      progress: {
        snapshotDate: '2026-05-29',
        topicsMastered: 0,
        vocabularyTotal: 0,
        minutesThisWeek: 10,
        weeklyDeltaTopicsMastered: 0,
        weeklyDeltaVocabularyTotal: 0,
        weeklyDeltaTopicsExplored: 0,
        engagementTrend: 'stable',
        guidance: null,
      },
    });

    const copy = resolveParentCardCopy(child, null, t, NOW);

    expect(copy.momentum).toEqual([]);
  });

  it('treats a null progress as all-zero momentum without crashing', () => {
    const child = makeChild({
      sessionsThisWeek: 3,
      currentStreak: 0,
      progress: null,
    });

    expect(() => resolveParentCardCopy(child, null, t, NOW)).not.toThrow();
    expect(resolveParentCardCopy(child, null, t, NOW).momentum).toEqual([]);
  });

  it('lists only strong subjects in the solid line', () => {
    const child = makeChild({
      sessionsThisWeek: 3,
      subjects: [
        { name: 'Fractions', retentionStatus: 'strong' },
        { name: 'Decimals', retentionStatus: 'strong' },
        { name: 'Algebra', retentionStatus: 'weak' },
      ],
    });

    const copy = resolveParentCardCopy(child, null, t, NOW);

    expect(copy.solid).toBe('Solid: Fractions, Decimals');
    expect(copy.solid).not.toContain('Algebra');
  });

  it('returns null solid when no subject is strong', () => {
    const child = makeChild({
      sessionsThisWeek: 3,
      subjects: [
        { name: 'Algebra', retentionStatus: 'weak' },
        { name: 'Geometry', retentionStatus: 'fading' },
      ],
    });

    expect(resolveParentCardCopy(child, null, t, NOW).solid).toBeNull();
  });

  it('surfaces the recap next-topic in the coming-up line, or null when absent', () => {
    const child = makeChild({ sessionsThisWeek: 2 });

    const withNext = resolveParentCardCopy(
      child,
      makeRecap({ nextTopicTitle: 'Comparing fractions' }),
      t,
      NOW,
    );
    expect(withNext.comingUp).toContain('Comparing fractions');

    const withoutNext = resolveParentCardCopy(
      child,
      makeRecap({ nextTopicTitle: null }),
      t,
      NOW,
    );
    expect(withoutNext.comingUp).toBeNull();
  });

  it('hides solid and coming-up in the quiet state regardless of subject/recap data', () => {
    const child = makeChild({
      sessionsThisWeek: 0,
      subjects: [{ name: 'Fractions', retentionStatus: 'strong' }],
    });
    // An OLD recap (30 days ago) must not flip the card to active.
    const staleRecap = makeRecap({
      startedAt: '2026-04-30T10:00:00.000Z',
      nextTopicTitle: 'Comparing fractions',
    });

    const copy = resolveParentCardCopy(child, staleRecap, t, NOW);

    expect(copy.isActive).toBe(false);
    expect(copy.solid).toBeNull();
    expect(copy.comingUp).toBeNull();
  });

  describe('negative-framing guard', () => {
    const BANNED = /weak|forgotten|struggl|behind|declining|needs attention/i;

    it('contains no banned phrase in any authored card or pulse template', () => {
      const templates = [
        ...Object.values(en.home.parent.card),
        ...Object.values(en.home.parent.pulse),
      ];
      for (const template of templates) {
        expect(template).not.toMatch(BANNED);
      }
    });

    it('does not trip on user-controlled subject/topic names interpolated into copy', () => {
      // A chemistry subject literally named "Weak acids" and a history topic
      // "Forgotten empires" are legitimate data — they must flow through to the
      // rendered strings even though they contain otherwise-banned words.
      const child = makeChild({
        sessionsThisWeek: 2,
        subjects: [{ name: 'Weak acids', retentionStatus: 'strong' }],
      });
      const recap = makeRecap({ nextTopicTitle: 'Forgotten empires' });

      const copy = resolveParentCardCopy(child, recap, t, NOW);

      expect(copy.solid).toContain('Weak acids');
      expect(copy.comingUp).toContain('Forgotten empires');
    });
  });
});

describe('resolveHouseholdPulse', () => {
  it('returns null when there are no children', () => {
    expect(resolveHouseholdPulse([], t)).toBeNull();
  });

  it('reports a single active child', () => {
    const pulse = resolveHouseholdPulse(
      [makeChild({ displayName: 'Lilly', sessionsThisWeek: 2 })],
      t,
    );
    expect(pulse).toBe('Lilly has been active this week.');
  });

  it('reports a single quiet child', () => {
    const pulse = resolveHouseholdPulse(
      [makeChild({ displayName: 'Lilly', sessionsThisWeek: 0 })],
      t,
    );
    expect(pulse).toBe('A quieter week for Lilly.');
  });

  it('reports all-active for multiple children', () => {
    const pulse = resolveHouseholdPulse(
      [
        makeChild({ profileId: 'a', sessionsThisWeek: 2 }),
        makeChild({ profileId: 'b', sessionsThisWeek: 1 }),
      ],
      t,
    );
    expect(pulse).toBe('2 learners, all active this week.');
  });

  it('reports a mixed household', () => {
    const pulse = resolveHouseholdPulse(
      [
        makeChild({ profileId: 'a', sessionsThisWeek: 2 }),
        makeChild({ profileId: 'b', sessionsThisWeek: 0 }),
      ],
      t,
    );
    expect(pulse).toBe('2 learners, 1 active this week.');
  });

  it('reports a fully quiet household', () => {
    const pulse = resolveHouseholdPulse(
      [
        makeChild({ profileId: 'a', sessionsThisWeek: 0 }),
        makeChild({ profileId: 'b', sessionsThisWeek: 0 }),
      ],
      t,
    );
    expect(pulse).toBe('2 learners — a quieter week so far.');
  });
});
