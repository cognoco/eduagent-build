/**
 * Integration: WI-297 — Exact-age gate at profile creation using full birth date
 *
 * Today (year-only): birthYear = currentYear - 13 computes as age 13 (allowed).
 * With full date: if birthday is later this year, exact age is still 12 (blocked).
 *
 * WI-570: v1 13+ floor replaces the original 11+ floor. All boundary values updated.
 *
 * Validates:
 * 1. [BREAK] POST /v1/profiles with full birth date where child is still 12
 *    (birthYear = currentYear-13 but birthMonth/birthDay > today) → 400 / age violation
 * 2. POST /v1/profiles with full birth date where child is exactly 13 today → 201
 * 3. POST /v1/profiles without birthMonth/birthDay (year-only fallback) → 201 for year-13+
 *
 * No internal mocks — real DB via doppler run -c dev DATABASE_URL.
 */

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import { buildAuthHeaders } from './route-fixtures';
import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const USER = {
  userId: 'integration-wi297-fulldate-user',
  email: 'integration-wi297-fulldate@integration.test',
};

/** Returns today as UTC year/month/day */
function todayUTC(): { year: number; month: number; day: number } {
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1, // 1-based
    day: now.getUTCDate(),
  };
}

beforeEach(async () => {
  await cleanupAccounts({
    emails: [USER.email],
    clerkUserIds: [USER.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [USER.email],
    clerkUserIds: [USER.userId],
  });
});

describe('Integration: WI-297 — profile creation full-date age gate', () => {
  it('[break-test] child still 12 by exact date (year-only=13) is rejected as below minimum age', async () => {
    // WI-570: v1 13+ floor. birthYear = currentYear - 13, but with a future birthday (Dec 31)
    // → exact age is 12 (birthday not yet reached this year).
    // Year-only would compute 13 (allowed), but full-date must catch this.
    const today = todayUTC();

    // Only run the "future birthday" assertion when today is before Dec 31.
    // On Dec 31 itself, birthday-this-year = today, so exact age = 13 (not under).
    // We need a birthday that is strictly after today.
    const birthMonth = today.month === 12 && today.day === 31 ? 12 : 12;
    const birthDay = today.month === 12 && today.day === 31 ? 31 : 31;
    const birthYear = today.year - 13;

    // Edge: if today IS Dec 31, the birthday is not in the future — skip this specific test.
    if (today.month === 12 && today.day === 31) {
      // Today is the child's 13th birthday — exact age = 13, not blocked.
      // This edge is covered by the "exactly 13" test below. Skip the break-test today.
      return;
    }

    const res = await app.request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: USER.userId, email: USER.email }),
        body: JSON.stringify({
          displayName: 'WI297 Under13',
          birthYear,
          birthMonth,
          birthDay,
        }),
      },
      TEST_ENV,
    );

    // Must be rejected — child is still 12 by exact date.
    // ProfileValidationError maps to 400 VALIDATION_ERROR via validationError() in profiles.ts.
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    // The field + message should reference birthYear (CHILD_AGE_VIOLATION)
    expect(JSON.stringify(body.details)).toContain('birthYear');
  });

  it('child exactly 13 today (birthday = today) is accepted', async () => {
    // WI-570: 13+ floor; exactly 13 on their birthday is allowed.
    const today = todayUTC();
    const birthYear = today.year - 13;

    const res = await app.request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: USER.userId, email: USER.email }),
        body: JSON.stringify({
          displayName: 'WI297 Exactly13',
          birthYear,
          birthMonth: today.month,
          birthDay: today.day,
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.profile.birthYear).toBe(birthYear);
    // The gate consumes the full date transiently, while creation persists a
    // year-only date; the response contract includes null month/day fields.
    expect(body.profile.birthMonth).toBeNull();
    expect(body.profile.birthDay).toBeNull();
  });

  it('year-only path (no birthMonth/birthDay) still works for age >= 13', async () => {
    // Must clean up first since "exactly 13" test above may have created a profile for this user.
    await cleanupAccounts({
      emails: [USER.email],
      clerkUserIds: [USER.userId],
    });

    const today = todayUTC();
    const birthYear = today.year - 20; // clearly adult

    const res = await app.request(
      '/v1/profiles',
      {
        method: 'POST',
        headers: buildAuthHeaders({ sub: USER.userId, email: USER.email }),
        body: JSON.stringify({
          displayName: 'WI297 Adult',
          birthYear,
          // no birthMonth/birthDay — falls back to year-only
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(201);
  });
});
