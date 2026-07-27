import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { WarningLevel } from '../../hooks/use-subscription';

interface UsageMeterProps {
  used: number;
  limit: number;
  warningLevel: WarningLevel;
}

const BAR_COLORS: Record<WarningLevel, string> = {
  none: 'bg-retention-strong',
  soft: 'bg-retention-fading',
  hard: 'bg-warning',
  // [BUG-640] 'top-up-available': monthly exhausted but credits remain — warning not danger
  'top-up-available': 'bg-warning',
  exceeded: 'bg-danger',
};

export function UsageMeter({ used, limit, warningLevel }: UsageMeterProps) {
  const { t } = useTranslation();
  // Guard against NaN / Infinity / negative props producing an invalid CSS
  // width (e.g. `width: "NaN%"`). Clamp to [0, 100] with a finite fallback.
  const rawPercentage = limit > 0 ? (used / limit) * 100 : 0;
  const percentage = Number.isFinite(rawPercentage)
    ? Math.max(0, Math.min(rawPercentage, 100))
    : 0;
  const barColor = BAR_COLORS[warningLevel];
  const clampedUsed = Math.max(0, Math.min(used, limit));

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-caption text-text-secondary">
          {t('common.usageMeter.questionsUsed', {
            used: String(used),
            limit: String(limit),
          })}
        </Text>
        <Text className="text-caption font-semibold text-text-primary">
          {Math.round(percentage)}%
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('usageMeter.a11yProgressBar', { used, limit })}
        accessibilityValue={{ min: 0, max: limit, now: clampedUsed }}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={clampedUsed}
        className="h-2.5 bg-border rounded-full overflow-hidden"
      >
        <View
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </View>
    </View>
  );
}
