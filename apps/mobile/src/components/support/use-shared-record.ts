import {
  sharedRecordSchema,
  type ScopeDescriptor,
  type SharedRecord,
} from '@eduagent/schemas';
import type { UseQueryResult } from '@tanstack/react-query';

import { useApiQuery } from '../../hooks/use-api-query';
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
