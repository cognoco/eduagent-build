import { Text, View } from 'react-native';
import type { RetentionStatus } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';

interface RetentionPillProps {
  status: RetentionStatus;
  size?: 'small' | 'default' | 'large';
  testID?: string;
}

const STATUS_LABEL: Record<RetentionStatus, string> = {
  strong: 'Still remembered',
  fading: 'Getting fuzzy',
  weak: 'Needs a quick refresh',
  forgotten: 'Needs a fresh pass',
};

export function RetentionPill({
  status,
  size = 'default',
  testID,
}: RetentionPillProps) {
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

  return (
    <View
      testID={testID}
      accessibilityLabel={`Memory check: ${STATUS_LABEL[status]}`}
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
          {STATUS_LABEL[status]}
        </Text>
      ) : null}
    </View>
  );
}
