import { type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BaseCoachingCard } from './BaseCoachingCard';
import { RetentionSignal, type RetentionStatus } from '../progress';
import { useThemeColors } from '../../lib/theme';
import {
  isNewLearner,
  sessionsUntilFullProgress,
} from '../../lib/progressive-disclosure';

interface SubjectInfo {
  name: string;
  retentionStatus: RetentionStatus;
}

interface ParentDashboardSummaryProps {
  childName: string;
  summary: string;
  subjects: SubjectInfo[];
  trend: 'up' | 'down' | 'stable';
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  totalTimeThisWeek: number;
  totalTimeLastWeek: number;
  retentionTrend?: 'improving' | 'declining' | 'stable';
  totalSessions?: number;
  progress?: {
    topicsMastered: number;
    vocabularyTotal: number;
    weeklyDeltaTopicsMastered: number | null;
    weeklyDeltaVocabularyTotal: number | null;
    weeklyDeltaTopicsExplored: number | null;
    engagementTrend: 'increasing' | 'stable' | 'declining';
    guidance: string | null;
  } | null;
  onDrillDown: () => void;
  isLoading?: boolean;
}

const TREND_ARROWS: Record<'up' | 'down' | 'stable', string> = {
  up: '\u2191',
  down: '\u2193',
  stable: '\u2192',
};

const TREND_LABELS: Record<'up' | 'down' | 'stable', string> = {
  up: 'up from',
  down: 'down from',
  stable: 'same as',
};

const RETENTION_TREND_CONFIG: Record<
  'improving' | 'declining' | 'stable',
  { arrow: string; label: string; className: string }
> = {
  improving: {
    arrow: '\u2191',
    label: 'Improving',
    className: 'text-retention-strong',
  },
  declining: {
    arrow: '\u2193',
    label: 'Declining',
    className: 'text-retention-weak',
  },
  stable: {
    arrow: '\u2192',
    label: 'Stable',
    className: 'text-text-secondary',
  },
};

const AGGREGATE_SIGNAL_CONFIG: Record<
  'on-track' | 'needs-attention' | 'falling-behind',
  {
    icon: keyof typeof Ionicons.glyphMap;
    colorKey: 'retentionStrong' | 'retentionFading' | 'retentionWeak';
    label: string;
    textColor: string;
  }
> = {
  'on-track': {
    icon: 'leaf',
    colorKey: 'retentionStrong',
    label: 'On Track',
    textColor: 'text-retention-strong',
  },
  'needs-attention': {
    icon: 'flame',
    colorKey: 'retentionFading',
    label: 'Needs Attention',
    textColor: 'text-retention-fading',
  },
  'falling-behind': {
    icon: 'sparkles',
    colorKey: 'retentionWeak',
    label: 'Falling Behind',
    textColor: 'text-retention-weak',
  },
};

type AggregateSignal = keyof typeof AGGREGATE_SIGNAL_CONFIG;

function deriveAggregateSignal(
  subjects: SubjectInfo[]
): AggregateSignal | null {
  if (subjects.length === 0) return null;

  const hasWeakOrForgotten = subjects.some(
    (s) => s.retentionStatus === 'weak' || s.retentionStatus === 'forgotten'
  );
  if (hasWeakOrForgotten) return 'falling-behind';

  const hasFading = subjects.some((s) => s.retentionStatus === 'fading');
  if (hasFading) return 'needs-attention';

  return 'on-track';
}

