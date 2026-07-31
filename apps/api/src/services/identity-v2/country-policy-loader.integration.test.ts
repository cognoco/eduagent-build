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
import { inArray } from 'drizzle-orm';
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

// Must postdate every seeded row's effective_at, including the US row seeded
// at 2026-07-28T00:00:00Z (WI-2850) — otherwise it reads as not-yet-effective
// instead of exercising the blocked/unverified/gates-open decision path.
const AS_OF = new Date('2026-07-28T12:00:00Z');
const ADULT_BIRTH_DATE = '1990-01-01';
const OPEN_GATE_ROW_ID = 'c2000000-0000-4000-8000-000000000001';
const MISSING_GATE_ROW_ID = 'c2000000-0000-4000-8000-000000000002';
const CLOSED_GATES_CHECK =
  'country_policy_registry_enabled_requires_closed_gates';

// Drizzle wraps driver failures in DrizzleQueryError ("Failed query: …") and
// carries the PostgreSQL error — where the violated constraint is named — on
// the `cause` chain, so the assertion walks the chain instead of matching the
// wrapper message.
const errorChainText = (error: unknown): string => {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join('\n');
};
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

    afterEach(async () => {
      await db
        .delete(countryPolicyRegistry)
        .where(
          inArray(countryPolicyRegistry.id, [
            OPEN_GATE_ROW_ID,
            MISSING_GATE_ROW_ID,
          ]),
        );
    });

    it('seeds the full EEA perimeter plus the United Kingdom and the United States', () => {
      const codes = new Set(rows.map((row) => row.countryCode));
      expect(codes.size).toBe(32);
      expect(codes.has('GB')).toBe(true);
      expect(codes.has('US')).toBe(true);
    });

    it('carries the ruling’s Article 8 threshold distribution', () => {
      const histogram = rows.reduce<Record<number, number>>((acc, row) => {
        acc[row.article8Threshold] = (acc[row.article8Threshold] ?? 0) + 1;
        return acc;
      }, {});
      // 9/6/5/10 across the 30 EEA states, plus the United Kingdom seeded at the
      // most restrictive value because the launch ruling does not clear one,
      // plus the United States at the COPPA threshold of 13 (WI-2850).
      expect(histogram).toEqual({ 13: 10, 14: 6, 15: 5, 16: 11 });
    });

    it('enables no country — the launch allowlist is empty', () => {
      expect(rows.filter((row) => row.launchStatus === 'enabled')).toEqual([]);
      expect(
        rows.filter((row) => row.legalVerificationStatus === 'verified'),
      ).toEqual([]);
      expect(rows.every((row) => row.launchBlockReason !== null)).toBe(true);
    });

    it('[WI-2690] rejects an enabled country while any controller gate is open', async () => {
      const template = rows[0];
      if (!template) {
        throw new Error('Expected the seeded country-policy registry');
      }

      const error: unknown = await db
        .insert(countryPolicyRegistry)
        .values({
          id: OPEN_GATE_ROW_ID,
          countryCode: 'XG',
          countryName: 'Integration Test Open Gate',
          regimeId: template.regimeId,
          article8Threshold: 13,
          authorizationForm: 'self',
          launchStatus: 'enabled',
          launchBlockReason: null,
          legalVerificationStatus: 'verified',
          legalReviewedAt: new Date('2026-07-26T00:00:00Z'),
          legalReviewValidUntil: new Date('2026-12-31T00:00:00Z'),
          launchDayReviewRequired: false,
          processingLocationClass: 'eea_only',
          policyVersion: 'integration-open-gate',
          effectiveAt: new Date('2026-07-26T00:00:00Z'),
          expiresAt: null,
          sourceProvenance: [
            {
              title: 'Integration-test policy record',
              url: 'https://example.test/country-policy',
              checkedAt: '2026-07-26T00:00:00Z',
            },
          ],
          controllerGates: {
            externalPrivacyLegalReview: true,
            aiActClassification: false,
            reliableAgeAndResidence: true,
            childTransparency: true,
            adultCommercialRelationship: true,
            countryAllowlist: true,
            operationalRightsAndIncidents: true,
            launchDayLegalRefresh: true,
          },
        })
        .then(
          () => null,
          (cause: unknown) => cause,
        );

      expect(errorChainText(error)).toContain(CLOSED_GATES_CHECK);
    });

    it('[WI-2690] rejects an enabled country whose gate object is missing a gate', async () => {
      const template = rows[0];
      if (!template) {
        throw new Error('Expected the seeded country-policy registry');
      }

      // JSONB equality also rejects an incomplete gate object: seven gates
      // true and the eighth ABSENT must fail the same CHECK, not sneak past
      // a per-key comparison.
      const error: unknown = await db
        .insert(countryPolicyRegistry)
        .values({
          id: MISSING_GATE_ROW_ID,
          countryCode: 'XH',
          countryName: 'Integration Test Missing Gate',
          regimeId: template.regimeId,
          article8Threshold: 13,
          authorizationForm: 'self',
          launchStatus: 'enabled',
          launchBlockReason: null,
          legalVerificationStatus: 'verified',
          legalReviewedAt: new Date('2026-07-26T00:00:00Z'),
          legalReviewValidUntil: new Date('2026-12-31T00:00:00Z'),
          launchDayReviewRequired: false,
          processingLocationClass: 'eea_only',
          policyVersion: 'integration-missing-gate',
          effectiveAt: new Date('2026-07-26T00:00:00Z'),
          expiresAt: null,
          sourceProvenance: [
            {
              title: 'Integration-test policy record',
              url: 'https://example.test/country-policy',
              checkedAt: '2026-07-26T00:00:00Z',
            },
          ],
          controllerGates: {
            externalPrivacyLegalReview: true,
            aiActClassification: true,
            reliableAgeAndResidence: true,
            childTransparency: true,
            adultCommercialRelationship: true,
            countryAllowlist: true,
            operationalRightsAndIncidents: true,
          },
        })
        .then(
          () => null,
          (cause: unknown) => cause,
        );

      expect(errorChainText(error)).toContain(CLOSED_GATES_CHECK);
    });

    it('flags exactly the three countries with live-law rechecks', () => {
      const flagged = rows
        .filter((row) => row.launchDayReviewRequired)
        .map((row) => row.countryCode)
        .sort();
      // NO and PT per the 13+ EEA ruling; US per the launch-day KOSA recheck
      // mandated by the 2026-07-26 US launch screen record (WI-2850).
      expect(flagged).toEqual(['NO', 'PT', 'US']);
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
        expect(loaded[0].regimeKey).toMatch(
          /^(EU_GDPR_1[3-6]|UK_AADC|US_COPPA)$/,
        );
      }
    });

    it('[WI-2850] asserts the United States row shape jointly, including both COPPA authorities', async () => {
      // The other US assertions in this file check membership, the threshold
      // histogram, and the launch-day-review set separately — none of them
      // binds threshold/regime/flag/provenance to the US row as ONE record.
      // This test loads the actual seeded row and asserts on it jointly, so
      // it fails if the row shape drifts from what 0161+0162 actually wrote.
      const [usRecord] = await loadCountryPolicies(db, 'US');
      if (!usRecord) {
        throw new Error('Expected the seeded United States row');
      }

      expect(usRecord.article8Threshold).toBe(13);
      expect(usRecord.regimeKey).toBe('US_COPPA');
      expect(usRecord.launchDayReviewRequired).toBe(true);
      expect(usRecord.launchStatus).toBe('blocked');
      expect(usRecord.legalVerificationStatus).toBe('unverified');

      // 0162 (WI-2850 rework): source_provenance must cite BOTH COPPA
      // authorities — the statute and its implementing FTC rule.
      const titles = usRecord.sourceProvenance.map((entry) => entry.title);
      expect(
        titles.some(
          (title) => title.includes('15 U.S.C.') && title.includes('6501'),
        ),
      ).toBe(true);
      expect(titles.some((title) => title.includes('16 CFR Part 312'))).toBe(
        true,
      );
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
