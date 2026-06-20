import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter, type Href } from 'expo-router';
import type { NowCard, RecapListItem } from '@eduagent/schemas';

import { ReportsList } from '../progress/ReportsList';
import { useAllNotes } from '../../hooks/use-notes';
import { useBookmarks } from '../../hooks/use-bookmarks';
import { useJournalRecaps } from '../../hooks/use-journal-recaps';
import {
  useProfileReports,
  useProfileSessionsArchive,
  useProfileWeeklyReports,
} from '../../hooks/use-progress';
import { useNowFeed } from '../../hooks/use-now-feed';
import { pushNowDeepLink } from '../../lib/now-deep-link';
import { useProfile } from '../../lib/profile';
import { buildSessionDetailHref } from '../../lib/session-detail-navigation';

type JournalSectionId = 'recaps' | 'reports' | 'notes' | 'memory';

const JOURNAL_SECTIONS: JournalSectionId[] = [
  'recaps',
  'reports',
  'notes',
  'memory',
];

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

function notesTitle(
  kind: 'sessions' | 'notes' | 'bookmarks',
  t: TFunction,
): string {
  switch (kind) {
    case 'sessions':
      return t('myNotes.kinds.sessions');
    case 'notes':
      return t('myNotes.kinds.notes');
    case 'bookmarks':
      return t('myNotes.kinds.bookmarks');
  }
}

function notesDescription(
  kind: 'sessions' | 'notes' | 'bookmarks',
  t: TFunction,
): string {
  switch (kind) {
    case 'sessions':
      return t('journal.notes.sessions');
    case 'notes':
      return t('journal.notes.notes');
    case 'bookmarks':
      return t('journal.notes.bookmarks');
  }
}

function JournalMomentsStrip(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const nowFeed = useNowFeed();
  const moments =
    nowFeed.data?.cards.filter((card) => card.kind === 'ledger_moment') ?? [];

  if (nowFeed.isLoading && !nowFeed.data) {
    return (
      <View
        testID="journal-moments-loading"
        className="rounded-card border border-border bg-surface p-4"
      >
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (nowFeed.isError && moments.length === 0) {
    return (
      <View
        testID="journal-moments-error"
        className="rounded-card border border-border bg-surface p-4"
      >
        <Text className="text-body font-semibold text-text-primary">
          {t('journal.moments.errorTitle')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void nowFeed.refetch()}
          testID="journal-moments-retry"
          className="mt-3 self-start rounded-button bg-primary px-4 py-2"
        >
          <Text className="text-body-sm font-semibold text-text-inverse">
            {t('common.tryAgain')}
          </Text>
        </Pressable>
      </View>
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

function RetryState({
  testID,
  title,
  onRetry,
}: {
  testID: string;
  title: string;
  onRetry: () => void;
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <View
      testID={testID}
      className="rounded-card border border-border bg-surface p-4"
    >
      <Text className="text-body font-semibold text-text-primary">{title}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="mt-3 self-start rounded-button bg-primary px-4 py-2"
        testID={`${testID}-retry`}
      >
        <Text className="text-body-sm font-semibold text-text-inverse">
          {t('common.tryAgain')}
        </Text>
      </Pressable>
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

  if (recaps.isLoading && !recaps.data) {
    return (
      <View className="py-8" testID="journal-recaps-loading">
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (recaps.isError && !recaps.data) {
    return (
      <RetryState
        testID="journal-recaps-error"
        title={t('journal.recaps.error')}
        onRetry={() => void recaps.refetch()}
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

  if (isLoading) {
    return (
      <View className="py-8" testID="journal-reports-loading">
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (isError && !monthlyReports.data && !weeklyReports.data) {
    return (
      <RetryState
        testID="journal-reports-error"
        title={t('journal.reports.error')}
        onRetry={() => {
          void monthlyReports.refetch();
          void weeklyReports.refetch();
        }}
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

function previewCount(value: number | undefined): string {
  return value == null ? '-' : String(value);
}

function previewText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function ArchivePreviewList({
  values,
}: {
  values: string[];
}): React.ReactElement | null {
  if (values.length === 0) return null;
  return (
    <View className="mt-3 gap-2">
      {values.slice(0, 3).map((value, index) => (
        <Text
          key={`${index}:${value}`}
          className="text-body-sm text-text-primary"
          numberOfLines={2}
        >
          {value}
        </Text>
      ))}
    </View>
  );
}

function JournalNotesSection(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeProfile } = useProfile();
  const sessions = useProfileSessionsArchive(activeProfile?.id, { limit: 5 });
  const notes = useAllNotes({ limit: 5 });
  const bookmarks = useBookmarks({ limit: 5 });

  const sessionItems = useMemo(
    () => sessions.data?.pages.flatMap((page) => page.sessions) ?? [],
    [sessions.data],
  );
  const noteItems = useMemo(
    () => notes.data?.pages.flatMap((page) => page.notes) ?? [],
    [notes.data],
  );
  const bookmarkItems = useMemo(
    () => bookmarks.data?.pages.flatMap((page) => page.bookmarks) ?? [],
    [bookmarks.data],
  );

  const rows: Array<{
    id: 'sessions' | 'notes' | 'bookmarks';
    count: number | undefined;
    previews: string[];
  }> = [
    {
      id: 'sessions',
      count: sessions.data ? sessionItems.length : undefined,
      previews: sessionItems
        .map(
          (session) =>
            previewText(session.displayTitle) ??
            previewText(session.topicTitle) ??
            previewText(session.displaySummary),
        )
        .filter((value): value is string => value != null),
    },
    {
      id: 'notes',
      count: notes.data ? noteItems.length : undefined,
      previews: noteItems
        .map((note) => previewText(note.content))
        .filter((value): value is string => value != null),
    },
    {
      id: 'bookmarks',
      count: bookmarks.data ? bookmarkItems.length : undefined,
      previews: bookmarkItems
        .map((bookmark) => previewText(bookmark.content))
        .filter((value): value is string => value != null),
    },
  ];

  return (
    <View testID="journal-notes-section" className="gap-3">
      {rows.map((row) => (
        <Pressable
          key={row.id}
          accessibilityRole="button"
          accessibilityLabel={notesTitle(row.id, t)}
          onPress={() =>
            router.push({
              pathname: '/(app)/my-notes/[kind]',
              params: { kind: row.id, returnTo: 'journal' },
            } as Href)
          }
          testID={`journal-notes-${row.id}`}
          className="rounded-card border border-border bg-surface p-4"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pe-3">
              <Text className="text-body font-semibold text-text-primary">
                {notesTitle(row.id, t)}
              </Text>
              <Text className="mt-1 text-body-sm text-text-secondary">
                {notesDescription(row.id, t)}
              </Text>
            </View>
            <View className="rounded-full bg-surface-elevated px-3 py-1">
              <Text className="text-body-sm font-semibold text-text-primary">
                {previewCount(row.count)}
              </Text>
            </View>
          </View>
          <ArchivePreviewList values={row.previews} />
        </Pressable>
      ))}
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
      return <JournalNotesSection />;
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
