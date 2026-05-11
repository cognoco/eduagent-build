/**
 * Integration: Cross-Profile Security Scoping — Progress Report Detail Endpoints
 *
 * Break tests that verify profile A cannot read profile B's reports by guessing
 * a report ID. Exercises the full middleware chain:
 *   JWT auth → account resolution → profile ownership verification → service →
 *   DB (childProfileId WHERE clause) → HTTP response
 *
 * Only the external auth boundary (CLERK_JWKS_URL → fetch) is intercepted.
 * All internal services, DB queries, and the profile-scope middleware run real.
 *
 * Attack surface:
 *   GET /v1/progress/reports/:reportId         → getMonthlyReportForProfile
 *   GET /v1/progress/weekly-reports/:reportId  → getWeeklyReportForProfile
 *
 * Both service functions scope on `childProfileId = profileId` so a report
 * owned by profile B must not be readable when the active profile is A.
 */

import { resolve } from 'path';
import { like } from 'drizzle-orm';
import {
  accounts,
  createDatabase,
  generateUUIDv7,
  monthlyReports,
  profiles,
  weeklyReports,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv, signTestJwt } from '@eduagent/test-utils';
import {
  installTestJwksInterceptor,
  restoreTestFetch,
} from '../test-utils/jwks-interceptor';
import { clearJWKSCache } from '../middleware/jwt';
import { app } from '../index';

// ---------------------------------------------------------------------------
// DB setup — real connection; DATABASE_URL resolved from env or Doppler
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const hasDatabaseUrl = !!process.env.DATABASE_URL;
const describeIfDb = hasDatabaseUrl ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Test-run unique prefix prevents collisions between concurrent test runs
// ---------------------------------------------------------------------------

const RUN_ID = generateUUIDv7();
const CLERK_ID_A = `clerk_integ_rpt_${RUN_ID}_a`;
const CLERK_ID_B = `clerk_integ_rpt_${RUN_ID}_b`;
const EMAIL_A = `rpt_${RUN_ID}_a@test.invalid`;
const EMAIL_B = `rpt_${RUN_ID}_b@test.invalid`;

// Must match BASE_AUTH_ENV used in makeAuthHeaders — the auth middleware
// derives iss from CLERK_JWKS_URL and enforces CLERK_AUDIENCE.
const CLERK_JWKS_URL = 'https://clerk.test/.well-known/jwks.json';
const CLERK_AUDIENCE = 'test-audience';

const TEST_ENV = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  CLERK_JWKS_URL,
  CLERK_AUDIENCE,
};

// ---------------------------------------------------------------------------
// JWT helpers — sign real RS256 tokens matching the JWKS interceptor key pair
// ---------------------------------------------------------------------------

function makeJwt(clerkUserId: string, email: string): string {
  return signTestJwt({
    sub: clerkUserId,
    email,
    iss: 'https://clerk.test',
    aud: CLERK_AUDIENCE,
  });
}

function authHeaders(
  clerkUserId: string,
  email: string,
  profileId: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${makeJwt(clerkUserId, email)}`,
    'Content-Type': 'application/json',
    'X-Profile-Id': profileId,
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

let db: Database;

async function seedAccountAndProfile(
  clerkUserId: string,
  email: string,
): Promise<{ accountId: string; profileId: string }> {
  const [account] = await db
    .insert(accounts)
    .values({ clerkUserId, email })
    .returning({ id: accounts.id });

  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Test Profile ${clerkUserId}`,
      birthYear: new Date().getFullYear() - 20,
      isOwner: true,
    })
    .returning({ id: profiles.id });

  return { accountId: account!.id, profileId: profile!.id };
}

async function seedMonthlyReport(
  parentProfileId: string,
  childProfileId: string,
): Promise<string> {
  const [row] = await db
    .insert(monthlyReports)
    .values({
      profileId: parentProfileId,
      childProfileId,
      reportMonth: '2026-04-01',
      reportData: {
        headlineStat: { label: 'Topics mastered', value: 0, comparison: '' },
        highlights: [],
        nextSteps: [],
      },
    })
    .returning({ id: monthlyReports.id });

  return row!.id;
}

