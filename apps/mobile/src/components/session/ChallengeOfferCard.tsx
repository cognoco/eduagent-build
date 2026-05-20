import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export function ChallengeOfferCard({
  pitch,
  onAccept,
  onDecline,
  onDontAskAgain,
}: {
  pitch: string;
  onAccept: () => void;
  onDecline: () => void;
  onDontAskAgain: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      className="rounded-2xl bg-surface-elevated p-4 border border-accent-soft"
      testID="challenge-offer-card"
    >
      <Text className="text-text-primary text-base font-semibold mb-1">
        {t('session.challenge.offerTitle')}
      </Text>
      <Text className="text-text-secondary mb-3">{pitch}</Text>
      <View className="flex-row gap-2 flex-wrap">
        <Pressable
          onPress={onAccept}
          className="bg-accent rounded-xl px-4 py-2"
          testID="challenge-offer-accept"
        >
          <Text className="text-on-accent font-medium">
            {t('session.challenge.tryIt')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDecline}
          className="bg-surface rounded-xl px-4 py-2"
          testID="challenge-offer-decline"
        >
          <Text className="text-text-primary">
            {t('session.challenge.notNow')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDontAskAgain}
          className="rounded-xl px-4 py-2"
          testID="challenge-offer-dont-ask"
        >
          <Text className="text-text-muted">
            {t('session.challenge.dontAskAgain')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
