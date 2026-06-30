import { mentorActivityLedger } from './activity-ledger.js';
import { mentorActivityLedger as exportedTable } from './index.js';

describe('mentor activity ledger schema', () => {
  it('exports the table from the schema barrel', () => {
    expect(exportedTable).toBe(mentorActivityLedger);
  });

  it('defines the required columns', () => {
    expect(mentorActivityLedger.id).toBeDefined();
    expect(mentorActivityLedger.profileId).toBeDefined();
    expect(mentorActivityLedger.actorJob).toBeDefined();
    expect(mentorActivityLedger.kind).toBeDefined();
    expect(mentorActivityLedger.params).toBeDefined();
    expect(mentorActivityLedger.createdAt).toBeDefined();
    expect(mentorActivityLedger.surfacedAt).toBeDefined();
  });
});
