import { extractClerkError } from './clerk-error';
import { i18next, ensureI18nReady } from '../i18n';

// [WI-2789 / WI-2768] Clerk's message/longMessage are always English. This
// regression covers the incorrect-password path in a non-English locale —
// the exact QA symptom (German sign-in showing raw English Clerk text).
describe('extractClerkError — locale-aware code mapping (WI-2768)', () => {
  beforeAll(async () => {
    await ensureI18nReady();
  });

  afterEach(async () => {
    await i18next.changeLanguage('en');
  });

  it('maps a known Clerk error code to the localized message in the active (non-English) locale, never the raw English Clerk text', async () => {
    await i18next.changeLanguage('de');

    const err = {
      errors: [
        {
          code: 'form_password_incorrect',
          message: 'Password is incorrect. Try again, or use another method.',
          longMessage:
            'Password is incorrect. Try again, or use another method.',
        },
      ],
    };

    const result = extractClerkError(err);

    expect(result).toBe(
      i18next.t('auth.errors.form_password_incorrect', { lng: 'de' }),
    );
    expect(result).not.toBe(
      'Password is incorrect. Try again, or use another method.',
    );
  });

  it('maps the incorrect-verification-code path (form_code_incorrect) in German', async () => {
    await i18next.changeLanguage('de');

    const err = {
      errors: [{ code: 'form_code_incorrect', message: 'Incorrect code' }],
    };

    expect(extractClerkError(err)).toBe(
      i18next.t('auth.errors.form_code_incorrect', { lng: 'de' }),
    );
  });

  it('falls back to the localized generic message for an unmapped code — never the raw Clerk message', async () => {
    await i18next.changeLanguage('de');

    const err = {
      errors: [
        { code: 'some_unmapped_future_code', message: 'Raw English text' },
      ],
    };

    const result = extractClerkError(err);

    expect(result).toBe(i18next.t('auth.errors.generic', { lng: 'de' }));
    expect(result).not.toBe('Raw English text');
  });

  it('falls back to the caller-supplied fallback when the error has no code and a fallback is given', () => {
    const err = { errors: [{ message: 'Raw English text' }] };

    expect(extractClerkError(err, 'localized fallback')).toBe(
      'localized fallback',
    );
  });

  it('falls back to the localized generic message when there is no clerkErrors array at all', () => {
    expect(extractClerkError(new Error('network blew up'))).toBe(
      i18next.t('auth.errors.generic'),
    );
  });

  it('returns the English message in the English locale (sanity check)', async () => {
    await i18next.changeLanguage('en');

    const err = {
      errors: [{ code: 'form_password_incorrect', message: 'irrelevant' }],
    };

    expect(extractClerkError(err)).toBe(
      "That password doesn't look right. Please try again.",
    );
  });
});
