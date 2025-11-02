import { Router, type Router as RouterType } from 'express';
import { healthRouter } from './health.js';
import { helloRouter } from './hello.js';

/**
 * API router aggregator
 * Centralizes all route mounting decisions
 * Mounted at /api in main.ts
 */
export const apiRouter: RouterType = Router();

// Mount health routes at /health
// Combined with /api prefix = HTTP path /api/health
// OpenAPI spec shows path /health with servers: [{ url: '/api' }]
apiRouter.use('/health', healthRouter);

// DEV: Temporary infrastructure validation route (tasks 4.1.10 & 4.1.11)
// Combined with /api prefix = /api/hello
apiRouter.use('/hello', helloRouter);

// Future routes would be mounted here:
// apiRouter.use('/users', userRouter);
// apiRouter.use('/posts', postRouter);
