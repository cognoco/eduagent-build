import { z } from 'zod';

export const uuidSchema = z.string().uuid();

/**
 * Accepts an ISO 8601 datetime string OR a JS `Date` (e.g. from neon-serverless
 * which returns raw Date objects), normalising both to an ISO string.
 *
 * Use this in RESPONSE schemas — anywhere a Drizzle row is being parsed.
 * For REQUEST body schemas (untrusted client input that should be a string),
 * use `z.string().datetime()` directly.
 *
 * Hoisted from `subjects.ts` / `notes.ts` in 2026-05-18 schemas tightening
 * (BUG-205). See `project_drizzle_date_objects.md` memory entry.
 */
export const isoDateField = z.union([
  z.string().datetime(),
  z.date().transform((d) => d.toISOString()),
]);

/** YYYY-MM-DD calendar date (e.g. "2026-04-10") */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
