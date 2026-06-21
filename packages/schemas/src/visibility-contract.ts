import { z } from 'zod';
import { isoDateField } from './common.ts';

export const reportableFactKindSchema = z.enum([
  'mastery',
  'effort',
  'observable_engagement',
]);
export type ReportableFactKind = z.infer<typeof reportableFactKindSchema>;

export const renderAudienceSchema = z.enum(['supporter', 'supportee']);
export type RenderAudience = z.infer<typeof renderAudienceSchema>;

export const supporterRelationSchema = z.enum([
  'parent',
  'sibling',
  'teacher',
  'other',
]);
export type SupporterRelation = z.infer<typeof supporterRelationSchema>;

export const visibilityContractStatusSchema = z.enum([
  'pending',
  'accepted',
  'revoked',
  'restamped',
  'lapsed',
]);
export type VisibilityContractStatus = z.infer<
  typeof visibilityContractStatusSchema
>;

export const visibilityNoticeTypeSchema = z.enum([
  'support_link_ended',
  'graduation_contract_restamped',
]);
export type VisibilityNoticeType = z.infer<typeof visibilityNoticeTypeSchema>;

export const visibilityContractSchema = z.object({
  id: z.string().uuid(),
  supportershipId: z.string().uuid(),
  supporterPersonId: z.string().uuid(),
  supporteePersonId: z.string().uuid(),
  relation: supporterRelationSchema,
  status: visibilityContractStatusSchema,
  contractVersion: z.number().int().positive(),
  reportableKinds: z.array(reportableFactKindSchema).nonempty(),
  artifactWall: z.literal(true),
  renderEquivalence: z.literal(true),
  safetyException: z.literal(true),
  supporterAcceptedAt: isoDateField.nullable(),
  supporteeAcceptedAt: isoDateField.nullable(),
  createdAt: isoDateField,
  updatedAt: isoDateField,
});
export type VisibilityContract = z.infer<typeof visibilityContractSchema>;

export const contractAcceptanceSchema = z.object({
  contractId: z.string().uuid(),
  actorPersonId: z.string().uuid(),
  audience: renderAudienceSchema,
  acceptedAt: isoDateField,
});
export type ContractAcceptance = z.infer<typeof contractAcceptanceSchema>;

export const reportableFactSchema = z.object({
  id: z.string().min(1).max(128),
  kind: reportableFactKindSchema,
  title: z.string().min(1).max(200),
  detail: z.string().max(1000).optional(),
  occurredAt: isoDateField.optional(),
  source: z.string().min(1).max(64),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ReportableFact = z.infer<typeof reportableFactSchema>;

export const sharedRecordViewSchema = z.object({
  audience: renderAudienceSchema,
  factIds: z.array(z.string().min(1)).readonly(),
  headline: z.string().min(1).max(200),
  facts: z.array(reportableFactSchema),
});
export type SharedRecordView = z.infer<typeof sharedRecordViewSchema>;

export const sharedRecordSchema = z.object({
  supportershipId: z.string().uuid(),
  generatedAt: isoDateField,
  factIds: z.array(z.string().min(1)).readonly(),
  supporterView: sharedRecordViewSchema.extend({
    audience: z.literal('supporter'),
  }),
  supporteeView: sharedRecordViewSchema.extend({
    audience: z.literal('supportee'),
  }),
});
export type SharedRecord = z.infer<typeof sharedRecordSchema>;

export const appealRequestSchema = z.object({
  supportershipId: z.string().uuid(),
  supporteePersonId: z.string().uuid(),
  requestedAt: isoDateField,
  reason: z.string().max(500).optional(),
});
export type AppealRequest = z.infer<typeof appealRequestSchema>;

export const appealReportSchema = z.object({
  supportershipId: z.string().uuid(),
  generatedAt: isoDateField,
  report: z.string().min(1).max(4000),
  facts: z.array(reportableFactSchema),
  artifactWall: z.literal(true),
});
export type AppealReport = z.infer<typeof appealReportSchema>;

export const revocationNoticeSchema = z.object({
  supportershipId: z.string().uuid(),
  supporteePersonId: z.string().uuid(),
  supporterPersonId: z.string().uuid(),
  revokedAt: isoDateField,
  graceEndsAt: isoDateField,
});
export type RevocationNotice = z.infer<typeof revocationNoticeSchema>;

export const visibilityMomentSchema = z.object({
  id: z.string().min(1),
  type: visibilityNoticeTypeSchema,
  supportershipId: z.string().uuid(),
  targetAudience: renderAudienceSchema,
  targetPersonId: z.string().uuid(),
  createdAt: isoDateField,
  acknowledgedAt: isoDateField.nullable(),
  payload: z.record(z.string(), z.unknown()),
});
export type VisibilityMoment = z.infer<typeof visibilityMomentSchema>;

export const coLearningPromptPayloadSchema = z.object({
  supportershipId: z.string().uuid(),
  supporterPersonId: z.string().uuid(),
  supporteePersonId: z.string().uuid(),
  suggestedText: z.string().min(1).max(500),
  dismissible: z.literal(true),
  fillOnly: z.literal(true),
  readReceipt: z.literal(false),
});
export type CoLearningPromptPayload = z.infer<
  typeof coLearningPromptPayloadSchema
>;

export const visibilityLinkInitiateSchema = z.object({
  supporterPersonId: z.string().uuid(),
  supporteePersonId: z.string().uuid(),
  relation: supporterRelationSchema,
  managedTier: z.boolean().default(false),
});
export type VisibilityLinkInitiate = z.infer<
  typeof visibilityLinkInitiateSchema
>;

export const visibilityLinkAcceptSchema = z.object({
  actorPersonId: z.string().uuid(),
  audience: renderAudienceSchema,
});
export type VisibilityLinkAccept = z.infer<typeof visibilityLinkAcceptSchema>;
