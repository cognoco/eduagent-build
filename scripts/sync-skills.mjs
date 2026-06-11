#!/usr/bin/env node
// scripts/sync-skills.mjs — mirror .agents/skills/ → .claude/skills/
//
// Master:    .agents/skills/<name>/        (canonical; may include agents/ adapter dir)
// Generated: .claude/skills/<name>/        (excludes agents/ subdir — Codex-specific)
//
// Group dirs (GROUP_DIRS, e.g. tech/): an exception to the 1:1 mirror. Each
// child <c> of a group dir <g> flattens to .claude/skills/<g>-<c>/. The master
// stays nested (.agents/skills/<g>/<c>/) so Codex — which discovers skills at any
// nesting depth — reads it directly; the generated Claude copy is flat with a
// "<g>-" prefix because Claude Code does not reliably discover skills nested two
// levels deep under .claude/skills/. A group dir is a pure container: a SKILL.md
// placed directly at .agents/skills/<g>/SKILL.md is ignored (only subdirs sync).
//
// Semantics: ADDITIVE sync. We copy/update files from .agents/ to .claude/,
// but we NEVER delete content from .claude/ that lacks a master. This keeps
// Claude-only skills (e.g. .claude/skills/my/, .claude/skills/archon/) safe
// and lets cross-runtime skills coexist with Claude-only extras.
//
// Frontmatter injection (Claude adapter): a skill keeps a runtime-neutral
// SKILL.md in .agents/ (frontmatter = name + description only). To add the
// Claude-Code harness directives (context: fork, agent, model, allowed-tools)
// without polluting the master, drop a `agents/claude.yaml` adapter next to the
// existing Codex `agents/openai.yaml`. When syncing SKILL.md, sync merges that
// adapter's keys ON TOP of the master frontmatter (adapter wins) and writes the
// merged result to .claude/skills/<name>/SKILL.md; the body is preserved
// verbatim. The `agents/` dir itself is never copied (SKIP_DIRS) — the adapter
// is consumed, not mirrored. Skills with no claude.yaml are copied byte-exact
// as before, so this is dormant until a skill opts in. This is the mechanism
// that lets the `commit` skill (currently in SKIP_SKILLS) be unified onto one
// master once its body is reconciled.
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
//   sync-skills.mjs                  — apply sync (default); status to stdout
//   sync-skills.mjs --check          — exit 1 if .agents/ content is missing from .claude/
//   sync-skills.mjs --print-changed  — apply sync; emit ONLY repo-relative paths of
//                                      files this run created/updated to stdout, one
//                                      per line. Status messages go to stderr. For
//                                      the pre-commit hook to stage exactly the
//                                      files sync touched (not other working-tree
//                                      edits in .claude/skills/, e.g. manual edits
//                                      to the commit skill which is excluded from
//                                      sync via SKIP_SKILLS).

import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
// Roots are overridable via env so the test harness can point sync at a temp
// fixture tree (running from the real repo root keeps node_modules resolvable).
const SOURCE_ROOT = process.env.SYNC_SKILLS_SOURCE_ROOT || join(REPO_ROOT, '.agents', 'skills');
const TARGET_ROOT = process.env.SYNC_SKILLS_TARGET_ROOT || join(REPO_ROOT, '.claude', 'skills');

// Subdirectories within each skill that are Codex-specific and should NOT
// be mirrored into .claude/skills/. The `agents/` dir holds platform adapter
// files (e.g. openai.yaml) that Claude Code does not consume.
const SKIP_DIRS = new Set(['agents']);

// Group directories: their immediate children are FLATTENED into prefixed
// targets. A child <c> of group <g> at .agents/skills/<g>/<c>/ syncs to
// .claude/skills/<g>-<c>/. See the header comment for the rationale (Codex
// reads nested masters; Claude Code needs flat, one-level-deep dirs).
const GROUP_DIRS = new Set(['tech']);

// Skills excluded from sync — their .claude/ and .agents/ versions are
// allowed to diverge. Add a comment explaining why each is here. When the
// content can be unified, remove from this set and run sync; the .agents/
// master will then propagate.
const SKIP_SKILLS = new Set([
  // (empty) — `commit` was unified onto one master in WI-388: the
  // runtime-neutral body lives in .agents/skills/commit/SKILL.md and the
  // Claude harness frontmatter is injected from agents/claude.yaml by the
  // frontmatter-merge above. Add a skill here only when its .claude/ and
  // .agents/ copies must intentionally diverge — with a comment saying why.
]);

const mode = process.argv.includes('--check') ? 'check' : 'sync';
const printChanged = process.argv.includes('--print-changed');

// In --print-changed mode, status messages go to stderr so stdout is parseable.
const info = printChanged
  ? (...args) => console.error(...args)
  : (...args) => console.log(...args);

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

/**
 * Enumerate sync units. Each unit maps a source skill dir (relative to
 * SOURCE_ROOT) to a target dir name under TARGET_ROOT.
 *   - normal skill "foo"     -> { sourceRel: 'foo',        targetName: 'foo' }
 *   - group child tech/bar   -> { sourceRel: 'tech/bar',   targetName: 'tech-bar' }
 */
