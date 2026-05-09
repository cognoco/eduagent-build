import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  notificationPrefsSchema,
  learningModeUpdateSchema,
  pushTokenRegisterSchema,
  analogyDomainUpdateSchema,
  celebrationLevelUpdateSchema,
  withdrawalArchivePreferenceUpdateSchema,
  familyPoolBreakdownSharingUpdateSchema,
  nativeLanguageUpdateSchema,
  getNotificationsResponseSchema,
  getLearningModeResponseSchema,
  getCelebrationLevelResponseSchema,
  getWithdrawalArchivePreferenceResponseSchema,
  updateWithdrawalArchivePreferenceResponseSchema,
  getFamilyPoolBreakdownSharingResponseSchema,
  updateFamilyPoolBreakdownSharingResponseSchema,
  pushTokenRegisteredResponseSchema,
  notifyParentSubscribeResponseSchema,
  analogyDomainResponseSchema,
  nativeLanguageResponseSchema,
  ForbiddenError,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { requireProfileId } from '../middleware/profile-scope';
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
  getLearningMode,
  upsertLearningMode,
  getCelebrationLevel,
  upsertCelebrationLevel,
  getWithdrawalArchivePreference,
  upsertWithdrawalArchivePreference,
  getOwnedFamilyPoolBreakdownSharing,
  upsertFamilyPoolBreakdownSharing,
  registerPushToken,
} from '../services/settings';
import { notifyParentToSubscribe } from '../services/notifications';
import { clearSessionStaticContextForProfile } from '../services/session/session-cache';
import { captureException } from '../services/sentry';
import { createLogger } from '../services/logger';
import {
  getAnalogyDomain,
  getNativeLanguage,
  setAnalogyDomain,
  setNativeLanguage,
} from '../services/retention-data';
import { forbidden, notFound, NotFoundError } from '../errors';

type SettingsRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    API_ORIGIN?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
  };
};

const subjectParamSchema = z.object({
  subjectId: z.string().uuid(),
});

const logger = createLogger();

