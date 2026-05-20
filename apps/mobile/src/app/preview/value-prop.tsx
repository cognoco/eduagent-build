import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getPreviewState,
  type PreviewOnboardingStateV0,
} from '../../lib/preview-onboarding-state';
import { goBackOrReplace } from '../../lib/navigation';
import { track } from '../../lib/analytics';

type Variant = 'learner' | 'parent';

export default function ValuePropScreen() {
  const params = useLocalSearchParams<{ variant?: Variant }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // [LOW-2] Named `previewState` (not `state`) to avoid shadowing the
  // `import * as state from '../../lib/preview-onboarding-state'` pattern
  // used in tests, and to match save.tsx conventions.
  const [previewState, setPreviewStateLocal] =
    useState<PreviewOnboardingStateV0 | null>(null);

  useEffect(() => {
    void getPreviewState().then(setPreviewStateLocal);
  }, []);

  const variant: Variant = params.variant === 'parent' ? 'parent' : 'learner';
  const topic = previewState?.topicText ?? '';

  useEffect(() => {
    track('preview_value_prop_seen', {
      variant,
      intent: previewState?.intent,
      hasTopic: Boolean(previewState?.topicText),
    });
  }, [variant, previewState?.intent, previewState?.topicText]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 24,
      }}
      testID={
        variant === 'learner'
          ? 'preview-value-prop-learner'
          : 'preview-value-prop-parent'
      }
    >
      <Pressable
        onPress={() => goBackOrReplace(router, '/(auth)/sign-in' as const)}
        className="self-start min-h-[44px] justify-center mb-2"
        testID="preview-value-prop-back"
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text className="text-body-sm font-semibold text-primary">
          Back to sign in
        </Text>
      </Pressable>
      {variant === 'learner' ? (
        <LearnerVariant topic={topic} />
      ) : (
        <ParentVariant />
      )}
      <Pressable
        onPress={() => {
          track('preview_signup_started', {
            variant,
            intent: previewState?.intent,
            hasTopic: Boolean(previewState?.topicText),
          });
          router.push('/sign-up');
        }}
        className="bg-primary rounded-button py-3.5 px-8 items-center w-full mt-8"
        testID="preview-signup-cta"
        accessibilityRole="button"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {variant === 'learner'
            ? topic
              ? `Sign up to start your first lesson on ${topic}`
              : 'Sign up to start your first lesson'
            : 'Sign up to set up your child'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function SampleMarker() {
  return (
    <View
      className="self-start bg-surface rounded-full px-3 py-1 mb-4"
      testID="preview-sample-marker"
    >
      <Text className="text-caption text-text-muted">Sample</Text>
    </View>
  );
}

function LearnerVariant({ topic }: { topic: string }) {
  return (
    <View>
      <Text className="text-h1 font-bold text-text-primary mb-3">
        Here&apos;s how MentoMate teaches
      </Text>
      <Text className="text-body text-text-secondary mb-6">
        A back-and-forth conversation that follows what you actually need — not
        a fixed lesson plan.
      </Text>
      <SampleMarker />
      <View className="bg-surface rounded-card p-4 mb-3 self-start max-w-[85%]">
        <Text className="text-body-sm text-text-primary">
          {topic
            ? `Let's work on ${topic}. What part is tripping you up?`
            : 'What are you working on today?'}
        </Text>
      </View>
      <View className="bg-primary/10 rounded-card p-4 mb-3 self-end max-w-[85%]">
        <Text className="text-body-sm text-text-primary">
          I get the formula but I don&apos;t know when to use it.
        </Text>
      </View>
      <View className="bg-surface rounded-card p-4 self-start max-w-[85%]">
        <Text className="text-body-sm text-text-primary">
          Good — that&apos;s the most useful question. Let me show you with a
          concrete example…
        </Text>
      </View>
    </View>
  );
}

function ParentVariant() {
  return (
    <View>
      <Text className="text-h1 font-bold text-text-primary mb-3">
        Here&apos;s how MentoMate helps families
      </Text>
      <Text className="text-body text-text-secondary mb-6">
        You set up your child, they learn, and you get a short weekly read on
        what they&apos;re working on. No surveillance, just signal.
      </Text>
      <SampleMarker />
      <View className="bg-surface rounded-card p-5 mb-3">
        <Text className="text-body font-semibold text-text-primary mb-2">
          Weekly highlight
        </Text>
        <Text className="text-body-sm text-text-secondary mb-3">
          Practiced quadratic equations for 45 minutes across three sessions.
          Getting comfortable with factoring; working on completing the square.
        </Text>
        <Text className="text-caption text-text-muted">
          Sample data — your child&apos;s real insights appear after their first
          session.
        </Text>
      </View>
    </View>
  );
}
