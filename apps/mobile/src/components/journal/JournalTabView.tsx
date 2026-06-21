import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter, type Href } from 'expo-router';
import type { NowCard, RecapListItem } from '@eduagent/schemas';

import { ErrorFallback, TimeoutLoader } from '../common';
import { VoiceRecordButton } from '../session/VoiceRecordButton';
import { ReportsList } from '../progress/ReportsList';
import { useAllNotes } from '../../hooks/use-notes';
import { useBookmarks } from '../../hooks/use-bookmarks';
import { useJournalRecaps } from '../../hooks/use-journal-recaps';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import {
  useProfileReports,
  useProfileWeeklyReports,
} from '../../hooks/use-progress';
import { useNowFeed } from '../../hooks/use-now-feed';
import { pushNowDeepLink } from '../../lib/now-deep-link';
import { useProfile } from '../../lib/profile';
import { buildSessionDetailHref } from '../../lib/session-detail-navigation';
import { classifyApiError, recoveryActions } from '../../lib/format-api-error';

type JournalSectionId = 'recaps' | 'reports' | 'notes' | 'memory';

const JOURNAL_SECTIONS: JournalSectionId[] = [
  'recaps',
  'reports',
  'notes',
  'memory',
];

/**
 * Builds the {primary, secondary} ErrorFallback action pair from a RAW error.
 * Classifies the raw error first (never string-matches formatted output), then
 * maps recovery to retry-primary / go-home-secondary per the UX Resilience
 * rules (AGENTS.md). Screens never parse HTTP status codes.
 */
function useSectionErrorActions(
  error: unknown,
  onRetry: () => void,
): {
  primary?: { label: string; onPress: () => void; testID: string };
  secondary?: { label: string; onPress: () => void; testID: string };
} {
  const router = useRouter();
  const classified = classifyApiError(error);
  return recoveryActions(classified, {
    retry: onRetry,
    goHome: () => router.push('/(app)/home'),
  });
}

function ledgerKind(card: NowCard): string {
  const explicit = card.params.ledgerKind;
  if (typeof explicit === 'string' && explicit) return explicit;
  return card.templateKey.replace('now.ledger_moment.', '');
}

function ledgerCopyKey(card: NowCard): string {
  const kind = ledgerKind(card);
  if (!kind || kind === card.templateKey) return 'journal.moments.generic';
  return `journal.moments.${kind}`;
}

