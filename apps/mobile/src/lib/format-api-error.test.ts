import {
  classifyApiError,
  extractApiErrorCode,
  formatApiError,
  recoveryActions,
  type FormattedApiError,
} from './format-api-error';
import {
  BadRequestError,
  ConsentRequiredError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  QuotaExceededError,
  RateLimitedError,
  ResourceGoneError,
  UpstreamError,
} from './api-errors';
import { ensureI18nReady } from '../i18n';

// format-api-error.ts resolves messages via i18next.t(). The i18n module's
// init() returns a promise; without awaiting it here, jest reports
// "worker failed to exit gracefully" because the init promise is still
// open when the test file finishes. The English copy asserted below is
// stable across releases (en.json is the source of truth — see
// AGENTS.md "Tests must reflect reality"); when en.json strings change,
// these assertions must be updated to match.
beforeAll(async () => {
  await ensureI18nReady();
});
const QUOTA_DETAILS = {
  tier: 'free' as const,
  effectiveAccessTier: 'free' as const,
  quotaModel: 'per-profile' as const,
  profileRole: 'owner' as const,
  reason: 'monthly' as const,
  resetsAt: '2026-05-27T01:00:00.000Z',
  monthlyLimit: 100,
  usedThisMonth: 100,
  dailyLimit: 10,
  usedToday: 5,
  topUpCreditsRemaining: 0,
  upgradeOptions: [],
};

/*
 * Screens updated with formatApiError (Story 10.4):
 *   - (app)/session/index.tsx — session start + streaming errors
 *   - (app)/homework/camera.tsx — OCR error fallback
 *   - (app)/dashboard.tsx — dashboard load error
 *   - session-summary/[sessionId].tsx — summary submission error
 *   - consent.tsx — consent request fallback
 *   - create-profile.tsx — profile creation fallback
 *   - delete-account.tsx — account deletion / cancel fallback
 *   - create-subject.tsx — subject creation fallback
 *   - (app)/topic/recall-test.tsx — recall test error
 *   - (app)/subscription.tsx — generic purchase error fallback
 *   - hooks/use-homework-ocr.ts — OCR catch fallback
 *
 * E2E note: Error messages are hard to trigger deterministically in E2E.
 * These are validated via unit tests only.
 */

