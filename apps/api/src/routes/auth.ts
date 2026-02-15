import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  registerSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
} from '@eduagent/schemas';

export const auth = new Hono()
  .post('/auth/register', zValidator('json', registerSchema), async (c) => {
    const input = c.req.valid('json');
    // In production, Clerk handles registration via webhook.
    // This endpoint receives the validated data and creates the local account record.
    // For now, return the validated input to prove the route works.
    return c.json(
      { message: 'Registration initiated', email: input.email },
      201
    );
  })
  .post(
    '/auth/password-reset-request',
    zValidator('json', passwordResetRequestSchema),
    async (c) => {
      // Clerk handles the actual reset email. This endpoint is for client-side validation.
      return c.json({
        message: 'If an account exists, a reset email has been sent',
      });
    }
  )
  .post(
    '/auth/password-reset',
    zValidator('json', passwordResetSchema),
    async (c) => {
      // Clerk handles token verification. This validates the new password meets requirements.
      return c.json({ message: 'Password has been reset' });
    }
  );
