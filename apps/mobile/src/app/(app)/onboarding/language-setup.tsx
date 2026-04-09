import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CefrLevel } from '@eduagent/schemas';
import { useConfigureLanguageSubject } from '../../../hooks/use-subjects';
import { formatApiError } from '../../../lib/format-api-error';

const NATIVE_LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
];

const LEVEL_OPTIONS: Array<{
  label: string;
  level: CefrLevel;
  description: string;
}> = [
  {
    label: 'Complete beginner',
    level: 'A1',
    description: 'Start from the foundations and build everyday basics.',
  },
  {
    label: 'I know some basics',
    level: 'A2',
    description: 'You can handle simple situations and want to grow range.',
  },
  {
    label: 'Conversational',
    level: 'B1',
    description: 'You can get by and want stronger fluency and precision.',
  },
  {
    label: 'Advanced',
    level: 'B2',
    description: 'You want more nuance, confidence, and flexible expression.',
  },
];

export default function LanguageSetup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { subjectId, languageName } = useLocalSearchParams<{
    subjectId?: string;
    languageName?: string;
  }>();
  const configureLanguageSubject = useConfigureLanguageSubject();
  const [nativeLanguage, setNativeLanguage] = useState<string>('en');
  const [startingLevel, setStartingLevel] = useState<CefrLevel>('A1');
  const [error, setError] = useState('');

  const safeLanguageName = useMemo(
    () => languageName?.trim() || 'this language',
    [languageName]
  );

  const handleContinue = async () => {
    if (!subjectId) return;
    setError('');
    try {
      await configureLanguageSubject.mutateAsync({
        subjectId,
        nativeLanguage,
        startingLevel,
      });
      router.replace({
        pathname: '/(app)/onboarding/curriculum-review',
        params: { subjectId },
      } as never);
    } catch (err: unknown) {
      setError(formatApiError(err));
    }
  };

  if (!subjectId) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-text-secondary">
          No language subject selected
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          className="mb-3 min-w-[44px] min-h-[44px] justify-center self-start"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-primary text-body font-semibold">Back</Text>
        </Pressable>

        <Text className="text-h2 font-bold text-text-primary">
          Language setup
        </Text>
        <Text className="text-body text-text-secondary mt-2 mb-5">
          We&apos;ll switch this subject into a language-focused path with
          direct teaching, vocabulary tracking, and speaking practice.
        </Text>

        <View className="bg-primary/10 rounded-card p-4 mb-6">
          <Text className="text-body font-semibold text-text-primary">
            Looks like you&apos;re learning {safeLanguageName}!
          </Text>
          <Text className="text-body-sm text-text-secondary mt-2">
            We&apos;ll use a language-focused approach built around vocabulary,
            fluency, input, and output practice.
          </Text>
        </View>

        {error !== '' && (
          <View className="bg-danger/10 rounded-card px-4 py-3 mb-4">
            <Text className="text-danger text-body-sm">{error}</Text>
          </View>
        )}

        <Text className="text-body font-semibold text-text-primary mb-3">
          Your native language
        </Text>
        <View className="gap-2 mb-6">
          {NATIVE_LANGUAGE_OPTIONS.map((option) => {
            const selected = nativeLanguage === option.code;
            return (
              <Pressable
                key={option.code}
                onPress={() => setNativeLanguage(option.code)}
                className={
                  selected
                    ? 'rounded-card border border-primary bg-primary/10 px-4 py-3'
                    : 'rounded-card border border-border bg-surface px-4 py-3'
                }
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`native-language-${option.code}`}
              >
                <Text className="text-body font-semibold text-text-primary">
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="text-body font-semibold text-text-primary mb-3">
          Your current level
        </Text>
        <View className="gap-3">
          {LEVEL_OPTIONS.map((option) => {
            const selected = startingLevel === option.level;
            return (
              <Pressable
                key={option.label}
                onPress={() => setStartingLevel(option.level)}
                className={
                  selected
                    ? 'rounded-card border border-primary bg-primary/10 px-4 py-4'
                    : 'rounded-card border border-border bg-surface px-4 py-4'
                }
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text className="text-body font-semibold text-text-primary">
                  {option.label}
                </Text>
                <Text className="text-caption text-text-secondary mt-1">
                  Starts around {option.level}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-2">
                  {option.description}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => void handleContinue()}
          disabled={configureLanguageSubject.isPending}
          className="bg-primary rounded-button py-3.5 items-center mt-8"
          testID="language-setup-continue"
        >
          {configureLanguageSubject.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-text-inverse text-body font-semibold">
              Continue
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}
