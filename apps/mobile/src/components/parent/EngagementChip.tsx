import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../lib/theme';

export type EngagementSignal =
  | 'curious'
  | 'stuck'
  | 'breezing'
  | 'focused'
  | 'scattered';

interface EngagementChipProps {
  signal: EngagementSignal;
}

const CONFIG: Record<
  EngagementSignal,
  {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    colorKey: 'info' | 'warning' | 'success' | 'primary' | 'muted';
  }
> = {
  curious: {
    label: 'Curious',
    icon: 'help-circle-outline',
    colorKey: 'info',
  },
  stuck: {
    label: 'Stuck',
    icon: 'alert-circle-outline',
    colorKey: 'warning',
  },
  breezing: {
    label: 'Breezing',
    icon: 'flash-outline',
    colorKey: 'success',
  },
  focused: {
    label: 'Focused',
    icon: 'eye-outline',
    colorKey: 'primary',
  },
  scattered: {
    label: 'Scattered',
    icon: 'shuffle-outline',
    colorKey: 'muted',
  },
};

export function EngagementChip({ signal }: EngagementChipProps) {
  const colors = useThemeColors();
  const { label, icon, colorKey } = CONFIG[signal];
  const color = colors[colorKey];

  return (
    <View
      className="flex-row items-center self-start rounded-full px-3 py-2"
      style={{ backgroundColor: `${color}1A` }}
      accessibilityRole="text"
      accessibilityLabel={`Engagement: ${label}`}
      testID={`engagement-chip-${signal}`}
    >
      <Ionicons
        name={icon}
        size={14}
        color={color}
        style={{ marginRight: 6 }}
      />
      <Text className="text-body-sm font-semibold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
