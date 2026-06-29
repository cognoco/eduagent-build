#!/usr/bin/env bun
// Generic reviewer-loop watcher: polls one or more Cosmo workstreams for Work Items entering
// Stage=Reviewing and spawns a cross-model (Codex) review agent per transition. De-instanced from
// the original identity-foundation watcher — repo, DB, and the workstream list are config, not
// hardcoded. See _quartet/roles/reviewer-protocol.md for the loop's contract.
//
// Env:
//   NOTION_TOKEN         (required) Cosmo/Notion integration token
//   COSMO_WATCH_REPO     (required) repo root the review agent runs in
//   COSMO_WATCH_DB       (required) Cosmo Work Items database id
//   COSMO_WATCH_CONFIG   (required) path to a JSON file: Workstream[] (see type below)
//   COSMO_WATCH_POLL_MS  (optional, default 60000)
//   COSMO_WATCH_OUTDIR   (optional, default <repo>/.cosmo-watch — durable, not /tmp. Point at
//                         durable program state, e.g. _quartet/working/program/review-watcher-state.
//                         gitignore it.)
//
// Workstream config JSON shape (array):
//   [{ "name": "...", "slug": "...", "id": "<page-id>",
//      "overrides": { "WI-NN": ["dod.rule.key", ...] } }]   // overrides optional; see below

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn } from 'bun';

const token = process.env.NOTION_TOKEN;
const repo = process.env.COSMO_WATCH_REPO;
const db = process.env.COSMO_WATCH_DB;
const configPath = process.env.COSMO_WATCH_CONFIG;
const pollMs = Number(process.env.COSMO_WATCH_POLL_MS || 60000);
// Durable by default (not /tmp, which is cleaned on reboot and loses de-dupe/log history).
const outDir = process.env.COSMO_WATCH_OUTDIR || `${repo}/.cosmo-watch`;

if (!token) throw new Error('NOTION_TOKEN missing');
if (!repo) throw new Error('COSMO_WATCH_REPO missing');
if (!db) throw new Error('COSMO_WATCH_DB missing');
if (!configPath) throw new Error('COSMO_WATCH_CONFIG missing');

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
      'Notion-Version': '2022-06-28',
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
    const page = await notion(`/databases/${db}/query`, 'POST', body);
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
) {
  return `Live Cosmo watcher trigger for ${id} — ${ws.name} work item newly entered Stage=Reviewing. Execute the cosmo:qa evidence pass and the cosmo:review disposition for real, not merely a mechanical check. Run from ${repo}. Follow repo AGENTS.md/RTK guidance and the cosmo:qa and cosmo:review skills exactly.${overrideNotice(ws, id)}

First run /cosmo:qa-style verification: read the completion summary/page, identify Fixed In/PR, verify cited commits/files/tests against the repo, re-run focused relevant tests where practical, and gather AC/source-artifact evidence. QA itself never transitions the item.

Then run /cosmo:review-style disposition: verify PR merged/CI green if applicable, map Acceptance Criteria to evidence, and verify the original symptom/source artifact as far as possible.

If DoD and QA evidence pass, apply disposition done. If evidence fails, apply rework with a precise note and move the item Reviewing -> Executing through cosmo:review. If you cannot responsibly decide automatically, apply human with a precise note.

Do not edit code. Do not revert or overwrite unrelated edits. Return the disposition, evidence gathered, commands run, any override applied, and any Cosmo mutation made.`;
}

function launchReview(
  ws: { name: string; slug: string; overrides: Map<string, string[]> },
  id: string,
  key: string,
) {
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
  const stdoutLog = `${reviewDir}/${id}.${ws.slug}.${suffix}.stdout.log`;
  const stderrLog = `${reviewDir}/${id}.${ws.slug}.${suffix}.stderr.log`;
  log(
    `trigger [${ws.name}] ${id}: launching codex review agent; key=${key}; final=${out}`,
  );

  // KNOWN LIMITATION (reviewer-substrate productization — not yet MVP-hardened):
  // A reviewer must NOT mutate code, yet this spawns the review-agent with `-s danger-full-access`
  // (full-machine write) and relies on the PROSE "Do not edit code" in promptFor() to enforce it.
  // That contradicts the read-only-by-construction rule (agnosticity spike + executor-protocol E2:
  // "enforce read-only structurally, not by instruction"). The target is read-only / workspace-write
  // with any write-capable QA forced into a throwaway worktree. NOT changed blind here: the QA pass
  // runs Doppler-wrapped tests that read $HOME config, which workspace-write would block — the
  // downgrade needs a live-verified review run. Tracked as reviewer-substrate work.
  const proc = spawn(
    [
      'codex',
      '-a',
      'never',
      'exec',
      '--ephemeral',
      '-C',
      repo!,
      '-s',
      'danger-full-access',
      '-c',
      'shell_environment_policy.inherit="all"',
      '-o',
      out,
      '-',
    ],
    {
      cwd: repo!,
      env: process.env,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );

  running.set(mapKey, proc.pid ?? 'unknown');
  proc.stdin.write(promptFor(ws, id));
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
      log(`review agent [${ws.name}] ${id} exited code=${code}; final=${out}`);
    })
    .catch((err) => {
      running.delete(mapKey);
      log(`review agent [${ws.name}] ${id} failed: ${err?.message || err}`);
    });
}

async function poll() {
  pollNo += 1;
  const summaries: string[] = [];
  for (const ws of workstreams) {
    const items = await fetchWorkstreamItems(ws);
    const reviewing: string[] = [];
    for (const page of items) {
      const id = wiId(page);
      const mapKey = `${ws.name}::${id}`;
      const nowStage = stage(page);
      const prevStage = previousStages.get(mapKey);
      if (nowStage === 'Reviewing') reviewing.push(id);
      if (
        initialised &&
        nowStage === 'Reviewing' &&
        prevStage !== 'Reviewing'
      ) {
        const key = `${prevStage || '<new>'}->Reviewing@${modified(page)}`;
        log(
          `transition [${ws.name}] ${id}: ${prevStage || '<new>'} -> Reviewing (${plainTitle(page.properties?.Name)})`,
        );
        launchReview(ws, id, key);
      }
      previousStages.set(mapKey, nowStage);
    }
    summaries.push(
      `${ws.name}: ${items.length} items, Reviewing=${reviewing.join(', ') || 'none'}`,
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
  `starting review watcher: ${workstreams.map((ws) => `${ws.name} (${ws.id})`).join(' + ')}, Stage trigger=Reviewing`,
);
while (true) {
  try {
    await poll();
  } catch (err: any) {
    log(`poll error: ${err?.message || err}`);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}
