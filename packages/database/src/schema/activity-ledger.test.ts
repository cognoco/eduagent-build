import {
  ledgerVisibilityEnum,
  mentorActivityLedger,
} from './activity-ledger.js';
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
    expect(mentorActivityLedger.templateKey).toBeDefined();
    expect(mentorActivityLedger.params).toBeDefined();
    expect(mentorActivityLedger.visibility).toBeDefined();
    expect(mentorActivityLedger.createdAt).toBeDefined();
    expect(mentorActivityLedger.surfacedAt).toBeDefined();
  });

  it('defines the ledger visibility enum values', () => {
    expect(ledgerVisibilityEnum.enumValues).toEqual([
      'self',
      'supporter',
      'both',
    ]);
  });
});
