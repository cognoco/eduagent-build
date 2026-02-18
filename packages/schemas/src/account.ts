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
  // GDPR Article 15 — all personal data
  subjects: z.array(z.record(z.string(), z.unknown())).optional(),
  curricula: z.array(z.record(z.string(), z.unknown())).optional(),
  curriculumTopics: z.array(z.record(z.string(), z.unknown())).optional(),
  learningSessions: z.array(z.record(z.string(), z.unknown())).optional(),
  sessionEvents: z.array(z.record(z.string(), z.unknown())).optional(),
  sessionSummaries: z.array(z.record(z.string(), z.unknown())).optional(),
  retentionCards: z.array(z.record(z.string(), z.unknown())).optional(),
  assessments: z.array(z.record(z.string(), z.unknown())).optional(),
  xpLedger: z.array(z.record(z.string(), z.unknown())).optional(),
  streaks: z.array(z.record(z.string(), z.unknown())).optional(),
  notificationPreferences: z
    .array(z.record(z.string(), z.unknown()))
    .optional(),
  learningModes: z.array(z.record(z.string(), z.unknown())).optional(),
  teachingPreferences: z.array(z.record(z.string(), z.unknown())).optional(),
  onboardingDrafts: z.array(z.record(z.string(), z.unknown())).optional(),
  parkingLotItems: z.array(z.record(z.string(), z.unknown())).optional(),
  exportedAt: z.string().datetime(),
});

export type DataExport = z.infer<typeof dataExportSchema>;
