import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { platformAlert } from '../../lib/platform-alert';
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
import { formatRelativeDate } from '../../lib/format-relative-date';
import {
  useDeleteAllMemory,
  useDeleteMemoryItem,
  useGrantMemoryConsent,
  useLearnerProfile,
  useTellMentor,
  useToggleMemoryInjection,
  useUnsuppressInference,
} from '../../hooks/use-learner-profile';
import { MemoryConsentPrompt } from '../../components/memory-consent-prompt';

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
  const grantConsent = useGrantMemoryConsent();
  const [draft, setDraft] = useState('');

  const learningStyleRows = useMemo(
    () => getLearningStyleRows(profile?.learningStyle ?? null),
    [profile?.learningStyle]
  );

  // [F-021] Check if all five data sections are empty — if so, render a
  // single hero empty state instead of five repetitive "Nothing saved yet."
  const allSectionsEmpty = useMemo(
    () =>
      learningStyleRows.length === 0 &&
      (profile?.interests ?? []).length === 0 &&
      (profile?.strengths ?? []).length === 0 &&
      (profile?.struggles ?? []).length === 0 &&
      (profile?.communicationNotes ?? []).length === 0,
    [learningStyleRows, profile]
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
    platformAlert(
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
              platformAlert('Could not clear memory', 'Please try again.');
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
      platformAlert('Could not save that', 'Please try again.');
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
          platformAlert('Could not update memory', 'Please try again.');
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
          <Text
            className="text-body-sm text-text-secondary mt-1"
            testID="memory-status-text"
          >
            {consentStatus === 'granted'
              ? 'Memory collection is enabled.'
              : consentStatus === 'declined'
              ? 'Memory collection is turned off.'
              : // BUG-[NOTION-3468bce9]: role-aware pending copy.
              // Adult/owner accounts (isOwner === true) control their own
              // consent — don't tell them a guardian must act. Child
              // profiles under a family link (isOwner === false) DO need
              // a parent/guardian to enable memory collection.
              activeProfile?.isOwner
              ? "Memory collection hasn't been enabled yet."
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

        {consentStatus === 'pending' && activeProfile?.isOwner && (
          <View className="mt-3">
            <MemoryConsentPrompt
              title="Enable mentor memory"
              description="Let the mentor remember what works for you — your strengths, preferred explanations, and topics you find tricky."
              isPending={grantConsent.isPending}
              onGrant={() =>
                void (async () => {
                  try {
                    await grantConsent.mutateAsync({ consent: 'granted' });
                  } catch {
                    platformAlert(
                      'Could not enable memory',
                      'Please try again.'
                    );
                  }
                })()
              }
              onDecline={() =>
                void (async () => {
                  try {
                    await grantConsent.mutateAsync({ consent: 'declined' });
                  } catch {
                    platformAlert(
                      'Could not update memory',
                      'Please try again.'
                    );
                  }
                })()
              }
            />
          </View>
        )}

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

        {allSectionsEmpty ? (
          <View
            className="items-center py-10 px-4"
            testID="mentor-memory-all-empty"
          >
            <Text className="text-body font-semibold text-text-primary text-center">
              Your mentor is getting to know you
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              As you study, your mentor will learn about your interests,
              strengths, and how you like to learn. Everything will appear here
              over time.
            </Text>
          </View>
        ) : null}

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
                    platformAlert('Could not delete item', 'Please try again.');
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
            profile?.interests.map((interest) => {
              // BKT-C.2 — interests are now InterestEntry { label, context };
              // read .label for display and keying. Context-aware rendering
              // (school vs free-time chips) lands in the mobile context-picker
              // commit.
              const label = interest.label;
              // [BUG-471] Surface timestamp if available
              const ts = profile?.interestTimestamps?.[label];
              const detail = ts
                ? `Noticed ${formatRelativeDate(ts)}`
                : undefined;
              return (
                <MemoryRow
                  key={label}
                  label={label}
                  detail={detail}
                  onRemove={async () => {
                    try {
                      await deleteItem.mutateAsync({
                        category: 'interests',
                        value: label,
                        suppress: true,
                      });
                    } catch {
                      platformAlert(
                        'Could not delete item',
                        'Please try again.'
                      );
                    }
                  }}
                />
              );
            })
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
                    platformAlert('Could not delete item', 'Please try again.');
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
                  detail={
                    entry.lastSeen
                      ? `Last seen ${formatRelativeDate(entry.lastSeen)}`
                      : undefined
                  }
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
                      platformAlert(
                        'Could not delete item',
                        'Please try again.'
                      );
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
                    platformAlert('Could not delete item', 'Please try again.');
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
                    platformAlert(
                      'Could not restore item',
                      'Please try again.'
                    );
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
