/**
 * useCreateHealthCheck - Walking skeleton placeholder
 *
 * Will be replaced with real mutation hook in Epic 0.
 */
import { useState, useCallback } from 'react';

// TODO: Replace with Hono RPC types in Epic 0
type HealthCheck = { id: string; message: string; timestamp: string };

export interface UseCreateHealthCheckResult {
  createHealthCheck: (message?: string) => Promise<HealthCheck | null>;
  mutating: boolean;
  error: string | null;
}

export interface UseCreateHealthCheckOptions {
  onSuccess?: () => void;
}

export function useCreateHealthCheck(
  _options?: UseCreateHealthCheckOptions
): UseCreateHealthCheckResult {
  const [mutating] = useState(false);
  const [error] = useState<string | null>(null);

  const createHealthCheck = useCallback(
    async (_message = 'Mobile ping'): Promise<HealthCheck | null> => {
      // Placeholder — API client not yet configured
      return null;
    },
    []
  );

  return { createHealthCheck, mutating, error };
}

export default useCreateHealthCheck;
