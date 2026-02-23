import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  profileCreateSchema,
  profileUpdateSchema,
  profileSwitchSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { notFound, forbidden } from '../errors';
import {
  listProfiles,
  createProfile,
  getProfile,
  updateProfile,
  switchProfile,
} from '../services/profile';

// EU27 + EEA (IS, LI, NO) + CH + GB — GDPR-aligned jurisdictions
const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO', // EEA
  'CH',
  'GB', // GDPR-aligned
]);

/** Maps ISO 3166-1 alpha-2 country code to consent jurisdiction */
export function mapCountryToLocation(
  countryCode?: string
): 'EU' | 'US' | 'OTHER' | undefined {
  if (!countryCode) return undefined;
  const upper = countryCode.toUpperCase();
  if (EU_COUNTRIES.has(upper)) return 'EU';
  if (upper === 'US') return 'US';
  return 'OTHER';
}

type ProfileEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: { user: AuthUser; db: Database; account: Account };
};

export const profileRoutes = new Hono<ProfileEnv>()
  .get('/profiles', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profiles = await listProfiles(db, account.id);
    return c.json({ profiles });
  })
  .post('/profiles', zValidator('json', profileCreateSchema), async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const input = c.req.valid('json');
    const isFirstProfile = (await listProfiles(db, account.id)).length === 0;

    // Extract Cloudflare country for server-side consent determination
    const cfCountry = (c.req.raw as unknown as { cf?: { country?: string } }).cf
      ?.country;
    const serverLocation = mapCountryToLocation(cfCountry);

    const profile = await createProfile(
      db,
      account.id,
      input,
      isFirstProfile,
      serverLocation
    );
    return c.json({ profile }, 201);
  })
  .get('/profiles/:id', async (c) => {
    const db = c.get('db');
    const account = c.get('account');
    const profile = await getProfile(db, c.req.param('id'), account.id);
    if (!profile) return notFound(c, 'Profile not found');
    return c.json({ profile });
  })
  .patch(
    '/profiles/:id',
    zValidator('json', profileUpdateSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const input = c.req.valid('json');
      const profile = await updateProfile(
        db,
        c.req.param('id'),
        account.id,
        input
      );
      if (!profile) return notFound(c, 'Profile not found');
      return c.json({ profile });
    }
  )
  .post(
    '/profiles/switch',
    zValidator('json', profileSwitchSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const { profileId } = c.req.valid('json');
      const result = await switchProfile(db, profileId, account.id);
      if (!result)
        return forbidden(c, 'Profile does not belong to this account');
      return c.json({ message: 'Profile switched', profileId });
    }
  );
