import { i18next } from '../i18n';
import type { TranslateKey } from '../i18n';

export interface ClerkError {
  code?: string;
  message?: string;
  longMessage?: string;
}

/**
 * [WI-2789 / WI-2768] Clerk's `message`/`longMessage` fields are always
 * English — Clerk does not localize its own error text. The `code` field is
 * the only stable, locale-independent signal, so we map known codes to
 * localized copy under `auth.errors.*` instead of ever surfacing the raw
 * Clerk text. Codes without a mapping fall through to the localized
 * `auth.errors.generic` message (or the caller's own already-localized
 * fallback) — never to raw English.
 */
const CLERK_ERROR_KEYS: Record<string, TranslateKey> = {
  form_identifier_not_found: 'auth.errors.form_identifier_not_found',
  form_password_incorrect: 'auth.errors.form_password_incorrect',
  form_password_or_identifier_incorrect:
    'auth.errors.form_password_or_identifier_incorrect',
  form_password_pwned: 'auth.errors.form_password_pwned',
  form_password_compromised: 'auth.errors.form_password_compromised',
  form_password_not_strong_enough:
    'auth.errors.form_password_not_strong_enough',
  form_password_length_too_short: 'auth.errors.form_password_length_too_short',
  form_password_length_too_long: 'auth.errors.form_password_length_too_long',
  form_password_no_uppercase: 'auth.errors.form_password_no_uppercase',
  form_password_no_lowercase: 'auth.errors.form_password_no_lowercase',
  form_password_no_number: 'auth.errors.form_password_no_number',
  form_password_no_special_char: 'auth.errors.form_password_no_special_char',
  form_password_validation_failed:
    'auth.errors.form_password_validation_failed',
  form_code_incorrect: 'auth.errors.form_code_incorrect',
  form_identifier_exists: 'auth.errors.form_identifier_exists',
  form_param_format_invalid: 'auth.errors.form_param_format_invalid',
  captcha_invalid: 'auth.errors.captcha_invalid',
  signup_rate_limit_exceeded: 'auth.errors.signup_rate_limit_exceeded',
};

export function extractClerkError(err: unknown, fallback?: string): string {
  const clerkErrors = (err as { errors?: ClerkError[] }).errors;
  const code = clerkErrors?.[0]?.code;
  const key = code ? CLERK_ERROR_KEYS[code] : undefined;

  if (key) {
    return i18next.t(key);
  }

  return fallback ?? i18next.t('auth.errors.generic');
}
