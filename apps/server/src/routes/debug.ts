/**
 * Debug Routes
 *
 * These routes are for testing and debugging purposes only.
 * They should only be available in non-production environments.
 */

import { Router, type Router as RouterType } from 'express';

export const debugRouter: RouterType = Router();

/**
 * Sentry Test Endpoint
 *
 * Throws an intentional error to verify Sentry integration.
 * This endpoint is only available in non-production environments.
 *
 * Usage: GET /api/debug/sentry-test
 *
 * Expected behavior:
 * 1. Error is thrown
 * 2. Sentry captures the error
 * 3. Error appears in Sentry dashboard
 * 4. Stack trace should be readable (if source maps configured)
 */
debugRouter.get('/sentry-test', (_req, res, next) => {
  // Only allow in non-production environments
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({
      error: 'Not Found',
      message: 'Debug endpoints are not available in production',
    });
  }

  try {
    // Throw an intentional error for testing
    throw new Error(
      'Sentry Test Error - This is an intentional error to verify Sentry integration'
    );
  } catch (error) {
    // Pass to error handler middleware (which includes Sentry)
    return next(error);
  }
});

/**
 * Health Check for Debug Router
 *
 * Verifies the debug router is mounted correctly.
 */
debugRouter.get('/ping', (_req, res) => {
  res.json({
    message: 'Debug router is working',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});
