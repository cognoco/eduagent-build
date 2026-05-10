import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { DashboardData, Profile } from '@eduagent/schemas';

import { FAMILY_HOME_PATH } from '../../lib/navigation';
import { useThemeColors } from '../../lib/theme';

interface ChildCardProps {
  linkedChildren: ReadonlyArray<Profile>;
  dashboard: DashboardData | undefined;
}

function formatHeadline(
  child: NonNullable<DashboardData['children'][number]>,
): string | null {
  // weeklyHeadline is required by the schema, but a stale API deployment can
  // omit it (contract drift). Fall back to a neutral placeholder rather than
  // crashing the whole home screen.
  const headline = child.weeklyHeadline;
  if (
    !headline ||
    typeof headline.value !== 'number' ||
    typeof headline.label !== 'string'
  ) {
    return null;
  }
  const value = `${headline.value} ${headline.label.toLowerCase()}`;
  return headline.comparison ? `${value} — ${headline.comparison}` : value;
}

export function ChildCard({
  linkedChildren,
  dashboard,
}: ChildCardProps): React.ReactElement | null {
  const { t } = useTranslation();
  const colors = useThemeColors();

  if (linkedChildren.length === 0) return null;

  const dashboardByChildId = new Map(
    (dashboard?.children ?? []).map((child) => [child.profileId, child]),
  );
  const isSingle = linkedChildren.length === 1;

  return (
    <Pressable
      testID="home-child-card"
      onPress={() => router.push(FAMILY_HOME_PATH as never)}
      accessibilityRole="button"
      accessibilityLabel="Open Family"
      className="mx-5 mt-4 rounded-card bg-surface-elevated border border-border px-5 py-5 active:opacity-80"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-caption font-bold uppercase text-text-secondary">
          {t('home.childCard.title')}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors.textSecondary}
        />
      </View>

      <View className="mt-3">
        {linkedChildren.map((child, index) => {
          const dashboardChild = dashboardByChildId.get(child.id);
          const signal =
            (dashboardChild ? formatHeadline(dashboardChild) : null) ?? '-';

          return (
            <View
              key={child.id}
              testID={`home-child-card-row-${child.id}`}
              className={index > 0 ? 'border-t border-border pt-3 mt-3' : ''}
            >
              <Text
                className={
                  isSingle
                    ? 'text-h3 font-bold text-text-primary'
                    : 'text-body font-bold text-text-primary'
                }
              >
                {child.displayName}
              </Text>
              <Text className="text-body-sm text-text-secondary mt-1">
                {signal}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}
