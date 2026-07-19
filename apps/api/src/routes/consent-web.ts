import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Database } from '@eduagent/database';
import {
  ConsentTokenNotFoundError,
  ConsentAlreadyProcessedError,
  ConsentTokenExpiredError,
} from '../services/consent';
import {
  processConsentResponseV2,
  getChildNameByTokenV2,
  getPersonDisplayNameV2,
  getGdprGrantWithdrawalStateV2,
  withdrawConsentByToken,
  restoreConsentByToken,
  ConsentRecordNotFoundError,
  ConsentGracePeriodExpiredError,
} from '../services/identity-v2/consent-v2';
import {
  signWithdrawalToken,
  verifyWithdrawalToken,
} from '../services/consent-withdrawal-token';
import {
  sendEmail,
  formatConsentApprovedEmail,
} from '../services/notifications/email';
import { inngest } from '../inngest/client';
import { safeSend } from '../services/safe-non-core';
import {
  // The consent-respond limiter is a SHARED in-memory instance: the unauth
  // web POST and the authed JSON endpoint must throttle against the same map,
  // so this stays sourced from the consent route that owns the instance.
  isConsentRespondRateLimited,
  CONSENT_RESPOND_RATE_LIMIT_WINDOW_MS,
} from './consent';
import { resolveRateLimitIp } from '../services/rate-limit';
import { BRAND_COLOR_PRIMARY } from '../services/brand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConsentWebEnv = {
  Bindings: {
    DATABASE_URL: string;
    CONSENT_POLICY_VERSION: string;
    // [P0 email-consent-withdrawal] HMAC secret for the stateless withdrawal
    // token; the API origin the absolute withdrawal link points back at; and
    // the Resend bindings for the post-approval confirmation email. All
    // optional here — absence degrades gracefully (the approval still
    // succeeds, the withdrawal link is simply omitted) rather than 500-ing.
    CONSENT_WITHDRAWAL_TOKEN_SECRET?: string;
    API_ORIGIN?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    // [WI-1138] Consent-deny Stripe teardown when the denied person is
    // themselves the payer.
    STRIPE_SECRET_KEY?: string;
  };
  Variables: { db: Database };
};

