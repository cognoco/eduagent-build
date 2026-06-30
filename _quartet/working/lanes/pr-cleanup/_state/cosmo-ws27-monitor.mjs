#!/usr/bin/env node
// WS-27 Cosmo Stage monitor — polls ZDX Work Items DB filtered to Workstream=WS-27,
// emits one stdout line per Stage change (or new item). Used by the Monitor tool.
// `node cosmo-ws18-monitor.mjs once` → single poll dump (test mode), then exit.
const TOKEN = process.env.NOTION_TOKEN;
const DB = 'f170be9e-04ae-45d4-9618-28f2438666bd'; // ZDX Work Items DB
const WS27 = '38e8bce9-1f7c-80c7-b212-c6a1d258966b'; // WS-27 page
const ONCE = process.argv[2] === 'once';
const SLEEP_MS = 75000;

if (!TOKEN) { console.error('NOTION_TOKEN unset'); process.exit(1); }

function findWiId(props) {
  // The "ID" property may be unique_id / formula / rich_text — scan for WI-<n>.
  const blob = JSON.stringify(props);
  const m = blob.match(/WI-\d+/);
  return m ? m[0] : null;
}
function stageOf(props) {
  const s = props?.Stage;
  if (!s) return null;
  return s.status?.name ?? s.select?.name ?? null;
}

async function poll() {
  const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: { property: 'Workstream', relation: { contains: WS27 } },
      page_size: 100,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const map = new Map();
  for (const pg of data.results ?? []) {
    const wi = findWiId(pg.properties);
    const st = stageOf(pg.properties);
    if (wi) map.set(wi, st);
  }
  return map;
}

function ts() { return new Date().toISOString().replace(/\.\d+Z$/, 'Z'); }

if (ONCE) {
  poll().then((m) => {
    const rows = [...m.entries()].sort();
    console.log(`WS-27 poll OK — ${rows.length} items`);
    for (const [wi, st] of rows) console.log(`  ${wi}=${st}`);
    process.exit(0);
  }).catch((e) => { console.error('poll failed:', e.message); process.exit(1); });
} else {
  let prev = null;
  const loop = async () => {
    try {
      const cur = await poll();
      if (prev) {
        for (const [wi, st] of cur) {
          if (!prev.has(wi)) console.log(`[${ts()}] WS-27 NEW -> ${wi}=${st}`);
          else if (prev.get(wi) !== st) console.log(`[${ts()}] WS-27 Stage change -> ${wi}: ${prev.get(wi)} => ${st}`);
        }
      }
      prev = cur;
    } catch (e) {
      // transient — log to stderr (not an event), keep polling
      console.error(`[${ts()}] poll error: ${e.message}`);
    }
    setTimeout(loop, SLEEP_MS);
  };
  loop();
}
