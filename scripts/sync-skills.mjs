#!/usr/bin/env node
// scripts/sync-skills.mjs — mirror .agents/skills/ → .claude/skills/
//
// Master:    .agents/skills/<name>/        (canonical; may include agents/ adapter dir)
// Generated: .claude/skills/<name>/        (excludes agents/ subdir — Codex-specific)
//
// Semantics: ADDITIVE sync. We copy/update files from .agents/ to .claude/,
// but we NEVER delete content from .claude/ that lacks a master. This keeps
// Claude-only skills (e.g. .claude/skills/my/, .claude/skills/archon/) safe
// and lets cross-runtime skills coexist with Claude-only extras.
//
// Trade-off: stale files in .claude/skills/<name>/ accumulate if you remove
// them from .agents/skills/<name>/. Periodic manual cleanup is fine; the
// alternative (auto-delete) destroys Claude-only content.
//
// Why: Claude Code and Codex look for project-level skills in different
// directories. Master in .agents/ because it's runtime-neutral; .claude/ is
// derived. Symlinks are unreliable on Windows (require Developer Mode +
// core.symlinks=true), so we generate copies via this Node script.
//
// Modes:
//   sync-skills.mjs           — apply sync (default)
//   sync-skills.mjs --check   — exit 1 if .agents/ content is missing from .claude/

import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SOURCE_ROOT = join(REPO_ROOT, '.agents', 'skills');
const TARGET_ROOT = join(REPO_ROOT, '.claude', 'skills');

// Subdirectories within each skill that are Codex-specific and should NOT
// be mirrored into .claude/skills/. The `agents/` dir holds platform adapter
// files (e.g. openai.yaml) that Claude Code does not consume.
const SKIP_DIRS = new Set(['agents']);

// Skills excluded from sync — their .claude/ and .agents/ versions are
// allowed to diverge. Add a comment explaining why each is here. When the
// content can be unified, remove from this set and run sync; the .agents/
// master will then propagate.
const SKIP_SKILLS = new Set([
  // .claude/skills/commit/SKILL.md has Claude Code-specific harness
  // directives (context: fork, agent, model, allowed-tools) and a richer
  // ruleset (~278 lines vs ~70 in .agents/). Unifying requires migrating
  // the Claude-specific content into the master and deciding which parts
  // are runtime-neutral vs Claude-specific. Deferred to a follow-up.
  'commit',
]);

const mode = process.argv.includes('--check') ? 'check' : 'sync';

/** Recursively list files under `dir`, returning paths relative to `dir`. Skips SKIP_DIRS at any depth. */
async function listFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await listFiles(join(dir, entry.name), base)));
    } else if (entry.isFile()) {
      files.push(relative(base, join(dir, entry.name)));
    }
  }
  return files.sort();
}

async function listSkills() {
  if (!existsSync(SOURCE_ROOT)) return [];
  const entries = await readdir(SOURCE_ROOT, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

const drift = [];
const stats = { created: 0, updated: 0, identical: 0, removed: 0 };

async function syncSkill(name) {
  const sourceDir = join(SOURCE_ROOT, name);
  const targetDir = join(TARGET_ROOT, name);
  const sourceFiles = await listFiles(sourceDir);

  // Additive: copy/update each source file. Do NOT touch target files that
  // are not in source — those are Claude-only extras (e.g. additional refs
  // that haven't been promoted to the master) and must be preserved.
  for (const rel of sourceFiles) {
    const src = join(sourceDir, rel);
    const dst = join(targetDir, rel);
    const source = await readFile(src, 'utf8');
    const target = await readIfExists(dst);
    if (target === null) {
      drift.push(`${name}/${rel} (missing in .claude/)`);
      stats.created++;
      if (mode === 'sync') {
        await mkdir(dirname(dst), { recursive: true });
        await writeFile(dst, source);
      }
    } else if (target !== source) {
      drift.push(`${name}/${rel} (content differs)`);
      stats.updated++;
      if (mode === 'sync') await writeFile(dst, source);
    } else {
      stats.identical++;
    }
  }
}

async function main() {
  const skills = (await listSkills()).filter((name) => !SKIP_SKILLS.has(name));
  for (const name of skills) await syncSkill(name);

  // Note: we do NOT sweep stale skill directories or stale files in .claude/.
  // See the header comment — additive semantics preserve Claude-only content
  // (.claude/skills/my/, .claude/skills/archon/, and supplementary files in
  // shared-name skills like .claude/skills/commit/references/).

  if (mode === 'check') {
    if (drift.length > 0) {
      console.error('sync-skills: .claude/skills/ is missing content from .agents/skills/');
      for (const d of drift) console.error(`  ${d}`);
      console.error('\nRun: pnpm sync-skills');
      process.exit(1);
    }
    console.log(`sync-skills: ok (${stats.identical} files in sync)`);
  } else {
    const changed = stats.created + stats.updated;
    if (changed === 0) {
      console.log(`sync-skills: nothing to do (${stats.identical} files already in sync)`);
    } else {
      console.log(
        `sync-skills: ${stats.created} created, ${stats.updated} updated, ${stats.identical} unchanged`,
      );
    }
  }
}

main().catch((err) => {
  console.error('sync-skills: error', err);
  process.exit(1);
});
