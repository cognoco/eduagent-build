import { type UseQueryResult } from '@tanstack/react-query';
import type { RecapListItem } from '@eduagent/schemas';
import { recapsResponseSchema } from '@eduagent/schemas';

import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { useApiQuery } from './use-api-query';

export function useJournalRecaps(limit = 10): UseQueryResult<RecapListItem[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id;

  return useApiQuery({
    queryKey: ['journal-recaps', profileId, limit],
    schema: recapsResponseSchema,
    fetch: (signal) =>
      client.recaps.self.$get(
        { query: { limit: String(limit) } },
        { init: { signal } },
      ),
    select: (json) => json.recaps,
  });
}
