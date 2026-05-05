import { Pressable, View, Text } from 'react-native';
import { useThemeColors } from '../../lib/theme';

function getTimeAwareEyebrow(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'THIS MORNING';
  if (hour >= 12 && hour < 17) return 'THIS AFTERNOON';
  return 'TONIGHT';
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
  const resolvedEyebrow = eyebrow ?? getTimeAwareEyebrow(now);
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
          <Text className="text-sm font-bold text-text-inverse">Continue</Text>
        </Pressable>
        {estimatedMinutes != null && (
          <Text className="text-[11px] text-text-secondary">
            {estimatedMinutes} min
          </Text>
        )}
      </View>
      <Pressable
        testID="home-coach-band-dismiss"
        onPress={onDismiss}
        className="absolute top-2 right-2.5 p-1"
        hitSlop={8}
        accessibilityLabel="Dismiss recommendation"
        accessibilityRole="button"
      >
        <Text className="text-text-secondary text-base">×</Text>
      </Pressable>
    </View>
  );
}
