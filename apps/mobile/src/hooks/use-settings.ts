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
  CelebrationLevel,
  LanguageCode,
  WithdrawalArchivePreference,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

// ---------------------------------------------------------------------------
// Types — NotificationPrefs is the API response shape (maxDailyPush required)
// ---------------------------------------------------------------------------

interface NotificationPrefs {
  reviewReminders: boolean;
  dailyReminders: boolean;
  weeklyProgressPush: boolean;
  weeklyProgressEmail: boolean;
  monthlyProgressEmail: boolean;
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
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.settings.notifications.$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        const data = await res.json();
        return data.preferences;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useLearningMode(): UseQueryResult<LearningMode> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'learning-mode', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.settings['learning-mode'].$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        const data = await res.json();
        return data.mode;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useCelebrationLevel(): UseQueryResult<CelebrationLevel> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'celebration-level', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.settings['celebration-level'].$get(
          { query: {} },
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as {
          celebrationLevel: CelebrationLevel;
        };
        return data.celebrationLevel as CelebrationLevel;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useChildCelebrationLevel(
  childProfileId: string | undefined,
): UseQueryResult<CelebrationLevel> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: [
      'settings',
      'celebration-level',
      activeProfile?.id,
      childProfileId,
    ],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.settings['celebration-level'].$get(
          { query: { childProfileId: childProfileId ?? '' } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as {
          celebrationLevel: CelebrationLevel;
        };
        return data.celebrationLevel as CelebrationLevel;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile?.isOwner && !!childProfileId,
  });
}

export function useWithdrawalArchivePreference(): UseQueryResult<WithdrawalArchivePreference> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'withdrawal-archive', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.settings['withdrawal-archive'].$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as {
          value: WithdrawalArchivePreference;
        };
        return data.value as WithdrawalArchivePreference;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile?.id && activeProfile.isOwner === true,
  });
}

export function useFamilyPoolBreakdownSharing(): UseQueryResult<boolean> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'family-pool-breakdown-sharing', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.settings['family-pool-breakdown-sharing'].$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        const data = (await res.json()) as { value: boolean };
        return data.value;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile?.id && activeProfile.isOwner === true,
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
      await assertOk(res);
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
  LearningMode,
  { previous?: LearningMode }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (mode: LearningMode) => {
      const res = await client.settings['learning-mode'].$put({
        json: { mode },
      });
      await assertOk(res);
      const data = await res.json();
      return data.mode;
    },
    onMutate: async (mode) => {
      const queryKey = ['settings', 'learning-mode', activeProfile?.id];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<LearningMode>(queryKey);
      queryClient.setQueryData(queryKey, mode);
      return { previous };
    },
    onError: (_error, _mode, context) => {
      const queryKey = ['settings', 'learning-mode', activeProfile?.id];
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'learning-mode', activeProfile?.id],
      });
    },
  });
}

export function useUpdateCelebrationLevel(): UseMutationResult<
  CelebrationLevel,
  Error,
  CelebrationLevel
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (celebrationLevel: CelebrationLevel) => {
      const res = await client.settings['celebration-level'].$put({
        json: { celebrationLevel },
      });
      await assertOk(res);
      const data = await res.json();
      return data.celebrationLevel as CelebrationLevel;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'celebration-level', activeProfile?.id],
      });
    },
  });
}

export function useUpdateChildCelebrationLevel(): UseMutationResult<
  CelebrationLevel,
  Error,
  { childProfileId: string; celebrationLevel: CelebrationLevel }
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async ({ childProfileId, celebrationLevel }) => {
      const res = await client.settings['celebration-level'].$put({
        json: { childProfileId, celebrationLevel },
      });
      await assertOk(res);
      const data = await res.json();
      return data.celebrationLevel as CelebrationLevel;
    },
    onSuccess: (_level, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          'settings',
          'celebration-level',
          activeProfile?.id,
          variables.childProfileId,
        ],
      });
    },
  });
}

export function useUpdateWithdrawalArchivePreference(): UseMutationResult<
  WithdrawalArchivePreference,
  Error,
  WithdrawalArchivePreference
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (value: WithdrawalArchivePreference) => {
      const res = await client.settings['withdrawal-archive'].$put({
        json: { value },
      });
      await assertOk(res);
      const data = (await res.json()) as { value: WithdrawalArchivePreference };
      return data.value as WithdrawalArchivePreference;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'withdrawal-archive', activeProfile?.id],
      });
    },
  });
}

export function useUpdateFamilyPoolBreakdownSharing(): UseMutationResult<
  boolean,
  Error,
  boolean
> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (value: boolean) => {
      const res = await client.settings['family-pool-breakdown-sharing'].$put({
        json: { value },
      });
      await assertOk(res);
      const data = (await res.json()) as { value: boolean };
      return data.value;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [
          'settings',
          'family-pool-breakdown-sharing',
          activeProfile?.id,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: ['usage', activeProfile?.id],
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
      await assertOk(res);
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
      await assertOk(res);
      const data = await res.json();
      return data as ParentSubscribeResult;
    },
  });
}

// ---------------------------------------------------------------------------
// Analogy Domain (FR134-137)
// ---------------------------------------------------------------------------

export function useAnalogyDomain(
  subjectId: string,
): UseQueryResult<AnalogyDomain | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'analogy-domain', activeProfile?.id, subjectId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.settings.subjects[':subjectId'][
          'analogy-domain'
        ].$get({ param: { subjectId } }, { init: { signal } });
        await assertOk(res);
        const data = await res.json();
        return data.analogyDomain as AnalogyDomain | null;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useUpdateAnalogyDomain(
  subjectId: string,
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
      await assertOk(res);
      const data = (await res.json()) as { analogyDomain: string | null };
      return data.analogyDomain as AnalogyDomain | null;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'analogy-domain', activeProfile?.id, subjectId],
      });
    },
  });
}

export function useNativeLanguage(
  subjectId: string,
): UseQueryResult<LanguageCode | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['settings', 'native-language', activeProfile?.id, subjectId],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.settings.subjects[':subjectId'][
          'native-language'
        ].$get({ param: { subjectId } }, { init: { signal } });
        await assertOk(res);
        const data = await res.json();
        return data.nativeLanguage as LanguageCode | null;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile && !!subjectId,
  });
}

export function useUpdateNativeLanguage(
  subjectId: string,
): UseMutationResult<LanguageCode | null, Error, LanguageCode | null> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (nativeLanguage: LanguageCode | null) => {
      const res = await client.settings.subjects[':subjectId'][
        'native-language'
      ].$put({
        param: { subjectId },
        json: { nativeLanguage },
      });
      await assertOk(res);
      const data = (await res.json()) as { nativeLanguage: string | null };
      return data.nativeLanguage as LanguageCode | null;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['settings', 'native-language', activeProfile?.id, subjectId],
      });
    },
  });
}
