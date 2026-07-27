// ---------------------------------------------------------------------------
// [WI-2690] Integration coverage for the country registry as SHIPPED DATA.
//
// These assertions deliberately read the registry rather than restating the
// matrix: the point of AC1 is that the database is the only place the country
// set, thresholds, and launch status live, so the test derives its expectations
// from what was seeded instead of carrying a second copy of the table.
//
// The seed is intentionally fail-closed — every country blocked and legally
// unverified until counsel sign-off lands as a later effective-dated row — so
// "no country resolves to allowed" is a correctness assertion here, not a gap.
// ---------------------------------------------------------------------------
import { resolve } from 'path';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  countryPolicyRegistry,
  createDatabase,
  type Database,
} from '@eduagent/database';
import {
  loadCountryPolicies,
  resolveJurisdiction,
} from './country-policy-loader';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));
const RUN = !!process.env.DATABASE_URL;

const AS_OF = new Date('2026-07-25T12:00:00Z');
const ADULT_BIRTH_DATE = '1990-01-01';
const GOOD_ASSURANCE = {
  method: 'self_report' as const,
  confidence: 0.8,
  assertedAt: new Date('2026-07-25T09:00:00Z'),
  corroboratingMethods: ['billing_address' as const],
};

(RUN ? describe : describe.skip)(
  'country policy registry (integration)',
  () => {
    let db: Database;
    let rows: (typeof countryPolicyRegistry.$inferSelect)[];

    beforeAll(async () => {
      db = createDatabase(process.env.DATABASE_URL!);
      rows = await db.select().from(countryPolicyRegistry);
    });

    it('seeds the full EEA perimeter plus the United Kingdom', () => {
      const codes = new Set(rows.map((row) => row.countryCode));
      expect(codes.size).toBe(31);
      expect(codes.has('GB')).toBe(true);
    });

    it('carries the ruling’s Article 8 threshold distribution', () => {
      const histogram = rows.reduce<Record<number, number>>((acc, row) => {
        acc[row.article8Threshold] = (acc[row.article8Threshold] ?? 0) + 1;
        return acc;
      }, {});
      // 9/6/5/10 across the 30 EEA states, plus the United Kingdom seeded at the
      // most restrictive value because the launch ruling does not clear one.
      expect(histogram).toEqual({ 13: 9, 14: 6, 15: 5, 16: 11 });
    });

    it('enables no country — the launch allowlist is empty', () => {
      expect(rows.filter((row) => row.launchStatus === 'enabled')).toEqual([]);
      expect(
        rows.filter((row) => row.legalVerificationStatus === 'verified'),
      ).toEqual([]);
      expect(rows.every((row) => row.launchBlockReason !== null)).toBe(true);
    });

    it('flags exactly the two countries with live-law rechecks', () => {
      const flagged = rows
        .filter((row) => row.launchDayReviewRequired)
        .map((row) => row.countryCode)
        .sort();
      expect(flagged).toEqual(['NO', 'PT']);
    });

    it('records France as the only joint child-plus-guardian authorization', () => {
      const joint = rows
        .filter((row) => row.authorizationForm === 'joint_child_guardian')
        .map((row) => row.countryCode);
      expect(joint).toEqual(['FR']);
    });

    it('loads every seeded row through the shared record contract', async () => {
      const codes = [...new Set(rows.map((row) => row.countryCode))];
      for (const code of codes) {
        // loadCountryPolicies parses through countryPolicyRecordSchema, so a row
        // that violates the contract throws here rather than reaching a decision.
        const loaded = await loadCountryPolicies(db, code);
        expect(loaded.length).toBeGreaterThan(0);
        expect(loaded[0].countryCode).toBe(code);
        expect(loaded[0].sourceProvenance.length).toBeGreaterThan(0);
        expect(loaded[0].regimeKey).toMatch(/^(EU_GDPR_1[3-6]|UK_AADC)$/);
      }
    });

    it('blocks an adult in every seeded country while the gates are open', async () => {
      const codes = [...new Set(rows.map((row) => row.countryCode))];
      for (const code of codes) {
        const decision = await resolveJurisdiction(db, {
          habitualResidence: code,
          birthDate: ADULT_BIRTH_DATE,
          residenceAssurance: GOOD_ASSURANCE,
          asOf: AS_OF,
        });
        expect(decision.launchDecision).toBe('blocked');
        expect(decision.reasonCodes).toEqual(
          expect.arrayContaining([
            'COUNTRY_BLOCKED',
            'CONTROLLER_GATES_OPEN',
            'LEGAL_VERIFICATION_UNVERIFIED',
          ]),
        );
      }
    });

    it('blocks AI processing outside the EEA class for the United Kingdom', async () => {
      const decision = await resolveJurisdiction(db, {
        habitualResidence: 'GB',
        birthDate: ADULT_BIRTH_DATE,
        residenceAssurance: GOOD_ASSURANCE,
        asOf: AS_OF,
      });
      expect(decision.processingLocationClass).toBe('blocked');
      expect(decision.regimeKey).toBe('UK_AADC');
    });

    it('fails closed for a country outside the seeded perimeter', async () => {
      const decision = await resolveJurisdiction(db, {
        habitualResidence: 'CH',
        birthDate: ADULT_BIRTH_DATE,
        residenceAssurance: GOOD_ASSURANCE,
        asOf: AS_OF,
      });
      expect(decision.launchDecision).toBe('blocked');
      expect(decision.reasonCodes).toContain('COUNTRY_UNSUPPORTED');
    });

    it('never queries the registry for an unknown residence', async () => {
      const decision = await resolveJurisdiction(db, {
        habitualResidence: null,
        birthDate: ADULT_BIRTH_DATE,
        residenceAssurance: GOOD_ASSURANCE,
        asOf: AS_OF,
      });
      expect(decision.launchDecision).toBe('blocked');
      expect(decision.reasonCodes).toEqual(['COUNTRY_UNKNOWN']);
    });

    it('rejects a legacy three-way jurisdiction bucket as a country code', async () => {
      // `locationToJurisdiction` still emits EU/US/ROW; a leaked bucket must not
      // be mistaken for a country.
      const decision = await resolveJurisdiction(db, {
        habitualResidence: 'EU',
        birthDate: ADULT_BIRTH_DATE,
        residenceAssurance: GOOD_ASSURANCE,
        asOf: AS_OF,
      });
      expect(decision.reasonCodes).toEqual(['COUNTRY_INVALID']);
    });
  },
);
