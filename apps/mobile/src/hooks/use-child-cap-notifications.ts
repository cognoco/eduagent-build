import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  childCapNotificationDismissResponseSchema,
  childCapNotificationsResponseSchema,
  childCapNotifyParentResponseSchema,
  type ChildCapNotification,
  type ChildCapNotifyParentInput,
} from '@eduagent/schemas';

import { assertOk } from '../lib/assert-ok';
import { useApiClient } from '../lib/api-client';
import { parseJson } from '../lib/parse-json';
import { useProfile } from '../lib/profile';
import { useActiveProfileRoleState } from './use-active-profile-role';
import { useApiQuery } from './use-api-query';

function childCapNotificationsQueryKey(profileId: string | undefined) {
  return ['child-cap-notifications', profileId];
}

export function useChildCapNotifications(): UseQueryResult<
  ChildCapNotification[]
> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const activeProfileRole = useActiveProfileRoleState();

  return useApiQuery<
    { notifications: ChildCapNotification[] },
    ChildCapNotification[]
  >({
    queryKey: childCapNotificationsQueryKey(activeProfile?.id),
    schema: childCapNotificationsResponseSchema,
    fetch: (signal) =>
      client.notifications['child-cap'].$get({}, { init: { signal } }),
    select: (json) => json.notifications,
    enabled: activeProfileRole.role === 'owner',
  });
}

export function useDismissChildCapNotification(): UseMutationResult<
  { success: true },
  Error,
  string
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await client.notifications['child-cap'][':id'].dismiss.$post({
        param: { id: notificationId },
      });
      const okRes = await assertOk(res);
      return parseJson(
        okRes,
        childCapNotificationDismissResponseSchema,
        'POST /notifications/child-cap/:id/dismiss',
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: childCapNotificationsQueryKey(activeProfile?.id),
      });
    },
  });
}

export function useNotifyParentChildCap(): UseMutationResult<
  { sent: boolean },
  Error,
  ChildCapNotifyParentInput
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: ChildCapNotifyParentInput) => {
      const res = await client.notifications['child-cap'][
        'notify-parent'
      ].$post({
        json: input,
      });
      const okRes = await assertOk(res);
      return parseJson(
        okRes,
        childCapNotifyParentResponseSchema,
        'POST /notifications/child-cap/notify-parent',
      );
    },
  });
}
