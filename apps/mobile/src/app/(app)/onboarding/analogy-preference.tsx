import { Alert, View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { goBackOrReplace } from '../../../lib/navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalogyDomainPicker } from '../../../components/common';
import { useUpdateAnalogyDomain } from '../../../hooks/use-settings';
import type { AnalogyDomain } from '@eduagent/schemas';
import { useState } from 'react';

export default function AnalogyPreferenceScreen() {
  const router = useRouter();
  const { subjectId } = useLocalSearchParams<{ subjectId: string }>();
  const insets = useSafeAreaInsets();
  const [selectedDomain, setSelectedDomain] = useState<AnalogyDomain | null>(
    null
  );
  const { mutate: updateAnalogyDomain, isPending } = useUpdateAnalogyDomain(
    subjectId ?? ''
  );

  const handleContinue = (): void => {
    if (selectedDomain) {
      updateAnalogyDomain(selectedDomain, {
        onSuccess: () => {
          navigateToCurriculum();
        },
        onError: (err) => {
          Alert.alert(
            'Could not save preference',
            err instanceof Error
              ? err.message
              : 'Something went wrong. Please try again.',
            [{ text: 'OK' }]
          );
        },
      });
    } else {
      navigateToCurriculum();
    }
  };

  const handleSkip = (): void => {
    navigateToCurriculum();
  };

  const navigateToCurriculum = (): void => {
    router.replace({
      pathname: '/(app)/onboarding/curriculum-review',
      params: { subjectId },
    } as never);
  };

  if (!subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-text-secondary">No subject selected</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          className="mb-3 min-w-[44px] min-h-[44px] justify-center self-start"
          accessibilityLabel="Go back"
          accessibilityRole="button"
          testID="analogy-back-button"
        >
          <Text className="text-primary text-body font-semibold">Back</Text>
        </Pressable>
        <Text
          className="text-h2 font-bold text-text-primary"
          testID="analogy-preference-title"
        >
          How do you like things explained?
        </Text>
        <Text className="text-body text-text-secondary mt-2">
          Pick an analogy style (optional). You can always change this later in
          subject settings.
        </Text>
      </View>

      {/* Picker — ScrollView needed: 7 options at ~72dp each overflow on ≤640dp screens */}
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <AnalogyDomainPicker
          value={selectedDomain}
          onSelect={setSelectedDomain}
          disabled={isPending}
        />
      </ScrollView>

      {/* Actions */}
      <View
        className="px-5 pb-6"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        <Pressable
          onPress={handleContinue}
          disabled={isPending}
          className="bg-primary rounded-button py-3.5 items-center mb-2"
          testID="analogy-continue-button"
          accessibilityLabel="Continue to curriculum"
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Continue
          </Text>
        </Pressable>
        <Pressable
          onPress={handleSkip}
          disabled={isPending}
          className="py-3 items-center"
          testID="analogy-skip-button"
          accessibilityLabel="Skip analogy preference"
          accessibilityRole="button"
        >
          <Text className="text-body text-primary font-semibold">
            Skip for now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
