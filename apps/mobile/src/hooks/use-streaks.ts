import type { UseQueryResult } from '@tanstack/react-query';
import type { Streak, XpSummary } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { useApiQuery } from './use-api-query';

export function useStreaks(): UseQueryResult<Streak> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{ streak: Streak }, Streak>({
    queryKey: ['streaks', activeProfile?.id],
    fetch: (signal) => client.streaks.$get({}, { init: { signal } }),
    select: (json) => json.streak,
  });
}

export function useXpSummary(): UseQueryResult<XpSummary> {
  const client = useApiClient();
  const { activeProfile } = useProfile();

  return useApiQuery<{ xp: XpSummary }, XpSummary>({
    queryKey: ['xp', activeProfile?.id],
    fetch: (signal) => client.xp.$get({}, { init: { signal } }),
    select: (json) => json.xp,
  });
}
