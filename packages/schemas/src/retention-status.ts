import { z } from 'zod';

export const retentionStatusSchema = z.enum([
  'strong',
  'fading',
  'weak',
  'forgotten',
]);
export type RetentionStatus = z.infer<typeof retentionStatusSchema>;
