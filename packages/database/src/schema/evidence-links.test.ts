import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getTableConfig } from 'drizzle-orm/pg-core';

import { evidenceLinks } from './evidence-links.js';

interface DrizzleSnapshot {
  tables: Record<string, { isRLSEnabled: boolean }>;
}

const snapshot = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../apps/api/drizzle/meta/0154_snapshot.json'),
    'utf8',
  ),
) as DrizzleSnapshot;

describe('evidenceLinks profile isolation', () => {
  it('tracks migration 0154 RLS in the Drizzle schema and snapshot', () => {
    expect(getTableConfig(evidenceLinks).enableRLS).toBe(true);
    expect(snapshot.tables['public.evidence_links']?.isRLSEnabled).toBe(true);
  });
});
