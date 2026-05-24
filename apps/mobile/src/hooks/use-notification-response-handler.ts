import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigationDataScopeContract } from './use-navigation-contract';
import { useAppContext } from '../lib/app-context';
import { decideNotificationTapNavigation } from '../lib/notification-tap-navigation';
import { platformAlert } from '../lib/platform-alert';
import { useProfile } from '../lib/profile';

let notificationHandlerInitialized = false;

type NotificationData = Record<string, unknown>;

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
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { setMode } = useAppContext();
  const { activeProfile } = useProfile();
  const navigationContract = useNavigationDataScopeContract();
  const activeProfileRef = useRef(activeProfile);
  const pathnameRef = useRef(pathname);
  const appContextRef = useRef(navigationContract.effectiveAppContext);
  activeProfileRef.current = activeProfile;
  pathnameRef.current = pathname;
  appContextRef.current = navigationContract.effectiveAppContext;

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | NotificationData
          | undefined;
        if (!data?.type) return;

        if (data.type === 'nudge') {
          const profileId = activeProfileRef.current?.id;
          if (profileId) {
            void queryClient.invalidateQueries({
              queryKey: ['nudges', 'unread', profileId],
            });
          }
        }

        const decision = decideNotificationTapNavigation({
          currentPathname: pathnameRef.current,
          effectiveAppContext: appContextRef.current,
          notificationData: data,
        });

        if (decision.kind === 'ignore') return;

        const navigate = (): void => {
          if (decision.kind === 'push') {
            router.push(decision.href);
            return;
          }

          router.replace(decision.href);
        };

        const navigateInTargetContext = (): void => {
          if (decision.context !== appContextRef.current) {
            setMode(decision.context, {
              onSuccess: navigate,
              onError: () => router.replace('/(app)/home'),
            });
            return;
          }
          navigate();
        };

        if (decision.kind === 'prompt') {
          platformAlert(decision.title, decision.message, [
            { text: 'Stay here', style: 'cancel' },
            { text: 'Open update', onPress: navigateInTargetContext },
          ]);
          return;
        }

        navigateInTargetContext();
      },
    );
    return () => sub.remove();
  }, [queryClient, router, setMode]);
}
