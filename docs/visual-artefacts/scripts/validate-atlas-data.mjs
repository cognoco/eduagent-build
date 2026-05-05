import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const atlasRoot = resolve(__dirname, '..');
const dataPath = join(atlasRoot, 'data', 'atlas-data.js');

const allowedStatuses = new Set(['Current', 'Dormant', 'Deferred', 'Future']);
const requiredBoardIds = [
  'product-narrative',
  'capability-map',
  'journey-flow',
  'system-architecture',
  'cloud-service-map',
  'data-lifecycle',
  'ai-orchestration',
  'async-reliability',
  'delivery-quality',
];
const serviceCategories = new Set([
  'runtime',
  'data',
  'auth',
  'async',
  'observability',
  'billing',
  'messaging',
  'delivery',
  'ai',
  'secrets',
]);

function fail(message) {
  throw new Error(message);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
}

function assertStatus(value, label) {
  if (!allowedStatuses.has(value)) {
    fail(`${label} has invalid status "${value}"`);
  }
}

async function loadAtlasData() {
  if (!existsSync(dataPath)) {
    fail(`Missing atlas data file: ${dataPath}`);
  }

  await import(`${pathToFileURL(dataPath).href}?validation=${Date.now()}`);
  const data = globalThis.MENTOMATE_ATLAS_DATA;
  if (!data || typeof data !== 'object') {
    fail('atlas-data.js must assign globalThis.MENTOMATE_ATLAS_DATA');
  }
  return data;
}

function validateBoards(data) {
  const boards = assertArray(data.boards, 'boards');
  if (boards.length !== 9) fail(`expected 9 boards, found ${boards.length}`);

  const boardIds = new Set();
  for (const board of boards) {
    assertNonEmptyString(board.id, 'board.id');
    assertNonEmptyString(board.title, `board ${board.id}.title`);
    assertNonEmptyString(board.purpose, `board ${board.id}.purpose`);
    if (!Number.isInteger(board.number)) {
      fail(`board ${board.id}.number must be an integer`);
    }
    if (boardIds.has(board.id)) fail(`duplicate board id: ${board.id}`);
    boardIds.add(board.id);

    const lanes = assertArray(board.lanes, `board ${board.id}.lanes`);
    if (lanes.length < 3) fail(`board ${board.id} must have at least 3 lanes`);
    for (const lane of lanes) {
      assertNonEmptyString(lane.id, `board ${board.id}.lane.id`);
      assertNonEmptyString(lane.title, `board ${board.id}.lane.title`);
      assertNonEmptyString(lane.description, `board ${board.id}.lane ${lane.id}.description`);
      assertArray(lane.nodeIds, `board ${board.id}.lane ${lane.id}.nodeIds`);
      if (lane.nodeIds.length === 0) {
        fail(`board ${board.id}.lane ${lane.id} must reference nodes`);
      }
    }

    assertArray(board.decisionNotes, `board ${board.id}.decisionNotes`);

    const sourceRefs = assertArray(
      board.sourceRefs,
      `board ${board.id}.sourceRefs`
    );
    if (sourceRefs.length === 0) {
      fail(`board ${board.id} must include sourceRefs`);
    }
  }

  for (const requiredId of requiredBoardIds) {
    if (!boardIds.has(requiredId)) fail(`missing required board: ${requiredId}`);
  }

  return { boards, boardIds };
}

function validateNodes(data, boardIds) {
  const nodes = assertArray(data.nodes, 'nodes');
  if (nodes.length < 45) {
    fail(`expected at least 45 nodes for dense atlas, found ${nodes.length}`);
  }

  const nodeIds = new Set();
  for (const node of nodes) {
    assertNonEmptyString(node.id, 'node.id');
    assertNonEmptyString(node.name, `node ${node.id}.name`);
    assertNonEmptyString(node.category, `node ${node.id}.category`);
    assertNonEmptyString(node.role, `node ${node.id}.role`);
    assertStatus(node.status, `node ${node.id}`);
    if (nodeIds.has(node.id)) fail(`duplicate node id: ${node.id}`);
    nodeIds.add(node.id);

    const relatedBoards = assertArray(
      node.relatedBoards,
      `node ${node.id}.relatedBoards`
    );
    if (relatedBoards.length === 0) {
      fail(`node ${node.id} must be attached to at least one board`);
    }
    for (const boardId of relatedBoards) {
      if (!boardIds.has(boardId)) {
        fail(`node ${node.id} references unknown board ${boardId}`);
      }
    }

    if (serviceCategories.has(node.category)) {
      const repoPaths = assertArray(node.repoPaths, `node ${node.id}.repoPaths`);
      const risks = assertArray(node.risks, `node ${node.id}.risks`);
      if (repoPaths.length === 0) {
        fail(`service node ${node.id} must include at least one repo path`);
      }
      if (risks.length === 0) {
        fail(`service node ${node.id} must include at least one risk note`);
      }
    }
  }

  return { nodes, nodeIds };
}

