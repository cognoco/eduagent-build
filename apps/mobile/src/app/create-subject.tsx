import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateSubject } from '../hooks/use-subjects';
import { useThemeColors } from '../lib/theme';

export default function CreateSubjectScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const createSubject = useCreateSubject();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const canSubmit = name.trim().length >= 1 && !createSubject.isPending;

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setError('');
    try {
      const result = await createSubject.mutateAsync({ name: name.trim() });
      // Navigate to interview for the new subject
      router.replace({
        pathname: '/(learner)/onboarding/interview',
        params: {
          subjectId: result.subject.id,
          subjectName: result.subject.name,
        },
      } as never);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }, [canSubmit, name, createSubject, router]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between mb-8">
          <Text className="text-h1 font-bold text-text-primary">
            New subject
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="min-h-[44px] min-w-[44px] items-center justify-center"
            testID="create-subject-cancel"
          >
            <Text className="text-body text-primary font-semibold">Cancel</Text>
          </Pressable>
        </View>

        {error !== '' && (
          <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
            <Text
              className="text-danger text-body-sm"
              testID="create-subject-error"
            >
              {error}
            </Text>
          </View>
        )}

        <Text className="text-body text-text-secondary mb-4">
          What would you like to learn? Enter any subject — we'll create a
          personalized curriculum just for you.
        </Text>

        <Text className="text-body-sm font-semibold text-text-secondary mb-1">
          Subject name
        </Text>
        <TextInput
          className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-6"
          placeholder="e.g. Calculus, World History, Python..."
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
          maxLength={200}
          editable={!createSubject.isPending}
          testID="create-subject-name"
          autoFocus
        />

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit}
          className={`rounded-button py-3.5 items-center ${
            canSubmit ? 'bg-primary' : 'bg-surface-elevated'
          }`}
          testID="create-subject-submit"
        >
          {createSubject.isPending ? (
            <ActivityIndicator
              color={colors.textInverse}
              testID="create-subject-loading"
            />
          ) : (
            <Text
              className={`text-body font-semibold ${
                canSubmit ? 'text-text-inverse' : 'text-text-secondary'
              }`}
            >
              Start Learning
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
