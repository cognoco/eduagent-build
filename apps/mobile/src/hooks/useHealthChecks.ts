/**
 * useHealthChecks - Data fetching hook for health check records
 *
 * Fetches health check list from the API and manages loading, error,
 * and data states. Provides refetch for pull-to-refresh functionality.
 *
 * @module hooks/useHealthChecks
 * @see Story 6.3: Implement Mobile Health Check Screen
 * @see AC-6.3.1, AC-6.3.4, AC-6.3.5
 */
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';
import type { components } from '@nx-monorepo/api-client';

type HealthCheck = components['schemas']['HealthCheck'];

export interface UseHealthChecksResult {
  /** Array of health check records */
  data: HealthCheck[];
  /** Whether data is currently being fetched */
  loading: boolean;
  /** Error message if fetch failed, null otherwise */
  error: string | null;
  /** Function to refetch the health checks */
  refetch: () => Promise<void>;
  /** Whether a refetch (not initial load) is in progress */
  refreshing: boolean;
}

/**
 * Hook to fetch and manage health check data.
 *
 * @example
 * ```tsx
 * const { data, loading, error, refetch, refreshing } = useHealthChecks();
 *
 * if (loading) return <Loading />;
 * if (error) return <Error message={error} onRetry={refetch} />;
 * return <HealthCheckList data={data} onRefresh={refetch} refreshing={refreshing} />;
 * ```
 */
export function useHealthChecks(): UseHealthChecksResult {
  const [data, setData] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealthChecks = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const { data: responseData, error: apiError } = await apiClient.GET(
        '/health'
      );

      if (apiError) {
        // API returned an error response
        setError('Failed to load health checks. Please try again.');
        return;
      }

      if (responseData) {
        setData(responseData.healthChecks);
      }
    } catch (e) {
      // Network or unexpected error
      const message =
        e instanceof Error ? e.message : 'An unexpected error occurred';

      // Provide user-friendly error messages
      if (message.includes('Network') || message.includes('fetch')) {
        setError('Network error. Check your connection and try again.');
      } else if (message.includes('timeout')) {
        setError('Request timed out. Check your connection and try again.');
      } else {
        setError(`Error: ${message}`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchHealthChecks(false);
  }, [fetchHealthChecks]);

  // Refetch function for pull-to-refresh
  const refetch = useCallback(async () => {
    await fetchHealthChecks(true);
  }, [fetchHealthChecks]);

  return { data, loading, error, refetch, refreshing };
}

export default useHealthChecks;
