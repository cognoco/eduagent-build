import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  /**
   * Treat the session as a filing candidate regardless of exchange count.
   * Homework auto-files at exit (W2 #11) and is routinely below the freeform
   * `MIN_FREEFORM_LIBRARY_FILING_EXCHANGES` floor, so without this the control
   * would early-return null for short homework sessions.
   */
  alwaysFilingCandidate?: boolean;
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
  alwaysFilingCandidate = false,
}: SessionSummaryLibraryFilingControlsProps): React.ReactElement | null {
  const { t } = useTranslation();
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

  const meetsFilingThreshold =
    alwaysFilingCandidate || isAutoFileCandidate(session);
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
    // A session that already committed a topic (markSessionFiled sets
    // topicId/filedAt but leaves filingStatus null) is filed, not pending —
    // don't let the null-status candidate branch mask the "Added" state.
    (filing.filingStatus == null &&
      meetsFilingThreshold &&
      !filing.isFiledInLibrary);
  const showUnfiled = filing.filingStatus == null && !meetsFilingThreshold;

  const handleMutationFailure = (): void => {
    setMessage(t('sessionSummary.libraryFiling.updateError'));
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
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
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
            {t('sessionSummary.libraryFiling.stillAddingTitle')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('sessionSummary.libraryFiling.stillAddingHint')}
          </Text>
          <View className="flex-row flex-wrap gap-2 mt-3">
            <Pressable
              onPress={() => {
                void filing.refetch();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('sessionSummary.libraryFiling.a11yRefresh')}
              className="rounded-button py-2.5 px-4 items-center bg-surface-elevated"
              testID="session-summary-library-refresh"
            >
              <Text className="text-body-sm font-semibold text-text-primary">
                {t('sessionSummary.libraryFiling.refresh')}
              </Text>
            </Pressable>
            {renderPrimaryAction(
              t('sessionSummary.libraryFiling.dontAdd'),
              handleKeepOut,
              'session-summary-library-keep-out',
            )}
          </View>
        </>
      ) : showPending ? (
        <>
          <Text className="text-body font-semibold text-text-primary">
            {t('sessionSummary.libraryFiling.addingTitle')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('sessionSummary.libraryFiling.addingHint')}
          </Text>
          <View className="mt-3">
            {renderPrimaryAction(
              t('sessionSummary.libraryFiling.dontAdd'),
              handleKeepOut,
              'session-summary-library-keep-out',
            )}
          </View>
        </>
      ) : filing.isFiledInLibrary ? (
        <>
          <Text className="text-body font-semibold text-text-primary">
            {t('sessionSummary.libraryFiling.addedTitle')}
          </Text>
          {session.topicTitle ? (
            <Text className="text-body text-text-primary mt-2">
              {session.topicTitle}
            </Text>
          ) : (
            <Text className="text-body-sm text-text-secondary mt-1">
              {t('sessionSummary.libraryFiling.linkedHint')}
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
                accessibilityLabel={t(
                  'sessionSummary.libraryFiling.a11yOpenInLibrary',
                )}
                className="rounded-button py-2.5 px-4 items-center bg-surface-elevated"
                testID="session-summary-library-open-topic"
              >
                <Text className="text-body-sm font-semibold text-text-primary">
                  {t('sessionSummary.libraryFiling.openInLibrary')}
                </Text>
              </Pressable>
            ) : null}
            {renderPrimaryAction(
              t('sessionSummary.libraryFiling.remove'),
              handleKeepOut,
              'session-summary-library-remove',
            )}
          </View>
        </>
      ) : filing.isTerminalFailure ? (
        <>
          <Text className="text-body font-semibold text-text-primary">
            {t('sessionSummary.libraryFiling.failedTitle')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('sessionSummary.libraryFiling.failedHint')}
          </Text>
          <View className="mt-3">
            {renderPrimaryAction(
              t('common.retry'),
              handleRetry,
              'session-summary-library-retry',
            )}
          </View>
        </>
      ) : filing.isKeptOut || showUnfiled ? (
        <>
          <Text className="text-body font-semibold text-text-primary">
            {t('sessionSummary.libraryFiling.keptOutTitle')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('sessionSummary.libraryFiling.keptOutHint')}
          </Text>
          <View className="mt-3">
            {renderPrimaryAction(
              t('sessionSummary.libraryFiling.add'),
              filing.isKeptOut ? handleRestore : handleAdd,
              'session-summary-library-add',
            )}
          </View>
        </>
      ) : null}

      {message ? (
        <Text
          className="text-caption text-danger mt-2"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}
