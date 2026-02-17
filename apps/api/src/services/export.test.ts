import { dataExportSchema } from '@eduagent/schemas';
import { generateExport } from './export';

describe('generateExport', () => {
  it('returns a valid DataExport shape', async () => {
    const result = await generateExport('account-1');

    expect(result.account).toBeDefined();
    expect(result.account.email).toBeDefined();
    expect(result.account.createdAt).toBeDefined();
    expect(result.profiles).toBeInstanceOf(Array);
    expect(result.consentStates).toBeInstanceOf(Array);
    expect(result.exportedAt).toBeDefined();
  });

  it('returns a valid ISO 8601 exportedAt date', async () => {
    const result = await generateExport('account-1');
    expect(new Date(result.exportedAt).toISOString()).toBe(result.exportedAt);
  });

  it('validates against the dataExportSchema', async () => {
    const result = await generateExport('account-1');
    const parsed = dataExportSchema.safeParse(result);

    expect(parsed.success).toBe(true);
  });

  it('returns empty arrays for a new account (stub behavior)', async () => {
    const result = await generateExport('brand-new-account');

    expect(result.profiles).toEqual([]);
    expect(result.consentStates).toEqual([]);
  });

  it('returns consistent results across multiple calls (idempotent)', async () => {
    const first = await generateExport('account-1');
    const second = await generateExport('account-1');

    expect(first.account.email).toBe(second.account.email);
    expect(first.profiles).toEqual(second.profiles);
    expect(first.consentStates).toEqual(second.consentStates);
  });

  it('returns a valid account email', async () => {
    const result = await generateExport('account-1');

    expect(result.account.email).toContain('@');
  });

  // TODO: When DB is wired, add these tests:
  // - export with full data (profiles, subjects, sessions, summaries, assessments)
  // - export with multiple profiles (family account with parent + children)
  // - export with deleted/archived subjects (should still be included per GDPR Art. 20)
  // - export with consent states in various statuses (PENDING, CONSENTED, WITHDRAWN)
  // - performance test: export completes within 60s for accounts with 10k+ learning records (NFR)
});
