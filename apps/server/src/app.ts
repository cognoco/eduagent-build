import express, { type Express } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import * as Sentry from '@sentry/node';
import { apiRouter } from './routes/index.js';
import { getOpenApiSpec } from './openapi/index.js';

/**
 * Create Express App
 *
 * Exported for testing purposes. Tests can instantiate the app
 * without starting the HTTP server or binding to ports.
 *
 * Note: Sentry v8+ uses OpenTelemetry for automatic instrumentation.
 * Request and tracing handlers are no longer needed as middleware.
 * Only setupExpressErrorHandler() is required after routes.
 *
 * @returns Configured Express application
 */
export function createApp(): Express {
  const app = express();

  // Standard middleware
  app.use(express.json());

  // CORS configuration
  // Goals:
  // - Keep strict allowlisting in production (credentials-enabled CORS cannot use '*')
  // - Make local dev resilient to port changes (e.g. Expo web can bump 8081 → 8082)
  // - Fail fast in production if CORS is misconfigured (security by default)
  //
  // Priority:
  // 1) Production REQUIRES CORS_ORIGIN to be set (fails at startup otherwise).
  // 2) If CORS_ORIGIN is set, treat it as an explicit comma-separated allowlist.
  // 3) Development (without CORS_ORIGIN): allow localhost / 127.0.0.1 on ANY port.
  const explicitCorsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : null;

  const isProduction = process.env.NODE_ENV === 'production';

  // Fail fast in production if CORS is not explicitly configured
  if (isProduction && !explicitCorsOrigins) {
    throw new Error(
      'CORS_ORIGIN environment variable must be set in production. ' +
        'Example: CORS_ORIGIN=https://yourdomain.com,https://api.yourdomain.com'
    );
  }

  const devLocalOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

  const corsOrigin: cors.CorsOptions['origin'] = (origin, callback) => {
    // Some clients (curl, server-to-server) send no Origin header; allow these.
    if (!origin) {
      return callback(null, true);
    }

    // 1) Explicit allowlist from env var.
    if (explicitCorsOrigins) {
      return callback(null, explicitCorsOrigins.includes(origin));
    }

    // 2) Development: allow localhost + 127.0.0.1 on any port (handles Expo web port bumps).
    //    Production without CORS_ORIGIN already threw at startup, so this only runs in dev.
    if (!isProduction && devLocalOriginRegex.test(origin)) {
      return callback(null, true);
    }

    // Default deny (production always has CORS_ORIGIN set due to startup check).
    return callback(null, false);
  };

  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );

  // Root endpoint (keep for backwards compatibility)
  app.get('/', (_req, res) => {
    res.send({ message: 'Hello API' });
  });

  // OpenAPI Documentation
  const openApiSpec = getOpenApiSpec();

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      explorer: true,
      customSiteTitle: 'NX Monorepo API Docs',
    })
  );

  // Mount API routes under /api prefix
  app.use('/api', apiRouter);

  // Sentry error handler (v8+ API)
  // MUST be after all routes but before any other error-handling middleware
  // This captures any uncaught errors and sends them to Sentry
  Sentry.setupExpressErrorHandler(app);

  // Generic error handler for formatting error responses
  // This should come AFTER Sentry's error handler
  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // If headers already sent, delegate to default Express error handler
      if (res.headersSent) {
        return next(err);
      }

      // Log error for debugging
      console.error('Unhandled error:', err);

      // Send generic error response
      res.status(500).json({
        error: 'Internal Server Error',
        message:
          process.env.NODE_ENV === 'development'
            ? err.message
            : 'Something went wrong',
      });
    }
  );

  return app;
}
