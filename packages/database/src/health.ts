// WALKING SKELETON: Delete after infrastructure validation
// Health check database operations
// Purpose: Demonstrate Prisma ORM queries for infrastructure validation

import { prisma } from './lib/prisma-client.js';
import type { HealthCheck } from '@prisma/client';

/**
 * Retrieve all health check records from the database
 *
 * @returns Promise resolving to array of HealthCheck records, ordered by timestamp descending
 * @example
 * ```typescript
 * const healthChecks = await getHealthChecks();
 * console.log(`Found ${healthChecks.length} health checks`);
 * ```
 */
export async function getHealthChecks(): Promise<HealthCheck[]> {
  return prisma.healthCheck.findMany({
    orderBy: {
      timestamp: 'desc',
    },
  });
}

/**
 * Create a new health check record in the database
 *
 * @param message - Optional custom message for the health check (defaults to "Health check ping")
 * @returns Promise resolving to the created HealthCheck record
 * @example
 * ```typescript
 * const healthCheck = await createHealthCheck('System status check');
 * console.log(`Created health check with ID: ${healthCheck.id}`);
 * ```
 */
export async function createHealthCheck(
  message?: string
): Promise<HealthCheck> {
  return prisma.healthCheck.create({
    data: {
      message: message ?? 'Health check ping',
    },
  });
}
