// WI-1158 regression guard: review-watcher.ts's launchReview() spawn is extracted into this
// adapter (review-runner.ts). These tests assert the codex arg array the adapter builds is
// IDENTICAL to the array launchReview() built inline before the extraction — no behavior
// regression on the only live consumer. Mirrors judge.test.ts's codexExecArgs shape-assertion
// pattern (plugins/cosmo/lib/judge.test.ts).

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  codexReviewExecArgs,
  DEFAULT_RUNNER_PROVIDER,
  resolveExecutable,
  resolveRunnerProvider,
  spawnReviewRunner,
} from './review-runner.ts';

describe('codexReviewExecArgs', () => {
  test('reproduces the pre-extraction inline array byte-for-byte', () => {
    const args = codexReviewExecArgs({
      cwd: '/repo',
      sandbox: 'danger-full-access',
      outputPath: '/out/review.final.md',
    });
    // Exact array launchReview() spawned before WI-1158 (review-watcher.ts, pre-extraction):
    // ['codex', '-a', 'never', 'exec', '--ephemeral', '-C', repo, '-s', 'danger-full-access',
    //  '-c', 'shell_environment_policy.inherit="all"', '-o', out, '-']
    expect(args).toEqual([
      'codex',
      '-a',
      'never',
      'exec',
      '--ephemeral',
      '-C',
      '/repo',
      '-s',
      'danger-full-access',
      '-c',
      'shell_environment_policy.inherit="all"',
      '-o',
      '/out/review.final.md',
      '-',
    ]);
  });

  test('the sandbox value is threaded through verbatim, not hardcoded', () => {
    // WI-1159 owns deciding the sandbox value; this adapter must never bake one in.
    const args = codexReviewExecArgs({
      cwd: '/repo',
      sandbox: 'workspace-write',
      outputPath: '/out/x.md',
    });
    expect(args).toContain('workspace-write');
    expect(args).not.toContain('danger-full-access');
  });

  test('prompt is read from stdin — args end with the bare "-" marker', () => {
    const args = codexReviewExecArgs({ cwd: '/repo', sandbox: 's', outputPath: '/o.md' });
    expect(args.at(-1)).toBe('-');
  });
});

describe('resolveRunnerProvider', () => {
  test('default provider is codex', () => {
    expect(DEFAULT_RUNNER_PROVIDER).toBe('codex');
    expect(resolveRunnerProvider()).toBe('codex');
  });
  test('accepts an explicit "codex" provider', () => {
    expect(resolveRunnerProvider('codex')).toBe('codex');
  });
  test('throws on an unsupported provider', () => {
    // @ts-expect-error — deliberately passing an invalid provider to assert the runtime guard
    expect(() => resolveRunnerProvider('claude')).toThrow(/unsupported review runner provider/);
  });
});

