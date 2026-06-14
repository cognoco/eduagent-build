import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { RecapListItem } from '@eduagent/schemas';
import { recapsResponseSchema } from '@eduagent/schemas';

import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';

export function useJournalRecaps(limit = 10): UseQueryResult<RecapListItem[]> {
  const client = useApiClient();
  const { activeProfile } = useProfile();
  const profileId = activeProfile?.id;

  return useQuery({
    queryKey: ['journal-recaps', profileId, limit],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client.recaps.self.$get(
          { query: { limit: String(limit) } },
          { init: { signal } },
        );
        await assertOk(res);
        const data = recapsResponseSchema.parse(await res.json());
        return data.recaps;
      } finally {
        cleanup();
      }
    },
    enabled: !!profileId,
  });
}
