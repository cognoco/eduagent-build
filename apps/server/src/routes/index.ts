import { Router, type Router as RouterType } from 'express';
import { healthRouter } from './health';

/**
 * API router aggregator
 * Centralizes all route mounting decisions
 * Mounted at /api in main.ts
 */
export const apiRouter: RouterType = Router();

// Mount health routes at /health
// Combined with /api prefix = /api/health
apiRouter.use('/health', healthRouter);

// Future routes would be mounted here:
// apiRouter.use('/users', userRouter);
// apiRouter.use('/posts', postRouter);
