import { useQuery } from '@tanstack/react-query';
import type { DailyPlan } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';

export function useDailyPlan() {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery({
    queryKey: ['daily-plan', activeProfile?.id],
    queryFn: async ({ signal: querySignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await client['daily-plan'].$get({}, { init: { signal } });
        await assertOk(res);
        return (await res.json()) as DailyPlan;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
  });
}