function stringParam(
  params: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberParam(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function renderMilestoneMomentText(card: NowCard, t: TFunction): string {
  const milestoneType = stringParam(card.params, 'milestoneType');
  const threshold = numberParam(card.params, 'threshold');
  if (!milestoneType || threshold == null) {
    return t('journal.moments.generic', card.params);
  }

  switch (milestoneType) {
    case 'vocabulary_count':
      return t('milestoneCard.wordCount', { count: threshold });
    case 'topic_mastered_count':
      return t('milestoneCard.topicCount', { count: threshold });
    case 'session_count':
      return t('milestoneCard.sessionCount', { count: threshold });
    case 'learning_time':
      return t('milestoneCard.hourCount', { count: threshold });
    default:
      return t('journal.moments.generic', card.params);
  }
}

function renderRewardMomentText(card: NowCard, t: TFunction): string {
  const receiptKind = stringParam(card.params, 'receiptKind');
  switch (receiptKind) {
    case 'practice_points': {
      const amount = numberParam(card.params, 'amount');
      const topicTitle = stringParam(card.params, 'topicTitle');
      if (amount == null) break;
      return topicTitle
        ? t('mentorHome.rewards.practicePoints', { amount, topicTitle })
        : t('mentorHome.rewards.practicePointsNoTopic', { amount });
    }
    case 'reflection_bonus': {
      const multiplier = numberParam(card.params, 'multiplier');
      const totalXp = numberParam(card.params, 'totalXp');
      if (multiplier == null || totalXp == null) break;
      return t('mentorHome.rewards.reflectionBonus', { multiplier, totalXp });
    }
    case 'quiz_personal_best': {
      const game = stringParam(card.params, 'game');
      const score = numberParam(card.params, 'score');
      if (score == null) break;
      return game === 'guess_who'
        ? t('mentorHome.rewards.quizPersonalBestGuessWho', { score })
        : t('mentorHome.rewards.quizPersonalBestCapitals', { score });
    }
    case 'mastery_delta': {
      const mastered = numberParam(card.params, 'mastered');
      const weeklyDelta = numberParam(card.params, 'weeklyDelta');
      if (mastered == null) break;
      return weeklyDelta != null
        ? t('mentorHome.rewards.masteryDelta', { mastered, weeklyDelta })
        : t('mentorHome.rewards.masteryDeltaNoWeekly', { mastered });
    }
  }
  return t('journal.moments.generic', card.params);
}

function renderLedgerMomentText(card: NowCard, t: TFunction): string {
  switch (ledgerCopyKey(card)) {
    case 'journal.moments.session_filed':
      return t('journal.moments.session_filed', card.params);
    case 'journal.moments.topic_mastered':
      return t('journal.moments.topic_mastered', card.params);
    case 'journal.moments.recap_ready':
      return t('journal.moments.recap_ready', card.params);
    case 'journal.moments.snapshot_ready':
      return t('journal.moments.snapshot_ready', card.params);
    case 'journal.moments.milestone_reached':
      return renderMilestoneMomentText(card, t);
    case 'journal.moments.reward_receipt':
      return renderRewardMomentText(card, t);
    case 'journal.moments.reflection_bonus':
      return t('journal.moments.reflection_bonus', card.params);
    case 'journal.moments.quiz_personal_best':
      return t('journal.moments.quiz_personal_best', card.params);
    default:
      return t('journal.moments.generic', card.params);
  }
}

function sectionTitle(section: JournalSectionId, t: TFunction): string {
  switch (section) {
    case 'recaps':
      return t('journal.sections.recaps');
    case 'reports':
      return t('journal.sections.reports');
    case 'notes':
      return t('journal.sections.notes');
    case 'memory':
      return t('journal.sections.memory');
  }
}

function sectionSubtitle(section: JournalSectionId, t: TFunction): string {
  switch (section) {
    case 'recaps':
      return t('journal.sections.recapsSubtitle');
    case 'reports':
      return t('journal.sections.reportsSubtitle');
    case 'notes':
      return t('journal.sections.notesSubtitle');
    case 'memory':
      return t('journal.sections.memorySubtitle');
  }
}

function JournalMomentsStrip(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const nowFeed = useNowFeed();
  const moments =
    nowFeed.data?.cards.filter((card) => card.kind === 'ledger_moment') ?? [];
  const errorActions = useSectionErrorActions(
    nowFeed.error,
    () => void nowFeed.refetch(),
  );

  if (nowFeed.isLoading && !nowFeed.data) {
    return (
      <TimeoutLoader
        isLoading
        testID="journal-moments-loading"
        loadingLabel={t('common.loading')}
        primaryAction={{
          label: t('common.tryAgain'),
          onPress: () => void nowFeed.refetch(),
          testID: 'journal-moments-timeout-retry',
        }}
      />
    );
  }

  // Feed unavailable + no cached/last data: keep the paper trail retryable
  // (spec §14 "Feed unavailable") rather than blanking the strip.
  if (nowFeed.isError && moments.length === 0) {
    return (
      <ErrorFallback
        variant="card"
        testID="journal-moments-error"
        title={t('journal.moments.errorTitle')}
        primaryAction={
          errorActions.primary
            ? { ...errorActions.primary, testID: 'journal-moments-retry' }
            : {
                label: t('common.tryAgain'),
                onPress: () => void nowFeed.refetch(),
                testID: 'journal-moments-retry',
              }
        }
        secondaryAction={errorActions.secondary}
      />
    );
  }

  return (
    <View testID="journal-moments-strip" className="gap-2">
      <Text className="text-body font-semibold text-text-primary">
        {t('journal.moments.title')}
      </Text>
      {moments.length === 0 ? (
        <View className="rounded-card border border-border bg-surface p-4">
          <Text className="text-body-sm text-text-secondary">
            {t('journal.moments.empty')}
          </Text>
        </View>
      ) : (
        moments.map((moment) => (
          <Pressable
            key={`${moment.templateKey}:${JSON.stringify(moment.params)}`}
            accessibilityRole="button"
            testID={`journal-moment-${ledgerKind(moment)}`}
            className="rounded-card border border-border bg-surface p-4"
            onPress={() =>
              pushNowDeepLink(router, moment.deepLink, {
                subjectHubTarget: 'v2-subject-hub',
              })
            }
          >
            <Text className="text-body-sm text-text-primary">
              {renderLedgerMomentText(moment, t)}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function JournalSegmentedControl({
  value,
  onChange,
}: {
  value: JournalSectionId;
  onChange: (value: JournalSectionId) => void;
}): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View
      className="flex-row rounded-card bg-surface-elevated p-1"
      testID="journal-segmented-control"
    >
      {JOURNAL_SECTIONS.map((section) => {
        const selected = value === section;
        return (
          <Pressable
            key={section}
            onPress={() => onChange(section)}
            className={`min-h-[40px] flex-1 items-center justify-center rounded-card px-2 ${
              selected ? 'bg-surface' : ''
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={sectionTitle(section, t)}
            testID={`journal-tab-${section}`}
          >
            <Text
              className={`text-caption font-semibold ${
                selected ? 'text-text-primary' : 'text-text-secondary'
              }`}
              numberOfLines={1}
            >
              {sectionTitle(section, t)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EmptyState({
  testID,
  title,
}: {
  testID: string;
  title: string;
}): React.ReactElement {
  return (
    <View
      testID={testID}
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-body-sm text-text-secondary">{title}</Text>
    </View>
  );
}

function RecapRow({ recap }: { recap: RecapListItem }): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const meta = [recap.subjectName, recap.topicTitle]
    .filter(Boolean)
    .join(' / ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('journal.recaps.openLabel', {
        title: recap.displayTitle,
      })}
      onPress={() =>
        router.push(
          buildSessionDetailHref({
            sessionId: recap.sessionId,
            subjectId: recap.subjectId,
            topicId: recap.topicId,
          }),
        )
      }
      testID={`journal-recap-row-${recap.recapId}`}
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-body font-semibold text-text-primary">
        {recap.displayTitle}
      </Text>
      {meta ? (
        <Text className="mt-1 text-body-sm text-text-secondary">{meta}</Text>
      ) : null}
      {(recap.highlight ?? recap.displaySummary) ? (
        <Text
          className="mt-2 text-body-sm text-text-secondary"
          numberOfLines={2}
        >
          {recap.highlight ?? recap.displaySummary}
        </Text>
      ) : null}
    </Pressable>
  );
}

function JournalRecapsSection(): React.ReactElement {
  const { t } = useTranslation();
  const recaps = useJournalRecaps(10);
  const errorActions = useSectionErrorActions(
    recaps.error,
    () => void recaps.refetch(),
  );

  if (recaps.isLoading && !recaps.data) {
    return (
      <TimeoutLoader
        isLoading
        testID="journal-recaps-loading"
        loadingLabel={t('common.loading')}
        primaryAction={{
          label: t('common.tryAgain'),
          onPress: () => void recaps.refetch(),
          testID: 'journal-recaps-timeout-retry',
        }}
      />
    );
  }

  if (recaps.isError && !recaps.data) {
    return (
      <ErrorFallback
        variant="card"
        testID="journal-recaps-error"
        title={t('journal.recaps.error')}
        primaryAction={
          errorActions.primary
            ? { ...errorActions.primary, testID: 'journal-recaps-error-retry' }
            : {
                label: t('common.tryAgain'),
                onPress: () => void recaps.refetch(),
                testID: 'journal-recaps-error-retry',
              }
        }
        secondaryAction={errorActions.secondary}
      />
    );
  }

  const rows = recaps.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        testID="journal-recaps-empty"
        title={t('journal.recaps.empty')}
      />
    );
  }

  return (
    <View className="gap-3" testID="journal-recaps-section">
      {rows.map((recap) => (
        <RecapRow key={recap.recapId} recap={recap} />
      ))}
    </View>
  );
}

function JournalReportsSection(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeProfile } = useProfile();
  const monthlyReports = useProfileReports(activeProfile?.id);
  const weeklyReports = useProfileWeeklyReports(activeProfile?.id);
  const isLoading =
    (monthlyReports.isLoading && !monthlyReports.data) ||
    (weeklyReports.isLoading && !weeklyReports.data);
  const isError = monthlyReports.isError || weeklyReports.isError;
  const errorActions = useSectionErrorActions(
    monthlyReports.error ?? weeklyReports.error,
    () => {
      void monthlyReports.refetch();
      void weeklyReports.refetch();
    },
  );

  if (isLoading) {
    return (
      <TimeoutLoader
        isLoading
        testID="journal-reports-loading"
        loadingLabel={t('common.loading')}
        primaryAction={{
          label: t('common.tryAgain'),
          onPress: () => {
            void monthlyReports.refetch();
            void weeklyReports.refetch();
          },
          testID: 'journal-reports-timeout-retry',
        }}
      />
    );
  }

  if (isError && !monthlyReports.data && !weeklyReports.data) {
    return (
      <ErrorFallback
        variant="card"
        testID="journal-reports-error"
        title={t('journal.reports.error')}
        primaryAction={
          errorActions.primary
            ? { ...errorActions.primary, testID: 'journal-reports-error-retry' }
            : {
                label: t('common.tryAgain'),
                onPress: () => {
                  void monthlyReports.refetch();
                  void weeklyReports.refetch();
                },
                testID: 'journal-reports-error-retry',
              }
        }
        secondaryAction={errorActions.secondary}
      />
    );
  }

  return (
    <View testID="journal-reports-section">
      <ReportsList
        monthlyReports={monthlyReports.data ?? []}
        weeklyReports={weeklyReports.data ?? []}
        scrollEnabled={false}
        testID="journal-reports-list"
        onPressMonthly={(reportId) =>
          router.push({
            pathname: '/(app)/progress/reports/[reportId]',
            params: { reportId },
          } as Href)
        }
        onPressWeekly={(weeklyReportId) =>
          router.push({
            pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
            params: { weeklyReportId },
          } as Href)
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// JournalNotesArchive (T6/EU-6) — the BROWSABLE cross-subject "everything I've
// saved" surface. One store, two origins (my notes vs saved-from-mentor), one
// cross-subject flat list rendered browse-first; an optional search line (with
// a transcription-only mic per spec §16) narrows the already-visible list.
// ---------------------------------------------------------------------------

type ArchiveItem = {
  id: string;
  authorship: 'mine' | 'mentor';
  content: string;
  subjectName: string | null;
  topicTitle: string | null;
};

function JournalNotesArchive(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const notes = useAllNotes({ limit: 50 });
  const bookmarks = useBookmarks({ limit: 50 });
  const [filter, setFilter] = useState('');

  // Transcription-only STT — the same on-device speech primitive the session
  // input bar uses. It dictates text into the search filter and nothing more:
  // no tone/emotion analysis (AI Act Art 5(1)(f) compliance invariant, §16).
  const { isListening, transcript, startListening, stopListening } =
    useSpeechRecognition();

  // Fold the recognized transcript into the search filter as it arrives. STT
  // replaces the typed filter wholesale; voice and text are mutually exclusive
  // entry modes, so anything typed by hand before switching to voice is discarded.
  useEffect(() => {
    if (transcript) setFilter(transcript);
  }, [transcript]);

  const noteItems = useMemo(
    () => notes.data?.pages.flatMap((page) => page.notes) ?? [],
    [notes.data],
  );
  const bookmarkItems = useMemo(
    () => bookmarks.data?.pages.flatMap((page) => page.bookmarks) ?? [],
    [bookmarks.data],
  );

  const items: ArchiveItem[] = useMemo(() => {
    const noteRows: ArchiveItem[] = noteItems.map((note) => ({
      id: `note:${note.id}`,
      // A note's origin is 'self' (the learner wrote it) or 'mentor'
      // (saved from a mentor explanation). Bookmarks are always a saved
      // mentor reply.
      authorship: note.origin === 'mentor' ? 'mentor' : 'mine',
      content: note.content,
      subjectName: note.subjectName ?? null,
      topicTitle: note.topicTitle ?? null,
    }));
    const bookmarkRows: ArchiveItem[] = bookmarkItems.map((bookmark) => ({
      id: `bookmark:${bookmark.id}`,
      authorship: 'mentor',
      content: bookmark.content,
      subjectName: bookmark.subjectName ?? null,
      topicTitle: bookmark.topicTitle ?? null,
    }));
    return [...noteRows, ...bookmarkRows];
  }, [noteItems, bookmarkItems]);

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleItems =
    normalizedFilter.length === 0
      ? items
      : items.filter((item) =>
          [item.content, item.subjectName, item.topicTitle]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLowerCase().includes(normalizedFilter)),
        );

  const isLoading =
    (notes.isLoading && !notes.data) ||
    (bookmarks.isLoading && !bookmarks.data);
  const isError = notes.isError || bookmarks.isError;
  const errorActions = useSectionErrorActions(
    notes.error ?? bookmarks.error,
    () => {
      void notes.refetch();
      void bookmarks.refetch();
    },
  );

  if (isLoading) {
    return (
      <TimeoutLoader
        isLoading
        testID="journal-notes-loading"
        loadingLabel={t('common.loading')}
        primaryAction={{
          label: t('common.tryAgain'),
          onPress: () => {
            void notes.refetch();
            void bookmarks.refetch();
          },
          testID: 'journal-notes-timeout-retry',
        }}
      />
    );
  }

  if (isError && items.length === 0) {
    return (
      <ErrorFallback
        variant="card"
        testID="journal-notes-error"
        title={t('journal.notes.error')}
        primaryAction={
          errorActions.primary
            ? { ...errorActions.primary, testID: 'journal-notes-error-retry' }
            : {
                label: t('common.tryAgain'),
                onPress: () => {
                  void notes.refetch();
                  void bookmarks.refetch();
                },
                testID: 'journal-notes-error-retry',
              }
        }
        secondaryAction={errorActions.secondary}
      />
    );
  }

  return (
    <View testID="journal-notes-section" className="gap-3">
      {/* Optional search/filter line — narrows the already-visible browse list.
          Carries a transcription-only mic (spec §16). */}
      <View
        className="flex-row items-center gap-2"
        testID="journal-notes-search"
      >
        <View className="flex-1 rounded-input border border-border bg-surface px-3">
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder={t('journal.notes.searchPlaceholder')}
            accessibilityLabel={t('journal.notes.searchPlaceholder')}
            className="min-h-[44px] text-body text-text-primary"
            testID="journal-notes-search-input"
          />
        </View>
        {/* VoiceRecordButton hardcodes its own testID; wrap it so the archive
            search line exposes the spec'd `journal-notes-mic` handle. The STT
            primitive is transcription-only (no tone/emotion API) — §16. */}
        <View testID="journal-notes-mic">
          <VoiceRecordButton
            isListening={isListening}
            onPress={() =>
              void (isListening ? stopListening() : startListening())
            }
          />
        </View>
      </View>

      {visibleItems.length === 0 ? (
        <EmptyState
          testID="journal-notes-empty"
          title={
            normalizedFilter.length > 0
              ? t('journal.notes.searchEmpty')
              : t('journal.notes.empty')
          }
        />
      ) : (
        visibleItems.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            testID={`journal-note-${item.id}`}
            className="rounded-card border border-border bg-surface p-4"
            onPress={() =>
              router.push({
                pathname: '/(app)/my-notes/[kind]',
                params: {
                  kind: item.authorship === 'mentor' ? 'bookmarks' : 'notes',
                  returnTo: 'journal',
                },
              } as Href)
            }
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className="flex-1 text-body-sm text-text-secondary"
                numberOfLines={1}
              >
                {[item.subjectName, item.topicTitle]
                  .filter(Boolean)
                  .join(' / ') || t('myNotes.unknownSubject')}
              </Text>
              <View
                className="rounded-full bg-surface-elevated px-3 py-1"
                testID={`journal-note-authorship-${item.authorship}`}
              >
                <Text className="text-caption font-semibold text-text-primary">
                  {item.authorship === 'mentor'
                    ? t('journal.notes.authorshipMentor')
                    : t('journal.notes.authorshipMine')}
                </Text>
              </View>
            </View>
            <Text
              className="mt-2 text-body text-text-primary"
              numberOfLines={3}
            >
              {item.content}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

function JournalMemorySection(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View
      testID="journal-memory-section"
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-body font-semibold text-text-primary">
        {t('journal.memory.title')}
      </Text>
      <Text className="mt-2 text-body-sm text-text-secondary">
        {t('journal.memory.body')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('journal.memory.open')}
        onPress={() => router.push('/(app)/mentor-memory?returnTo=journal')}
        testID="journal-memory-open"
        className="mt-4 self-start rounded-button bg-primary px-4 py-2"
      >
        <Text className="text-body-sm font-semibold text-text-inverse">
          {t('journal.memory.open')}
        </Text>
      </Pressable>
    </View>
  );
}

function ActiveSection({
  section,
}: {
  section: JournalSectionId;
}): React.ReactElement {
  switch (section) {
    case 'recaps':
      return <JournalRecapsSection />;
    case 'reports':
      return <JournalReportsSection />;
    case 'notes':
      return <JournalNotesArchive />;
    case 'memory':
      return <JournalMemorySection />;
  }
}

export function JournalTabView(): React.ReactElement {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] =
    useState<JournalSectionId>('recaps');

  return (
    <ScrollView
      testID="journal-screen"
      className="flex-1 bg-background px-5 py-4"
      contentContainerStyle={{ paddingBottom: 28, gap: 16 }}
    >
      <View>
        <Text className="text-h2 font-bold text-text-primary">
          {t('journal.title')}
        </Text>
        <Text className="mt-1 text-body text-text-secondary">
          {t('journal.trust.privacyPromise')}
        </Text>
      </View>

      <JournalMomentsStrip />

      <JournalSegmentedControl
        value={activeSection}
        onChange={setActiveSection}
      />
      <Text className="text-body-sm text-text-secondary">
        {sectionSubtitle(activeSection, t)}
      </Text>

      <ActiveSection section={activeSection} />
    </ScrollView>
  );
}
