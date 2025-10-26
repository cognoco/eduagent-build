import { Request, Response } from 'express';

/**
 * Health check controller
 * Handles HTTP request/response for health endpoints
 */
export const healthController = {
  /**
   * Basic health check
   * Returns server status and timestamp
   */
  check(_req: Request, res: Response): void {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      message: 'Server is running',
    });
  },
};
