#!/usr/bin/env node
// scripts/sync-agent-docs.mjs — mirror AGENTS.md → CLAUDE.md
//
// Master:    AGENTS.md  (canonical; edited by hand)
// Generated: CLAUDE.md  (H1 title swap + generated-file header)
//
// Why: Claude Code reads CLAUDE.md by convention; the rest of the agent
// ecosystem (Codex, Copilot, Aider, etc.) standardizes on AGENTS.md. Keeping
// them in sync by hand caused drift. Master in AGENTS.md because it's the
// broader convention.
//
// In-band conditional content: when a rule applies to one runtime only, label
// it in the master document (e.g. "**For Claude Code only:** ..."). Do NOT
// add CLAUDE-specific sections that AGENTS.md lacks — both files must be
// byte-identical apart from the H1 title and the generated-file header.
//
// Modes:
//   sync-agent-docs.mjs           — apply sync (default)
//   sync-agent-docs.mjs --check   — exit 1 if CLAUDE.md does not match expected output

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SOURCE = join(REPO_ROOT, 'AGENTS.md');
const TARGET = join(REPO_ROOT, 'CLAUDE.md');

const GENERATED_HEADER = `<!--
  This file is generated from AGENTS.md by scripts/sync-agent-docs.mjs.
  Edit AGENTS.md, then run \`pnpm sync-agent-docs\` (or rely on the
  pre-commit hook). Direct edits to this file will be overwritten.
-->

`;

function generateClaudeMd(agentsContent) {
  // Swap the first H1 line. AGENTS.md uses "# MentoMate" (product-facing);
  // CLAUDE.md historically uses "# CLAUDE" so Claude Code recognises it as
  // the agent instruction document at a glance.
  const swapped = agentsContent.replace(/^# .+$/m, '# CLAUDE');
  return GENERATED_HEADER + swapped;
}

async function main() {
  const agents = await readFile(SOURCE, 'utf8');
  const expected = generateClaudeMd(agents);

  if (process.argv.includes('--check')) {
    let current;
    try {
      current = await readFile(TARGET, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.error('sync-agent-docs: CLAUDE.md does not exist. Run: pnpm sync-agent-docs');
        process.exit(1);
      }
      throw err;
    }
    if (current !== expected) {
      console.error('sync-agent-docs: CLAUDE.md is out of sync with AGENTS.md.');
      console.error('Run: pnpm sync-agent-docs');
      process.exit(1);
    }
    console.log('sync-agent-docs: ok (CLAUDE.md matches AGENTS.md)');
  } else {
    await writeFile(TARGET, expected);
    console.log('sync-agent-docs: CLAUDE.md regenerated from AGENTS.md');
  }
}

main().catch((err) => {
  console.error('sync-agent-docs: error', err);
  process.exit(1);
});
