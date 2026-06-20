import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getPreviewState,
  setPreviewState,
  type PreviewOnboardingStateV0,
} from '../../lib/preview-onboarding-state';
import { track } from '../../lib/analytics';

interface SampleLesson {
  id: string;
  title: string;
  description: string;
  topicText: string;
  testID: string;
}

function buildSampleLessons(t: TFunction): ReadonlyArray<SampleLesson> {
  return [
    {
      id: 'geography',
      title: t('preview.sampleGeographyTitle'),
      description: t('preview.sampleGeographyDescription'),
      topicText: 'Geography: why deserts form',
      testID: 'preview-topic-sample-geography',
    },
    {
      id: 'fractions',
      title: t('preview.sampleFractionsTitle'),
      description: t('preview.sampleFractionsDescription'),
      topicText: 'Fractions: compare parts',
      testID: 'preview-topic-sample-fractions',
    },
    {
      id: 'writing',
      title: t('preview.sampleWritingTitle'),
      description: t('preview.sampleWritingDescription'),
      topicText: 'Writing: plan a paragraph',
      testID: 'preview-topic-sample-writing',
    },
  ];
}

export default function PreviewTopicScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<PreviewOnboardingStateV0 | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void getPreviewState().then((s) => {
      if (s) setCurrent(s);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSubmitting(false);
    }, []),
  );

  const onSelect = async (sample: SampleLesson) => {
    if (submitting) return;
    setSubmitting(true);
    // Re-fetch state in case the effect hadn't settled when the user pressed.
    const s = current ?? (await getPreviewState());
    const base: PreviewOnboardingStateV0 = s ?? {
      intent: 'not_sure',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    };
    await setPreviewState({
      ...base,
      path: 'learner_value_prop',
      topicText: sample.topicText,
    });
    track('preview_topic_submitted', {
      intent: base.intent,
      path: 'learner_value_prop',
      sampleId: sample.id,
      topicLength: sample.topicText.length,
    });
    router.push({
      pathname: '/preview/value-prop',
      params: { variant: 'learner' },
    });
  };

  const sampleLessons = buildSampleLessons(t);

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 16 }}
      testID="preview-topic"
    >
      <Pressable
        onPress={() => router.replace('/(auth)/sign-in')}
        className="self-start min-h-[44px] justify-center mb-2"
        testID="preview-topic-back"
        accessibilityRole="button"
        accessibilityLabel={t('common.goBackAction')}
      >
        <Text className="text-body-sm font-semibold text-primary">
          {t('preview.backToSignIn')}
        </Text>
      </Pressable>
      <Text className="text-h1 font-bold text-text-primary mb-2 text-center">
        {t('preview.pickSampleLesson')}
      </Text>
      <Text className="text-body text-text-secondary mb-6 text-center">
        {t('preview.safePreviews')}
      </Text>
      {sampleLessons.map((sample) => (
        <Pressable
          key={sample.id}
          onPress={() => void onSelect(sample)}
          disabled={submitting}
          className="bg-surface rounded-card px-4 py-4 mb-3"
          style={{ opacity: submitting ? 0.6 : 1 }}
          testID={sample.testID}
          accessibilityRole="button"
          accessibilityLabel={sample.title}
          accessibilityState={{ disabled: submitting }}
        >
          <Text className="text-body font-semibold text-text-primary mb-1">
            {sample.title}
          </Text>
          <Text className="text-body-sm text-text-secondary">
            {sample.description}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
