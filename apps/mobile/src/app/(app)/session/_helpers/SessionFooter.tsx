import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { QuestionCounter, LibraryPrompt } from '../../../../components/session';
import { NoteInput } from '../../../../components/library/NoteInput';
import type { useFiling } from '../../../../hooks/use-filing';
import type { useUpsertNote } from '../../../../hooks/use-notes';
import { formatApiError } from '../../../../lib/format-api-error';
import type { Router } from 'expo-router';
import type { useThemeColors } from '../../../../lib/theme';

export interface SessionFooterProps {
  showFilingPrompt: boolean;
  filingDismissed: boolean;
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  effectiveMode: string;
  filingTopicHint?: string;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: () => void;
  router: Router;
  sessionExpired: boolean;
  notePromptOffered: boolean;
  showNoteInput: boolean;
  setShowNoteInput: React.Dispatch<React.SetStateAction<boolean>>;
  sessionNoteSavedRef: React.MutableRefObject<boolean>;
  topicId: string | undefined;
  upsertNote: ReturnType<typeof useUpsertNote>;
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
  sessionExpired,
  notePromptOffered,
  showNoteInput,
  setShowNoteInput,
  sessionNoteSavedRef,
  topicId,
  upsertNote,
  colors,
  userMessageCount,
  showQuestionCount,
  showBookLink,
}: SessionFooterProps) {
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
          router={router}
        />
      ) : null}
      {sessionExpired ? (
        <View className="bg-surface rounded-card p-4 mt-2 mb-4">
          <Text className="text-body font-semibold text-text-primary mb-2">
            Session expired
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            This session is no longer available. Start a new one from home or
            your library.
          </Text>
          <Pressable
            onPress={() => router.replace('/(app)/home' as never)}
            className="bg-primary rounded-button py-3 items-center"
            testID="session-expired-go-home"
            accessibilityRole="button"
            accessibilityLabel="Go home"
          >
            <Text className="text-text-inverse text-body font-semibold">
              Go Home
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
          accessibilityLabel="Write a note"
        >
          <Ionicons
            name="document-text-outline"
            size={18}
            color={colors.primary}
          />
          <Text className="text-body text-primary font-semibold ml-2">
            Write a note
          </Text>
        </Pressable>
      ) : null}
      {showNoteInput ? (
        <View className="px-4 mb-2">
          <NoteInput
            onSave={(content) => {
              if (!topicId) {
                Alert.alert(
                  'Cannot save note',
                  'No topic selected for this session.'
                );
                return;
              }
              const separator = !sessionNoteSavedRef.current
                ? `--- ${new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })} ---\n`
                : '';
              upsertNote.mutate(
                {
                  topicId,
                  content: `${separator}${content}`,
                  append: true,
                },
                {
                  onSuccess: () => {
                    sessionNoteSavedRef.current = true;
                    setShowNoteInput(false);
                  },
                  onError: (error) => {
                    Alert.alert(
                      "Couldn't save your note",
                      formatApiError(error)
                    );
                  },
                }
              );
            }}
            onCancel={() => setShowNoteInput(false)}
            saving={upsertNote.isPending}
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
  router,
}: {
  filing: ReturnType<typeof useFiling>;
  activeSessionId: string | null;
  effectiveMode: string;
  filingTopicHint?: string;
  setShowFilingPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  setFilingDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  navigateToSessionSummary: () => void;
  router: Router;
}) {
  return (
    <View
      className="px-4 py-6 bg-surface-elevated rounded-t-2xl"
      testID="filing-prompt"
    >
      <Text className="text-lg font-semibold text-text-primary mb-2">
        Add to your library?
      </Text>
      <Text className="text-body-sm text-text-secondary mb-4">
        {filingTopicHint
          ? `You explored "${filingTopicHint}". Keep it in your library?`
          : 'We can organize what you learned into your library.'}
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
              router.replace({
                pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
                params: {
                  subjectId: result.shelfId,
                  bookId: result.bookId,
                },
              } as never);
            } catch {
              Alert.alert(
                "Couldn't add to library",
                'Your session is still saved.',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setFilingDismissed(true);
                      navigateToSessionSummary();
                    },
                  },
                ]
              );
            }
          }}
          disabled={filing.isPending}
          className="flex-1 bg-primary rounded-xl py-3 items-center min-h-[44px] justify-center"
          testID="filing-prompt-accept"
          accessibilityRole="button"
          accessibilityLabel={
            filing.isPending ? 'Adding to library' : 'Yes, add to library'
          }
        >
          {filing.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-text-inverse font-semibold">Yes, add it</Text>
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
          accessibilityLabel="No thanks, skip"
        >
          <Text className="text-text-secondary">No thanks</Text>
        </Pressable>
      </View>
    </View>
  );
}
