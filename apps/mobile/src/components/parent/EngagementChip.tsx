import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EngagementSignal } from '@eduagent/schemas';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';

export type { EngagementSignal };

interface EngagementChipProps {
  signal: EngagementSignal;
}

const CONFIG: Record<
  EngagementSignal,
  {
    icon: keyof typeof Ionicons.glyphMap;
    colorKey: 'info' | 'warning' | 'success' | 'primary' | 'muted';
  }
> = {
  curious: {
    icon: 'help-circle-outline',
    colorKey: 'info',
  },
  stuck: {
    icon: 'alert-circle-outline',
    colorKey: 'warning',
  },
  breezing: {
    icon: 'flash-outline',
    colorKey: 'success',
  },
  focused: {
    icon: 'eye-outline',
    colorKey: 'primary',
  },
  scattered: {
    icon: 'shuffle-outline',
    colorKey: 'muted',
  },
};

export function EngagementChip({ signal }: EngagementChipProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const { icon, colorKey } = CONFIG[signal];
  const label = t(`parentView.session.engagementChip.labels.${signal}`);
  const color = colors[colorKey];

  return (
    <View
      className="flex-row items-center self-start rounded-full px-3 py-2"
      style={{ backgroundColor: `${color}1A` }}
      accessibilityRole="text"
      accessibilityLabel={t(
        'parentView.session.engagementChip.accessibilityLabel',
        { label },
      )}
      testID={`engagement-chip-${signal}`}
    >
      <Ionicons
        name={icon}
        size={14}
        color={color}
        style={{ marginRight: 6 }}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text className="text-body-sm font-semibold" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
