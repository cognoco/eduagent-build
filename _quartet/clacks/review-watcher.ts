#!/usr/bin/env bun
// Generic reviewer-loop watcher: polls one or more Cosmo workstreams for Work Items entering
// Stage=Reviewing and spawns a cross-model (Codex) review agent per transition. De-instanced from
// the original identity-foundation watcher — repo, DB, and the workstream list are config, not
// hardcoded. See _quartet/roles/reviewer-protocol.md for the loop's contract.
//
// Env:
//   NOTION_TOKEN         (required) Cosmo/Notion integration token
//   COSMO_WATCH_REPO     (required) repo root the review agent runs in
//   COSMO_WATCH_DB       (required) Cosmo Work Items data-source id
//   COSMO_WATCH_CONFIG   (required) path to a JSON file: Workstream[] (see type below)
//   COSMO_WATCH_IDENTITY (required) this watcher's `<role>:<name>` lease identity
//                         (WI-1221 format, e.g. "shepherd:alice") — see WI-1156 lease.ts
//   COSMO_WATCH_POLL_MS  (optional, default 60000)
//   COSMO_WATCH_OUTDIR   (optional, default <repo>/.cosmo-watch — durable, not /tmp. Point at
//                         durable program state, e.g. _quartet/working/program/review-watcher-state.
//                         gitignore it.)
//   COSMO_WATCH_POLICY   (optional) extra lane policy appended to every spawned review prompt
//   COSMO_WATCH_SESSION_ID (optional) operator-visible watcher session id
//
// Workstream config JSON shape (array):
//   [{ "name": "...", "slug": "...", "id": "<page-id>",
//      "overrides": { "WI-NN": ["dod.rule.key", ...] } }]   // overrides optional; see below
//
// WI-1156: exactly one authoritative watcher per declared workstream-set. Each configured
// workstream's Cosmo row (`ws.id`) carries a durable lease (Lease Owner/Session/Expires/
// Since) acquired at boot, heartbeat-refreshed, and released on graceful stop — see
// lease.ts. `launchReview` only fires for a workstream while this process holds its lease.

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import {
  acquireLease,
  confirmLease,
  heartbeatLease,
  releaseLease,
  reconcileWorkstream,
  HEARTBEAT_MS,
} from './lease.ts';
import { readReviewEnvelope } from './review-envelope.ts';
import { spawnReviewRunner } from './review-runner.ts';

const token = process.env.NOTION_TOKEN;
const repo = process.env.COSMO_WATCH_REPO;
const db = process.env.COSMO_WATCH_DB;
const configPath = process.env.COSMO_WATCH_CONFIG;
const identity = process.env.COSMO_WATCH_IDENTITY;
const pollMs = Number(process.env.COSMO_WATCH_POLL_MS || 60000);
const policy = (process.env.COSMO_WATCH_POLICY || '').trim();
const sessionId = process.env.COSMO_WATCH_SESSION_ID || `review-${Date.now()}`;
// Durable by default (not /tmp, which is cleaned on reboot and loses de-dupe/log history).
const outDir = process.env.COSMO_WATCH_OUTDIR || `${repo}/.cosmo-watch`;

if (!token) throw new Error('NOTION_TOKEN missing');
if (!repo) throw new Error('COSMO_WATCH_REPO missing');
if (!db) throw new Error('COSMO_WATCH_DB missing');
if (!configPath) throw new Error('COSMO_WATCH_CONFIG missing');
if (!identity) throw new Error('COSMO_WATCH_IDENTITY missing');

type Workstream = {
  name: string;
  slug: string;
  id: string;
  // Optional per-WI DoD-rule overrides. Each entry names the rule keys the reviewer is authorized
  // to waive for that WI only — an operator-approved exception, never a default. Keep empty unless
  // the operator has explicitly granted one.
  overrides?: Record<string, string[]>;
};

const rawWorkstreams: Workstream[] = JSON.parse(
  readFileSync(configPath, 'utf8'),
);
const workstreams = rawWorkstreams.map((ws) => ({
  ...ws,
  overrides: new Map<string, string[]>(Object.entries(ws.overrides || {})),
}));

const reviewDir = `${outDir}/reviews`;
const logDir = `${outDir}/logs`;
const watcherLog = `${logDir}/cosmo-reviewing-watcher.log`;
mkdirSync(reviewDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

// All maps keyed by `${workstream.name}::${wiId}` so per-workstream state never collides.
const previousStages = new Map<string, string>();
const running = new Map<string, number | string>();
const lastLaunchKey = new Map<string, string>();
let initialised = false;
let pollNo = 0;

// WI-1156: per-workstream lease session token this process currently holds, or null when
// it does not (never acquired, or lost on a later heartbeat/reacquire failure). Keyed by
// workstream name, same as the other per-workstream maps above.
const leaseSessions = new Map<string, string | null>();

const stamp = () => new Date().toISOString();

function log(line: string) {
  const msg = `[${stamp()}] ${line}`;
  console.log(msg);
  appendFileSync(watcherLog, `${msg}\n`);
}

async function notion(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok)
    throw new Error(
      `Notion ${method} ${path} -> ${res.status}: ${await res.text()}`,
    );
  return await res.json();
}

