import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const timestampSchema = z.string().datetime();

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

// Chat exchange — reusable across interview, assessment, and session histories

export const chatExchangeSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatExchange = z.infer<typeof chatExchangeSchema>;
