import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getPreviewState,
  setPreviewState,
  type PreviewOnboardingStateV0,
} from '../../lib/preview-onboarding-state';
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

  const onTryLesson = async () => {
    const base: PreviewOnboardingStateV0 = previewState ?? {
      intent: 'not_sure',
      path: 'learner_lesson',
      createdAt: new Date().toISOString(),
    };
    await setPreviewState({
      ...base,
      path: 'learner_lesson',
    });
    track('preview_parent_try_lesson_selected', {
      intent: base.intent,
    });
    router.push('/preview/topic');
  };

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
        onPress={() => router.replace('/(auth)/sign-in')}
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
        <ParentVariant onTryLesson={() => void onTryLesson()} />
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
  const sample = getLearnerSample(topic);

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
        <Text className="text-body-sm text-text-primary">{sample.mentor}</Text>
      </View>
      <View className="bg-primary/10 rounded-card p-4 mb-3 self-end max-w-[85%]">
        <Text className="text-body-sm text-text-primary">{sample.learner}</Text>
      </View>
      <View className="bg-surface rounded-card p-4 self-start max-w-[85%]">
        <Text className="text-body-sm text-text-primary">
          {sample.followUp}
        </Text>
      </View>
    </View>
  );
}

function getLearnerSample(topic: string): {
  mentor: string;
  learner: string;
  followUp: string;
} {
  const normalized = topic.toLowerCase();

  if (normalized.includes('geography')) {
    return {
      mentor:
        'Let us try geography. A desert is defined by low rainfall, not heat. Why might land behind mountains stay dry?',
      learner: 'Because the rain falls before the air gets there?',
      followUp:
        'Exactly. Mountains can squeeze moisture out on one side, leaving drier air on the other. That is called a rain shadow.',
    };
  }

  if (normalized.includes('fraction')) {
    return {
      mentor:
        'Let us compare fractions. If two pieces come from the same whole, the larger piece has the smaller bottom number.',
      learner: 'So 1/2 is bigger than 1/3?',
      followUp:
        'Yes. Splitting something into two parts makes each part bigger than splitting it into three parts.',
    };
  }

  if (normalized.includes('writing')) {
    return {
      mentor:
        'Let us plan a paragraph. Start with the one thing you want the reader to believe.',
      learner: 'So I should choose the main point before examples?',
      followUp:
        'Right. Once the main point is clear, the examples have a job instead of feeling random.',
    };
  }

  return {
    mentor:
      topic.length > 0
        ? `Let us work on ${topic}. I will show one idea, then ask a quick check.`
        : 'Let us try a quick sample. I will show one idea, then ask a quick check.',
    learner: 'I am not sure how to start.',
    followUp:
      'That is a good starting point. We will make the first step concrete, then build from there.',
  };
}

function ParentVariant({ onTryLesson }: { onTryLesson: () => void }) {
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
      <Pressable
        onPress={onTryLesson}
        className="border border-border rounded-button py-3.5 px-8 items-center w-full mt-4"
        testID="preview-try-lesson-cta"
        accessibilityRole="button"
      >
        <Text className="text-body font-semibold text-primary">
          Try a sample lesson first
        </Text>
      </Pressable>
    </View>
  );
}
