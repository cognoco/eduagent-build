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

type BothPriority = 'child_first' | 'self_first';

interface Option {
  priority: BothPriority;
  label: string;
  description: string;
  testID: string;
}

function buildOptions(t: TFunction): ReadonlyArray<Option> {
  return [
    {
      priority: 'child_first',
      label: t('preview.bothChildFirstLabel'),
      description: t('preview.bothChildFirstDescription'),
      testID: 'both-priority-child-first',
    },
    {
      priority: 'self_first',
      label: t('preview.bothSelfFirstLabel'),
      description: t('preview.bothSelfFirstDescription'),
      testID: 'both-priority-self-first',
    },
  ];
}

export default function PreviewBothScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    track('preview_both_priority_seen');
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSubmitting(false);
    }, []),
  );

  const onSelect = async (priority: BothPriority) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      track('preview_both_priority_selected', { priority });
      const existing = await getPreviewState();
      const base: PreviewOnboardingStateV0 = existing ?? {
        intent: 'both',
        path: 'parent_value_prop',
        createdAt: new Date().toISOString(),
      };

      if (priority === 'self_first') {
        await setPreviewState({
          ...base,
          intent: 'both',
          path: 'learner_value_prop',
          bothPriority: 'self_first',
        });
        router.push('/preview/topic');
        return;
      }

      // child_first: head into the parent value-prop, same as intent='child'
      await setPreviewState({
        ...base,
        intent: 'both',
        path: 'parent_value_prop',
        bothPriority: 'child_first',
      });
      router.push({
        pathname: '/preview/value-prop',
        params: { variant: 'parent' },
      });
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom }}
      testID="preview-both"
    >
      <Pressable
        onPress={() => router.replace('/(auth)/sign-in')}
        className="self-start min-h-[44px] justify-center mb-2"
        testID="preview-both-back"
        accessibilityRole="button"
        accessibilityLabel={t('common.goBackAction')}
      >
        <Text className="text-body-sm font-semibold text-primary">
          {t('preview.backToSignIn')}
        </Text>
      </Pressable>
      <Text className="text-h1 font-bold text-text-primary mb-2 text-center">
        {t('preview.bothQuestion')}
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        {t('preview.bothHint')}
      </Text>
      {buildOptions(t).map((opt) => (
        <Pressable
          key={opt.priority}
          onPress={() => void onSelect(opt.priority)}
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
