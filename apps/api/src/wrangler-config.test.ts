/**
 * Config-shape guard tests for apps/api/wrangler.toml
 *
 * These tests catch wrangler.toml misconfigurations that would otherwise only
 * surface at deploy time or at runtime on Cloudflare. Regex-based assertions
 * are used to avoid adding a TOML parser devDependency for a config-only guard.
 *
 * Guards:
 *   BUG-783 / BUG-724 [CFG-3] — production workers_dev must be false so the
 *     worker is not reachable at *.workers.dev (which bypasses WAF / rate-limit
 *     rules on the custom domain).
 *   BUG-784            [CFG-4] — when a root [[kv_namespaces]] block declares
 *     preview_id, it must differ from id. Equal IDs cause `wrangler dev --remote`
 *     to write to the live namespace, polluting production KV with dev data.
 *   CFG-13 — public API origins must use the configured custom domains, not
 *     legacy workers.dev URLs that bypass custom-domain WAF/routing assumptions.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WRANGLER_TOML_PATH = join(__dirname, '..', 'wrangler.toml');
const DEPLOY_WORKFLOW_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'deploy.yml',
);

function getTableSection(toml: string, tableName: string): string {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const section = toml.match(
    new RegExp(`^\\[${escaped}\\]([\\s\\S]*?)(?=^\\[|$(?![\\r\\n]))`, 'm'),
  );
  if (!section) {
    throw new Error(`Missing wrangler.toml section [${tableName}]`);
  }
  const tableBody = section[1];
  if (tableBody === undefined) {
    throw new Error(`Missing wrangler.toml section body [${tableName}]`);
  }
  return tableBody;
}

describe('wrangler.toml config guards', () => {
  let content: string;
  let deployWorkflow: string;

  beforeAll(() => {
    content = readFileSync(WRANGLER_TOML_PATH, 'utf-8');
    deployWorkflow = readFileSync(DEPLOY_WORKFLOW_PATH, 'utf-8');
  });

  describe('[CFG-3] production workers_dev', () => {
    it('production block contains workers_dev = false', () => {
      const productionSection = content.match(
        /\[env\.production\]([\s\S]*?)(?=^\[env\.|^\[\[|$(?![\r\n]))/m,
      );
      expect(productionSection).not.toBeNull();

      // workers_dev must be explicitly false. Wrangler defaults to true on
      // missing key, so absence is also a failure here.
      const workersDev = productionSection![1]!.match(
        /^workers_dev\s*=\s*(\S+)/m,
      );
      expect(workersDev).not.toBeNull();
      expect(workersDev![1]).toBe('false');
    });

    it('production block has a custom domain route configured', () => {
      const productionSection = content.match(
        /\[env\.production\]([\s\S]*?)(?=^\[env\.|^\[\[|$(?![\r\n]))/m,
      );
      expect(productionSection).not.toBeNull();
      expect(productionSection![1]).toMatch(/routes\s*=/);
      expect(productionSection![1]).toMatch(/api\.mentomate\.com/);
    });
  });

  describe('[CFG-H1] staging workers_dev', () => {
    // Staging must also set workers_dev = false to prevent the worker being
    // reachable at *.workers.dev — which bypasses WAF and rate-limiting rules
    // applied on the custom-domain route. See H1 in config-secrets review.
    it('staging block contains workers_dev = false', () => {
      const stagingSection = content.match(
        /\[env\.staging\]([\s\S]*?)(?=^\[env\.|$(?![\r\n]))/m,
      );
      expect(stagingSection).not.toBeNull();

      const workersDev = stagingSection![1]!.match(/^workers_dev\s*=\s*(\S+)/m);
      expect(workersDev).not.toBeNull();
      expect(workersDev![1]).toBe('false');
    });
  });

  describe('[WI-1865] deployed Inngest mode', () => {
    it('explicitly selects cloud mode in staging and production', () => {
      const stagingVars = getTableSection(content, 'env.staging.vars');
      const productionVars = getTableSection(content, 'env.production.vars');

      expect(stagingVars).toMatch(/^INNGEST_DEV\s*=\s*"false"/m);
      expect(productionVars).toMatch(/^INNGEST_DEV\s*=\s*"false"/m);
    });

    it('does not force cloud mode for local development', () => {
      const localVars = getTableSection(content, 'vars');

      expect(localVars).not.toMatch(/^INNGEST_DEV\s*=/m);
    });
  });

  describe('[CFG-4] root kv_namespaces preview_id !== id', () => {
    function getRootSection(toml: string): string {
      const firstEnvIdx = toml.search(/^\[env\./m);
      return firstEnvIdx >= 0 ? toml.slice(0, firstEnvIdx) : toml;
    }

    function findKvBlock(root: string, binding: string): string | null {
      const re = new RegExp(
        `\\[\\[kv_namespaces\\]\\][\\s\\S]*?binding\\s*=\\s*"${binding}"([\\s\\S]*?)(?=\\[\\[kv_namespaces\\]\\]|$)`,
      );
      const m = root.match(re);
      return m ? m[0] : null;
    }

    function checkBlock(block: string): void {
      const idMatch = block.match(/^id\s*=\s*"([^"]+)"/m);
      const previewIdMatch = block.match(/^preview_id\s*=\s*"([^"]+)"/m);

      expect(idMatch).not.toBeNull();

      // preview_id is optional. When absent, `wrangler dev --remote` errors
      // fast (safe). When present, it must NOT equal id — equal IDs would
      // pollute the live namespace with dev test data.
      if (previewIdMatch) {
        expect(previewIdMatch[1]).not.toBe(idMatch![1]);
      }
    }

    it('root SUBSCRIPTION_KV preview_id, if defined, differs from id', () => {
      const block = findKvBlock(getRootSection(content), 'SUBSCRIPTION_KV');
      expect(block).not.toBeNull();
      checkBlock(block!);
    });

    it('root COACHING_KV preview_id, if defined, differs from id', () => {
      const block = findKvBlock(getRootSection(content), 'COACHING_KV');
      expect(block).not.toBeNull();
      checkBlock(block!);
    });
  });

  describe('[CFG-13] custom domain origins', () => {
    it('staging API_ORIGIN uses the staging custom domain', () => {
      const stagingVars = getTableSection(content, 'env.staging.vars');
      expect(stagingVars).toMatch(
        /^API_ORIGIN\s*=\s*"https:\/\/api-stg\.mentomate\.com"/m,
      );
      expect(stagingVars).not.toMatch(/workers\.dev/);
    });

    it('production API_ORIGIN uses the production custom domain', () => {
      const productionVars = getTableSection(content, 'env.production.vars');
      expect(productionVars).toMatch(
        /^API_ORIGIN\s*=\s*"https:\/\/api\.mentomate\.com"/m,
      );
      expect(productionVars).not.toMatch(/workers\.dev/);
    });
  });

  describe('[WI-84 DS-042] IDEMPOTENCY_KV deploy safety', () => {
    function hasEnvBinding(envName: 'staging' | 'production'): boolean {
      const blocks = content.matchAll(
        new RegExp(
          `^\\[\\[env\\.${envName}\\.kv_namespaces\\]\\]([\\s\\S]*?)(?=^\\[\\[|^\\[env\\.|$)`,
          'gm',
        ),
      );
      return Array.from(blocks).some((block) => {
        const body = block[1] ?? '';
        const binding = body.match(/^binding\s*=\s*"([^"]+)"/m)?.[1];
        const id = body.match(/^id\s*=\s*"([^"<][^"]+)"/m)?.[1];
        return binding === 'IDEMPOTENCY_KV' && Boolean(id);
      });
    }

    function deployWorkflowBlocksMissingBinding(): boolean {
      const guardIndex = deployWorkflow.indexOf(
        'verify-wrangler-kv-binding.mjs',
      );
      const deployIndex = deployWorkflow.indexOf('wrangler deploy');
      return guardIndex >= 0 && deployIndex >= 0 && guardIndex < deployIndex;
    }

    function deployWorkflowBlocksBeforeMigrations(): boolean {
      const guardIndex = deployWorkflow.indexOf(
        'verify-wrangler-kv-binding.mjs',
      );
      const migrateIndex = deployWorkflow.indexOf(
        '- name: Run database migrations',
      );
      return guardIndex >= 0 && migrateIndex >= 0 && guardIndex < migrateIndex;
    }

    it('staging either declares IDEMPOTENCY_KV or the deploy workflow blocks missing binding', () => {
      expect(
        hasEnvBinding('staging') || deployWorkflowBlocksMissingBinding(),
      ).toBe(true);
    });

    it('production either declares IDEMPOTENCY_KV or the deploy workflow blocks missing binding', () => {
      expect(
        hasEnvBinding('production') || deployWorkflowBlocksMissingBinding(),
      ).toBe(true);
    });

    it('[WI-84 review] blocks missing IDEMPOTENCY_KV before migrations run', () => {
      const guardBeforeMigrations = deployWorkflowBlocksBeforeMigrations();
      if (!hasEnvBinding('staging')) expect(guardBeforeMigrations).toBe(true);
      if (!hasEnvBinding('production')) {
        expect(guardBeforeMigrations).toBe(true);
      }
    });
  });

  describe('[WI-84 automated review] deploy workflow checkout safety', () => {
    it('disables persisted GitHub credentials for every checkout step', () => {
      const checkoutSteps = deployWorkflow.matchAll(
        /^\s+- uses: actions\/checkout@[^\n]+(?:\n\s{8,}[^\n]+)*/gm,
      );

      const unsafeSteps = Array.from(checkoutSteps)
        .map((match) => match[0])
        .filter((step) => !/^\s+persist-credentials:\s+false\s*$/m.test(step));

      expect(unsafeSteps).toEqual([]);
    });
  });
});
