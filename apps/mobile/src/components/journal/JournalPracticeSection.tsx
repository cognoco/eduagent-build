import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter, type Href } from 'expo-router';
import type { ReportPracticeActivityType } from '@eduagent/schemas';

import { ErrorFallback, TimeoutLoader } from '../common';
import { JOURNAL_RETURN_TO } from '../../lib/navigation';
import { usePracticeActivityHistory } from '../../hooks/use-practice-activity-history';
import {
  EmptyState,
  PracticeReportsEmptyMotif,
  useSectionErrorActions,
} from './journal-shared';

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

export function JournalPracticeSection(): React.ReactElement {
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
        onPress={() =>
          router.push({
            pathname: '/(app)/practice',
            params: { returnTo: JOURNAL_RETURN_TO },
          } as Href)
        }
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
