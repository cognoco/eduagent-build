import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  notificationPrefsSchema,
  pushTokenRegisterSchema,
  analogyDomainUpdateSchema,
  celebrationLevelQuerySchema,
  celebrationLevelUpdateSchema,
  withdrawalArchivePreferenceUpdateSchema,
  familyPoolBreakdownSharingUpdateSchema,
  nativeLanguageUpdateSchema,
  getNotificationsResponseSchema,
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
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireAccount } from '../middleware/profile-scope';
import { withProfile } from '../route-utils/route-context';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { assertOwnerProfile } from '../services/family-access';
import {
  getNotificationPrefs,
  upsertNotificationPrefs,
  getCelebrationLevel,
  getChildCelebrationLevel,
  upsertCelebrationLevel,
  upsertChildCelebrationLevel,
  getWithdrawalArchivePreference,
  upsertWithdrawalArchivePreference,
  getOwnedFamilyPoolBreakdownSharing,
  upsertFamilyPoolBreakdownSharing,
  registerPushToken,
} from '../services/settings';
import { notifyParentToSubscribe } from '../services/notifications';
import {
  getAnalogyDomain,
  getNativeLanguage,
  setAnalogyDomain,
  setNativeLanguage,
} from '../services/retention-data';
import { forbidden, notFound, NotFoundError } from '../errors';
import { isIdentityV2Enabled } from '../config';

type SettingsRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    API_ORIGIN?: string;
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    callerPersonId: string | undefined;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

const subjectParamSchema = z.object({
  subjectId: z.string().uuid(),
});

export const settingsRoutes = new Hono<SettingsRouteEnv>()
  // Get notification preferences
  .get('/settings/notifications', async (c) => {
    const { db, profileId } = withProfile(c);
    const preferences = await getNotificationPrefs(db, profileId);
    return c.json(getNotificationsResponseSchema.parse({ preferences }));
  })

  // Update notification preferences
  .put(
    '/settings/notifications',
    zValidator('json', notificationPrefsSchema),
    async (c) => {
      // [WI-173 / DS-084] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const body = c.req.valid('json');
      const preferences = await upsertNotificationPrefs(
        db,
        profileId,
        accountId,
        body,
        {
          identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
          callerPersonId: c.get('callerPersonId'),
        },
      );
      return c.json(getNotificationsResponseSchema.parse({ preferences }));
    },
  )

  .get(
    '/settings/celebration-level',
    zValidator('query', celebrationLevelQuerySchema),
    async (c) => {
      const { db, profileId } = withProfile(c);
      const query = c.req.valid('query');
      // [CR defense-in-depth] Parent-on-behalf child routes must require the
      // owner gate (matches consent / learner-profile / onboarding), not just
      // the family-link check inside the service. A non-owner never has child
      // links today, but gating only on the link diverges from the pattern.
      if (query.childProfileId) {
        assertOwnerProfile(c);
      }
      const celebrationLevel = query.childProfileId
        ? await getChildCelebrationLevel(db, profileId, query.childProfileId)
        : await getCelebrationLevel(db, profileId);
      return c.json(
        getCelebrationLevelResponseSchema.parse({ celebrationLevel }),
      );
    },
  )

  .put(
    '/settings/celebration-level',
    zValidator('json', celebrationLevelUpdateSchema),
    async (c) => {
      // [WI-173 / DS-084] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const body = c.req.valid('json');
      // [CR defense-in-depth] See GET handler above — owner gate on the
      // parent-on-behalf child branch for consistency with other parent-admin
      // routes.
      if (body.childProfileId) {
        assertOwnerProfile(c);
      }
      const result = body.childProfileId
        ? await upsertChildCelebrationLevel(
            db,
            profileId,
            body.childProfileId,
            body.celebrationLevel,
          )
        : await upsertCelebrationLevel(
            db,
            profileId,
            accountId,
            body.celebrationLevel,
            {
              identityV2Enabled: isIdentityV2Enabled(
                c.env?.IDENTITY_V2_ENABLED,
              ),
              callerPersonId: c.get('callerPersonId'),
            },
          );
      return c.json(getCelebrationLevelResponseSchema.parse(result));
    },
  )

  .get('/settings/withdrawal-archive', async (c) => {
    // [audit-2026-05-30] Use the same gate helper as the PUT below + the
    // sibling /settings/celebration-level branch to avoid drift if the
    // owner predicate ever changes (an inline isOwner read could be quietly
    // removed by a future refactor thinking it's duplicative).
    assertOwnerProfile(c);
    const { db, profileId } = withProfile(c);
    const value = await getWithdrawalArchivePreference(db, profileId);
    return c.json(
      getWithdrawalArchivePreferenceResponseSchema.parse({ value }),
    );
  })

  .put(
    '/settings/withdrawal-archive',
    zValidator('json', withdrawalArchivePreferenceUpdateSchema),
    async (c) => {
      // [WI-173 / DS-084] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const body = c.req.valid('json');

      try {
        const result = await upsertWithdrawalArchivePreference(
          db,
          profileId,
          accountId,
          body.value,
          {
            identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
            callerPersonId: c.get('callerPersonId'),
          },
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
    const { db, profileId } = withProfile(c);
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const accountId = requireAccount(c.get('account')).id;

    try {
      const value = await getOwnedFamilyPoolBreakdownSharing(
        db,
        profileId,
        accountId,
        {
          identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
          callerPersonId: c.get('callerPersonId'),
        },
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
      // [WI-173 / DS-084] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const body = c.req.valid('json');

      try {
        const result = await upsertFamilyPoolBreakdownSharing(
          db,
          profileId,
          accountId,
          body.value,
          {
            identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
            callerPersonId: c.get('callerPersonId'),
          },
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
      // [WI-173 / DS-084] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const accountId = requireAccount(c.get('account')).id;
      const body = c.req.valid('json');
      await registerPushToken(db, profileId, accountId, body.token, {
        identityV2Enabled: isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED),
        callerPersonId: c.get('callerPersonId'),
      });
      return c.json(
        pushTokenRegisteredResponseSchema.parse({ registered: true }),
      );
    },
  )

  // Notify parent to subscribe (child-friendly paywall)
  .post('/settings/notify-parent-subscribe', async (c) => {
    // [WI-173 / DS-084] Server-derived proxy-mode write guard.
    // Intentional: this endpoint is called from the CHILD profile when the
    // child hits a paywall; a parent-proxy session reaching it means the
    // parent is impersonating the child rather than the child themselves
    // asking — block.
    assertNotProxyMode(c);
    const { db, profileId } = withProfile(c);
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
      const { db, profileId } = withProfile(c);
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
      // [WI-173 / DS-084] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
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
      const { db, profileId } = withProfile(c);
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
      // [WI-173 / DS-084] Server-derived proxy-mode write guard.
      assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
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
