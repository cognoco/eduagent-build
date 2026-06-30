import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SubjectStatus } from '@eduagent/schemas';

import { ShimmerSkeleton } from '../common/ShimmerSkeleton';
import type { SubjectIndexItem } from '../../hooks/use-subjects-index';

interface SubjectsBrowseProps {
  subjects: readonly SubjectIndexItem[];
  onOpenSubject: (subjectId: string) => void;
  onCreateSubject: () => void;
  isLoading?: boolean;
}

// Render order for the status groups; empty groups are omitted at render time.
const STATUS_ORDER: SubjectStatus[] = ['active', 'paused', 'archived'];

export function SubjectsBrowse({
  subjects,
  onOpenSubject,
  onCreateSubject,
  isLoading = false,
}: SubjectsBrowseProps): React.ReactElement {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const filteredSubjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return subjects;
    return subjects.filter((subject) =>
      subject.subjectName.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [query, subjects]);

  // Group by status in STATUS_ORDER; within each group, non-expired
  // urgency-boost subjects sort first (stable — Array.sort preserves order for
  // equal keys, so non-urgent peers keep their incoming order).
  // `now` is captured at memo time (deps: filteredSubjects); a boost that expires
  // while the screen sits idle re-evaluates on the next list change / remount —
  // acceptable, since subjects don't mutate under a stationary viewer.
  const groups = useMemo(() => {
    const now = Date.now();
    const isUrgent = (subject: SubjectIndexItem) =>
      subject.urgencyBoostUntil != null &&
      Date.parse(subject.urgencyBoostUntil) > now;
    return STATUS_ORDER.map((status) => ({
      status,
      items: filteredSubjects
        .filter((subject) => subject.status === status)
        .slice()
        .sort((a, b) => Number(isUrgent(b)) - Number(isUrgent(a))),
    })).filter((group) => group.items.length > 0);
  }, [filteredSubjects]);

  // Literal t() calls per status (not a dynamic map lookup) so the i18n
  // orphan-key AST walker sees every section key statically.
  const sectionLabel = (status: SubjectStatus): string => {
    switch (status) {
      case 'active':
        return t('subjectsBrowse.sectionActive');
      case 'paused':
        return t('subjectsBrowse.sectionPaused');
      case 'archived':
        return t('subjectsBrowse.sectionArchived');
    }
  };

  return (
    <ScrollView className="flex-1 bg-bg px-5 py-4">
      <Text className="text-h2 font-semibold text-text-primary">
        {t('subjectsBrowse.title')}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('subjectsBrowse.subtitle')}
      </Text>

      {isLoading ? (
        <View
          testID="subjects-browse-skeleton"
          accessibilityRole="progressbar"
          accessibilityLabel={t('common.loading')}
          className="mt-4 gap-3"
        >
          <ShimmerSkeleton testID="subjects-browse-skeleton-shimmer">
            {[0, 1, 2].map((row) => (
              <View
                key={row}
                className="mb-3 rounded-card bg-coaching-card p-4"
              >
                <View className="h-5 w-1/2 rounded bg-border" />
                <View className="mt-2 h-4 w-3/4 rounded bg-border" />
              </View>
            ))}
          </ShimmerSkeleton>
        </View>
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('subjectsBrowse.searchPlaceholder')}
            className="mt-4 rounded-card border border-border bg-surface px-4 py-3 text-body text-text-primary"
            testID="subjects-browse-search"
          />
          <Text className="mt-4 text-body font-semibold text-text-secondary">
            {t('subjectsBrowse.showEverything')}
          </Text>

          {subjects.length === 0 ? (
            <View className="mt-8 rounded-card bg-coaching-card p-5">
              <Text className="text-h3 font-semibold text-text-primary">
                {t('subjectsBrowse.emptyTitle')}
              </Text>
              <Text className="mt-2 text-body text-text-secondary">
                {t('subjectsBrowse.emptyMessage')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('subjectsBrowse.createSubject')}
                className="mt-4 min-h-[48px] justify-center rounded-button bg-primary px-4"
                onPress={onCreateSubject}
                testID="subjects-browse-create"
              >
                <Text className="text-center text-body font-semibold text-text-inverse">
                  {t('subjectsBrowse.createSubject')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {groups.map((group) => (
                <View key={group.status} className="mt-5">
                  <Text
                    testID={`subjects-browse-section-${group.status}`}
                    className="text-caption font-semibold uppercase text-text-secondary"
                  >
                    {sectionLabel(group.status)}
                  </Text>
                  <View className="mt-3 gap-3">
                    {group.items.map((subject) => (
                      <Pressable
                        key={subject.subjectId}
                        accessibilityRole="button"
                        accessibilityLabel={t('subjectsBrowse.openSubject')}
                        className="rounded-card bg-coaching-card p-4"
                        onPress={() => onOpenSubject(subject.subjectId)}
                        testID={`subjects-browse-row-${subject.subjectId}`}
                      >
                        <Text className="text-h3 font-semibold text-text-primary">
                          {subject.subjectName}
                        </Text>
                        <Text className="mt-1 text-body text-text-secondary">
                          {t('subjectsBrowse.subjectProgress', {
                            mastered: subject.mastered,
                            learning: subject.learning,
                            total: subject.total,
                          })}
                        </Text>
                        <Text className="mt-1 text-caption text-text-secondary">
                          {t('subjectsBrowse.bookCount', {
                            count: subject.books.length,
                          })}
                        </Text>
                        {subject.dueReviews > 0 ? (
                          <Text className="mt-2 text-caption font-semibold text-warning">
                            {t('subjectsBrowse.reviewsDue', {
                              count: subject.dueReviews,
                            })}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
              {/* Add-subject affordance on the populated path: without it a
                  learner with ≥1 subject has no way to start a second one
                  without going back through onboarding (WI-1119). Same
                  testID/handler as the empty state — only one branch renders
                  per state, so it is never a dup. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('subjectsBrowse.createSubject')}
                className="mt-4 min-h-[48px] justify-center rounded-card border border-border bg-surface px-4"
                onPress={onCreateSubject}
                testID="subjects-browse-create"
              >
                <Text className="text-center text-body font-semibold text-primary">
                  {t('subjectsBrowse.createSubject')}
                </Text>
              </Pressable>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
