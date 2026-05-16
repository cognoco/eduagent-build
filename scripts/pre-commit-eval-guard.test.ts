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
// This test parses the literal regex out of the hook and runs the (paths -> match)
// table against it, locking in the post-fix behaviour.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const hookSrc = readFileSync(join(repoRoot, '.husky/pre-commit'), 'utf8');

// Extract the regex used in the PROMPT_CHANGED guard. The hook line looks like:
//   | grep -E '(apps/api/src/services/.*-prompts\.ts$|...)'
const match = hookSrc.match(/grep -E '\((apps\/api\/src\/services[^']+)\)'/);
if (!match) {
  throw new Error(
    'Could not locate PROMPT_CHANGED regex in .husky/pre-commit. ' +
      'The test parser must be updated alongside any restructuring of the hook.',
  );
}

// The shell regex uses POSIX ERE which JS RegExp accepts for these constructs.
// We unescape the shell-escaped backslashes (\\. -> \.) and rebuild as JS RegExp.
const promptRegex = new RegExp(match[1]);
const excludeMatch = hookSrc.match(/\| grep -vE '([^']+)'/);
if (!excludeMatch) {
  throw new Error(
    'Could not locate PROMPT_CHANGED exclusion regex in .husky/pre-commit. ' +
      'The test parser must be updated alongside any restructuring of the hook.',
  );
}
const promptExcludeRegex = new RegExp(excludeMatch[1]);

function isPromptFile(path: string): boolean {
  return promptRegex.test(path) && !promptExcludeRegex.test(path);
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
        expect(isPromptFile(path)).toBe(true);
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
        expect(isPromptFile(path)).toBe(false);
      });
    }
  });
});
