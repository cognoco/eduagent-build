import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { WelcomeIntro } from '../../components/welcome/WelcomeIntro';
import { markIntroSeenSync } from '../../lib/intro-state';
import { track } from '../../lib/analytics';

const DEFAULT_REDIRECT = '/(app)/home';

export default function WelcomeRoute(): React.ReactElement | null {
  const router = useRouter();
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const redirectTarget =
    typeof params.redirect === 'string' && params.redirect.length > 0
      ? params.redirect
      : DEFAULT_REDIRECT;

  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (!userId) return;
    if (startedRef.current) return;
    startedRef.current = true;
    track('intro_started', {});
  }, [userId]);

  const handleComplete = React.useCallback(() => {
    if (!userId) return;
    track('intro_completed', {});
    markIntroSeenSync(userId);
    router.replace(redirectTarget as never);
  }, [userId, router, redirectTarget]);

  const handleCardAdvanced = React.useCallback((cardIndex: number) => {
    track('intro_card_advanced', { card: cardIndex });
  }, []);

  if (!userId) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="welcome-auth-loading"
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <WelcomeIntro
      onComplete={handleComplete}
      onCardAdvanced={handleCardAdvanced}
    />
  );
}
