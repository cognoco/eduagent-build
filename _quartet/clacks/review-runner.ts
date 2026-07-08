// WI-1158: runner-adapter contract for review-watcher.ts's spawned review agent.
//
// Before this, launchReview() inline-built a Bun.spawn call hardcoded to the `codex` CLI —
// swapping the reviewer runtime (e.g. adding a `claude` provider) meant editing the watcher's
// poll/transition/log logic directly. This module extracts that spawn into a provider-shaped
// adapter mirroring plugins/cosmo/lib/judge.ts's factory pattern ({provider, model, sandbox, cwd}
// params, a pure no-I/O arg-builder, resolve-then-dispatch) — see judge.ts's resolveJudgeProvider/
// codexExecArgs/makeJudge for the reference shape.
//
// One deliberate divergence from judge.ts: judge.ts's factory calls a CLI and awaits full
// completion (judge() returns parsed verdicts). review-watcher needs a LIVE subprocess handle
// instead — proc.stdin (prompt is piped in, not passed as an arg), streaming proc.stdout/stderr,
// proc.exited observed later, proc.pid recorded in the `running` map. So spawnReviewRunner()
// returns the raw Bun subprocess, matching what launchReview() already does with it.
//
// Sandbox level is a caller-supplied parameter, never hardcoded here. WI-1159 changed what value
// flows in at the call site (review-watcher.ts now names 'read-only', not 'danger-full-access') —
// that literal lives at the call site, not in this module, so WI-1159 touched one line there, not
// this file.
//
// WI-1158 rework (reviewer bounce, 2026-07-07): the first pass handed Bun's spawn() the bare
// executable name 'codex'. On Windows `codex` resolves to a `.cmd` PATH shim, and a bare-name
// spawn's internal PATHEXT resolution is not guaranteed uniform across every process context —
// it worked in this session's interactive shell but ENOENT'd in the reviewer's own sandboxed run
// even though `codex` was confirmed present on PATH there too. Fix: resolve to an absolute
// executable path via Bun.which() before spawning, so the real OS-level launch never depends on
// spawn()'s own ad hoc resolution.

import { spawn, which } from 'bun';

export type RunnerProvider = 'codex';

export const DEFAULT_RUNNER_PROVIDER: RunnerProvider = 'codex';

/** Explicit-wins validation, mirroring resolveJudgeProvider's non-auto branch. Only one provider
 *  exists today; this still throws on anything else rather than silently coercing, so a future
 *  caller typo (or a not-yet-implemented provider name) fails loudly instead of quietly running
 *  codex. */
export function resolveRunnerProvider(
  provider: RunnerProvider = DEFAULT_RUNNER_PROVIDER,
): RunnerProvider {
  if (provider !== 'codex') {
    throw new Error(`unsupported review runner provider "${provider}" (expected codex)`);
  }
  return provider;
}

/** PURE arg-builder — no I/O, no spawn. Reproduces review-watcher.ts's pre-extraction codex
 *  invocation byte-for-byte; unit-tested directly against that fixed array (WI-1158 regression
 *  guard: no behavior change on the only live consumer). */
export function codexReviewExecArgs(opts: {
  cwd: string;
  sandbox: string;
  outputPath: string;
}): string[] {
  return [
    'codex',
    '-a',
    'never',
    'exec',
    '--ephemeral',
    '-C',
    opts.cwd,
    '-s',
    opts.sandbox,
    '-c',
    'shell_environment_policy.inherit="all"',
    '-o',
    opts.outputPath,
    '-',
  ];
}

/** Resolve `command` to an absolute executable path — Windows-safe (walks PATHEXT to find e.g.
 *  `codex.cmd`), using the PATH the spawn call will actually run with. Throws a clear, actionable
 *  error instead of a bare ENOENT when the executable isn't found. `resolve` is injectable
 *  (defaults to Bun's real `which`) so the not-found branch is unit-testable without needing an
 *  actually-missing binary. */
export function resolveExecutable(
  command: string,
  env: Record<string, string | undefined> = process.env,
  resolve: (cmd: string, opts: { PATH: string }) => string | null = which,
): string {
  // `?? ''` is deliberate, not a lazy default: an explicit empty PATH (e.g. a caller testing the
  // not-found branch) must resolve to "nothing found," not silently fall back to this process's
  // own process.env.PATH and mask the caller's intent.
  const resolved = resolve(command, { PATH: env.PATH ?? '' });
  if (!resolved) {
    throw new Error(`review runner executable "${command}" not found on PATH`);
  }
  return resolved;
}

export type ReviewRunnerOpts = {
  provider?: RunnerProvider;
  // Reserved for future providers (shape-parity with judge.ts's {provider, model}); the codex
  // path has no model flag in play for review runs today and ignores this.
  model?: string;
  // Sandbox level — a parameter this module only consumes; WI-1159 owns deciding the value.
  sandbox: string;
  cwd: string;
  outputPath: string;
  env?: Record<string, string | undefined>;
};

/** Resolves the provider, builds its args, and spawns — returning the live subprocess handle
 *  unchanged (stdin/stdout/stderr all piped, same shape launchReview() passed inline before this
 *  extraction). Callers still write the prompt to `proc.stdin`, stream `proc.stdout`/`proc.stderr`,
 *  and await `proc.exited` themselves; this function only owns "which CLI, which args." */
export function spawnReviewRunner(opts: ReviewRunnerOpts) {
  const provider = resolveRunnerProvider(opts.provider);
  if (provider === 'codex') {
    const [command, ...rest] = codexReviewExecArgs({
      cwd: opts.cwd,
      sandbox: opts.sandbox,
      outputPath: opts.outputPath,
    });
    const env = opts.env ?? process.env;
    const resolvedCommand = resolveExecutable(command, env);
    return spawn([resolvedCommand, ...rest], {
      cwd: opts.cwd,
      env,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }
  // Unreachable given resolveRunnerProvider's validation, but keeps the branch exhaustive
  // without a cast if a second provider is added and this branch isn't updated yet.
  throw new Error(`unsupported review runner provider "${provider}"`);
}
