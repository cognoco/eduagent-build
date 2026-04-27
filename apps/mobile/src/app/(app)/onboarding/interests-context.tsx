// ---------------------------------------------------------------------------
// Interest Context Picker — BKT-C.2
// The "second tap per interest" after the interview chat extracts free-text
// interest labels. For each interest, the learner picks whether it's a
// free-time hobby, a school subject, or both. Defaults to 'both' for any
// entry the user doesn't touch (non-blocking per spec).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { InterestContext, InterestEntry } from '@eduagent/schemas';
import { OnboardingStepIndicator } from '../../../components/onboarding/OnboardingStepIndicator';
import { useUpdateInterestsContext } from '../../../hooks/use-onboarding-dimensions';
import { goBackOrReplace } from '../../../lib/navigation';
import { platformAlert } from '../../../lib/platform-alert';
import { useThemeColors } from '../../../lib/theme';

// Display labels for the three contexts. 'both' is the safest default — the
// LLM can use the item in either register. The spec explicitly warns against
// locking interests into a single context reflexively.
const CONTEXT_OPTIONS: Array<{
  value: InterestContext;
  label: string;
  hint: string;
}> = [
  {
    value: 'school',
    label: 'School',
    hint: 'curriculum subject or class work',
  },
  {
    value: 'free_time',
    label: 'Free time',
    hint: 'hobby, game, or interest outside class',
  },
  { value: 'both', label: 'Both', hint: 'fits either setting' },
];

