import { z } from 'zod';
import { isoDateField } from './common.ts';

export const evidenceLinkKindSchema = z.enum([
  'artifact',
  'transcript_excerpt',
]);
export type EvidenceLinkKind = z.infer<typeof evidenceLinkKindSchema>;

/**
 * Metadata-only evidence record. IDs intentionally have no foreign keys because
 * transcript retention may purge their targets; consumers must resolve them
 * safely at read time and never expose source text through this contract.
 */
export const evidenceLinkSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  fromKind: evidenceLinkKindSchema,
  fromId: z.string().uuid(),
  toKind: evidenceLinkKindSchema,
  toId: z.string().uuid(),
  createdAt: isoDateField,
});
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;

export const evidenceAvailabilitySchema = z.enum([
  'available',
  'source_unavailable',
]);
export type EvidenceAvailability = z.infer<typeof evidenceAvailabilitySchema>;

/** Safe reader output: intentionally excludes any source/transcript content. */
export const evidenceLinkResolutionSchema = z.object({
  evidenceLinkId: z.string().uuid(),
  toKind: evidenceLinkKindSchema,
  availability: evidenceAvailabilitySchema,
});
export type EvidenceLinkResolution = z.infer<
  typeof evidenceLinkResolutionSchema
>;
