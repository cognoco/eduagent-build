import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { WelcomeIntro } from '../../components/welcome/WelcomeIntro';
import { markIntroSeenSync } from '../../lib/intro-state';
import { track } from '../../lib/analytics';

const DEFAULT_REDIRECT = '/(app)/home';

export default function WelcomeRoute(): React.ReactElement | null {
  const router = useRouter();
  const { user } = useUser();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const redirectTarget =
    typeof params.redirect === 'string' && params.redirect.length > 0
      ? params.redirect
      : DEFAULT_REDIRECT;

  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('intro_started', {});
  }, []);

  const handleComplete = React.useCallback(() => {
    const userId = user?.id;
    if (!userId) return;
    track('intro_completed', {});
    markIntroSeenSync(userId);
    router.replace(redirectTarget as never);
  }, [user?.id, router, redirectTarget]);

  const handleCardAdvanced = React.useCallback((cardIndex: number) => {
    track('intro_card_advanced', { card: cardIndex });
  }, []);

  if (!user?.id) return null;

  return (
    <WelcomeIntro
      onComplete={handleComplete}
      onCardAdvanced={handleCardAdvanced}
    />
  );
}
