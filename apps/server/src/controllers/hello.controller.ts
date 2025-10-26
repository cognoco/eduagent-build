// DEV: Temporary controller for infrastructure validation (tasks 4.1.10 & 4.1.11)
// May be removed or evolved into permanent health-check endpoint after Phase 1

import type { Request, Response } from 'express';

export const helloController = {
  /**
   * GET /api/hello
   * Returns a simple hello message with timestamp for infrastructure testing
   */
  greet(_req: Request, res: Response): void {
    res.json({
      message: 'Hello, World!',
      timestamp: Date.now(),
    });
  },
};
