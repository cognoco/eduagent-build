import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Lint governance self-tests for the API package.
//
// CLAUDE.md "Non-Negotiable Engineering Rules" delegates several invariants to
// flat-config ESLint rules in eslint.config.mjs (root). A self-test that only
// proves "lint passes clean" verifies absence-of-false-positives but not that
// the rules actually fire on real violations. This file pipes synthetic
// snippets through the real ESLint CLI (via --stdin / --stdin-filename) and
// asserts each governance rule trips on the exact construct it is meant to
// catch.
//
// G1 — drizzle-orm imports banned in routes
// G3 — direct LLM provider SDK imports banned outside services/llm/providers
// G4 — raw process.env reads banned in API production code
// G5 — c.get('db').select/.insert/.update/.delete banned in routes
//
// We invoke the CLI rather than the ESLint Node API because flat config is
// loaded via native dynamic import, which Jest's CommonJS runtime does not
// support without --experimental-vm-modules. Spawning the binary keeps the
// test self-contained.
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ESLINT_BIN = path.join(
  REPO_ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'eslint.cmd' : 'eslint'
);

interface LintMessage {
  ruleId: string | null;
  message: string;
  severity: number;
}

interface LintResult {
  filePath: string;
  messages: LintMessage[];
  errorCount: number;
}

function lint(filePath: string, source: string): LintResult {
  // shell:true is required on Windows so .cmd shims (eslint.cmd) resolve.
  const proc = spawnSync(
    ESLINT_BIN,
    ['--stdin', '--stdin-filename', filePath, '--format', 'json'],
    {
      cwd: REPO_ROOT,
      input: source,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }
  );

  if (proc.error) {
    throw new Error(`Failed to spawn eslint: ${proc.error.message}`);
  }
  // eslint exits 1 when violations are reported; stdout still contains JSON.
  if (!proc.stdout) {
    throw new Error(
      `eslint produced no stdout. status=${proc.status} stderr=${proc.stderr}`
    );
  }
  const results = JSON.parse(proc.stdout) as LintResult[];
  if (results.length !== 1) {
    throw new Error(`Expected one lint result, got ${results.length}`);
  }
  return results[0];
}

function messageHits(result: LintResult, needle: string): LintMessage[] {
  return result.messages.filter((m) => m.message.includes(needle));
}

describe('eslint governance rules — self-test', () => {
  describe('G1: drizzle-orm imports banned in routes', () => {
    const routePath = path.join(
      REPO_ROOT,
      'apps/api/src/routes/__selftest_g1.ts'
    );

    it('flags `import { eq } from "drizzle-orm"` in a route file', () => {
      const result = lint(
        routePath,
        `import { eq } from 'drizzle-orm';\nexport const x = eq;\n`
      );
      expect(
        messageHits(result, 'Route files must not import drizzle-orm').length
      ).toBeGreaterThan(0);
    });

    it('flags `import x from "drizzle-orm/pg-core"` (pattern group)', () => {
      const result = lint(
        routePath,
        `import { pgTable } from 'drizzle-orm/pg-core';\nexport const t = pgTable;\n`
      );
      expect(
        messageHits(result, 'Route files must not import drizzle-orm').length
      ).toBeGreaterThan(0);
    });

    it('does NOT flag drizzle-orm imports in services/', () => {
      const servicePath = path.join(
        REPO_ROOT,
        'apps/api/src/services/__selftest_g1_service.ts'
      );
      const result = lint(
        servicePath,
        `import { eq } from 'drizzle-orm';\nexport const x = eq;\n`
      );
      expect(
        messageHits(result, 'Route files must not import drizzle-orm').length
      ).toBe(0);
    });
  });

  describe('G3: direct LLM SDK imports banned outside services/llm/providers', () => {
    const inServicesPath = path.join(
      REPO_ROOT,
      'apps/api/src/services/__selftest_g3.ts'
    );
    const inProvidersPath = path.join(
      REPO_ROOT,
      'apps/api/src/services/llm/providers/__selftest_g3_provider.ts'
    );

    it('flags `import Anthropic from "@anthropic-ai/sdk"` outside providers/', () => {
      const result = lint(
        inServicesPath,
        `import Anthropic from '@anthropic-ai/sdk';\nexport const A = Anthropic;\n`
      );
      expect(
        messageHits(result, 'Import the LLM router from services/llm').length
      ).toBeGreaterThan(0);
    });

    it('flags `import OpenAI from "openai"` outside providers/', () => {
      const result = lint(
        inServicesPath,
        `import OpenAI from 'openai';\nexport const O = OpenAI;\n`
      );
      expect(
        messageHits(result, 'Import the LLM router from services/llm').length
      ).toBeGreaterThan(0);
    });

    it('does NOT flag SDK imports inside services/llm/providers/', () => {
      const result = lint(
        inProvidersPath,
        `import Anthropic from '@anthropic-ai/sdk';\nexport const A = Anthropic;\n`
      );
      expect(
        messageHits(result, 'Import the LLM router from services/llm').length
      ).toBe(0);
    });
  });

  describe('G4: raw process.env reads banned in API production code', () => {
    const prodPath = path.join(
      REPO_ROOT,
      'apps/api/src/services/__selftest_g4.ts'
    );
    const testPath = path.join(
      REPO_ROOT,
      'apps/api/src/services/__selftest_g4.test.ts'
    );
    const configPath = path.join(REPO_ROOT, 'apps/api/src/config.ts');

    it('flags `process.env.FOO` in a production source file', () => {
      const result = lint(prodPath, `export const foo = process.env.FOO;\n`);
      expect(
        messageHits(result, 'Use the typed config object').length
      ).toBeGreaterThan(0);
    });

    it('does NOT flag process.env in a colocated *.test.ts file', () => {
      const result = lint(testPath, `export const foo = process.env.FOO;\n`);
      expect(messageHits(result, 'Use the typed config object').length).toBe(0);
    });

    it('does NOT flag process.env inside the config.ts allow-list entry', () => {
      const result = lint(configPath, `export const foo = process.env.FOO;\n`);
      expect(messageHits(result, 'Use the typed config object').length).toBe(0);
    });
  });

  describe('G5: route files must not call .select/.insert/.update/.delete on c.get("db")', () => {
    const routePath = path.join(
      REPO_ROOT,
      'apps/api/src/routes/__selftest_g5.ts'
    );

    // The G5 rule emits a single shared message
    // ("Route files must not call .select/.insert/.update/.delete…") for all
    // four operations. To prove each operation independently trips the rule,
    // every test below lints a source containing ONLY that one call — so a
    // non-zero hit count is necessarily attributable to the named operation.
    for (const op of ['select', 'insert', 'update', 'delete'] as const) {
      it(`flags \`c.get("db").${op}()\` inside a route`, () => {
        const result = lint(
          routePath,
          `export const handler = (c: any) => c.get('db').${op}();\n`
        );
        expect(
          messageHits(
            result,
            'Route files must not call .select/.insert/.update/.delete'
          ).length
        ).toBeGreaterThan(0);
      });
    }
  });
});
