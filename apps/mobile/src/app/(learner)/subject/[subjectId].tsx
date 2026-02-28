import { View, Text, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnalogyDomainPicker } from '../../../components/common';
import {
  useAnalogyDomain,
  useUpdateAnalogyDomain,
} from '../../../hooks/use-settings';
import type { AnalogyDomain } from '@eduagent/schemas';

export default function SubjectSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { subjectId, subjectName } = useLocalSearchParams<{
    subjectId: string;
    subjectName?: string;
  }>();

  const safeSubjectId = subjectId ?? '';
  const { data: analogyDomain, isLoading } = useAnalogyDomain(safeSubjectId);
  const { mutate: updateAnalogyDomain, isPending } =
    useUpdateAnalogyDomain(safeSubjectId);

  const handleSelect = (domain: AnalogyDomain | null): void => {
    updateAnalogyDomain(domain);
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
      <View className="px-5 pt-4 pb-3 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="me-3 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          testID="subject-settings-back"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-primary text-h3">&larr;</Text>
        </Pressable>
        <Text
          className="text-h2 font-bold text-text-primary flex-1"
          numberOfLines={1}
        >
          {subjectName ?? 'Subject Settings'}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Analogy Domain Section */}
        <View className="mt-2 mb-4">
          <Text className="text-h3 font-semibold text-text-primary mb-1">
            Analogy Preference
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            Choose a domain for analogies. The tutor will prefer analogies from
            this world when explaining concepts, but won't force them when a
            direct explanation is clearer.
          </Text>
          <AnalogyDomainPicker
            value={analogyDomain}
            onSelect={handleSelect}
            isLoading={isLoading}
            disabled={isPending}
          />
        </View>
      </ScrollView>
    </View>
  );
}
