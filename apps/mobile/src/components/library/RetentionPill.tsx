import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RetentionStatus } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';

interface RetentionPillProps {
  status: RetentionStatus;
  size?: 'small' | 'default' | 'large';
  testID?: string;
}

const STATUS_KEY: Record<RetentionStatus, string> = {
  strong: 'progress.retention.strong.label',
  fading: 'progress.retention.fading.label',
  weak: 'progress.retention.weak.label',
  forgotten: 'progress.retention.forgotten.label',
};

export function RetentionPill({
  status,
  size = 'default',
  testID,
}: RetentionPillProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const dotColor = (() => {
    switch (status) {
      case 'strong':
        return colors.retentionStrong;
      case 'fading':
        return colors.retentionFading;
      case 'weak':
        return colors.retentionWeak;
      case 'forgotten':
        return colors.retentionForgotten;
    }
  })();

  const dotSize = size === 'large' ? 10 : 8;
  const fontSize = size === 'large' ? 14 : 12;
  const showLabel = size !== 'small';

  const label = t(STATUS_KEY[status]);

  return (
    <View
      testID={testID}
      accessibilityLabel={`Memory check: ${label}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
    >
      <View
        testID="retention-pill-dot"
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: dotColor,
        }}
      />
      {showLabel ? (
        <Text
          style={{
            fontSize,
            color: dotColor,
            fontWeight: '500',
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
