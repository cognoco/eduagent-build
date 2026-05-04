import { z } from 'zod';

export const feedbackCategorySchema = z.enum(['bug', 'suggestion', 'other']);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const feedbackSubmissionSchema = z.object({
  category: feedbackCategorySchema,
  message: z.string().min(1).max(2000),
  appVersion: z.string().max(20).optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
  osVersion: z.string().max(30).optional(),
});
export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;

export const feedbackResponseSchema = z.object({
  success: z.boolean(),
  queued: z.boolean(),
});
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;
