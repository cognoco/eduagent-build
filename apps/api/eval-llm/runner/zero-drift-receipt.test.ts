import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getZeroDriftReceiptPath,
  removeZeroDriftReceipt,
  validateZeroDriftReceipt,
  writeZeroDriftReceipt,
} from './zero-drift-receipt';

function git(repo: string, args: string[]): void {
  execFileSync('git', args, {
    cwd: repo,
    env: childGitEnv(),
    stdio: 'ignore',
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

function writeRepoFile(repo: string, path: string, body: string): void {
  const abs = join(repo, ...path.split('/'));
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, body);
}

const isPromptFile = (path: string): boolean =>
  path === 'apps/api/src/services/session/session-prompts.ts';

describe('zero-drift eval receipt', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'zero-drift-receipt-'));
    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test User']);
    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "base";\n',
    );
    writeRepoFile(
      repo,
      'apps/api/eval-llm/snapshots/session/12yo-dinosaurs.md',
      '# base snapshot\n',
    );
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'init']);
  });

  afterEach(() => {
    removeZeroDriftReceipt(repo);
    rmSync(repo, { recursive: true, force: true });
  });

  it('writes the receipt under git metadata instead of the working tree', () => {
    const result = writeZeroDriftReceipt(repo, {
      command: 'pnpm eval:llm',
      promptPathPredicate: isPromptFile,
    });

    expect(result.written).toBe(true);
    expect(result.path).toBe(getZeroDriftReceiptPath(repo));
    expect(result.path.replace(/\\/g, '/')).toContain(
      '.git/eduagent/eval-llm-zero-drift-receipt.json',
    );
    expect(existsSync(result.path)).toBe(true);
    expect(
      existsSync(join(repo, 'eduagent', 'eval-llm-zero-drift-receipt.json')),
    ).toBe(false);
  });

  it('validates staged prompt blobs that match the evaluated prompt hashes', () => {
    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "base";\n// evaluated\n',
    );
    writeZeroDriftReceipt(repo, {
      command: 'pnpm eval:llm',
      promptPathPredicate: isPromptFile,
    });
    git(repo, ['add', 'apps/api/src/services/session/session-prompts.ts']);

    const result = validateZeroDriftReceipt(repo, {
      stagedPromptFiles: ['apps/api/src/services/session/session-prompts.ts'],
    });

    expect(result.ok).toBe(true);
  });

  it('fails when the staged prompt blob was not present in the eval run', () => {
    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "base";\n// evaluated\n',
    );
    writeZeroDriftReceipt(repo, {
      command: 'pnpm eval:llm',
      promptPathPredicate: isPromptFile,
    });
    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "base";\n// staged later\n',
    );
    git(repo, ['add', 'apps/api/src/services/session/session-prompts.ts']);

    const result = validateZeroDriftReceipt(repo, {
      stagedPromptFiles: ['apps/api/src/services/session/session-prompts.ts'],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain(
      'does not match the prompt file evaluated',
    );
  });

  it('fails when HEAD has moved since the eval run', () => {
    writeZeroDriftReceipt(repo, {
      command: 'pnpm eval:llm',
      promptPathPredicate: isPromptFile,
    });
    writeRepoFile(repo, 'unrelated.txt', 'new commit\n');
    git(repo, ['add', 'unrelated.txt']);
    git(repo, ['commit', '-m', 'move head']);

    const result = validateZeroDriftReceipt(repo, {
      stagedPromptFiles: ['apps/api/src/services/session/session-prompts.ts'],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('HEAD changed');
  });

  it('fails when receipt hashes are internally inconsistent', () => {
    const receipt = writeZeroDriftReceipt(repo, {
      command: 'pnpm eval:llm',
      promptPathPredicate: isPromptFile,
    });
    const body = JSON.parse(readFileSync(receipt.path, 'utf8')) as {
      promptFilesHash: string;
    };
    body.promptFilesHash = 'not-the-real-hash';
    writeFileSync(receipt.path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');

    const result = validateZeroDriftReceipt(repo, {
      stagedPromptFiles: ['apps/api/src/services/session/session-prompts.ts'],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('internally inconsistent');
  });

  it('fails when snapshots are dirty after the eval run', () => {
    writeZeroDriftReceipt(repo, {
      command: 'pnpm eval:llm',
      promptPathPredicate: isPromptFile,
    });
    writeRepoFile(
      repo,
      'apps/api/eval-llm/snapshots/session/12yo-dinosaurs.md',
      '# dirty snapshot\n',
    );

    const result = validateZeroDriftReceipt(repo, {
      stagedPromptFiles: ['apps/api/src/services/session/session-prompts.ts'],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('snapshots are not clean');
  });

  it('removes stale receipts on request', () => {
    const result = writeZeroDriftReceipt(repo, {
      command: 'pnpm eval:llm',
      promptPathPredicate: isPromptFile,
    });
    expect(existsSync(result.path)).toBe(true);

    removeZeroDriftReceipt(repo);

    expect(existsSync(result.path)).toBe(false);
  });
});