const plainTitle = (prop: any) =>
  (prop?.title || []).map((t: any) => t.plain_text || '').join('');
function wiId(page: any) {
  const u = page.properties?.ID?.unique_id;
  return u ? `${u.prefix || 'WI'}-${u.number}` : page.id;
}
const stage = (page: any) => page.properties?.Stage?.select?.name || '';
const modified = (page: any) =>
  page.properties?.Modified?.last_edited_time || page.last_edited_time || '';

async function fetchWorkstreamItems(ws: { id: string }) {
  const results: any[] = [];
  let start_cursor: string | undefined;
  do {
    const body = {
      page_size: 100,
      filter: { property: 'Workstream', relation: { contains: ws.id } },
      sorts: [{ property: 'ID', direction: 'ascending' }],
      ...(start_cursor ? { start_cursor } : {}),
    };
    const page = await notion(`/data_sources/${db}/query`, 'POST', body);
    results.push(...(page.results || []));
    start_cursor = page.has_more ? page.next_cursor : undefined;
  } while (start_cursor);
  return results;
}

function overrideNotice(ws: { overrides: Map<string, string[]> }, id: string) {
  const rules = ws.overrides.get(id);
  if (!rules || rules.length === 0) return '';
  // Generic operator-approved DoD-rule waiver for THIS WI only. The reviewer must still verify
  // every other DoD criterion; only the named rule keys are bypassed.
  return `

Operator-authorized DoD-rule override for ${id} only:
- Scope: bypass ONLY these named DoD rule keys for ${id}: ${rules.join(', ')}.
- Do NOT relax any other mechanical or evidence criterion. Completion summary, Fixed In, dates,
  Acceptance Criteria, PR/CI/landed evidence, local validation, source-artifact verification, and
  regression evidence all still apply.
- If all other DoD evidence passes and the only remaining blocker is a waived rule above, do not
  bounce to rework for it; record in the review result + a Cosmo comment that this was the
  operator-approved override for ${id}.`;
}

function promptFor(
  ws: { name: string; overrides: Map<string, string[]> },
  id: string,
  envelopePath: string,
) {
  const policyNotice = policy
    ? `

Lane policy for this watcher:
${policy}`
    : '';
  return `Live Cosmo watcher trigger for ${id} — ${ws.name} work item newly entered Stage=Reviewing. Execute the cosmo:qa evidence pass and the cosmo:review disposition for real, not merely a mechanical check. Run from ${repo}. Follow repo AGENTS.md/RTK guidance and the cosmo:qa and cosmo:review skills exactly.${overrideNotice(ws, id)}${policyNotice}

First run /cosmo:qa-style verification: read the completion summary/page, identify Fixed In/PR, verify cited commits/files/tests against the repo, re-run focused relevant tests where practical, and gather AC/source-artifact evidence. QA itself never transitions the item.

Then run /cosmo:review-style disposition: verify PR merged/CI green if applicable, map Acceptance Criteria to evidence, and verify the original symptom/source artifact as far as possible. Pass --envelope-file ${envelopePath} to that cosmo:review invocation (WI-1157) so this watcher can read the structured quartet.review_result.v1 result instead of scraping your prose summary.

If DoD and QA evidence pass, apply disposition done. If evidence fails, apply rework with a precise note and move the item Reviewing -> Executing through cosmo:review. If you cannot responsibly decide automatically, apply human with a precise note.

Do not edit code. Do not revert or overwrite unrelated edits. Return the disposition, evidence gathered, commands run, any override applied, and any Cosmo mutation made.`;
}

