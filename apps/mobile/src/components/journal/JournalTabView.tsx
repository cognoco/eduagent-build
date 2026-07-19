import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter, type Href } from 'expo-router';

import { ErrorFallback, TimeoutLoader } from '../common';
import { BookPageFlipAnimation } from '../common/BookPageFlipAnimation';
import { RecapsEmptyState } from '../recaps/RecapsEmptyState';
import { ReportsList } from '../progress/ReportsList';
import { LatestReportCard } from '../../app/(app)/progress/_components/LatestReportCard';
import { getLatestReport } from '../../app/(app)/progress/_view-models/progress-report-helpers';
import { useJournalRecaps } from '../../hooks/use-journal-recaps';
import { useMyReports, useMyWeeklyReports } from '../../hooks/use-my-reports';
import { JournalMomentsStrip } from './JournalMomentsStrip';
import { JournalSegmentedControl } from './JournalSegmentedControl';
import { JournalNotesArchive } from './JournalNotesArchive';
import { JournalPracticeSection } from './JournalPracticeSection';
import { RecapRow } from './RecapRow';
import { JOURNAL_RETURN_TO } from '../../lib/navigation';
import {
  PracticeReportsEmptyMotif,
  useSectionErrorActions,
  type JournalSectionId,
} from './journal-shared';

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
  const isSettled = !monthlyReports.isLoading && !weeklyReports.isLoading;
  const openLatestReport = () => {
    if (!latestReport) return;
    if (latestReport.kind === 'weekly') {
      router.push({
        pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
        params: {
          weeklyReportId: latestReport.report.id,
          returnTo: JOURNAL_RETURN_TO,
        },
      } as Href);
    } else {
      router.push({
        pathname: '/(app)/progress/reports/[reportId]',
        params: {
          reportId: latestReport.report.id,
          returnTo: JOURNAL_RETURN_TO,
        },
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

  if (isError && !hasAnyReports) {
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
      {isSettled && !hasAnyReports && !isError ? (
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
        showEmptyState={false}
        testID="journal-reports-list"
        onPressMonthly={(reportId) =>
          router.push({
            pathname: '/(app)/progress/reports/[reportId]',
            params: { reportId, returnTo: JOURNAL_RETURN_TO },
          } as Href)
        }
        onPressWeekly={(weeklyReportId) =>
          router.push({
            pathname: '/(app)/progress/weekly-report/[weeklyReportId]',
            params: { weeklyReportId, returnTo: JOURNAL_RETURN_TO },
          } as Href)
        }
      />
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
