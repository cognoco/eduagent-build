import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

export type RetentionStatus = 'strong' | 'fading' | 'weak' | 'forgotten';

interface RetentionSignalProps {
  status: RetentionStatus;
  compact?: boolean;
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

export function RetentionSignal({ status, compact }: RetentionSignalProps) {
  const { label, icon, colorKey, textColor } = CONFIG[status];
  const colors = useThemeColors();

  return (
    <View
      className="flex-row items-center"
      testID={`retention-signal-${status}`}
      accessibilityLabel={`Retention: ${label}`}
      accessibilityRole="text"
    >
      <Ionicons
        name={icon}
        size={compact ? 14 : 16}
        color={colors[colorKey]}
        style={compact ? undefined : { marginRight: 6 }}
      />
      {!compact && (
        <Text className={`text-caption font-medium ${textColor}`}>{label}</Text>
      )}
    </View>
  );
}
