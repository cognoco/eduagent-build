// Tests for the WI-1156 durable single-authoritative Workstream lease.
// Pure logic + a fake in-memory `notion()` standing in for the REST calls, so these
// run offline with `bun test` (no NOTION_TOKEN / network needed).

import { describe, expect, test } from 'bun:test';
import {
  acquireLease,
  computeExpiry,
  confirmLease,
  heartbeatLease,
  isExpired,
  needsReclaim,
  pickWinner,
  reconcileWorkstream,
  releaseLease,
  type NotionFn,
} from './lease.ts';

const WS_ID = 'ws-page-1';

function richText(value: string) {
  return {
    rich_text: value ? [{ plain_text: value, text: { content: value } }] : [],
  };
}
function dateProp(value: string | null) {
  return { date: value ? { start: value } : null };
}

// A tiny fake Notion page store keyed by page id, supporting GET /pages/{id} and
// PATCH /pages/{id} against the four lease properties — everything acquireLease /
// heartbeatLease / releaseLease actually touch.
function fakeNotion(
  initial: {
    owner?: string;
    session?: string;
    expires?: string | null;
    since?: string | null;
  } = {},
): { notion: NotionFn; get: () => Required<typeof initial> } {
  const state = {
    owner: initial.owner ?? '',
    session: initial.session ?? '',
    expires: initial.expires ?? null,
    since: initial.since ?? null,
  };
  const notion: NotionFn = async (path, method = 'GET', body?: any) => {
    const m = path.match(/^\/pages\/([^/]+)$/);
    if (!m) throw new Error(`unexpected path in test fake: ${method} ${path}`);
    if (method === 'GET') {
      return {
        properties: {
          'Lease Owner': richText(state.owner),
          'Lease Session': richText(state.session),
          'Lease Expires': dateProp(state.expires),
          'Lease Since': dateProp(state.since),
        },
      };
    }
    if (method === 'PATCH') {
      const props = body.properties;
      if ('Lease Owner' in props)
        state.owner = props['Lease Owner'].rich_text[0]?.text.content ?? '';
      if ('Lease Session' in props)
        state.session = props['Lease Session'].rich_text[0]?.text.content ?? '';
      if ('Lease Expires' in props)
        state.expires = props['Lease Expires'].date?.start ?? null;
      if ('Lease Since' in props)
        state.since = props['Lease Since'].date?.start ?? null;
      return { properties: {} };
    }
    throw new Error(`unexpected method in test fake: ${method}`);
  };
  return { notion, get: () => ({ ...state }) as any };
}

describe('pure helpers', () => {
  test('isExpired: missing expiry is not stale', () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
    expect(isExpired('')).toBe(false);
  });

  test('isExpired: past vs future', () => {
    const now = '2026-07-03T12:00:00.000Z';
    expect(isExpired('2026-07-03T11:00:00.000Z', now)).toBe(true);
    expect(isExpired('2026-07-03T13:00:00.000Z', now)).toBe(false);
  });

  test('computeExpiry: adds TTL minutes to `from`', () => {
    expect(computeExpiry(10, '2026-07-03T12:00:00.000Z')).toBe(
      '2026-07-03T12:10:00.000Z',
    );
  });

  test('pickWinner: lowest session token wins', () => {
    const a = { session: 'aaa', since: '2026-07-03T12:00:00.000Z' };
    const b = { session: 'bbb', since: '2026-07-03T11:00:00.000Z' };
    expect(pickWinner(a, b)).toBe('a');
    expect(pickWinner(b, a)).toBe('b');
  });

  test('pickWinner: equal session tokens fall back to earliest since', () => {
    const a = { session: 'same', since: '2026-07-03T12:00:00.000Z' };
    const b = { session: 'same', since: '2026-07-03T11:00:00.000Z' };
    expect(pickWinner(a, b)).toBe('b');
  });
});

