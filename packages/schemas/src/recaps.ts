import { z } from 'zod';

import { isoDateField } from './common.ts';
import { engagementSignalSchema, sessionTypeSchema } from './sessions';

export const recapsQuerySchema = z.object({
  childProfileId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type RecapsQuery = z.infer<typeof recapsQuerySchema>;

export const recapListItemSchema = z.object({
  recapId: z.string().uuid(),
  sessionId: z.string().uuid(),
  childProfileId: z.string().uuid(),
  childDisplayName: z.string(),
  subjectId: z.string().uuid(),
  subjectName: z.string().nullable(),
  topicId: z.string().uuid().nullable(),
  topicTitle: z.string().nullable(),
  sessionType: sessionTypeSchema,
  startedAt: isoDateField,
  endedAt: isoDateField.nullable(),
  exchangeCount: z.number().int().min(0),
  displayTitle: z.string(),
  displaySummary: z.string().nullable(),
  highlight: z.string().nullable(),
  narrative: z.string().nullable(),
  conversationPrompt: z.string().nullable(),
  engagementSignal: engagementSignalSchema.nullable(),
  // Next-topic the mentor lined up at session end. Additive + nullable: both
  // null when the stored summary has no `next_topic_id`, and default to null so
  // older API responses remain readable by newer mobile builds. Surfaced on the
  // parent recap list only (see services/recaps.ts → listRecapsForParent); the
  // recap *generation* path is unchanged. Powers the home card's "Coming up" line.
  nextTopicTitle: z.string().nullable().default(null),
  nextTopicReason: z.string().nullable().default(null),
  // Verified proof is additive + nullable: null when this session/topic has no
  // explicitly marked Challenge-drafted note, and defaulted so older API
  // responses remain readable by newer mobile builds.
  verifiedProof: z
    .object({
      topicId: z.string().uuid(),
      topicTitle: z.string(),
      subjectId: z.string().uuid().nullable(),
      verifiedAt: z.string(),
      verificationState: z.enum(['unverified', 'fresh', 'stale']),
      retentionStatus: z
        .enum(['strong', 'fading', 'weak', 'forgotten'])
        .nullable(),
      nextReviewDate: z.string().nullable(),
      quote: z.string().nullable(),
    })
    .nullable()
    .default(null),
});
export type RecapListItem = z.infer<typeof recapListItemSchema>;

export const recapsResponseSchema = z.object({
  recaps: z.array(recapListItemSchema),
});
export type RecapsResponse = z.infer<typeof recapsResponseSchema>;

export const recapDetailResponseSchema = z.object({
  recap: recapListItemSchema,
});
export type RecapDetailResponse = z.infer<typeof recapDetailResponseSchema>;
