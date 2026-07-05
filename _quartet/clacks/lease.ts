// WI-1156 — durable single-authoritative Workstream lease for review-watcher.ts.
//
// Cosmo-hosted on the Workstream row (agenda B1) using the live `Lease *` properties
// (Lease Owner/Lease Session/Lease Expires/Lease Since — rich_text/rich_text/date/date;
// hand-created at WI-1221's build, agenda A3 impl gate). Per-workstream keying (B3): one
// lease per Workstream page id, no separate store, no stored "lanes held" list.
//
// Naming note: the WI-1156 Acceptance Criteria text still says `Owner`/`Owner-Session`/
// `Owner-Expires`/`Owner-Since`. The design agenda's own "Implementation status" section
// and WI-1221's identity-primitive.md both record that the live schema was hand-created
// as `Lease *` instead (the bare `Owner` name clashed with the pre-existing human
// `Owner [people]` field) and state this supersedes the AC wording. Confirmed live via a
// REST read of a Workstream row. This module uses the `Lease *` names.
//
// WI-1221's identity.ts/cosmo.ts (mintSessionToken/computeExpiry/isExpired) live in the
// sibling zdx-marketplace repo (_tools/ZDX-marketplace, gitignored from nexus, separate
// git remote) and are not importable from cognoco/nexus without a cross-repo path that
// would break on any other checkout or in CI. The small set of primitives needed here
// (session token, TTL compute/expiry) is reimplemented locally, matching
// review-watcher.ts's existing self-contained-REST style.
//
// A2 defaults: heartbeat cadence ~2min, lease TTL ~10min.

export const HEARTBEAT_MS = 2 * 60 * 1000;
export const TTL_MINUTES = 10;

export type NotionFn = (
  path: string,
  method?: string,
  body?: unknown,
) => Promise<any>;

export interface LeaseState {
  owner: string;
  session: string;
  expires: string | null; // ISO datetime
  since: string | null; // ISO datetime, observability-only — never gates (B2)
}

export type AcquireBranch = 'acquire' | 'takeover' | 'resumed' | 'conflict';

export interface AcquireResult {
  branch: AcquireBranch;
  /** Session token now held by `identity`, or null when `branch === 'conflict'`. */
  session: string | null;
  expires: string | null;
  since: string | null;
  /** The Workstream's current owner after this call — `identity` when held, else the holder. */
  owner: string;
}

/** Mint a per-boot session token. Opaque, unguessable, no external deps. */
export function mintSessionToken(): string {
  return crypto.randomUUID();
}

/** `from` + `ttlMinutes`, as an ISO-8601 string. Missing/unparseable `from` degrades to now. */
export function computeExpiry(
  ttlMinutes: number,
  from?: string | null,
): string {
  const parsed = from ? Date.parse(from) : NaN;
  const fromMs = Number.isNaN(parsed) ? Date.now() : parsed;
  return new Date(fromMs + ttlMinutes * 60_000).toISOString();
}

/**
 * Staleness predicate (reuses the existing `Claim Expires` TTL idiom, agenda A2). A
 * missing `expiresAt` is NOT stale — "no lease taken yet" and "lease gone stale" are
 * different states; the caller's acquire branch handles empty-owner separately (B4).
 */
export function isExpired(
  expiresAt: string | null | undefined,
  now: string = new Date().toISOString(),
): boolean {
  if (!expiresAt) return false;
  const exp = Date.parse(expiresAt);
  if (Number.isNaN(exp)) return false;
  return exp < Date.parse(now);
}

/**
 * Deterministic tie-break for a simultaneous-acquire race (agenda B4): lowest session
 * token wins; an (unexpected) session-token tie falls back to earliest Since. Both racers
 * can compute this independently from what a read-back shows, without further
 * coordination — no CAS in Notion, this is the substitute.
 */
export function pickWinner(
  a: { session: string; since: string | null },
  b: { session: string; since: string | null },
): 'a' | 'b' {
  if (a.session !== b.session) return a.session < b.session ? 'a' : 'b';
  const aSince = a.since ? Date.parse(a.since) : Infinity;
  const bSince = b.since ? Date.parse(b.since) : Infinity;
  return aSince <= bSince ? 'a' : 'b';
}

export function plainRichText(prop: any): string {
  return (prop?.rich_text ?? [])
    .map((t: any) => t.plain_text ?? t.text?.content ?? '')
    .join('');
}

function dateStart(prop: any): string | null {
  return prop?.date?.start ?? null;
}

