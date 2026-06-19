import { i18next } from '../i18n';

export interface ClerkError {
  message?: string;
  longMessage?: string;
}

export function extractClerkError(
  err: unknown,
  fallback = i18next.t('errors.clerkGeneric'),
): string {
  const clerkErrors = (err as { errors?: ClerkError[] }).errors;
  return clerkErrors?.[0]?.longMessage ?? clerkErrors?.[0]?.message ?? fallback;
}
