import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  setPreviewState,
  type PreviewIntent,
} from '../../lib/preview-onboarding-state';
import { goBackOrReplace } from '../../lib/navigation';
import { track } from '../../lib/analytics';

interface Option {
  intent: PreviewIntent;
  label: string;
  description: string;
  testID: string;
}

const OPTIONS: ReadonlyArray<Option> = [
  {
    intent: 'self',
    label: 'Me',
    description: "I'm setting this up for myself.",
    testID: 'intent-self',
  },
  {
    intent: 'child',
    label: 'My child',
    description: 'I want to help my child.',
    testID: 'intent-child',
  },
  {
    intent: 'both',
    label: 'Both',
    description: 'For me and my child.',
    testID: 'intent-both',
  },
  {
    intent: 'not_sure',
    label: 'Not sure',
    description: 'Show me how it works first.',
    testID: 'intent-not-sure',
  },
];

export default function PreviewIntentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    track('preview_intent_seen');
  }, []);

  const onSelect = async (intent: PreviewIntent) => {
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
      router.push({
        pathname: '/preview/value-prop',
        params: { variant: 'parent' },
      });
      return;
    }
    // not_sure → lesson fork (v0: same as self)
    await setPreviewState({
      intent: 'not_sure',
      path: 'learner_value_prop',
      createdAt,
    });
    router.push('/preview/topic');
  };

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom }}
      testID="preview-intent"
    >
      <Pressable
        onPress={() => goBackOrReplace(router, '/(auth)/sign-in' as const)}
        className="self-start min-h-[44px] justify-center mb-2"
        testID="preview-intent-back"
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text className="text-body-sm font-semibold text-primary">
          Back to sign in
        </Text>
      </Pressable>
      <Text className="text-h1 font-bold text-text-primary mb-2 text-center">
        Who are you setting this up for?
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        We&apos;ll tailor what you see next.
      </Text>
      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.intent}
          onPress={() => void onSelect(opt.intent)}
          className="bg-surface rounded-card px-4 py-4 mb-3"
          testID={opt.testID}
          accessibilityRole="button"
          accessibilityLabel={opt.label}
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