describe('acquireLease state machine (agenda B4)', () => {
  test('empty owner -> acquire', async () => {
    const { notion, get } = fakeNotion();
    const res = await acquireLease(notion, WS_ID, 'shepherd:alice', {
      now: '2026-07-03T12:00:00.000Z',
    });
    expect(res.branch).toBe('acquire');
    expect(res.owner).toBe('shepherd:alice');
    expect(res.session).toBeTruthy();
    const s = get();
    expect(s.owner).toBe('shepherd:alice');
    expect(s.session).toBe(res.session);
    expect(s.since).toBe('2026-07-03T12:00:00.000Z');
    expect(s.expires).toBe('2026-07-03T12:10:00.000Z');
  });

  test('expired lease -> takeover-acquire', async () => {
    const { notion, get } = fakeNotion({
      owner: 'shepherd:bob',
      session: 'old-session',
      expires: '2026-07-03T11:00:00.000Z', // stale relative to `now` below
      since: '2026-07-03T01:00:00.000Z',
    });
    const res = await acquireLease(notion, WS_ID, 'shepherd:alice', {
      now: '2026-07-03T12:00:00.000Z',
    });
    expect(res.branch).toBe('takeover');
    expect(res.owner).toBe('shepherd:alice');
    const s = get();
    expect(s.owner).toBe('shepherd:alice');
    expect(s.since).toBe('2026-07-03T12:00:00.000Z'); // takeover starts a fresh Since
  });

  test('owner == my-name -> self-resume, keeps Since, refreshes Session+Expires', async () => {
    const { notion, get } = fakeNotion({
      owner: 'shepherd:alice',
      session: 'prior-boot-session',
      expires: '2026-07-03T12:30:00.000Z', // still live — not stale
      since: '2026-07-01T00:00:00.000Z',
    });
    const res = await acquireLease(notion, WS_ID, 'shepherd:alice', {
      now: '2026-07-03T12:00:00.000Z',
    });
    expect(res.branch).toBe('resumed');
    expect(res.session).not.toBe('prior-boot-session');
    const s = get();
    expect(s.session).toBe(res.session);
    expect(s.since).toBe('2026-07-01T00:00:00.000Z'); // preserved
    expect(s.expires).toBe('2026-07-03T12:10:00.000Z'); // refreshed
  });

  test('owner != me and not stale -> conflict, never seizes', async () => {
    const { notion, get } = fakeNotion({
      owner: 'shepherd:bob',
      session: 'bobs-session',
      expires: '2026-07-03T12:30:00.000Z',
      since: '2026-07-01T00:00:00.000Z',
    });
    const before = get();
    const res = await acquireLease(notion, WS_ID, 'shepherd:alice', {
      now: '2026-07-03T12:00:00.000Z',
    });
    expect(res.branch).toBe('conflict');
    expect(res.session).toBeNull();
    expect(res.owner).toBe('shepherd:bob');
    expect(get()).toEqual(before); // no write attempted
  });

  test('simultaneous-acquire race: read-back mismatch resolved by deterministic tie-break', async () => {
    const { notion } = fakeNotion();
    let patchCount = 0;
    const racing: NotionFn = async (path, method = 'GET', body?: any) => {
      if (method === 'PATCH') {
        patchCount += 1;
        const result = await notion(path, method, body);
        if (patchCount === 1) {
          // simulate a second acquirer's write landing immediately after ours, with a
          // session token that is lexicographically LOWER than anything crypto.randomUUID()
          // can produce that starts with a digit >= '1' — force it via direct overwrite.
          await notion(path, 'PATCH', {
            properties: {
              'Lease Owner': richText('shepherd:carol'),
              'Lease Session': richText('000-lowest-wins'),
              'Lease Expires': dateProp('2026-07-03T12:10:00.000Z'),
              'Lease Since': dateProp('2026-07-03T12:00:00.000Z'),
            },
          });
        }
        return result;
      }
      return notion(path, method, body);
    };
    const res = await acquireLease(racing, WS_ID, 'shepherd:alice', {
      now: '2026-07-03T12:00:00.000Z',
    });
    // '000-lowest-wins' sorts below any UUID (which starts with a hex digit but the fake's
    // token is shorter/lower lexicographically due to leading zeros) -> the other racer wins.
    expect(res.branch).toBe('conflict');
    expect(res.owner).toBe('shepherd:carol');
  });

  test('simultaneous-acquire race: WHEN we should win the tie-break, retry converges to held', async () => {
    const { notion } = fakeNotion();
    let patchCount = 0;
    const racing: NotionFn = async (path, method = 'GET', body?: any) => {
      if (method === 'PATCH') {
        patchCount += 1;
        const result = await notion(path, method, body);
        if (patchCount === 1) {
          // A racer's write lands right after ours, with a session token that is
          // lexicographically HIGHER than anything crypto.randomUUID() can produce (hex
          // digits only) -> pickWinner must favor OUR (already-written) session, and the
          // retry-to-converge write on the SECOND patch call must not be clobbered again.
          await notion(path, 'PATCH', {
            properties: {
              'Lease Owner': richText('shepherd:dave'),
              'Lease Session': richText('zzz-highest-loses'),
              'Lease Expires': dateProp('2026-07-03T12:10:00.000Z'),
              'Lease Since': dateProp('2026-07-03T12:00:00.000Z'),
            },
          });
        }
        return result;
      }
      return notion(path, method, body);
    };
    const res = await acquireLease(racing, WS_ID, 'shepherd:alice', {
      now: '2026-07-03T12:00:00.000Z',
    });
    expect(patchCount).toBe(2); // original write + the retry-to-converge write
    expect(res.branch).toBe('acquire');
    expect(res.owner).toBe('shepherd:alice');
    expect(res.session).toBeTruthy();
  });
});

