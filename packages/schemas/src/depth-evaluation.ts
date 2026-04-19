import { z } from 'zod';

export const detectedTopicSchema = z.object({
  summary: z.string().min(1).max(80),
  depth: z.enum(['substantial', 'partial', 'introduced']),
});
export type DetectedTopic = z.infer<typeof detectedTopicSchema>;

export const depthEvaluationMethodSchema = z.enum([
  'heuristic_shallow',
  'heuristic_deep',
  'llm_gate',
  'fail_open',
]);
export type DepthEvaluationMethod = z.infer<typeof depthEvaluationMethodSchema>;

export const depthEvaluationSchema = z.object({
  meaningful: z.boolean(),
  reason: z.string(),
  method: depthEvaluationMethodSchema,
  topics: z.array(detectedTopicSchema),
});
export type DepthEvaluation = z.infer<typeof depthEvaluationSchema>;
