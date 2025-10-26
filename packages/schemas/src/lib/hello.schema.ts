// DEV: Temporary schema for infrastructure validation (tasks 4.1.10 & 4.1.11)
// May be removed or evolved into permanent health-check endpoint after Phase 1

import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const HelloResponseSchema = z
  .object({
    message: z.string().openapi({
      description: 'Greeting message',
      example: 'Hello, World!',
    }),
    timestamp: z.number().openapi({
      description: 'Unix timestamp when response was generated',
      example: 1730000000000,
    }),
  })
  .openapi('HelloResponse', {
    description: 'Simple hello response for infrastructure testing',
  });

export type HelloResponse = z.infer<typeof HelloResponseSchema>;
