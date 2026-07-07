import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter, type Href } from 'expo-router';
import type {
  NowCard,
  RecapListItem,
  ReportPracticeActivityType,
} from '@eduagent/schemas';

import { ErrorFallback, TimeoutLoader } from '../common';
import { BookPageFlipAnimation } from '../common/BookPageFlipAnimation';
import { DeskLampAnimation } from '../common/DeskLampAnimation';
import { MagicPenAnimation } from '../common/MagicPenAnimation';
import { RecapsEmptyState } from '../recaps/RecapsEmptyState';
import { VoiceRecordButton } from '../session/VoiceRecordButton';
import { ReportsList } from '../progress/ReportsList';
import { LatestReportCard } from '../../app/(app)/progress/_components/LatestReportCard';
import { getLatestReport } from '../../app/(app)/progress/_view-models/progress-report-helpers';
import { useAllNotes } from '../../hooks/use-notes';
import { useBookmarks } from '../../hooks/use-bookmarks';
import { usePracticeActivityHistory } from '../../hooks/use-practice-activity-history';
import { useJournalRecaps } from '../../hooks/use-journal-recaps';
import { useSpeechRecognition } from '../../hooks/use-speech-recognition';
import { useMyReports, useMyWeeklyReports } from '../../hooks/use-my-reports';
import { useNowFeed } from '../../hooks/use-now-feed';
import { pushNowDeepLink } from '../../lib/now-deep-link';
import { buildSessionDetailHref } from '../../lib/session-detail-navigation';
import { classifyApiError, recoveryActions } from '../../lib/format-api-error';

type JournalSectionId =
  | 'notes'
  | 'sessions'
  | 'practice'
  | 'memory'
  | 'reports';

// Landing order drives the two-row count-driven grid: the first row fills with
// the first three, the rest wrap. Adding a sixth button simply flows to the
// next row — no layout change required.
const JOURNAL_SECTIONS: JournalSectionId[] = [
  'notes',
  'sessions',
  'practice',
  'memory',
  'reports',
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
    goHome: () => router.push('/(app)/home' as Href),
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
    case 'notes':
      return t('journal.sections.notes');
    case 'sessions':
      return t('journal.sections.sessions');
    case 'practice':
      return t('journal.sections.practice');
    case 'memory':
      return t('journal.sections.memory');
    case 'reports':
      return t('journal.sections.reports');
  }
}

