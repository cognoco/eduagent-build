import { z } from 'zod';

export const detectedTopicSchema = z.object({
  summary: z.string().min(1).max(80),
  depth: z.enum(['substantial', 'partial', 'introduced']),
});
export type DetectedTopic = z.infer<typeof detectedTopicSchema>;
