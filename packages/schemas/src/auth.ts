import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  birthDate: z.string().date().optional(),
  location: z.enum(['EU', 'US', 'OTHER']).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8).max(128),
});

export type PasswordReset = z.infer<typeof passwordResetSchema>;