async function launchReview(
  ws: { name: string; slug: string; id: string; overrides: Map<string, string[]> },
  id: string,
  key: string,
) {
  const mySession = leaseSessions.get(ws.name);
  if (!mySession) {
    log(
      `skip [${ws.name}] ${id}: lease not held — not the authoritative watcher for this workstream`,
    );
    return;
  }
  // Live re-check, not the cached session above: two racing acquirers can each observe
  // their own write on read-back at boot/heartbeat time and both believe they hold the
  // lease until the loser's next heartbeat — a launch (the exclusivity-sensitive action
  // this whole lease exists to gate) must confirm against the row at the moment it acts.
  const stillMine = await confirmLease(notion, ws.id, identity!, mySession);
  if (!stillMine) {
    leaseSessions.set(ws.name, null);
    log(
      `skip [${ws.name}] ${id}: live lease check failed — no longer the authoritative watcher`,
    );
    return;
  }
  const mapKey = `${ws.name}::${id}`;
  if (running.has(mapKey)) {
    log(
      `skip [${ws.name}] ${id}: review already running pid=${running.get(mapKey)}`,
    );
    return;
  }
  if (lastLaunchKey.get(mapKey) === key) {
    log(`skip [${ws.name}] ${id}: transition key already launched (${key})`);
    return;
  }
  lastLaunchKey.set(mapKey, key);
  const suffix = stamp().replace(/[:.]/g, '-');
  const out = `${reviewDir}/${id}.${ws.slug}.${suffix}.final.md`;
  const envelopePath = `${reviewDir}/${id}.${ws.slug}.${suffix}.envelope.json`;
  const stdoutLog = `${reviewDir}/${id}.${ws.slug}.${suffix}.stdout.log`;
  const stderrLog = `${reviewDir}/${id}.${ws.slug}.${suffix}.stderr.log`;
  log(
    `trigger [${ws.name}] ${id}: launching codex review agent; key=${key}; final=${out}`,
  );

  // WI-1159: downgraded from `-s danger-full-access` (full-machine write, previously enforced
  // read-only only by the PROSE "Do not edit code" in promptFor() — contradicting the
  // read-only-by-construction rule in agnosticity spike + executor-protocol E2). Live-verified
  // on Surface: under `read-only`, a write attempt inside the target repo is rejected by the
  // sandbox itself (patch rejected, logged) and a normal QA pass (read a file, run a command,
  // report the result) still completes and produces a disposition. The earlier concern that
  // Doppler-wrapped test runs need $HOME reads workspace-write/read-only would block (see
  // WI-851) did not hold up: WI-851's root cause was a stale doc line, never code that
  // ran under this sandbox, so nothing here depended on it.
  // WI-1158: spawn goes through the runner-adapter (review-runner.ts) instead of an inline
  // codex-specific Bun.spawn call — swapping the reviewer runtime now means editing only that
  // module.
  const proc = spawnReviewRunner({
    sandbox: 'read-only',
    cwd: repo!,
    outputPath: out,
    env: process.env,
  });

  running.set(mapKey, proc.pid ?? 'unknown');
  proc.stdin.write(promptFor(ws, id, envelopePath));
  proc.stdin.end();
  (async () => {
    for await (const chunk of proc.stdout)
      appendFileSync(stdoutLog, Buffer.from(chunk));
  })();
  (async () => {
    for await (const chunk of proc.stderr)
      appendFileSync(stderrLog, Buffer.from(chunk));
  })();
  proc.exited
    .then((code) => {
      running.delete(mapKey);
      // WI-1157: read the structured envelope instead of scraping `out`'s prose. Absent
      // (older review run, or this run's agent didn't pass --envelope-file) or malformed
      // both come back null — logged and treated as `manual` (needs a human look), never
      // silently assumed successful.
      const envelope = readReviewEnvelope(envelopePath, (p) => readFileSync(p, 'utf8'));
      if (envelope) {
        log(
          `review agent [${ws.name}] ${id} exited code=${code}; disposition=${envelope.disposition}; findings=${envelope.findings.length}; cosmoMutations=${envelope.cosmoMutations.length}; envelope=${envelopePath}`,
        );
      } else {
        log(
          `review agent [${ws.name}] ${id} exited code=${code}; envelope absent/malformed at ${envelopePath} -- treating as manual; final=${out}`,
        );
      }
    })
    .catch((err) => {
      running.delete(mapKey);
      log(`review agent [${ws.name}] ${id} failed: ${err?.message || err}`);
    });
}

// WI-1156: acquire this process's lease on every configured workstream at boot. A
// `conflict` outcome means another live watcher already owns that workstream — this
// process still polls it (read-only) for visibility but `launchReview` stays gated off.
async function acquireAllLeases() {
  for (const ws of workstreams) {
    try {
      const res = await acquireLease(notion, ws.id, identity!);
      if (res.branch === 'conflict') {
        leaseSessions.set(ws.name, null);
        log(
          `lease [${ws.name}]: conflict — held by ${res.owner}; not the authoritative watcher, skipping launches`,
        );
        continue;
      }
      leaseSessions.set(ws.name, res.session);
      log(`lease [${ws.name}]: ${res.branch} — session=${res.session}`);
      const reclaim = await reconcileWorkstream(notion, db!, ws.id);
      if (reclaim.length) {
        log(
          `reconcile [${ws.name}]: ${reclaim.length} WI(s) need reclaim (Stage=Executing, no live claim): ${reclaim.map((r) => r.id).join(', ')}`,
        );
      }
    } catch (err: any) {
      log(`lease [${ws.name}]: acquire error: ${err?.message || err}`);
    }
  }
}

