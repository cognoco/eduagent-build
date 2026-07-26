import { z } from 'zod';
import { isoDateField } from './common.ts';

export const learnerSourceKindSchema = z.enum([
  'note',
  'bookmark',
  'transcript_excerpt',
  'homework_ocr',
]);
export type LearnerSourceKind = z.infer<typeof learnerSourceKindSchema>;

const learnerSourceMetadataSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  topicId: z.string().uuid().optional(),
  subjectId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  excerpt: z.string(),
  createdAt: isoDateField,
});

export const learnerSourceSchema = z.discriminatedUnion('kind', [
  learnerSourceMetadataSchema.extend({ kind: z.literal('note') }),
  learnerSourceMetadataSchema.extend({ kind: z.literal('bookmark') }),
  learnerSourceMetadataSchema.extend({
    kind: z.literal('transcript_excerpt'),
  }),
  learnerSourceMetadataSchema.extend({ kind: z.literal('homework_ocr') }),
]);
export type LearnerSource = z.infer<typeof learnerSourceSchema>;

export const evidenceLinkFromKindSchema = z.enum(['artifact', 'exchange']);
export type EvidenceLinkFromKind = z.infer<typeof evidenceLinkFromKindSchema>;

export const evidenceLinkToKindSchema = learnerSourceKindSchema;
export type EvidenceLinkToKind = z.infer<typeof evidenceLinkToKindSchema>;

/**
 * Metadata-only evidence record. IDs intentionally have no foreign keys because
 * transcript retention may purge their targets; consumers must resolve them
 * safely at read time and never expose source text through this contract.
 */
export const evidenceLinkSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  fromKind: evidenceLinkFromKindSchema,
  fromId: z.string().uuid(),
  toKind: evidenceLinkToKindSchema,
  toId: z.string().uuid(),
  createdAt: isoDateField,
});
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;

export const evidenceAvailabilitySchema = z.enum([
  'available',
  'source_unavailable',
]);
export type EvidenceAvailability = z.infer<typeof evidenceAvailabilitySchema>;

export const verifiedEvidenceQuoteSchema = z.discriminatedUnion(
  'evidenceAvailability',
  [
    z.object({
      evidenceAvailability: z.literal('available'),
      quote: z.string().nullable(),
    }),
    z.object({
      evidenceAvailability: z.literal('source_unavailable'),
      quote: z.null(),
    }),
  ],
);
export type VerifiedEvidenceQuote = z.infer<typeof verifiedEvidenceQuoteSchema>;

/** Safe reader output: intentionally excludes any source/transcript content. */
export const evidenceLinkResolutionSchema = z.object({
  evidenceLinkId: z.string().uuid(),
  toKind: evidenceLinkToKindSchema,
  availability: evidenceAvailabilitySchema,
});
export type EvidenceLinkResolution = z.infer<
  typeof evidenceLinkResolutionSchema
>;