function validateLaneReferences(boards, nodeIds) {
  for (const board of boards) {
    for (const lane of board.lanes) {
      for (const nodeId of lane.nodeIds) {
        if (!nodeIds.has(nodeId)) {
          fail(
            `board ${board.id}.lane ${lane.id} references unknown node ${nodeId}`
          );
        }
      }
    }
  }
}

function validateLinks(data, boardIds, nodeIds) {
  const links = assertArray(data.links, 'links');
  if (links.length < 30) {
    fail(`expected at least 30 links for dense atlas, found ${links.length}`);
  }

  for (const link of links) {
    assertNonEmptyString(link.from, 'link.from');
    assertNonEmptyString(link.to, 'link.to');
    assertNonEmptyString(link.type, 'link.type');
    if (!nodeIds.has(link.from)) fail(`link references unknown from ${link.from}`);
    if (!nodeIds.has(link.to)) fail(`link references unknown to ${link.to}`);
    const linkBoards = assertArray(link.boards, `link ${link.from}->${link.to}.boards`);
    if (linkBoards.length === 0) {
      fail(`link ${link.from}->${link.to} must reference at least one board`);
    }
    for (const boardId of linkBoards) {
      if (!boardIds.has(boardId)) {
        fail(`link ${link.from}->${link.to} references unknown board ${boardId}`);
      }
    }
  }
}

function validateLegends(data) {
  const legends = assertArray(data.legends, 'legends');
  if (legends.length < 8) fail('legends must include at least 8 categories');
  for (const legend of legends) {
    assertNonEmptyString(legend.id, 'legend.id');
    assertNonEmptyString(legend.label, `legend ${legend.id}.label`);
    assertNonEmptyString(legend.color, `legend ${legend.id}.color`);
  }
}

function validateStatuses(data) {
  const statuses = assertArray(data.statuses, 'statuses');
  if (statuses.length === 0) fail('statuses must include at least one entry');
  for (const status of statuses) {
    assertNonEmptyString(status.label, 'status.label');
  }
}

function validateShellFiles() {
  const htmlPath = join(atlasRoot, 'atlas.html');
  if (!existsSync(htmlPath)) fail(`Missing atlas shell: ${htmlPath}`);

  const html = readFileSync(htmlPath, 'utf8');
  const requiredSnippets = [
    'assets/atlas.css',
    'data/atlas-data.js',
    'assets/atlas.js',
    'id="atlas-app"',
    'id="board-stage"',
    'id="node-drawer"',
    'id="index-panel"',
    'id="atlas-toast"',
    'data-action="previous"',
    'data-action="next"',
    'data-action="export"',
  ];
  for (const snippet of requiredSnippets) {
    if (!html.includes(snippet)) {
      fail(`atlas.html must include ${snippet}`);
    }
  }

  for (const relativePath of ['assets/atlas.css', 'assets/atlas.js']) {
    const target = join(atlasRoot, ...relativePath.split('/'));
    if (!existsSync(target)) fail(`Missing atlas asset: ${target}`);
  }
}

function validateExportPath() {
  const exportScript = join(atlasRoot, 'scripts', 'export-png.mjs');
  if (!existsSync(exportScript)) fail(`Missing PNG export script: ${exportScript}`);

  for (const relativePath of ['exports/png', 'exports/pptx']) {
    const target = join(atlasRoot, ...relativePath.split('/'));
    if (!existsSync(target)) fail(`Missing export directory: ${target}`);
  }
}

async function main() {
  const data = await loadAtlasData();
  const { boards, boardIds } = validateBoards(data);
  const { nodes, nodeIds } = validateNodes(data, boardIds);
  validateLaneReferences(boards, nodeIds);
  validateLinks(data, boardIds, nodeIds);
  validateLegends(data);
  validateStatuses(data);
  validateShellFiles();
  validateExportPath();

  console.log(
    `Atlas data valid: ${boards.length} boards, ${nodes.length} nodes, ${data.links.length} links.`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
