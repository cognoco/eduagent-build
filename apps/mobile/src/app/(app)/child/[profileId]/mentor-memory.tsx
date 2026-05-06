import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { platformAlert } from '../../../../lib/platform-alert';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MemoryConsentPrompt } from '../../../../components/memory-consent-prompt';
import {
  CollapsibleMemorySection,
  MemoryRow,
  MemorySection,
} from '../../../../components/mentor-memory-sections';
import { TellMentorInput } from '../../../../components/tell-mentor-input';
import { useProfile } from '../../../../lib/profile';
import {
  useChildDetail,
  useChildMemory,
} from '../../../../hooks/use-dashboard';
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

function confidenceDetail(
  confidence: 'low' | 'medium' | 'high' | undefined,
  t: (key: string) => string
): string | undefined {
  if (!confidence) return undefined;
  return t(`parentView.mentorMemory.confidence.${confidence}`);
}

export default function ChildMentorMemoryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const client = useApiClient();
  const { profiles } = useProfile();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const childProfileId = profileId as string | undefined;
  const { data: child } = useChildDetail(childProfileId);
  const { data: profile, isLoading } = useChildLearnerProfile(childProfileId);
  const { data: memory } = useChildMemory(childProfileId);
  const deleteItem = useDeleteMemoryItem();
  const deleteAll = useDeleteAllMemory();
  const tellMentor = useTellMentor();
  const toggleCollection = useToggleMemoryCollection();
  const toggleInjection = useToggleMemoryInjection();
  const grantConsent = useGrantMemoryConsent();
  const unsuppress = useUnsuppressInference();
  const [draft, setDraft] = useState('');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  // [BUG-533] Toast state for save confirmation — same pattern as session screen.
  const [confirmationToast, setConfirmationToast] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!confirmationToast) return undefined;
    const timer = setTimeout(() => setConfirmationToast(null), 5000);
    return () => clearTimeout(timer);
  }, [confirmationToast]);

  // S-2: Wrap mutateAsync calls so delete/unsuppress failures show user feedback.
  // Previously all 6 onRemove handlers used `void mutateAsync(...)` with no catch.
  const safeDelete = useCallback(
    async (args: Parameters<typeof deleteItem.mutateAsync>[0]) => {
      try {
        await deleteItem.mutateAsync(args);
      } catch {
        platformAlert(
          t('parentView.mentorMemory.couldNotDeleteItem'),
          t('parentView.mentorMemory.pleaseTryAgain')
        );
      }
    },
    [deleteItem, t]
  );

  const safeUnsuppress = useCallback(
    async (args: Parameters<typeof unsuppress.mutateAsync>[0]) => {
      try {
        await unsuppress.mutateAsync(args);
      } catch {
        platformAlert(
          t('parentView.mentorMemory.couldNotRestoreItem'),
          t('parentView.mentorMemory.pleaseTryAgain')
        );
      }
    },
    [unsuppress, t]
  );

  const handleDeleteAll = useCallback(() => {
    if (!childProfileId) return;
    platformAlert(
      t('parentView.mentorMemory.clearMemoryTitle'),
      t('parentView.mentorMemory.clearMemoryBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('parentView.mentorMemory.clear'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAll.mutateAsync({ childProfileId });
            } catch {
              platformAlert(
                t('parentView.mentorMemory.couldNotClearMemory'),
                t('parentView.mentorMemory.pleaseTryAgain')
              );
            }
          },
        },
      ]
    );
  }, [childProfileId, deleteAll, t]);

  const handleTellMentor = useCallback(async () => {
    if (!childProfileId || draft.trim().length === 0) return;
    try {
      // [BUG-533] Consume the mutation result — the server returns a
      // human-readable message summarising what it extracted from the note.
      const result = await tellMentor.mutateAsync({
        childProfileId,
        text: draft.trim(),
      });
      setDraft('');
      setConfirmationToast(
        result.message || t('parentView.mentorMemory.savedMentorWillRemember')
      );
    } catch {
      platformAlert(
        t('parentView.mentorMemory.couldNotSaveThat'),
        t('parentView.mentorMemory.pleaseTryAgain')
      );
    }
  }, [childProfileId, draft, tellMentor, t]);

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
          platformAlert(
            t('parentView.mentorMemory.couldNotUpdateMemory'),
            t('parentView.mentorMemory.pleaseTryAgain')
          );
        }
      })();
    },
    [childProfileId, toggleCollection, t]
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
          platformAlert(
            t('parentView.mentorMemory.couldNotUpdateMemory'),
            t('parentView.mentorMemory.pleaseTryAgain')
          );
        }
      })();
    },
    [childProfileId, toggleInjection, t]
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
        if (Platform.OS === 'web') {
          // Use globalThis casts to avoid DOM-lib requirement in RN tsconfig.
          type WebDoc = {
            createElement(tag: string): {
              href: string;
              download: string;
              click(): void;
            };
          };
          const doc = (globalThis as { document?: WebDoc }).document;
          if (!doc) return;
          // RN globals.d.ts requires both `type` and `lastModified` in BlobOptions.
          const blob = new Blob([data.text], {
            type: 'text/plain',
            lastModified: Date.now(),
          });
          const url = URL.createObjectURL(blob);
          const a = doc.createElement('a');
          a.href = url;
          a.download = `${
            child?.displayName ?? t('parentView.mentorMemory.learner')
          }-memory-summary.txt`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          const result = await Share.share({
            message: data.text,
            title: t('parentView.mentorMemory.memorySummaryTitle', {
              name: child?.displayName ?? t('parentView.mentorMemory.learner'),
            }),
          });
          // [UX-DE-L5] iOS returns dismissedAction when the user cancels the
          // share sheet — treat it as a no-op, not a success or error.
          if (result.action === Share.dismissedAction) {
            return;
          }
        }
      } catch {
        platformAlert(
          t('parentView.mentorMemory.couldNotExportMemory'),
          t('parentView.mentorMemory.pleaseTryAgain')
        );
      }
    })();
  }, [child?.displayName, childProfileId, client, t]);

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
          {t('parentView.index.noAccessToProfile')}
        </Text>
        <Pressable
          onPress={() => goBackOrReplace(router, '/(app)/more' as const)}
          className="bg-primary rounded-button px-6 py-3"
          accessibilityRole="button"
        >
          <Text className="text-text-inverse text-body font-semibold">
            {t('common.back')}
          </Text>
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
          accessibilityLabel={t('common.goBack')}
        >
          <Text className="text-primary text-body font-semibold">
            {'\u2190'}
          </Text>
        </Pressable>
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">
            {t('parentView.mentorMemory.title')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-0.5">
            {t('parentView.mentorMemory.subtitle')}
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
                    await grantConsent.mutateAsync({
                      childProfileId,
                      consent: 'declined',
                    });
                  } catch {
                    platformAlert(
                      'Could not save preference',
                      'Please try again.'
                    );
                  }
                })()
              }
            />
          </View>
        ) : null}

        <MemorySection title={t('parentView.mentorMemory.controls')}>
          <View className="bg-surface rounded-card p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pe-4">
                <Text className="text-body text-text-primary">
                  {t('parentView.mentorMemory.learnAboutChild')}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  {t('parentView.mentorMemory.learnAboutChildDescription')}
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
                  {t('parentView.mentorMemory.useWhatMentorKnows')}
                </Text>
                <Text className="text-body-sm text-text-secondary mt-1">
                  {t('parentView.mentorMemory.useWhatMentorKnowsDescription')}
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

        <MemorySection title={t('parentView.mentorMemory.tellTheMentor')}>
          <TellMentorInput
            audience="parent"
            childName={child?.displayName}
            value={draft}
            isPending={tellMentor.isPending}
            onChangeText={setDraft}
            onSubmit={() => void handleTellMentor()}
          />
        </MemorySection>

        {/* Curated categories from memory endpoint */}
        {memory?.categories.map((cat) => (
          <MemorySection key={cat.label} title={cat.label}>
            {cat.items.map((item) => (
              <MemoryRow
                key={`${item.category}-${item.value}`}
                label={item.statement}
                detail={confidenceDetail(item.confidence, t)}
                onRemove={() =>
                  void safeDelete({
                    childProfileId,
                    category: item.category,
                    value: item.value,
                    suppress: true,
                  })
                }
              />
            ))}
          </MemorySection>
        ))}

        {/* Empty state when no categories */}
        {memory && memory.categories.length === 0 && (
          <View className="bg-surface rounded-card p-6 mt-4">
            <Text className="text-text-secondary text-center text-base">
              {t('parentView.mentorMemory.noObservationsYet', {
                name: child?.displayName ?? t('parentView.index.yourChild'),
              })}
            </Text>
          </View>
        )}

        {(profile?.suppressedInferences ?? []).length > 0 ? (
          <CollapsibleMemorySection
            title={t('parentView.mentorMemory.hiddenItems')}
            defaultExpanded={false}
          >
            {profile?.suppressedInferences.map((value) => (
              <MemoryRow
                key={value}
                label={value}
                actionLabel={t('parentView.mentorMemory.bringBack')}
                onRemove={() => void safeUnsuppress({ childProfileId, value })}
              />
            ))}
          </CollapsibleMemorySection>
        ) : null}

        <MemorySection title={t('parentView.mentorMemory.privacy')}>
          <Pressable
            onPress={handleExport}
            className="bg-surface rounded-card px-4 py-3 mb-2"
            accessibilityRole="button"
            accessibilityLabel={t(
              'parentView.mentorMemory.exportMemorySummary'
            )}
          >
            <Text className="text-body font-semibold text-text-primary">
              {t('parentView.mentorMemory.exportMemorySummary')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDeleteAll}
            className="bg-surface rounded-card px-4 py-3"
            accessibilityRole="button"
            accessibilityLabel={t('parentView.mentorMemory.clearAllMemory')}
          >
            <Text className="text-body font-semibold text-danger">
              {t('parentView.mentorMemory.clearAllMemory')}
            </Text>
          </Pressable>
        </MemorySection>

        {/* Something else is wrong — escape hatch (cross-platform) */}
        {!correctionOpen ? (
          <Pressable
            testID="something-wrong-button"
            onPress={() => setCorrectionOpen(true)}
            className="bg-surface rounded-card px-4 py-3 mt-4"
          >
            <Text className="text-text-secondary text-center text-sm">
              {t('parentView.mentorMemory.somethingElseIsWrong')}
            </Text>
          </Pressable>
        ) : (
          <View className="bg-surface rounded-card p-4 mt-4">
            <Text className="text-body font-medium text-text-primary mb-2">
              {t('parentView.mentorMemory.whatSeemsWrong')}
            </Text>
            <Text className="text-body-sm text-text-secondary mb-3">
              {t('parentView.mentorMemory.whatSeemsWrongDescription')}
            </Text>
            <TextInput
              testID="correction-input"
              value={correctionText}
              onChangeText={setCorrectionText}
              multiline
              numberOfLines={3}
              placeholder={t('parentView.mentorMemory.correctionPlaceholder')}
              className="border-border mb-3 rounded-lg border p-3 text-text-primary"
            />
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => {
                  setCorrectionOpen(false);
                  setCorrectionText('');
                }}
                className="flex-1 rounded-lg border border-border p-3"
              >
                <Text className="text-text-secondary text-center text-sm">
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                testID="correction-submit"
                disabled={!correctionText.trim() || tellMentor.isPending}
                onPress={() =>
                  void (async () => {
                    const text = correctionText.trim();
                    if (!text || !childProfileId) return;
                    try {
                      // [BUG-533] Consume result and show confirmation.
                      const result = await tellMentor.mutateAsync({
                        childProfileId,
                        text: `[parent_correction] ${text}`,
                      });
                      setCorrectionOpen(false);
                      setCorrectionText('');
                      setConfirmationToast(
                        result.message ||
                          t('parentView.mentorMemory.correctionNoted')
                      );
                    } catch {
                      platformAlert(
                        t('parentView.mentorMemory.couldNotSaveCorrection'),
                        t('parentView.mentorMemory.pleaseTryAgain')
                      );
                    }
                  })()
                }
                className="flex-1 rounded-lg bg-primary p-3 disabled:opacity-50"
              >
                <Text className="text-text-inverse text-center text-sm font-medium">
                  {t('parentView.mentorMemory.submit')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* [BUG-533] Confirmation toast after Tell the Mentor / correction save */}
      {confirmationToast ? (
        <View
          className="absolute bottom-0 left-4 right-4 z-50 items-center"
          style={{
            pointerEvents: 'none',
            bottom: Math.max(insets.bottom, 16) + 16,
          }}
          testID="mentor-memory-confirmation-toast"
        >
          <View className="rounded-full bg-text-primary px-4 py-3">
            <Text className="text-body-sm font-semibold text-text-inverse text-center">
              {confirmationToast}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
