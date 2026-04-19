import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';
import { getParentRetentionInfo } from '../../lib/parent-vocab';
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
  // Use parent-vocab canonical labels when parent-facing to keep a single
  // source of truth for parent-friendly retention terminology.
  const parentInfo = parentFacing
    ? getParentRetentionInfo(status, 1, 'in_progress')
    : null;
  const displayLabel = parentInfo?.label ?? label;

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
