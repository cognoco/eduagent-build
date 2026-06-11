import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getParentMetricTooltip } from '../../lib/parent-vocab';
import { useThemeColors } from '../../lib/theme';

interface MetricInfoDotProps {
  metricKey: string;
}

export function MetricInfoDot({ metricKey }: MetricInfoDotProps) {
  const [visible, setVisible] = useState(false);
  const colors = useThemeColors();
  const { t } = useTranslation();

  const tooltip = getParentMetricTooltip(t, metricKey);
  if (!tooltip) return null;

  return (
    <>
      <Pressable
        testID={`metric-info-${metricKey}`}
        hitSlop={8}
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={t('parentView.metricTooltips.infoDotLabel', {
          title: tooltip.title,
        })}
      >
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={colors.textSecondary}
        />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
        accessibilityViewIsModal
      >
        <Pressable
          className="flex-1 justify-end bg-black/30"
          onPress={() => setVisible(false)}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <View
            className="bg-surface rounded-t-2xl p-6 pb-10"
            testID={`metric-tooltip-${metricKey}`}
          >
            <Text className="text-body-sm font-semibold text-text-primary mb-2">
              {tooltip.title}
            </Text>
            <Text className="text-body-sm text-text-secondary leading-relaxed">
              {tooltip.body}
            </Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
