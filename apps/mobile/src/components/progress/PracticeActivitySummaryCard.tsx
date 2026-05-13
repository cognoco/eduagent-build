import type React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type {
  ReportPracticeSummary,
  ReportPracticeTypeBreakdown,
} from '@eduagent/schemas';

function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatAccuracy(accuracy: number | null): string | null {
  if (accuracy === null) return null;
  return `${Math.round(accuracy * 100)}%`;
}

function fallbackLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatActivityLabel(
  activity: Pick<
    ReportPracticeTypeBreakdown,
    'activityType' | 'activitySubtype'
  >,
  t: (key: string) => string,
): string {
  const subtype = activity.activitySubtype;
  if (subtype) {
    const subtypeKey = `parentView.practiceSummary.activitySubtypes.${subtype}`;
    const subtypeLabel = t(subtypeKey);
    if (subtypeLabel !== subtypeKey) return subtypeLabel;
    return fallbackLabel(subtype);
  }

  const typeKey = `parentView.practiceSummary.activityTypes.${activity.activityType}`;
  const typeLabel = t(typeKey);
  if (typeLabel !== typeKey) return typeLabel;
  return fallbackLabel(activity.activityType);
}

function buildTypeDetail(
  activity: ReportPracticeTypeBreakdown,
  t: (key: string, options?: Record<string, number>) => string,
): string {
  if (activity.scoredActivities > 0 && activity.total > 0) {
    return t('parentView.practiceSummary.typeDetailWithScore', {
      count: activity.count,
      points: activity.pointsEarned,
      accuracy: Math.round((activity.score / activity.total) * 100),
    });
  }

  return t('parentView.practiceSummary.typeDetail', {
    count: activity.count,
    points: activity.pointsEarned,
  });
}

function buildSubjectTypeSummary(
  byType: ReportPracticeTypeBreakdown[],
  t: (key: string) => string,
): string {
  return byType
    .slice(0, 3)
    .map((activity) => {
      const label = formatActivityLabel(activity, t);
      return `${label} ${activity.count}`;
    })
    .join(' · ');
}

export function PracticeActivitySummaryCard({
  summary,
  testID,
}: {
  summary?: ReportPracticeSummary;
  testID?: string;
}): React.ReactElement | null {
  const { t } = useTranslation();
  const totals = summary?.totals;

  if (!summary || !totals || totals.activitiesCompleted === 0) {
    return null;
  }

  const accuracy = formatAccuracy(summary.scores.accuracy);
  const comparison = summary.comparison?.delta;
  const hasComparisonDelta =
    !!comparison &&
    (comparison.activitiesCompleted !== 0 ||
      comparison.pointsEarned !== 0 ||
      comparison.celebrations !== 0);
  const visibleTypes = summary.byType.slice(0, 6);
  const visibleSubjects = summary.bySubject.slice(0, 4);

  return (
    <View className="bg-surface rounded-card p-4 mt-4" testID={testID}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-h3 font-semibold text-text-primary">
            {t('parentView.practiceSummary.title')}
          </Text>
          <Text className="text-body-sm text-text-secondary mt-1">
            {t('parentView.practiceSummary.subtitle', {
              count: totals.activitiesCompleted,
              reviews: totals.reviewsCompleted,
            })}
          </Text>
        </View>
        {accuracy ? (
          <View className="items-end">
            <Text className="text-caption text-text-secondary">
              {t('parentView.practiceSummary.accuracy')}
            </Text>
            <Text className="text-h3 font-semibold text-text-primary mt-1">
              {accuracy}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-2 mt-4">
        <SummaryPill
          label={t('parentView.practiceSummary.reviews')}
          value={String(totals.reviewsCompleted)}
        />
        <SummaryPill
          label={t('parentView.practiceSummary.points')}
          value={String(totals.pointsEarned)}
        />
        <SummaryPill
          label={t('parentView.practiceSummary.celebrations')}
          value={String(totals.celebrations)}
        />
        <SummaryPill
          label={t('parentView.practiceSummary.activityKinds')}
          value={String(totals.distinctActivityTypes)}
        />
      </View>

      {hasComparisonDelta ? (
        <Text className="text-caption text-text-secondary mt-3">
          {t('parentView.practiceSummary.comparison', {
            activities: formatSigned(comparison.activitiesCompleted),
            points: formatSigned(comparison.pointsEarned),
            celebrations: formatSigned(comparison.celebrations),
          })}
        </Text>
      ) : null}

      {visibleTypes.length > 0 ? (
        <View className="mt-4">
          <Text className="text-caption font-semibold text-text-secondary uppercase">
            {t('parentView.practiceSummary.byType')}
          </Text>
          <View className="mt-2">
            {visibleTypes.map((activity) => (
              <DetailRow
                key={`${activity.activityType}:${activity.activitySubtype ?? 'all'}`}
                label={formatActivityLabel(activity, t)}
                detail={buildTypeDetail(activity, t)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {visibleSubjects.length > 0 ? (
        <View className="mt-4">
          <Text className="text-caption font-semibold text-text-secondary uppercase">
            {t('parentView.practiceSummary.bySubject')}
          </Text>
          <View className="mt-2">
            {visibleSubjects.map((subject) => (
              <DetailRow
                key={subject.subjectId}
                label={
                  subject.subjectName ??
                  t('parentView.practiceSummary.unknownSubject')
                }
                detail={t('parentView.practiceSummary.subjectDetail', {
                  count: subject.count,
                  points: subject.pointsEarned,
                  types: buildSubjectTypeSummary(subject.byType, t),
                })}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <View className="border border-border rounded-card px-3 py-2">
      <Text className="text-caption text-text-secondary">{label}</Text>
      <Text className="text-body font-semibold text-text-primary mt-0.5">
        {value}
      </Text>
    </View>
  );
}

function DetailRow({
  label,
  detail,
}: {
  label: string;
  detail: string;
}): React.ReactElement {
  return (
    <View className="border-t border-border py-3">
      <Text className="text-body font-semibold text-text-primary">{label}</Text>
      <Text className="text-body-sm text-text-secondary mt-1">{detail}</Text>
    </View>
  );
}