export async function readLease(
  notion: NotionFn,
  workstreamPageId: string,
): Promise<LeaseState> {
  const page = await notion(`/pages/${workstreamPageId}`);
  return {
    owner: plainRichText(page.properties?.['Lease Owner']),
    session: plainRichText(page.properties?.['Lease Session']),
    expires: dateStart(page.properties?.['Lease Expires']),
    since: dateStart(page.properties?.['Lease Since']),
  };
}

interface LeasePatch {
  owner?: string;
  session?: string;
  expires?: string | null;
  since?: string | null;
}

async function writeLease(
  notion: NotionFn,
  workstreamPageId: string,
  patch: LeasePatch,
): Promise<void> {
  const properties: Record<string, any> = {};
  if (patch.owner !== undefined) {
    properties['Lease Owner'] = {
      rich_text: patch.owner ? [{ text: { content: patch.owner } }] : [],
    };
  }
  if (patch.session !== undefined) {
    properties['Lease Session'] = {
      rich_text: patch.session ? [{ text: { content: patch.session } }] : [],
    };
  }
  if (patch.expires !== undefined) {
    properties['Lease Expires'] = {
      date: patch.expires ? { start: patch.expires } : null,
    };
  }
  if (patch.since !== undefined) {
    properties['Lease Since'] = {
      date: patch.since ? { start: patch.since } : null,
    };
  }
  await notion(`/pages/${workstreamPageId}`, 'PATCH', { properties });
}

/**
 * Acquire state machine, implemented exactly per agenda B4:
 *   Owner empty            -> acquire
 *   Owner-Expires < now    -> takeover-acquire (stale)
 *   Owner == my-name       -> self-resume (refresh Session+Expires, keep Since)
 *   Owner != me & not stale -> conflict, back off (never seize)
 *
 * Optimistic write + read-back verify: Notion has no CAS, so acquire is write-then-
 * reread. If the read-back shows a session that isn't ours (another acquirer raced us),
 * `pickWinner` decides deterministically: if we should have won, retry once to converge;
 * otherwise back off as `conflict`.
 */
export async function acquireLease(
  notion: NotionFn,
  workstreamPageId: string,
  identity: string,
  opts: { now?: string; ttlMinutes?: number } = {},
): Promise<AcquireResult> {
  const now = opts.now ?? new Date().toISOString();
  const ttl = opts.ttlMinutes ?? TTL_MINUTES;
  const before = await readLease(notion, workstreamPageId);

  let branch: AcquireBranch;
  if (!before.owner) branch = 'acquire';
  else if (before.owner === identity) branch = 'resumed';
  else if (isExpired(before.expires, now)) branch = 'takeover';
  else branch = 'conflict';

  if (branch === 'conflict') {
    return {
      branch,
      session: null,
      expires: before.expires,
      since: before.since,
      owner: before.owner,
    };
  }

  const session = mintSessionToken();
  const expires = computeExpiry(ttl, now);
  const since = branch === 'resumed' && before.since ? before.since : now;
  await writeLease(notion, workstreamPageId, {
    owner: identity,
    session,
    expires,
    since,
  });

  let after = await readLease(notion, workstreamPageId);
  if (after.session !== session) {
    const winner = pickWinner(
      { session, since },
      { session: after.session, since: after.since },
    );
    if (winner === 'a') {
      await writeLease(notion, workstreamPageId, {
        owner: identity,
        session,
        expires,
        since,
      });
      after = await readLease(notion, workstreamPageId);
    }
  }

  if (after.session === session) {
    return { branch, session, expires, since, owner: identity };
  }
  return {
    branch: 'conflict',
    session: null,
    expires: after.expires,
    since: after.since,
    owner: after.owner,
  };
}

/**
 * Live ownership check — read-only, no write. `acquireLease`'s local result (or the
 * heartbeat cadence) is a point-in-time snapshot; two racing acquirers can each observe
 * their own write on read-back (neither sees the other's) and both walk away believing
 * they hold the lease until the next heartbeat detects the loser's session was replaced.
 * An exclusivity-sensitive action (e.g. launching a review agent) must re-check the row
 * at the moment of acting, not trust a cached "I acquired it" from boot/heartbeat time.
 */
export async function confirmLease(
  notion: NotionFn,
  workstreamPageId: string,
  identity: string,
  session: string,
): Promise<boolean> {
  const current = await readLease(notion, workstreamPageId);
  return current.owner === identity && current.session === session;
}

