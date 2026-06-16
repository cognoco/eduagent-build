// [CR-2026-05-21-183 / BUG-588] Static guard: no production code may import
// `createMockDb` from `@eduagent/test-utils`. The helper returns a
// forbidden-by-default mock that silently resolves every Drizzle query to
// `undefined` / `[]`. If production code ever pulls it in, every read would
// quietly return "no data" — a silent RLS bypass at runtime.
//
// This is a forward-only ratchet. The grep ignores:
//   - any path containing `.test.` (Jest test files)
//   - the helper's own source (`neon-mock.ts`)
//   - the test-utils barrel export (`index.ts`) and its README
//   - the API test-utils factory (`apps/api/src/test-utils/database-module.ts`)
//   - everything under `docs/`, `_wip/`, `.claude/`, `node_modules/`, `dist/`
//
// If you find yourself wanting to add an exception here, instead refactor the
// production import to use `createIntegrationDb` or a fixture-aware factory.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Walk up from this file to find the monorepo root (the directory containing
// `pnpm-workspace.yaml` or `package.json` with `workspaces` / `nx`). The repo
// root is two levels up from packages/test-utils/.
function findRepoRoot(): string {
  // packages/test-utils/src/lib/ → ../../../.. = repo root
  return resolve(__dirname, '..', '..', '..', '..');
}

// Tests that depend on `git` being available skip when the binary is missing
// (CI runners always have it; some sandboxed environments may not).
const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const itIfGit = hasGit ? it : it.skip;

describe('[CR-2026-05-21-183] createMockDb import guard', () => {
  itIfGit(
    'is not imported from any non-test file outside the approved allowlist',
    () => {
      const repoRoot = findRepoRoot();
      // Sanity: the repo root should actually be the monorepo (contains
      // `packages/test-utils`). If layout changes, fail loudly so the guard
      // is repointed rather than silently passing on a wrong tree.
      expect(existsSync(resolve(repoRoot, 'packages', 'test-utils'))).toBe(
        true,
      );

      // `git grep -l` lists files in the tracked tree containing the pattern.
      // Using `git` (vs. recursive fs walk) keeps the test fast on Windows
      // and respects `.gitignore` automatically.
      let matchedFiles: string[] = [];
      try {
        const out = execFileSync(
          'git',
          [
            '-C',
            repoRoot,
            'grep',
            '-l',
            '--',
            'createMockDb',
            ':(exclude)**/*.test.ts',
            ':(exclude)**/*.test.tsx',
            ':(exclude)**/*.test.js',
            ':(exclude)**/*.test.jsx',
            ':(exclude)docs/**',
            ':(exclude)_wip/**',
            ':(exclude).claude/**',
            ':(exclude)node_modules/**',
            ':(exclude)**/node_modules/**',
            ':(exclude)**/dist/**',
            ':(exclude)**/.next/**',
          ],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        );
        matchedFiles = out
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
      } catch (err: unknown) {
        // `git grep` exits 1 when there are no matches — that's the success
        // path (no violations). Re-throw anything else.
        const status = (err as { status?: number }).status;
        if (status !== 1) throw err;
      }

      const ALLOWLIST = new Set([
        // The helper itself
        'packages/test-utils/src/lib/neon-mock.ts',
        // Public barrel export
        'packages/test-utils/src/index.ts',
        // Public docs for the helper
        'packages/test-utils/README.md',
        // API test-utils factory wraps `createMockDb` for jest.mock factories
        'apps/api/src/test-utils/database-module.ts',
        // This guard file itself (mentions the symbol in messages)
        'packages/test-utils/src/lib/neon-mock.guard.test.ts',
      ]);

      const violators = matchedFiles
        // Normalise Windows paths from `git grep` (forward slashes already on
        // most git versions, but be safe).
        .map((f) => f.replace(/\\/g, '/'))
        .filter((f) => !ALLOWLIST.has(f));

      if (violators.length > 0) {
        throw new Error(
          'createMockDb is being imported/referenced from a non-test, non-allowlisted file. ' +
            'See packages/test-utils/src/lib/neon-mock.ts header — this mock silently ' +
            'resolves every query to empty results and must never reach production code. ' +
            'Violators:\n' +
            violators.map((v) => `  - ${v}`).join('\n') +
            '\n\nIf the file is legitimately a test helper, rename it to *.test.* or ' +
            'add it to the ALLOWLIST in this file with a short justification.',
        );
      }
    },
  );
});