describe('acquireLease convergence gap — both-return-held interleaving (advisor finding)', () => {
  test('two racing acquirers can each see their own write on read-back; only a live confirmLease at launch time catches the loser', async () => {
    // Same identity, empty row — simulates two processes started under the same durable
    // owner name (the expected real-world case, not two different names).
    const { notion, get } = fakeNotion();
    const identity = 'shepherd:alice';

    // A acquires and reads back its own write before B ever writes — acquireLease
    // legitimately reports "held" for A, exactly as agenda B4 promises.
    const a = await acquireLease(notion, WS_ID, identity, {
      now: '2026-07-03T12:00:00.000Z',
    });
    expect(a.branch).toBe('acquire');
    expect(a.session).toBeTruthy();

    // B then overwrites the same row (its own acquire call, same identity — from B's own
    // read-back perspective it also legitimately observes ITS write and reports "held").
    // acquireLease's read-back check only ever compares against the caller's OWN token,
    // so B's acquireLease call also returns branch != 'conflict' here.
    const b = await acquireLease(notion, WS_ID, identity, {
      now: '2026-07-03T12:00:01.000Z',
    });
    expect(b.branch).toBe('resumed'); // owner already == identity from A's write
    expect(b.session).toBeTruthy();
    expect(b.session).not.toBe(a.session);

    // The row now holds B's session — A's cached "I hold it" from its own acquireLease
    // result is stale. A launch-time gate must re-check live, not trust that cached result.
    expect(get().session).toBe(b.session);
    expect(await confirmLease(notion, WS_ID, identity, a.session!)).toBe(false);
    expect(await confirmLease(notion, WS_ID, identity, b.session!)).toBe(true);
  });
});

describe('confirmLease', () => {
  test('true when Owner+Session still match', async () => {
    const { notion } = fakeNotion({
      owner: 'shepherd:alice',
      session: 'my-session',
    });
    expect(
      await confirmLease(notion, WS_ID, 'shepherd:alice', 'my-session'),
    ).toBe(true);
  });

  test('false when the session has been replaced (lease lost)', async () => {
    const { notion } = fakeNotion({
      owner: 'shepherd:alice',
      session: 'someone-elses-session',
    });
    expect(
      await confirmLease(notion, WS_ID, 'shepherd:alice', 'my-session'),
    ).toBe(false);
  });

  test('false when the owner name itself has changed', async () => {
    const { notion } = fakeNotion({
      owner: 'shepherd:bob',
      session: 'my-session',
    });
    expect(
      await confirmLease(notion, WS_ID, 'shepherd:alice', 'my-session'),
    ).toBe(false);
  });
});

describe('heartbeatLease guard', () => {
  test('refreshes Expires when Owner+Session still mine', async () => {
    const { notion, get } = fakeNotion({
      owner: 'shepherd:alice',
      session: 'my-session',
      expires: '2026-07-03T12:10:00.000Z',
      since: '2026-07-03T12:00:00.000Z',
    });
    const ok = await heartbeatLease(
      notion,
      WS_ID,
      'shepherd:alice',
      'my-session',
      {
        now: '2026-07-03T12:08:00.000Z',
      },
    );
    expect(ok).toBe(true);
    expect(get().expires).toBe('2026-07-03T12:18:00.000Z');
  });

  test('refuses to write when Session no longer mine (lost the lease)', async () => {
    const { notion, get } = fakeNotion({
      owner: 'shepherd:bob',
      session: 'bobs-session',
      expires: '2026-07-03T12:10:00.000Z',
      since: '2026-07-03T12:00:00.000Z',
    });
    const before = get();
    const ok = await heartbeatLease(
      notion,
      WS_ID,
      'shepherd:alice',
      'my-session',
      {
        now: '2026-07-03T12:08:00.000Z',
      },
    );
    expect(ok).toBe(false);
    expect(get()).toEqual(before); // no write attempted
  });
});

