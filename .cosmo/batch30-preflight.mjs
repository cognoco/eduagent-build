const token = process.env.NOTION_TOKEN;
if (!token) throw new Error('NOTION_TOKEN is not set');

const dataSourceId = '36fd1119-9955-4684-8bfe-deb145e6a21f';
const projectId = '3658bce91f7c81289f9bfa7fcf75a13b';
const stages = ['Captured', 'Triaging', 'Backlog', 'Refining'];
const frozenIds = [
  1893, 1906, 2036, 2112, 2176, 2177, 2178, 2179, 2182, 2183,
  2184, 2185, 2186, 2187, 2188, 2189, 2190, 2191, 2192, 2193,
  2194, 2196, 2197, 2215, 2216, 2238, 2239, 2240, 2241, 2242,
];
const useFrozenCohort = process.argv.includes('--frozen') || process.argv.includes('--comments');

const text = (prop) =>
  (prop?.rich_text ?? prop?.title ?? []).map((part) => part.plain_text ?? '').join('');
const select = (prop) => prop?.select?.name ?? null;
const relations = (prop) => (prop?.relation ?? []).map((entry) => entry.id.replaceAll('-', ''));

const rows = [];
let cursor;
do {
  const body = {
    page_size: 100,
    filter: {
      and: [
        { property: 'Project', relation: { contains: projectId } },
        useFrozenCohort
          ? {
              or: frozenIds.map((id) => ({
                property: 'ID',
                unique_id: { equals: id },
              })),
            }
          : {
              or: stages.map((stage) => ({
                property: 'Stage',
                select: { equals: stage },
              })),
            },
      ],
    },
  };
  if (cursor) body.start_cursor = cursor;
  const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  const page = await response.json();
  rows.push(...page.results);
  cursor = page.has_more ? page.next_cursor : undefined;
} while (cursor);

const normalized = rows.map((row) => {
  const p = row.properties;
  const uniqueId = p.ID?.unique_id;
  return {
    id: `${uniqueId?.prefix ?? 'WI'}-${uniqueId?.number ?? '?'}`,
    pageId: row.id.replaceAll('-', ''),
    url: row.url,
    name: text(p.Name),
    stage: select(p.Stage),
    state: select(p.State),
    type: select(p.Type),
    priority: select(p.Priority),
    altitude: select(p.Altitude),
    executionPath: select(p['Execution Path']),
    effort: select(p.Effort),
    reviewTier: select(p['Review Tier']),
    description: text(p.Description),
    acceptanceCriteria: text(p['Acceptance Criteria']),
    riskImpact: text(p['Risk/Impact']),
    foundIn: text(p['Found In']),
    notes: text(p.Notes),
    tags: (p.Tags?.multi_select ?? []).map((tag) => tag.name),
    workstream: relations(p.Workstream),
    parent: relations(p['Parent item']),
    blockedBy: relations(p['Blocked by']),
    claimedBy: text(p['Claimed By']),
    created: row.created_time,
    modified: row.last_edited_time,
  };
});

const stageRank = new Map(stages.map((stage, index) => [stage, index]));
const stateRank = new Map(['Active', 'Blocked', 'Awaiting Info', 'Parked', 'Stalled'].map((state, index) => [state, index]));
normalized.sort((a, b) =>
  (stageRank.get(a.stage) ?? 99) - (stageRank.get(b.stage) ?? 99) ||
  (stateRank.get(a.state) ?? 99) - (stateRank.get(b.state) ?? 99) ||
  a.created.localeCompare(b.created) ||
  Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]),
);

const counts = Object.fromEntries(stages.map((stage) => [stage, normalized.filter((row) => row.stage === stage).length]));
const cohort = useFrozenCohort
  ? frozenIds.map((id) => normalized.find((row) => row.id === `WI-${id}`)).filter(Boolean)
  : normalized.slice(0, 30);
const idsArg = process.argv.find((arg) => arg.startsWith('--ids='));
const selectedIds = idsArg
  ? new Set(idsArg.slice('--ids='.length).split(',').map((id) => id.trim()))
  : null;
const outputCohort = selectedIds
  ? cohort.filter((row) => selectedIds.has(row.id))
  : cohort;

async function fetchComments(pageId) {
  const comments = [];
  let startCursor;
  do {
    const url = new URL('https://api.notion.com/v1/comments');
    url.searchParams.set('block_id', pageId);
    url.searchParams.set('page_size', '100');
    if (startCursor) url.searchParams.set('start_cursor', startCursor);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2025-09-03',
      },
    });
    if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
    const page = await response.json();
    comments.push(...page.results.map((comment) => ({
      id: comment.id,
      createdBy: comment.created_by?.id ?? null,
      created: comment.created_time,
      text: (comment.rich_text ?? []).map((part) => part.plain_text ?? '').join(''),
    })));
    startCursor = page.has_more ? page.next_cursor : undefined;
  } while (startCursor);
  return comments;
}

if (process.argv.includes('--comments')) {
  const offsetArg = process.argv.find((arg) => arg.startsWith('--offset='));
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const offset = Number(offsetArg?.split('=')[1] ?? 0);
  const limit = Number(limitArg?.split('=')[1] ?? 10);
  const selected = outputCohort.slice(offset, offset + limit);
  const results = [];
  for (const row of selected) {
    results.push({
      id: row.id,
      name: row.name,
      stage: row.stage,
      state: row.state,
      modified: row.modified,
      comments: await fetchComments(row.pageId),
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  console.log(JSON.stringify({ pulledAt: new Date().toISOString(), results }, null, 2));
  process.exit(0);
}
if (process.argv.includes('--compact')) {
  console.log(JSON.stringify({
    pulledAt: new Date().toISOString(),
    counts,
    cohort: outputCohort.map(({ id, pageId, name, stage, state, type, priority, created, modified }) => ({
      id, pageId, name, stage, state, type, priority, created, modified,
    })),
  }, null, 2));
} else {
  console.log(JSON.stringify({ pulledAt: new Date().toISOString(), counts, cohort: outputCohort }, null, 2));
}
