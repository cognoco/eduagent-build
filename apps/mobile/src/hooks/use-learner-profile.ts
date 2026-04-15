import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  DeleteMemoryItemInput,
  LearningProfile,
  AccommodationMode,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

interface ToggleCollectionInput {
  childProfileId?: string;
  memoryCollectionEnabled: boolean;
}

interface ToggleInjectionInput {
  childProfileId?: string;
  memoryInjectionEnabled: boolean;
}

interface DeleteMemoryInput extends DeleteMemoryItemInput {
  childProfileId?: string;
}

interface GrantConsentInput {
  childProfileId: string;
  consent: 'granted' | 'declined';
}

interface TellMentorParams {
  text: string;
  childProfileId?: string;
}

interface UnsuppressParams {
  value: string;
  childProfileId?: string;
}

interface UpdateAccommodationInput {
  childProfileId?: string;
  accommodationMode: AccommodationMode;
}

function learnerProfileKey(profileId?: string) {
  return ['learner-profile', profileId] as const;
}

export function useLearnerProfile(): UseQueryResult<LearningProfile> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: learnerProfileKey(activeProfile?.id),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client['learner-profile'].$get(
          {},
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as { profile: LearningProfile };
        return data.profile;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}

export function useChildLearnerProfile(
  childProfileId: string | undefined
): UseQueryResult<LearningProfile> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: learnerProfileKey(childProfileId),
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client['learner-profile'][':profileId'].$get(
          { param: { profileId: childProfileId! } },
          { init: { signal } }
        );
        await assertOk(res);
        const data = (await res.json()) as { profile: LearningProfile };
        return data.profile;
      } finally {
        cleanup();
      }
    },
    enabled:
      !!activeProfile && activeProfile.isOwner === true && !!childProfileId,
  });
}

export function useDeleteMemoryItem(): UseMutationResult<
  { success: boolean },
  Error,
  DeleteMemoryInput
> {
  const client = useApiClient();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input) => {
      const res = input.childProfileId
        ? await client['learner-profile'][':profileId'].item.$delete({
            param: { profileId: input.childProfileId },
            json: input,
          })
        : await client['learner-profile'].item.$delete({ json: input });
      await assertOk(res);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({
        queryKey: learnerProfileKey(vars.childProfileId ?? activeProfile?.id),
      });
    },
  });
}

export function useDeleteAllMemory(): UseMutationResult<
  { success: boolean },
  Error,
  { childProfileId?: string }
> {
  const client = useApiClient();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async ({ childProfileId }) => {
      const res = childProfileId
        ? await client['learner-profile'][':profileId'].all.$delete({
            param: { profileId: childProfileId },
          })
        : await client['learner-profile'].all.$delete();
      await assertOk(res);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({
        queryKey: learnerProfileKey(vars.childProfileId ?? activeProfile?.id),
      });
    },
  });
}

export function useToggleMemoryCollection(): UseMutationResult<
  { success: boolean },
  Error,
  ToggleCollectionInput
> {
  const client = useApiClient();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input) => {
      const res = input.childProfileId
        ? await client['learner-profile'][':profileId'].collection.$patch({
            param: { profileId: input.childProfileId },
            json: {
              memoryCollectionEnabled: input.memoryCollectionEnabled,
            },
          })
        : await client['learner-profile'].collection.$patch({
            json: {
              memoryCollectionEnabled: input.memoryCollectionEnabled,
            },
          });
      await assertOk(res);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({
        queryKey: learnerProfileKey(vars.childProfileId ?? activeProfile?.id),
      });
    },
  });
}

export function useToggleMemoryInjection(): UseMutationResult<
  { success: boolean },
  Error,
  ToggleInjectionInput
> {
  const client = useApiClient();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input) => {
      const res = input.childProfileId
        ? await client['learner-profile'][':profileId'].injection.$patch({
            param: { profileId: input.childProfileId },
            json: {
              memoryInjectionEnabled: input.memoryInjectionEnabled,
            },
          })
        : await client['learner-profile'].injection.$patch({
            json: {
              memoryInjectionEnabled: input.memoryInjectionEnabled,
            },
          });
      await assertOk(res);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({
        queryKey: learnerProfileKey(vars.childProfileId ?? activeProfile?.id),
      });
    },
  });
}

export function useGrantMemoryConsent(): UseMutationResult<
  { success: boolean },
  Error,
  GrantConsentInput
> {
  const client = useApiClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input) => {
      const res = await client['learner-profile'][':profileId'].consent.$post({
        param: { profileId: input.childProfileId },
        json: { consent: input.consent },
      });
      await assertOk(res);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({
        queryKey: learnerProfileKey(vars.childProfileId),
      });
    },
  });
}

export function useTellMentor(): UseMutationResult<
  { success: boolean; message: string; fieldsUpdated: string[] },
  Error,
  TellMentorParams
> {
  const client = useApiClient();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input) => {
      const res = input.childProfileId
        ? await client['learner-profile'][':profileId'].tell.$post({
            param: { profileId: input.childProfileId },
            json: { text: input.text },
          })
        : await client['learner-profile'].tell.$post({
            json: { text: input.text },
          });
      await assertOk(res);
      return (await res.json()) as {
        success: boolean;
        message: string;
        fieldsUpdated: string[];
      };
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({
        queryKey: learnerProfileKey(vars.childProfileId ?? activeProfile?.id),
      });
    },
  });
}

export function useUnsuppressInference(): UseMutationResult<
  { success: boolean },
  Error,
  UnsuppressParams
> {
  const client = useApiClient();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input) => {
      const res = input.childProfileId
        ? await client['learner-profile'][':profileId'].unsuppress.$post({
            param: { profileId: input.childProfileId },
            json: { value: input.value },
          })
        : await client['learner-profile'].unsuppress.$post({
            json: { value: input.value },
          });
      await assertOk(res);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({
        queryKey: learnerProfileKey(vars.childProfileId ?? activeProfile?.id),
      });
    },
  });
}

export function useUpdateAccommodationMode(): UseMutationResult<
  { success: boolean },
  Error,
  UpdateAccommodationInput
> {
  const client = useApiClient();
  const qc = useQueryClient();
  const { activeProfile } = useProfile();

  return useMutation({
    mutationFn: async (input) => {
      const res = input.childProfileId
        ? await client['learner-profile'][':profileId'][
            'accommodation-mode'
          ].$patch({
            param: { profileId: input.childProfileId },
            json: { accommodationMode: input.accommodationMode },
          })
        : await client['learner-profile']['accommodation-mode'].$patch({
            json: { accommodationMode: input.accommodationMode },
          });
      await assertOk(res);
      return (await res.json()) as { success: boolean };
    },
    onSuccess: async (_, vars) => {
      await qc.invalidateQueries({
        queryKey: learnerProfileKey(vars.childProfileId ?? activeProfile?.id),
      });
    },
  });
}
