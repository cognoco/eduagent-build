#!/usr/bin/env bun

import { appendFileSync, mkdirSync } from "node:fs";
import { spawn } from "bun";

const repo = "/Users/vetinari/nexus/_dev/eduagent-build";
const db = "f170be9e04ae45d4961828f2438666bd";
const reviewDir = "/tmp/cosmo-watch/reviews";
const logDir = "/tmp/cosmo-watch/logs";
const watcherLog = `${logDir}/cosmo-reviewing-watcher.log`;
const pollMs = Number(process.env.COSMO_WATCH_POLL_MS || 60000);
const token = process.env.NOTION_TOKEN;

if (!token) throw new Error("NOTION_TOKEN missing");

type Workstream = {
  name: string;
  slug: string;
  id: string;
  overrides: Map<string, string[]>;
};

const workstreams: Workstream[] = [
  {
    name: "Identity Foundation",
    slug: "identity-foundation",
    id: "37b8bce9-1f7c-81c2-bb42-cf7f47f839cc",
    overrides: new Map([
      ["WI-585", ["dod.wp.bulk_ready", "dod.wp.children_verified"]],
      ["WI-586", ["dod.wp.bulk_ready", "dod.wp.children_verified"]],
    ]),
  },
  {
    name: "L10n & A11y Mobile",
    slug: "l10n-a11y-mobile",
    id: "37c8bce9-1f7c-8169-8ce1-ddcf36b470c9",
    overrides: new Map(),
  },
  {
    name: "API Error Handling",
    slug: "api-error-handling",
    id: "37c8bce9-1f7c-817c-98ec-d1d4ba0a15e3",
    overrides: new Map(),
  },
  {
    name: "Inngest Security & Correctness",
    slug: "inngest-security-correctness",
    id: "37c8bce9-1f7c-81d7-9377-e79356055ff3",
    overrides: new Map(),
  },
  {
    name: "API Security & PII",
    slug: "security-pii-api",
    id: "37e8bce9-1f7c-8161-a3fc-c74c5300a88f",
    overrides: new Map(),
  },
  {
    name: "Architecture Clean-Out",
    slug: "architecture-clean-out",
    id: "37e8bce9-1f7c-81fe-be97-e063ce8f17e8",
    overrides: new Map(),
  },
];

