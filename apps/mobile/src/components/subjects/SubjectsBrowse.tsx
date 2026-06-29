import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SubjectIndexItem } from '../../hooks/use-subjects-index';

interface SubjectsBrowseProps {
  subjects: readonly SubjectIndexItem[];
  onOpenSubject: (subjectId: string) => void;
  onCreateSubject: () => void;
}

export function SubjectsBrowse({
  subjects,
  onOpenSubject,
  onCreateSubject,
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

  return (
    <ScrollView className="flex-1 bg-bg px-5 py-4">
      <Text className="text-h2 font-semibold text-text-primary">
        {t('subjectsBrowse.title')}
      </Text>
      <Text className="mt-1 text-body-sm text-text-secondary">
        {t('subjectsBrowse.subtitle')}
      </Text>
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
        <View className="mt-3 gap-3">
          {filteredSubjects.map((subject) => (
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
              {subject.dueReviews > 0 ? (
                <Text className="mt-2 text-caption font-semibold text-warning">
                  {t('subjectsBrowse.reviewsDue', {
                    count: subject.dueReviews,
                  })}
                </Text>
              ) : null}
            </Pressable>
          ))}
          {/* Add-subject affordance on the populated path: without it a learner
              with ≥1 subject has no way to start a second one without going back
              through onboarding (WI-1119). Same testID/handler as the empty
              state — only one branch renders per state, so it is never a dup. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('subjectsBrowse.createSubject')}
            className="min-h-[48px] justify-center rounded-card border border-border bg-surface px-4"
            onPress={onCreateSubject}
            testID="subjects-browse-create"
          >
            <Text className="text-center text-body font-semibold text-primary">
              {t('subjectsBrowse.createSubject')}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
