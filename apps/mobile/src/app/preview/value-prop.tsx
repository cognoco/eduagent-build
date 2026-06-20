import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
  const { t } = useTranslation();
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
        accessibilityLabel={t('common.goBackAction')}
      >
        <Text className="text-body-sm font-semibold text-primary">
          {t('preview.backToSignIn')}
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
              ? t('preview.signUpLessonTopic', { topic })
              : t('preview.signUpLesson')
            : t('preview.signUpChild')}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function SampleMarker() {
  const { t } = useTranslation();
  return (
    <View
      className="self-start bg-surface rounded-full px-3 py-1 mb-4"
      testID="preview-sample-marker"
    >
      <Text className="text-caption text-text-muted">
        {t('preview.sampleBadge')}
      </Text>
    </View>
  );
}

function LearnerVariant({ topic }: { topic: string }) {
  const { t } = useTranslation();
  const sample = getLearnerSample(topic, t);

  return (
    <View>
      <Text className="text-h1 font-bold text-text-primary mb-3">
        {t('preview.howTeaches')}
      </Text>
      <Text className="text-body text-text-secondary mb-6">
        {t('preview.conversationPitch')}
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

function getLearnerSample(
  topic: string,
  t: TFunction,
): {
  mentor: string;
  learner: string;
  followUp: string;
} {
  const normalized = topic.toLowerCase();

  if (normalized.includes('geography')) {
    return {
      mentor: t('preview.sampleGeographyMentor'),
      learner: t('preview.sampleGeographyLearner'),
      followUp: t('preview.sampleGeographyFollowUp'),
    };
  }

  if (normalized.includes('fraction')) {
    return {
      mentor: t('preview.sampleFractionsMentor'),
      learner: t('preview.sampleFractionsLearner'),
      followUp: t('preview.sampleFractionsFollowUp'),
    };
  }

  if (normalized.includes('writing')) {
    return {
      mentor: t('preview.sampleWritingMentor'),
      learner: t('preview.sampleWritingLearner'),
      followUp: t('preview.sampleWritingFollowUp'),
    };
  }

  return {
    mentor:
      topic.length > 0
        ? t('preview.sampleGenericMentorWithTopic', { topic })
        : t('preview.sampleGenericMentor'),
    learner: t('preview.sampleGenericLearner'),
    followUp: t('preview.sampleGenericFollowUp'),
  };
}

function ParentVariant({ onTryLesson }: { onTryLesson: () => void }) {
  const { t } = useTranslation();
  return (
    <View>
      <Text className="text-h1 font-bold text-text-primary mb-3">
        {t('preview.howHelpsFamilies')}
      </Text>
      <Text className="text-body text-text-secondary mb-6">
        {t('preview.weeklyReadPitch')}
      </Text>
      <SampleMarker />
      <View className="bg-surface rounded-card p-5 mb-3">
        <Text className="text-body font-semibold text-text-primary mb-2">
          {t('preview.weeklyHighlight')}
        </Text>
        <Text className="text-body-sm text-text-secondary mb-3">
          {t('preview.sampleWeeklyBody')}
        </Text>
        <Text className="text-caption text-text-muted">
          {t('preview.sampleDataNote')}
        </Text>
      </View>
      <Pressable
        onPress={onTryLesson}
        className="border border-border rounded-button py-3.5 px-8 items-center w-full mt-4"
        testID="preview-try-lesson-cta"
        accessibilityRole="button"
      >
        <Text className="text-body font-semibold text-primary">
          {t('preview.trySampleFirst')}
        </Text>
      </Pressable>
    </View>
  );
}