describe('releaseLease', () => {
  test('clears Owner/Session/Expires, leaves Since untouched', async () => {
    const { notion, get } = fakeNotion({
      owner: 'shepherd:alice',
      session: 'my-session',
      expires: '2026-07-03T12:10:00.000Z',
      since: '2026-07-03T12:00:00.000Z',
    });
    await releaseLease(notion, WS_ID);
    const s = get();
    expect(s.owner).toBe('');
    expect(s.session).toBe('');
    expect(s.expires).toBeNull();
    expect(s.since).toBe('2026-07-03T12:00:00.000Z');
  });
});

function executingRow(opts: {
  id: number;
  claimedBy?: string;
  claimExpired?: boolean;
}) {
  return {
    id: `page-${opts.id}`,
    properties: {
      ID: { unique_id: { prefix: 'WI', number: opts.id } },
      'Claimed By': {
        rich_text: opts.claimedBy
          ? [{ plain_text: opts.claimedBy, text: { content: opts.claimedBy } }]
          : [],
      },
      'Claim Expired': {
        formula: { type: 'boolean', boolean: opts.claimExpired ?? false },
      },
    },
  };
}

describe('needsReclaim (WI-1216 predicate — read the formula VALUE, never filter on it)', () => {
  // Real shape observed live 2026-07-03: stale claim, Claim Expired formula reads true.
  test('a stale claim (Claimed By set, Claim Expired=true) needs reclaim', () => {
    expect(
      needsReclaim(
        executingRow({
          id: 1340,
          claimedBy: 'claude:builder:WI-1340',
          claimExpired: true,
        }),
      ),
    ).toBe(true);
  });

  // Real shape observed live 2026-07-03 (WI-1316/752): reviewer-reject case — Claimed By
  // empty, and the formula itself reads FALSE (empty(Claimed At) -> false). A literal
  // "Claim Expired=true" reading would miss this; needsReclaim must not.
  test('an empty claim needs reclaim even though Claim Expired reads false', () => {
    expect(needsReclaim(executingRow({ id: 1316, claimExpired: false }))).toBe(
      true,
    );
  });

  test('a live claim (Claimed By set, Claim Expired=false) does NOT need reclaim', () => {
    expect(
      needsReclaim(
        executingRow({
          id: 1216,
          claimedBy: 'builder:WS-23:WI-1216',
          claimExpired: false,
        }),
      ),
    ).toBe(false);
  });
});

describe('reconcileWorkstream (B5 Q2 query step)', () => {
  test('queries Stage=Executing scoped to the workstream, paginates, and filters client-side via needsReclaim', async () => {
    const calls: any[] = [];
    const notion: NotionFn = async (path, method, body: any) => {
      calls.push({ path, method, body });
      if (calls.length === 1) {
        return {
          // one needs-reclaim (empty claim) + one live claim in the same page — proves the
          // live claim is excluded by client-side filtering, not just absent from a mock.
          results: [
            executingRow({ id: 900 }),
            executingRow({ id: 999, claimedBy: 'x', claimExpired: false }),
          ],
          has_more: true,
          next_cursor: 'cursor-2',
        };
      }
      return {
        results: [
          executingRow({ id: 901, claimedBy: 'y', claimExpired: true }),
        ],
        has_more: false,
      };
    };
    const out = await reconcileWorkstream(notion, 'wi-ds-id', WS_ID);
    expect(out).toEqual([
      { id: 'WI-900', workstreamId: WS_ID },
      { id: 'WI-901', workstreamId: WS_ID },
    ]);
    expect(calls[0].path).toBe('/data_sources/wi-ds-id/query');
    // No `Claim Expired` filter clause — verified live that Notion rejects it outright.
    expect(calls[0].body.filter.and).toEqual([
      { property: 'Workstream', relation: { contains: WS_ID } },
      { property: 'Stage', select: { equals: 'Executing' } },
    ]);
    expect(calls[1].body.start_cursor).toBe('cursor-2');
  });
});
