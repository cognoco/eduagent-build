import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';

import { QueryStateView } from '../common';
import { useSupporterColdStart } from '../../hooks/use-supporter-coldstart';
import { useScopeContext } from '../../lib/scope-context';

export function SupporterSelfLearningDoorway(): React.ReactElement | null {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeScope, setActiveScope } = useScopeContext();
  const query = useSupporterColdStart();

  if (activeScope.kind !== 'supporter-hub') {
    return null;
  }

  // Both `mentor.tsx` and `subjects.tsx` render the Support hub view whenever
  // `activeScope.kind === 'supporter-hub'`, regardless of which route is
  // pushed — so a bare `router.push` would leave the supporter looking at
  // their own tab bar. Switch into the `me` scope first; `setActiveScope`
  // treats `me` as always valid for a supporter (see scope-context.tsx),
  // even on a first tap before the server has any real learning state to
  // report — mentor.tsx renders its normal first-time cold-start view in
  // that case, same as any brand-new learner account.
  const handlePress = () => {
    setActiveScope({ kind: 'me' });
    router.push('/(app)/mentor' as Href);
  };

  return (
    <QueryStateView
      isLoading={query.isLoading}
      error={query.isError ? true : undefined}
      loadingTitle={t('supporterSelfLearningDoorway.loadingTitle')}
      errorTitle={t('supporterSelfLearningDoorway.errorTitle')}
      errorMessage={t('supporterSelfLearningDoorway.errorMessage')}
      retry={{
        onPress: () => void query.refetch(),
        testID: 'supporter-self-learning-doorway-retry',
      }}
      testID="supporter-self-learning-doorway-error"
    >
      {query.data ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('supporterSelfLearningDoorway.cta')}
          onPress={handlePress}
          className="rounded-card border border-border bg-surface p-4"
          testID="supporter-self-learning-doorway"
        >
          <Text className="text-h3 font-semibold text-text-primary">
            {t('supporterSelfLearningDoorway.cta')}
          </Text>
          <Text className="mt-1 text-body-sm text-text-secondary">
            {t('supporterSelfLearningDoorway.hint')}
          </Text>
        </Pressable>
      ) : null}
    </QueryStateView>
  );
}
