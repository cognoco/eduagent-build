import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { TranslateKey } from '../../i18n';

export type LightPracticeRoute =
  | 'capitals'
  | 'guess_who'
  | 'vocabulary'
  | 'dictation';

export interface LightPracticeAffordanceProps {
  reason?: 'thin_feed' | 'declined_heavy' | 'fatigue';
  supportedRoutes: LightPracticeRoute[];
  onSelect: (route: LightPracticeRoute) => void;
}

const LABEL_KEYS: Record<LightPracticeRoute, TranslateKey> = {
  capitals: 'mentorHome.lightPractice.capitals',
  guess_who: 'mentorHome.lightPractice.guessWho',
  vocabulary: 'mentorHome.lightPractice.vocabulary',
  dictation: 'mentorHome.lightPractice.dictation',
};

export function LightPracticeAffordance({
  reason,
  supportedRoutes,
  onSelect,
}: LightPracticeAffordanceProps) {
  const { t } = useTranslation();

  if (supportedRoutes.length === 0) return null;

  return (
    <View
      testID="mentor-light-practice"
      className="rounded-xl border border-border bg-surface p-3"
    >
      <Text className="font-semibold text-text-primary">
        {t('mentorHome.lightPractice.prompt')}
      </Text>
      {reason ? (
        <Text className="mt-1 text-xs text-text-secondary">
          {t('mentorHome.lightPractice.fatigueReason', { reason })}
        </Text>
      ) : null}
      <View className="mt-3 flex-row flex-wrap gap-2">
        {supportedRoutes.map((route) => (
          <Pressable
            key={route}
            testID={`light-practice-${route}`}
            accessibilityRole="button"
            onPress={() => onSelect(route)}
            className="rounded-full border border-border px-3 py-2"
          >
            <Text className="text-sm text-primary">{t(LABEL_KEYS[route])}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