// WI-1158 rework (reviewer bounce, 2026-07-07): spawnReviewRunner used to hand Bun's spawn() the
// bare 'codex' name; that ENOENT'd in the reviewer's own sandboxed run despite `codex` being
// present on its PATH (Windows PATHEXT/.cmd shim resolution is not guaranteed uniform across
// every process context). The tests below are UNCONDITIONAL — they don't gate on codex being
// installed — because resolveExecutable's Windows-safe resolution is exercised for real against
// `bun` itself (always present: it's the process running this test), so the exact bug class can
// never hide behind "codex wasn't on this machine's PATH."
describe('resolveExecutable', () => {
  test('resolves a real, always-present executable ("bun") to an absolute path — genuine PATHEXT/PATH resolution, no mock', () => {
    const resolved = resolveExecutable('bun', process.env);
    expect(resolved).not.toBe('bun');
    expect(resolved.length).toBeGreaterThan(3);
    // Prove it's not just a string transform: actually spawn the resolved absolute path and
    // confirm it launches successfully (the exact class of failure the reviewer hit: a name that
    // "resolves" on paper but ENOENTs when actually spawned).
    const proc = Bun.spawnSync([resolved, '--version'], { stdout: 'pipe', stderr: 'pipe' });
    expect(proc.exitCode).toBe(0);
  });

  test('throws a clear, actionable error for an executable that is genuinely not on PATH', () => {
    expect(() => resolveExecutable('definitely-not-a-real-cli-xyz', { PATH: '' })).toThrow(
      /review runner executable "definitely-not-a-real-cli-xyz" not found on PATH/,
    );
  });

  test('the not-found branch is real-tested via an injectable resolver, without needing an actually-missing binary', () => {
    const fakeResolve = () => null;
    expect(() => resolveExecutable('codex', process.env, fakeResolve)).toThrow(
      /review runner executable "codex" not found on PATH/,
    );
  });

  test('an injected resolver that finds a path is threaded through unchanged', () => {
    const fakeResolve = (cmd: string) => `/fake/resolved/${cmd}`;
    expect(resolveExecutable('codex', process.env, fakeResolve)).toBe('/fake/resolved/codex');
  });

  // Platform-gated (win32-only), NOT dependency-gated (unlike hasCodexOnPath() below) — the .cmd
  // PATHEXT mechanic this proves only exists on Windows at all, so gating on the OS is not the
  // "hide the bug behind an optional dependency" anti-pattern the reviewer bounced on. The 'bun'
  // test above proves resolveExecutable resolves and launches SOMETHING real; it does NOT prove
  // the .cmd-shim-without-shell mechanic specifically, because `bun` itself is a native .exe, not
  // a .cmd wrapper. This test builds a throwaway synthetic .cmd shim (no dependency on codex or
  // any other installed CLI) and round-trips it through resolveExecutable + a shell:false spawn —
  // the exact mechanic codex's own npm-installed .cmd shim relies on.
  test.if(process.platform === 'win32')(
    'resolves and spawns a synthetic .cmd shim end-to-end, no shell:true — proves the actual PATHEXT/.cmd mechanic without depending on any installed CLI',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'review-runner-cmd-test-'));
      const cmdPath = join(dir, 'fake-review-runner-cli.cmd');
      writeFileSync(cmdPath, '@echo off\r\necho fake-cli-ok\r\nexit /b 0\r\n');
      try {
        const scopedPath = `${dir};${process.env.PATH ?? ''}`;
        const resolved = resolveExecutable('fake-review-runner-cli', { PATH: scopedPath });
        expect(resolved.toLowerCase()).toBe(cmdPath.toLowerCase());
        // No shell:true — this is exactly what spawnReviewRunner() does: spawn the resolved
        // absolute .cmd path directly, the same way it would spawn codex's own .cmd shim.
        const proc = Bun.spawnSync([resolved], { stdout: 'pipe', stderr: 'pipe' });
        expect(proc.exitCode).toBe(0);
        expect(proc.stdout.toString()).toContain('fake-cli-ok');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

// Whether `codex` is resolvable on this machine's PATH — the codex-specific spawnReviewRunner
// integration test below additionally needs the real CLI (not just an executable resolving to
// a path), so it stays gated; the resolveExecutable tests above already prove the fix's core
// logic unconditionally, so this gate can no longer hide the bug class the reviewer caught.
function hasCodexOnPath(): boolean {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  return Bun.spawnSync([lookup, 'codex'], { stdout: 'ignore', stderr: 'ignore' }).exitCode === 0;
}

describe('spawnReviewRunner', () => {
  test.if(hasCodexOnPath())(
    'spawns the RESOLVED absolute codex path with piped stdin/stdout/stderr (the shape launchReview() depends on) — proves the end-to-end wiring, not just arg-building',
    () => {
      const proc = spawnReviewRunner({
        sandbox: 'danger-full-access',
        cwd: process.cwd(),
        outputPath: '/tmp/out.md',
      });
      expect(proc.pid).toBeGreaterThan(0);
      expect(proc.stdin).toBeTruthy();
      proc.kill();
    },
  );

  test('throws the clear resolveExecutable error (not a bare ENOENT) when the provider executable is missing', () => {
    expect(() =>
      spawnReviewRunner({
        sandbox: 'danger-full-access',
        cwd: process.cwd(),
        outputPath: '/tmp/out.md',
        env: { PATH: '' },
      }),
    ).toThrow(/review runner executable "codex" not found on PATH/);
  });

  test('rejects an unsupported provider before spawning anything', () => {
    expect(() =>
      spawnReviewRunner({
        // @ts-expect-error — deliberately invalid provider
        provider: 'claude',
        sandbox: 'danger-full-access',
        cwd: process.cwd(),
        outputPath: '/tmp/out.md',
      }),
    ).toThrow(/unsupported review runner provider/);
  });
});
