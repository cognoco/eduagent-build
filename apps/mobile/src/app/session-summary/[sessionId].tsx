import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import { useSubmitSummary } from '../../hooks/use-sessions';

export default function SessionSummaryScreen() {
  const { sessionId, subjectName, exchangeCount, escalationRung } =
    useLocalSearchParams<{
      sessionId: string;
      subjectName?: string;
      exchangeCount?: string;
      escalationRung?: string;
    }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const [summaryText, setSummaryText] = useState('');
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submitSummary = useSubmitSummary(sessionId ?? '');

  const exchanges = parseInt(exchangeCount ?? '0', 10);
  const rung = parseInt(escalationRung ?? '1', 10);

  const handleSubmit = async (): Promise<void> => {
    if (summaryText.trim().length < 10 || submitSummary.isPending) return;

    try {
      const result = await submitSummary.mutateAsync({
        content: summaryText.trim(),
      });
      setAiFeedback(result.summary.aiFeedback);
      setSubmitted(true);
    } catch {
      // Error state handled by mutation
    }
  };

  const handleContinue = (): void => {
    router.replace('/(learner)/home');
  };

  const takeaways: string[] = [];
  if (exchanges > 0) {
    takeaways.push(
      `You worked through ${exchanges} exchange${exchanges === 1 ? '' : 's'}`
    );
  }
  if (rung >= 3) {
    takeaways.push('You tackled some challenging concepts with guidance');
  } else if (exchanges > 0) {
    takeaways.push('You showed strong independent thinking');
  }
  if (takeaways.length === 0) {
    takeaways.push('Great effort today');
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View
        className="px-4 py-3 bg-surface border-b border-surface-elevated"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Text
          className="text-h3 font-semibold text-text-primary"
          testID="summary-title"
        >
          Session Complete
        </Text>
        {subjectName ? (
          <Text className="text-caption text-text-secondary mt-1">
            {subjectName}
          </Text>
        ) : null}
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Session takeaways (learner-friendly, no internal metrics) */}
        <View
          className="bg-surface rounded-card p-4 mb-4"
          testID="session-takeaways"
        >
          <Text className="text-body font-semibold text-text-primary mb-2">
            What happened
          </Text>
          {takeaways.map((t, i) => (
            <View key={i} className="flex-row items-start mt-1">
              <Text className="text-body text-text-secondary me-2">
                {'\u2022'}
              </Text>
              <Text className="text-body text-text-primary flex-1">{t}</Text>
            </View>
          ))}
          <Text className="text-caption text-text-secondary mt-3">
            Your coach will check in soon
          </Text>
        </View>

        {/* Your Words section */}
        <View className="mb-4">
          <Text className="text-body font-semibold text-text-primary mb-2">
            Your Words
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            Write a short summary of what you learned. This helps you remember
            and helps your coach plan next time.
          </Text>

          {!submitted ? (
            <>
              <TextInput
                className="bg-surface rounded-card px-4 py-3 text-body text-text-primary min-h-[120px]"
                placeholder="In my own words, I learned that..."
                placeholderTextColor={colors.muted}
                value={summaryText}
                onChangeText={setSummaryText}
                multiline
                maxLength={2000}
                textAlignVertical="top"
                editable={!submitSummary.isPending}
                testID="summary-input"
                accessibilityLabel="Write your learning summary"
              />
              <Text className="text-caption text-text-secondary mt-1 text-right">
                {summaryText.length}/2000
              </Text>

              {submitSummary.isError && (
                <Text
                  className="text-body-sm text-danger mt-2"
                  testID="summary-error"
                >
                  Failed to submit summary. Please try again.
                </Text>
              )}

              <Pressable
                onPress={handleSubmit}
                disabled={
                  summaryText.trim().length < 10 || submitSummary.isPending
                }
                className={`rounded-button py-3 items-center mt-3 ${
                  summaryText.trim().length >= 10 && !submitSummary.isPending
                    ? 'bg-primary'
                    : 'bg-surface-elevated'
                }`}
                testID="submit-summary-button"
                accessibilityLabel="Submit summary"
                accessibilityRole="button"
              >
                {submitSummary.isPending ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text
                    className={`text-body font-semibold ${
                      summaryText.trim().length >= 10
                        ? 'text-text-inverse'
                        : 'text-text-secondary'
                    }`}
                  >
                    Submit Summary
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <View
              className="bg-surface rounded-card p-4"
              testID="summary-submitted"
            >
              <Text className="text-body text-text-primary mb-2">
                {summaryText}
              </Text>
              <View className="h-px bg-surface-elevated my-3" />
              <Text className="text-body-sm font-semibold text-text-primary mb-1">
                Coach feedback
              </Text>
              <Text
                className="text-body-sm text-text-secondary"
                testID="ai-feedback"
              >
                {aiFeedback}
              </Text>
            </View>
          )}
        </View>

        {/* Skip / Continue */}
        {!submitted ? (
          <Pressable
            onPress={handleContinue}
            className="py-3 items-center"
            testID="skip-summary-button"
            accessibilityLabel="Skip summary"
            accessibilityRole="button"
          >
            <Text className="text-body-sm text-text-secondary">
              Skip for now
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleContinue}
            className="bg-primary rounded-button py-3 items-center mt-2"
            testID="continue-button"
            accessibilityLabel="Continue to home"
            accessibilityRole="button"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Continue
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
