import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IntentCard } from '../../components/home/IntentCard';
import { useProfile } from '../../lib/profile';
import {
  isRecoveryMarkerFresh,
  readSessionRecoveryMarker,
  type SessionRecoveryMarker,
} from '../../lib/session-recovery';
import { useThemeColors } from '../../lib/theme';

export default function LearnNewScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { activeProfile } = useProfile();
  const [recoveryMarker, setRecoveryMarker] =
    useState<SessionRecoveryMarker | null>(null);
  const [expiredRecoveryMarker, setExpiredRecoveryMarker] =
    useState<SessionRecoveryMarker | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRecoveryMarker(): Promise<void> {
      try {
        const marker = await readSessionRecoveryMarker(activeProfile?.id);
        if (!cancelled) {
          const freshMarker =
            marker && isRecoveryMarkerFresh(marker) ? marker : null;
          setRecoveryMarker(freshMarker);
          setExpiredRecoveryMarker(
            marker && !isRecoveryMarkerFresh(marker) ? marker : null
          );
        }
      } catch {
        if (!cancelled) {
          setRecoveryMarker(null);
          setExpiredRecoveryMarker(null);
        }
      }
    }

    void loadRecoveryMarker();

    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
      }}
      testID="learn-new-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="learn-new-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          What would you like to learn?
        </Text>
      </View>

      <View className="gap-4">
        <IntentCard
          title="Pick a subject"
          onPress={() => router.push('/create-subject' as never)}
          testID="intent-pick-subject"
        />
        <IntentCard
          title="Just ask anything"
          onPress={() =>
            router.push('/(learner)/session?mode=freeform' as never)
          }
          testID="intent-freeform"
        />
        {recoveryMarker ? (
          <IntentCard
            title="Continue where you left off"
            subtitle={recoveryMarker.subjectName}
            onPress={() =>
              router.push({
                pathname: '/(learner)/session',
                params: { sessionId: recoveryMarker.sessionId },
              } as never)
            }
            testID="intent-resume"
          />
        ) : null}
        {expiredRecoveryMarker ? (
          <View
            className="bg-surface rounded-card px-4 py-4"
            testID="intent-expired-recovery"
          >
            <Text className="text-body font-semibold text-text-primary">
              Your last session timed out
            </Text>
            <Text className="text-body-sm text-text-secondary mt-2">
              {expiredRecoveryMarker.subjectName
                ? `Your recovery window for ${expiredRecoveryMarker.subjectName} expired after 30 minutes, but you can start a new session anytime.`
                : 'Your recovery window expired after 30 minutes, but you can start a new session anytime.'}
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