export default function InterestsContextScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const {
    subjectId,
    subjectName,
    languageCode,
    languageName,
    interests: interestsParam,
    step: stepParam,
    totalSteps: totalStepsParam,
  } = useLocalSearchParams<{
    subjectId?: string;
    subjectName?: string;
    languageCode?: string;
    languageName?: string;
    // The interview emits the extracted labels as a comma-separated list in
    // the nav params so the picker can render them without a separate fetch.
    interests?: string;
    step?: string;
    totalSteps?: string;
  }>();
  const step = Number(stepParam) || 2;
  const totalSteps = Number(totalStepsParam) || 4;

  // Parse and dedupe the incoming interest labels. Drop empties and cap at a
  // reasonable length so a rogue interview doesn't render 50 cards.
  const labels = useMemo(() => {
    if (!interestsParam) return [];
    const seen = new Set<string>();
    return interestsParam
      .split(',')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.length <= 60)
      .filter((l) => {
        const lc = l.toLowerCase();
        if (seen.has(lc)) return false;
        seen.add(lc);
        return true;
      })
      .slice(0, 12);
  }, [interestsParam]);

  // Default every interest to 'both' — the safe fallback from the spec. The
  // user overrides per-interest by tapping a chip. No selection is blocking.
  const [selections, setSelections] = useState<Record<string, InterestContext>>(
    () => Object.fromEntries(labels.map((l) => [l, 'both' as const]))
  );
  const updateInterests = useUpdateInterestsContext();

  const navigateForward = useCallback(() => {
    // The analogy-preference / language-setup fork depends on whether the
    // subject is a language-learning subject. Mirrors interview.tsx's
    // existing post-interview routing.
    const nextPath = languageCode
      ? '/(app)/onboarding/language-setup'
      : '/(app)/onboarding/analogy-preference';
    router.replace({
      pathname: nextPath,
      params: {
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        languageCode: languageCode ?? '',
        languageName: languageName ?? '',
        step: String(Math.min(step + 1, totalSteps)),
        totalSteps: String(totalSteps),
      },
    } as never);
  }, [
    languageCode,
    languageName,
    router,
    step,
    subjectId,
    subjectName,
    totalSteps,
  ]);

  const handleBack = useCallback(() => {
    goBackOrReplace(router, {
      pathname: '/(app)/onboarding/interview',
      params: {
        subjectId: subjectId ?? '',
        subjectName: subjectName ?? '',
        step: String(Math.max(step - 1, 1)),
        totalSteps: String(totalSteps),
      },
    });
  }, [router, subjectId, subjectName, step, totalSteps]);

  const submit = useCallback(
    (entries: InterestEntry[]) => {
      updateInterests.mutate(
        { interests: entries },
        {
          onSuccess: navigateForward,
          onError: () => {
            platformAlert(
              'Could not save',
              'Please check your connection and try again.'
            );
          },
        }
      );
    },
    [updateInterests, navigateForward]
  );

  const handleContinue = useCallback(() => {
    const entries: InterestEntry[] = labels.map((label) => ({
      label,
      context: selections[label] ?? 'both',
    }));
    submit(entries);
  }, [labels, selections, submit]);

  const handleSkip = useCallback(() => {
    // Skip writes every label with context='both' per spec: the default is
    // the safe fallback, not "don't save anything." This preserves the
    // extracted labels so buildMemoryBlock still has material to work with.
    const entries: InterestEntry[] = labels.map((label) => ({
      label,
      context: 'both',
    }));
    submit(entries);
  }, [labels, submit]);

  // Edge case: interview ended with no extracted interests. Forward silently
  // — no reason to show an empty picker. Use useEffect so navigation doesn't
  // fire during render (React anti-pattern).
  useEffect(() => {
    if (labels.length === 0) {
      navigateForward();
    }
  }, [labels.length, navigateForward]);

  if (labels.length === 0) {
    return <View className="flex-1 bg-background" />;
  }

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="px-5 pt-2">
        <Pressable
          testID="interests-context-back"
          onPress={handleBack}
          className="min-h-[44px] min-w-[44px] items-center justify-center self-start"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </Pressable>
        <OnboardingStepIndicator step={step} totalSteps={totalSteps} />
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <Text className="text-h2 font-bold text-text-primary mt-4 mb-2">
          Is each of these a school thing, a free-time thing, or both?
        </Text>
        <Text className="text-body text-text-secondary mb-6">
          This helps me pick the right kind of examples. Skip to mark them all
          as &ldquo;both&rdquo; — you can refine later in Settings.
        </Text>

        <View className="gap-4">
          {labels.map((label) => {
            const current = selections[label] ?? 'both';
            return (
              <View
                key={label}
                className="rounded-card border border-border bg-surface-elevated px-4 py-4"
              >
                <Text className="text-body font-semibold text-text-primary mb-3">
                  {label}
                </Text>
                <View className="flex-row gap-2">
                  {CONTEXT_OPTIONS.map((opt) => {
                    const isSelected = current === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        testID={`interests-${label}-${opt.value}`}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        className={`flex-1 rounded-button border-2 px-3 py-2 items-center ${
                          isSelected
                            ? 'border-primary bg-primary-soft'
                            : 'border-border bg-surface'
                        }`}
                        onPress={() =>
                          setSelections((prev) => ({
                            ...prev,
                            [label]: opt.value,
                          }))
                        }
                      >
                        <Text
                          className={`text-body-sm font-semibold ${
                            isSelected ? 'text-primary' : 'text-text-secondary'
                          }`}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="text-body-sm text-text-tertiary mt-2">
                  {CONTEXT_OPTIONS.find((o) => o.value === current)?.hint}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View className="px-5 py-4 gap-3">
        <Pressable
          testID="interests-context-continue"
          className="bg-primary rounded-button py-4 items-center"
          onPress={handleContinue}
          disabled={updateInterests.isPending}
          accessibilityState={{ disabled: updateInterests.isPending }}
        >
          <Text className="text-text-inverse text-body font-semibold">
            {updateInterests.isPending ? 'Saving…' : 'Continue'}
          </Text>
        </Pressable>
        <Pressable
          testID="interests-context-skip"
          className="py-2 items-center"
          onPress={handleSkip}
        >
          <Text className="text-body text-text-secondary">
            Skip (mark all as both)
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
