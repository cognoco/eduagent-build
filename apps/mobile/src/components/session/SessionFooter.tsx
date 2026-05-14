import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { QuestionCounter, LibraryPrompt } from '../session';
import { NoteInput } from '../library/NoteInput';
import type { useFiling } from '../../hooks/use-filing';
import type { useCreateNote } from '../../hooks/use-notes';
import { formatApiError } from '../../lib/format-api-error';
import { platformAlert } from '../../lib/platform-alert';
import type { Href, Router } from 'expo-router';
import type { useThemeColors } from '../../lib/theme';

export interface SessionFooterProps {
  showFilingPrompt: boolean;
  filingDismissed: boolean;
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  effectiveMode: string;
  filingTopicHint?: string;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: (
    filedSubjectId?: string,
    filedBookId?: string,
  ) => void;
  router: Router;
  homeHref?: Href;
  sessionExpired: boolean;
  notePromptOffered: boolean;
  showNoteInput: boolean;
  setShowNoteInput: React.Dispatch<React.SetStateAction<boolean>>;
  sessionNoteSavedRef: React.MutableRefObject<boolean>;
  topicId: string | undefined;
  sessionId: string | undefined;
  createNote: ReturnType<typeof useCreateNote>;
  colors: ReturnType<typeof useThemeColors>;
  userMessageCount: number;
  showQuestionCount: boolean;
  showBookLink: boolean;
}

export function SessionFooter({
  showFilingPrompt,
  filingDismissed,
  filing,
  activeSessionId,
  effectiveMode,
  filingTopicHint,
  setShowFilingPrompt,
  setFilingDismissed,
  navigateToSessionSummary,
  router,
  homeHref = '/(app)/home' as Href,
  sessionExpired,
  notePromptOffered,
  showNoteInput,
  setShowNoteInput,
  sessionNoteSavedRef,
  topicId,
  sessionId,
  createNote,
  colors,
  userMessageCount,
  showQuestionCount,
  showBookLink,
}: SessionFooterProps) {
  const { t } = useTranslation();
  return (
    <>
      {showFilingPrompt && !filingDismissed ? (
        <StandardFilingPrompt
          filing={filing}
          activeSessionId={activeSessionId}
          effectiveMode={effectiveMode}
          filingTopicHint={filingTopicHint}
          setShowFilingPrompt={setShowFilingPrompt}
          setFilingDismissed={setFilingDismissed}
          navigateToSessionSummary={navigateToSessionSummary}
        />
      ) : null}
      {sessionExpired ? (
        <View className="bg-surface rounded-card p-4 mt-2 mb-4">
          <Text className="text-body font-semibold text-text-primary mb-2">
            {t('session.expired.title')}
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            {t('session.expired.message')}
          </Text>
          <Pressable
            onPress={() => router.replace(homeHref as Href)}
            className="bg-primary rounded-button py-3 items-center"
            testID="session-expired-go-home"
            accessibilityRole="button"
            accessibilityLabel={t('common.goHome')}
          >
            <Text className="text-text-inverse text-body font-semibold">
              {t('common.goHome')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {notePromptOffered && !showNoteInput && !sessionNoteSavedRef.current ? (
        <Pressable
          className="bg-primary/10 rounded-lg px-4 py-3 mx-4 mb-2 flex-row items-center"
          onPress={() => setShowNoteInput(true)}
          testID="session-note-prompt"
          accessibilityRole="button"
          accessibilityLabel={t('session.notePrompt.writeNote')}
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={colors.primary}
          />
          <Text className="text-body text-primary font-semibold ml-2">
            {t('session.notePrompt.writeNote')}
          </Text>
        </Pressable>
      ) : null}
      {showNoteInput ? (
        <View className="px-4 mb-2">
          <NoteInput
            placeholder={t('session.notePrompt.summaryPlaceholder', {
              defaultValue: 'Summarize this in your own words...',
            })}
            onSave={(content) => {
              if (!topicId) {
                platformAlert(
                  t('session.notePrompt.cannotSaveTitle'),
                  t('session.notePrompt.cannotSaveMessage'),
                );
                return;
              }
              createNote.mutate(
                {
                  topicId,
                  content,
                  sessionId,
                },
                {
                  onSuccess: () => {
                    sessionNoteSavedRef.current = true;
                    setShowNoteInput(false);
                  },
                  onError: (error) => {
                    platformAlert(
                      t('session.notePrompt.saveFailedTitle'),
                      formatApiError(error),
                    );
                  },
                },
              );
            }}
            onCancel={() => setShowNoteInput(false)}
            saving={createNote.isPending}
          />
        </View>
      ) : null}
      {showQuestionCount ? <QuestionCounter count={userMessageCount} /> : null}
      {showBookLink ? <LibraryPrompt /> : null}
    </>
  );
}

function StandardFilingPrompt({
  filing,
  activeSessionId,
  effectiveMode,
  filingTopicHint,
  setShowFilingPrompt,
  setFilingDismissed,
  navigateToSessionSummary,
}: {
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  effectiveMode: string;
  filingTopicHint?: string;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: (
    filedSubjectId?: string,
    filedBookId?: string,
  ) => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
      testID="filing-prompt"
    >
      <Text className="text-lg font-semibold text-text-primary mb-2">
        {t('session.filingPrompt.title')}
      </Text>
      <Text className="text-body-sm text-text-secondary mb-4">
        {filingTopicHint
          ? t('session.filingPrompt.descriptionWithTopic', {
              topic: filingTopicHint,
            })
          : t('session.filingPrompt.description')}
      </Text>
      <View className="flex-row gap-3">
        <Pressable
          onPress={async () => {
            try {
              const result = await filing.mutateAsync({
                sessionId: activeSessionId ?? undefined,
                sessionMode: effectiveMode as 'freeform' | 'homework',
              });
              setShowFilingPrompt(false);
              navigateToSessionSummary(result.shelfId, result.bookId);
            } catch {
              platformAlert(
                t('session.filingPrompt.addFailedTitle'),
                t('session.filingPrompt.addFailedMessage'),
                [
                  {
                    text: t('common.done'),
                    onPress: () => {
                      setFilingDismissed(true);
                      navigateToSessionSummary();
                    },
                  },
                ],
              );
            }
          }}
          disabled={filing.isPending}
          className="flex-1 bg-primary rounded-xl py-3 items-center min-h-[44px] justify-center"
          testID="filing-prompt-accept"
          accessibilityRole="button"
          accessibilityLabel={
            filing.isPending
              ? t('session.filingPrompt.adding')
              : t('session.filingPrompt.yesAddLabel')
          }
        >
          {filing.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-text-inverse font-semibold">
              {t('session.filingPrompt.yesAdd')}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => {
            setFilingDismissed(true);
            navigateToSessionSummary();
          }}
          disabled={filing.isPending}
          className="px-4 py-3 min-h-[44px] justify-center"
          testID="filing-prompt-dismiss"
          accessibilityRole="button"
          accessibilityLabel={t('session.filingPrompt.noThanksLabel')}
        >
          <Text className="text-text-secondary">
            {t('session.filingPrompt.noThanks')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
