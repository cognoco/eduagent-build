// Safe stash pop/apply guard — WI-1798.
//
// All git worktrees of a repo share ONE `.git` dir; `refs/stash` is a
// per-repository ref, not per-worktree. A bare `git stash pop`/`apply` from
// any worktree acts on whichever entry is topmost, regardless of which
// worktree/session pushed it -- standard git behavior, but nothing in this
// repo enforced named/SHA-targeted stash operations (incident 2026-07-11
// ~02:40Z: a foreign session's protective stash was popped and reverted
// content-blind; recovered via a preserved ref).
//
// This wrapper refuses a bare pop/apply. It requires one of:
//   -m <message-substring>   -- must uniquely match one stash entry's message
//   <stash@{N}>               -- explicit ref
//   <sha>                     -- explicit (full or abbreviated) commit SHA
//
// CLI usage:
//   pnpm exec tsx scripts/safe-stash-pop.ts pop   -m "my message"
//   pnpm exec tsx scripts/safe-stash-pop.ts apply stash@{2}
//   pnpm exec tsx scripts/safe-stash-pop.ts pop   9b8273ea
//
// Exit codes: 0 success, 1 refused/error.

import { spawnSync } from 'node:child_process';

export interface StashEntry {
  ref: string; // e.g. "stash@{0}"
  sha: string;
  message: string;
}

export function listStashEntries(cwd: string): StashEntry[] {
  const res = spawnSync('git', ['stash', 'list', '--format=%gd%x1f%H%x1f%gs'], {
    cwd,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`git stash list failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [ref, sha, message] = line.split('\x1f');
      return { ref, sha, message };
    });
}

export interface ParsedArgs {
  action: 'pop' | 'apply';
  message?: string;
  target?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [action, ...rest] = argv;
  if (action !== 'pop' && action !== 'apply') {
    throw new Error(
      'usage: safe-stash-pop.ts <pop|apply> [-m <message> | <stash@{N}|<sha>>]',
    );
  }
  if (rest[0] === '-m') {
    const message = rest[1];
    if (!message) {
      throw new Error('missing value for -m <message>');
    }
    return { action, message };
  }
  if (rest.length > 0) {
    return { action, target: rest[0] };
  }
  return { action };
}

export class BareStashOpRefusedError extends Error {}
export class NoMatchError extends Error {}
export class AmbiguousMatchError extends Error {}

/** Resolve parsed args + the current stash list to the single ref to act on. */
export function resolveTarget(entries: StashEntry[], args: ParsedArgs): string {
  if (args.target) {
    const t = args.target;
    if (/^stash@\{\d+\}$/.test(t)) {
      const found = entries.find((e) => e.ref === t);
      if (!found) throw new NoMatchError(`no stash entry matches ref ${t}`);
      return found.ref;
    }
    const matches = entries.filter((e) => e.sha.startsWith(t));
    if (matches.length === 0) {
      throw new NoMatchError(`no stash entry matches SHA ${t}`);
    }
    if (matches.length > 1) {
      throw new AmbiguousMatchError(
        `SHA ${t} matches ${matches.length} stash entries`,
      );
    }
    return matches[0].ref;
  }
  if (args.message) {
    const matches = entries.filter((e) => e.message.includes(args.message!));
    if (matches.length === 0) {
      throw new NoMatchError(
        `no stash entry message contains "${args.message}"`,
      );
    }
    if (matches.length > 1) {
      throw new AmbiguousMatchError(
        `message "${args.message}" matches ${matches.length} stash entries -- be more specific`,
      );
    }
    return matches[0].ref;
  }
  throw new BareStashOpRefusedError(
    'refusing a bare git stash pop/apply -- worktrees share one stash stack; ' +
      'specify -m "<message-substring>" or an explicit stash@{N}/SHA target',
  );
}

function runCli(): void {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const cwd = process.cwd();
  let entries: StashEntry[];
  try {
    entries = listStashEntries(cwd);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  let ref: string;
  try {
    ref = resolveTarget(entries, args);
  } catch (err) {
    console.error((err as Error).message);
    console.error('');
    console.error('Current stash stack:');
    for (const e of entries) {
      console.error(`  ${e.ref}  ${e.sha.slice(0, 8)}  ${e.message}`);
    }
    process.exit(1);
    return;
  }

  const res = spawnSync('git', ['stash', args.action, ref], {
    cwd,
    stdio: 'inherit',
  });
  process.exit(res.status ?? 1);
}

const invokedDirectly =
  process.argv[1] &&
  /safe-stash-pop(\.ts)?$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  runCli();
}
