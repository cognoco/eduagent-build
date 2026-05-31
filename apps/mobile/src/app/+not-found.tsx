import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorFallback } from '../components/common/ErrorFallback';

// Expo Router catch-all — gives unknown routes an actionable escape instead of a dead-end.
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
