import { z } from 'zod';
import { consentStatusSchema } from './consent.ts';

export const personaTypeSchema = z.enum(['TEEN', 'LEARNER', 'PARENT']);
export type PersonaType = z.infer<typeof personaTypeSchema>;

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

const profileCreateFields = z.object({
  displayName: z.string().min(1).max(50),
  birthDate: z.string().date().optional(),
  birthYear: birthYearSchema.optional(),
  personaType: personaTypeSchema.optional(),
  avatarUrl: z.string().url().optional(),
  location: locationSchema.optional(),
});

export const profileCreateSchema = profileCreateFields.superRefine(
  (value, ctx) => {
    if (!value.birthDate && value.birthYear == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['birthYear'],
        message: 'birthDate or birthYear is required',
      });
      return;
    }

    // Reject conflicting birthDate + birthYear: consent/persona are derived from
    // birthYear, but persistence prefers birthDate. A mismatch can skip consent.
    if (value.birthDate && value.birthYear != null) {
      const yearFromDate = new Date(value.birthDate).getUTCFullYear();
      if (yearFromDate !== value.birthYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['birthYear'],
          message:
            'birthYear conflicts with birthDate — provide one or ensure they match',
        });
      }
    }
  }
);

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;

export const profileUpdateSchema = profileCreateFields
  .partial()
  .omit({ birthDate: true, birthYear: true, location: true })
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
  birthDate: z.string().date().nullable(),
  birthYear: birthYearSchema.nullable().optional(),
  personaType: personaTypeSchema,
  location: locationSchema.nullable(),
  isOwner: z.boolean(),
  consentStatus: consentStatusSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Profile = z.infer<typeof profileSchema>;
