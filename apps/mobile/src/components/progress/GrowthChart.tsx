import { View, Text } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { type CopyRegister } from '../../lib/copy-register';
import { useThemeColors } from '../../lib/theme';

export interface GrowthChartDatum {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface GrowthChartProps {
  title: string;
  subtitle?: string;
  data: GrowthChartDatum[];
  emptyMessage?: string;
  /** Copy register for a11y labels and legend text. Defaults to 'adult'. */
  register?: CopyRegister;
}

/**
 * [BUG-649 / ACC-5] Build a screen-reader summary of the chart data so users
 * with visual impairments hear the trend instead of an opaque bar grid.
 */
function buildChartA11yLabel(
  title: string,
  data: GrowthChartDatum[],
  register: CopyRegister,
  t: TFunction
): string {
  const points = data
    .map((item) => {
      const primaryKey =
        register === 'child'
          ? 'progress.growthChart.a11y.topicsLearned'
          : 'progress.growthChart.a11y.topicsMastered';
      const primary = `${item.value} ${t(primaryKey)}`;
      const secondary =
        item.secondaryValue != null
          ? ` ${item.secondaryValue} ${t(
              register === 'child'
                ? 'progress.growthChart.a11y.wordsAdded'
                : 'progress.growthChart.a11y.vocabularyGrowth'
            )}`
          : '';
      return `${item.label}: ${primary}${secondary}`;
    })
    .join('. ');
  return `${title}. ${points}`;
}

export function GrowthChart({
  title,
  subtitle,
  data,
  emptyMessage = 'Keep going and your growth will show up here.',
  register = 'adult',
}: GrowthChartProps): React.ReactElement {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const maxValue = Math.max(
    1,
    ...data.flatMap((item) => [item.value, item.secondaryValue ?? 0])
  );

  return (
    <View className="bg-surface rounded-card p-4">
      <Text className="text-body font-semibold text-text-primary">{title}</Text>
      {subtitle ? (
        <Text className="text-caption text-text-secondary mt-1">
          {subtitle}
        </Text>
      ) : null}

      {data.length < 2 ? (
        <Text className="text-body-sm text-text-secondary mt-4">
          {emptyMessage}
        </Text>
      ) : (
        <View className="mt-4">
          {/*
           * [BUG-649 / ACC-5] Bar chart is opaque to screen readers — provide
           * a single accessible summary that VoiceOver/TalkBack reads aloud,
           * and hide the decorative bars from the a11y tree. Format:
           * "Growth chart. <title>. Apr: 4 topics mastered, 12 vocabulary growth.
           * May: 6 topics mastered, 18 vocabulary growth..."
           */}
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={buildChartA11yLabel(title, data, register, t)}
          >
            <View
              className="flex-row items-end gap-3 h-28"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {data.map((item) => {
                const primaryHeight = Math.max(
                  10,
                  Math.round((item.value / maxValue) * 96)
                );
                const secondaryHeight =
                  item.secondaryValue != null
                    ? Math.max(
                        6,
                        Math.round((item.secondaryValue / maxValue) * 72)
                      )
                    : 0;

                return (
                  <View key={item.label} className="flex-1 items-center">
                    <View className="w-full items-center justify-end h-24">
                      {item.secondaryValue != null ? (
                        <View
                          className="w-3 rounded-t-full bg-accent/35 mb-1"
                          style={{ height: secondaryHeight }}
                        />
                      ) : null}
                      <View
                        className="w-5 rounded-t-full bg-primary"
                        style={{ height: primaryHeight }}
                      />
                    </View>
                    <Text className="text-caption text-text-secondary mt-2">
                      {item.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View className="flex-row flex-wrap gap-4 mt-4">
            <View className="flex-row items-center">
              <View
                className="w-2.5 h-2.5 rounded-full me-2"
                style={{ backgroundColor: colors.primary }}
              />
              <Text className="text-caption text-text-secondary">
                {t(`progress.register.${register}.growthPrimaryLegend`)}
              </Text>
            </View>
            {data.some((item) => item.secondaryValue != null) ? (
              <View className="flex-row items-center">
                <View
                  className="w-2.5 h-2.5 rounded-full me-2"
                  style={{ backgroundColor: colors.accent }}
                />
                <Text className="text-caption text-text-secondary">
                  {t(`progress.register.${register}.growthSecondaryLegend`)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}
