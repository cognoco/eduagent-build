import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  NotificationPrefsInput,
  LearningMode,
  AnalogyDomain,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';

// ---------------------------------------------------------------------------
// Types — NotificationPrefs is the API response shape (maxDailyPush required)
// ---------------------------------------------------------------------------

interface NotificationPrefs {
  reviewReminders: boolean;
  dailyReminders: boolean;
  pushEnabled: boolean;
  maxDailyPush: number;
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useNotificationSettings(): UseQueryResult<NotificationPrefs> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'notifications', activeProfile?.id],
    queryFn: async () => {
      const res = await client.settings.notifications.$get();
      const data = await res.json();
      return data.preferences;
    },
    enabled: !!activeProfile,
  });
}

export function useLearningMode(): UseQueryResult<LearningMode> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'learning-mode', activeProfile?.id],
    queryFn: async () => {
      const res = await client.settings['learning-mode'].$get();
      const data = await res.json();
      return data.mode;
    },
    enabled: !!activeProfile,
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useUpdateNotificationSettings(): UseMutationResult<
  NotificationPrefs,
  Error,
  NotificationPrefsInput
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input: NotificationPrefsInput) => {
      const res = await client.settings.notifications.$put({ json: input });
      const data = await res.json();
      return data.preferences;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'notifications', activeProfile?.id],
      });
    },
  });
}

export function useUpdateLearningMode(): UseMutationResult<
  LearningMode,
  Error,
  LearningMode
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (mode: LearningMode) => {
      const res = await client.settings['learning-mode'].$put({
        json: { mode },
      });
      const data = await res.json();
      return data.mode;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'learning-mode', activeProfile?.id],
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Push Token Registration
// ---------------------------------------------------------------------------

export function useRegisterPushToken(): UseMutationResult<
  { registered: boolean },
  Error,
  string
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (token: string) => {
      const res = await client.settings['push-token'].$post({
        json: { token },
      });
      const data = await res.json();
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Parent Subscribe Notification (child-friendly paywall)
// ---------------------------------------------------------------------------

interface ParentSubscribeResult {
  sent: boolean;
  rateLimited: boolean;
  reason?: string;
}

export function useNotifyParentSubscribe(): UseMutationResult<
  ParentSubscribeResult,
  Error,
  void
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async () => {
      const res = await client.settings['notify-parent-subscribe'].$post();
      const data = await res.json();
      return data as ParentSubscribeResult;
    },
  });
}

// ---------------------------------------------------------------------------
// Analogy Domain (FR134-137)
// ---------------------------------------------------------------------------

export function useAnalogyDomain(
  subjectId: string
): UseQueryResult<AnalogyDomain | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'analogy-domain', activeProfile?.id, subjectId],
    queryFn: async () => {
      const res = await client.settings.subjects[':subjectId'][
        'analogy-domain'
      ].$get({ param: { subjectId } });
      const data = await res.json();
      return data.analogyDomain as AnalogyDomain | null;
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useUpdateAnalogyDomain(
  subjectId: string
): UseMutationResult<AnalogyDomain | null, Error, AnalogyDomain | null> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (analogyDomain: AnalogyDomain | null) => {
      const res = await client.settings.subjects[':subjectId'][
        'analogy-domain'
      ].$put({
        param: { subjectId },
        json: { analogyDomain },
      });
      const data = await res.json();
      return data.analogyDomain as AnalogyDomain | null;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'analogy-domain', activeProfile?.id, subjectId],
      });
    },
  });
}
