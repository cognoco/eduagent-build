// Break-test for WI-1345 round 3: structural git-env-isolation enforcement.
// Red without a call site's env: childGitEnv(...), green with it — proven
// here on synthetic snippets (fast, deterministic) since a runtime test
// cannot reliably catch a single omitted env option under this repo's
// jest/ts-jest setup (see check-merge-invariant.test.ts's WI-1345 history).

import { checkFiles, checkSource } from './check-git-env-isolation';

describe('checkSource', () => {
  it('passes a spawnSync call with env: childGitEnv(...)', () => {
    const src = `
      function git(repo: string, args: string[]): string {
        const result = spawnSync('git', args, {
          cwd: repo,
          env: childGitEnv(TEST_GIT_IDENTITY),
        });
        return result.stdout ?? '';
      }
    `;
    expect(checkSource('fixture.test.ts', src)).toEqual([]);
  });

  it('passes an execFileSync call with env: childGitEnv()', () => {
    const src = `
      function git(repo: string, args: string[]): void {
        execFileSync('git', args, { cwd: repo, env: childGitEnv() });
      }
    `;
    expect(checkSource('fixture.test.ts', src)).toEqual([]);
  });

  it('FAILS when the env key is omitted entirely', () => {
    const src = `
      function git(repo: string, args: string[]): void {
        execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
      }
    `;
    const violations = checkSource('fixture.test.ts', src);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('no-env-key');
  });

  it('FAILS when there is no options object at all', () => {
    const src = `
      function git(repo: string, args: string[]): void {
        execFileSync('git', args);
      }
    `;
    const violations = checkSource('fixture.test.ts', src);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('no-options-object');
  });

  it('FAILS when env is present but not built via childGitEnv(...)', () => {
    const src = `
      function git(repo: string, args: string[]): void {
        spawnSync('git', args, { cwd: repo, env: { ...process.env, GIT_AUTHOR_NAME: 'Test' } });
      }
    `;
    const violations = checkSource('fixture.test.ts', src);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toBe('env-not-childGitEnv');
  });

  it('allowlists rawGit() by enclosing-function name even without childGitEnv', () => {
    const src = `
      function rawGit(repo: string, args: string[]): string {
        const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
        return result.stdout ?? '';
      }
    `;
    expect(checkSource('fixture.test.ts', src)).toEqual([]);
  });

  it('reports multiple violations across multiple call sites', () => {
    const src = `
      function git(repo: string, args: string[]): void {
        spawnSync('git', args, { cwd: repo });
      }
      function runScript(repo: string): void {
        spawnSync('tsx', ['script.ts'], { cwd: repo, encoding: 'utf8' });
      }
    `;
    const violations = checkSource('fixture.test.ts', src);
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.reason)).toEqual([
      'no-env-key',
      'no-env-key',
    ]);
  });
});

describe('checkFiles (integration — the WI-1345-swept files)', () => {
  it('finds zero violations in the real repo files', () => {
    const repoRoot = require('node:path').resolve(__dirname, '..');
    expect(checkFiles(repoRoot)).toEqual([]);
  });
});
