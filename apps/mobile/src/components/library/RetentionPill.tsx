import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RetentionStatus } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';
import type { TranslateKey } from '../../i18n';

interface RetentionPillProps {
  status: RetentionStatus;
  daysSinceLastReview?: number | null;
  size?: 'small' | 'default' | 'large';
  testID?: string;
}

const STATUS_KEY: Record<RetentionStatus, TranslateKey> = {
  strong: 'progress.retention.strong.label',
  fading: 'progress.retention.fading.label',
  weak: 'progress.retention.weak.label',
  forgotten: 'progress.retention.forgotten.label',
};

const ELAPSED_KEY: Record<RetentionStatus, TranslateKey> = {
  strong: 'progress.retention.elapsed.remembered',
  fading: 'progress.retention.elapsed.fading',
  weak: 'progress.retention.elapsed.weak',
  forgotten: 'progress.retention.elapsed.forgotten',
};

export function RetentionPill({
  status,
  daysSinceLastReview,
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
  const elapsedFontSize = size === 'large' ? 12 : 11;
  const showLabel = size !== 'small';
  const showElapsed =
    showLabel &&
    daysSinceLastReview !== null &&
    daysSinceLastReview !== undefined &&
    daysSinceLastReview >= 2;

  const label = t(STATUS_KEY[status]);
  const elapsedLabel = showElapsed
    ? t(ELAPSED_KEY[status], { count: daysSinceLastReview })
    : null;

  return (
    <View
      testID={testID}
      accessibilityLabel={`Memory check: ${
        elapsedLabel ? `${label}, ${elapsedLabel}` : label
      }`}
      style={{ gap: showElapsed ? 2 : 0 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
      {elapsedLabel ? (
        <Text
          testID="retention-pill-elapsed"
          style={{
            color: colors.textSecondary,
            fontSize: elapsedFontSize,
            fontWeight: '400',
          }}
        >
          {elapsedLabel}
        </Text>
      ) : null}
    </View>
  );
}