export const settingsRoutes = new Hono<SettingsRouteEnv>()
  // Get notification preferences
  .get('/settings/notifications', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const preferences = await getNotificationPrefs(db, profileId);
    return c.json(getNotificationsResponseSchema.parse({ preferences }));
  })

  // Update notification preferences
  .put(
    '/settings/notifications',
    zValidator('json', notificationPrefsSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const body = c.req.valid('json');
      const preferences = await upsertNotificationPrefs(
        db,
        profileId,
        accountId,
        body,
      );
      return c.json(getNotificationsResponseSchema.parse({ preferences }));
    },
  )

  // Get learning mode
  .get('/settings/learning-mode', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const result = await getLearningMode(db, profileId);
    return c.json(getLearningModeResponseSchema.parse({ mode: result.mode }));
  })

  // Update learning mode
  .put(
    '/settings/learning-mode',
    zValidator('json', learningModeUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const body = c.req.valid('json');
      const result = await upsertLearningMode(
        db,
        profileId,
        accountId,
        body.mode,
      );
      try {
        clearSessionStaticContextForProfile(profileId);
      } catch (err) {
        logger.warn('[settings] clearSessionStaticContext failed', {
          event: 'settings.clear_session_context_failed',
          profileId,
          error: err instanceof Error ? err.message : String(err),
        });
        captureException(err, {
          profileId,
          extra: { context: 'clear-session-static-context' },
        });
        // best-effort — don't 500 a successful mode change on cache failure
      }
      return c.json(getLearningModeResponseSchema.parse({ mode: result.mode }));
    },
  )

  .get('/settings/celebration-level', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const celebrationLevel = await getCelebrationLevel(db, profileId);
    return c.json(
      getCelebrationLevelResponseSchema.parse({ celebrationLevel }),
    );
  })

  .put(
    '/settings/celebration-level',
    zValidator('json', celebrationLevelUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const body = c.req.valid('json');
      const result = await upsertCelebrationLevel(
        db,
        profileId,
        accountId,
        body.celebrationLevel,
      );
      return c.json(getCelebrationLevelResponseSchema.parse(result));
    },
  )

  .get('/settings/withdrawal-archive', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));

    // I5: mirror the PUT endpoint's owner gate — only account owners may read
    // the withdrawal-archive preference.
    const profile = await db.query.profiles.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, profileId),
      columns: { isOwner: true },
    });
    if (!profile?.isOwner) {
      return forbidden(c);
    }

    const value = await getWithdrawalArchivePreference(db, profileId);
    return c.json(
      getWithdrawalArchivePreferenceResponseSchema.parse({ value }),
    );
  })

  .put(
    '/settings/withdrawal-archive',
    zValidator('json', withdrawalArchivePreferenceUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const body = c.req.valid('json');

      try {
        const result = await upsertWithdrawalArchivePreference(
          db,
          profileId,
          accountId,
          body.value,
        );
        return c.json(
          updateWithdrawalArchivePreferenceResponseSchema.parse(result),
        );
      } catch (error) {
        if (error instanceof ForbiddenError) {
          return forbidden(c);
        }
        throw error;
      }
    },
  )

  .get('/settings/family-pool-breakdown-sharing', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    const accountId = c.get('account').id;

    try {
      const value = await getOwnedFamilyPoolBreakdownSharing(
        db,
        profileId,
        accountId,
      );
      return c.json(
        getFamilyPoolBreakdownSharingResponseSchema.parse({ value }),
      );
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return forbidden(c);
      }
      throw error;
    }
  })

  .put(
    '/settings/family-pool-breakdown-sharing',
    zValidator('json', familyPoolBreakdownSharingUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const body = c.req.valid('json');

      try {
        const result = await upsertFamilyPoolBreakdownSharing(
          db,
          profileId,
          accountId,
          body.value,
        );
        return c.json(
          updateFamilyPoolBreakdownSharingResponseSchema.parse(result),
        );
      } catch (error) {
        if (error instanceof ForbiddenError) {
          return forbidden(c);
        }
        throw error;
      }
    },
  )

  // Register push token
  .post(
    '/settings/push-token',
    zValidator('json', pushTokenRegisterSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const accountId = c.get('account').id;
      const body = c.req.valid('json');
      await registerPushToken(db, profileId, accountId, body.token);
      return c.json(
        pushTokenRegisteredResponseSchema.parse({ registered: true }),
      );
    },
  )

  // Notify parent to subscribe (child-friendly paywall)
  .post('/settings/notify-parent-subscribe', async (c) => {
    const db = c.get('db');
    const profileId = requireProfileId(c.get('profileId'));
    // API_ORIGIN must be set — falling back to c.req.url would allow Host header
    // injection (OWASP A03) since Cloudflare Workers populate it from the
    // attacker-supplied Host header.
    const apiOrigin = c.env.API_ORIGIN;
    if (!apiOrigin) {
      throw new Error('API_ORIGIN env var is required');
    }
    const result = await notifyParentToSubscribe(
      db,
      profileId,
      {
        resendApiKey: c.env.RESEND_API_KEY,
        emailFrom: c.env.EMAIL_FROM,
      },
      apiOrigin,
    );
    return c.json(notifyParentSubscribeResponseSchema.parse(result));
  })

  // Get analogy domain preference for a subject (FR134-137)
  .get(
    '/settings/subjects/:subjectId/analogy-domain',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');
      const analogyDomain = await getAnalogyDomain(db, profileId, subjectId);
      return c.json(analogyDomainResponseSchema.parse({ analogyDomain }));
    },
  )

  // Update analogy domain preference for a subject (FR134-137)
  .put(
    '/settings/subjects/:subjectId/analogy-domain',
    zValidator('param', subjectParamSchema),
    zValidator('json', analogyDomainUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');
      const body = c.req.valid('json');

      try {
        const analogyDomain = await setAnalogyDomain(
          db,
          profileId,
          subjectId,
          body.analogyDomain,
        );
        return c.json(analogyDomainResponseSchema.parse({ analogyDomain }));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  )
  .get(
    '/settings/subjects/:subjectId/native-language',
    zValidator('param', subjectParamSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');
      const nativeLanguage = await getNativeLanguage(db, profileId, subjectId);
      return c.json(nativeLanguageResponseSchema.parse({ nativeLanguage }));
    },
  )
  .put(
    '/settings/subjects/:subjectId/native-language',
    zValidator('param', subjectParamSchema),
    zValidator('json', nativeLanguageUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const profileId = requireProfileId(c.get('profileId'));
      const { subjectId } = c.req.valid('param');
      const body = c.req.valid('json');

      try {
        const nativeLanguage = await setNativeLanguage(
          db,
          profileId,
          subjectId,
          body.nativeLanguage,
        );
        return c.json(nativeLanguageResponseSchema.parse({ nativeLanguage }));
      } catch (error) {
        if (error instanceof NotFoundError) {
          return notFound(c, error.message);
        }
        throw error;
      }
    },
  );
