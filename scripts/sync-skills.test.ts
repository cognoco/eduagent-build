import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'sync-skills.mjs');

/** Run the real sync-skills.mjs against fixture roots (node_modules still resolves). */
function runSync(sourceRoot: string, targetRoot: string): void {
  execFileSync('node', [SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SYNC_SKILLS_SOURCE_ROOT: sourceRoot,
      SYNC_SKILLS_TARGET_ROOT: targetRoot,
    },
    stdio: 'ignore',
  });
}

/**
 * Run sync-skills.mjs --report-orphans against fixture roots.
 * Returns { status, stdout, stderr } — does NOT throw on non-zero exit.
 */
function runReportOrphans(
  sourceRoot: string,
  targetRoot: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [SCRIPT, '--report-orphans'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      SYNC_SKILLS_SOURCE_ROOT: sourceRoot,
      SYNC_SKILLS_TARGET_ROOT: targetRoot,
    },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('sync-skills.mjs — Claude frontmatter injection (WI-454)', () => {
  let dir: string;
  let src: string;
  let out: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sync-skills-'));
    src = join(dir, 'src');
    out = join(dir, 'out');
    mkdirSync(src, { recursive: true });
    mkdirSync(out, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('merges agents/claude.yaml into the emitted SKILL.md frontmatter, body verbatim', () => {
    const skill = join(src, 'demo');
    mkdirSync(join(skill, 'agents'), { recursive: true });
    writeFileSync(
      join(skill, 'SKILL.md'),
      [
        '---',
        'name: demo',
        'description: A runtime-neutral demo skill.',
        '---',
        '',
        '# Demo',
        '',
        'Body line one.',
        '',
        '---',
        '',
        'A horizontal rule in the body must survive.',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(skill, 'agents', 'claude.yaml'),
      [
        'context: fork',
        'agent: general-purpose',
        'model: sonnet',
        'allowed-tools: Bash, Read, Grep',
        '',
      ].join('\n'),
    );
    // A sibling Codex adapter must be ignored by the merge and not mirrored.
    writeFileSync(
      join(skill, 'agents', 'openai.yaml'),
      'interface:\n  display_name: Demo\n',
    );

    runSync(src, out);

    const emitted = readFileSync(join(out, 'demo', 'SKILL.md'), 'utf8');
    // Master keys survive (and keep their position)...
    expect(emitted).toMatch(
      /^---\nname: demo\ndescription: A runtime-neutral demo skill\./,
    );
    // ...and the adapter's harness directives are injected.
    expect(emitted).toContain('context: fork');
    expect(emitted).toContain('agent: general-purpose');
    expect(emitted).toContain('model: sonnet');
    expect(emitted).toContain('allowed-tools: Bash, Read, Grep');
    // Body is preserved verbatim, including a body-internal horizontal rule.
    expect(emitted).toContain('# Demo');
    expect(emitted).toContain('A horizontal rule in the body must survive.');
    // The agents/ adapter dir is consumed, never mirrored.
    expect(existsSync(join(out, 'demo', 'agents'))).toBe(false);
  });

  it('copies a SKILL.md byte-exact when no claude.yaml adapter exists', () => {
    const skill = join(src, 'plain');
    mkdirSync(skill, { recursive: true });
    const body = '---\nname: plain\ndescription: no adapter.\n---\n\n# Plain\n';
    writeFileSync(join(skill, 'SKILL.md'), body);

    runSync(src, out);

    expect(readFileSync(join(out, 'plain', 'SKILL.md'), 'utf8')).toBe(body);
  });

  it('overrides a master frontmatter key when the adapter sets it (adapter wins, in place)', () => {
    const skill = join(src, 'override');
    mkdirSync(join(skill, 'agents'), { recursive: true });
    writeFileSync(
      join(skill, 'SKILL.md'),
      '---\nname: override\ndescription: master desc.\n---\n\n# Body\n',
    );
    writeFileSync(
      join(skill, 'agents', 'claude.yaml'),
      'description: adapter desc.\nmodel: sonnet\n',
    );

    runSync(src, out);

    const emitted = readFileSync(join(out, 'override', 'SKILL.md'), 'utf8');
    expect(emitted).toContain('description: adapter desc.');
    expect(emitted).not.toContain('master desc.');
    // overridden key keeps its original slot (before the appended adapter-only key)
    expect(emitted.indexOf('description:')).toBeLessThan(
      emitted.indexOf('model:'),
    );
  });
});

describe('sync-skills.mjs --report-orphans', () => {
  let dir: string;
  let src: string;
  let out: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sync-skills-orphans-'));
    src = join(dir, 'src');
    out = join(dir, 'out');
    mkdirSync(src, { recursive: true });
    mkdirSync(out, { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exits 0 and reports no orphans when every .claude/ dir has an .agents/ master', () => {
    // Create a master in src and its generated copy in out
    mkdirSync(join(src, 'foo'), { recursive: true });
    writeFileSync(
      join(src, 'foo', 'SKILL.md'),
      '---\nname: foo\ndescription: Use when foo.\n---\n\n# Foo\n',
    );
    mkdirSync(join(out, 'foo'), { recursive: true });
    writeFileSync(
      join(out, 'foo', 'SKILL.md'),
      '---\nname: foo\ndescription: Use when foo.\n---\n\n# Foo\n',
    );

    const { status, stdout } = runReportOrphans(src, out);
    expect(status).toBe(0);
    expect(stdout).toContain('no orphans');
  });

  it('exits 1 and lists orphaned dir when .claude/ has a dir with no .agents/ master', () => {
    // out has 'orphaned-skill' but src does not
    mkdirSync(join(out, 'orphaned-skill'), { recursive: true });
    writeFileSync(
      join(out, 'orphaned-skill', 'SKILL.md'),
      '---\nname: orphaned\ndescription: Use when orphaned.\n---\n\n# Body\n',
    );

    const { status, stderr } = runReportOrphans(src, out);
    expect(status).toBe(1);
    expect(stderr).toContain('orphaned');
  });

  it('exits 1 and lists a loose file directly under .claude/skills/', () => {
    // A flat .md file directly under out (not inside a subdir)
    writeFileSync(join(out, 'loose.md'), '# Loose\n');

    const { status, stderr } = runReportOrphans(src, out);
    expect(status).toBe(1);
    expect(stderr).toContain('loose.md');
  });

  it('does not flag group-prefixed dirs that have a matching tech/ child in .agents/', () => {
    // src has tech/bar; out should have tech-bar (the flattened copy) — not an orphan
    mkdirSync(join(src, 'tech', 'bar'), { recursive: true });
    writeFileSync(
      join(src, 'tech', 'bar', 'SKILL.md'),
      '---\nname: bar\ndescription: Use when bar.\n---\n\n# Bar\n',
    );
    mkdirSync(join(out, 'tech-bar'), { recursive: true });
    writeFileSync(
      join(out, 'tech-bar', 'SKILL.md'),
      '---\nname: bar\ndescription: Use when bar.\n---\n\n# Bar\n',
    );

    const { status } = runReportOrphans(src, out);
    expect(status).toBe(0);
  });

  it('detects a nested orphan dir inside a namespace that has ≥1 master', () => {
    // Namespace 'my' has one real master (my/kept) and its generated copy,
    // PLUS a stale generated child (my/removed-skill/) with no source. The
    // top-level 'my' dir is "known", so only descending into it catches this.
    mkdirSync(join(src, 'my', 'kept'), { recursive: true });
    writeFileSync(
      join(src, 'my', 'kept', 'SKILL.md'),
      '---\nname: kept\ndescription: Use when kept.\n---\n\n# Kept\n',
    );
    mkdirSync(join(out, 'my', 'kept'), { recursive: true });
    writeFileSync(
      join(out, 'my', 'kept', 'SKILL.md'),
      '---\nname: kept\ndescription: Use when kept.\n---\n\n# Kept\n',
    );
    // Stale generated child with no .agents/ source.
    mkdirSync(join(out, 'my', 'removed-skill'), { recursive: true });
    writeFileSync(
      join(out, 'my', 'removed-skill', 'SKILL.md'),
      '---\nname: removed\ndescription: Use when removed.\n---\n\n# Removed\n',
    );

    const { status, stderr } = runReportOrphans(src, out);
    expect(status).toBe(1);
    expect(stderr).toContain('removed-skill');
  });

  it('detects a nested orphan loose file inside a namespace that has ≥1 master', () => {
    // my/kept/ is a real skill; my/old-skill.md is a stale flat generated file.
    mkdirSync(join(src, 'my', 'kept'), { recursive: true });
    writeFileSync(
      join(src, 'my', 'kept', 'SKILL.md'),
      '---\nname: kept\ndescription: Use when kept.\n---\n\n# Kept\n',
    );
    mkdirSync(join(out, 'my', 'kept'), { recursive: true });
    writeFileSync(
      join(out, 'my', 'kept', 'SKILL.md'),
      '---\nname: kept\ndescription: Use when kept.\n---\n\n# Kept\n',
    );
    writeFileSync(join(out, 'my', 'old-skill.md'), '# Old\n');

    const { status, stderr } = runReportOrphans(src, out);
    expect(status).toBe(1);
    expect(stderr).toContain('old-skill.md');
  });

  it('does not flag a nested child that has a matching .agents/ source child', () => {
    // Both children of 'my' have masters — clean, exit 0.
    for (const child of ['kept', 'also-kept']) {
      mkdirSync(join(src, 'my', child), { recursive: true });
      writeFileSync(
        join(src, 'my', child, 'SKILL.md'),
        `---\nname: ${child}\ndescription: Use when ${child}.\n---\n\n# ${child}\n`,
      );
      mkdirSync(join(out, 'my', child), { recursive: true });
      writeFileSync(
        join(out, 'my', child, 'SKILL.md'),
        `---\nname: ${child}\ndescription: Use when ${child}.\n---\n\n# ${child}\n`,
      );
    }

    const { status } = runReportOrphans(src, out);
    expect(status).toBe(0);
  });
});
