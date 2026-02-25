import { Hono } from 'hono';
import type { Database } from '@eduagent/database';
import {
  processConsentResponse,
  getChildNameByToken,
} from '../services/consent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConsentWebEnv = {
  Bindings: {
    DATABASE_URL: string;
    APP_URL?: string;
  };
  Variables: { db: Database };
};

// ---------------------------------------------------------------------------
// Shared HTML layout
// ---------------------------------------------------------------------------

function pageLayout(title: string, body: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — EduAgent</title>
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
    .logo { font-size: 28px; font-weight: 700; color: #6c5ce7; margin-bottom: 24px; }
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
    .btn-primary { background: #6c5ce7; color: #fff; }
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
    <div class="logo">EduAgent</div>
    ${body}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Routes — public, no auth required
// ---------------------------------------------------------------------------

export const consentWebRoutes = new Hono<ConsentWebEnv>()

  /**
   * GET /consent-page?token=X
   *
   * Renders the consent decision page. Parent clicks approve or deny,
   * which links to the confirm endpoint.
   */
  .get('/consent-page', async (c) => {
    const token = c.req.query('token');
    if (!token) {
      return c.html(
        pageLayout(
          'Invalid Link',
          `<h1 class="error">Invalid link</h1>
           <p>This consent link is missing required information. Please check your email for the correct link.</p>`
        ),
        400
      );
    }

    const db = c.get('db');
    const childName = await getChildNameByToken(db, token);

    if (!childName) {
      return c.html(
        pageLayout(
          'Link Expired',
          `<h1 class="error">Link expired or invalid</h1>
           <p>This consent link has expired or is no longer valid.</p>
           <p>Ask your child to resend the consent request from the app.</p>`
        ),
        404
      );
    }

    const basePath = c.req.path.replace('/consent-page', '');
    const confirmUrl = `${basePath}/consent-page/confirm`;

    return c.html(
      pageLayout(
        'Parental Consent',
        `<h1>Consent required for ${childName}</h1>
         <p>${childName} wants to use EduAgent, an AI-powered learning platform. Under applicable privacy regulations, we need your consent.</p>
         <p>By approving, you allow us to process ${childName}'s learning data to provide personalised tutoring.</p>
         <a href="${confirmUrl}?token=${encodeURIComponent(
          token
        )}&approved=true" class="btn btn-primary">
           Approve
         </a>
         <a href="${confirmUrl}?token=${encodeURIComponent(
          token
        )}&approved=false" class="btn btn-danger">
           Deny
         </a>
         <p class="info">You can withdraw consent at any time from the parent dashboard in the app.</p>`
      )
    );
  })

  /**
   * GET /consent-page/confirm?token=X&approved=true|false
   *
   * Processes the consent response and renders the appropriate landing page.
   */
  .get('/consent-page/confirm', async (c) => {
    const token = c.req.query('token');
    const approvedParam = c.req.query('approved');

    if (!token || !approvedParam) {
      return c.html(
        pageLayout(
          'Invalid Link',
          `<h1 class="error">Invalid link</h1>
           <p>This link is missing required information.</p>`
        ),
        400
      );
    }

    const approved = approvedParam === 'true';
    const db = c.get('db');

    try {
      // Fetch child name BEFORE processing — denial deletes the profile
      const childName = (await getChildNameByToken(db, token)) ?? 'Your child';
      await processConsentResponse(db, token, approved);

      if (approved) {
        // Approval landing — per UX spec: celebratory page with next steps
        return c.html(
          pageLayout(
            'Family Account Ready',
            `<h1>Family account ready!</h1>
             <p>${childName}'s account is now active. They can start learning right away.</p>
             <a href="eduagent://parent/dashboard" class="btn btn-primary">
               See ${childName}'s Progress
             </a>
             <a href="eduagent://onboarding?persona=learner" class="btn btn-secondary">
               Start My Own Learning
             </a>
             <button onclick="document.body.innerHTML='<div style=\\'text-align:center;padding:60px;font-size:18px;color:#888\\'>You can close this tab.</div>'" class="btn btn-outline">
               Close
             </button>
             <div class="app-links">
               <p>Download the app for the best experience</p>
               <a href="https://apps.apple.com/app/eduagent" class="btn btn-secondary" style="margin-bottom:8px">App Store</a>
               <a href="https://play.google.com/store/apps/details?id=com.eduagent" class="btn btn-secondary">Google Play</a>
             </div>`
          )
        );
      }

      // Denial landing
      return c.html(
        pageLayout(
          'Consent Declined',
          `<h1>Consent declined</h1>
           <p>${childName}'s account will be removed. Their data will not be processed.</p>
           <p class="info">If this was a mistake, your child can send a new consent request from the app.</p>
           <button onclick="document.body.innerHTML='<div style=\\'text-align:center;padding:60px;font-size:18px;color:#888\\'>You can close this tab.</div>'" class="btn btn-outline">
             Close
           </button>`
        )
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid consent token') {
        return c.html(
          pageLayout(
            'Link Expired',
            `<h1 class="error">Link expired or invalid</h1>
             <p>This consent link has expired or has already been used.</p>
             <p>Ask your child to resend the consent request from the app.</p>`
          ),
          404
        );
      }
      throw error;
    }
  });