// Heartbeat tick (HEARTBEAT_MS cadence): refresh Lease Expires for every workstream we
// hold, and — as the periodic re-sweep backstop (agenda B5) — retry acquiring any
// workstream we don't currently hold (e.g. the prior holder's lease has since gone stale).
async function heartbeatAllLeases() {
  for (const ws of workstreams) {
    const session = leaseSessions.get(ws.name);
    if (session) {
      try {
        const ok = await heartbeatLease(notion, ws.id, identity!, session);
        if (!ok) {
          leaseSessions.set(ws.name, null);
          log(`lease [${ws.name}]: heartbeat guard failed — lease lost, backing off`);
        }
      } catch (err: any) {
        log(`lease [${ws.name}]: heartbeat error: ${err?.message || err}`);
      }
    } else {
      try {
        const res = await acquireLease(notion, ws.id, identity!);
        if (res.branch !== 'conflict') {
          leaseSessions.set(ws.name, res.session);
          log(`lease [${ws.name}]: reacquired (${res.branch}) — session=${res.session}`);
        }
      } catch (err: any) {
        log(`lease [${ws.name}]: reacquire error: ${err?.message || err}`);
      }
    }
  }
}

// Release = clear the lease on graceful stop (SIGINT/SIGTERM). A crash skips this — the
// stale-TTL takeover path in acquireLease recovers it, no explicit release required.
async function releaseAllLeases() {
  for (const ws of workstreams) {
    if (leaseSessions.get(ws.name)) {
      try {
        await releaseLease(notion, ws.id);
        log(`lease [${ws.name}]: released`);
      } catch (err: any) {
        log(`lease [${ws.name}]: release error: ${err?.message || err}`);
      }
    }
  }
}

async function poll() {
  pollNo += 1;
  const summaries: string[] = [];
  for (const ws of workstreams) {
    const items = await fetchWorkstreamItems(ws);
    // Review-leg visibility bucket (WI-1218): Reviewing (awaiting pickup) and In Review
    // (reviewer has picked it up) are both "in the review leg" for reporting purposes —
    // only the launch trigger below stays Reviewing-only (In Review is reached via
    // Reviewing first, so it never needs a second trigger).
    const reviewing: string[] = [];
    const inReview: string[] = [];
    for (const page of items) {
      const id = wiId(page);
      const mapKey = `${ws.name}::${id}`;
      const nowStage = stage(page);
      const prevStage = previousStages.get(mapKey);
      if (nowStage === 'Reviewing') reviewing.push(id);
      if (nowStage === 'In Review') inReview.push(id);
      if (
        initialised &&
        nowStage === 'Reviewing' &&
        prevStage !== 'Reviewing'
      ) {
        const key = `${prevStage || '<new>'}->Reviewing@${modified(page)}`;
        log(
          `transition [${ws.name}] ${id}: ${prevStage || '<new>'} -> Reviewing (${plainTitle(page.properties?.Name)})`,
        );
        await launchReview(ws, id, key);
      }
      previousStages.set(mapKey, nowStage);
    }
    summaries.push(
      `${ws.name}: ${items.length} items, Reviewing=${reviewing.join(', ') || 'none'}, InReview=${inReview.join(', ') || 'none'}, lease=${leaseSessions.get(ws.name) ? 'held' : 'not-held'}`,
    );
  }

  if (!initialised) {
    initialised = true;
    log(
      `baseline [${summaries.join(' | ')}]; pollMs=${pollMs}; de-dupe=transition-key`,
    );
  } else {
    log(
      `poll ${pollNo}: [${summaries.join(' | ')}]; running=${[...running.entries()].map(([k, pid]) => `${k}:${pid}`).join(', ') || 'none'}`,
    );
  }
}

log(
  `starting review watcher session=${sessionId} identity=${identity}: ${workstreams.map((ws) => `${ws.name} (${ws.id})`).join(' + ')}, Stage trigger=Reviewing`,
);

await acquireAllLeases();

// Heartbeat cadence per A2 defaults (~2min against a ~10min TTL). This is a plain wall-
// clock timer with no dependency on any session/compaction event, so it satisfies
// "compaction is not a takeover trigger" (agenda B4) without special-casing: as long as
// the process is alive, the interval keeps firing.
const heartbeatTimer = setInterval(() => {
  heartbeatAllLeases().catch((err: any) =>
    log(`heartbeat sweep error: ${err?.message || err}`),
  );
}, HEARTBEAT_MS);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}: releasing leases and exiting`);
  clearInterval(heartbeatTimer);
  await releaseAllLeases();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

while (true) {
  try {
    await poll();
  } catch (err: any) {
    log(`poll error: ${err?.message || err}`);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}