async function listUnits() {
  if (!existsSync(SOURCE_ROOT)) return [];
  const top = (await readdir(SOURCE_ROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  const units = [];
  for (const name of top) {
    if (GROUP_DIRS.has(name)) {
      const children = (await readdir(join(SOURCE_ROOT, name), { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      for (const child of children) {
        units.push({ sourceRel: `${name}/${child}`, targetName: `${name}-${child}` });
      }
    } else {
      units.push({ sourceRel: name, targetName: name });
    }
  }
  return units;
}

// Returns a Buffer (not a string). Reading without an encoding keeps binary
// files (e.g. PNG images shipped in a skill's references/) byte-exact — a utf8
// round-trip silently corrupts any non-text bytes.
async function readIfExists(path) {
  try {
    return await readFile(path);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Matches a leading YAML frontmatter block: captures (1) the frontmatter body
// between the opening and closing `---` fences, (2) everything after.
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/**
 * Merge a Claude frontmatter adapter into a runtime-neutral SKILL.md.
 *
 * The master body is preserved verbatim; the master frontmatter (name,
 * description, …) is the base and the adapter's keys are layered on top
 * (adapter wins), so the `.agents/` master stays runtime-neutral while the
 * emitted `.claude/` copy gains the harness directives. Returns merged text.
 *
 * @param {string} skillMd    raw master SKILL.md text
 * @param {string} adapterYaml raw `agents/claude.yaml` text (a YAML mapping)
 * @returns {string} merged SKILL.md text for the .claude/ side
 */
function mergeClaudeFrontmatter(skillMd, adapterYaml) {
  const adapter = parseYaml(adapterYaml) ?? {};
  if (typeof adapter !== 'object' || Array.isArray(adapter)) {
    throw new Error('agents/claude.yaml adapter must be a YAML mapping');
  }
  const match = skillMd.match(FRONTMATTER_RE);
  // No frontmatter in the master → the adapter becomes the frontmatter.
  if (!match) {
    return `---\n${stringifyYaml(adapter).trimEnd()}\n---\n${skillMd}`;
  }
  const base = parseYaml(match[1]) ?? {};
  const body = match[2];
  // Spread order keeps base keys (name, description) in their original slots
  // even when the adapter overrides them, then appends adapter-only keys.
  const merged = { ...base, ...adapter };
  return `---\n${stringifyYaml(merged).trimEnd()}\n---\n${body}`;
}

const drift = [];
const stats = { created: 0, updated: 0, identical: 0, removed: 0 };
// Repo-relative paths of files this run created or updated. Used by
// --print-changed so the pre-commit hook can stage exactly the files sync
// touched, instead of staging every modified file under .claude/skills/.
const changedPaths = [];

async function syncSkill({ sourceRel, targetName }) {
  const sourceDir = join(SOURCE_ROOT, sourceRel);
  const targetDir = join(TARGET_ROOT, targetName);
  const sourceFiles = await listFiles(sourceDir);

  // Optional Claude frontmatter adapter (lives in the skipped `agents/` dir, so
  // it is consumed here rather than mirrored). When present, its keys are
  // merged into the emitted SKILL.md frontmatter.
  const adapter = await readIfExists(join(sourceDir, 'agents', 'claude.yaml'));

  // Additive: copy/update each source file. Do NOT touch target files that
  // are not in source — those are Claude-only extras (e.g. additional refs
  // that haven't been promoted to the master) and must be preserved.
  for (const rel of sourceFiles) {
    const src = join(sourceDir, rel);
    const dst = join(targetDir, rel);
    // Read as Buffer (no encoding) and compare with Buffer.equals so binary
    // assets sync byte-for-byte; writeFile(dst, Buffer) preserves them exactly.
    let source = await readFile(src);
    // Inject the Claude harness frontmatter into the skill's top-level SKILL.md.
    if (rel === 'SKILL.md' && adapter) {
      source = Buffer.from(
        mergeClaudeFrontmatter(source.toString('utf8'), adapter.toString('utf8')),
        'utf8',
      );
    }
    const target = await readIfExists(dst);
    if (target === null) {
      drift.push(`${targetName}/${rel} (missing in .claude/)`);
      stats.created++;
      if (mode === 'sync') {
        await mkdir(dirname(dst), { recursive: true });
        await writeFile(dst, source);
        changedPaths.push(relative(REPO_ROOT, dst));
      }
    } else if (!source.equals(target)) {
      drift.push(`${targetName}/${rel} (content differs)`);
      stats.updated++;
      if (mode === 'sync') {
        await writeFile(dst, source);
        changedPaths.push(relative(REPO_ROOT, dst));
      }
    } else {
      stats.identical++;
    }
  }
}

async function main() {
  const units = (await listUnits()).filter((u) => !SKIP_SKILLS.has(u.targetName));
  for (const unit of units) await syncSkill(unit);

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
    info(`sync-skills: ok (${stats.identical} files in sync)`);
  } else {
    const changed = stats.created + stats.updated;
    if (changed === 0) {
      info(`sync-skills: nothing to do (${stats.identical} files already in sync)`);
    } else {
      info(`sync-skills: ${stats.created} created, ${stats.updated} updated, ${stats.identical} unchanged`);
    }
    if (printChanged) {
      // Emit ONLY changed paths to stdout — one repo-relative path per line.
      for (const path of changedPaths) {
        process.stdout.write(path + '\n');
      }
    }
  }
}

main().catch((err) => {
  console.error('sync-skills: error', err);
  process.exit(1);
});
