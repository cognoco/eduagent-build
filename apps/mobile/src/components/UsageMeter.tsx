import { View, Text } from 'react-native';
import type { WarningLevel } from '../hooks/use-subscription';

interface UsageMeterProps {
  used: number;
  limit: number;
  warningLevel: WarningLevel;
}

const BAR_COLORS: Record<WarningLevel, string> = {
  none: 'bg-retention-strong',
  soft: 'bg-retention-fading',
  hard: 'bg-warning',
  exceeded: 'bg-danger',
};

export function UsageMeter({ used, limit, warningLevel }: UsageMeterProps) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const barColor = BAR_COLORS[warningLevel];

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-caption text-text-secondary">
          {used} / {limit} questions used
        </Text>
        <Text className="text-caption font-semibold text-text-primary">
          {Math.round(percentage)}%
        </Text>
      </View>
      <View className="h-2.5 bg-border rounded-full overflow-hidden">
        <View
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </View>
    </View>
  );
}
