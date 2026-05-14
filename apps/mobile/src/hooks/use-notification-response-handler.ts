import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '../lib/profile';

let notificationHandlerInitialized = false;

export function initNotificationHandler(): void {
  if (notificationHandlerInitialized) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  notificationHandlerInitialized = true;
}

export function useNotificationResponseHandler(): void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();
  const activeProfileRef = useRef(activeProfile);
  activeProfileRef.current = activeProfile;

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, string>
          | undefined;
        if (!data?.type) return;

        if (data.type === 'nudge') {
          const profileId = activeProfileRef.current?.id;
          if (profileId) {
            void queryClient.invalidateQueries({
              queryKey: ['nudges', 'unread', profileId],
            });
          }
          router.push('/(app)/home' as Href);
        }
      },
    );
    return () => sub.remove();
  }, [router, queryClient]);
}
