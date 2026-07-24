import React, { useCallback } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';

import { ErrorFallback } from '../../components/common';
import {
  PersonScopeStructuralSubjects,
  SupportHubSubjectsTab,
} from '../../components/support';
import { SubjectsBrowse } from '../../components/subjects/SubjectsBrowse';
import {
  useEligibleManagedPersons,
  type EligibleManagedPerson,
} from '../../hooks/use-eligible-supportees';
import { useSubjectsIndex } from '../../hooks/use-subjects-index';
import {
  pushAddChildForSupport,
  pushLinkInitiateForManagedPerson,
  pushLinkInitiatePicker,
  SUBJECTS_RETURN_TO,
} from '../../lib/navigation';
import { markSubjectsToHubTransition } from '../../lib/navigation-transition-provenance';
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { useScopeContext } from '../../lib/scope-context';
import { buildSessionDetailHref } from '../../lib/session-detail-navigation';

export default function SubjectsScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeScope, availableScopes, setActiveScope } = useScopeContext();
  const subjectsIndex = useSubjectsIndex({
    includeInactive: FEATURE_FLAGS.MODE_NAV_V2_ENABLED,
  });
  const eligiblePersons = useEligibleManagedPersons();

  // Navigation handlers wired to search results from cross-entity library search.
  // Mirror the pattern used by library.tsx for consistency.
  const handleBookPress = useCallback(
    (subjectId: string, bookId: string) => {
      // Per repo guardrail: push the full ancestor chain so router.back() works.
      router.push({
        pathname: '/(app)/shelf/[subjectId]',
        params: { subjectId },
      } as Href);
      router.push({
        pathname: '/(app)/shelf/[subjectId]/book/[bookId]',
        params: { subjectId, bookId },
      } as Href);
    },
    [router],
  );

  const handleTopicPress = useCallback(
    (topicId: string, subjectId: string, bookId: string) => {
      router.push({
        pathname: '/(app)/topic/[topicId]',
        params: { topicId, subjectId, bookId },
      } as Href);
    },
    [router],
  );

  const handleNotePress = useCallback(
    (topicId: string, subjectId: string, bookId: string) => {
      // Notes live on the topic screen; navigate there.
      router.push({
        pathname: '/(app)/topic/[topicId]',
        params: { topicId, subjectId, bookId },
      } as Href);
    },
    [router],
  );

  const handleSessionPress = useCallback(
    (sessionId: string, subjectId: string, topicId: string | null) => {
      router.push(buildSessionDetailHref({ sessionId, subjectId, topicId }));
    },
    [router],
  );

  if (activeScope.kind === 'supporter-hub') {
    const handleSelectEligiblePerson = (person: EligibleManagedPerson): void =>
      pushLinkInitiateForManagedPerson(router, person);
    const handleAddChildFallback = (): void => pushAddChildForSupport(router);
    const handleSelectExistingTeen = (): void => pushLinkInitiatePicker(router);

    return (
      <SupportHubSubjectsTab
        personScopes={availableScopes.filter(
          (scope) => scope.kind === 'person',
        )}
        onOpenPersonScope={setActiveScope}
        eligiblePersons={eligiblePersons}
        onSelectEligiblePerson={handleSelectEligiblePerson}
        onAddChildFallback={handleAddChildFallback}
        onSelectExistingTeen={handleSelectExistingTeen}
      />
    );
  }

  if (activeScope.kind === 'person') {
    return <PersonScopeStructuralSubjects scope={activeScope} />;
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
        isLoading={subjectsIndex.isLoading}
        onOpenSubject={(subjectId) => {
          markSubjectsToHubTransition(subjectId);
          router.push({
            pathname: '/(app)/subject-hub/[subjectId]',
            params: { subjectId },
          } as Href);
        }}
        onCreateSubject={() =>
          router.push({
            pathname: '/create-subject',
            params: { returnTo: SUBJECTS_RETURN_TO },
          } as Href)
        }
        onBookPress={handleBookPress}
        onTopicPress={handleTopicPress}
        onNotePress={handleNotePress}
        onSessionPress={handleSessionPress}
      />
    </View>
  );
}
