/**
 * useHealthChecks - Walking skeleton placeholder
 *
 * Will be replaced with real data fetching in Epic 0.
 */
import { useState, useCallback } from 'react';

// TODO: Replace with Hono RPC types in Epic 0
type HealthCheck = { id: string; message: string; timestamp: string };

export interface UseHealthChecksResult {
  data: HealthCheck[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  refreshing: boolean;
}

export function useHealthChecks(): UseHealthChecksResult {
  const [data] = useState<HealthCheck[]>([]);
  const [loading] = useState(false);
  const [error] = useState<string | null>(null);
  const [refreshing] = useState(false);

  const refetch = useCallback(async () => {
    // Placeholder — API client not yet configured
  }, []);

  return { data, loading, error, refetch, refreshing };
}

export default useHealthChecks;
