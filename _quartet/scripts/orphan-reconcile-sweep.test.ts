// Tests for the WI-1216 tier-(b) orphan-reconcile sweep.
// Pure logic + a fake in-memory `notion()` standing in for the REST calls, so these run
// offline with `bun test` (no NOTION_TOKEN / network needed) — mirrors the pattern in
// `_quartet/clacks/lease.test.ts`.

import { describe, expect, test } from 'bun:test';
import { type NotionFn } from '../clacks/lease.ts';
import {
  buildQuery,
  formatLine,
  sweep,
  toOrphanRow,
} from './orphan-reconcile-sweep.ts';

function row(opts: {
  id: number;
  name: string;
  claimedBy?: string;
  claimExpired?: boolean;
  tags?: string[];
}) {
  return {
    id: `page-${opts.id}`,
    properties: {
      ID: { unique_id: { prefix: 'WI', number: opts.id } },
      Name: {
        title: [{ plain_text: opts.name, text: { content: opts.name } }],
      },
      'Claimed By': {
        rich_text: opts.claimedBy
          ? [{ plain_text: opts.claimedBy, text: { content: opts.claimedBy } }]
          : [],
      },
      'Claim Expired': {
        formula: { type: 'boolean', boolean: opts.claimExpired ?? false },
      },
      Tags: { multi_select: (opts.tags ?? []).map((name) => ({ name })) },
    },
  };
}

describe('buildQuery', () => {
  // No `Claim Expired` clause — verified live that Notion's REST query endpoint rejects
  // filtering on this formula outright ("Unable to filter based on a formula of unknown
  // type"). Filter narrows only to Stage=Executing; needsReclaim runs client-side per row.
  test('filters only on Stage=Executing, no Workstream scoping', () => {
    const body = buildQuery();
    expect(body.filter).toEqual({
      property: 'Stage',
      select: { equals: 'Executing' },
    });
    expect(body.start_cursor).toBeUndefined();
  });

  test('carries the cursor forward when given one', () => {
    const body = buildQuery('cursor-2');
    expect(body.start_cursor).toBe('cursor-2');
  });
});

describe('toOrphanRow', () => {
  // Real shape observed live 2026-07-03: stale claim (Claim Expired formula was true).
  test('extracts a stale-claim row (Claimed By set)', () => {
    const out = toOrphanRow(
      row({
        id: 1340,
        name: 'Some stale WI',
        claimedBy: 'claude:builder:WI-1340',
        claimExpired: true,
      }),
    );
    expect(out).toEqual({
      id: 'WI-1340',
      name: 'Some stale WI',
      claimedBy: 'claude:builder:WI-1340',
      reworkTag: false,
    });
  });

  // Real shape observed live 2026-07-03: reviewer-reject case — Claimed By empty, Claim
  // Expired reads FALSE (empty(Claimed At) -> false), rework tag present. This is the case a
  // literal "Claim Expired=true" filter alone would MISS — the reason `needsReclaim`
  // (`lease.ts`) treats an empty claim as needing reclaim regardless of the formula.
  test('extracts an empty-claim reviewer-reject row with the rework tag', () => {
    const out = toOrphanRow(
      row({ id: 1316, name: 'Bounced WI', tags: ['eval-harness', 'rework'] }),
    );
    expect(out).toEqual({
      id: 'WI-1316',
      name: 'Bounced WI',
      claimedBy: '',
      reworkTag: true,
    });
  });

  // Real shape observed live 2026-07-03 (WI-1257): empty claim, Executing, but NO rework
  // tag — proves rework is enrichment only, never part of the predicate or a requirement.
  test('extracts an empty-claim row with no rework tag as still a legitimate orphan', () => {
    const out = toOrphanRow(row({ id: 1257, name: 'Never reclaimed' }));
    expect(out).toEqual({
      id: 'WI-1257',
      name: 'Never reclaimed',
      claimedBy: '',
      reworkTag: false,
    });
  });
});

describe('formatLine', () => {
  test('labels a stale claim distinctly from an unclaimed row, and flags rework', () => {
    expect(
      formatLine({
        id: 'WI-1340',
        name: 'X',
        claimedBy: 'claude:builder:WI-1340',
        reworkTag: false,
      }),
    ).toBe('WI-1340 stale-claim(claude:builder:WI-1340) :: X');
    expect(
      formatLine({ id: 'WI-1316', name: 'Y', claimedBy: '', reworkTag: true }),
    ).toBe('WI-1316 unclaimed [rework] :: Y');
  });
});

describe('sweep', () => {
  test('paginates, filters via needsReclaim client-side, and excludes a live claim in the same page', async () => {
    const calls: any[] = [];
    const notion: NotionFn = async (path, method, body: any) => {
      calls.push({ path, method, body });
      if (calls.length === 1) {
        // WI-1340 (stale) and WI-1216 (live claim, self) share a page — WI-1216 must NOT
        // appear in the result, proving the client-side needsReclaim filter actually runs.
        return {
          results: [
            row({
              id: 1340,
              name: 'Stale',
              claimedBy: 'claude:builder:WI-1340',
              claimExpired: true,
            }),
            row({
              id: 1216,
              name: 'Live self-claim',
              claimedBy: 'builder:WS-23:WI-1216',
              claimExpired: false,
            }),
          ],
          has_more: true,
          next_cursor: 'cursor-2',
        };
      }
      return {
        results: [row({ id: 1316, name: 'Bounced', tags: ['rework'] })],
        has_more: false,
      };
    };
    const out = await sweep(notion, 'wi-ds-id');
    expect(out).toEqual([
      {
        id: 'WI-1340',
        name: 'Stale',
        claimedBy: 'claude:builder:WI-1340',
        reworkTag: false,
      },
      { id: 'WI-1316', name: 'Bounced', claimedBy: '', reworkTag: true },
    ]);
    expect(calls[0].path).toBe('/data_sources/wi-ds-id/query');
    expect(calls[0].body.filter).toEqual({
      property: 'Stage',
      select: { equals: 'Executing' },
    });
    expect(calls[1].body.start_cursor).toBe('cursor-2');
  });
});