function dispatchGetChildNameByToken(
  db: Database,
  token: string,
): Promise<string | null> {
  return getChildNameByTokenV2(db, token);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORT_MAILTO = 'mailto:support@mentomate.com';
const MARKETING_HELP_URL = 'https://www.mentomate.com/help';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape user-supplied strings for safe HTML interpolation (XSS prevention) */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders a consistent "get help" footer used on all error pages (invalid
 * link, expired link) where the user cannot take any other action.
 * Satisfies UX-DE-H7: every error state must have at least one interactive
 * element.
 */
function errorActionHtml(): string {
  return `<p class="info" style="margin-top:24px;">
    Need help?
    <a href="${MARKETING_HELP_URL}" style="color:${BRAND_COLOR_PRIMARY};">Visit our help centre</a>
    or <a href="${SUPPORT_MAILTO}" style="color:${BRAND_COLOR_PRIMARY};">contact support</a>.
  </p>`;
}

// ---------------------------------------------------------------------------
// [P0 email-consent-withdrawal] Withdrawal / restore page bodies. The
// email-consenting parent has no account and no app; these public pages are
// their only withdrawal surface (GDPR Art. 7(3)). All mutate POST-only behind a
// two-step GET confirm so an email link-prefetcher cannot auto-withdraw.
// ---------------------------------------------------------------------------

/** Shown for a missing / forged / tampered withdrawal token. */
function withdrawInvalidLinkBody(): string {
  return `<h1 class="error">Invalid link</h1>
    <p>This withdrawal link is invalid or has been altered. Please use the exact link from the confirmation email we sent you.</p>
    ${errorActionHtml()}`;
}

/** "Are you sure?" confirm page for an active grant (mirrors deny-confirm). */
function withdrawConfirmBody(
  childName: string,
  token: string,
  withdrawActionUrl: string,
): string {
  const safeName = escapeHtml(childName);
  return `<h1>Withdraw consent for ${safeName}?</h1>
    <p>Withdrawing stops MentoMate from processing ${safeName}'s data right away. The account is paused, and the data is permanently deleted after a 7-day grace period.</p>
    <p>You can undo this within those 7 days — we'll show you how on the next screen.</p>
    <form method="POST" action="${withdrawActionUrl}" style="display:contents">
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <button type="submit" class="btn btn-danger">Yes, withdraw consent</button>
    </form>
    <a href="${MARKETING_HELP_URL}" class="btn btn-secondary">Keep consent</a>
    <p class="info">To keep your consent, just close this tab — nothing changes.</p>`;
}

/** Post-withdrawal landing with the undo (restore) button (in grace). */
function withdrawnLandingBody(
  childName: string,
  token: string,
  restoreActionUrl: string,
): string {
  const safeName = escapeHtml(childName);
  return `<h1>Consent withdrawn</h1>
    <p>You've withdrawn consent for ${safeName}. We've stopped processing their data, and it will be permanently deleted after a 7-day grace period.</p>
    <p>Changed your mind? You can restore consent any time within those 7 days.</p>
    <form method="POST" action="${restoreActionUrl}" style="display:contents">
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <button type="submit" class="btn btn-primary">Undo — restore consent</button>
    </form>
    <p class="info">After 7 days the data is permanently removed and can no longer be restored. You may now close this tab.</p>`;
}

/** Valid token but no current grant (never approved, or already deleted). */
function nothingToWithdrawBody(childName: string): string {
  const safeName = escapeHtml(childName);
  return `<h1>Nothing to withdraw</h1>
    <p>There's no active consent to withdraw for ${safeName} right now. This can happen if consent was never completed, or has already been withdrawn and the grace period has passed.</p>
    ${errorActionHtml()}`;
}

/** Successful restore (undo) landing. */
function consentRestoredBody(childName: string): string {
  const safeName = escapeHtml(childName);
  return `<h1>Consent restored</h1>
    <p>${safeName}'s MentoMate account is active again. Nothing was deleted.</p>
    <p class="info">You can manage or withdraw your consent again at any time using the link in your confirmation email. You may now close this tab.</p>`;
}

/** Restore attempted after the 7-day grace — the data is already gone. */
function graceExpiredBody(childName: string): string {
  const safeName = escapeHtml(childName);
  return `<h1 class="error">Grace period has expired</h1>
    <p>The 7-day grace period for ${safeName}'s account has passed, so the data has already been permanently removed and can no longer be restored.</p>
    ${errorActionHtml()}`;
}

// ---------------------------------------------------------------------------
// Shared HTML layout
// ---------------------------------------------------------------------------

function pageLayout(title: string, body: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${title} — MentoMate</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8f9fa;
      color: #1a1a2e;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      text-align: center;
    }
    .logo { font-size: 28px; font-weight: 700; color: ${BRAND_COLOR_PRIMARY}; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
    p { font-size: 16px; color: #555; line-height: 1.5; margin-bottom: 16px; }
    .btn {
      display: block;
      width: 100%;
      padding: 14px 24px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      text-decoration: none;
      text-align: center;
      cursor: pointer;
      border: none;
      margin-bottom: 12px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: ${BRAND_COLOR_PRIMARY}; color: #fff; }
    .btn-secondary { background: #f0f0f0; color: #333; }
    .btn-danger { background: #e74c3c; color: #fff; }
    .btn-outline { background: transparent; border: 2px solid #ddd; color: #555; }
    .info { font-size: 14px; color: #888; margin-top: 16px; }
    .app-links { margin-top: 24px; padding-top: 20px; border-top: 1px solid #eee; }
    .app-links p { font-size: 14px; color: #888; margin-bottom: 12px; }
    .error { color: #e74c3c; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">MentoMate</div>
    ${body}
  </div>
</body>
</html>`;
}

/**
 * Shared IP-based rate-limit gate for the unauthenticated consent-page
 * endpoints. Returns a 429 HTML "Too many requests" Response (with Retry-After)
 * when the caller's IP is over budget, or `null` to proceed.
 *
 * The unauthenticated GET /consent-page and GET /consent-page/deny-confirm
 * token lookups (and the POST /consent-page/confirm mutation) all bucket
 * against the SAME shared sliding-window limiter that owns /consent/respond
 * (consent.ts) — same 30/hr per-IP cap, same Retry-After. Opening the consent
 * decision page, viewing the deny confirmation, and submitting each consume a
 * handful of the per-hour budget, so a legitimate single-open flow is never
 * throttled. Without this gate the unauthenticated GET lookups can be hammered
 * for token enumeration / DoS of the consent DB lookups.
 *
 * [BUG-99 — ACCEPTED LIMITATION] The shared limiter is the per-isolate
 * in-memory Map (services/rate-limit.ts); on Cloudflare Workers each isolate
 * keeps its own state, so the effective ceiling is max × N isolates per
 * window. This is defense-in-depth, not a load-bearing global control, and
 * matches the documented posture of the sibling /consent/respond endpoint.
 * Moving to a Workers-durable backing store is tracked separately and is out
 * of scope here.
 */
function consentPageRateLimit(
  c: Context,
  // 'submit' (the POST mutation) tells the parent they sent too many
  // responses; 'view' (the GET page loads) must NOT imply a submission —
  // a parent merely reloading the page has submitted nothing.
  reason: 'view' | 'submit' = 'submit',
): Response | null {
  const ipKey = resolveRateLimitIp(
    c.req.header('cf-connecting-ip'),
    c.req.header('x-forwarded-for'),
  );
  if (!isConsentRespondRateLimited(ipKey)) {
    return null;
  }
  const retryAfterSecs = Math.ceil(CONSENT_RESPOND_RATE_LIMIT_WINDOW_MS / 1000);
  c.header('Retry-After', String(retryAfterSecs));
  const bodyMessage =
    reason === 'view'
      ? 'Too many requests to this page. Please try again in a little while.'
      : 'You have submitted too many consent responses. Please try again later.';
  return c.html(
    pageLayout(
      'Too Many Requests',
      `<h1 class="error">Too many requests</h1>
       <p>${bodyMessage}</p>
       ${errorActionHtml()}`,
    ),
    429,
  );
}

// ---------------------------------------------------------------------------
// Routes — public, no auth required
// ---------------------------------------------------------------------------

export const consentWebRoutes = new Hono<ConsentWebEnv>()

  // Security headers for all consent-web HTML responses
  .use('*', async (c, next) => {
    await next();
    c.header('X-Frame-Options', 'DENY');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'unsafe-inline'; script-src 'none'",
    );
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  })

  /**
   * GET /consent-page?token=X
   *
   * Renders the consent decision page. Parent clicks approve or deny,
   * which links to the confirm endpoint.
   */
  .get('/consent-page', async (c) => {
    // Unauthenticated token lookup — rate-limit before the DB read so the
    // endpoint can't be hammered for token enumeration / DoS.
    const limited = consentPageRateLimit(c, 'view');
    if (limited) return limited;

    const token = c.req.query('token');
    if (!token) {
      return c.html(
        pageLayout(
          'Invalid Link',
          `<h1 class="error">Invalid link</h1>
           <p>This consent link is missing required information. Please check your email for the correct link.</p>
           ${errorActionHtml()}`,
        ),
        400,
      );
    }

    const db = c.get('db');
    const childName = await dispatchGetChildNameByToken(db, token);

    if (!childName) {
      return c.html(
        pageLayout(
          'Link Expired',
          `<h1 class="error">Link expired or invalid</h1>
           <p>This consent link has expired or is no longer valid.</p>
           <p>Ask your child to resend the consent request from the app.</p>
           ${errorActionHtml()}`,
        ),
        404,
      );
    }

    const basePath = c.req.path.replaceAll('/consent-page', '');
    const confirmUrl = `${basePath}/consent-page/confirm`;

    return c.html(
      pageLayout(
        'Parental Consent',
        `<h1>Consent required for ${escapeHtml(childName)}</h1>
         <p>${escapeHtml(
           childName,
         )} wants to use MentoMate, an AI-powered learning platform. Under applicable privacy regulations, we need your consent.</p>
         <p>By approving, you allow us to process ${escapeHtml(
           childName,
         )}'s learning data to provide personalised tutoring.</p>
         <form method="POST" action="${confirmUrl}" style="display:contents">
           <input type="hidden" name="token" value="${escapeHtml(token)}" />
           <input type="hidden" name="approved" value="true" />
           <button type="submit" class="btn btn-primary">Approve</button>
         </form>
         <a href="${basePath}/consent-page/deny-confirm?token=${encodeURIComponent(
           token,
         )}" class="btn btn-danger">
           Deny
         </a>
         <p class="info">After you approve, you'll be able to withdraw your consent at any time using a link we email you.</p>`,
      ),
    );
  })

  /**
   * GET /consent-page/deny-confirm?token=X
   *
   * Server-side two-step confirmation for consent denial.
   * Renders an "Are you sure?" page with confirm / go back buttons.
   */
  .get('/consent-page/deny-confirm', async (c) => {
    // Unauthenticated token lookup — same per-IP rate limit as the decision
    // page; gate before the DB read.
    const limited = consentPageRateLimit(c, 'view');
    if (limited) return limited;

    const token = c.req.query('token');
    if (!token) {
      return c.html(
        pageLayout(
          'Invalid Link',
          `<h1 class="error">Invalid link</h1>
           <p>This consent link is missing required information. Please check your email for the correct link.</p>
           ${errorActionHtml()}`,
        ),
        400,
      );
    }

    const db = c.get('db');
    const childName = await dispatchGetChildNameByToken(db, token);

    if (!childName) {
      return c.html(
        pageLayout(
          'Link Expired',
          `<h1 class="error">Link expired or invalid</h1>
           <p>This consent link has expired or is no longer valid.</p>
           <p>Ask your child to resend the consent request from the app.</p>
           ${errorActionHtml()}`,
        ),
        404,
      );
    }

    const basePath = c.req.path.replaceAll('/consent-page/deny-confirm', '');
    const confirmDenyUrl = `${basePath}/consent-page/confirm`;
    const backUrl = `${basePath}/consent-page?token=${encodeURIComponent(
      token,
    )}`;

    return c.html(
      pageLayout(
        'Confirm Denial',
        `<h1>Are you sure?</h1>
         <p>${escapeHtml(
           childName,
         )}'s account and all learning data will be permanently deleted. This cannot be undone.</p>
         <form method="POST" action="${confirmDenyUrl}" style="display:contents">
           <input type="hidden" name="token" value="${escapeHtml(token)}" />
           <input type="hidden" name="approved" value="false" />
           <button type="submit" class="btn btn-danger">Yes, deny consent</button>
         </form>
         <a href="${backUrl}" class="btn btn-secondary">
           Go back
         </a>`,
      ),
    );
  })

  /**
   * POST /consent-page/confirm
   *
   * Processes the consent response and renders the appropriate landing page.
   * Must be POST — this endpoint performs destructive mutations (profile deletion
   * on denial). GET would be CSRF-vulnerable via prefetch/link-preview/img-src.
   */
  .post('/consent-page/confirm', async (c) => {
    const body = await c.req.parseBody();
    const token = typeof body['token'] === 'string' ? body['token'] : null;
    const approvedParam =
      typeof body['approved'] === 'string' ? body['approved'] : null;

    if (!token || !approvedParam) {
      return c.html(
        pageLayout(
          'Invalid Link',
          `<h1 class="error">Invalid link</h1>
           <p>This link is missing required information.</p>`,
        ),
        400,
      );
    }

    // [Bug #868] Strict enum validation. Previously `const approved =
    // approvedParam === 'true'` silently coerced ANY non-'true' value (e.g.
    // 'True', '1', 'on', a corrupted/typoed form body, a misbehaving link
    // prefetcher) into a DENIAL, which cascade-deletes the child profile
    // (processConsentResponse + consent.ts:837-840). Require the literal
    // strings 'true' or 'false'; reject anything else with 400 BEFORE
    // processConsentResponse runs. This is a data-loss guard, not just
    // hygiene.
    if (approvedParam !== 'true' && approvedParam !== 'false') {
      return c.html(
        pageLayout(
          'Invalid Link',
          `<h1 class="error">Invalid link</h1>
           <p>This link is missing required information.</p>`,
        ),
        400,
      );
    }

    const approved = approvedParam === 'true';
    const db = c.get('db');

    // [BUG-491] Apply the same IP-based sliding-window rate limit as
    // /consent/respond (consent.ts) — destructive mutation (profile delete on
    // denial). Same shared limiter as the GET lookups above.
    const limited = consentPageRateLimit(c);
    if (limited) return limited;

    try {
      // Fetch child name BEFORE processing — denial deletes the profile
      const childName =
        (await dispatchGetChildNameByToken(db, token)) ?? 'Your child';
      // [Bug #872] Audit metadata captured at response time.
      const audit = {
        policyVersion: c.env.CONSENT_POLICY_VERSION,
        requestIp:
          c.req.header('cf-connecting-ip') ??
          c.req.header('x-forwarded-for') ??
          undefined,
        userAgent: c.req.header('user-agent') ?? undefined,
      };
      const v2Result = await processConsentResponseV2(
        db,
        token,
        approved,
        audit,
        {
          stripeSecretKey: c.env.STRIPE_SECRET_KEY,
        },
      );

      // [P0 email-consent-withdrawal] On approval (v2 path only), mint the
      // durable, non-expiring withdrawal link (MMT-ADR-0027) and deliver it two
      // ways: the post-approval confirmation email — the durable home the parent
      // returns to later — and a line on the landing page (immediate but
      // ephemeral). Both require the HMAC secret AND the API origin; if either
      // binding is absent the approval still succeeds and the link is simply
      // omitted — never 500 the already-committed approval. The email send is
      // fire-and-forget: sendEmail never throws (it returns {sent:false} and
      // captures to Sentry), so a delivery outage cannot fail the approval.
      let withdrawalUrl: string | null = null;
      if (approved && v2Result) {
        const secret = c.env.CONSENT_WITHDRAWAL_TOKEN_SECRET;
        const apiOrigin = c.env.API_ORIGIN;
        if (secret && apiOrigin && v2Result.withdrawalTokenId) {
          const withdrawalToken = signWithdrawalToken(
            v2Result.chargePersonId,
            v2Result.organizationId,
            secret,
            { tokenId: v2Result.withdrawalTokenId },
          );
          const basePath = c.req.path.replaceAll('/consent-page/confirm', '');
          withdrawalUrl = `${apiOrigin}${basePath}/consent-page/withdraw?token=${encodeURIComponent(
            withdrawalToken,
          )}`;
          if (v2Result.guardianEmail) {
            const emailSend = sendEmail(
              formatConsentApprovedEmail(
                v2Result.guardianEmail,
                childName,
                withdrawalUrl,
              ),
              {
                resendApiKey: c.env.RESEND_API_KEY,
                emailFrom: c.env.EMAIL_FROM,
                db,
              },
            );
            try {
              c.executionCtx.waitUntil(emailSend);
            } catch {
              // No executionCtx (test / non-Worker runtime). sendEmail never
              // rejects, so dropping the orphaned promise is safe.
              void emailSend;
            }
          }
        }
      }

      if (approved) {
        // Approval landing — per UX spec: celebratory page with next steps
        return c.html(
          pageLayout(
            'Family Account Ready',
            `<h1>Family account ready!</h1>
             <p>${escapeHtml(
               childName,
             )}'s account is now active. They can start learning right away.</p>
             <a href="mentomate://home" class="btn btn-primary">
               See ${escapeHtml(childName)}'s Progress
             </a>
             <a href="mentomate://onboarding" class="btn btn-secondary">
               Start My Own Learning
             </a>
             ${
               withdrawalUrl
                 ? `<p class="info">To withdraw your consent at any time, use the link we just emailed you — or <a href="${escapeHtml(
                     withdrawalUrl,
                   )}" style="color:${BRAND_COLOR_PRIMARY};">this link</a>.</p>`
                 : ''
             }
             <p class="info">You may now close this tab.</p>
             <div class="app-links">
               <p>Download the app for the best experience</p>
               <a href="https://play.google.com/store/apps/details?id=com.mentomate.app" class="btn btn-secondary">Google Play</a>
               <a href="https://apps.apple.com/app/mentomate/id6741906959" class="btn btn-secondary">App Store</a>
             </div>`,
          ),
        );
      }

      // Denial landing
      return c.html(
        pageLayout(
          'Consent Declined',
          `<h1>Consent declined</h1>
           <p>${escapeHtml(
             childName,
           )}'s account will be removed. Their data will not be processed.</p>
           <p class="info">If this was a mistake, your child can send a new consent request from the app.</p>
           <a href="mentomate://home" class="btn btn-secondary">
             Back to MentoMate
           </a>
           <p class="info">You may now close this tab.</p>`,
        ),
      );
    } catch (error) {
      // [BUG-870] Classify on the error CLASS, not the message string.
      // processConsentResponse (and its v2 twin) throws three distinct known
      // errors; each maps to its own actionable friendly page. The previous
      // `error.message === 'Invalid consent token'` check only caught
      // ConsentTokenNotFoundError — ConsentAlreadyProcessedError and
      // ConsentTokenExpiredError fell through and re-threw, surfacing a raw
      // 500 to the parent instead of an actionable page.
      if (error instanceof ConsentTokenNotFoundError) {
        return c.html(
          pageLayout(
            'Link Expired',
            `<h1 class="error">Link expired or invalid</h1>
             <p>This consent link is no longer valid.</p>
             <p>Ask your child to resend the consent request from the app.</p>
             ${errorActionHtml()}`,
          ),
          404,
        );
      }

      if (error instanceof ConsentTokenExpiredError) {
        return c.html(
          pageLayout(
            'Link Expired',
            `<h1 class="error">This link has expired</h1>
             <p>Consent links are valid for a limited time and this one has now expired.</p>
             <p>Ask your child to resend the consent request from the app.</p>
             ${errorActionHtml()}`,
          ),
          410,
        );
      }

      if (error instanceof ConsentAlreadyProcessedError) {
        return c.html(
          pageLayout(
            'Already Responded',
            `<h1>This request has already been processed</h1>
             <p>A response for this consent request has already been recorded, so there is nothing more to do here.</p>
             <p>If you did not expect this, your child can send a new consent request from the app.</p>
             ${errorActionHtml()}`,
          ),
          409,
        );
      }

      throw error;
    }
  })

  /**
   * GET /consent-page/withdraw?token=X
   *
   * [P0 email-consent-withdrawal] The email-consenting parent's withdrawal
   * entry point (reached from the post-approval confirmation email). Bearer-
   * token authority (MMT-ADR-0027): a signed link IS the authority, since this
   * parent has no account and no guardianship edge. Two-step GET→POST so an
   * email link-prefetcher cannot auto-withdraw.
   */
  .get('/consent-page/withdraw', async (c) => {
    const limited = consentPageRateLimit(c, 'view');
    if (limited) return limited;

    const token = c.req.query('token');
    const secret = c.env.CONSENT_WITHDRAWAL_TOKEN_SECRET;
    const payload =
      token && secret ? verifyWithdrawalToken(token, secret) : null;
    if (!payload || !token) {
      return c.html(pageLayout('Invalid Link', withdrawInvalidLinkBody()), 400);
    }

    const db = c.get('db');
    const childName =
      (await getPersonDisplayNameV2(db, payload.chargePersonId)) ??
      'your child';
    const state = await getGdprGrantWithdrawalStateV2(
      db,
      payload.chargePersonId,
      payload.organizationId,
      // [WI-2347] `?? null`: a cw1 token has no tokenId (undefined); the
      // service layer treats `undefined` as "skip the check" (edge-only
      // callers), so a bearer-token call must always pass a defined value.
      payload.tokenId ?? null,
    );

    // No current grant (never approved, or already deleted past grace) →
    // a friendly no-op page (also the no-enumeration outcome: this is
    // indistinguishable from a not-yet-approved id).
    if (!state) {
      return c.html(
        pageLayout('Nothing to Withdraw', nothingToWithdrawBody(childName)),
      );
    }

    const basePath = c.req.path.replaceAll('/consent-page/withdraw', '');

    // Already withdrawn (in grace) → the undo (restore) landing.
    if (state.withdrawnAt) {
      return c.html(
        pageLayout(
          'Consent Withdrawn',
          withdrawnLandingBody(
            childName,
            token,
            `${basePath}/consent-page/restore`,
          ),
        ),
      );
    }

    // Active grant → the "are you sure?" confirm page (mirrors deny-confirm).
    return c.html(
      pageLayout(
        'Withdraw Consent',
        withdrawConfirmBody(
          childName,
          token,
          `${basePath}/consent-page/withdraw`,
        ),
      ),
    );
  })

  /**
   * POST /consent-page/withdraw
   *
   * Executes the withdrawal: stamp WITHDRAWN (the minor is gated out
   * immediately by the existing consent gate) and dispatch the edge-free
   * grace→delete Inngest workflow. POST-only behind the GET confirm
   * (CSRF/prefetch safety, matching the confirm route's rationale above).
   */
  .post('/consent-page/withdraw', async (c) => {
    const limited = consentPageRateLimit(c);
    if (limited) return limited;

    const body = await c.req.parseBody();
    const token = typeof body['token'] === 'string' ? body['token'] : null;
    const secret = c.env.CONSENT_WITHDRAWAL_TOKEN_SECRET;
    const payload =
      token && secret ? verifyWithdrawalToken(token, secret) : null;
    if (!payload || !token) {
      return c.html(pageLayout('Invalid Link', withdrawInvalidLinkBody()), 400);
    }

    const db = c.get('db');
    const childName =
      (await getPersonDisplayNameV2(db, payload.chargePersonId)) ??
      'your child';
    const audit = {
      requestIp:
        c.req.header('cf-connecting-ip') ??
        c.req.header('x-forwarded-for') ??
        undefined,
      userAgent: c.req.header('user-agent') ?? undefined,
    };

    try {
      const result = await withdrawConsentByToken(
        db,
        payload.chargePersonId,
        payload.organizationId,
        audit,
        // [WI-2347] see the GET-withdraw call site above for the `?? null` rationale.
        payload.tokenId ?? null,
      );

      // Durable grace→delete via Inngest (engine rule: durable async →
      // Inngest, not inline in a Worker request). Non-core: the withdrawal
      // already committed and the minor is gated out, so a dispatch failure
      // must be captured, never 500 the parent. waitUntil keeps the Worker
      // alive until the dispatch settles without delaying the response.
      const dispatch = safeSend(
        () =>
          inngest.send({
            name: 'app/consent.email-revoked',
            data: {
              chargePersonId: payload.chargePersonId,
              revokedAt: result.withdrawnAt.toISOString(),
            },
          }),
        'consent-web.email-revoked',
        { chargePersonId: payload.chargePersonId },
      );
      try {
        c.executionCtx.waitUntil(dispatch);
      } catch {
        void dispatch;
      }

      const basePath = c.req.path.replaceAll('/consent-page/withdraw', '');
      return c.html(
        pageLayout(
          'Consent Withdrawn',
          withdrawnLandingBody(
            childName,
            token,
            `${basePath}/consent-page/restore`,
          ),
        ),
      );
    } catch (error) {
      // Stale link / never approved → safe no-op page.
      if (error instanceof ConsentRecordNotFoundError) {
        return c.html(
          pageLayout('Nothing to Withdraw', nothingToWithdrawBody(childName)),
        );
      }
      throw error;
    }
  })

  /**
   * POST /consent-page/restore
   *
   * The undo: re-grant within the 7-day grace. Outside grace the data is
   * already permanently removed → friendly "grace expired" page.
   */
  .post('/consent-page/restore', async (c) => {
    const limited = consentPageRateLimit(c);
    if (limited) return limited;

    const body = await c.req.parseBody();
    const token = typeof body['token'] === 'string' ? body['token'] : null;
    const secret = c.env.CONSENT_WITHDRAWAL_TOKEN_SECRET;
    const payload =
      token && secret ? verifyWithdrawalToken(token, secret) : null;
    if (!payload || !token) {
      return c.html(pageLayout('Invalid Link', withdrawInvalidLinkBody()), 400);
    }

    const db = c.get('db');
    const childName =
      (await getPersonDisplayNameV2(db, payload.chargePersonId)) ??
      'your child';
    const audit = {
      requestIp:
        c.req.header('cf-connecting-ip') ??
        c.req.header('x-forwarded-for') ??
        undefined,
      userAgent: c.req.header('user-agent') ?? undefined,
    };

    try {
      await restoreConsentByToken(
        db,
        payload.chargePersonId,
        payload.organizationId,
        audit,
        // [WI-2347] see the GET-withdraw call site above for the `?? null` rationale.
        payload.tokenId ?? null,
      );
      return c.html(
        pageLayout('Consent Restored', consentRestoredBody(childName)),
      );
    } catch (error) {
      if (error instanceof ConsentGracePeriodExpiredError) {
        return c.html(
          pageLayout('Grace Period Expired', graceExpiredBody(childName)),
          410,
        );
      }
      // No grant to restore (already deleted, or never withdrawn) → safe page.
      if (error instanceof ConsentRecordNotFoundError) {
        return c.html(
          pageLayout('Nothing to Restore', nothingToWithdrawBody(childName)),
        );
      }
      throw error;
    }
  });
