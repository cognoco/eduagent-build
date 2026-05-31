import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from '../components/common/ErrorFallback';

/**
 * Expo Router catch-all for unknown routes. Without this file, navigating to a
 * malformed or removed route renders Expo's built-in fallback (a stack trace in
 * dev, blank in prod) with no actionable escape — a UX dead-end.
 *
 * Default exports are reserved for Expo Router page components — this is one of
 * them (CLAUDE.md "Repo-Specific Guardrails").
 */
export default function NotFoundScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();

  const onGoHome = (): void => {
    router.replace('/(app)/home' as Href);
  };

  const onGoBack = (): void => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/home' as Href);
  };

  return (
    <View className="flex-1 bg-background" testID="not-found-screen">
      <ErrorFallback
        variant="centered"
        title={t('errorBoundary.title')}
        message={t('errors.notFound')}
        primaryAction={{
          label: t('recovery.goHome'),
          onPress: onGoHome,
          testID: 'not-found-go-home',
        }}
        secondaryAction={{
          label: t('recovery.goBack'),
          onPress: onGoBack,
          testID: 'not-found-go-back',
        }}
        testID="not-found-fallback"
      />
    </View>
  );
}
