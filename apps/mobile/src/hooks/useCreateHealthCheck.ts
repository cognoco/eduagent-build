/**
 * useCreateHealthCheck - Mutation hook for creating health check pings
 *
 * Handles the POST request to create a new health check and provides
 * loading state for the ping button.
 *
 * @module hooks/useCreateHealthCheck
 * @see Story 6.3: Implement Mobile Health Check Screen
 * @see AC-6.3.2, AC-6.3.3
 */
import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { apiClient } from '../lib/api';
import type { components } from '@nx-monorepo/api-client';

type HealthCheck = components['schemas']['HealthCheck'];

export interface UseCreateHealthCheckResult {
  /** Function to create a new health check */
  createHealthCheck: (message?: string) => Promise<HealthCheck | null>;
  /** Whether a mutation is currently in progress */
  mutating: boolean;
  /** Error message if mutation failed, null otherwise */
  error: string | null;
}

export interface UseCreateHealthCheckOptions {
  /** Callback to trigger after successful creation */
  onSuccess?: () => void;
}

/**
 * Hook to create new health check records.
 *
 * @param options - Optional configuration
 * @param options.onSuccess - Callback invoked after successful creation (e.g., to refetch list)
 *
 * @example
 * ```tsx
 * const { refetch } = useHealthChecks();
 * const { createHealthCheck, mutating } = useCreateHealthCheck({
 *   onSuccess: refetch
 * });
 *
 * return (
 *   <Button
 *     title={mutating ? 'Pinging...' : 'Ping'}
 *     onPress={() => createHealthCheck('Mobile ping')}
 *     disabled={mutating}
 *   />
 * );
 * ```
 */
export function useCreateHealthCheck(
  options?: UseCreateHealthCheckOptions
): UseCreateHealthCheckResult {
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createHealthCheck = useCallback(
    async (message = 'Mobile ping'): Promise<HealthCheck | null> => {
      setMutating(true);
      setError(null);

      try {
        const { data: responseData, error: apiError } = await apiClient.POST(
          '/health/ping',
          {
            body: { message },
          }
        );

        if (apiError) {
          const errorMessage = 'Failed to create health check';
          setError(errorMessage);
          Alert.alert('Error', errorMessage);
          return null;
        }

        if (responseData) {
          // Trigger success callback (e.g., to refetch list)
          options?.onSuccess?.();
          return responseData.healthCheck;
        }

        return null;
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'An unexpected error occurred';

        // Provide user-friendly error messages
        let errorMessage: string;
        if (message.includes('Network') || message.includes('fetch')) {
          errorMessage = 'Network error. Check your connection.';
        } else if (message.includes('timeout')) {
          errorMessage = 'Request timed out.';
        } else {
          errorMessage = `Error: ${message}`;
        }

        setError(errorMessage);
        Alert.alert('Error', errorMessage);
        return null;
      } finally {
        setMutating(false);
      }
    },
    [options]
  );

  return { createHealthCheck, mutating, error };
}

export default useCreateHealthCheck;
