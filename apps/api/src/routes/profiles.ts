import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  profileCreateSchema,
  profileAppContextUpdateSchema,
  profileUpdateSchema,
  profileSwitchSchema,
  profileResponseSchema,
  profileListResponseSchema,
  profileSwitchResponseSchema,
  ERROR_CODES,
  ForbiddenError,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import type { ProfileMeta } from '../middleware/profile-scope';
import type { ClerkIdentity } from '../middleware/account';
import { requireAccount } from '../middleware/profile-scope';
import { createIdentityGraph } from '../services/identity-v2/identity-graph';
import { createChildProfileV2 } from '../services/identity-v2/child-profile-v2';
import {
  getOwnerProfileV2,
  listProfilesV2,
  getProfileV2,
  getPersonScope,
  updateProfileV2,
} from '../services/identity-v2/profile-v2';
import { verifyPersonIsOrgAdminV2 } from '../services/identity-v2/ownership-v2';

import {
  notFound,
  forbidden,
  validationError,
  apiError,
  ConflictError,
} from '../errors';
import {
  updateProfileAppContext,
  ProfileValidationError,
  ProfileLimitError,
} from '../services/profile';

type ProfileEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    // [OPT-C] Kill switch for the server-side adult-owner rule. Set to 'false'
    // in Doppler to disable the gate (emergency rollback). Default 'true'.
    ADULT_OWNER_GATE_ENABLED?: string;
    // [WI-301] Kill switch for non-owner -> owner profile elevation.
    // Default-on; set to 'false' for emergency rollback.
    OWNER_ELEVATION_GATE_ENABLED?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account | undefined;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
    // [WI-1302] The authenticated caller's own person id, resolved server-side
    // by accountMiddleware — required by isCallerAlreadyOwner (never
    // request-supplied, unlike X-Profile-Id).
    callerPersonId: string | undefined;
    // [CUT-B1] Set on the v2 pre-graph path (no account yet).
    clerkIdentity: ClerkIdentity | undefined;
  };
};

const OWNER_ELEVATION_MAX_FVA_MINUTES = 10;

function isOwnerElevationGateEnabled(value: string | undefined): boolean {
  return value !== 'false';
}

function hasRecentOwnerElevation(user: AuthUser | undefined): boolean {
  const primaryFactorAge = user?.factorVerificationAge?.[0];
  return (
    typeof primaryFactorAge === 'number' &&
    primaryFactorAge >= 0 &&
    primaryFactorAge <= OWNER_ELEVATION_MAX_FVA_MINUTES
  );
}

/**
 * [WI-1302 — R2 elevation-bypass] Whether the CALLER already holds owner
 * authority over the account — resolved from `callerPersonId` (the
 * authenticated login->person binding, set server-side by accountMiddleware),
 * never from the client-supplied X-Profile-Id header.
 *
 * SECURITY (P1). The prior guard here, isExplicitOwnerContext, read
 * `profileMeta.isOwner` + `resolvedVia === 'explicit-header'` — both derived
 * from the profile the CLIENT SELECTED via X-Profile-Id. profileScopeMiddleware
 * verifies X-Profile-Id belongs to the caller's account, but not that it is
 * the caller's OWN identity. A non-owner caller could therefore send
 * `X-Profile-Id: <owner profile id>` to make isExplicitOwnerContext return
 * true and skip the fresh-reverification requirement below while actually
 * switching into the owner profile as someone else — the exact elevation
 * bypass this WI closes. This guard instead asks whether callerPersonId is
 * itself an admin member of the account, mirroring the WI-1301
 * assertCallerIsAccountOwner pattern via the same verifyPersonIsOrgAdminV2
 * primitive.
 */
async function isCallerAlreadyOwner(
  db: Database,
  callerPersonId: string | undefined,
  organizationId: string,
): Promise<boolean> {
  if (!callerPersonId) return false;
  return verifyPersonIsOrgAdminV2(db, callerPersonId, organizationId);
}

/**
 * [CUT-B1] Map the v2 bootstrap result + the create input to the byte-identical
 * `Profile` response shape the mobile onboarding flow expects. The owner is
 * always isOwner=true with a fresh graph: no family links yet, consent status
 * resolves to null pre-consent-write (the consent request/grant machine is
 * CUT-B2), `hasPremiumLlm` is the derived value (false; §1.3). Presentation
 * fields come from the validated input (the same values the graph persisted).
 */
