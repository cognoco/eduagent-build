// ---------------------------------------------------------------------------
// [Identity T1] Single-source guard (no DB).
//
// The backfill DML has two homes: the canonical identity-t1-backfill.sql, and
// the migration 0106_identity_t1_org_membership.sql that applies it once at
// migrate time. The integration test executes the canonical file; the migration
// executes its embedded copy. This test fails if the two ever drift, making the
// "byte-identical" claim real instead of aspirational.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { join } from 'path';

const BACKFILL_SQL_PATH = join(__dirname, 'identity-t1-backfill.sql');
const MIGRATION_PATH = join(
  __dirname,
  '../../../../apps/api/drizzle/0106_identity_t1_org_membership.sql',
);

// The executable payload is the DO $$ ... END $$; block. The two files differ
// only in their leading comment headers, so we compare the block itself.
// Anchor on `DO $$` immediately followed by `BEGIN` so we don't match the prose
// mention "one DO $$ block" in the canonical file's header comment.
function extractDoBlock(sql: string): string {
  const startMatch = /DO \$\$\s*\nBEGIN/.exec(sql);
  const endToken = 'END $$;';
  // Search from the matched block start, not the file top, so a future comment
  // containing "END $$;" before the real block can't slice the wrong span.
  const end = sql.indexOf(endToken, startMatch?.index ?? 0);
  if (!startMatch || end === -1) {
    throw new Error('DO $$ ... END $$; block not found');
  }
  return sql.slice(startMatch.index, end + endToken.length);
}

describe('[Identity T1] backfill is embedded verbatim in migration 0106', () => {
  it('migration 0106 embeds the canonical backfill DO block byte-for-byte', () => {
    const canonical = extractDoBlock(readFileSync(BACKFILL_SQL_PATH, 'utf8'));
    const migrationRaw = readFileSync(MIGRATION_PATH, 'utf8');
    expect(canonical.length).toBeGreaterThan(200); // sanity: real block, not empty
    // Containment proves the canonical block is present; block-equality proves
    // the migration didn't append a second DO block or otherwise drift (L1).
    expect(migrationRaw).toContain(canonical);
    expect(extractDoBlock(migrationRaw)).toBe(canonical);
    // Exactly one backfill DO block in the migration (no appended duplicate).
    expect((migrationRaw.match(/DO \$\$\s*\nBEGIN/g) ?? []).length).toBe(1);
  });
});
