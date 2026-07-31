import { dataExportSchema } from '@eduagent/schemas';
import {
  getProfileScopedTables,
  PROFILE_SCOPED_SCAN_EXCEPTIONS,
} from '../../../../packages/database/src/profile-scoped-tables';

import { PROFILE_SCOPED_EXPORT_INVENTORY } from './data-export-inventory';

describe('[WI-2738] GDPR export inventory omission guard', () => {
  it('requires every schema-derived profile-scoped table to be included or explicitly excluded', () => {
    const schemaTables = getProfileScopedTables()
      .filter((table) => !PROFILE_SCOPED_SCAN_EXCEPTIONS[table])
      .sort();
    const inventoryTables = Object.keys(PROFILE_SCOPED_EXPORT_INVENTORY).sort();

    expect(inventoryTables).toEqual(schemaTables);
  });

  it('requires every included table to name a real export payload field', () => {
    const payloadFields = new Set(Object.keys(dataExportSchema.shape));

    for (const entry of Object.values(PROFILE_SCOPED_EXPORT_INVENTORY)) {
      expect(entry.reason.trim().length).toBeGreaterThan(20);
      if (entry.disposition === 'included') {
        expect(payloadFields.has(entry.exportField)).toBe(true);
      }
    }
  });
});
