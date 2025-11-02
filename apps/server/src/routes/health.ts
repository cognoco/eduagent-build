import { Router, type Router as RouterType } from 'express';
import { healthController } from '../controllers/health.controller.js';

/**
 * Health check routes
 * Path-agnostic - routes are relative to mount point
 * Mounted at /health in routes/index.ts
 */
export const healthRouter: RouterType = Router();

// GET / (relative to mount point)
// Will be accessible at /api/health when mounted
healthRouter.get('/', healthController.check);

// POST /ping (relative to mount point)
// Will be accessible at /api/health/ping when mounted
healthRouter.post('/ping', healthController.ping);
