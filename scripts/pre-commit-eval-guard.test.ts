// [BUG-45] The eval-harness guard in .husky/pre-commit must trigger on every
// file whose change could shift LLM output:
//
//   - apps/api/src/services/**/*-prompts.ts
//   - apps/api/src/services/llm/**/*.ts (including nested providers/*.ts)
//   - apps/api/src/services/dictation/generate.ts
//
// and must NOT trigger on:
//
//   - *.test.ts mirrors of those files
//   - unrelated service code
//
// Before the fix the regex used `apps/api/src/services/llm/[^/]+\.ts$` which
// matched only one directory level, so apps/api/src/services/llm/providers/{anthropic,gemini,openai}.ts
// silently shipped without a snapshot diff. apps/api/src/services/dictation/generate.ts
// (which has an associated snapshot under eval-llm/snapshots/dictation-generate/) was
// likewise uncovered.
//
// This test imports the helper logic used by the hook. The hook must delegate
// to the TypeScript guard instead of carrying its own duplicated path regex.

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  evaluatePrecommitEvalSnapshotGuard,
  isPromptTouchingPath,
} from './check-precommit-eval-snapshot-guard';
import {
  removeZeroDriftReceipt,
  writeZeroDriftReceipt,
} from '../apps/api/eval-llm/runner/zero-drift-receipt';

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

function removeTempRepo(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

function writeRepoFile(repo: string, path: string, body: string): void {
  const abs = join(repo, ...path.split('/'));
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, body);
}

function readHook(): string {
  return readFileSync(join(__dirname, '..', '.husky/pre-commit'), 'utf8');
}

describe('[BUG-45] pre-commit eval-harness guard regex', () => {
  describe('matches files that can shift LLM output', () => {
    const SHOULD_MATCH = [
      // top-level llm/
      'apps/api/src/services/llm/router.ts',
      'apps/api/src/services/llm/sanitize.ts',
      // nested llm/providers/* — this was the gap
      'apps/api/src/services/llm/providers/anthropic.ts',
      'apps/api/src/services/llm/providers/openai.ts',
      'apps/api/src/services/llm/providers/gemini.ts',
      // *-prompts.ts at any depth under services/
      'apps/api/src/services/interview/interview-prompts.ts',
      'apps/api/src/services/session/session-prompts.ts',
      // dictation/generate.ts — has its own eval-llm snapshot dir
      'apps/api/src/services/dictation/generate.ts',
    ];

    for (const path of SHOULD_MATCH) {
      it(`matches ${path}`, () => {
        expect(isPromptTouchingPath(path)).toBe(true);
      });
    }
  });

  describe('excludes test mirrors and unrelated files', () => {
    const SHOULD_NOT_MATCH = [
      // *.test.ts files are filtered by the second grep -vE
      'apps/api/src/services/llm/router.test.ts',
      'apps/api/src/services/llm/providers/anthropic.test.ts',
      'apps/api/src/services/dictation/generate.test.ts',
      'apps/api/src/services/interview/interview-prompts.test.ts',
      // parser/projector-only LLM infrastructure does not affect prompt snapshots
      'apps/api/src/services/llm/envelope.ts',
      'apps/api/src/services/llm/project-response.ts',
      'apps/api/src/services/llm/stream-envelope.ts',
      // unrelated service code
      'apps/api/src/services/dictation/result.ts',
      'apps/api/src/services/notes.ts',
      'apps/api/src/services/billing/quota.ts',
      // similarly-named paths outside the guarded tree
      'apps/api/src/middleware/llm.ts',
      'packages/schemas/src/llm.ts',
    ];

    for (const path of SHOULD_NOT_MATCH) {
      it(`does not match ${path}`, () => {
        expect(isPromptTouchingPath(path)).toBe(false);
      });
    }
  });
});

