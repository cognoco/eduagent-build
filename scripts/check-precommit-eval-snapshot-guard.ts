import { execFileSync } from 'node:child_process';
import {
  SNAPSHOT_ROOT,
  validateZeroDriftReceipt,
} from '../apps/api/eval-llm/runner/zero-drift-receipt';
export { isPromptTouchingPath } from '../apps/api/eval-llm/runner/prompt-paths';
import { isPromptTouchingPath } from '../apps/api/eval-llm/runner/prompt-paths';

export interface EvalSnapshotGuardResult {
  ok: boolean;
  promptFiles: string[];
  message: string;
}

export function isEvalSnapshotPath(gitPath: string): boolean {
  return normalizeGitPath(gitPath).startsWith(`${SNAPSHOT_ROOT}/`);
}

export function evaluatePrecommitEvalSnapshotGuard(
  cwd = process.cwd(),
): EvalSnapshotGuardResult {
  const stagedFiles = listStagedFiles(cwd);
  const promptFiles = stagedFiles.filter(isPromptTouchingPath);
  if (promptFiles.length === 0) {
    return {
      ok: true,
      promptFiles,
      message: 'No staged prompt-touching files.',
    };
  }

  if (stagedFiles.some(isEvalSnapshotPath)) {
    return {
      ok: true,
      promptFiles,
      message: 'Staged eval snapshot files found.',
    };
  }

  const receipt = validateZeroDriftReceipt(cwd, {
    stagedPromptFiles: promptFiles,
  });
  if (receipt.ok) {
    return {
      ok: true,
      promptFiles,
      message: 'Valid eval zero-drift receipt found.',
    };
  }

  return {
    ok: false,
    promptFiles,
    message: formatFailure(promptFiles, receipt.message),
  };
}

function formatFailure(
  promptFiles: string[],
  reason: string | undefined,
): string {
  return [
    'pre-commit: prompt-touching files staged without snapshot evidence.',
    '',
    'Files that triggered the check:',
    ...promptFiles.map((file) => `  ${file}`),
    '',
    reason ? `Receipt check: ${reason}` : undefined,
    reason ? '' : undefined,
    'Run: pnpm eval:llm',
    'If snapshots changed, stage apps/api/eval-llm/snapshots/**.',
    'If snapshots did not change, re-run commit; the eval zero-drift receipt will be accepted.',
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

function listStagedFiles(cwd: string): string[] {
  return splitGitLines(
    git(cwd, ['diff', '--cached', '--name-only', '--diff-filter=d']),
  ).map(normalizeGitPath);
}

function normalizeGitPath(gitPath: string): string {
  return gitPath.replace(/\\/g, '/');
}

function splitGitLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

export function main(): void {
  const result = evaluatePrecommitEvalSnapshotGuard(process.cwd());
  if (!result.ok) {
    console.error('');
    console.error(result.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
