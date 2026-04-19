import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';
import type { RetentionStatus } from '@eduagent/schemas';
export type { RetentionStatus };

interface RetentionSignalProps {
  status: RetentionStatus;
  compact?: boolean;
  parentFacing?: boolean;
}

const CONFIG: Record<
  RetentionStatus,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    colorKey:
      | 'retentionStrong'
      | 'retentionFading'
      | 'retentionWeak'
      | 'retentionForgotten';
    textColor: string;
  }
> = {
  strong: {
    label: 'Thriving',
    icon: 'leaf',
    colorKey: 'retentionStrong',
    textColor: 'text-retention-strong',
  },
  fading: {
    label: 'Warming up',
    icon: 'flame',
    colorKey: 'retentionFading',
    textColor: 'text-retention-fading',
  },
  weak: {
    label: 'Growing',
    icon: 'sparkles',
    colorKey: 'retentionWeak',
    textColor: 'text-retention-weak',
  },
  forgotten: {
    label: 'Resting',
    icon: 'leaf-outline',
    colorKey: 'retentionForgotten',
    textColor: 'text-retention-forgotten',
  },
};

export function RetentionSignal({
  status,
  compact,
  parentFacing,
}: RetentionSignalProps) {
  const { label, icon, colorKey, textColor } = CONFIG[status];
  const colors = useThemeColors();
  const parentLabel =
    status === 'strong'
      ? 'Remembering well'
      : status === 'fading'
      ? 'A few things to refresh'
      : 'Needs a review';
  const displayLabel = parentFacing ? parentLabel : label;

  return (
    <View
      className="flex-row items-center"
      testID={`retention-signal-${status}`}
      accessibilityLabel={`Retention: ${displayLabel}`}
      accessibilityRole="text"
    >
      <Ionicons
        name={icon}
        size={compact ? 14 : 16}
        color={colors[colorKey]}
        style={compact ? undefined : { marginRight: 6 }}
      />
      {!compact && (
        <Text className={`text-body-sm font-medium ${textColor}`}>
          {displayLabel}
        </Text>
      )}
    </View>
  );
}
