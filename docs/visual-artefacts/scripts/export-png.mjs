import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const atlasRoot = resolve(__dirname, '..');
const dataPath = join(atlasRoot, 'data', 'atlas-data.js');
const htmlPath = join(atlasRoot, 'atlas.html');
const outputDir = join(atlasRoot, 'exports', 'png');

function printHelp() {
  console.log(`Mentomate atlas PNG exporter

Usage:
  node docs/visual-artefacts/scripts/export-png.mjs
  node docs/visual-artefacts/scripts/export-png.mjs --board ai-orchestration
  node docs/visual-artefacts/scripts/export-png.mjs --out docs/visual-artefacts/exports/png

Options:
  --board <id>   Export only one board id.
  --out <dir>    Override output directory.
  --help         Print this help text.
`);
}

function parseArgs(argv) {
  const args = { board: null, out: outputDir, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--board') {
      args.board = argv[index + 1];
      index += 1;
    } else if (arg === '--out') {
      args.out = resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function outputName(board) {
  const padded = String(board.number).padStart(2, '0');
  return `${padded}-${board.id}.png`;
}

async function loadData() {
  await import(`${pathToFileURL(dataPath).href}?export=${Date.now()}`);
  const data = globalThis.MENTOMATE_ATLAS_DATA;
  if (!data?.boards) {
    throw new Error('Could not load atlas data.');
  }
  return data;
}

async function exportBoards({ boards, out }) {
  const { chromium } = await import('@playwright/test');
  mkdirSync(out, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
      deviceScaleFactor: 2,
    });

    for (const board of boards) {
      const url = `${pathToFileURL(htmlPath).href}?board=${encodeURIComponent(
        board.id
      )}&export=1`;
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => globalThis.MENTOMATE_ATLAS_READY === true);
      const stage = page.locator('#board-stage');
      const filePath = join(out, outputName(board));
      await stage.screenshot({ path: filePath });
      console.log(`Exported ${filePath}`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const data = await loadData();
  let boards = data.boards;
  if (args.board) {
    boards = boards.filter((board) => board.id === args.board);
    if (boards.length === 0) {
      throw new Error(`Unknown board id: ${args.board}`);
    }
  }

  await exportBoards({ boards, out: args.out });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
