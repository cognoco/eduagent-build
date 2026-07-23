import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  analyzeSource,
  collectConsentPurposeViolations,
} from './check-consent-purpose-contract';

describe('consent purpose contract guard [WI-2386]', () => {
  it.each([
    [
      'removed default-purpose identifier',
      `const purpose = DEFAULT_CONSENT_PURPOSE;`,
      'default-purpose-identifier',
    ],
    [
      'literal whole-consent selector',
      `eq(consentGrant.purpose, 'platform_use')`,
      'literal-purpose-selector',
    ],
    [
      'literal inArray whole-consent selector',
      `inArray(consentGrant.purpose, ['platform_use'])`,
      'literal-purpose-selector',
    ],
    [
      'literal SQL whole-consent selector',
      "sql`consent_grant.purpose = 'platform_use'`",
      'literal-purpose-selector',
    ],
    [
      'literal purpose write',
      `db.insert(consentGrant).values({ purpose: 'platform_use' })`,
      'literal-purpose-write',
    ],
    [
      'implicit database default',
      `purpose: text('purpose').notNull().default('platform_use')`,
      'implicit-database-purpose-default',
    ],
    [
      'defaulted purpose argument',
      `function read(purpose: ConsentPurpose = 'platform_use') { return purpose; }`,
      'defaulted-purpose-parameter',
    ],
    [
      'llm-disclosure whole-consent selector',
      `eq(consentGrant.purpose, 'llm_disclosure')`,
      'literal-purpose-selector',
    ],
    [
      'llm-disclosure inArray whole-consent selector',
      `inArray(consentGrant.purpose, ['llm_disclosure'])`,
      'literal-purpose-selector',
    ],
    [
      'llm-disclosure SQL whole-consent selector',
      "sql`consent_grant.purpose = 'llm_disclosure'`",
      'literal-purpose-selector',
    ],
    [
      'llm-disclosure purpose write',
      `db.insert(consentGrant).values({ purpose: 'llm_disclosure' })`,
      'literal-purpose-write',
    ],
    [
      'llm-disclosure implicit database default',
      `purpose: text('purpose').notNull().default('llm_disclosure')`,
      'implicit-database-purpose-default',
    ],
    [
      'llm-disclosure defaulted purpose argument',
      `function read(purpose: ConsentPurpose = 'llm_disclosure') { return purpose; }`,
      'defaulted-purpose-parameter',
    ],
  ])('rejects %s', (_name, source, rule) => {
    expect(analyzeSource('apps/api/src/example.ts', source)).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule })]),
    );
  });

  it('allows the one canonical purpose-set declaration', () => {
    expect(
      analyzeSource(
        'packages/schemas/src/consent.ts',
        `export const CONSENT_PURPOSES = ['platform_use', 'llm_disclosure'] as const;`,
      ),
    ).toEqual([]);
  });

  it('passes the production tree and narrow historical-migration allowlist', () => {
    expect(collectConsentPurposeViolations()).toEqual([]);
  });

  it('uses a metadata-only forward migration that removes the implicit purpose default', () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        '../apps/api/drizzle/0152_wi2386_consent_purpose_required.sql',
      ),
      'utf8',
    ).trim();
    expect(migration).toBe(
      'ALTER TABLE "consent_request" ALTER COLUMN "purpose" DROP DEFAULT;',
    );
  });

  it('documents a valid text-column rollback without a nonexistent enum cast', () => {
    const rollback = readFileSync(
      resolve(
        __dirname,
        '../apps/api/drizzle/0152_wi2386_consent_purpose_required.rollback.md',
      ),
      'utf8',
    );
    expect(rollback).toContain(
      `ALTER COLUMN "purpose" SET DEFAULT 'platform_use';`,
    );
    expect(rollback).not.toContain(`::"consent_purpose"`);
  });
});
