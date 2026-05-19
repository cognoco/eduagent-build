import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../../lib/theme';
import {
  getPreviewState,
  setPreviewState,
  type PreviewOnboardingStateV0,
} from '../../lib/preview-onboarding-state';

// [MEDIUM-5] Single-line topic cap. The value is persisted to SecureStore for
// up to 1h pre-signup, so it WILL outlive the screen. Keeping the field short
// discourages users from pasting longer free text that may contain PII (child
// names, school names, learning disability descriptions), and the parent-vs-
// learner branch never needs more than a couple of words to tailor copy.
// Spec §Preview State (Minimal) accepts the truncated cap.
const MAX_TOPIC_LEN = 80;

export default function PreviewTopicScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [current, setCurrent] = useState<PreviewOnboardingStateV0 | null>(null);
  const [topic, setTopic] = useState('');

  useEffect(() => {
    void getPreviewState().then((s) => {
      if (s) {
        setCurrent(s);
        if (s.topicText) setTopic(s.topicText);
      }
    });
  }, []);

  const trimmed = topic.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_TOPIC_LEN;

  const onContinue = async () => {
    if (!canSubmit) return;
    // Re-fetch state in case the effect hadn't settled when the user pressed.
    const s = current ?? (await getPreviewState());
    if (!s) return;
    await setPreviewState({ ...s, topicText: trimmed });
    router.push({
      pathname: '/preview/value-prop',
      params: { variant: 'learner' },
    });
  };

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 16 }}
      testID="preview-topic"
    >
      <Text className="text-h1 font-bold text-text-primary mb-2 text-center">
        What should we help with?
      </Text>
      <Text className="text-body text-text-secondary mb-6 text-center">
        A topic, a question, anything you&apos;re working on.
      </Text>
      <TextInput
        value={topic}
        onChangeText={setTopic}
        maxLength={MAX_TOPIC_LEN}
        placeholder="e.g. quadratic equations"
        placeholderTextColor={colors.muted}
        className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-6"
        autoFocus
        testID="preview-topic-input"
        accessibilityLabel="Topic"
      />
      <Pressable
        onPress={() => void onContinue()}
        disabled={!canSubmit}
        className={`rounded-button py-3.5 items-center ${canSubmit ? 'bg-primary' : 'bg-primary/40'}`}
        testID="preview-topic-continue"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
        accessibilityLabel="Continue"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Continue
        </Text>
      </Pressable>
    </View>
  );
}