mkdirSync(reviewDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

// All maps keyed by `${workstream.name}::${wiId}` so per-workstream state never collides.
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

async function fetchWorkstreamItems(ws: Workstream) {
  const results: any[] = [];
  let start_cursor: string | undefined;
  do {
    const body = {
      page_size: 100,
      filter: { property: "Workstream", relation: { contains: ws.id } },
      sorts: [{ property: "ID", direction: "ascending" }],
      ...(start_cursor ? { start_cursor } : {}),
    };
    const page = await notion(`/databases/${db}/query`, "POST", body);
    results.push(...(page.results || []));
    start_cursor = page.has_more ? page.next_cursor : undefined;
  } while (start_cursor);
  return results;
}

function overrideNotice(ws: Workstream, id: string) {
  if (!ws.overrides.has(id)) return "";
  return `

Operator-authorized experimental DoD override for ${id} only:
- Context: Harness Hygiene PR #832 has just landed, and this live dogfooding pass intentionally includes Work Package altitude items without item-level altitude sub-items.
- Scope: ignore/bypass only the WP child/sub-item criteria caused by this setup: mechanical rule "dod.wp.bulk_ready" ("Work Package has no linked children to bulk-close") and manual checklist rule "dod.wp.children_verified".
- Do not ignore any other mechanical gap or evidence gap. Completion summary, Fixed In, dates, Acceptance Criteria, PR/CI/landed evidence, local validation, source-artifact verification, and regression evidence still apply.
- If all other DoD evidence passes and the only remaining blocker is the no-child WP criterion, do not bounce to rework for that criterion. Record in the review result and Cosmo comment that this was the operator-approved Harness Hygiene dogfooding override for ${id}.
- If review.ts refuses "done" solely because of "dod.wp.bulk_ready", you are authorized for ${id} only to apply the equivalent close transition directly through the sanctioned Cosmo/Notion update path: Stage=Closed, Resolution=Done, Completed=today, Started/Resolved safety-net if needed, clear claim properties, and add a comment citing this override. Do not use this direct close path for any other rule or work item.`;
}

function promptFor(ws: Workstream, id: string) {
  return `Live Cosmo watcher trigger for ${id} — ${ws.name} work item newly entered Stage=Reviewing. Execute the cosmo:review skill for real, not merely a mechanical check. Run from ${repo}. Follow repo AGENTS.md/RTK guidance and the cosmo:review skill exactly.${overrideNotice(ws, id)}

Gather evidence for the manual checklist: read the completion summary/page, identify Fixed In/PR, verify PR merged/CI green if applicable, map Acceptance Criteria to evidence, and verify the original symptom/source artifact as far as possible.

If DoD passes with evidence, apply disposition done. If evidence fails, apply rework with a precise note. If you cannot responsibly decide automatically, apply human with a precise note.

Do not edit code. Do not revert or overwrite unrelated edits. Return the disposition, evidence gathered, commands run, any override applied, and any Cosmo mutation made.`;
}

function launchReview(ws: Workstream, id: string, key: string) {
  const mapKey = `${ws.name}::${id}`;
  if (running.has(mapKey)) {
    log(`skip [${ws.name}] ${id}: review already running pid=${running.get(mapKey)}`);
    return;
  }
  if (lastLaunchKey.get(mapKey) === key) {
    log(`skip [${ws.name}] ${id}: transition key already launched (${key})`);
    return;
  }
  lastLaunchKey.set(mapKey, key);
  const suffix = stamp().replace(/[:.]/g, "-");
  const out = `${reviewDir}/${id}.${ws.slug}.${suffix}.final.md`;
  const stdoutLog = `${reviewDir}/${id}.${ws.slug}.${suffix}.stdout.log`;
  const stderrLog = `${reviewDir}/${id}.${ws.slug}.${suffix}.stderr.log`;
  log(`trigger [${ws.name}] ${id}: launching codex review agent; key=${key}; override=${ws.overrides.has(id) ? ws.overrides.get(id)!.join(",") : "none"}; final=${out}`);

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

  running.set(mapKey, proc.pid ?? "unknown");
  proc.stdin.write(promptFor(ws, id));
  proc.stdin.end();
  (async () => {
    for await (const chunk of proc.stdout) appendFileSync(stdoutLog, Buffer.from(chunk));
  })();
  (async () => {
    for await (const chunk of proc.stderr) appendFileSync(stderrLog, Buffer.from(chunk));
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
      if (nowStage === "Reviewing") reviewing.push(id);
      if (initialised && nowStage === "Reviewing" && prevStage !== "Reviewing") {
        const key = `${prevStage || "<new>"}->Reviewing@${modified(page)}`;
        log(`transition [${ws.name}] ${id}: ${prevStage || "<new>"} -> Reviewing (${plainTitle(page.properties?.Name)})`);
        launchReview(ws, id, key);
      }
      previousStages.set(mapKey, nowStage);
    }
    summaries.push(`${ws.name}: ${items.length} items, Reviewing=${reviewing.join(", ") || "none"}`);
  }

  if (!initialised) {
    initialised = true;
    log(
      `baseline [${summaries.join(" | ")}]; pollMs=${pollMs}; de-dupe=transition-key; overrides=${workstreams
        .flatMap((ws) => [...ws.overrides.entries()].map(([id, rules]) => `${id}:${rules.join(",")}`))
        .join("; ") || "none"}`,
    );
  } else {
    log(
      `poll ${pollNo}: [${summaries.join(" | ")}]; running=${[...running.entries()].map(([k, pid]) => `${k}:${pid}`).join(", ") || "none"}`,
    );
  }
}

log(
  `starting watcher v3 (multi-workstream): ${workstreams.map((ws) => `${ws.name} (${ws.id})`).join(" + ")}, Stage trigger=Reviewing`,
);
while (true) {
  try {
    await poll();
  } catch (err: any) {
    log(`poll error: ${err?.message || err}`);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}
