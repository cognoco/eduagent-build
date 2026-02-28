import { type ReactNode } from 'react';
import { View, Text } from 'react-native';
import { BaseCoachingCard } from './BaseCoachingCard';
import { RetentionSignal, type RetentionStatus } from '../progress';

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
  { dotColor: string; label: string; textColor: string }
> = {
  'on-track': {
    dotColor: 'bg-retention-strong',
    label: 'On Track',
    textColor: 'text-retention-strong',
  },
  'needs-attention': {
    dotColor: 'bg-retention-fading',
    label: 'Needs Attention',
    textColor: 'text-retention-fading',
  },
  'falling-behind': {
    dotColor: 'bg-retention-weak',
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
  onDrillDown,
  isLoading,
}: ParentDashboardSummaryProps): ReactNode {
  const aggregateSignal = deriveAggregateSignal(subjects);

  const trendText = `${sessionsThisWeek} sessions, ${formatTime(
    totalTimeThisWeek
  )} this week (${TREND_ARROWS[trend]} ${
    TREND_LABELS[trend]
  } ${sessionsLastWeek} sessions, ${formatTime(totalTimeLastWeek)} last week)`;

  const metadata = (
    <>
      {aggregateSignal ? (
        <View
          className="flex-row items-center mt-1"
          testID="aggregate-signal"
          accessibilityLabel={`Overall status: ${AGGREGATE_SIGNAL_CONFIG[aggregateSignal].label}`}
        >
          <View
            className={`w-3 h-3 rounded-full ${AGGREGATE_SIGNAL_CONFIG[aggregateSignal].dotColor} me-2`}
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
      )}
      <Text
        className="text-caption text-text-secondary mt-1"
        accessibilityLabel={`Trend: ${trendText}`}
      >
        {trendText}
      </Text>
      {retentionTrend ? (
        <View
          className="flex-row items-center mt-1.5"
          testID="retention-trend-badge"
          accessibilityLabel={`Retention: ${retentionTrend}`}
        >
          <Text className="text-caption text-text-secondary">Retention: </Text>
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
      )}
      {subjects.length > 0 && (
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
      )}
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
