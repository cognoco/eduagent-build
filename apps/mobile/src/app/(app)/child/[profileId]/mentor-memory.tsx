import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  View,
} from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MemoryConsentPrompt } from '../../../../components/memory-consent-prompt';
import {
  CollapsibleMemorySection,
  MemoryRow,
  MemorySection,
  getLearningStyleRows,
  getStruggleProgress,
} from '../../../../components/mentor-memory-sections';
import { TellMentorInput } from '../../../../components/tell-mentor-input';
import { useProfile } from '../../../../lib/profile';
import { useChildDetail } from '../../../../hooks/use-dashboard';
import {
  useChildLearnerProfile,
  useDeleteAllMemory,
  useDeleteMemoryItem,
  useGrantMemoryConsent,
  useTellMentor,
  useToggleMemoryCollection,
  useToggleMemoryInjection,
  useUnsuppressInference,
} from '../../../../hooks/use-learner-profile';
import { assertOk } from '../../../../lib/assert-ok';
import { goBackOrReplace } from '../../../../lib/navigation';
import { useApiClient } from '../../../../lib/api-client';

export default function ChildMentorMemoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const client = useApiClient();
  const { profiles } = useProfile();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const childProfileId = profileId as string | undefined;
  const { data: child } = useChildDetail(childProfileId);
  const { data: profile, isLoading } = useChildLearnerProfile(childProfileId);
  const deleteItem = useDeleteMemoryItem();
  const deleteAll = useDeleteAllMemory();
  const tellMentor = useTellMentor();
  const toggleCollection = useToggleMemoryCollection();
  const toggleInjection = useToggleMemoryInjection();
  const grantConsent = useGrantMemoryConsent();
  const unsuppress = useUnsuppressInference();
  const [draft, setDraft] = useState('');

  const learningStyleRows = useMemo(
    () => getLearningStyleRows(profile?.learningStyle ?? null),
    [profile?.learningStyle]
  );

  const handleDeleteAll = useCallback(() => {
    if (!childProfileId) return;
    Alert.alert(
      'Clear mentor memory?',
      'This removes the saved learner-memory data for this child and turns it off.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAll.mutateAsync({ childProfileId });
            } catch {
              Alert.alert('Could not clear memory', 'Please try again.');
            }
          },
        },
      ]
    );
  }, [childProfileId, deleteAll]);

  const handleTellMentor = useCallback(async () => {
    if (!childProfileId || draft.trim().length === 0) return;
    try {
      await tellMentor.mutateAsync({
        childProfileId,
        text: draft.trim(),
      });
      setDraft('');
    } catch {
      Alert.alert('Could not save that', 'Please try again.');
    }
  }, [childProfileId, draft, tellMentor]);

  const handleToggleCollection = useCallback(
    (value: boolean) => {
      if (!childProfileId) return;
      void (async () => {
        try {
          await toggleCollection.mutateAsync({
            childProfileId,
            memoryCollectionEnabled: value,
          });
        } catch {
          Alert.alert('Could not update memory', 'Please try again.');
        }
      })();
    },
    [childProfileId, toggleCollection]
  );

  const handleToggleInjection = useCallback(
    (value: boolean) => {
      if (!childProfileId) return;
      void (async () => {
        try {
          await toggleInjection.mutateAsync({
            childProfileId,
            memoryInjectionEnabled: value,
          });
        } catch {
          Alert.alert('Could not update memory', 'Please try again.');
        }
      })();
    },
    [childProfileId, toggleInjection]
  );

  const handleExport = useCallback(() => {
    if (!childProfileId) return;
    void (async () => {
      try {
        const res = await client['learner-profile'][':profileId'][
          'export-text'
        ].$get({
          param: { profileId: childProfileId },
        });
        await assertOk(res);
        const data = (await res.json()) as { text: string };
        await Share.share({
          message: data.text,
          title: `${child?.displayName ?? 'Learner'} memory summary`,
        });
      } catch {
        Alert.alert('Could not export memory', 'Please try again.');
      }
    })();
  }, [child?.displayName, childProfileId, client]);

  // BUG-382: Client-side IDOR guard — only allow access to profiles owned by this account
  if (
    childProfileId &&
    profiles.length > 0 &&
    !profiles.some((p) => p.id === childProfileId)
  ) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-5"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-body text-text-secondary text-center mb-4">
          You don&apos;t have access to this profile.
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
          className="bg-primary rounded-button px-6 py-3"
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/home' as const)}
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
            What the mentor knows
          </Text>
          <Text className="text-body-sm text-text-secondary mt-0.5">
            Review, edit, and guide what the mentor remembers.
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {profile?.memoryConsentStatus === 'pending' && childProfileId ? (
          <View className="mt-4">
            <MemoryConsentPrompt
              childName={child?.displayName}
              isPending={grantConsent.isPending}
              onGrant={() =>
                void (async () => {
                  try {
                    await grantConsent.mutateAsync({
                      childProfileId,
                      consent: 'granted',
                    });
                  } catch {
                    Alert.alert('Could not enable memory', 'Please try again.');
                  }
                })()
              }
              onDecline={() =>
                void (async () => {
                  try {
                    await grantConsent.mutateAsync({
                      childProfileId,
                      consent: 'declined',
                    });
                  } catch {
                    Alert.alert(
                      'Could not save preference',
                      'Please try again.'
                    );
                  }
                })()
              }
            />
          </View>
        ) : null}

        <MemorySection title="Controls">
          <View className="bg-surface rounded-card p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pe-4">
                <Text className="text-body text-text-primary">
                  Learn about this child
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  Save new signals from future sessions and direct notes.
                </Text>
              </View>
              <Switch
                value={profile?.memoryCollectionEnabled ?? false}
                onValueChange={handleToggleCollection}
                disabled={isLoading || toggleCollection.isPending}
              />
            </View>
            <View className="flex-row items-center justify-between mt-4">
              <View className="flex-1 pe-4">
                <Text className="text-body text-text-primary">
                  Use what the mentor knows
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  Let future sessions use saved context naturally.
                </Text>
              </View>
              <Switch
                value={profile?.memoryInjectionEnabled ?? false}
                onValueChange={handleToggleInjection}
                disabled={isLoading || toggleInjection.isPending}
              />
            </View>
          </View>
        </MemorySection>

        <MemorySection title="Tell the Mentor">
          <TellMentorInput
            audience="parent"
            childName={child?.displayName}
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
                onRemove={() =>
                  void deleteItem.mutateAsync({
                    childProfileId,
                    category: 'learningStyle',
                    value: row.key,
                    suppress: true,
                  })
                }
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
                onRemove={() =>
                  void deleteItem.mutateAsync({
                    childProfileId,
                    category: 'interests',
                    value: interest,
                    suppress: true,
                  })
                }
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
                onRemove={() =>
                  void deleteItem.mutateAsync({
                    childProfileId,
                    category: 'strengths',
                    value: entry.subject,
                    suppress: true,
                  })
                }
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
                  onRemove={() =>
                    void deleteItem.mutateAsync({
                      childProfileId,
                      category: 'struggles',
                      value: entry.topic,
                      subject: entry.subject ?? undefined,
                      suppress: true,
                    })
                  }
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
                onRemove={() =>
                  void deleteItem.mutateAsync({
                    childProfileId,
                    category: 'communicationNotes',
                    value: note,
                    suppress: true,
                  })
                }
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
                onRemove={() =>
                  void unsuppress.mutateAsync({ childProfileId, value })
                }
              />
            ))}
          </CollapsibleMemorySection>
        ) : null}

        <MemorySection title="Privacy">
          <Pressable
            onPress={handleExport}
            className="bg-surface rounded-card px-4 py-3 mb-2"
            accessibilityRole="button"
            accessibilityLabel="Export mentor memory summary"
          >
            <Text className="text-body font-semibold text-text-primary">
              Export mentor memory summary
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDeleteAll}
            className="bg-surface rounded-card px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel="Clear all mentor memory for this child"
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
