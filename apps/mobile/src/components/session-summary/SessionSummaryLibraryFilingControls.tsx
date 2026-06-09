import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import type { LearningSession } from '@eduagent/schemas';

import {
  useAddSessionToLibrary,
  useKeepSessionOutOfLibrary,
  useRestoreSessionLibraryFiling,
  useRetrySessionLibraryFiling,
  useSessionLibraryFiling,
} from '../../hooks/use-filing';

type EnrichedLibrarySession = LearningSession & {
  topicTitle?: string | null;
  subjectName?: string | null;
  bookId?: string | null;
  bookTitle?: string | null;
};

interface SessionSummaryLibraryFilingControlsProps {
  sessionId: string;
}

const MIN_FREEFORM_LIBRARY_FILING_EXCHANGES = 5;

function getDestinationLabel(session: EnrichedLibrarySession): string | null {
  return [session.bookTitle, session.subjectName].filter(Boolean).join(' - ');
}

function isAutoFileCandidate(session: EnrichedLibrarySession): boolean {
  return session.exchangeCount >= MIN_FREEFORM_LIBRARY_FILING_EXCHANGES;
}

export function SessionSummaryLibraryFilingControls({
  sessionId,
}: SessionSummaryLibraryFilingControlsProps): React.ReactElement | null {
  const router = useRouter();
  const filing = useSessionLibraryFiling(sessionId);
  const keepOut = useKeepSessionOutOfLibrary();
  const add = useAddSessionToLibrary();
  const restore = useRestoreSessionLibraryFiling();
  const retry = useRetrySessionLibraryFiling();
  const [message, setMessage] = useState<string | null>(null);

  const session = filing.session as EnrichedLibrarySession | null;
  const destinationLabel = useMemo(
    () => (session ? getDestinationLabel(session) : null),
    [session],
  );

  if (!session) return null;

  const meetsFilingThreshold = isAutoFileCandidate(session);
  if (
    !meetsFilingThreshold &&
    !filing.isFiledInLibrary &&
    filing.filingStatus !== 'filing_pending'
  ) {
    return null;
  }

  const isBusy =
    keepOut.isPending || add.isPending || restore.isPending || retry.isPending;
  const showPending =
    filing.filingStatus === 'filing_pending' ||
    (filing.filingStatus == null && meetsFilingThreshold);
  const showUnfiled = filing.filingStatus == null && !meetsFilingThreshold;

  const handleMutationFailure = (): void => {
    setMessage("Couldn't update Library right now. Try again in a moment.");
  };

  const handleKeepOut = async (): Promise<void> => {
    setMessage(null);
    try {
      await keepOut.mutateAsync({ sessionId });
    } catch {
      handleMutationFailure();
    }
  };

  const handleAdd = async (): Promise<void> => {
    setMessage(null);
    try {
      await add.mutateAsync({ sessionId });
    } catch {
      handleMutationFailure();
    }
  };

  const handleRestore = async (): Promise<void> => {
    setMessage(null);
    try {
      await restore.mutateAsync({ sessionId });
    } catch {
      handleMutationFailure();
    }
  };

  const handleRetry = async (): Promise<void> => {
    setMessage(null);
    try {
      await retry.mutateAsync({ sessionId });
    } catch {
      handleMutationFailure();
    }
  };

  const handleOpenTopic = (): void => {
    if (!session.topicId) return;
    router.push({
      pathname: '/(app)/topic/[topicId]',
      params: {
        topicId: session.topicId,
        subjectId: session.subjectId,
        ...(session.bookId ? { bookId: session.bookId } : {}),
      },
    } as Href);
  };

  const renderPrimaryAction = (
    label: string,
    onPress: () => Promise<void>,
    testID: string,
  ): React.ReactElement => (
    <Pressable
      onPress={() => {
        void onPress();
      }}
      disabled={isBusy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isBusy }}
      className={`rounded-button py-2.5 px-4 items-center ${
        isBusy ? 'bg-surface-elevated' : 'bg-primary'
      }`}
      testID={testID}
    >
      {isBusy ? (
        <ActivityIndicator />
      ) : (
        <Text className="text-body-sm font-semibold text-text-inverse">
          {label}
        </Text>
      )}
    </Pressable>
  );

  return (
    <View
      className="bg-surface rounded-card p-4 mb-4"
      testID="session-summary-library-filing"
    >
      {filing.timedOutStillPending ? (
        <>
          <Text className="text-body font-semibold text-text-primary">
            Still adding this to your Library...
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            This can take a little longer. Your chat is saved either way.
          </Text>
          <View className="flex-row flex-wrap gap-2 mt-3">
            <Pressable
              onPress={() => {
                void filing.refetch();
              }}
              accessibilityRole="button"
              accessibilityLabel="Refresh Library status"
              className="rounded-button py-2.5 px-4 items-center bg-surface-elevated"
              testID="session-summary-library-refresh"
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                Refresh
              </Text>
            </Pressable>
            {renderPrimaryAction(
              "Don't add to Library",
              handleKeepOut,
              'session-summary-library-keep-out',
            )}
          </View>
        </>
      ) : showPending ? (
        <>
          <Text className="text-body font-semibold text-text-primary">
            Adding this to your Library...
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            Your chat is saved. We are finding the right Library spot for it.
          </Text>
          <View className="mt-3">
            {renderPrimaryAction(
              "Don't add to Library",
              handleKeepOut,
              'session-summary-library-keep-out',
            )}
          </View>
        </>
      ) : filing.isFiledInLibrary ? (
        <>
          <Text className="text-body font-semibold text-text-primary">
            Added to Library
          </Text>
          {session.topicTitle ? (
            <Text className="text-body text-text-primary mt-2">
              {session.topicTitle}
            </Text>
          ) : (
            <Text className="text-body-sm text-text-secondary mt-1">
              This chat is linked to your Library.
            </Text>
          )}
          {destinationLabel ? (
            <Text className="text-body-sm text-text-secondary mt-1">
              {destinationLabel}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-2 mt-3">
            {session.topicId ? (
              <Pressable
                onPress={handleOpenTopic}
                accessibilityRole="button"
                accessibilityLabel="Open in Library"
                className="rounded-button py-2.5 px-4 items-center bg-surface-elevated"
                testID="session-summary-library-open-topic"
              >
                <Text className="text-body-sm font-semibold text-text-primary">
                  Open in Library
                </Text>
              </Pressable>
            ) : null}
            {renderPrimaryAction(
              'Remove from Library',
              handleKeepOut,
              'session-summary-library-remove',
            )}
          </View>
        </>
      ) : filing.isTerminalFailure ? (
        <>
          <Text className="text-body font-semibold text-text-primary">
            We couldn't add this to your Library
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            Your chat is saved. Try again when you're ready.
          </Text>
          <View className="mt-3">
            {renderPrimaryAction(
              'Retry',
              handleRetry,
              'session-summary-library-retry',
            )}
          </View>
        </>
      ) : filing.isKeptOut || showUnfiled ? (
        <>
          <Text className="text-body font-semibold text-text-primary">
            Not in Library
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            This chat is saved, but it is not a Library topic.
          </Text>
          <View className="mt-3">
            {renderPrimaryAction(
              'Add to Library',
              filing.isKeptOut ? handleRestore : handleAdd,
              'session-summary-library-add',
            )}
          </View>
        </>
      ) : null}

      {message ? (
        <Text className="text-caption text-danger mt-2">{message}</Text>
      ) : null}
    </View>
  );
}
