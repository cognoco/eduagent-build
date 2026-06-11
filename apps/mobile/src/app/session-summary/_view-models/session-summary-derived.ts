import type { Translate } from '../../../i18n';

export type SessionSummaryMode = 'learning' | 'freeform' | 'homework';

export interface FastCelebrationSummary {
  reason?: string;
  detail?: string | null;
}

export function resolveNumberParam(
  rawValue: string | undefined,
  fallback: number,
): number {
  const trimmed = (rawValue ?? '').trim();
  const parsed = trimmed === '' ? NaN : Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function deriveSessionSummaryMode(args: {
  sessionTypeParam?: string;
  transcriptSessionType?: string | null;
  effectiveSessionMode?: string | null;
}): SessionSummaryMode {
  if (
    args.sessionTypeParam === 'homework' ||
    args.transcriptSessionType === 'homework'
  ) {
    return 'homework';
  }

  if (
    args.sessionTypeParam === 'freeform' ||
    args.effectiveSessionMode === 'freeform'
  ) {
    return 'freeform';
  }

  return 'learning';
}

export function deriveSessionSummaryCopy(sessionType: SessionSummaryMode): {
  recapHeader: string;
  reflectionPlaceholder: string;
} {
  if (sessionType === 'homework') {
    return {
      recapHeader: 'What you practiced',
      reflectionPlaceholder: 'What I practiced...',
    };
  }

  if (sessionType === 'freeform') {
    return {
      recapHeader: 'What you asked about',
      reflectionPlaceholder: 'What I found out...',
    };
  }

  return {
    recapHeader: 'What you explored',
    reflectionPlaceholder: 'In my own words...',
  };
}

export function parseMilestonesParam(args: {
  milestonesParam?: string;
  fallbackMilestones: readonly string[];
  reportNonArray?: (milestonesParam: string) => void;
  reportParseError?: (error: Error, milestonesParam: string) => void;
}): string[] {
  if (!args.milestonesParam) {
    return [...args.fallbackMilestones];
  }

  try {
    const raw = JSON.parse(decodeURIComponent(args.milestonesParam)) as unknown;
    if (!Array.isArray(raw)) {
      args.reportNonArray?.(args.milestonesParam);
      return [...args.fallbackMilestones];
    }

    return raw.filter((value): value is string => typeof value === 'string');
  } catch (error) {
    args.reportParseError?.(
      error instanceof Error ? error : new Error(String(error)),
      args.milestonesParam,
    );
    return [...args.fallbackMilestones];
  }
}

export function parseFastCelebrationsParam(
  fastCelebrationsParam?: string,
): FastCelebrationSummary[] {
  try {
    const raw = JSON.parse(
      decodeURIComponent(fastCelebrationsParam ?? '[]'),
    ) as unknown;
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((value): value is Record<string, unknown> => value != null)
      .map((value) => ({
        reason: typeof value.reason === 'string' ? value.reason : undefined,
        detail:
          typeof value.detail === 'string' || value.detail === null
            ? value.detail
            : undefined,
      }));
  } catch {
    return [];
  }
}

export function buildSessionTakeaways(args: {
  hasResolvedDuration: boolean;
  wallClockMinutes: number;
  exchanges: number;
  rung: number;
  t: Translate;
}): string[] {
  const takeaways: string[] = [];
  if (args.hasResolvedDuration) {
    takeaways.push(
      args.t('sessionSummary.takeaways.duration', {
        count: args.wallClockMinutes,
      }),
    );
  }
  if (args.exchanges > 0) {
    takeaways.push(
      args.t('sessionSummary.takeaways.exchanges', { count: args.exchanges }),
    );
  }
  if (args.rung >= 3) {
    takeaways.push('You tackled some challenging concepts with guidance');
  } else if (args.exchanges > 0) {
    takeaways.push('You showed strong independent thinking');
  }
  if (takeaways.length === 0) {
    takeaways.push('Great effort today');
  }

  return takeaways;
}

export function buildMilestoneLabels(milestones: readonly string[]): string[] {
  return milestones.map((milestone) => {
    switch (milestone) {
      case 'polar_star':
        return 'Polar Star - first independent answer';
      case 'deep_diver':
        return 'Deep Diver - great thoughtful responses';
      case 'comet':
        return 'Comet - you had a breakthrough!';
      case 'orions_belt':
        return "Orion's Belt - 5 in a row without help!";
      case 'persistent':
        return 'Persistent - you kept going';
      case 'twin_stars':
        return 'Twin Stars - three strong answers in a row';
      default:
        return milestone;
    }
  });
}

export function deriveSessionSummaryVisibility(args: {
  exchanges: number;
  bookmarkCount: number;
  totalSessionCount: number;
  isProxyMode: boolean;
  childConsentStatus?: string | null;
  childId?: string | null;
  resolvedTopicCount: number;
  suggestionCount: number;
  transcriptPurgedAt?: string | null;
}): {
  shouldShowMentorMemoryCue: boolean;
  shouldShowBookmarkPrompt: boolean;
  shouldShowMasteredRow: boolean;
  shouldShowSuggestionsRail: boolean;
  isTranscriptPurged: boolean;
} {
  const hasMentorMemorySignal = args.totalSessionCount >= 2;
  const hasParentProxyMemoryAccess =
    !args.isProxyMode ||
    (args.childConsentStatus === 'CONSENTED' && !!args.childId);

  return {
    shouldShowMentorMemoryCue:
      hasMentorMemorySignal && hasParentProxyMemoryAccess,
    shouldShowBookmarkPrompt:
      args.exchanges >= 5 &&
      args.bookmarkCount === 0 &&
      args.totalSessionCount <= 3,
    shouldShowMasteredRow: args.resolvedTopicCount > 0 && !args.isProxyMode,
    shouldShowSuggestionsRail: args.suggestionCount > 0,
    isTranscriptPurged: !!args.transcriptPurgedAt,
  };
}