async function seedWeeklyReport(
  parentProfileId: string,
  childProfileId: string,
): Promise<string> {
  const [row] = await db
    .insert(weeklyReports)
    .values({
      profileId: parentProfileId,
      childProfileId,
      reportWeek: '2026-04-07',
      reportData: {
        headlineStat: { label: 'Topics mastered', value: 0, comparison: '' },
      },
    })
    .returning({ id: weeklyReports.id });

  return row!.id;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanupTestAccounts(): Promise<void> {
  await db
    .delete(accounts)
    .where(like(accounts.clerkUserId, `clerk_integ_rpt_${RUN_ID}%`));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeIfDb(
  'Progress report detail endpoints — cross-profile security scoping (integration)',
  () => {
    let profileAId: string;
    let profileBId: string;
    let monthlyReportBId: string;
    let weeklyReportBId: string;

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);
      installTestJwksInterceptor();

      // Seed two independent accounts, each with one owner profile
      const { profileId: aId } = await seedAccountAndProfile(
        CLERK_ID_A,
        EMAIL_A,
      );
      const { profileId: bId } = await seedAccountAndProfile(
        CLERK_ID_B,
        EMAIL_B,
      );
      profileAId = aId;
      profileBId = bId;

      // Seed a monthly and weekly report owned by profile B (self-view pattern:
      // profileId === childProfileId, both set to profileBId)
      monthlyReportBId = await seedMonthlyReport(profileBId, profileBId);
      weeklyReportBId = await seedWeeklyReport(profileBId, profileBId);
    });

    afterAll(async () => {
      await cleanupTestAccounts();
      restoreTestFetch();
    });

    beforeEach(() => {
      clearJWKSCache();
    });

    // -------------------------------------------------------------------------
    // GET /v1/progress/reports/:reportId — monthly report
    // -------------------------------------------------------------------------

    describe('GET /v1/progress/reports/:reportId', () => {
      // Break test: profile A authenticates, requests profile B's monthly report.
      // getMonthlyReportForProfile scopes on childProfileId = profileA.id →
      // returns null → 404.
      it('[BREAK] profile A cannot read profile B monthly report → 404', async () => {
        const res = await app.request(
          `/v1/progress/reports/${monthlyReportBId}`,
          { headers: authHeaders(CLERK_ID_A, EMAIL_A, profileAId) },
          TEST_ENV,
        );

        expect(res.status).toBe(404);
      });

      // Happy-path: profile B can read their own monthly report → 200.
      it('profile B can read their own monthly report → 200', async () => {
        const res = await app.request(
          `/v1/progress/reports/${monthlyReportBId}`,
          { headers: authHeaders(CLERK_ID_B, EMAIL_B, profileBId) },
          TEST_ENV,
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as { report: { id: string } };
        expect(body.report.id).toBe(monthlyReportBId);
      });

      // Sanity: nonexistent report ID → 404 for both profiles
      it('nonexistent report ID → 404', async () => {
        const res = await app.request(
          `/v1/progress/reports/${generateUUIDv7()}`,
          { headers: authHeaders(CLERK_ID_A, EMAIL_A, profileAId) },
          TEST_ENV,
        );

        expect(res.status).toBe(404);
      });
    });

    // -------------------------------------------------------------------------
    // GET /v1/progress/weekly-reports/:weeklyReportId — weekly report
    // -------------------------------------------------------------------------

    describe('GET /v1/progress/weekly-reports/:weeklyReportId', () => {
      // Break test: profile A authenticates, requests profile B's weekly report.
      // getWeeklyReportForProfile scopes on childProfileId = profileA.id →
      // returns null → 404.
      it('[BREAK] profile A cannot read profile B weekly report → 404', async () => {
        const res = await app.request(
          `/v1/progress/weekly-reports/${weeklyReportBId}`,
          { headers: authHeaders(CLERK_ID_A, EMAIL_A, profileAId) },
          TEST_ENV,
        );

        expect(res.status).toBe(404);
      });

      // Happy-path: profile B can read their own weekly report → 200.
      it('profile B can read their own weekly report → 200', async () => {
        const res = await app.request(
          `/v1/progress/weekly-reports/${weeklyReportBId}`,
          { headers: authHeaders(CLERK_ID_B, EMAIL_B, profileBId) },
          TEST_ENV,
        );

        expect(res.status).toBe(200);
        const body = (await res.json()) as { report: { id: string } };
        expect(body.report.id).toBe(weeklyReportBId);
      });

      // Sanity: nonexistent weekly report ID → 404
      it('nonexistent weekly report ID → 404', async () => {
        const res = await app.request(
          `/v1/progress/weekly-reports/${generateUUIDv7()}`,
          { headers: authHeaders(CLERK_ID_A, EMAIL_A, profileAId) },
          TEST_ENV,
        );

        expect(res.status).toBe(404);
      });
    });
  },
);
