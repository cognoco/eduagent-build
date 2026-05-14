/**
 * Regression guard for [BUG-789 / CFG-9]: ensure drizzle meta snapshots are
 * present for the migrations the bug specifically called out (0034, 0035,
 * 0037), and that the snapshot chain (id/prevId) is internally coherent for
 * every snapshot that exists.
 *
 * Snapshots are only consulted by `drizzle-kit generate` (not `migrate`), so
 * a missing snapshot does not break production deploys — but it does break
 * future schema diffs and silently corrupts the migration chain. This test
 * is a structural guard, not a runtime check, so it requires no DB.
 *
 * Note: 8 historical snapshots (0006–0010, 0013, 0021, 0025) are still
 * missing. Restoring them is tracked as a separate hygiene task — this
 * regression guard only enforces the migrations covered by BUG-789.
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const META_DIR = resolve(__dirname, '../../../apps/api/drizzle/meta');

// Minimal shape we rely on; drizzle snapshots have many more fields.
interface DrizzleSnapshot {
  id: string;
  prevId: string;
}

interface DrizzleJournal {
  entries: Array<{ idx: number; tag: string; when: number }>;
}

function loadSnapshot(tag: string): DrizzleSnapshot {
  return JSON.parse(
    readFileSync(resolve(META_DIR, `${tag}_snapshot.json`), 'utf8'),
  ) as DrizzleSnapshot;
}

function snapshotTags(): string[] {
  return readdirSync(META_DIR)
    .filter((f) => /^\d{4}_snapshot\.json$/.test(f))
    .map((f) => f.replace('_snapshot.json', ''))
    .sort();
}

describe('drizzle migration snapshots [BUG-789]', () => {
  it.each(['0034', '0035', '0037'])(
    'snapshot %s is present (the migration explicitly cited in BUG-789)',
    (tag) => {
      const snap = loadSnapshot(tag);
      expect(typeof snap.id).toBe('string');
      expect(snap.id.length).toBeGreaterThan(10);
      expect(typeof snap.prevId).toBe('string');
      expect(snap.prevId.length).toBeGreaterThan(10);
    },
  );

  it('every present snapshot has a non-empty id and prevId', () => {
    const tags = snapshotTags();
    expect(tags.length).toBeGreaterThan(0);
    const broken: string[] = [];
    for (const tag of tags) {
      const snap = loadSnapshot(tag);
      if (!snap.id || !snap.prevId) broken.push(tag);
    }
    expect(broken).toEqual([]);
  });

  it('chains where two adjacent snapshots both exist are coherent (prevId of N == id of N-1)', () => {
    const tags = snapshotTags();
    const tagSet = new Set(tags);
    const breaks: string[] = [];
    for (const tag of tags) {
      const idx = parseInt(tag, 10);
      if (idx === 0) continue;
      const prevTag = String(idx - 1).padStart(4, '0');
      if (!tagSet.has(prevTag)) continue; // historical gap, skip
      const snap = loadSnapshot(tag);
      const prev = loadSnapshot(prevTag);
      if (snap.prevId !== prev.id) {
        breaks.push(
          `${tag}.prevId=${snap.prevId} !== ${prevTag}.id=${prev.id}`,
        );
      }
    }
    expect(breaks).toEqual([]);
  });

  it('latest journal entry has a matching snapshot', () => {
    const journal = JSON.parse(
      readFileSync(resolve(META_DIR, '_journal.json'), 'utf8'),
    ) as DrizzleJournal;
    const latest = journal.entries.at(-1);
    expect(latest).toBeDefined();
    expect(snapshotTags()).toContain(String(latest?.idx).padStart(4, '0'));
  });

  it('journal "when" timestamps are monotonically non-decreasing [BUG-1040]', () => {
    const journal = JSON.parse(
      readFileSync(resolve(META_DIR, '_journal.json'), 'utf8'),
    ) as DrizzleJournal;

    const entries = journal.entries;
    expect(entries.length).toBeGreaterThan(0);

    const invalid: string[] = [];
    for (const e of entries) {
      if (typeof e.when !== 'number' || e.when <= 0) {
        invalid.push(
          `entry ${e.idx} (${e.tag}): when=${e.when} is not a positive number`,
        );
      }
    }
    expect(invalid).toEqual([]);

    const outOfOrder: string[] = [];
    for (let i = 1; i < entries.length; i++) {
      const current = entries[i];
      const previous = entries[i - 1];
      if (!current || !previous) continue;

      if (current.when < previous.when) {
        outOfOrder.push(
          `entry ${current.idx} (${current.tag}): when=${current.when} < entry ${previous.idx} (${previous.tag}): when=${previous.when}`,
        );
      }
    }
    expect(outOfOrder).toEqual([]);
  });
});
