import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { platformAlert } from '../../lib/platform-alert';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { InterestContext } from '@eduagent/schemas';
import { useProfile } from '../../lib/profile';
import { computeAgeBracket } from '@eduagent/schemas';
import { formatApiError } from '../../lib/format-api-error';
import { Sentry } from '../../lib/sentry';
import {
  CollapsibleMemorySection,
  InterestContextRow,
  MemoryRow,
  MemorySection,
  getLearningStyleRows,
  getFocusAreaProgress,
} from '../../components/mentor-memory-sections';
import { TellMentorInput } from '../../components/tell-mentor-input';
import { goBackOrReplace } from '../../lib/navigation';
import { ErrorFallback } from '../../components/common';
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
import { useNavigationContract } from '../../hooks/use-navigation-contract';
import { useEntryGate } from '../../hooks/use-entry-gate';
import { useUpdateInterestsContext } from '../../hooks/use-onboarding-dimensions';

export default function MentorMemoryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{
    returnTo?: string | string[];
  }>();
  const { activeProfile } = useProfile();
  const { data: profile, isLoading, isError, refetch } = useLearnerProfile();
  const deleteItem = useDeleteMemoryItem();
  const deleteAll = useDeleteAllMemory();
  const tellMentor = useTellMentor();
  const toggleInjection = useToggleMemoryInjection();
  const unsuppress = useUnsuppressInference();
  const grantConsent = useGrantMemoryConsent();
  const updateInterestsContext = useUpdateInterestsContext();
  const navigationContract = useNavigationContract();
  // Self-view mentor-memory uses sessionIsOwner (owner && !proxy). A solo
  // owner in study shape needs the consent-prompt + owner copy on their own
  // screen, which sessionIsOwner expresses. The child-consent editor at
  // child/[profileId]/mentor-memory.tsx is a separate screen that derives
  // its access from the route's profileId, not from a contract gate.
  const isOwnerSelf = navigationContract.gates.sessionIsOwner;
  const [draft, setDraft] = useState('');

  // [H12] Timeout escape for loading spinner
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const learningStyleRows = useMemo(
    () => getLearningStyleRows(profile?.learningStyle ?? null, t),
    [profile?.learningStyle, t],
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
    [learningStyleRows, profile],
  );

  const accommodationMode = profile?.accommodationMode ?? 'none';

  const accommodationBadgeText = useMemo(() => {
    if (accommodationMode === 'none') return null;
    const ageBracket =
      activeProfile?.birthYear != null
        ? computeAgeBracket(activeProfile.birthYear)
        : 'adolescent';
    const modeLabels: Record<
      string,
      { young: string; mid: string; older: string }
    > = {
      'short-burst': {
        young: t('session.mentorMemory.accommodation.shortBurst.young'),
        mid: t('session.mentorMemory.accommodation.shortBurst.mid'),
        older: t('session.mentorMemory.accommodation.shortBurst.older'),
      },
      'audio-first': {
        young: t('session.mentorMemory.accommodation.audioFirst.young'),
        mid: t('session.mentorMemory.accommodation.audioFirst.mid'),
        older: t('session.mentorMemory.accommodation.audioFirst.older'),
      },
      predictable: {
        young: t('session.mentorMemory.accommodation.predictable.young'),
        mid: t('session.mentorMemory.accommodation.predictable.mid'),
        older: t('session.mentorMemory.accommodation.predictable.older'),
      },
    };
    const labels = modeLabels[accommodationMode];
    if (!labels) return null;
    // [BUG-577] AgeBracket 'child' was removed (strictly-11+ product constraint);
    // 'adolescent' now covers ages 11-17, 'adult' covers 18+.
    if (ageBracket === 'adolescent') return labels.mid;
    return labels.older;
  }, [accommodationMode, activeProfile?.birthYear, t]);

  const handleDeleteAll = useCallback(() => {
    platformAlert(
      t('session.mentorMemory.clearDialog.title'),
      t('session.mentorMemory.clearDialog.message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('session.mentorMemory.clearDialog.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAll.mutateAsync({});
            } catch (err) {
              platformAlert(
                t('session.mentorMemory.errors.clearFailed'),
                formatApiError(err),
              );
              Sentry.captureException(err, {
                tags: { surface: 'mentor-memory', action: 'delete_all' },
              });
            }
          },
        },
      ],
    );
  }, [deleteAll, t]);

  const handleTellMentor = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      await tellMentor.mutateAsync({ text });
      setDraft('');
    } catch (err) {
      platformAlert(
        t('session.mentorMemory.errors.saveFailed'),
        formatApiError(err),
      );
      Sentry.captureException(err, {
        tags: { surface: 'mentor-memory', action: 'tell_mentor' },
      });
    }
  }, [draft, tellMentor, t]);

  const handleToggleInjection = useCallback(
    (value: boolean) => {
      void (async () => {
        try {
          await toggleInjection.mutateAsync({
            memoryInjectionEnabled: value,
          });
        } catch (err) {
          platformAlert(
            t('session.mentorMemory.errors.updateFailed'),
            formatApiError(err),
          );
          Sentry.captureException(err, {
            tags: { surface: 'mentor-memory', action: 'toggle_injection' },
          });
        }
      })();
    },
    [toggleInjection, t],
  );

  const handleInterestContextChange = useCallback(
    async (label: string, context: InterestContext) => {
      if (navigationContract.isParentProxy) return;
      const interests = profile?.interests ?? [];
      try {
        await updateInterestsContext.mutateAsync({
          interests: interests.map((interest) =>
            interest.label === label ? { ...interest, context } : interest,
          ),
        });
      } catch (err) {
        platformAlert(
          t('session.mentorMemory.errors.updateFailed'),
          formatApiError(err),
        );
        Sentry.captureException(err, {
          tags: { surface: 'mentor-memory', action: 'update_interest_context' },
        });
        throw err;
      }
    },
    [
      navigationContract.isParentProxy,
      profile?.interests,
      t,
      updateInterestsContext,
    ],
  );

  const consentStatus = profile?.memoryConsentStatus ?? 'pending';
  const memoryEnabled = consentStatus === 'granted';
  const resolvedReturnTo = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const handleBack = useCallback(() => {
    if (resolvedReturnTo === 'more') {
      router.replace('/(app)/more');
      return;
    }

    goBackOrReplace(router, '/(app)/more' as const);
  }, [resolvedReturnTo, router]);

  const blocked = useEntryGate('mentor-memory');

  if (blocked) {
    return <Redirect href="/(app)/home" />;
  }

  if (isLoading) {
    if (loadTimedOut) {
      return (
        <View
          className="flex-1 bg-background"
          style={{ paddingTop: insets.top }}
        >
          <ErrorFallback
            variant="centered"
            title={t('session.mentorMemory.loadTimeout.title')}
            message={t('session.mentorMemory.loadTimeout.message')}
            primaryAction={{
              label: t('common.retry'),
              onPress: () => void refetch(),
              testID: 'mentor-memory-load-timeout-retry',
            }}
            secondaryAction={{
              label: t('common.goBack'),
              onPress: handleBack,
              testID: 'mentor-memory-load-timeout-back',
            }}
            testID="mentor-memory-load-timeout"
          />
        </View>
      );
    }
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (isError && !profile) {
    return (
      <View
        testID="mentor-memory-error"
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-body text-text-primary text-center px-6">
          {t('session.mentorMemory.loadError')}
        </Text>
        <Pressable
          testID="mentor-memory-retry"
          onPress={() => void refetch()}
          className="mt-4 px-6 py-3 bg-primary rounded-card"
          accessibilityRole="button"
        >
          <Text className="text-body font-semibold text-white">
            {t('common.retry')}
          </Text>
        </Pressable>
        <Pressable
          testID="mentor-memory-go-back"
          onPress={handleBack}
          className="mt-3 px-6 py-3"
          accessibilityRole="button"
        >
          <Text className="text-body text-primary">{t('common.goBack')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-4 pb-2 flex-row items-center">
        <Pressable
          onPress={handleBack}
          className="me-3 py-2 pe-2"
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {t('session.mentorMemory.title')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-0.5">
            {t('session.mentorMemory.subtitle')}
          </Text>
        </View>
      </View>

      {/*
        [BUG-NOTION-256] Virtualization decision: this screen has six
        sequential .map() calls (learning style, interests, strengths,
        struggles, communication notes, suppressed inferences) interleaved
        with non-list content (consent prompt, accommodation badge,
        TellMentorInput, privacy actions). Each individual section is
        bounded small in production usage — interests/strengths are gated
        to ~8 entries each by the inference pipeline and the others are
        capped lower — so total per-section item counts stay under ~10.

        Nesting FlatList inside a ScrollView (or stacking six FlatLists)
        defeats virtualization (infinite height inside ScrollView) and
        breaks scrolling. Section-level virtualization via a single
        outer SectionList would force a non-trivial rewrite of the
        heterogeneous header/footer content; the cost outweighs the
        marginal perf win at the current bounded item counts.

        If interests/strengths begin to grow unbounded in production,
        revisit by lifting the whole screen into a SectionList with the
        consent/accommodation content as ListHeaderComponent and the
        privacy actions as ListFooterComponent.
      */}
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {navigationContract.isParentProxy ? (
          <View
            className="bg-primary-soft rounded-card px-4 py-3 mt-4"
            testID="proxy-read-only-hint"
          >
            <Text className="text-body-sm text-text-secondary">
              {t('proxy.readOnly.hint')}
            </Text>
          </View>
        ) : null}
        <View className="bg-surface rounded-card p-4 mt-4">
          <Text className="text-body font-semibold text-text-primary">
            {t('session.mentorMemory.status.heading')}
          </Text>
          <Text
            className="text-body-sm text-text-secondary mt-1"
            testID="memory-status-text"
          >
            {consentStatus === 'granted'
              ? t('session.mentorMemory.status.enabled')
              : consentStatus === 'declined'
                ? t('session.mentorMemory.status.disabled')
                : // BUG-[NOTION-3468bce9]: role-aware pending copy.
                  // Adult/owner accounts (isOwner === true) control their own
                  // consent — don't tell them a guardian must act. Child
                  // profiles under a family link (isOwner === false) DO need
                  // a parent/guardian to enable memory collection.
                  isOwnerSelf
                  ? t('session.mentorMemory.status.pendingOwner')
                  : t('session.mentorMemory.status.pendingChild')}
          </Text>
          <View className="flex-row items-center justify-between mt-4">
            <View className="flex-1 pr-3">
              <Text className="text-body text-text-primary">
                {t('session.mentorMemory.status.useMemoryLabel')}
              </Text>
              {!memoryEnabled ? (
                <Text className="text-caption text-text-secondary mt-1">
                  {t('session.mentorMemory.status.useMemoryDisabledHint')}
                </Text>
              ) : null}
            </View>
            <Switch
              value={
                memoryEnabled && (profile?.memoryInjectionEnabled ?? false)
              }
              onValueChange={handleToggleInjection}
              disabled={
                navigationContract.isParentProxy ||
                !memoryEnabled ||
                isLoading ||
                toggleInjection.isPending
              }
              accessibilityLabel={t(
                'session.mentorMemory.status.useMemoryLabel',
              )}
            />
          </View>
        </View>

        <View className="bg-primary-soft rounded-card px-4 py-3 mt-3">
          <Text className="text-body-sm font-semibold text-text-primary">
            {t('session.mentorMemory.examples.title')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('session.mentorMemory.examples.body')}
          </Text>
        </View>

        {consentStatus === 'pending' && isOwnerSelf && (
          <View className="mt-3">
            <MemoryConsentPrompt
              title={t('session.mentorMemory.consent.title')}
              description={t('session.mentorMemory.consent.description')}
              isPending={grantConsent.isPending}
              onGrant={() =>
                void (async () => {
                  try {
                    await grantConsent.mutateAsync({ consent: 'granted' });
                  } catch (err) {
                    platformAlert(
                      t('session.mentorMemory.errors.enableFailed'),
                      formatApiError(err),
                    );
                    Sentry.captureException(err, {
                      tags: {
                        surface: 'mentor-memory',
                        action: 'grant_consent',
                      },
                    });
                  }
                })()
              }
              onDecline={() =>
                void (async () => {
                  try {
                    await grantConsent.mutateAsync({ consent: 'declined' });
                  } catch (err) {
                    platformAlert(
                      t('session.mentorMemory.errors.updateFailed'),
                      formatApiError(err),
                    );
                    Sentry.captureException(err, {
                      tags: {
                        surface: 'mentor-memory',
                        action: 'decline_consent',
                      },
                    });
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
            {/* Role-aware attribution: owner profiles set their own
                accommodation in /more, so they have no "parent" to
                attribute it to. The phrase only fits non-owner profiles
                (child user, or parent in proxy mode). */}
            {!isOwnerSelf ? (
              <Text
                testID="accommodation-set-by-parent"
                className="text-caption text-text-secondary mt-1"
              >
                {t('session.mentorMemory.accommodation.setByParent')}
              </Text>
            ) : null}
          </View>
        ) : null}

        <MemorySection title={t('session.mentorMemory.sections.tellMentor')}>
          <TellMentorInput
            birthYear={activeProfile?.birthYear}
            value={draft}
            isPending={navigationContract.isParentProxy || tellMentor.isPending}
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
              {t('session.mentorMemory.empty.title')}
            </Text>
            <Text className="text-body-sm text-text-secondary text-center mt-2">
              {t('session.mentorMemory.empty.message')}
            </Text>
          </View>
        ) : null}

        <MemorySection title={t('session.mentorMemory.sections.learningStyle')}>
          {learningStyleRows.length > 0 ? (
            learningStyleRows.map((row) => (
              <MemoryRow
                key={row.key}
                label={row.label}
                source={row.source}
                onRemove={
                  navigationContract.isParentProxy
                    ? undefined
                    : async () => {
                        try {
                          await deleteItem.mutateAsync({
                            category: 'learningStyle',
                            value: row.key,
                            suppress: true,
                          });
                        } catch (err) {
                          platformAlert(
                            t('session.mentorMemory.errors.deleteFailed'),
                            formatApiError(err),
                          );
                          Sentry.captureException(err, {
                            tags: {
                              surface: 'mentor-memory',
                              action: 'delete_learning_style',
                            },
                          });
                        }
                      }
                }
              />
            ))
          ) : (
            <MemoryRow label={t('session.mentorMemory.nothingSaved')} />
          )}
        </MemorySection>

        {(profile?.interests ?? []).length > 0 ? (
          <MemorySection
            title={t('session.mentorMemory.sections.interests')}
            description={t(
              'session.mentorMemory.sections.interestsContextHint',
            )}
            testID="mentor-memory-interests-section"
          >
            {(profile?.interests ?? []).map((interest) => {
              const label = interest.label;
              const ts = profile?.interestTimestamps?.[label];
              const detail = ts
                ? t('session.mentorMemory.noticed', {
                    date: formatRelativeDate(ts),
                  })
                : undefined;
              return (
                <InterestContextRow
                  key={label}
                  interest={interest}
                  detail={detail}
                  disabled={
                    updateInterestsContext.isPending ||
                    navigationContract.isParentProxy
                  }
                  onContextChange={handleInterestContextChange}
                  onRemove={
                    navigationContract.isParentProxy
                      ? undefined
                      : async () => {
                          try {
                            await deleteItem.mutateAsync({
                              category: 'interests',
                              value: label,
                              suppress: true,
                            });
                          } catch (err) {
                            platformAlert(
                              t('session.mentorMemory.errors.deleteFailed'),
                              formatApiError(err),
                            );
                            Sentry.captureException(err, {
                              tags: {
                                surface: 'mentor-memory',
                                action: 'delete_interest',
                              },
                            });
                          }
                        }
                  }
                />
              );
            })}
          </MemorySection>
        ) : null}

        <MemorySection title={t('session.mentorMemory.sections.strengths')}>
          {(profile?.strengths ?? []).length > 0 ? (
            profile?.strengths.map((entry) => (
              <MemoryRow
                key={entry.subject}
                label={`${entry.subject}: ${entry.topics.join(', ')}`}
                source={entry.source}
                onRemove={
                  navigationContract.isParentProxy
                    ? undefined
                    : async () => {
                        try {
                          await deleteItem.mutateAsync({
                            category: 'strengths',
                            value: entry.subject,
                            suppress: true,
                          });
                        } catch (err) {
                          platformAlert(
                            t('session.mentorMemory.errors.deleteFailed'),
                            formatApiError(err),
                          );
                          Sentry.captureException(err, {
                            tags: {
                              surface: 'mentor-memory',
                              action: 'delete_strength',
                            },
                          });
                        }
                      }
                }
              />
            ))
          ) : (
            <MemoryRow label={t('session.mentorMemory.nothingSaved')} />
          )}
        </MemorySection>

        <CollapsibleMemorySection
          title={t('session.mentorMemory.sections.struggles')}
          defaultExpanded={false}
        >
          {(profile?.struggles ?? []).length > 0 ? (
            profile?.struggles.map((entry) => {
              const progress = getFocusAreaProgress(entry, t);
              return (
                <MemoryRow
                  key={`${entry.subject ?? 'freeform'}:${entry.topic}`}
                  label={`${entry.subject ? `${entry.subject}: ` : ''}${
                    entry.topic
                  }`}
                  detail={
                    entry.lastSeen
                      ? t('session.mentorMemory.lastSeen', {
                          date: formatRelativeDate(entry.lastSeen),
                        })
                      : undefined
                  }
                  source={entry.source}
                  progressLabel={progress.progressLabel}
                  progressValue={progress.progressValue}
                  onRemove={
                    navigationContract.isParentProxy
                      ? undefined
                      : async () => {
                          try {
                            await deleteItem.mutateAsync({
                              category: 'struggles',
                              value: entry.topic,
                              subject: entry.subject ?? undefined,
                              suppress: true,
                            });
                          } catch (err) {
                            platformAlert(
                              t('session.mentorMemory.errors.deleteFailed'),
                              formatApiError(err),
                            );
                            Sentry.captureException(err, {
                              tags: {
                                surface: 'mentor-memory',
                                action: 'delete_struggle',
                              },
                            });
                          }
                        }
                  }
                />
              );
            })
          ) : (
            <MemoryRow label={t('session.mentorMemory.nothingSaved')} />
          )}
        </CollapsibleMemorySection>

        <MemorySection
          title={t('session.mentorMemory.sections.communicationNotes')}
        >
          {(profile?.communicationNotes ?? []).length > 0 ? (
            profile?.communicationNotes.map((note) => (
              <MemoryRow
                key={note}
                label={note}
                onRemove={
                  navigationContract.isParentProxy
                    ? undefined
                    : async () => {
                        try {
                          await deleteItem.mutateAsync({
                            category: 'communicationNotes',
                            value: note,
                            suppress: true,
                          });
                        } catch (err) {
                          platformAlert(
                            t('session.mentorMemory.errors.deleteFailed'),
                            formatApiError(err),
                          );
                          Sentry.captureException(err, {
                            tags: {
                              surface: 'mentor-memory',
                              action: 'delete_communication_note',
                            },
                          });
                        }
                      }
                }
              />
            ))
          ) : (
            <MemoryRow label={t('session.mentorMemory.nothingSaved')} />
          )}
        </MemorySection>

        {(profile?.suppressedInferences ?? []).length > 0 ? (
          <CollapsibleMemorySection
            title={t('session.mentorMemory.sections.hiddenItems')}
            defaultExpanded={false}
          >
            {profile?.suppressedInferences.map((value) => (
              <MemoryRow
                key={value}
                label={value}
                actionLabel={t('session.mentorMemory.bringBack')}
                onRemove={
                  navigationContract.isParentProxy
                    ? undefined
                    : async () => {
                        try {
                          await unsuppress.mutateAsync({ value });
                        } catch (err) {
                          platformAlert(
                            t('session.mentorMemory.errors.restoreFailed'),
                            formatApiError(err),
                          );
                          Sentry.captureException(err, {
                            tags: {
                              surface: 'mentor-memory',
                              action: 'unsuppress_inference',
                            },
                          });
                        }
                      }
                }
              />
            ))}
          </CollapsibleMemorySection>
        ) : null}

        <MemorySection title={t('session.mentorMemory.sections.privacy')}>
          <Pressable
            onPress={handleDeleteAll}
            disabled={navigationContract.isParentProxy}
            className="bg-surface rounded-card px-4 py-3 disabled:opacity-50"
            accessibilityRole="button"
            accessibilityLabel={t(
              'session.mentorMemory.clearAll.accessibilityLabel',
              {
                name:
                  activeProfile?.displayName ??
                  t('session.mentorMemory.clearAll.defaultName'),
              },
            )}
          >
            <Text className="text-body font-semibold text-danger">
              {t('session.mentorMemory.clearAll.label')}
            </Text>
          </Pressable>
        </MemorySection>
      </ScrollView>
    </View>
  );
}