describe('pre-commit eval-snapshot guard behavior', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'precommit-eval-guard-'));
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
    removeTempRepo(repo);
  });

  it('passes when no prompt-touching files are staged', () => {
    writeRepoFile(repo, 'notes.txt', 'hello\n');
    git(repo, ['add', 'notes.txt']);

    const result = evaluatePrecommitEvalSnapshotGuard(repo);

    expect(result.ok).toBe(true);
  });

  it('fails when a prompt file is staged without snapshots or a receipt', () => {
    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "comment-only";\n',
    );
    git(repo, ['add', 'apps/api/src/services/session/session-prompts.ts']);

    const result = evaluatePrecommitEvalSnapshotGuard(repo);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('without snapshot evidence');
  });

  it('passes when a prompt file and eval snapshots are staged together', () => {
    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "changed";\n',
    );
    writeRepoFile(
      repo,
      'apps/api/eval-llm/snapshots/session/12yo-dinosaurs.md',
      '# changed snapshot\n',
    );
    git(repo, ['add', 'apps/api/src/services/session/session-prompts.ts']);
    git(repo, ['add', 'apps/api/eval-llm/snapshots/session/12yo-dinosaurs.md']);

    const result = evaluatePrecommitEvalSnapshotGuard(repo);

    expect(result.ok).toBe(true);
  });

  it('passes when the staged snapshot evidence is a deletion', () => {
    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "removed obsolete scenario";\n',
    );
    rmSync(join(repo, 'apps/api/eval-llm/snapshots/session/12yo-dinosaurs.md'));
    git(repo, ['add', 'apps/api/src/services/session/session-prompts.ts']);
    git(repo, [
      'add',
      '-u',
      'apps/api/eval-llm/snapshots/session/12yo-dinosaurs.md',
    ]);

    const result = evaluatePrecommitEvalSnapshotGuard(repo);

    expect(result.ok).toBe(true);
  });

  it('passes a zero-drift prompt change with a receipt from the evaluated file contents', () => {
    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "base";\n// refactor only\n',
    );
    const receipt = writeZeroDriftReceipt(repo, {
      command: 'pnpm eval:llm',
      promptPathPredicate: isPromptTouchingPath,
    });
    expect(receipt.written).toBe(true);
    git(repo, ['add', 'apps/api/src/services/session/session-prompts.ts']);

    const result = evaluatePrecommitEvalSnapshotGuard(repo);

    expect(result.ok).toBe(true);
  });

  it('fails closed when the staged prompt blob differs from the receipt-evaluated content', () => {
    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "base";\n// evaluated\n',
    );
    const receipt = writeZeroDriftReceipt(repo, {
      command: 'pnpm eval:llm',
      promptPathPredicate: isPromptTouchingPath,
    });
    expect(receipt.written).toBe(true);

    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "base";\n// staged later\n',
    );
    git(repo, ['add', 'apps/api/src/services/session/session-prompts.ts']);

    const result = evaluatePrecommitEvalSnapshotGuard(repo);

    expect(result.ok).toBe(false);
    expect(result.message).toContain(
      'does not match the prompt file evaluated',
    );
  });

  it('fails a prompt change with dirty snapshots until the snapshots are staged', () => {
    writeRepoFile(
      repo,
      'apps/api/src/services/session/session-prompts.ts',
      'export const prompt = "changed";\n',
    );
    writeRepoFile(
      repo,
      'apps/api/eval-llm/snapshots/session/12yo-dinosaurs.md',
      '# dirty snapshot\n',
    );
    git(repo, ['add', 'apps/api/src/services/session/session-prompts.ts']);

    const blocked = evaluatePrecommitEvalSnapshotGuard(repo);

    expect(blocked.ok).toBe(false);

    git(repo, ['add', 'apps/api/eval-llm/snapshots/session/12yo-dinosaurs.md']);

    const accepted = evaluatePrecommitEvalSnapshotGuard(repo);

    expect(accepted.ok).toBe(true);
  });

  it('keeps prompt include/exclude patterns out of .husky/pre-commit', () => {
    const hook = readHook();

    expect(hook).toContain('scripts/check-precommit-eval-snapshot-guard.ts');
    expect(hook).not.toContain('apps/api/src/services/.*-prompts');
    expect(hook).not.toContain('apps/api/src/services/llm/.+');
  });
});
