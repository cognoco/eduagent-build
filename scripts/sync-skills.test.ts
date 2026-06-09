import { execFileSync } from 'node:child_process';
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
