#!/usr/bin/env bun
// WI-1216 tier-(b): standing, low-frequency orphan-reconcile sweep — independent of any
// execution session. Detection only: prints one report line per orphaned Work Item
// (Stage=Executing AND no live claim, cross-workstream, program-wide). No Cosmo writes, no
// auto-re-dispatch — whoever picks an orphan up still claims it through the normal
// `/cosmo:execute claim` mechanic. See `_quartet/library/redispatch-queue.md`.
//
// Run standalone from any low-frequency external trigger (host cron, Task Scheduler, or a
// manual invocation) — it needs no live shepherd/orchestrator session:
//   NOTION_TOKEN=... bun _quartet/scripts/orphan-reconcile-sweep.ts [data-source-id]
//
// Reuses `needsReclaim` from `_quartet/clacks/lease.ts` (the same predicate the shepherd's
// per-workstream boot-reconcile already checks via `reconcileWorkstream`) — just unscoped to
// any one Workstream, since this sweep runs program-wide. One durable predicate, only the
// trigger differs. Fetches `Stage=Executing` only (a plain, reliably-filterable select) and
// applies `needsReclaim` to each row client-side — the `Claim Expired` formula (WI-1238)
// cannot be used as a query filter at all: Notion's REST `/data_sources/{id}/query` rejects
// it outright ("Unable to filter based on a formula of unknown type", verified live
// 2026-07-03 against both API versions and every filter-type key). Reading the formula's
// already-computed value from a returned row is unaffected — see `lease.ts`'s `needsReclaim`.

import { needsReclaim, plainRichText, type NotionFn } from '../clacks/lease.ts';

const DEFAULT_DS_ID = '36fd1119-9955-4684-8bfe-deb145e6a21f';

export interface OrphanRow {
  id: string;
  name: string;
  claimedBy: string;
  reworkTag: boolean;
}

/** Query body for one page of the cross-workstream `Stage=Executing` fetch — filtering
 *  narrows only by Stage; `needsReclaim` is applied per-row after the fetch (see header). */
export function buildQuery(start_cursor?: string): Record<string, unknown> {
  return {
    page_size: 100,
    filter: { property: 'Stage', select: { equals: 'Executing' } },
    ...(start_cursor ? { start_cursor } : {}),
  };
}

/** Extract the report fields from one Notion query result row. */
export function toOrphanRow(row: any): OrphanRow {
  const uid = row.properties?.ID?.unique_id;
  const nameProp = row.properties?.Name?.title ?? [];
  return {
    id: uid ? `${uid.prefix || 'WI'}-${uid.number}` : row.id,
    name: nameProp
      .map((t: any) => t.plain_text ?? t.text?.content ?? '')
      .join(''),
    claimedBy: plainRichText(row.properties?.['Claimed By']),
    reworkTag: (row.properties?.Tags?.multi_select ?? []).some(
      (t: any) => t.name === 'rework',
    ),
  };
}

/** One human-readable report line per orphan — distinguishes the two needs-reclaim cases
 *  (stale claim vs. never-reclaimed) per `library/redispatch-queue.md`'s detector table. */
export function formatLine(row: OrphanRow): string {
  const claim = row.claimedBy ? `stale-claim(${row.claimedBy})` : 'unclaimed';
  const rework = row.reworkTag ? ' [rework]' : '';
  return `${row.id} ${claim}${rework} :: ${row.name}`;
}

/** Paginate the `Stage=Executing` query via the injected NotionFn, applying `needsReclaim`
 *  to each row client-side; returns every orphan found. */
export async function sweep(
  notion: NotionFn,
  dataSourceId: string,
): Promise<OrphanRow[]> {
  const out: OrphanRow[] = [];
  let cursor: string | undefined;
  do {
    const page = await notion(
      `/data_sources/${dataSourceId}/query`,
      'POST',
      buildQuery(cursor),
    );
    for (const r of page.results ?? []) {
      if (needsReclaim(r)) out.push(toOrphanRow(r));
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN not set');
    process.exit(1);
  }
  const dsId = process.argv[2] || DEFAULT_DS_ID;
  const notion: NotionFn = async (path, method = 'GET', body) => {
    const r = await fetch(`https://api.notion.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2025-09-03',
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok)
      throw new Error(`Notion query failed: ${r.status} ${await r.text()}`);
    return r.json();
  };
  const orphans = await sweep(notion, dsId);
  if (!orphans.length) {
    console.log('orphan-reconcile-sweep: no orphaned Work Items found');
    return;
  }
  console.log(`orphan-reconcile-sweep: ${orphans.length} orphan(s)`);
  for (const row of orphans) console.log(formatLine(row));
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`fatal: ${err.message}`);
    process.exit(1);
  });
}
