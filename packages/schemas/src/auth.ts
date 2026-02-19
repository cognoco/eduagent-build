import { z } from 'zod';

/**
 * Registration schema used for Clerk's `signUp.create()` client-side validation.
 * The `password` field validates user input before passing to Clerk — it does NOT
 * indicate direct password authentication. Clerk manages all credential storage
 * and verification server-side. This schema never touches the API layer.
 */
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
