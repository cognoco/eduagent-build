import {
  buildMilestoneLabels,
  buildSessionTakeaways,
  deriveSessionSummaryCopy,
  deriveSessionSummaryMode,
  deriveSessionSummaryVisibility,
  parseFastCelebrationsParam,
  parseMilestonesParam,
  resolveNumberParam,
} from './session-summary-derived';

const { translate: t } = require('../../../test-utils/mock-i18n') as {
  translate: (key: string, opts?: Record<string, unknown>) => string;
};

describe('resolveNumberParam', () => {
  it('preserves an explicit zero instead of falling back', () => {
    expect(resolveNumberParam('0', 7)).toBe(0);
  });

  it('uses the fallback for missing or malformed values', () => {
    expect(resolveNumberParam(undefined, 4)).toBe(4);
    expect(resolveNumberParam('not-a-number', 4)).toBe(4);
  });
});

describe('parseMilestonesParam', () => {
  it('uses fallback milestones and reports non-array payloads', () => {
    const reportNonArray = jest.fn();

    expect(
      parseMilestonesParam({
        milestonesParam: encodeURIComponent(JSON.stringify({ bad: true })),
        fallbackMilestones: ['persistent'],
        reportNonArray,
      }),
    ).toEqual(['persistent']);
    expect(reportNonArray).toHaveBeenCalledWith(
      encodeURIComponent(JSON.stringify({ bad: true })),
    );
  });

  it('filters non-string milestone values', () => {
    expect(
      parseMilestonesParam({
        milestonesParam: encodeURIComponent(
          JSON.stringify(['comet', 42, null, 'deep_diver']),
        ),
        fallbackMilestones: [],
      }),
    ).toEqual(['comet', 'deep_diver']);
  });

  it('uses fallback milestones and reports parse failures', () => {
    const reportParseError = jest.fn();

    expect(
      parseMilestonesParam({
        milestonesParam: '%E0%A4%A',
        fallbackMilestones: ['polar_star'],
        reportParseError,
      }),
    ).toEqual(['polar_star']);
    expect(reportParseError).toHaveBeenCalledWith(
      expect.any(Error),
      '%E0%A4%A',
    );
  });
});

describe('parseFastCelebrationsParam', () => {
  it('returns an empty list for malformed or non-array payloads', () => {
    expect(parseFastCelebrationsParam('%E0%A4%A')).toEqual([]);
    expect(
      parseFastCelebrationsParam(
        encodeURIComponent(JSON.stringify({ reason: 'not-array' })),
      ),
    ).toEqual([]);
  });
});

describe('deriveSessionSummaryMode', () => {
  it('gives homework precedence over other mode hints', () => {
    expect(
      deriveSessionSummaryMode({
        sessionTypeParam: 'freeform',
        transcriptSessionType: 'homework',
        effectiveSessionMode: 'freeform',
      }),
    ).toBe('homework');
  });

  it('uses the effective session mode for freeform detection', () => {
    expect(
      deriveSessionSummaryMode({
        effectiveSessionMode: 'freeform',
      }),
    ).toBe('freeform');
  });
});

describe('deriveSessionSummaryCopy', () => {
  it('returns homework-specific recap and placeholder copy', () => {
    expect(deriveSessionSummaryCopy('homework')).toEqual({
      recapHeader: 'What you practiced',
      reflectionPlaceholder: 'What I practiced...',
    });
  });
});

describe('buildSessionTakeaways', () => {
  it('suppresses duration copy until duration is resolved', () => {
    expect(
      buildSessionTakeaways({
        hasResolvedDuration: false,
        wallClockMinutes: 1,
        exchanges: 0,
        rung: 1,
        t,
      }),
    ).toEqual(['Great effort today']);
  });

  it('includes duration, exchange, and challenge copy when available', () => {
    expect(
      buildSessionTakeaways({
        hasResolvedDuration: true,
        wallClockMinutes: 12,
        exchanges: 5,
        rung: 3,
        t,
      }),
    ).toEqual([
      '12 minutes - great session!',
      'You worked through 5 exchanges',
      'You tackled some challenging concepts with guidance',
    ]);
  });
});

describe('buildMilestoneLabels', () => {
  it('maps known milestones and leaves custom labels alone', () => {
    expect(buildMilestoneLabels(['polar_star', 'custom'])).toEqual([
      'Polar Star - first independent answer',
      'custom',
    ]);
  });
});

describe('deriveSessionSummaryVisibility', () => {
  it('hides proxy-private rows while allowing consented mentor memory access', () => {
    expect(
      deriveSessionSummaryVisibility({
        exchanges: 6,
        bookmarkCount: 0,
        totalSessionCount: 2,
        isProxyMode: true,
        childConsentStatus: 'CONSENTED',
        childId: 'child-1',
        resolvedTopicCount: 2,
        suggestionCount: 1,
        transcriptPurgedAt: '2026-05-26T10:00:00.000Z',
      }),
    ).toEqual({
      shouldShowMentorMemoryCue: true,
      shouldShowBookmarkPrompt: true,
      shouldShowMasteredRow: false,
      shouldShowSuggestionsRail: true,
      isTranscriptPurged: true,
    });
  });

  it('requires enough sessions and proxy access before showing mentor memory', () => {
    expect(
      deriveSessionSummaryVisibility({
        exchanges: 6,
        bookmarkCount: 0,
        totalSessionCount: 1,
        isProxyMode: true,
        childConsentStatus: 'PENDING',
        childId: 'child-1',
        resolvedTopicCount: 0,
        suggestionCount: 0,
        transcriptPurgedAt: null,
      }).shouldShowMentorMemoryCue,
    ).toBe(false);
  });
});
