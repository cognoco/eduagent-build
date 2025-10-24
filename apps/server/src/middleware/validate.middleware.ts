import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Validation middleware factory for Zod schemas
 * Imports schemas from @nx-monorepo/schemas package
 */
export const validateBody = (schema: z.ZodType<any>) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.issues,
        });
        return;
      }
      next(error);
    }
  };
};

export const validateQuery = (schema: z.ZodType<any>) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await schema.parseAsync(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.issues,
        });
        return;
      }
      next(error);
    }
  };
};

export const validateParams = (schema: z.ZodType<any>) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await schema.parseAsync(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid URL parameters',
          details: error.issues,
        });
        return;
      }
      next(error);
    }
  };
};
