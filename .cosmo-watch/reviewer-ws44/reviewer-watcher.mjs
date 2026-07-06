import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const repo = process.env.COSMO_WATCH_REPO || process.cwd();
const dataSourceId = process.env.COSMO_WATCH_DB || '36fd1119-9955-4684-8bfe-deb145e6a21f';
const configPath =
  process.env.COSMO_WATCH_CONFIG || join(repo, '.cosmo-watch', 'reviewer-ws44', 'workstreams.json');
const outDir = process.env.COSMO_WATCH_OUTDIR || join(repo, '.cosmo-watch', 'reviewer-ws44');
const pollMs = Number(process.env.COSMO_WATCH_POLL_MS || 60000);
const backfillReviewing = process.env.COSMO_WATCH_BACKFILL_REVIEWING !== '0';
const actor = process.env.COSMO_REVIEWER_ACTOR || 'claude-code:reviewer-ws44';
const token = process.env.NOTION_TOKEN;

if (!token) throw new Error('NOTION_TOKEN missing');

const workstreams = JSON.parse(readFileSync(configPath, 'utf8'));
const logsDir = join(outDir, 'logs');
const reviewsDir = join(outDir, 'reviews');
const promptsDir = join(outDir, 'prompts');
mkdirSync(logsDir, { recursive: true });
mkdirSync(reviewsDir, { recursive: true });
mkdirSync(promptsDir, { recursive: true });

const logPath = join(logsDir, 'reviewer-watcher.log');
const ledgerPath = join(outDir, 'launched-transitions.json');
const previousStages = new Map();
const running = new Map();
const launched = new Map();
let initialised = false;
let pollNo = 0;

function stamp() {
  return new Date().toISOString();
}

function log(line) {
  const msg = `[${stamp()}] ${line}`;
  console.log(msg);
  writeFileSync(logPath, `${msg}\n`, { flag: 'a' });
}

function loadLedger() {
  if (!existsSync(ledgerPath)) return;
  for (const [key, value] of Object.entries(JSON.parse(readFileSync(ledgerPath, 'utf8')))) {
    launched.set(key, value);
  }
}

function saveLedger() {
  writeFileSync(ledgerPath, `${JSON.stringify(Object.fromEntries(launched), null, 2)}\n`);
}

