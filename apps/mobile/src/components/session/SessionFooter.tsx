import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LibraryPrompt } from './LibraryPrompt';
import { QuestionCounter } from './QuestionCounter';
import { NoteInput } from '../library/NoteInput';
import type { useCreateNote } from '../../hooks/use-notes';
import { formatApiError } from '../../lib/format-api-error';
import { platformAlert } from '../../lib/platform-alert';
import type { Href, Router } from 'expo-router';
import type { useThemeColors } from '../../lib/theme';

export interface SessionFooterProps {
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
  /** WI-1451: latest bookmarkable AI reply's eventId in a topicless (freeform)
   *  session, or null before one exists yet. */
  bookmarkableEventId: string | null;
  keepPending: boolean;
  keepSaved: boolean;
  onKeepNow: (eventId: string) => void;
}

export function SessionFooter({
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
  bookmarkableEventId,
  keepPending,
  keepSaved,
  onKeepNow,
}: SessionFooterProps) {
  const { t } = useTranslation();
  return (
    <>
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
      {notePromptOffered &&
      topicId &&
      !showNoteInput &&
      !sessionNoteSavedRef.current ? (
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
      {notePromptOffered && !topicId && !keepSaved ? (
        bookmarkableEventId ? (
          <Pressable
            className="bg-primary/10 rounded-lg px-4 py-3 mx-4 mb-2 flex-row items-center"
            onPress={() => onKeepNow(bookmarkableEventId)}
            disabled={keepPending}
            testID="session-freeform-keep-prompt"
            accessibilityRole="button"
            accessibilityLabel={t('session.notePrompt.keepThis')}
          >
            <Ionicons
              name="bookmark-outline"
              size={18}
              color={colors.primary}
            />
            <Text className="text-body text-primary font-semibold ml-2">
              {t('session.notePrompt.keepThis')}
            </Text>
          </Pressable>
        ) : (
          <View className="px-4 mb-2" testID="session-freeform-keep-deferred">
            <Text className="text-body-sm text-text-secondary">
              {t('session.notePrompt.keepPending')}
            </Text>
          </View>
        )
      ) : null}
      {showNoteInput && topicId ? (
        <View className="px-4 mb-2">
          <NoteInput
            placeholder={t('session.notePrompt.summaryPlaceholder')}
            onSave={(content) => {
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
