import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  NotificationPrefsInput,
  NotificationPrefsResponse as NotificationPrefs,
  AnalogyDomain,
  CelebrationLevel,
  LanguageCode,
  WithdrawalArchivePreference,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { assertOk } from '../lib/assert-ok';
import { queryKeys } from '../lib/query-keys';
import { useApiQuery } from './use-api-query';

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useNotificationSettings(): UseQueryResult<NotificationPrefs> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{ preferences: NotificationPrefs }, NotificationPrefs>({
    queryKey: queryKeys.settings.notifications(activeProfile?.id),
    fetch: (signal) =>
      client.settings.notifications.$get({}, { init: { signal } }),
    select: (json) => json.preferences,
  });
}

export function useCelebrationLevel(): UseQueryResult<CelebrationLevel> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{ celebrationLevel: CelebrationLevel }, CelebrationLevel>({
    queryKey: queryKeys.settings.celebrationLevel(activeProfile?.id),
    fetch: (signal) =>
      client.settings['celebration-level'].$get(
        { query: {} },
        { init: { signal } },
      ),
    select: (json) => json.celebrationLevel as CelebrationLevel,
  });
}

export function useChildCelebrationLevel(
  childProfileId: string | undefined,
): UseQueryResult<CelebrationLevel> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{ celebrationLevel: CelebrationLevel }, CelebrationLevel>({
    queryKey: queryKeys.settings.childCelebrationLevel(
      childProfileId,
      activeProfile?.id,
    ),
    enabled: !!activeProfile?.isOwner && !!childProfileId,
    fetch: (signal) =>
      client.settings['celebration-level'].$get(
        { query: childProfileId ? { childProfileId } : {} },
        { init: { signal } },
      ),
    select: (json) => json.celebrationLevel as CelebrationLevel,
  });
}

export function useWithdrawalArchivePreference(): UseQueryResult<WithdrawalArchivePreference> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<
    { value: WithdrawalArchivePreference },
    WithdrawalArchivePreference
  >({
    queryKey: queryKeys.settings.withdrawalArchive(activeProfile?.id),
    enabled: !!activeProfile?.id && activeProfile.isOwner === true,
    fetch: (signal) =>
      client.settings['withdrawal-archive'].$get({}, { init: { signal } }),
    select: (json) => json.value as WithdrawalArchivePreference,
  });
}

export function useFamilyPoolBreakdownSharing(): UseQueryResult<boolean> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{ value: boolean }, boolean>({
    queryKey: queryKeys.settings.familyPoolBreakdownSharing(activeProfile?.id),
    enabled: !!activeProfile?.id && activeProfile.isOwner === true,
    fetch: (signal) =>
      client.settings['family-pool-breakdown-sharing'].$get(
        {},
        { init: { signal } },
      ),
    select: (json) => json.value,
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
        queryKey: queryKeys.settings.notifications(activeProfile?.id),
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
        queryKey: queryKeys.settings.celebrationLevel(activeProfile?.id),
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
        queryKey: queryKeys.settings.childCelebrationLevel(
          variables.childProfileId,
          activeProfile?.id,
        ),
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
        queryKey: queryKeys.settings.withdrawalArchive(activeProfile?.id),
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
        queryKey: queryKeys.settings.familyPoolBreakdownSharing(
          activeProfile?.id,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.usage(activeProfile?.id),
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
  { profileId: string; token: string }
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async ({ profileId, token }) => {
      const res = await client.settings['push-token'].$post(
        {
          json: { token },
        },
        {
          init: {
            headers: { 'X-Profile-Id': profileId },
          },
        },
      );
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

  return useApiQuery<
    { analogyDomain: AnalogyDomain | null },
    AnalogyDomain | null
  >({
    queryKey: queryKeys.settings.analogyDomain(subjectId, activeProfile?.id),
    enabled: !!subjectId,
    fetch: (signal) =>
      client.settings.subjects[':subjectId']['analogy-domain'].$get(
        { param: { subjectId } },
        { init: { signal } },
      ),
    select: (json) => json.analogyDomain as AnalogyDomain | null,
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
        queryKey: queryKeys.settings.analogyDomain(
          subjectId,
          activeProfile?.id,
        ),
      });
    },
  });
}

export function useNativeLanguage(
  subjectId: string,
): UseQueryResult<LanguageCode | null> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<
    { nativeLanguage: LanguageCode | null },
    LanguageCode | null
  >({
    queryKey: queryKeys.settings.nativeLanguage(subjectId, activeProfile?.id),
    enabled: !!subjectId,
    fetch: (signal) =>
      client.settings.subjects[':subjectId']['native-language'].$get(
        { param: { subjectId } },
        { init: { signal } },
      ),
    select: (json) => json.nativeLanguage as LanguageCode | null,
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
        queryKey: queryKeys.settings.nativeLanguage(
          subjectId,
          activeProfile?.id,
        ),
      });
    },
  });
}