async function notionQuery(body) {
  const res = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Notion query failed ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function fetchWorkstreamItems(ws) {
  const results = [];
  let start_cursor;
  do {
    const page = await notionQuery({
      page_size: 100,
      filter: { property: 'Workstream', relation: { contains: ws.id } },
      sorts: [{ property: 'ID', direction: 'ascending' }],
      ...(start_cursor ? { start_cursor } : {}),
    });
    results.push(...(page.results || []));
    start_cursor = page.has_more ? page.next_cursor : undefined;
  } while (start_cursor);
  return results;
}

function title(prop) {
  return (prop?.title || []).map((t) => t.plain_text || '').join('');
}

function wiId(page) {
  const u = page.properties?.ID?.unique_id;
  return u ? `${u.prefix || 'WI'}-${u.number}` : page.id;
}

function stage(page) {
  return page.properties?.Stage?.select?.name || '';
}

function modified(page) {
  return page.properties?.Modified?.last_edited_time || page.last_edited_time || '';
}

function reviewPrompt(ws, id) {
  return `You are the Claude Code-hosted independent reviewer for WS-44 Coverage Debt.

Repo: ${repo}
Workstream: ${ws.name} (${ws.id})
Work Item: ${id}
Reviewer actor for cosmo:review --actor: ${actor}

Load and follow these before acting:
1. _quartet/roles/reviewer-protocol.md
2. AGENTS.md, including Cosmo lifecycle rules and RTK guidance
3. cosmo:work-items, cosmo:work-lifecycle, cosmo:qa, cosmo:review, notion-patterns, cli:modern-cli-tooling

Run the review for real:
- First run /cosmo:qa-style verification: read the work item, completion summary, Fixed In/PR, cited commits/files/tests, and AC evidence. Re-run focused tests where practical.
- Then run /cosmo:review-style disposition for real: done, rework, or human. Use --actor ${actor} where the review tool requires it.
- Landing branch is main.
- WP-child formality is waived for this workstream only: direct Item slice, no WP required.
- Lane invariant: tests must exercise real behavior. A green test that weakens an assertion, mocks internal code (GC1/GC6), or fakes device evidence is rework.
- Do not edit code. Do not revert unrelated changes. Keep any local evidence under .cosmo-watch/reviewer-ws44/.

Return disposition, evidence gathered, commands run, policy override applied, and Cosmo mutations made.`;
}

function launchReview(ws, id, key) {
  const mapKey = `${ws.name}::${id}`;
  if (running.has(mapKey)) {
    log(`skip ${id}: review already running pid=${running.get(mapKey)}`);
    return;
  }
  const ledgerKey = `${mapKey}::${key}`;
  if (launched.has(ledgerKey)) {
    log(`skip ${id}: transition key already launched (${key})`);
    return;
  }

  const suffix = stamp().replace(/[:.]/g, '-');
  const promptPath = join(promptsDir, `${id}.${ws.slug}.${suffix}.prompt.txt`);
  const outPath = join(reviewsDir, `${id}.${ws.slug}.${suffix}.final.md`);
  const errPath = join(reviewsDir, `${id}.${ws.slug}.${suffix}.stderr.log`);
  writeFileSync(promptPath, reviewPrompt(ws, id));

  log(`trigger ${id}: launching Claude Code review; key=${key}; final=${outPath}`);
  const stdout = createWriteStream(outPath, { flags: 'a' });
  const stderr = createWriteStream(errPath, { flags: 'a' });
  const proc = spawn(
    'claude',
    ['-p', '--input-format', 'text', '--output-format', 'text', '--permission-mode', 'bypassPermissions'],
    { cwd: repo, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  proc.stdout.pipe(stdout);
  proc.stderr.pipe(stderr);
  proc.stdin.write(readFileSync(promptPath));
  proc.stdin.end();

  running.set(mapKey, proc.pid ?? 'unknown');
  launched.set(ledgerKey, {
    runtime: 'claude-code',
    workstream: ws.name,
    wi: id,
    key,
    prompt: promptPath,
    final: outPath,
    stderr: errPath,
    startedAt: stamp(),
    pid: proc.pid ?? 'unknown',
  });
  saveLedger();

  proc.on('exit', (code) => {
    running.delete(mapKey);
    log(`Claude Code review ${id} exited code=${code}; final=${outPath}`);
  });
  proc.on('error', (err) => {
    running.delete(mapKey);
    log(`Claude Code review ${id} failed to launch: ${err.message}`);
  });
}

async function poll() {
  pollNo += 1;
  const summaries = [];
  for (const ws of workstreams) {
    const items = await fetchWorkstreamItems(ws);
    const reviewing = [];
    for (const page of items) {
      const id = wiId(page);
      const mapKey = `${ws.name}::${id}`;
      const currentStage = stage(page);
      const previousStage = previousStages.get(mapKey);
      if (currentStage === 'Reviewing') reviewing.push(id);

      if (initialised && currentStage === 'Reviewing' && previousStage !== 'Reviewing') {
        const key = `${previousStage || '<new>'}->Reviewing@${modified(page)}`;
        log(`transition ${id}: ${previousStage || '<new>'} -> Reviewing (${title(page.properties?.Name)})`);
        launchReview(ws, id, key);
      }

      if (!initialised && backfillReviewing && currentStage === 'Reviewing') {
        const key = `<startup>->Reviewing@${modified(page)}`;
        log(`backfill ${id}: already Reviewing at startup (${title(page.properties?.Name)})`);
        launchReview(ws, id, key);
      }

      previousStages.set(mapKey, currentStage);
    }
    summaries.push(`${ws.name}: ${items.length} items, Reviewing=${reviewing.join(', ') || 'none'}`);
  }

  if (!initialised) {
    initialised = true;
    log(`baseline [${summaries.join(' | ')}]; pollMs=${pollMs}; runtime=claude-code; actor=${actor}`);
  } else {
    log(`poll ${pollNo}: [${summaries.join(' | ')}]; running=${[...running.entries()].map(([k, pid]) => `${k}:${pid}`).join(', ') || 'none'}`);
  }
}

loadLedger();
log(`starting WS-44 reviewer watcher; dataSource=${dataSourceId}; config=${configPath}; outDir=${outDir}; backfillReviewing=${backfillReviewing}; launchedTransitions=${launched.size}`);
while (true) {
  try {
    await poll();
  } catch (err) {
    log(`poll error: ${err.message || err}`);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}
