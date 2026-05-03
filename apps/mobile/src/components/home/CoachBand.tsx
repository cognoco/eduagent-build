import { Pressable, View, Text } from 'react-native';
import { useThemeColors } from '../../lib/theme';

export interface CoachBandProps {
  headline: string | null;
  topicHighlight?: string;
  eyebrow?: string;
  estimatedMinutes?: number;
  onContinue: () => void;
  onDismiss: () => void;
}

export function CoachBand({
  headline,
  topicHighlight,
  eyebrow = 'TONIGHT',
  estimatedMinutes,
  onContinue,
  onDismiss,
}: CoachBandProps) {
  const colors = useThemeColors();
  if (!headline) return null;

  const renderHeadline = () => {
    if (!topicHighlight || !headline.includes(topicHighlight)) {
      return (
        <Text className="text-[17px] font-bold leading-snug text-text-primary">
          {headline}
        </Text>
      );
    }
    const idx = headline.indexOf(topicHighlight);
    const before = headline.slice(0, idx);
    const after = headline.slice(idx + topicHighlight.length);
    return (
      <Text className="text-[17px] font-bold leading-snug text-text-primary">
        {before}
        <Text className="text-primary">{topicHighlight}</Text>
        {after}
      </Text>
    );
  };

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
        {eyebrow}
      </Text>
      <View className="mt-1.5">{renderHeadline()}</View>
      <View className="flex-row items-center gap-2.5 mt-3">
        <Pressable
          testID="home-coach-band-continue"
          onPress={onContinue}
          className="bg-primary rounded-xl px-[18px] py-2.5"
        >
          <Text className="text-sm font-bold text-text-inverse">Continue</Text>
        </Pressable>
        {estimatedMinutes != null && (
          <Text className="text-[11px] text-text-tertiary">
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
        <Text className="text-text-tertiary text-base">×</Text>
      </Pressable>
    </View>
  );
}
