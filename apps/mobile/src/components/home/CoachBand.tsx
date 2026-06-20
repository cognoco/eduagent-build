import { Pressable, View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getTimeOfDay } from '../../lib/greeting';
import { useThemeColors } from '../../lib/theme';
import type { Translate } from '../../i18n';

function getTimeAwareEyebrow(t: Translate, now: Date = new Date()): string {
  const period = getTimeOfDay(now);
  if (period === 'morning') return t('home.coachBand.thisMorning');
  if (period === 'afternoon') return t('home.coachBand.thisAfternoon');
  return t('home.coachBand.tonight');
}

export interface CoachBandProps {
  headline: string | null;
  eyebrow?: string;
  estimatedMinutes?: number;
  onContinue: () => void;
  onDismiss: () => void;
  now?: Date;
}

export function CoachBand({
  headline,
  eyebrow,
  estimatedMinutes,
  onContinue,
  onDismiss,
  now,
}: CoachBandProps) {
  const { t } = useTranslation();
  const resolvedEyebrow = eyebrow ?? getTimeAwareEyebrow(t, now);
  const colors = useThemeColors();
  if (!headline) return null;

  return (
    <View
      testID="home-coach-band"
      className="rounded-2xl p-4 relative mx-5 mt-1.5 mb-3"
      style={{
        backgroundColor: colors.primarySoft,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text className="text-[10px] font-bold uppercase tracking-wider text-primary">
        {'💡 '}
        {resolvedEyebrow}
      </Text>
      <View className="mt-1.5">
        <Text className="text-[17px] font-bold leading-snug text-text-primary">
          {headline}
        </Text>
      </View>
      <View className="flex-row items-center gap-2.5 mt-3">
        <Pressable
          testID="home-coach-band-continue"
          onPress={onContinue}
          className="bg-primary rounded-xl px-[18px] py-2.5"
        >
          <Text className="text-sm font-bold text-text-inverse">
            {t('common.continue')}
          </Text>
        </Pressable>
        {estimatedMinutes != null && (
          <Text className="text-[11px] text-text-secondary">
            {t('home.coachBand.estimatedMinutes', {
              minutes: estimatedMinutes,
            })}
          </Text>
        )}
      </View>
      <Pressable
        testID="home-coach-band-dismiss"
        onPress={onDismiss}
        className="absolute top-2 right-2.5 p-1"
        hitSlop={8}
        accessibilityLabel={t('home.coachBand.a11yDismiss')}
        accessibilityRole="button"
      >
        <Text className="text-text-secondary text-base">×</Text>
      </Pressable>
    </View>
  );
}
