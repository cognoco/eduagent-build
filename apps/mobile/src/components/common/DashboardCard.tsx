import { View, Text } from 'react-native';
import { RetentionSignal, type RetentionStatus } from '../progress';

interface SubjectInfo {
  name: string;
  retention: RetentionStatus;
}

interface DashboardCardProps {
  name: string;
  summary: string;
  sessions: number;
  lastWeekSessions: number;
  subjects: SubjectInfo[];
}

function getTrendArrow(current: number, previous: number): string {
  if (current > previous) return '↑';
  if (current < previous) return '↓';
  return '→';
}

export function DashboardCard({
  name,
  summary,
  sessions,
  lastWeekSessions,
  subjects,
}: DashboardCardProps) {
  const trend = getTrendArrow(sessions, lastWeekSessions);

  return (
    <View className="bg-surface rounded-card p-4 mt-3">
      <View className="flex-row items-center mb-2">
        <View className="bg-primary-soft rounded-full w-10 h-10 items-center justify-center mr-3">
          <Text className="text-primary text-h3 font-bold">{name[0]}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary">
            {name}
          </Text>
          <Text className="text-body-sm text-text-secondary">
            {sessions} sessions this week {trend} from {lastWeekSessions} last
            week
          </Text>
        </View>
      </View>

      <Text className="text-body text-text-primary mt-1 mb-3">{summary}</Text>

      <View className="flex-row flex-wrap gap-2">
        {subjects.map((subject) => (
          <View
            key={subject.name}
            className="flex-row items-center bg-background rounded-full px-3 py-1.5"
          >
            <Text className="text-caption text-text-primary mr-2">
              {subject.name}
            </Text>
            <RetentionSignal status={subject.retention} compact />
          </View>
        ))}
      </View>
    </View>
  );
}
