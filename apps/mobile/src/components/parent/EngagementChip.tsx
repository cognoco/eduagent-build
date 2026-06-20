import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { EngagementSignal } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';
import type { TranslateKey } from '../../i18n';

export type { EngagementSignal };

interface EngagementChipProps {
  signal: EngagementSignal;
}

const CONFIG: Record<
  EngagementSignal,
  {
    labelKey: TranslateKey;
    icon: keyof typeof Ionicons.glyphMap;
    colorKey: 'info' | 'warning' | 'success' | 'primary' | 'muted';
  }
> = {
  curious: {
    labelKey: 'home.engagementChip.curious',
    icon: 'help-circle-outline',
    colorKey: 'info',
  },
  stuck: {
    labelKey: 'home.engagementChip.stuck',
    icon: 'alert-circle-outline',
    colorKey: 'warning',
  },
  breezing: {
    labelKey: 'home.engagementChip.breezing',
    icon: 'flash-outline',
    colorKey: 'success',
  },
  focused: {
    labelKey: 'home.engagementChip.focused',
    icon: 'eye-outline',
    colorKey: 'primary',
  },
  scattered: {
    labelKey: 'home.engagementChip.scattered',
    icon: 'shuffle-outline',
    colorKey: 'muted',
  },
};

export function EngagementChip({ signal }: EngagementChipProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { labelKey, icon, colorKey } = CONFIG[signal];
  const color = colors[colorKey];
  const label = t(labelKey);

  return (
    <View
      className="flex-row items-center self-start rounded-full px-3 py-2"
      style={{ backgroundColor: `${color}1A` }}
      accessibilityRole="text"
      accessibilityLabel={t('home.engagementChip.a11yLabel', { label })}
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
