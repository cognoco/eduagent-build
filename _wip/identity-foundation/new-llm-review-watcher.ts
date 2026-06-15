#!/usr/bin/env bun

import { appendFileSync, mkdirSync } from "node:fs";
import { spawn } from "bun";

const repo = "/Users/vetinari/nexus/_dev/eduagent-build";
const db = "f170be9e04ae45d4961828f2438666bd";
const workstream = {
  name: "new-llm Integration & Reconciliation",
  slug: "new-llm-integration-reconciliation",
  id: "37d8bce9-1f7c-8145-80ef-cec4b55dcba4",
};
const reviewDir = "/tmp/cosmo-watch-new-llm/reviews";
const logDir = "/tmp/cosmo-watch-new-llm/logs";
const watcherLog = `${logDir}/new-llm-reviewing-watcher.log`;
const pollMs = Number(process.env.COSMO_WATCH_POLL_MS || 60000);
const token = process.env.NOTION_TOKEN;

if (!token) throw new Error("NOTION_TOKEN missing");

mkdirSync(reviewDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const previousStages = new Map<string, string>();
const running = new Map<string, number | string>();
const lastLaunchKey = new Map<string, string>();
let initialised = false;
let pollNo = 0;

function stamp() {
  return new Date().toISOString();
}

function log(line: string) {
  const msg = `[${stamp()}] ${line}`;
  console.log(msg);
  appendFileSync(watcherLog, `${msg}\n`);
}

async function notion(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion ${method} ${path} -> ${res.status}: ${await res.text()}`);
  return await res.json();
}

function plainTitle(prop: any) {
  return (prop?.title || []).map((t: any) => t.plain_text || "").join("");
}

function wiId(page: any) {
  const u = page.properties?.ID?.unique_id;
  return u ? `${u.prefix || "WI"}-${u.number}` : page.id;
}

function stage(page: any) {
  return page.properties?.Stage?.select?.name || "";
}

function modified(page: any) {
  return page.properties?.Modified?.last_edited_time || page.last_edited_time || "";
}

async function fetchWorkstreamItems() {
  const results: any[] = [];
  let start_cursor: string | undefined;
  do {
    const body = {
      page_size: 100,
      filter: { property: "Workstream", relation: { contains: workstream.id } },
      sorts: [{ property: "ID", direction: "ascending" }],
      ...(start_cursor ? { start_cursor } : {}),
    };
    const page = await notion(`/databases/${db}/query`, "POST", body);
    results.push(...(page.results || []));
    start_cursor = page.has_more ? page.next_cursor : undefined;
  } while (start_cursor);
  return results;
}

function specialPolicyNotice(id: string) {
  return `

Special review policy for ${workstream.name}:
- Landing branch rule: PRs target the branch "new-llm", not "main". When checking whether the change has landed, verify the PR is merged into "new-llm" and that the Fixed In commit is present on origin/new-llm. Do not reject solely because the change is not on main.
- Approved Work Package child/sub-item override: ignore/bypass only missing Work Package sub-item findings for this workstream, including mechanical "dod.wp.bulk_ready", manual "dod.wp.children_verified", and equivalent "WP has no linked children / child bulk-close evidence" findings.
- Do not ignore any other DoD criterion. Completion summary, Acceptance Criteria, Fixed In, dates, PR state, CI, landed-on-new-llm evidence, local validation, source-artifact verification, regression evidence, and cross-cutting sweep evidence still apply.
- If review.ts refuses "done" solely because of the approved missing-WP-child rule, you are authorized for ${id} in this workstream only to apply the equivalent close transition directly through sanctioned Cosmo/Notion update mechanics: Stage=Closed, Resolution=Done, Completed=today, date safety-net for Started/Resolved if needed, clear claim fields, and add a comment citing the approved new-llm Work Package child/sub-item override.`;
}

function promptFor(id: string) {
  return `Live Cosmo watcher trigger for ${id} — ${workstream.name} work item newly entered Stage=Reviewing. Execute the cosmo:review skill for real, not merely a mechanical check. Run from ${repo}. Follow repo AGENTS.md/RTK guidance and the cosmo:review skill exactly.${specialPolicyNotice(id)}

Gather evidence for the manual checklist: read the completion summary/page, identify Fixed In/PR, verify PR merged/CI green if applicable, map Acceptance Criteria to evidence, and verify the original symptom/source artifact as far as possible.

If DoD passes under the special policy above, apply disposition done. If evidence fails, apply rework with a precise note. If you cannot responsibly decide automatically, apply human with a precise note.

Do not edit code. Do not revert or overwrite unrelated edits. Return the disposition, evidence gathered, commands run, special-policy override applied if any, and any Cosmo mutation made.`;
}

function launchReview(id: string, key: string) {
  if (running.has(id)) {
    log(`skip ${id}: review already running pid=${running.get(id)}`);
    return;
  }
  if (lastLaunchKey.get(id) === key) {
    log(`skip ${id}: transition key already launched (${key})`);
    return;
  }
  lastLaunchKey.set(id, key);
  const suffix = stamp().replace(/[:.]/g, "-");
  const out = `${reviewDir}/${id}.${workstream.slug}.${suffix}.final.md`;
  const stdoutLog = `${reviewDir}/${id}.${workstream.slug}.${suffix}.stdout.log`;
  const stderrLog = `${reviewDir}/${id}.${workstream.slug}.${suffix}.stderr.log`;
  log(`trigger ${id}: launching codex review agent; key=${key}; special-policy=new-llm; final=${out}`);

  const proc = spawn(
    [
      "codex",
      "-a",
      "never",
      "exec",
      "--ephemeral",
      "-C",
      repo,
      "-s",
      "danger-full-access",
      "-c",
      "shell_environment_policy.inherit=\"all\"",
      "-o",
      out,
      "-",
    ],
    { cwd: repo, env: process.env, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );

  running.set(id, proc.pid ?? "unknown");
  proc.stdin.write(promptFor(id));
  proc.stdin.end();
  (async () => {
    for await (const chunk of proc.stdout) appendFileSync(stdoutLog, Buffer.from(chunk));
  })();
  (async () => {
    for await (const chunk of proc.stderr) appendFileSync(stderrLog, Buffer.from(chunk));
  })();
  proc.exited
    .then((code) => {
      running.delete(id);
      log(`review agent ${id} exited code=${code}; final=${out}`);
    })
    .catch((err) => {
      running.delete(id);
      log(`review agent ${id} failed: ${err?.message || err}`);
    });
}

async function poll() {
  pollNo += 1;
  const items = await fetchWorkstreamItems();
  const reviewing: string[] = [];
  for (const page of items) {
    const id = wiId(page);
    const nowStage = stage(page);
    const prevStage = previousStages.get(id);
    if (nowStage === "Reviewing") reviewing.push(id);
    if (initialised && nowStage === "Reviewing" && prevStage !== "Reviewing") {
      const key = `${prevStage || "<new>"}->Reviewing@${modified(page)}`;
      log(`transition ${id}: ${prevStage || "<new>"} -> Reviewing (${plainTitle(page.properties?.Name)})`);
      launchReview(id, key);
    }
    previousStages.set(id, nowStage);
  }

  const summary = `${items.length} items, Reviewing=${reviewing.join(", ") || "none"}`;
  if (!initialised) {
    initialised = true;
    log(`baseline [${summary}]; pollMs=${pollMs}; de-dupe=transition-key; special-policy=new-llm`);
  } else {
    log(`poll ${pollNo}: [${summary}]; running=${[...running.entries()].map(([id, pid]) => `${id}:${pid}`).join(", ") || "none"}`);
  }
}

log(`starting watcher (new-llm dedicated): ${workstream.name} (${workstream.id}), Stage trigger=Reviewing`);
while (true) {
  try {
    await poll();
  } catch (err: any) {
    log(`poll error: ${err?.message || err}`);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}