function buildBootstrapProfile(
  graph: { personId: string; account: { id: string } },
  input: {
    displayName: string;
    avatarUrl?: string;
    birthYear: number;
    location?: 'EU' | 'US' | 'OTHER';
    conversationLanguage?: string;
    pronouns?: string | null;
  },
) {
  const now = new Date().toISOString();
  return {
    id: graph.personId,
    accountId: graph.account.id,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl ?? null,
    birthYear: input.birthYear,
    location: input.location ?? null,
    isOwner: true,
    hasPremiumLlm: false,
    defaultAppContext: null,
    hasFamilyLinks: false,
    conversationLanguage: input.conversationLanguage ?? 'en',
    pronouns: input.pronouns ?? null,
    consentStatus: null,
    linkCreatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const profileRoutes = new Hono<ProfileEnv>()
  .get('/profiles', async (c) => {
    const db = c.get('db');
    if (!c.get('account') && c.get('clerkIdentity')) {
      return c.json(profileListResponseSchema.parse({ profiles: [] }));
    }
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));
    const profiles = await listProfilesV2(db, account.id);
    return c.json(profileListResponseSchema.parse({ profiles }));
  })
  .post('/profiles', zValidator('json', profileCreateSchema), async (c) => {
    const db = c.get('db');
    const input = c.req.valid('json');

    {
      // Account resolved → the graph already exists (the bootstrap created the
      // owner). This POST is therefore a post-graph request:
      //   - an idempotent replay of the owner create (network retry /
      //     double-submit) → return the existing owner profile, NOT a second
      //     create (and NEVER the legacy writer).
      //   - a genuine CHILD create (kind:'child') → createChildProfileV2 writes
      //     the managed child + guardianship edge + direct consent grant.
      const resolvedAccount = c.get('account');
      if (resolvedAccount) {
        // [WI-811 review / Codex P1 + CONSIDER] Owner-only authorization for the
        // add-child path, fail-closed, BEFORE the owner DB fetch (fast-fail: a
        // non-owner caller never triggers the read). profileMeta (resolved in
        // profile-scope.ts) is authoritative: owner via header/auto-resolve →
        // isOwner:true; a child via X-Profile-Id → isOwner:false; unresolved →
        // undefined → reject. Deliberately NOT the legacy
        // assertProfileCreationAllowed — flag-on its profileMeta-absent fallback
        // counts the EMPTY legacy `profiles` table → 0 → fails OPEN; and an
        // add-child is provably never a first-profile bootstrap.
        // [Issue 901] Require an explicitly selected owner profile, not an
        // auto-synthesized one. profileScopeMiddleware auto-resolves the account
        // OWNER (isOwner:true) when no X-Profile-Id header is sent — so a
        // non-owner caller could omit the header to satisfy the isOwner check.
        if (
          input.kind === 'child' &&
          (c.get('profileMeta')?.isOwner !== true ||
            c.get('profileMeta')?.resolvedVia !== 'explicit-header')
        ) {
          return apiError(
            c,
            403,
            ERROR_CODES.FORBIDDEN,
            'Only the account owner can add a child profile.',
          );
        }

        const owner = await getOwnerProfileV2(db, resolvedAccount.id);

        // [WI-811 / CUT-B2] Genuine add-child create. The explicit discriminator
        // distinguishes this from an idempotent owner replay so a child-create
        // is NEVER silently answered with the owner profile. The organization is
        // ALWAYS resolvedAccount.id (the authenticated caller's org), never a
        // client value — the cross-org isolation guard.
        if (input.kind === 'child') {
          if (!owner) {
            // No owner to parent the child under — structurally-broken graph.
            return apiError(
              c,
              409,
              ERROR_CODES.CONFLICT,
              'Cannot add a child before the account owner exists.',
            );
          }
          try {
            const child = await createChildProfileV2(db, {
              organizationId: resolvedAccount.id,
              input,
              // [OPT-C] Default 'true' when binding missing (matches legacy).
              adultOwnerGateEnabled:
                c.env?.ADULT_OWNER_GATE_ENABLED !== 'false',
            });
            return c.json(profileResponseSchema.parse({ profile: child }), 201);
          } catch (err) {
            if (err instanceof ForbiddenError) {
              return apiError(c, 403, ERROR_CODES.FORBIDDEN, err.message);
            }
            if (err instanceof ProfileLimitError) {
              return apiError(
                c,
                402,
                ERROR_CODES.PROFILE_LIMIT_EXCEEDED,
                'Your subscription does not support additional profiles. Please upgrade to Family or Pro.',
              );
            }
            if (err instanceof ProfileValidationError) {
              return validationError(c, { [err.field]: [err.message] });
            }
            if (err instanceof ConflictError) {
              // Defense-in-depth: the orchestrator throws ConflictError if the
              // org has no owner (a structurally-broken graph / TOCTOU race the
              // pre-call owner check + advisory lock normally prevent). Surface
              // it as a 409 — consistent with the no-owner 409 below — not a 500.
              return apiError(c, 409, ERROR_CODES.CONFLICT, err.message);
            }
            throw err;
          }
        }

        if (owner) {
          // Idempotent replay of the owner bootstrap.
          return c.json(profileResponseSchema.parse({ profile: owner }), 201);
        }
        // No owner under a resolved account is a structurally-broken graph.
        return apiError(
          c,
          409,
          ERROR_CODES.CONFLICT,
          'Additional profile creation is not yet available.',
        );
      }

      // Pre-graph (no account; the graphless clerkIdentity is set) → bootstrap.
      const clerkIdentity = c.get('clerkIdentity');
      if (!clerkIdentity) {
        return apiError(
          c,
          401,
          ERROR_CODES.UNAUTHORIZED,
          'Authentication required to create a profile.',
        );
      }
      // [WI-811 fail-closed / ic-117] A kind:'child' create is only valid once
      // the account owner exists. Pre-graph there is no owner yet, so this must
      // fail closed — NOT fall through to createIdentityGraph below, which would
      // bootstrap the caller AS the owner (a silent privilege grant). The owner
      // gate above only guards the post-graph branch; this is its pre-graph
      // counterpart. Mirrors the post-graph no-owner 409.
      if (input.kind === 'child') {
        return apiError(
          c,
          409,
          ERROR_CODES.CONFLICT,
          'Cannot add a child before the account owner exists.',
        );
      }
      try {
        const graph = await createIdentityGraph(db, {
          clerkUserId: clerkIdentity.clerkUserId,
          verifiedEmail: clerkIdentity.verifiedEmail,
          displayName: input.displayName,
          birthYear: input.birthYear,
          birthMonth: input.birthMonth,
          birthDay: input.birthDay,
          location: input.location ?? null,
          conversationLanguage: input.conversationLanguage,
          pronouns: input.pronouns ?? null,
          avatarUrl: input.avatarUrl ?? null,
          timezone: null,
        });
        const profile = buildBootstrapProfile(graph, input);
        return c.json(profileResponseSchema.parse({ profile }), 201);
      } catch (err) {
        if (err instanceof ProfileValidationError) {
          return validationError(c, { [err.field]: [err.message] });
        }
        throw err;
      }
    }
  })
  .get('/profiles/:id', async (c) => {
    const db = c.get('db');
    // [CR-657] requireAccount() throws 401 if account is unset at runtime.
    const account = requireAccount(c.get('account'));
    const profile = await getProfileV2(db, c.req.param('id'), account.id);
    if (!profile) return notFound(c, 'Profile not found');
    return c.json(profileResponseSchema.parse({ profile }));
  })
  .patch(
    '/profiles/:id/app-context',
    zValidator('json', profileAppContextUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const account = requireAccount(c.get('account'));
      const id = c.req.param('id');
      const { defaultAppContext } = c.req.valid('json');

      const activeProfileId = c.get('profileId');
      const profileMeta = c.get('profileMeta');
      // [Issue 901] Reject auto-resolved (headerless) identities unconditionally.
      // profileScopeMiddleware auto-resolves the account owner (isOwner:true) when
      // no X-Profile-Id is sent — so a non-owner omitting the header gets
      // id === activeProfileId (both resolve to the owner id), bypassing the
      // self-edit exception below. Checking resolvedVia first closes that hole:
      // only explicitly-selected identities (the mobile client always sends the
      // header) may proceed. Auto-resolved owner self-edit is intentionally 403.
      if (profileMeta?.resolvedVia !== 'explicit-header') {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Only the account owner can update other profiles.',
        );
      }
      // Owner-or-self check: explicit-header owner may edit any profile; any other
      // explicit-header caller may only edit their own profile (self-update).
      if (profileMeta?.isOwner !== true && id !== activeProfileId) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Only the account owner can update other profiles.',
        );
      }

      let profile: Awaited<ReturnType<typeof updateProfileAppContext>>;
      try {
        profile = await updateProfileAppContext(
          db,
          id,
          account.id,
          defaultAppContext,
        );
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return apiError(c, 403, ERROR_CODES.FORBIDDEN, err.message);
        }
        throw err;
      }
      if (!profile) return notFound(c, 'Profile not found');
      return c.json(profileResponseSchema.parse({ profile }));
    },
  )
  .patch(
    '/profiles/:id',
    zValidator('json', profileUpdateSchema),
    async (c) => {
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const id = c.req.param('id');
      const input = c.req.valid('json');

      // [CR-2026-05-19-H1] Only the account owner (or the profile itself) can
      // update a profile. A child profile on a parent's account must not be
      // able to edit sibling profiles (IDOR). Self-updates are always allowed
      // so a non-owner can still update their own displayName/avatar/colorScheme.
      const activeProfileId = c.get('profileId');
      const profileMeta = c.get('profileMeta');
      // [Issue 901] Reject auto-resolved (headerless) identities unconditionally.
      // profileScopeMiddleware auto-resolves the account owner (isOwner:true) when
      // no X-Profile-Id is sent — so a non-owner omitting the header gets
      // id === activeProfileId (both resolve to the owner id), bypassing the
      // self-edit exception below. Checking resolvedVia first closes that hole:
      // only explicitly-selected identities (the mobile client always sends the
      // header) may proceed. Auto-resolved owner self-edit is intentionally 403.
      if (profileMeta?.resolvedVia !== 'explicit-header') {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Only the account owner can update other profiles.',
        );
      }
      // Owner-or-self check: explicit-header owner may edit any profile; any other
      // explicit-header caller may only edit their own profile (self-update).
      if (profileMeta?.isOwner !== true && id !== activeProfileId) {
        return apiError(
          c,
          403,
          ERROR_CODES.FORBIDDEN,
          'Only the account owner can update other profiles.',
        );
      }

      const profile = await updateProfileV2(db, id, account.id, input);
      if (!profile) return notFound(c, 'Profile not found');
      return c.json(profileResponseSchema.parse({ profile }));
    },
  )
  .post(
    '/profiles/switch',
    zValidator('json', profileSwitchSchema),
    async (c) => {
      const db = c.get('db');
      // [CR-657] requireAccount() throws 401 if account is unset at runtime.
      const account = requireAccount(c.get('account'));
      const { profileId } = c.req.valid('json');
      // [WI-301 / MMT-ADR-0025] Switching into owner context is account-scoped
      // but security-sensitive: it unlocks Billing, Security, Export/Delete,
      // and Add-child. A non-owner caller therefore needs fresh primary-factor
      // reverification, proven by Clerk fva, before targeting the owner profile.
      // [WI-586 T1] v2 seam: getPersonScope verifies person ↔ org membership
      // (no profiles table touch). Returns null when not found → same 403.
      const found = await getPersonScope(db, profileId, account.id);
      if (!found)
        return forbidden(c, 'Profile does not belong to this account');

      const targetIsOwner = found.meta.isOwner;
      if (
        isOwnerElevationGateEnabled(c.env?.OWNER_ELEVATION_GATE_ENABLED) &&
        targetIsOwner &&
        !(await isCallerAlreadyOwner(
          db,
          c.get('callerPersonId'),
          account.id,
        )) &&
        !hasRecentOwnerElevation(c.get('user'))
      ) {
        return apiError(
          c,
          403,
          ERROR_CODES.OWNER_ELEVATION_REQUIRED,
          'Owner context requires recent reverification.',
        );
      }

      return c.json(
        profileSwitchResponseSchema.parse({
          message: 'Profile switched',
          profileId,
        }),
      );
    },
  );
