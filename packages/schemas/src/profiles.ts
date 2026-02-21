import { z } from 'zod';
import { consentStatusSchema } from './consent.js';

export const personaTypeSchema = z.enum(['TEEN', 'LEARNER', 'PARENT']);
export type PersonaType = z.infer<typeof personaTypeSchema>;

export const profileCreateSchema = z.object({
  displayName: z.string().min(1).max(50),
  birthDate: z.string().date().optional(),
  personaType: personaTypeSchema.default('LEARNER'),
  avatarUrl: z.string().url().optional(),
});

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;

export const profileUpdateSchema = profileCreateSchema.partial();
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const profileSwitchSchema = z.object({
  profileId: z.string().uuid(),
});

export type ProfileSwitchInput = z.infer<typeof profileSwitchSchema>;

export const profileSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  birthDate: z.string().date().nullable(),
  personaType: personaTypeSchema,
  isOwner: z.boolean(),
  consentStatus: consentStatusSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Profile = z.infer<typeof profileSchema>;
