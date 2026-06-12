// TODO(telemetry): preview_intent_seen / preview_intent_selected / preview_topic_seen / preview_topic_entered / preview_value_prop_seen / preview_value_prop_cta — see docs/plans/2026-05-19-trial-intent-save-onboarding-v0.md MEDIUM-C3
import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  setPreviewState,
  type PreviewIntent,
} from '../../lib/preview-onboarding-state';
import { track } from '../../lib/analytics';

interface Option {
  intent: PreviewIntent;
  label: string;
  description: string;
  testID: string;
}

function buildOptions(t: TFunction): ReadonlyArray<Option> {
  return [
    {
      intent: 'self',
      label: t('preview.intentSelfLabel'),
      description: t('preview.intentSelfDescription'),
      testID: 'intent-self',
    },
    {
      intent: 'child',
      label: t('preview.intentChildLabel'),
      description: t('preview.intentChildDescription'),
      testID: 'intent-child',
    },
    {
      intent: 'both',
      label: t('preview.intentBothLabel'),
      description: t('preview.intentBothDescription'),
      testID: 'intent-both',
    },
    {
      intent: 'not_sure',
      label: t('preview.intentNotSureLabel'),
      description: t('preview.intentNotSureDescription'),
      testID: 'intent-not-sure',
    },
  ];
}

export default function PreviewIntentScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    track('preview_intent_seen');
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSubmitting(false);
    }, []),
  );

  const onSelect = async (intent: PreviewIntent) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const createdAt = new Date().toISOString();
      track('preview_intent_selected', { intent });

      if (intent === 'self') {
        await setPreviewState({
          intent: 'self',
          path: 'learner_value_prop',
          createdAt,
        });
        router.push('/preview/topic');
        return;
      }
      if (intent === 'child') {
        await setPreviewState({
          intent: 'child',
          path: 'parent_value_prop',
          createdAt,
        });
        router.push({
          pathname: '/preview/value-prop',
          params: { variant: 'parent' },
        });
        return;
      }
      if (intent === 'both') {
        await setPreviewState({
          intent: 'both',
          path: 'parent_value_prop',
          bothPriority: 'child_first',
          createdAt,
        });
        router.push('/preview/both');
        return;
      }
      // not_sure → lesson fork (v0: same as self)
      await setPreviewState({
        intent: 'not_sure',
        path: 'learner_value_prop',
        createdAt,
      });
      router.push('/preview/topic');
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom }}
      testID="preview-intent"
    >
      <Pressable
        onPress={() => router.replace('/(auth)/sign-in')}
        className="self-start min-h-[44px] justify-center mb-2"
        testID="preview-intent-back"
        accessibilityRole="button"
        accessibilityLabel={t('common.goBackAction')}
      >
        <Text className="text-body-sm font-semibold text-primary">
          {t('preview.backToSignIn')}
        </Text>
      </Pressable>
      <Text className="text-h1 font-bold text-text-primary mb-2 text-center">
        {t('preview.intentQuestion')}
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        {t('preview.intentHint')}
      </Text>
      {buildOptions(t).map((opt) => (
        <Pressable
          key={opt.intent}
          onPress={() => void onSelect(opt.intent)}
          disabled={submitting}
          className="bg-surface rounded-card px-4 py-4 mb-3"
          style={{ opacity: submitting ? 0.6 : 1 }}
          testID={opt.testID}
          accessibilityRole="button"
          accessibilityLabel={opt.label}
          accessibilityState={{ disabled: submitting }}
        >
          <Text className="text-body font-semibold text-text-primary mb-1">
            {opt.label}
          </Text>
          <Text className="text-body-sm text-text-secondary">
            {opt.description}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
