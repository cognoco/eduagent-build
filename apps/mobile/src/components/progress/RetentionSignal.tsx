import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';
import { getParentRetentionInfo } from '../../lib/parent-vocab';
import type { RetentionStatus } from '@eduagent/schemas';
import type { TranslateKey } from '../../i18n';
export type { RetentionStatus };

interface RetentionSignalProps {
  status: RetentionStatus;
  compact?: boolean;
  parentFacing?: boolean;
}

const CONFIG: Record<
  RetentionStatus,
  {
    labelKey: TranslateKey;
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
    labelKey: 'progress.retention.strong.label',
    icon: 'leaf',
    colorKey: 'retentionStrong',
    textColor: 'text-retention-strong',
  },
  fading: {
    labelKey: 'progress.retention.fading.label',
    icon: 'flame',
    colorKey: 'retentionFading',
    textColor: 'text-retention-fading',
  },
  weak: {
    labelKey: 'progress.retention.weak.label',
    icon: 'sparkles',
    colorKey: 'retentionWeak',
    textColor: 'text-retention-weak',
  },
  forgotten: {
    labelKey: 'progress.retention.forgotten.label',
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
  const { t } = useTranslation();
  const { labelKey, icon, colorKey, textColor } = CONFIG[status];
  const colors = useThemeColors();
  // Use parent-vocab canonical labels when parent-facing to keep a single
  // source of truth for parent-friendly retention terminology.
  const parentInfo = parentFacing
    ? getParentRetentionInfo(status, 1, 'in_progress')
    : null;
  const displayLabel = parentInfo?.label ?? t(labelKey);

  return (
    <View
      className="flex-row items-center"
      testID={`retention-signal-${status}`}
      accessibilityLabel={`Review status: ${displayLabel}`}
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
