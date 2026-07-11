import type { UseQueryResult } from '@tanstack/react-query';
import {
  supporterColdStartSchema,
  type SupporterColdStart,
} from '@eduagent/schemas';

import { useApiQuery } from './use-api-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { useScopeContext } from '../lib/scope-context';

/**
 * `GET /scopes/coldstart` — shared by `SupporterColdStart` and
 * `SupporterSelfLearningDoorway` (WI-1135/T17). Both components mount the
 * same query key, so React Query dedupes the fetch when both render at once.
 * Only enabled in the Support hub scope; the card/doorway components gate
 * their own rendering on `activeScope.kind === 'supporter-hub'` as well.
 */
export function useSupporterColdStart(): UseQueryResult<SupporterColdStart> {
  const client = useApiClient();
  const { activeScope } = useScopeContext();
  const { activeProfile } = useProfile();

  return useApiQuery({
    queryKey: ['supporter-coldstart', activeProfile?.id ?? 'none'],
    schema: supporterColdStartSchema,
    enabled: activeScope.kind === 'supporter-hub',
    fetch: (signal) => client.scopes.coldstart.$get({}, { init: { signal } }),
    select: (json) => json,
  });
}
