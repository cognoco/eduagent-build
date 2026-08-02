import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  familyJoinJourneyResultSchema,
  guardianAttachmentInitiationResultSchema,
  type FamilyJoinDeclineRequest,
  type FamilyJoinFinalizeRequest,
  type FamilyJoinGuardianInitiationRequest,
  type FamilyJoinJourneyRequest,
  type FamilyJoinJourneyResult,
} from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { parseJson } from '../lib/parse-json';

type GuardianJourneyInput = FamilyJoinGuardianInitiationRequest;

export function useFamilyJoinJourney() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  const invalidateJoinedState = async (result: FamilyJoinJourneyResult) => {
    if (result.status !== 'joined') return;
    await queryClient.invalidateQueries({
      predicate: (query) =>
        [
          'profiles',
          'consent-status',
          'country-policy',
          'learning-access',
          'scopes',
          'subscription',
          'family-subscription',
        ].includes(String(query.queryKey[0])),
    });
  };

  const start = useMutation<
    FamilyJoinJourneyResult,
    Error,
    FamilyJoinJourneyRequest
  >({
    retry: false,
    mutationFn: async (input) => {
      const response = await client['family-join'].journey.$post({
        json: input,
      });
      await assertOk(response);
      return parseJson(
        response,
        familyJoinJourneyResultSchema,
        'POST /family-join/journey',
      );
    },
  });

  const guardian = useMutation<
    FamilyJoinJourneyResult,
    Error,
    GuardianJourneyInput
  >({
    retry: false,
    mutationFn: async (input) => {
      const initiatedResponse = await client[
        'family-join'
      ].journey.guardian.initiate.$post({
        json: input,
      });
      await assertOk(initiatedResponse);
      const initiated = await parseJson(
        initiatedResponse,
        guardianAttachmentInitiationResultSchema,
        'POST /family-join/journey/guardian/initiate',
      );
      const completedResponse = await client[
        'family-join'
      ].journey.guardian.complete.$post({
        json: {
          token: input.token,
          authorityToken: initiated.authorityToken,
          authorizeSupportership: input.authorizeSupportership,
        },
      });
      await assertOk(completedResponse);
      return parseJson(
        completedResponse,
        familyJoinJourneyResultSchema,
        'POST /family-join/journey/guardian/complete',
      );
    },
  });

  const finalize = useMutation<
    FamilyJoinJourneyResult,
    Error,
    FamilyJoinFinalizeRequest
  >({
    retry: false,
    mutationFn: async (input) => {
      const response = await client['family-join'].journey.finalize.$post({
        json: input,
      });
      await assertOk(response);
      return parseJson(
        response,
        familyJoinJourneyResultSchema,
        'POST /family-join/journey/finalize',
      );
    },
    onSuccess: invalidateJoinedState,
  });

  const decline = useMutation<
    FamilyJoinJourneyResult,
    Error,
    FamilyJoinDeclineRequest
  >({
    retry: false,
    mutationFn: async (input) => {
      const response = await client['family-join'].journey.decline.$post({
        json: input,
      });
      await assertOk(response);
      return parseJson(
        response,
        familyJoinJourneyResultSchema,
        'POST /family-join/journey/decline',
      );
    },
  });

  return { start, guardian, finalize, decline };
}