const formatTime = (mins: number): string => {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export function ParentDashboardSummary({
  childName,
  summary,
  subjects,
  trend,
  sessionsThisWeek,
  sessionsLastWeek,
  totalTimeThisWeek,
  totalTimeLastWeek,
  retentionTrend,
  totalSessions,
  progress,
  onDrillDown,
  isLoading,
}: ParentDashboardSummaryProps): ReactNode {
  const colors = useThemeColors();
  const aggregateSignal = deriveAggregateSignal(subjects);
  const showFullSignals = !isNewLearner(totalSessions);
  const remaining = sessionsUntilFullProgress(totalSessions);

  const trendText = `${sessionsThisWeek} sessions, ${formatTime(
    totalTimeThisWeek
  )} this week (${TREND_ARROWS[trend]} ${
    TREND_LABELS[trend]
  } ${sessionsLastWeek} sessions, ${formatTime(totalTimeLastWeek)} last week)`;

  const metadata = (
    <>
      {showFullSignals ? (
        aggregateSignal ? (
          <View
            className="flex-row items-center mt-1"
            testID="aggregate-signal"
            accessibilityLabel={`Overall status: ${AGGREGATE_SIGNAL_CONFIG[aggregateSignal].label}`}
          >
            <Ionicons
              name={AGGREGATE_SIGNAL_CONFIG[aggregateSignal].icon}
              size={16}
              color={colors[AGGREGATE_SIGNAL_CONFIG[aggregateSignal].colorKey]}
              style={{ marginRight: 8 }}
            />
            <Text
              className={`text-body-sm font-semibold ${AGGREGATE_SIGNAL_CONFIG[aggregateSignal].textColor}`}
            >
              {AGGREGATE_SIGNAL_CONFIG[aggregateSignal].label}
            </Text>
          </View>
        ) : (
          <Text
            className="text-caption text-text-secondary mt-1"
            testID="aggregate-signal-empty"
          >
            No data yet
          </Text>
        )
      ) : null}
      <Text
        className="text-caption text-text-secondary mt-1"
        accessibilityLabel={`Trend: ${trendText}`}
      >
        {trendText}
      </Text>
      {showFullSignals ? (
        retentionTrend ? (
          <View
            className="flex-row items-center mt-1.5"
            testID="retention-trend-badge"
            accessibilityLabel={`Retention: ${retentionTrend}`}
          >
            <Text className="text-caption text-text-secondary">
              Retention:{' '}
            </Text>
            <Text
              className={`text-caption font-semibold ${RETENTION_TREND_CONFIG[retentionTrend].className}`}
            >
              {RETENTION_TREND_CONFIG[retentionTrend].arrow}{' '}
              {RETENTION_TREND_CONFIG[retentionTrend].label}
            </Text>
          </View>
        ) : (
          <Text
            className="text-caption text-text-secondary mt-1.5"
            testID="retention-trend-empty"
          >
            No data yet
          </Text>
        )
      ) : null}
      {showFullSignals && progress ? (
        <View className="mt-3 gap-2">
          <View className="flex-row flex-wrap gap-2">
            <View className="bg-background rounded-full px-3 py-1.5">
              <Text className="text-caption font-semibold text-text-primary">
                {progress.topicsMastered} topics
                {progress.weeklyDeltaTopicsMastered != null
                  ? ` • +${progress.weeklyDeltaTopicsMastered} this week`
                  : ''}
              </Text>
            </View>
            {progress.vocabularyTotal > 0 ? (
              <View className="bg-background rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  {progress.vocabularyTotal} words
                  {progress.weeklyDeltaVocabularyTotal != null
                    ? ` • +${progress.weeklyDeltaVocabularyTotal}`
                    : ''}
                </Text>
              </View>
            ) : null}
            {progress.weeklyDeltaTopicsExplored != null &&
            progress.weeklyDeltaTopicsExplored > 0 ? (
              <View className="bg-background rounded-full px-3 py-1.5">
                <Text className="text-caption font-semibold text-text-primary">
                  +{progress.weeklyDeltaTopicsExplored} explored
                </Text>
              </View>
            ) : null}
          </View>
          {progress.guidance ? (
            <Text className="text-caption text-text-secondary">
              {progress.guidance}
            </Text>
          ) : null}
        </View>
      ) : null}
      {showFullSignals && subjects.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 mt-2">
          {subjects.map((subject) => (
            <View
              key={subject.name}
              className="flex-row items-center bg-background rounded-full px-3 py-1.5"
            >
              <Text className="text-caption text-text-primary me-2">
                {subject.name}
              </Text>
              <RetentionSignal status={subject.retentionStatus} />
            </View>
          ))}
        </View>
      ) : null}
      {!showFullSignals ? (
        <Text
          className="text-caption text-text-secondary mt-2"
          testID="parent-dashboard-teaser"
        >
          After {remaining} more {remaining === 1 ? 'session' : 'sessions'},
          you'll see {childName}'s retention trends and detailed progress here.
        </Text>
      ) : null}
    </>
  );

  return (
    <BaseCoachingCard
      headline={childName}
      subtext={summary}
      primaryLabel="View details"
      onPrimary={onDrillDown}
      metadata={metadata}
      onPress={onDrillDown}
      isLoading={isLoading}
      testID="parent-dashboard-summary"
    />
  );
}
