import { z } from 'zod';
import { consentStatusSchema } from './consent.ts';

export const locationSchema = z.enum(['EU', 'US', 'OTHER']);
export type LocationType = z.infer<typeof locationSchema>;

export const birthYearSchema = z
  .number()
  .int()
  .refine((y) => y >= new Date().getFullYear() - 120, {
    message: 'birthYear is too far in the past',
  })
  .refine((y) => y <= new Date().getFullYear(), {
    message: 'birthYear cannot be in the future',
  });

export const profileCreateSchema = z.object({
  displayName: z.string().min(1).max(50),
  birthYear: birthYearSchema,
  avatarUrl: z.string().url().optional(),
  location: locationSchema.optional(),
});

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;

export const profileUpdateSchema = profileCreateSchema
  .partial()
  .omit({ birthYear: true, location: true })
  .strict();
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
  birthYear: birthYearSchema.nullable(),
  location: locationSchema.nullable(),
  isOwner: z.boolean(),
  hasPremiumLlm: z.boolean().default(false),
  consentStatus: consentStatusSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Profile = z.infer<typeof profileSchema>;
