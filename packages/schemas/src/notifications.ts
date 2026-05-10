import { z } from 'zod';

export const notificationTypeSchema = z.enum([
  'review_reminder',
  'daily_reminder',
  'trial_expiry',
  'consent_request',
  'consent_reminder',
  'consent_warning',
  'consent_expired',
  'consent_archived',
  'subscribe_request',
  'recall_nudge',
  'weekly_progress',
  'monthly_report',
  'progress_refresh',
  'struggle_noticed',
  'struggle_flagged',
  'struggle_resolved',
  'dictation_review',
  'session_filing_failed',
  'nudge',
]);

export const nudgeTemplateSchema = z.enum([
  'you_got_this',
  'proud_of_you',
  'quick_session',
  'thinking_of_you',
]);
export type NudgeTemplate = z.infer<typeof nudgeTemplateSchema>;

export const notificationPayloadSchema = z.object({
  profileId: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  type: notificationTypeSchema,
  data: z.record(z.string(), z.string()).optional(),
});
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

export const nudgeCreateSchema = z.object({
  toProfileId: z.string().uuid(),
  template: nudgeTemplateSchema,
});
export type NudgeCreateInput = z.infer<typeof nudgeCreateSchema>;

export const nudgeSchema = z.object({
  id: z.string().uuid(),
  fromProfileId: z.string().uuid(),
  toProfileId: z.string().uuid(),
  fromDisplayName: z.string(),
  template: nudgeTemplateSchema,
  createdAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
});
export type Nudge = z.infer<typeof nudgeSchema>;

export const nudgeListResponseSchema = z.object({
  nudges: z.array(nudgeSchema),
});

export const nudgeCreateResponseSchema = z.object({
  nudge: nudgeSchema,
  pushSent: z.boolean(),
});

export const nudgeMarkReadResponseSchema = z.object({
  success: z.literal(true),
  count: z.number().int().nonnegative(),
});
