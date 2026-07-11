import { z } from 'zod';
import { isoDateField } from './common.ts';

export const notificationTypeSchema = z.enum([
  'review_reminder',
  'daily_reminder',
  'trial_expiry',
  'payment_failed',
  'streak_warning',
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
  // [WI-179] Re-uses the rate-limit / notification-log table to track outbox
  // spillover requests per profile. NOT a user-visible notification — never
  // dispatched via push/email. The shared `notification_log` table provides
  // an atomic check-and-log primitive (`checkAndLogRateLimit` in services/settings)
  // that this route piggybacks on so we don't need a parallel rate-limit store.
  'support_outbox_spillover',
]);

export const nudgeTemplateSchema = z.enum([
  'you_got_this',
  'proud_of_you',
  'quick_session',
  'thinking_of_you',
]);
export type NudgeTemplate = z.infer<typeof nudgeTemplateSchema>;

// ---------------------------------------------------------------------------
// [CR-178] Typed notification data shapes — discriminated union by type.
//
// `nudge` is the only type that currently carries a structured data payload
// (nudgeId, fromDisplayName, templateKey — forwarded to the mobile
// deep-link handler in nudge.ts). All other types confirmed to pass no
// `data` at current call sites (grep apps/api/src/**/*.ts, 2026-05-22).
//
// To add a new type with data: add a new z.object variant to the union below
// with `type: z.literal('<new-type>')` and the specific `data` shape.
// ---------------------------------------------------------------------------

const notificationBaseSchema = z.object({
  profileId: z.string().uuid(),
  title: z.string(),
  body: z.string(),
});

/** nudge: carries structured data forwarded to the mobile deep-link handler */
const nudgePayloadSchema = notificationBaseSchema.extend({
  type: z.literal('nudge'),
  data: z.object({
    nudgeId: z.string().uuid(),
    fromDisplayName: z.string(),
    templateKey: nudgeTemplateSchema,
  }),
});

const paymentFailedPayloadSchema = notificationBaseSchema.extend({
  type: z.literal('payment_failed'),
  data: z.object({
    payerPersonId: z.string().uuid(),
  }),
});

/** All other types: no structured data payload at current call sites */
const noDataPayloadSchema = notificationBaseSchema.extend({
  // [CR-178] Exclude 'nudge' so this branch can't accidentally match it —
  // new types added to notificationTypeSchema automatically fall here unless
  // a dedicated typed variant is added above.
  type: notificationTypeSchema.exclude(['nudge', 'payment_failed']),
  data: z.undefined().optional(),
});

export const notificationPayloadSchema = z.union([
  nudgePayloadSchema,
  paymentFailedPayloadSchema,
  noDataPayloadSchema,
]);
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

export const nudgeCreateSchema = z
  .object({
    toProfileId: z.string().uuid(),
    template: nudgeTemplateSchema,
  })
  .strict();
export type NudgeCreateInput = z.infer<typeof nudgeCreateSchema>;

export const nudgeSchema = z.object({
  id: z.string().uuid(),
  fromProfileId: z.string().uuid(),
  toProfileId: z.string().uuid(),
  fromDisplayName: z.string(),
  template: nudgeTemplateSchema,
  createdAt: isoDateField,
  readAt: isoDateField.nullable(),
});
export type Nudge = z.infer<typeof nudgeSchema>;

export const nudgeListResponseSchema = z.object({
  nudges: z.array(nudgeSchema),
});
export type NudgeListResponse = z.infer<typeof nudgeListResponseSchema>;

export const nudgeCreateResponseSchema = z.object({
  nudge: nudgeSchema,
  pushSent: z.boolean(),
});

export const nudgeMarkReadResponseSchema = z.object({
  success: z.literal(true),
  count: z.number().int().nonnegative(),
});

export const childCapNotificationKindSchema = z.enum([
  'daily_exceeded',
  'monthly_exceeded',
]);
export type ChildCapNotificationKind = z.infer<
  typeof childCapNotificationKindSchema
>;

export const childCapNotificationSchema = z.object({
  id: z.string().uuid(),
  ownerProfileId: z.string().uuid(),
  childProfileId: z.string().uuid(),
  childDisplayName: z.string(),
  kind: childCapNotificationKindSchema,
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  resetsAt: isoDateField,
  createdAt: isoDateField,
});
export type ChildCapNotification = z.infer<typeof childCapNotificationSchema>;

export const childCapNotificationsResponseSchema = z.object({
  notifications: z.array(childCapNotificationSchema),
});

export const childCapNotificationDismissResponseSchema = z.object({
  success: z.literal(true),
});

export const childCapNotifyParentInputSchema = z
  .object({
    kind: childCapNotificationKindSchema,
    resetsAt: isoDateField,
  })
  .strict();
export type ChildCapNotifyParentInput = z.infer<
  typeof childCapNotifyParentInputSchema
>;

export const childCapNotifyParentResponseSchema = z.object({
  sent: z.boolean(),
});