/**
 * Heartbeat: guarded write of Lease Expires forward, gated on Owner+Session still being
 * ours. Returns false (no write) when the lease was lost to a takeover — the caller must
 * stop acting as the authoritative watcher for that workstream.
 *
 * Compaction is explicitly NOT a takeover trigger (agenda B4 / WI-1231): the calling
 * process's session and any interval timer survive compaction, so calling this on a plain
 * wall-clock schedule already satisfies "heartbeat keeps firing" — no special-casing needed.
 */
export async function heartbeatLease(
  notion: NotionFn,
  workstreamPageId: string,
  identity: string,
  session: string,
  opts: { now?: string; ttlMinutes?: number } = {},
): Promise<boolean> {
  const now = opts.now ?? new Date().toISOString();
  const ttl = opts.ttlMinutes ?? TTL_MINUTES;
  const current = await readLease(notion, workstreamPageId);
  if (current.owner !== identity || current.session !== session) return false;
  await writeLease(notion, workstreamPageId, {
    expires: computeExpiry(ttl, now),
  });
  return true;
}

/**
 * Release on graceful stop: clears Owner/Session/Expires (the "3 fields" per B4/B2's
 * core-3). Since is left untouched — observability-only, never gates, and the next
 * acquire overwrites it anyway. Crash recovery needs no explicit release: the stale-TTL
 * takeover path handles it.
 */
export async function releaseLease(
  notion: NotionFn,
  workstreamPageId: string,
): Promise<void> {
  await writeLease(notion, workstreamPageId, {
    owner: '',
    session: '',
    expires: null,
  });
}

export interface ReclaimCandidate {
  id: string;
  workstreamId: string;
}

/**
 * WI-1216 needs-reclaim predicate: `Stage=Executing AND no live claim`. `Claim Expired`
 * alone under-counts — the formula reads `false` (not true) when `Claimed At` is empty, which
 * is exactly the state a reviewer's `rework` disposition leaves an item in (`complete()`
 * already cleared `Claimed By`/`Claimed At` on the Executing->Reviewing leg; `review.ts`'s
 * rework branch does not re-set them).
 *
 * NOT expressed as a Notion query `filter` — verified live (2026-07-03) that the REST
 * `/data_sources/{id}/query` endpoint rejects filtering on the `Claim Expired` formula
 * outright: `"Unable to filter based on a formula of unknown type"`, reproduced against both
 * the `2025-09-03` and legacy `2022-06-28` API versions and every filter-type key
 * (`checkbox`/`boolean`/`string`). Reading a formula's already-computed VALUE from a query
 * response row is unaffected — only using it as a filter *criterion* is rejected. So every
 * needs-reclaim caller fetches `Stage=Executing` (a plain, reliably-filterable select) and
 * applies this predicate to each returned row client-side instead. Single source of truth so
 * every trigger tier (`library/redispatch-queue.md`) checks the identical predicate.
 */
export function needsReclaim(row: any): boolean {
  const claimedBy = plainRichText(row.properties?.['Claimed By']);
  if (!claimedBy) return true; // never claimed / claim released and not re-established
  return row.properties?.['Claim Expired']?.formula?.boolean === true;
}

/**
 * B5 boot-reconcile, Q2 half, scoped to ONE already-owned workstream (Q1 — "do I still
 * own this row" — is `acquireLease`'s `resumed`/`takeover` outcome; there is no separate
 * store of "my lanes" to query here, agenda B3). Purely a durable Cosmo read: Work Items on
 * this workstream at `Stage=Executing` matching `needsReclaim` (the D1 needs-reclaim
 * predicate) — logged for visibility only. Acting on it (re-dispatch) is WI-1216's job
 * (`_quartet/scripts/orphan-reconcile-sweep.ts`, `library/redispatch-queue.md`).
 */
export async function reconcileWorkstream(
  notion: NotionFn,
  workItemsDataSourceId: string,
  workstreamPageId: string,
): Promise<ReclaimCandidate[]> {
  const out: ReclaimCandidate[] = [];
  let start_cursor: string | undefined;
  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      filter: {
        and: [
          { property: 'Workstream', relation: { contains: workstreamPageId } },
          { property: 'Stage', select: { equals: 'Executing' } },
        ],
      },
      ...(start_cursor ? { start_cursor } : {}),
    };
    const page = await notion(
      `/data_sources/${workItemsDataSourceId}/query`,
      'POST',
      body,
    );
    for (const r of page.results ?? []) {
      if (!needsReclaim(r)) continue;
      const u = r.properties?.ID?.unique_id;
      out.push({
        id: u ? `${u.prefix || 'WI'}-${u.number}` : r.id,
        workstreamId: workstreamPageId,
      });
    }
    start_cursor = page.has_more ? page.next_cursor : undefined;
  } while (start_cursor);
  return out;
}
