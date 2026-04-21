import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { feedbackSubmissionSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Database } from '@eduagent/database';
import { sendEmail } from '../services/notifications';
import { inngest } from '../inngest/client';

type FeedbackRouteEnv = {
  Bindings: {
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    SUPPORT_EMAIL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const DEFAULT_SUPPORT_EMAIL = 'support@mentomate.app';

export const feedbackRoutes = new Hono<FeedbackRouteEnv>().post(
  '/feedback',
  zValidator('json', feedbackSubmissionSchema),
  async (c) => {
    const body = c.req.valid('json');
    const profileId = c.get('profileId') ?? 'unknown';
    const userId = c.get('user').userId;
    const env = c.env ?? {};
    const supportTo = env.SUPPORT_EMAIL ?? DEFAULT_SUPPORT_EMAIL;

    const categoryLabel =
      body.category === 'bug'
        ? 'Bug Report'
        : body.category === 'suggestion'
        ? 'Suggestion'
        : 'Feedback';

    const metaLines = [
      `Profile ID: ${profileId}`,
      `User ID: ${userId}`,
      body.appVersion ? `App Version: ${body.appVersion}` : null,
      body.platform ? `Platform: ${body.platform}` : null,
      body.osVersion ? `OS Version: ${body.osVersion}` : null,
      `Submitted: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await sendEmail(
        {
          to: supportTo,
          subject: `[MentoMate ${categoryLabel}] from ${profileId.slice(0, 8)}`,
          body: `${body.message}\n\n---\n${metaLines}`,
          type: 'feedback',
        },
        {
          resendApiKey: env.RESEND_API_KEY,
          emailFrom: env.EMAIL_FROM,
        }
      );
    } catch (err) {
      console.error('[feedback] sendEmail threw unexpectedly:', err);
      void inngest.send({
        name: 'app/feedback.delivery_failed',
        data: { profileId, category: body.category },
      });
    }

    return c.json({ success: true });
  }
);
