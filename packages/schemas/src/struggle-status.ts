import { z } from 'zod';

export const struggleStatusSchema = z.enum([
  'normal',
  'needs_deepening',
  'blocked',
]);
export type StruggleStatus = z.infer<typeof struggleStatusSchema>;
