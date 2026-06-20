import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';

import { ErrorFallback } from '../../components/common';
import {
  PersonScopeStructuralSubjects,
  SupportHubSubjectsTab,
} from '../../components/support';
import { SubjectsBrowse } from '../../components/subjects/SubjectsBrowse';
import { useSubjectsIndex } from '../../hooks/use-subjects-index';
import { useScopeContext } from '../../lib/scope-context';

export default function SubjectsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeScope, availableScopes, setActiveScope } = useScopeContext();
  const subjectsIndex = useSubjectsIndex();

  if (activeScope.kind === 'supporter-hub') {
    return (
      <SupportHubSubjectsTab
        personScopes={availableScopes.filter(
          (scope) => scope.kind === 'person',
        )}
        onOpenPersonScope={setActiveScope}
      />
    );
  }

  if (activeScope.kind === 'person') {
    return <PersonScopeStructuralSubjects scope={activeScope} />;
  }

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
