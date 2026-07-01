import {
  appealReportSchema,
  sharedRecordSchema,
  type AppealReport,
  type ScopeDescriptor,
  type SharedRecord,
} from '@eduagent/schemas';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';

import { useApiQuery } from '../../hooks/use-api-query';
import { assertOk } from '../../lib/assert-ok';
import { useApiClient } from '../../lib/api-client';

type PersonScope = Extract<ScopeDescriptor, { kind: 'person' }>;

export function useSharedRecord(
  scope: PersonScope,
): UseQueryResult<SharedRecord> {
  const client = useApiClient();

  return useApiQuery({
    queryKey: ['visibility-shared-record', scope.personId, scope.edgeId],
    fetch: (signal) =>
      client.visibility.reports[':personId']['shared-record'].$get(
        { param: { personId: scope.personId } },
        { init: { signal } },
      ),
    select: (json: unknown) => sharedRecordSchema.parse(json),
  });
}

// Supporter-side "request attention report" appeal — see
// apps/api/src/routes/visibility.ts POST /visibility/reports/:personId/appeal.
// The caller must be the supporter of an accepted contract for `scope.personId`;
// this is not a supportee dispute mechanism.
export function useAppealVisibility(
  scope: PersonScope,
): UseMutationResult<AppealReport, Error, void> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async () => {
      const res = await client.visibility.reports[':personId'].appeal.$post({
        param: { personId: scope.personId },
        json: {},
      });
      const okRes = await assertOk(res);
      return appealReportSchema.parse(await okRes.json());
    },
  });
}
