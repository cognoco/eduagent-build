import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { personaFromBirthYear, useProfile } from '../../lib/profile';
import {
  CollapsibleMemorySection,
  MemoryRow,
  MemorySection,
  getLearningStyleRows,
  getStruggleProgress,
} from '../../components/mentor-memory-sections';
import { TellMentorInput } from '../../components/tell-mentor-input';
import { goBackOrReplace } from '../../lib/navigation';
import {
  useDeleteAllMemory,
  useDeleteMemoryItem,
  useLearnerProfile,
  useTellMentor,
  useToggleMemoryInjection,
  useUnsuppressInference,
} from '../../hooks/use-learner-profile';

export default function MentorMemoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeProfile } = useProfile();
  const { data: profile, isLoading, isError, refetch } = useLearnerProfile();
  const deleteItem = useDeleteMemoryItem();
  const deleteAll = useDeleteAllMemory();
  const tellMentor = useTellMentor();
  const toggleInjection = useToggleMemoryInjection();
  const unsuppress = useUnsuppressInference();
  const [draft, setDraft] = useState('');

  const learningStyleRows = useMemo(
    () => getLearningStyleRows(profile?.learningStyle ?? null),
    [profile?.learningStyle]
  );

  const accommodationMode = profile?.accommodationMode ?? 'none';

  const accommodationBadgeText = useMemo(() => {
    if (accommodationMode === 'none') return null;
    const persona = personaFromBirthYear(activeProfile?.birthYear);
    const modeLabels: Record<
      string,
      { young: string; mid: string; older: string }
    > = {
      'short-burst': {
        young: 'Your mentor uses a special way to teach you!',
        mid: 'Learning style: Short-Burst — shorter explanations with lots of check-ins',
        older:
          'Accommodation mode: Short-Burst — concise explanations, frequent checkpoints',
      },
      'audio-first': {
        young: 'Your mentor uses a special way to teach you!',
        mid: 'Learning style: Audio-First — simple, spoken-style explanations',
        older:
          'Accommodation mode: Audio-First — spoken-style language, phonetic support',
      },
      predictable: {
        young: 'Your mentor uses a special way to teach you!',
        mid: 'Learning style: Predictable — clear structure and step-by-step sessions',
        older:
          'Accommodation mode: Predictable — structured sessions, explicit transitions',
      },
    };
    const labels = modeLabels[accommodationMode];
    if (!labels) return null;
    // personaFromBirthYear returns: 'teen' (under 13), 'learner' (13-17), 'parent' (18+)
    if (persona === 'teen') return labels.young;
    if (persona === 'learner') return labels.mid;
    return labels.older;
  }, [accommodationMode, activeProfile?.birthYear]);

  const handleDeleteAll = useCallback(() => {
    Alert.alert(
      'Clear mentor memory?',
      'This removes everything the mentor has remembered about you and turns memory off until you enable it again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAll.mutateAsync({});
            } catch {
              Alert.alert('Could not clear memory', 'Please try again.');
            }
          },
        },
      ]
    );
  }, [deleteAll]);

  const handleTellMentor = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      await tellMentor.mutateAsync({ text });
      setDraft('');
    } catch {
      Alert.alert('Could not save that', 'Please try again.');
    }
  }, [draft, tellMentor]);

  const handleToggleInjection = useCallback(
    (value: boolean) => {
      void (async () => {
        try {
          await toggleInjection.mutateAsync({
            memoryInjectionEnabled: value,
          });
        } catch {
          Alert.alert('Could not update memory', 'Please try again.');
        }
      })();
    },
    [toggleInjection]
  );

  const consentStatus = profile?.memoryConsentStatus ?? 'pending';

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View
        testID="mentor-memory-error"
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-body text-text-primary text-center px-6">
          We couldn't load your mentor memory right now
        </Text>
        <Pressable
          testID="mentor-memory-retry"
          onPress={() => void refetch()}
          className="mt-4 px-6 py-3 bg-primary rounded-card"
          accessibilityRole="button"
        >
          <Text className="text-body font-semibold text-white">Retry</Text>
        </Pressable>
        <Pressable
          testID="mentor-memory-go-back"
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="mt-3 px-6 py-3"
          accessibilityRole="button"
        >
          <Text className="text-body text-primary">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="me-3 py-2 pe-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            What My Mentor Knows
          </Text>
          <Text className="text-body-sm text-text-secondary mt-0.5">
            Review, edit, or add what your mentor remembers.
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View className="bg-surface rounded-card p-4 mt-4">
          <Text className="text-body font-semibold text-text-primary">
            Memory status
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {consentStatus === 'granted'
              ? 'Memory collection is enabled.'
              : consentStatus === 'declined'
              ? 'Memory collection is turned off.'
              : 'A parent or guardian still needs to enable memory collection.'}
          </Text>
          <View className="flex-row items-center justify-between mt-4">
            <Text className="text-body text-text-primary">
              Use what the mentor knows
            </Text>
            <Switch
              value={profile?.memoryInjectionEnabled ?? false}
              onValueChange={handleToggleInjection}
              disabled={isLoading || toggleInjection.isPending}
              accessibilityLabel="Use what the mentor knows"
            />
          </View>
        </View>

        {accommodationBadgeText ? (
          <View
            className="bg-primary/10 rounded-card px-4 py-3 mt-3"
            accessibilityRole="text"
            testID="accommodation-badge"
          >
            <Text className="text-body-sm font-medium text-primary">
              {accommodationBadgeText}
            </Text>
            <Text className="text-caption text-text-secondary mt-1">
              Set by your parent in their settings.
            </Text>
          </View>
        ) : null}

        <MemorySection title="Tell Your Mentor">
          <TellMentorInput
            birthYear={activeProfile?.birthYear}
            value={draft}
            isPending={tellMentor.isPending}
            onChangeText={setDraft}
            onSubmit={() => void handleTellMentor()}
          />
        </MemorySection>

        <MemorySection title="Learning Style">
          {learningStyleRows.length > 0 ? (
            learningStyleRows.map((row) => (
              <MemoryRow
                key={row.key}
                label={row.label}
                source={row.source}
                onRemove={async () => {
                  try {
                    await deleteItem.mutateAsync({
                      category: 'learningStyle',
                      value: row.key,
                      suppress: true,
                    });
                  } catch {
                    Alert.alert('Could not delete item', 'Please try again.');
                  }
                }}
              />
            ))
          ) : (
            <MemoryRow label="Nothing saved yet." />
          )}
        </MemorySection>

        <MemorySection title="Interests">
          {(profile?.interests ?? []).length > 0 ? (
            profile?.interests.map((interest) => (
              <MemoryRow
                key={interest}
                label={interest}
                onRemove={async () => {
                  try {
                    await deleteItem.mutateAsync({
                      category: 'interests',
                      value: interest,
                      suppress: true,
                    });
                  } catch {
                    Alert.alert('Could not delete item', 'Please try again.');
                  }
                }}
              />
            ))
          ) : (
            <MemoryRow label="Nothing saved yet." />
          )}
        </MemorySection>

        <MemorySection title="Strengths">
          {(profile?.strengths ?? []).length > 0 ? (
            profile?.strengths.map((entry) => (
              <MemoryRow
                key={entry.subject}
                label={`${entry.subject}: ${entry.topics.join(', ')}`}
                source={entry.source}
                onRemove={async () => {
                  try {
                    await deleteItem.mutateAsync({
                      category: 'strengths',
                      value: entry.subject,
                      suppress: true,
                    });
                  } catch {
                    Alert.alert('Could not delete item', 'Please try again.');
                  }
                }}
              />
            ))
          ) : (
            <MemoryRow label="Nothing saved yet." />
          )}
        </MemorySection>

        <CollapsibleMemorySection
          title="Things You're Improving At"
          defaultExpanded={false}
        >
          {(profile?.struggles ?? []).length > 0 ? (
            profile?.struggles.map((entry) => {
              const progress = getStruggleProgress(entry);
              return (
                <MemoryRow
                  key={`${entry.subject ?? 'freeform'}:${entry.topic}`}
                  label={`${entry.subject ? `${entry.subject}: ` : ''}${
                    entry.topic
                  }`}
                  source={entry.source}
                  progressLabel={progress.progressLabel}
                  progressValue={progress.progressValue}
                  onRemove={async () => {
                    try {
                      await deleteItem.mutateAsync({
                        category: 'struggles',
                        value: entry.topic,
                        subject: entry.subject ?? undefined,
                        suppress: true,
                      });
                    } catch {
                      Alert.alert('Could not delete item', 'Please try again.');
                    }
                  }}
                />
              );
            })
          ) : (
            <MemoryRow label="Nothing saved yet." />
          )}
        </CollapsibleMemorySection>

        <MemorySection title="Communication Notes">
          {(profile?.communicationNotes ?? []).length > 0 ? (
            profile?.communicationNotes.map((note) => (
              <MemoryRow
                key={note}
                label={note}
                onRemove={async () => {
                  try {
                    await deleteItem.mutateAsync({
                      category: 'communicationNotes',
                      value: note,
                      suppress: true,
                    });
                  } catch {
                    Alert.alert('Could not delete item', 'Please try again.');
                  }
                }}
              />
            ))
          ) : (
            <MemoryRow label="Nothing saved yet." />
          )}
        </MemorySection>

        {(profile?.suppressedInferences ?? []).length > 0 ? (
          <CollapsibleMemorySection
            title="Hidden Items"
            defaultExpanded={false}
          >
            {profile?.suppressedInferences.map((value) => (
              <MemoryRow
                key={value}
                label={value}
                actionLabel="Bring back"
                onRemove={async () => {
                  try {
                    await unsuppress.mutateAsync({ value });
                  } catch {
                    Alert.alert('Could not restore item', 'Please try again.');
                  }
                }}
              />
            ))}
          </CollapsibleMemorySection>
        ) : null}

        <MemorySection title="Privacy">
          <Pressable
            onPress={handleDeleteAll}
            className="bg-surface rounded-card px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel={`Clear mentor memory for ${
              activeProfile?.displayName ?? 'this profile'
            }`}
          >
            <Text className="text-body font-semibold text-danger">
              Clear all mentor memory
            </Text>
          </Pressable>
        </MemorySection>
      </ScrollView>
    </View>
  );
}
