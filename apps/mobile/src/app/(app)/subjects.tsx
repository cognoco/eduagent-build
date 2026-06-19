import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';

import { ErrorFallback } from '../../components/common';
import { SubjectsBrowse } from '../../components/subjects/SubjectsBrowse';
import { useSubjectsIndex } from '../../hooks/use-subjects-index';

export default function SubjectsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const subjectsIndex = useSubjectsIndex();

  if (subjectsIndex.isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        testID="subjects-screen"
      >
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (subjectsIndex.isError) {
    return (
      <View className="flex-1 bg-background p-5" testID="subjects-screen">
        <ErrorFallback
          variant="card"
          title={t('subjectsBrowse.errorTitle')}
          message={t('subjectsBrowse.errorMessage')}
          primaryAction={{
            label: t('common.tryAgain'),
            onPress: () => subjectsIndex.refetch(),
            testID: 'subjects-browse-retry',
          }}
          testID="subjects-browse-error"
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="subjects-screen">
      <SubjectsBrowse
        subjects={subjectsIndex.subjects}
        onOpenSubject={(subjectId) =>
          router.push({
            pathname: '/(app)/subject-hub/[subjectId]',
            params: { subjectId },
          } as Href)
        }
        onCreateSubject={() => router.push('/(app)/onboarding' as Href)}
      />
    </View>
  );
}
