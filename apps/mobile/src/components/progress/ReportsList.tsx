import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  MonthlyReportSummary,
  WeeklyReportSummary,
} from '@eduagent/schemas';
import { formatShortDate } from '../../lib/format-datetime';

export interface ReportsListProps {
  monthlyReports: MonthlyReportSummary[];
  weeklyReports: WeeklyReportSummary[];
  /**
   * Optional row cap. If set, the combined sorted list is truncated to N rows.
   * Used by the progress-overview screen to show "recent reports" only.
   */
  limit?: number;
  onPressMonthly: (reportId: string) => void;
  onPressWeekly: (reportId: string) => void;
  /**
   * Optional testID prefix for the container element.
   */
  testID?: string;
  /** Whether to show "New" badge for unviewed reports. Defaults to false. */
  showNewBadge?: boolean;
  /**
   * Restricts the "New" badge to a single report row. Pass null to suppress
   * row badges while keeping showNewBadge available for a highlighted summary.
   */
  newReportId?: string | null;
  /**
   * Set to false when ReportsList is embedded inside an outer ScrollView or
   * FlatList to prevent double-scrolling. Defaults to true.
   */
  scrollEnabled?: boolean;
}

type ReportListItem =
  | { kind: 'weekly'; sortDate: string; report: WeeklyReportSummary }
  | { kind: 'monthly'; sortDate: string; report: MonthlyReportSummary };

function formatDateOnly(
  isoDate: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const dateOnly = /^\d{4}-\d{2}$/.test(isoDate) ? `${isoDate}-01` : isoDate;
  return formatShortDate(`${dateOnly}T00:00:00Z`, locale, {
    ...options,
    timeZone: 'UTC',
  });
}

/**
 * Normalize a mixed monthly (YYYY-MM) / daily (YYYY-MM-DD) date string into a
 * comparable YYYY-MM-DD key. Lexicographic compare of mixed formats is wrong:
 *   '2026-04' > '2026-03-31'  (correct by accident)
 *   '2026-04' < '2026-04-01'  (WRONG — they should be equal-or-equivalent)
 * Padding the month-only form to its first day makes localeCompare safe.
 */
function toSortKey(date: string): string {
  return /^\d{4}-\d{2}$/.test(date) ? `${date}-01` : date;
}

function ReportRow({
  item,
  showNewBadge,
  newReportId,
  onPressMonthly,
  onPressWeekly,
  t,
  locale,
}: {
  item: ReportListItem;
  showNewBadge: boolean;
  newReportId: string | null | undefined;
  onPressMonthly: (id: string) => void;
  onPressWeekly: (id: string) => void;
  t: TFunction;
  locale: string | undefined;
}): React.ReactElement {
  const title =
    item.kind === 'weekly'
      ? `${t('parentView.reports.weekOf')} ${formatDateOnly(
          item.report.reportWeek,
          locale,
          {
            month: 'short',
            day: 'numeric',
          },
        )}`
      : formatDateOnly(item.report.reportMonth, locale, {
          month: 'long',
          year: 'numeric',
        });

  /**
   * Row testIDs emitted by this component:
   *   - weekly rows:  `weekly-report-card-{id}`   (preserved from child/reports e2e flow)
   *   - monthly rows: `report-card-{id}`          (preserved from child/reports)
   *
   * NOTE: the deleted `progress/reports/index.tsx` inline rows used
   * `progress-report-row-{id}`. That pattern is INTENTIONALLY NOT
   * emitted here — grep confirms no test or e2e flow targets it
   * (CCR finding, 2026-05-14). If a future flow needs it, accept a
   * `rowTestIDFactory` prop on this component instead of hard-coding
   * a third pattern. The container `progress-report-rows` testID
   * still wraps the list on the progress full-list screen.
   */
  const rowTestID =
    item.kind === 'weekly'
      ? `weekly-report-card-${item.report.id}`
      : `report-card-${item.report.id}`;
  const canShowNewBadge =
    newReportId === undefined
      ? !item.report.viewedAt
      : newReportId === item.report.id && !item.report.viewedAt;

  return (
    <Pressable
      onPress={() =>
        item.kind === 'weekly'
          ? onPressWeekly(item.report.id)
          : onPressMonthly(item.report.id)
      }
      className="bg-surface rounded-card p-4 mt-4"
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${item.report.headlineStat.label}: ${item.report.headlineStat.value}`}
      testID={rowTestID}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 me-3">
          <Text className="text-body font-semibold text-text-primary">
            {title}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {item.report.headlineStat.label}: {item.report.headlineStat.value}
          </Text>
          <Text className="text-caption text-text-secondary mt-1">
            {item.report.headlineStat.comparison}
          </Text>
        </View>
        {showNewBadge && canShowNewBadge ? (
          <View
            className="bg-accent/15 rounded-full px-3 py-1"
            testID="parentView.reports.newBadge"
          >
            <Text className="text-caption font-semibold text-accent">
              {t('parentView.reports.newBadge')}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ReportsList({
  monthlyReports,
  weeklyReports,
  limit,
  onPressMonthly,
  onPressWeekly,
  testID,
  showNewBadge = false,
  newReportId,
  scrollEnabled = true,
}: ReportsListProps): React.ReactElement {
  const { t, i18n } = useTranslation();

  const allItems: ReportListItem[] = useMemo(
    () =>
      [
        ...weeklyReports.map((report) => ({
          kind: 'weekly' as const,
          report,
          sortDate: report.reportWeek,
        })),
        ...monthlyReports.map((report) => ({
          kind: 'monthly' as const,
          report,
          sortDate: report.reportMonth,
        })),
      ].sort((a, b) =>
        toSortKey(b.sortDate).localeCompare(toSortKey(a.sortDate)),
      ),
    [monthlyReports, weeklyReports],
  );

  const reportItems = limit !== undefined ? allItems.slice(0, limit) : allItems;
  const isEmpty = monthlyReports.length === 0 && weeklyReports.length === 0;

  const keyExtractor = useCallback(
    (item: ReportListItem) => `${item.kind}-${item.report.id}`,
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: ReportListItem }) => (
      <ReportRow
        item={item}
        showNewBadge={showNewBadge}
        newReportId={newReportId}
        onPressMonthly={onPressMonthly}
        onPressWeekly={onPressWeekly}
        t={t}
        locale={i18n?.language}
      />
    ),
    [
      showNewBadge,
      newReportId,
      onPressMonthly,
      onPressWeekly,
      t,
      i18n?.language,
    ],
  );

  if (isEmpty) {
    return (
      <View testID={testID ?? 'reports-list'}>
        <Text
          className="text-body-sm text-text-secondary mt-2"
          testID="reports-list-empty"
        >
          {t('parentView.index.firstReportSoon')}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      testID={testID ?? 'reports-list'}
      data={reportItems}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      scrollEnabled={scrollEnabled}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews
    />
  );
}