describe('classifyApiError', () => {
  // [CR-2026-05-21-156] The legacy TypeError string-match branch was removed
  // once raw fetch callsites were migrated to fetchOrThrowNetworkError. Two
  // tests that asserted on TypeError classification were deleted in the same
  // change — the behavior is intentionally gone. Network failures now arrive
  // as typed NetworkError (see the 'classifies NetworkError as network /
  // retry' test below). The bare 'timeout' Error branch is preserved.

  // --- Network errors ---

  it('classifies Error with "timeout" in message as network / retry', () => {
    const err = new Error('Request timeout after 30000ms');
    const result = classifyApiError(err);
    expect(result.category).toBe('network');
    expect(result.recovery).toBe('retry');
  });

  // --- Typed error classes from api-client.ts boundary ---

  it('classifies NetworkError as network / retry', () => {
    const err = new NetworkError();
    const result = classifyApiError(err);
    expect(result.category).toBe('network');
    expect(result.recovery).toBe('retry');
    expect(result.blocksManualEntry).toBe(false);
    expect(result.message).toContain('offline');
  });

  it('classifies NotFoundError as not-found / go-back', () => {
    const err = new NotFoundError('Session');
    const result = classifyApiError(err);
    expect(result.category).toBe('not-found');
    expect(result.recovery).toBe('go-back');
    expect(result.blocksManualEntry).toBe(true);
  });

  it('classifies ResourceGoneError as not-found / go-back', () => {
    const err = new ResourceGoneError('This resource is no longer available.');
    const result = classifyApiError(err);
    expect(result.category).toBe('not-found');
    expect(result.recovery).toBe('go-back');
  });

  it('classifies RateLimitedError as quota / retry', () => {
    const err = new RateLimitedError(
      "You've hit the limit.",
      'RATE_LIMITED',
      undefined,
      30,
    );
    const result = classifyApiError(err);
    expect(result.category).toBe('quota');
    expect(result.recovery).toBe('retry');
  });

  it('classifies BadRequestError as unknown / go-back', () => {
    // [CR-157] 400 Bad Request cannot be resolved by retrying with the same
    // payload — the server rejects it again. Recovery is go-back.
    const err = new BadRequestError('Email already exists');
    const result = classifyApiError(err);
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('go-back');
    expect(result.message).toBe('Email already exists');
  });

  it('classifies UpstreamError as server / retry', () => {
    const err = new UpstreamError('Server exploded', 'INTERNAL_ERROR', 503);
    const result = classifyApiError(err);
    expect(result.category).toBe('server');
    expect(result.recovery).toBe('retry');
  });

  // [BUG-947] Without this branch, the 402 PROFILE_LIMIT_EXCEEDED came through
  // as a generic "Something went wrong on our end" — the symptom QA reported as
  // a fake 500. The classifier must surface the actionable upgrade message.
  it('[BUG-947] classifies UpstreamError(402, PROFILE_LIMIT_EXCEEDED) as quota and preserves server message', () => {
    const err = new UpstreamError(
      'Your subscription does not support additional profiles. Please upgrade to Family or Pro.',
      'PROFILE_LIMIT_EXCEEDED',
      402,
    );
    const result = classifyApiError(err);
    expect(result.category).toBe('quota');
    expect(result.recovery).toBe('go-back');
    expect(result.message).toBe(
      'Your subscription does not support additional profiles. Please upgrade to Family or Pro.',
    );
    // Critical regression guard: the generic server fallback must NOT win here.
    expect(result.message).not.toMatch(/Something went wrong on our end/);
  });

  it('NotFoundError with friendly-message pattern applies translation', () => {
    const err = new NotFoundError('Session');
    const result = classifyApiError(err);
    // "Session not found" matches /session.*not.*found/i
    expect(result.message).toContain("That session isn't available anymore");
  });

  // --- Typed errors from customFetch / classifyXhrError [BUG-545] ---
  // [BUG-545] customFetch and classifyXhrError now always throw typed errors
  // (UpstreamError, NotFoundError, etc.) instead of plain Error("API error
  // {status}: …"). These tests assert classification via typed constructors —
  // the parseApiBody regex path has been removed.

  it('[BUG-545] classifies NotFoundError as not-found / go-back', () => {
    const err = new NotFoundError('Session not found');
    const result = classifyApiError(err);
    expect(result.category).toBe('not-found');
    expect(result.recovery).toBe('go-back');
    // Applies FRIENDLY_MESSAGE_MAP translation
    expect(result.message).toContain('session');
  });

  it('classifies Error objects with status 404 as not-found / go-back', () => {
    const err = Object.assign(new Error('Subject not found'), {
      status: 404,
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('not-found');
    expect(result.recovery).toBe('go-back');
    expect(result.blocksManualEntry).toBe(true);
  });

  it('[BUG-545] classifies ForbiddenError (401/403) as auth / sign-out', () => {
    // customFetch throws ForbiddenError for 403; 401 is handled separately.
    // Both surface as auth / sign-out via classifyApiError.
    const err = new ForbiddenError('Unauthorized');
    const result = classifyApiError(err);
    expect(result.category).toBe('auth');
    expect(result.recovery).toBe('sign-out');
  });

  it('[BUG-545] classifies RateLimitedError as quota / retry', () => {
    const err = new RateLimitedError('Rate limit exceeded', 'RATE_LIMITED');
    const result = classifyApiError(err);
    expect(result.category).toBe('quota');
    expect(result.recovery).toBe('retry');
  });

  it('[BUG-545] classifies UpstreamError 500 as server / retry', () => {
    const err = new UpstreamError(
      'Internal Server Error',
      'UPSTREAM_ERROR',
      500,
    );
    const result = classifyApiError(err);
    expect(result.category).toBe('server');
    expect(result.recovery).toBe('retry');
  });

  it('[BUG-545] classifies UpstreamError 502 as server / retry', () => {
    const err = new UpstreamError('Bad Gateway', 'UPSTREAM_ERROR', 502);
    const result = classifyApiError(err);
    expect(result.category).toBe('server');
    expect(result.recovery).toBe('retry');
  });

  it('[BUG-562] BadRequestError from customFetch classifies as unknown / go-back', () => {
    // [BUG-562] 400 responses from customFetch now throw BadRequestError (typed).
    // [CR-157] classifyApiError maps them to unknown/go-back — retrying a 400
    // with the same payload keeps failing; callers that previously relied on
    // plain Error("API error 400: …") should use BadRequestError.
    const err = new BadRequestError('Email is already registered');
    const result = classifyApiError(err);
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('go-back');
  });

  // --- Named error types ---

  it('classifies QuotaExceededError as quota / none', () => {
    const err = new QuotaExceededError(
      'You have exceeded your monthly question limit',
      QUOTA_DETAILS,
    );
    const result = classifyApiError(err);
    expect(result.category).toBe('quota');
    expect(result.recovery).toBe('none');
    expect(result.message).toContain('exceeded');
  });

  it('classifies ForbiddenError as auth / sign-out', () => {
    const err = new ForbiddenError(
      'You do not have permission to access this resource',
    );
    const result = classifyApiError(err);
    expect(result.category).toBe('auth');
    expect(result.recovery).toBe('sign-out');
  });

  it('classifies ForbiddenError with SUBJECT_INACTIVE as not-found / go-back', () => {
    const err = new ForbiddenError(
      'Subject is paused — resume it before starting a session',
      'SUBJECT_INACTIVE',
    );
    const result = classifyApiError(err);
    expect(result.category).toBe('not-found');
    expect(result.recovery).toBe('go-back');
  });

  // --- HMR resilience [BUG-947] ---
  // Metro HMR can reload api-errors.ts creating new class identities. These
  // tests simulate that by using plain Error + Object.assign instead of
  // constructing real instances, verifying classification survives.

  it('[BUG-947] classifies UpstreamError-shaped error when instanceof fails (HMR)', () => {
    const err = Object.assign(new Error('Please upgrade to Family or Pro.'), {
      name: 'UpstreamError',
      code: 'PROFILE_LIMIT_EXCEEDED',
      status: 402,
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('quota');
    expect(result.recovery).toBe('go-back');
    expect(result.message).not.toMatch(/Something went wrong/);
  });

  it('[BUG-947] classifies generic UpstreamError-shaped 5xx when instanceof fails (HMR)', () => {
    const err = Object.assign(new Error('Internal failure'), {
      name: 'UpstreamError',
      code: 'INTERNAL_ERROR',
      status: 503,
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('server');
    expect(result.recovery).toBe('retry');
  });

  it('[BUG-947] classifies QuotaExceededError-shaped error when instanceof fails (HMR)', () => {
    const err = Object.assign(new Error('Monthly limit reached'), {
      name: 'QuotaExceededError',
      code: 'QUOTA_EXCEEDED',
      details: { tier: 'free', reason: 'monthly' },
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('quota');
    expect(result.recovery).toBe('none');
  });

  it('[BUG-947] classifies ForbiddenError-shaped error when instanceof fails (HMR)', () => {
    const err = Object.assign(new Error('No permission'), {
      name: 'ForbiddenError',
      errorCode: 'FORBIDDEN',
      apiCode: undefined,
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('auth');
    expect(result.recovery).toBe('sign-out');
  });

  // --- Anti-spoofing guards ---

  it('does NOT classify a spoofed error.name="QuotaExceededError" as quota', () => {
    const err = new Error('attacker-supplied message');
    err.name = 'QuotaExceededError';
    const result = classifyApiError(err);
    expect(result.category).not.toBe('quota');
    expect(result.recovery).not.toBe('none');
  });

  it('does NOT classify a spoofed error.name="ForbiddenError" as auth', () => {
    const err = new Error('attacker-supplied message');
    err.name = 'ForbiddenError';
    const result = classifyApiError(err);
    expect(result.category).not.toBe('auth');
    expect(result.recovery).not.toBe('sign-out');
  });

  // [CCR PR #282] ConsentRequiredError — gated user actions cannot be
  // retried by tapping a button; the parent must complete the consent
  // flow off-screen first. Recovery is go-back, NOT retry.
  it('classifies ConsentRequiredError as auth / go-back', () => {
    const err = new ConsentRequiredError(
      'Parent consent is required before launching this quiz.',
      'CONSENT_REQUIRED',
    );
    const result = classifyApiError(err);
    expect(result.category).toBe('auth');
    expect(result.recovery).toBe('go-back');
    expect(result.blocksManualEntry).toBe(true);
    expect(result.message).toBe(
      'Parent consent is required before launching this quiz.',
    );
  });

  it('[BUG-947] classifies ConsentRequiredError-shaped error when instanceof fails (HMR)', () => {
    const err = Object.assign(new Error('Parent consent is required.'), {
      name: 'ConsentRequiredError',
      errorCode: 'CONSENT_REQUIRED',
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('auth');
    expect(result.recovery).toBe('go-back');
  });

  // [CCR PR #282] Anti-spoofing — a plain Error with only `name` forged but
  // none of the required shape properties must NOT be classified as a typed
  // ConsentRequiredError (or quota / forbidden). Falls through to the
  // unknown/retry default. Mirrors the existing spoofing guards above.
  it('does NOT classify a spoofed error.name="ConsentRequiredError" as auth / go-back', () => {
    const err = new Error('attacker-supplied message');
    err.name = 'ConsentRequiredError';
    // No errorCode property — fails the shape guard.
    const result = classifyApiError(err);
    expect(result.category).not.toBe('auth');
    expect(result.recovery).not.toBe('go-back');
  });

  // --- Error codes on the error object ---

  it('classifies EXCHANGE_LIMIT_EXCEEDED code as quota / go-back', () => {
    const err = Object.assign(new Error('Limit exceeded'), {
      code: 'EXCHANGE_LIMIT_EXCEEDED',
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('quota');
    expect(result.recovery).toBe('go-back');
  });

  it('classifies UPSTREAM_ERROR code as server / retry', () => {
    const err = Object.assign(new Error('upstream issue'), {
      code: 'UPSTREAM_ERROR',
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('server');
    expect(result.recovery).toBe('retry');
  });

  // --- Unknown / fallback ---

  it('classifies null as unknown / retry', () => {
    const result = classifyApiError(null);
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('retry');
  });

  it('classifies undefined as unknown / retry', () => {
    const result = classifyApiError(undefined);
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('retry');
  });

  it('classifies plain string as unknown / retry', () => {
    const result = classifyApiError('something failed');
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('retry');
  });

  it('classifies short user-facing Error messages as unknown / retry with passthrough', () => {
    // [CR-157] The generic short-message passthrough (branch 6) retains
    // 'retry' to preserve the anti-spoofing invariant (line 367): a plain
    // Error with a forged name must not receive 'go-back'. Only an explicit
    // typed BadRequestError (branch 5) uses 'go-back'.
    const err = new Error('Profile name must be at least 2 characters');
    const result = classifyApiError(err);
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('retry');
    expect(result.message).toBe('Profile name must be at least 2 characters');
  });

  // --- [BUG-546] 401 vs 403 recovery distinction ---
  //
  // Root cause: the status-based fallback path treated 401 and 403 identically
  // with recovery:'sign-out'. For 401, triggerAuthExpired() (BUG-547 / wave 1)
  // already initiates async sign-out; rendering a 'Sign Out' button on top of
  // an in-progress sign-out creates a double-sign-out + guard race.
  // Fix: 401 → recovery:'none' (no button; sign-out in progress).
  //      403 → recovery:'sign-out' (unchanged — genuine forbidden, not session expiry).

  it('[BUG-546 / break-test] plain Error with status=401 → recovery is NOT sign-out', () => {
    // SSE path: sse.ts throws plain Error with .status=401 after triggerAuthExpired().
    // Showing a 'Sign Out' button on top of the in-progress sign-out is wrong.
    const err = Object.assign(new Error('Session expired — signing out'), {
      status: 401,
    });
    const result = classifyApiError(err);
    expect(result.category).toBe('auth');
    // [break-test] Pre-fix this was 'sign-out'; must now be 'none' to avoid
    // double-sign-out race with the already-in-progress triggerAuthExpired().
    expect(result.recovery).toBe('none');
    expect(result.recovery).not.toBe('sign-out');
  });

  it('[BUG-546 / break-test] plain Error with status=403 → recovery is still sign-out', () => {
    // 403 is a genuine permission failure, not session expiry. Sign-out
    // recovery remains correct here (no in-progress triggerAuthExpired race).
    const err = Object.assign(new Error('Forbidden'), { status: 403 });
    const result = classifyApiError(err);
    expect(result.category).toBe('auth');
    expect(result.recovery).toBe('sign-out');
  });

  it('[BUG-546] 401 error message reflects session-expiry copy', () => {
    const err = Object.assign(new Error('Session expired — signing out'), {
      status: 401,
    });
    const result = classifyApiError(err);
    expect(result.message).toContain('session expired');
  });

  // --- SSE idle timeout (interview / chat) [BUG-555] ---

  it('classifies SSE idle-timeout error as network / retry with reconnect message [BUG-555]', () => {
    // Repro: apps/mobile/src/lib/sse.ts emits this exact message + isTimeout
    // when the 45s IDLE_TIMEOUT_MS fires because no chunk arrived. The error
    // surfaces in the interview phase as "That reply took too long" and the
    // retry recovery converts the failed bubble into a reconnect_prompt.
    const err = new Error(
      'The connection timed out while waiting for a reply',
    ) as Error & { isTimeout: boolean };
    err.isTimeout = true;

    const result = classifyApiError(err);
    expect(result.category).toBe('network');
    expect(result.recovery).toBe('retry');
    expect(result.message).toBe(
      'That reply took too long. Tap reconnect to try again.',
    );
  });

  // [BUG-389 break-test] Timeout classification must use the `isTimeout`
  // property, NOT string-match on the formatted message. Before the fix,
  // changing the message text would silently break timeout detection.
  it('[BUG-389] classifies timeout error via isTimeout property even when message text differs', () => {
    // Simulate an SSE timeout with a localised or reworded message — the
    // classifier must not depend on the English phrase "timed out while waiting".
    const err = Object.assign(
      new Error('Connection took too long'), // different message text
      { isTimeout: true },
    );
    const result = classifyApiError(err);
    // Without the isTimeout property check (pre-fix), this would fall through
    // to the generic 'unknown' category since the message doesn't match.
    expect(result.category).toBe('network');
    expect(result.recovery).toBe('retry');
  });

  it('[BUG-389] does NOT classify a plain error with timeout-like message as network if isTimeout is absent', () => {
    // A server error message that incidentally contains "timed out" should not
    // classify as a reconnectable timeout — only errors with isTimeout:true should.
    // (The heuristic fallback in classifyApiError is intentionally retained for
    // the exact SSE message phrase; this test guards against a broader false-match.)
    const err = new Error('The upstream service timed out');
    // No isTimeout property — this will match the message heuristic if the
    // phrase happens to be in the message, but the phrase here differs enough
    // that the primary guard (isTimeout) is what we're validating.
    const result = classifyApiError(err);
    // 'upstream' in the message matches isTechnicalMessage, so shouldPassThroughUserMessage
    // returns false and the error falls to the unknown-fallback. Critically: the
    // `isTimeout` structural gate was NOT involved — confirming the property check
    // is the exclusive path for SSE timeout classification.
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('retry');
  });
});

// [CCR PR #282] extractApiErrorCode — centralized boundary helper so screens
// don't inline `error.name === '...'` switches. Mirrors the anti-spoofing
// posture of classifyApiError.
describe('extractApiErrorCode', () => {
  it('extracts errorCode from a real ForbiddenError', () => {
    const err = new ForbiddenError('No permission');
    expect(extractApiErrorCode(err)).toBe('FORBIDDEN');
  });

  it('extracts code from a real QuotaExceededError', () => {
    const err = new QuotaExceededError('Quota reached', QUOTA_DETAILS);
    expect(extractApiErrorCode(err)).toBe('QUOTA_EXCEEDED');
  });

  it('extracts errorCode from a real ConsentRequiredError', () => {
    const err = new ConsentRequiredError(
      'Consent required',
      'CONSENT_REQUIRED',
    );
    expect(extractApiErrorCode(err)).toBe('CONSENT_REQUIRED');
  });

  it('returns apiCode when present on a typed error (e.g. SUBJECT_INACTIVE)', () => {
    const err = new ForbiddenError('Subject paused', 'SUBJECT_INACTIVE');
    expect(extractApiErrorCode(err)).toBe('SUBJECT_INACTIVE');
  });

  it('returns code from plain Error with code property', () => {
    const err = Object.assign(new Error('limit'), {
      code: 'EXCHANGE_LIMIT_EXCEEDED',
    });
    expect(extractApiErrorCode(err)).toBe('EXCHANGE_LIMIT_EXCEEDED');
  });

  it('returns undefined for null / undefined / primitives', () => {
    expect(extractApiErrorCode(null)).toBeUndefined();
    expect(extractApiErrorCode(undefined)).toBeUndefined();
    expect(extractApiErrorCode('string')).toBeUndefined();
    expect(extractApiErrorCode(42)).toBeUndefined();
  });

  it('does NOT return FORBIDDEN for a spoofed name without errorCode shape', () => {
    const err = new Error('attacker-supplied');
    err.name = 'ForbiddenError';
    expect(extractApiErrorCode(err)).toBeUndefined();
  });

  it('does NOT return CONSENT_REQUIRED for a spoofed name without errorCode shape', () => {
    const err = new Error('attacker-supplied');
    err.name = 'ConsentRequiredError';
    expect(extractApiErrorCode(err)).toBeUndefined();
  });

  it('does NOT return QUOTA_EXCEEDED for a spoofed name without details shape', () => {
    const err = new Error('attacker-supplied');
    err.name = 'QuotaExceededError';
    expect(extractApiErrorCode(err)).toBeUndefined();
  });
});

describe('formatApiError', () => {
  // [CR-2026-05-21-156] The TypeError-as-network branch was removed (see note
  // on classifyApiError above). Raw fetch callsites now wrap via
  // fetchOrThrowNetworkError so network rejections arrive as typed NetworkError.

  // --- Network errors ---

  it('returns network message for Error with "timeout" in message', () => {
    const err = new Error('Request timeout after 30000ms');
    expect(formatApiError(err)).toBe(
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
    );
  });

  it('returns network message for Error with "network" in message', () => {
    const err = new Error('Network request failed');
    expect(formatApiError(err)).toBe(
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
    );
  });

  it('returns network message for Error with "abort" in message', () => {
    const err = new Error('The operation was aborted');
    expect(formatApiError(err)).toBe(
      "Looks like you're offline or our servers can't be reached. Check your internet connection and try again.",
    );
  });

  // --- Typed errors from customFetch (UpstreamError / typed classes) [BUG-545] ---
  // [BUG-545] customFetch always throws typed errors, never plain
  // Error("API error {status}: …"). Tests now use typed constructors.

  it('[BUG-545] returns server message for UpstreamError 500', () => {
    const err = new UpstreamError(
      'Internal Server Error',
      'UPSTREAM_ERROR',
      500,
    );
    expect(formatApiError(err)).toBe(
      'Something went wrong on our end. Please try again in a moment.',
    );
  });

  it('[BUG-545] returns server message for UpstreamError 502', () => {
    const err = new UpstreamError('Bad Gateway', 'UPSTREAM_ERROR', 502);
    expect(formatApiError(err)).toBe(
      'Something went wrong on our end. Please try again in a moment.',
    );
  });

  it('[BUG-545] returns generic server message for UpstreamError 502 with INTERNAL_ERROR code', () => {
    // INTERNAL_ERROR is classified as a server error regardless of message.
    // The errorCode branch short-circuits before the message passthrough gate.
    const err = new UpstreamError(
      'Consent email could not be delivered. Please check the email address and try again.',
      'INTERNAL_ERROR',
      502,
    );
    expect(formatApiError(err)).toBe(
      'Something went wrong on our end. Please try again in a moment.',
    );
  });

  it('[BUG-545] passes through message from BadRequestError', () => {
    const err = new BadRequestError('Email is already registered');
    expect(formatApiError(err)).toBe('Email is already registered');
  });

  it('[BUG-545] returns not-found message for NotFoundError', () => {
    const err = new NotFoundError('Resource not found');
    expect(formatApiError(err)).toBe('That page or item no longer exists.');
  });

  // --- ForbiddenError with apiCode [BUG-100] ---

  it('returns friendly subject-inactive message when ForbiddenError carries SUBJECT_INACTIVE apiCode', () => {
    const err = new ForbiddenError(
      'Subject is paused — resume it before starting a session',
      'SUBJECT_INACTIVE',
    );
    // classifyApiError catches SUBJECT_INACTIVE as a code-level check
    // (before ForbiddenError instanceof check) and applies friendlyMessage()
    // which matches the subject.*(paused|archived) pattern.
    expect(formatApiError(err)).toBe(
      'This subject is on pause right now. You can resume it from your subjects list.',
    );
  });

  it('passes through ForbiddenError message when apiCode is not a special code', () => {
    const err = new ForbiddenError(
      'You do not have permission to access this resource',
    );
    expect(formatApiError(err)).toBe(
      'You do not have permission to access this resource',
    );
  });

  // --- QuotaExceededError ---

  it('passes through QuotaExceededError message', () => {
    const err = new QuotaExceededError(
      'You have exceeded your monthly question limit',
      QUOTA_DETAILS,
    );
    expect(formatApiError(err)).toBe(
      'You have exceeded your monthly question limit',
    );
  });

  // --- User-facing error messages (pass-through) ---

  it('passes through short, user-facing error messages', () => {
    const err = new Error('Profile name must be at least 2 characters');
    expect(formatApiError(err)).toBe(
      'Profile name must be at least 2 characters',
    );
  });

  it('returns default for long technical messages', () => {
    const err = new Error('a'.repeat(250));
    expect(formatApiError(err)).toBe(
      'Something unexpected happened. Please try again.',
    );
  });

  it('returns default for error messages with stack-like content', () => {
    const err = new Error('Cannot read property at Object.something');
    expect(formatApiError(err)).toBe(
      'Something unexpected happened. Please try again.',
    );
  });

  // --- Non-Error values ---

  it('returns default for null', () => {
    expect(formatApiError(null)).toBe(
      'Something unexpected happened. Please try again.',
    );
  });

  it('returns default for undefined', () => {
    expect(formatApiError(undefined)).toBe(
      'Something unexpected happened. Please try again.',
    );
  });

  it('returns default for string error', () => {
    expect(formatApiError('something failed')).toBe(
      'Something unexpected happened. Please try again.',
    );
  });

  it('returns default for number error', () => {
    expect(formatApiError(42)).toBe(
      'Something unexpected happened. Please try again.',
    );
  });

  it('returns default for empty object', () => {
    expect(formatApiError({})).toBe(
      'Something unexpected happened. Please try again.',
    );
  });

  it('returns SSE reconnect message for idle-timeout error [BUG-555]', () => {
    // The 45s SSE idle timer in apps/mobile/src/lib/sse.ts emits this exact
    // error when the LLM never produces a chunk; the format-api-error layer
    // is what surfaces "That reply took too long" in the interview UI.
    const err = new Error('The connection timed out while waiting for a reply');
    expect(formatApiError(err)).toBe(
      'That reply took too long. Tap reconnect to try again.',
    );
  });
});

describe('recoveryActions', () => {
  const base: FormattedApiError = {
    message: 'test',
    category: 'unknown',
    recovery: 'retry',
    blocksManualEntry: false,
  };
  const retry = jest.fn();
  const goBack = jest.fn();
  const goHome = jest.fn();
  const signOut = jest.fn();
  const allHandlers = { retry, goBack, goHome, signOut };

  it('maps retry to Try Again primary + Go Home secondary', () => {
    const result = recoveryActions({ ...base, recovery: 'retry' }, allHandlers);
    expect(result.primary?.label).toBe('Try Again');
    expect(result.primary?.testID).toBe('recovery-retry');
    expect(result.secondary?.label).toBe('Go Home');
    result.primary?.onPress();
    expect(retry).toHaveBeenCalled();
  });

  it('maps go-back to Go Back primary + Go Home secondary', () => {
    const result = recoveryActions(
      { ...base, recovery: 'go-back' },
      allHandlers,
    );
    expect(result.primary?.label).toBe('Go Back');
    expect(result.primary?.testID).toBe('recovery-go-back');
    expect(result.secondary?.label).toBe('Go Home');
    result.primary?.onPress();
    expect(goBack).toHaveBeenCalled();
  });

  it('maps sign-out to Sign Out primary + Go Home secondary', () => {
    const result = recoveryActions(
      { ...base, recovery: 'sign-out' },
      allHandlers,
    );
    expect(result.primary?.label).toBe('Sign Out');
    expect(result.primary?.testID).toBe('recovery-sign-out');
    result.primary?.onPress();
    expect(signOut).toHaveBeenCalled();
  });

  it('maps none to Go Home primary only', () => {
    const result = recoveryActions({ ...base, recovery: 'none' }, allHandlers);
    expect(result.primary?.label).toBe('Go Home');
    expect(result.secondary).toBeUndefined();
  });

  it('falls back to goHome when specific handler is missing', () => {
    const result = recoveryActions({ ...base, recovery: 'retry' }, { goHome });
    expect(result.primary?.label).toBe('Go Home');
    expect(result.secondary).toBeUndefined();
  });

  it('returns no actions when no handlers provided', () => {
    const result = recoveryActions({ ...base, recovery: 'none' }, {});
    expect(result.primary).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Regression — runtime-error leak guard
//
// A Hermes ReferenceError ("Property 'crypto' doesn't exist") was caught
// in the streaming pipeline and rendered as the assistant's reply because
// classifyApiError step 6 returned err.message verbatim for any short,
// non-stack message. The fix has two layers: kill the global `crypto`
// usage that threw the error AND make the formatter refuse to surface
// JS-engine error shapes even if a future bug throws another one.
// ---------------------------------------------------------------------------
describe('classifyApiError — runtime-error leak guard', () => {
  const RUNTIME_ERROR_MESSAGES = [
    "Property 'crypto' doesn't exist",
    "Property 'foo' doesn't exist",
    'crypto is not defined',
    'someFn is not a function',
    'Cannot read property of undefined',
    'Cannot read properties of null',
    'undefined is not an object',
    'undefined is not a function',
    'ReferenceError: x is not defined',
    'TypeError: cannot read foo',
  ];

  it.each(RUNTIME_ERROR_MESSAGES)(
    'never surfaces runtime-error message %p as user-facing text',
    (raw) => {
      const formatted = formatApiError(new Error(raw));
      expect(formatted).not.toBe(raw);
      expect(formatted.toLowerCase()).not.toContain('crypto');
      expect(formatted.toLowerCase()).not.toContain('referenceerror');
      expect(formatted.toLowerCase()).not.toContain('typeerror');
    },
  );

  it('still passes through short user-friendly messages', () => {
    const formatted = formatApiError(
      new Error('Profile name must be 1 to 80 characters.'),
    );
    expect(formatted).toBe('Profile name must be 1 to 80 characters.');
  });

  it('classifies a Hermes-style ReferenceError as unknown/retry', () => {
    const result = classifyApiError(
      new Error("Property 'crypto' doesn't exist"),
    );
    expect(result.category).toBe('unknown');
    expect(result.recovery).toBe('retry');
  });
});
