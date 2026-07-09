import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';

export const ZERO_DRIFT_RECEIPT_KIND = 'eval-llm-zero-snapshot-drift';
export const ZERO_DRIFT_RECEIPT_VERSION = 1;
export const SNAPSHOT_ROOT = 'apps/api/eval-llm/snapshots';

export interface ZeroDriftReceipt {
  version: 1;
  kind: typeof ZERO_DRIFT_RECEIPT_KIND;
  createdAt: string;
  head: string;
  command: string;
  promptFiles: Record<string, string>;
  promptFilesHash: string;
  snapshotFiles: Record<string, string>;
  snapshotTreeHash: string;
  snapshotsClean: true;
}

export interface WriteZeroDriftReceiptOptions {
  command: string;
  promptPathPredicate: (gitPath: string) => boolean;
}

export interface WriteZeroDriftReceiptResult {
  written: boolean;
  path: string;
  receipt?: ZeroDriftReceipt;
  message?: string;
}

export interface ValidateZeroDriftReceiptOptions {
  stagedPromptFiles: string[];
}

export interface ReceiptValidationResult {
  ok: boolean;
  message?: string;
}

export function getZeroDriftReceiptPath(cwd = process.cwd()): string {
  return resolveGitPath(cwd, 'eduagent/eval-llm-zero-drift-receipt.json');
}

export function writeZeroDriftReceipt(
  cwd: string,
  options: WriteZeroDriftReceiptOptions,
): WriteZeroDriftReceiptResult {
  const receiptPath = getZeroDriftReceiptPath(cwd);
  const snapshotStatus = getSnapshotStatus(cwd);
  if (snapshotStatus.length > 0) {
    removeZeroDriftReceipt(cwd);
    return {
      written: false,
      path: receiptPath,
      message: 'snapshots are not clean',
    };
  }

  const promptFiles = hashWorkingTreeFiles(
    cwd,
    listRepoFiles(cwd).filter(options.promptPathPredicate),
  );
  const snapshotFiles = hashWorkingTreeFiles(cwd, listSnapshotFiles(cwd));
  const receipt: ZeroDriftReceipt = {
    version: ZERO_DRIFT_RECEIPT_VERSION,
    kind: ZERO_DRIFT_RECEIPT_KIND,
    createdAt: new Date().toISOString(),
    head: git(cwd, ['rev-parse', 'HEAD']).trim(),
    command: options.command,
    promptFiles,
    promptFilesHash: hashFileMap(promptFiles),
    snapshotFiles,
    snapshotTreeHash: hashFileMap(snapshotFiles),
    snapshotsClean: true,
  };

  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { written: true, path: receiptPath, receipt };
}

export function removeZeroDriftReceipt(cwd = process.cwd()): void {
  const receiptPath = getZeroDriftReceiptPath(cwd);
  rmSync(receiptPath, { force: true });
}

export function validateZeroDriftReceipt(
  cwd: string,
  options: ValidateZeroDriftReceiptOptions,
): ReceiptValidationResult {
  const receiptPath = getZeroDriftReceiptPath(cwd);
  if (!existsSync(receiptPath)) {
    return { ok: false, message: 'zero-drift receipt is missing' };
  }

  const receipt = readReceipt(receiptPath);
  if (!receipt) {
    return { ok: false, message: 'zero-drift receipt is invalid' };
  }

  if (
    hashFileMap(receipt.promptFiles) !== receipt.promptFilesHash ||
    hashFileMap(receipt.snapshotFiles) !== receipt.snapshotTreeHash
  ) {
    return {
      ok: false,
      message: 'zero-drift receipt is internally inconsistent',
    };
  }

  const head = git(cwd, ['rev-parse', 'HEAD']).trim();
  if (receipt.head !== head) {
    return { ok: false, message: 'zero-drift receipt HEAD changed' };
  }

  const snapshotStatus = getSnapshotStatus(cwd);
  if (snapshotStatus.length > 0) {
    return {
      ok: false,
      message: 'zero-drift receipt invalid: snapshots are not clean',
    };
  }

  const snapshotFiles = hashWorkingTreeFiles(cwd, listSnapshotFiles(cwd));
  if (hashFileMap(snapshotFiles) !== receipt.snapshotTreeHash) {
    return {
      ok: false,
      message: 'zero-drift receipt invalid: snapshot tree changed',
    };
  }

  for (const stagedPromptFile of options.stagedPromptFiles) {
    const expectedHash = receipt.promptFiles[stagedPromptFile];
    if (!expectedHash) {
      return {
        ok: false,
        message: `${stagedPromptFile} was not evaluated by the zero-drift receipt`,
      };
    }
    const stagedHash = hashBuffer(readStagedBlob(cwd, stagedPromptFile));
    if (stagedHash !== expectedHash) {
      return {
        ok: false,
        message: `${stagedPromptFile} does not match the prompt file evaluated by pnpm eval:llm`,
      };
    }
  }

  return { ok: true };
}

function readReceipt(receiptPath: string): ZeroDriftReceipt | null {
  try {
    const parsed = JSON.parse(
      readFileSync(receiptPath, 'utf8'),
    ) as Partial<ZeroDriftReceipt>;
    if (
      parsed.version !== ZERO_DRIFT_RECEIPT_VERSION ||
      parsed.kind !== ZERO_DRIFT_RECEIPT_KIND ||
      parsed.snapshotsClean !== true ||
      typeof parsed.head !== 'string' ||
      typeof parsed.command !== 'string' ||
      typeof parsed.promptFiles !== 'object' ||
      parsed.promptFiles === null ||
      typeof parsed.promptFilesHash !== 'string' ||
      typeof parsed.snapshotFiles !== 'object' ||
      parsed.snapshotFiles === null ||
      typeof parsed.snapshotTreeHash !== 'string'
    ) {
      return null;
    }
    return parsed as ZeroDriftReceipt;
  } catch {
    return null;
  }
}

function resolveGitPath(cwd: string, gitPath: string): string {
  const resolved = git(cwd, ['rev-parse', '--git-path', gitPath]).trim();
  return path.isAbsolute(resolved) ? resolved : path.resolve(cwd, resolved);
}

function listRepoFiles(cwd: string): string[] {
  return splitGitLines(git(cwd, ['ls-files', '-co', '--exclude-standard']));
}

function listSnapshotFiles(cwd: string): string[] {
  return splitGitLines(
    git(cwd, ['ls-files', '-co', '--exclude-standard', '--', SNAPSHOT_ROOT]),
  ).filter((gitPath) => !gitPath.endsWith('/'));
}

function getSnapshotStatus(cwd: string): string[] {
  return splitGitLines(
    git(cwd, ['status', '--porcelain', '--', SNAPSHOT_ROOT]),
  );
}

function hashWorkingTreeFiles(
  cwd: string,
  gitPaths: string[],
): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const gitPath of [...new Set(gitPaths)].sort()) {
    const abs = path.join(cwd, ...gitPath.split('/'));
    if (existsSync(abs)) {
      hashes[gitPath] = hashBuffer(readFileSync(abs));
    }
  }
  return hashes;
}

function readStagedBlob(cwd: string, gitPath: string): Buffer {
  return execFileSync('git', ['show', `:${gitPath}`], {
    cwd,
    env: childGitEnv(),
    encoding: 'buffer',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function hashFileMap(files: Record<string, string>): string {
  const hash = createHash('sha256');
  for (const [filePath, fileHash] of Object.entries(files).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    hash.update(filePath);
    hash.update('\0');
    hash.update(fileHash);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
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
    env: childGitEnv(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function childGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) {
      delete env[key];
    }
  }
  return env;
}