function sectionSubtitle(section: JournalSectionId, t: TFunction): string {
  switch (section) {
    case 'notes':
      return t('journal.sections.notesSubtitle');
    case 'sessions':
      return t('journal.sections.sessionsSubtitle');
    case 'practice':
      return t('journal.sections.practiceSubtitle');
    case 'memory':
      return t('journal.sections.memorySubtitle');
    case 'reports':
      return t('journal.sections.reportsSubtitle');
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
        <View
          testID="journal-moments-empty"
          className="items-center rounded-card border border-border bg-surface p-4"
        >
          <View className="mb-3" pointerEvents="none">
            <BookPageFlipAnimation
              size={78}
              testID="journal-moments-empty-book"
            />
          </View>
          <Text className="text-center text-body-sm text-text-secondary">
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

  // Count-driven two-row grid. `basis-[30%]` seats three buttons per row; the
  // remainder wraps and `grow` lets them fill the row. With five sections this
  // renders 3 + 2; a sixth flows naturally to the second row. Bigger tap
  // targets + single-line labels make the sections obvious on landing and end
  // the small-screen truncation ("Saved not…", "Mentor m…").
  return (
    <View
      className="flex-row flex-wrap gap-2"
      testID="journal-segmented-control"
    >
      {JOURNAL_SECTIONS.map((section) => {
        const selected = value === section;
        return (
          <Pressable
            key={section}
            onPress={() => onChange(section)}
            className={`min-h-[56px] grow basis-[30%] items-center justify-center rounded-card border px-2 py-3 ${
              selected
                ? 'border-primary bg-surface'
                : 'border-border bg-surface-elevated'
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={sectionTitle(section, t)}
            testID={`journal-tab-${section}`}
          >
            <Text
              className={`text-body font-semibold text-center ${
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
  illustration,
}: {
  testID: string;
  title: string;
  illustration?: React.ReactNode;
}): React.ReactElement {
  return (
    <View
      testID={testID}
      className="items-center rounded-card border border-border bg-surface p-4"
    >
      {illustration ? (
        <View className="mb-3" pointerEvents="none">
          {illustration}
        </View>
      ) : null}
      <Text className="text-center text-body-sm text-text-secondary">
        {title}
      </Text>
    </View>
  );
}

function PracticeReportsEmptyMotif({
  testID,
}: {
  testID: string;
}): React.ReactElement {
  return (
    <View
      testID={testID}
      className="h-[92px] w-[176px] items-center justify-center"
      pointerEvents="none"
    >
      <View className="absolute left-0 top-3">
        <DeskLampAnimation size={62} testID={`${testID}-lamp`} />
      </View>
      <View className="absolute left-[58px] top-4">
        <MagicPenAnimation size={58} testID={`${testID}-pen`} />
      </View>
      <View className="absolute right-0 top-1">
        <BookPageFlipAnimation size={66} testID={`${testID}-book`} />
      </View>
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
  const router = useRouter();
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
      <View>
        <View className="mb-3 items-center" pointerEvents="none">
          <BookPageFlipAnimation size={86} testID="journal-recaps-empty-book" />
        </View>
        <RecapsEmptyState
          testID="journal-recaps-empty"
          ctaTestID="journal-recaps-empty-start-session"
          onStart={() => router.push('/(app)/mentor' as Href)}
        />
      </View>
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
  const monthlyReports = useMyReports();
  const weeklyReports = useMyWeeklyReports();
  const isLoading =
    (monthlyReports.isLoading && !monthlyReports.data) ||
    (weeklyReports.isLoading && !weeklyReports.data);
  const isError = monthlyReports.isError || weeklyReports.isError;
  // Auto-surface the most recent available report (weekly each week, monthly
  // each month) inline at the top — the same behavior as the V1 Progress tab.
  const latestReport = getLatestReport(weeklyReports.data, monthlyReports.data);
  const hasAnyReports =
    (monthlyReports.data?.length ?? 0) > 0 ||
    (weeklyReports.data?.length ?? 0) > 0;
  const openLatestReport = () => {
    if (!latestReport) return;
    if (latestReport.kind === 'weekly') {
      router.push({
        pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
        params: { weeklyReportId: latestReport.report.id },
      } as Href);
    } else {
      router.push({
        pathname: '/(app)/progress/reports/[reportId]',
        params: { reportId: latestReport.report.id },
      } as Href);
    }
  };
  const refetchReports = () => {
    void monthlyReports.refetch();
    void weeklyReports.refetch();
  };
  const errorActions = useSectionErrorActions(
    monthlyReports.error ?? weeklyReports.error,
    refetchReports,
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
      {!hasAnyReports && !isError ? (
        <View className="items-center" pointerEvents="none">
          <PracticeReportsEmptyMotif testID="journal-reports-empty-motif" />
        </View>
      ) : null}
      <LatestReportCard
        latestReport={latestReport}
        isError={isError}
        isLoading={isLoading}
        onOpen={openLatestReport}
        onRetry={refetchReports}
      />
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
  const [authorFilter, setAuthorFilter] = useState<'all' | 'mine' | 'mentor'>(
    'all',
  );

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

  // One-click authorship filter (All / My notes / Bookmarks) narrows the merged
  // archive before the free-text search runs, so a learner can isolate their
  // own notes or saved mentor replies without leaving the single list.
  const authorScopedItems =
    authorFilter === 'all'
      ? items
      : items.filter((item) =>
          authorFilter === 'mentor'
            ? item.authorship === 'mentor'
            : item.authorship === 'mine',
        );

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleItems =
    normalizedFilter.length === 0
      ? authorScopedItems
      : authorScopedItems.filter((item) =>
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
      {/* One-click authorship filter — All / My notes / Bookmarks. */}
      <View className="flex-row gap-2" testID="journal-notes-filter">
        {(['all', 'mine', 'mentor'] as const).map((key) => {
          const selected = authorFilter === key;
          const label =
            key === 'all'
              ? t('journal.notes.filterAll')
              : key === 'mine'
                ? t('journal.notes.filterMine')
                : t('journal.notes.filterMentor');
          return (
            <Pressable
              key={key}
              onPress={() => setAuthorFilter(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              testID={`journal-notes-filter-${key}`}
              className={`min-h-[36px] justify-center rounded-full px-3 py-1.5 ${
                selected ? 'bg-primary' : 'bg-surface-elevated'
              }`}
            >
              <Text
                className={`text-caption font-semibold ${
                  selected ? 'text-text-inverse' : 'text-text-secondary'
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
          illustration={
            <MagicPenAnimation size={82} testID="journal-notes-empty-pen" />
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
        onPress={() =>
          router.push('/(app)/mentor-memory?returnTo=journal' as Href)
        }
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

type PracticeTypeFilter = 'all' | ReportPracticeActivityType;
const PRACTICE_TYPE_FILTERS: PracticeTypeFilter[] = [
  'all',
  'quiz',
  'review',
  'assessment',
  'dictation',
  'recitation',
  'fluency_drill',
];

function practiceTypeLabel(type: PracticeTypeFilter, t: TFunction): string {
  return t(`journal.practice.type.${type}`);
}

function PracticeActivityRow({
  item,
  t,
}: {
  item: {
    id: string;
    activityType: ReportPracticeActivityType;
    topicTitle: string | null;
    subjectName: string | null;
    occurredAt: string;
  };
  t: TFunction;
}): React.ReactElement {
  const typeLabel = practiceTypeLabel(item.activityType, t);
  const headline = item.topicTitle ?? typeLabel;
  const occurred = new Date(item.occurredAt);
  const dateLabel = Number.isNaN(occurred.getTime())
    ? null
    : occurred.toLocaleDateString();
  const meta = [item.topicTitle ? typeLabel : null, item.subjectName, dateLabel]
    .filter((value): value is string => Boolean(value))
    .join(' · ');

  return (
    <View
      testID={`journal-activity-${item.id}`}
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-body font-semibold text-text-primary">
        {headline}
      </Text>
      {meta ? (
        <Text className="mt-1 text-body-sm text-text-secondary">{meta}</Text>
      ) : null}
    </View>
  );
}

function JournalPracticeSection(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<PracticeTypeFilter>('all');
  const history = usePracticeActivityHistory({
    limit: 50,
    type: typeFilter === 'all' ? undefined : typeFilter,
  });
  const errorActions = useSectionErrorActions(
    history.error,
    () => void history.refetch(),
  );

  const items = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data],
  );

  return (
    <View testID="journal-practice-section" className="gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('journal.practice.openHub')}
        onPress={() => router.push('/(app)/practice' as Href)}
        testID="journal-practice-open-hub"
        className="min-h-[48px] items-center justify-center rounded-button bg-primary px-4 py-3"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {t('journal.practice.openHub')}
        </Text>
      </Pressable>

      <Text className="text-body font-semibold text-text-primary">
        {t('journal.practice.pastActivityTitle')}
      </Text>

      <View
        className="flex-row flex-wrap gap-2"
        testID="journal-practice-filter"
      >
        {PRACTICE_TYPE_FILTERS.map((key) => {
          const selected = typeFilter === key;
          const label = practiceTypeLabel(key, t);
          return (
            <Pressable
              key={key}
              onPress={() => setTypeFilter(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              testID={`journal-practice-filter-${key}`}
              className={`min-h-[36px] justify-center rounded-full px-3 py-1.5 ${
                selected ? 'bg-primary' : 'bg-surface-elevated'
              }`}
            >
              <Text
                className={`text-caption font-semibold ${
                  selected ? 'text-text-inverse' : 'text-text-secondary'
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View testID="journal-practice-past-activity" className="gap-3">
        {history.isLoading && !history.data ? (
          <TimeoutLoader
            isLoading
            testID="journal-practice-loading"
            loadingLabel={t('common.loading')}
            primaryAction={{
              label: t('common.tryAgain'),
              onPress: () => void history.refetch(),
              testID: 'journal-practice-timeout-retry',
            }}
          />
        ) : history.isError && items.length === 0 ? (
          <ErrorFallback
            variant="card"
            testID="journal-practice-error"
            title={t('journal.practice.error')}
            primaryAction={
              errorActions.primary
                ? {
                    ...errorActions.primary,
                    testID: 'journal-practice-error-retry',
                  }
                : {
                    label: t('common.tryAgain'),
                    onPress: () => void history.refetch(),
                    testID: 'journal-practice-error-retry',
                  }
            }
            secondaryAction={errorActions.secondary}
          />
        ) : items.length === 0 ? (
          <EmptyState
            testID="journal-practice-empty"
            title={t('journal.practice.empty')}
            illustration={
              <PracticeReportsEmptyMotif testID="journal-practice-empty-motif" />
            }
          />
        ) : (
          items.map((item) => (
            <PracticeActivityRow key={item.id} item={item} t={t} />
          ))
        )}
      </View>
    </View>
  );
}

function ActiveSection({
  section,
}: {
  section: JournalSectionId;
}): React.ReactElement {
  switch (section) {
    case 'notes':
      return <JournalNotesArchive />;
    case 'sessions':
      return <JournalRecapsSection />;
    case 'practice':
      return <JournalPracticeSection />;
    case 'memory':
      return <JournalMemorySection />;
    case 'reports':
      return <JournalReportsSection />;
  }
}

export function JournalTabView(): React.ReactElement {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] =
    useState<JournalSectionId>('sessions');

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
