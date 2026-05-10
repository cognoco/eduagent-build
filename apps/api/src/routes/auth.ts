import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  registerSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  ERROR_CODES,
} from '@eduagent/schemas';

export const auth = new Hono()
  .post('/auth/register', zValidator('json', registerSchema), async (c) => {
    // Registration is handled by Clerk — this server-side stub is not implemented.
    return c.json(
      {
        code: ERROR_CODES.NOT_IMPLEMENTED,
        message:
          'Registration is handled by Clerk — this endpoint is not implemented',
      },
      501,
    );
  })
  .post(
    '/auth/password-reset-request',
    zValidator('json', passwordResetRequestSchema),
    async (c) => {
      // Password reset requests are handled by Clerk — this stub is not implemented.
      return c.json(
        {
          code: ERROR_CODES.NOT_IMPLEMENTED,
          message:
            'Password reset is handled by Clerk — this endpoint is not implemented',
        },
        501,
      );
    },
  )
  .post(
    '/auth/password-reset',
    zValidator('json', passwordResetSchema),
    async (c) => {
      // Password reset token verification is handled by Clerk — this stub is not implemented.
      return c.json(
        {
          code: ERROR_CODES.NOT_IMPLEMENTED,
          message:
            'Password reset is handled by Clerk — this endpoint is not implemented',
        },
        501,
      );
    },
  );
