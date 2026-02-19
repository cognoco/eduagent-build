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

export function ParentDashboardSummary({
  childName,
  summary,
  subjects,
  trend,
  sessionsThisWeek,
  sessionsLastWeek,
  onDrillDown,
  isLoading,
}: ParentDashboardSummaryProps): ReactNode {
  const trendText = `${sessionsThisWeek} sessions this week (${TREND_ARROWS[trend]} ${TREND_LABELS[trend]} ${sessionsLastWeek} last week)`;

  const metadata = (
    <>
      <Text
        className="text-caption text-text-secondary mt-1"
        accessibilityLabel={`Trend: ${trendText}`}
      >
        {trendText}
      </Text>
      {subjects.length > 0 && (
        <View className="flex-row flex-wrap gap-2 mt-2">
          {subjects.map((subject) => (
            <View
              key={subject.name}
              className="flex-row items-center bg-background rounded-full px-3 py-1.5"
            >
              <Text className="text-caption text-text-primary mr-2">
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
