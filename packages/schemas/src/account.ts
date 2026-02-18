import { z } from 'zod';
import { profileSchema } from './profiles.js';
import { consentStatusSchema, consentTypeSchema } from './consent.js';

export const accountDeletionResponseSchema = z.object({
  message: z.string(),
  gracePeriodEnds: z.string().datetime(),
});

export type AccountDeletionResponse = z.infer<
  typeof accountDeletionResponseSchema
>;

export const cancelDeletionResponseSchema = z.object({
  message: z.string(),
});
export type CancelDeletionResponse = z.infer<
  typeof cancelDeletionResponseSchema
>;

export const dataExportConsentSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  consentType: consentTypeSchema,
  status: consentStatusSchema,
  parentEmail: z.string().email().nullable(),
  requestedAt: z.string().datetime(),
  respondedAt: z.string().datetime().nullable(),
});

export const dataExportSchema = z.object({
  account: z.object({
    email: z.string().email(),
    createdAt: z.string().datetime(),
  }),
  profiles: z.array(profileSchema),
  consentStates: z.array(dataExportConsentSchema),
  exportedAt: z.string().datetime(),
});

export type DataExport = z.infer<typeof dataExportSchema>;
