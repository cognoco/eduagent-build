// WALKING SKELETON: Delete after infrastructure validation
// Health check list page demonstrating end-to-end data flow
// Purpose: Validate REST+OpenAPI pipeline (API client → Express → Prisma → Supabase)

'use client';

import { useEffect, useState } from 'react';
import { createApiClient } from '@nx-monorepo/api-client';
import type { components } from '@nx-monorepo/api-client';

type HealthCheck = components['schemas']['HealthCheck'];

export default function HealthPage() {
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealthChecks = async () => {
      try {
        setLoading(true);
        setError(null);

        // Create API client with server URL
        const client = createApiClient({
          baseUrl: process.env.NEXT_PUBLIC_API_URL || '/api',
        });

        // Type-safe API call
        const { data, error: apiError } = await client.GET('/health');

        if (apiError) {
          throw new Error('Failed to fetch health checks');
        }

        if (data) {
          setHealthChecks(data.healthChecks);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchHealthChecks();
  }, []);

  const handlePing = async () => {
    try {
      setPinging(true);
      setPingError(null);

      // Create API client with server URL
      const client = createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_URL || '/api',
      });

      // Type-safe POST request to create health check
      const { data, error: apiError } = await client.POST('/health/ping', {
        body: {},
      });

      if (apiError) {
        throw new Error('Failed to create health check');
      }

      if (data) {
        // Optimistic UI update - add new health check to the top of the list
        setHealthChecks((prev) => [data.healthCheck, ...prev]);
      }
    } catch (err) {
      setPingError(
        err instanceof Error ? err.message : 'An unknown error occurred'
      );
    } finally {
      setPinging(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">
            Health Check Records
          </h1>
          <button
            onClick={handlePing}
            disabled={pinging || loading}
            className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-md transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {pinging ? 'Pinging...' : 'Ping'}
          </button>
        </div>

        {/* Ping Error State */}
        {pingError && (
          <div className="mb-4 rounded-lg bg-yellow-50 p-4 shadow">
            <h3 className="mb-1 font-semibold text-yellow-900">
              Failed to Create Health Check
            </h3>
            <p className="text-yellow-700">{pingError}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading health checks...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="rounded-lg bg-red-50 p-6 shadow">
            <h2 className="mb-2 text-lg font-semibold text-red-900">
              Error Loading Health Checks
            </h2>
            <p className="text-red-700">{error}</p>
            <p className="mt-4 text-sm text-red-600">
              Make sure the server is running (default: http://localhost:3001).
              API requests are proxied through /api via Next.js rewrites.
            </p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && healthChecks.length === 0 && (
          <div className="rounded-lg bg-white p-8 text-center shadow">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h2 className="mt-4 text-lg font-semibold text-gray-900">
              No health checks yet
            </h2>
            <p className="mt-2 text-gray-600">
              The database is empty. Health check records will appear here once
              created.
            </p>
          </div>
        )}

        {/* Health Check List */}
        {!loading && !error && healthChecks.length > 0 && (
          <div className="space-y-4">
            {healthChecks.map((check) => (
              <div
                key={check.id}
                className="rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-lg font-medium text-gray-900">
                      {check.message}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {new Date(check.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                    OK
                  </span>
                </div>
                <p className="mt-3 text-xs font-mono text-gray-400">
                  ID: {check.id}
                </p>
              </div>
            ))}

            <div className="mt-6 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center">
              <p className="text-sm text-gray-600">
                Showing {healthChecks.length} health check
                {healthChecks.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
