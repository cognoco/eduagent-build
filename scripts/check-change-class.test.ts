import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const BASH =
  process.platform === 'win32'
    ? 'C:\\Program Files\\Git\\bin\\bash.exe'
    : 'bash';

const NARROW_ROUTER_FLAGS = [
  'postinstall_safety',
  'root_deps',
  'i18n_jsx_literals',
  'inngest_admin',
  'prompt_markers',
  'no_clinical_copy',
  'no_gemini_runtime',
  'mode_nav_flag_combo',
  'test_only_exports',
  'workflow_security',
  'api_script_guards',
  'database_script_guards',
] as const;

/**
 * Clones the given base env (default: process.env) with every GIT_* key
 * stripped. Prevents an ambient GIT_DIR (e.g. exported by husky during
 * pre-push -> nx -> jest) from leaking into these child git/bash processes
 * and redirecting them at the ambient repo instead of the mkdtemp fixture
 * passed as `cwd` (WI-1345 sweep). Same pattern as
 * scripts/check-merge-invariant.test.ts's childGitEnv().
 */
function childGitEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) {
      delete env[key];
    }
  }
  return env;
}

function git(repo: string, args: string[]): void {
  execFileSync('git', args, {
    cwd: repo,
    stdio: 'ignore',
    env: childGitEnv(),
  });
}

function runChangeClass(
  repo: string,
  args: string[],
  options: Omit<ExecFileSyncOptions, 'cwd'> = {},
): Buffer | string {
  const command = [
    options.env?.GITHUB_OUTPUT
      ? `GITHUB_OUTPUT=${shellQuote(toBashPath(String(options.env.GITHUB_OUTPUT)))}`
      : '',
    ['./scripts/check-change-class.sh', ...args].map(shellQuote).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
  return execFileSync(BASH, ['-c', command], {
    cwd: repo,
    ...options,
    env: childGitEnv(options.env),
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toBashPath(path: string): string {
  if (process.platform !== 'win32') return path;
  return path
    .replace(/^([A-Za-z]):\\/, (_, drive: string) => {
      return `/${drive.toLowerCase()}/`;
    })
    .replace(/\\/g, '/');
}

function removeTempRepo(path: string): void {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          (error as NodeJS.ErrnoException).code === 'EBUSY'
        )
      ) {
        throw error;
      }
      if (attempt === 19) {
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

describe('check-change-class.sh', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'check-change-class-'));
    mkdirSync(join(repo, 'scripts', 'lib'), { recursive: true });
    cpSync(
      join(__dirname, 'check-change-class.sh'),
      join(repo, 'scripts', 'check-change-class.sh'),
    );
    cpSync(
      join(__dirname, 'lib', 'i18n-change-detection.sh'),
      join(repo, 'scripts', 'lib', 'i18n-change-detection.sh'),
    );
    chmodSync(join(repo, 'scripts', 'check-change-class.sh'), 0o755);

    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 'test@example.com']);
    git(repo, ['config', 'user.name', 'Test User']);
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(
      join(repo, 'src', 'unclassified.ts'),
      'export const a = 1;\n',
    );
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'init']);
  });

  afterEach(() => {
    removeTempRepo(repo);
  });

  it('requires the Husky typecheck gate for any changed TypeScript file', () => {
    writeFileSync(
      join(repo, 'src', 'unclassified.ts'),
      'export const a = 2;\n',
    );

    const output = runChangeClass(repo, ['--branch'], {
      encoding: 'utf8',
    });

    expect(output).toContain('typescript');
    expect(output).toContain('pnpm exec tsc --build');
  });

  it('executes the Husky typecheck gate in --run mode for TypeScript changes', () => {
    writeFileSync(
      join(repo, 'src', 'unclassified.ts'),
      'export const a = 3;\n',
    );

    const binDir = join(repo, 'bin');
    mkdirSync(binDir, { recursive: true });
    const pnpmLog = join(repo, 'pnpm-calls.log');
    const fakePnpm = join(binDir, 'pnpm');
    writeFileSync(
      fakePnpm,
      [
        '#!/usr/bin/env sh',
        'printf "%s\\n" "$*" >> "$PNPM_LOG"',
        'exit 0',
        '',
      ].join('\n'),
    );
    chmodSync(fakePnpm, 0o755);

    const output = runChangeClass(repo, ['--branch', '--run'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${toBashPath(binDir)}:${process.env.PATH ?? ''}`,
        PNPM_LOG: toBashPath(pnpmLog),
      },
    });

    expect(output).toContain('Results: 1 passed, 0 failed');
    expect(readFileSync(pnpmLog, 'utf8')).toContain('exec tsc --build');
  });

  // ── --github-output router mode (WI-452) ──────────────────────────────
  // The flags emitted here gate slow CI suites (ci.yml integration tests,
  // api-quality-gate eval steps). A regression that silently emits =false
  // skips a gating suite, so each direction is pinned.

  function runRouter(cwd: string): Record<string, string> {
    const outFile = join(cwd, 'github-output.txt');
    writeFileSync(outFile, '');
    runChangeClass(cwd, ['--branch', '--github-output'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: toBashPath(outFile) },
    });
    return Object.fromEntries(
      readFileSync(outFile, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('=', 2) as [string, string]),
    );
  }

  it('emits integration=true when a class mapping to integration tests is touched', () => {
    mkdirSync(join(repo, 'packages', 'database', 'src', 'schema'), {
      recursive: true,
    });
    writeFileSync(
      join(repo, 'packages', 'database', 'src', 'schema', 'users.ts'),
      'export const users = {};\n',
    );
    git(repo, ['add', '.']); // new files must be tracked to appear in the diff

    const flags = runRouter(repo);
    expect(flags.classes).toContain('db-schema');
    expect(flags.integration).toBe('true');
  });

  it('routes API migration SQL changes through db migrations and database RLS tests', () => {
    mkdirSync(join(repo, 'apps', 'api', 'drizzle'), {
      recursive: true,
    });
    writeFileSync(
      join(repo, 'apps', 'api', 'drizzle', '9999_uncovered_profile_table.sql'),
      'CREATE TABLE uncovered_profile_table (profile_id uuid NOT NULL);\n',
    );
    git(repo, ['add', '.']);

    const flags = runRouter(repo);
    expect(flags.classes).toContain('db-migrations');
    expect(flags.integration).toBe('true');
    expect(flags.database).toBe('true');

    const output = runChangeClass(repo, ['--branch'], {
      encoding: 'utf8',
    });
    expect(output).toContain('pnpm db:push:dev');
    expect(output).toContain('pnpm exec nx run @eduagent/database:test');
    expect(output).toContain('pnpm test:api:integration');
  });

  it('routes meta-only drizzle diffs (no .sql file) through db migrations (WI-1846)', () => {
    mkdirSync(join(repo, 'apps', 'api', 'drizzle', 'meta'), {
      recursive: true,
    });
    writeFileSync(
      join(repo, 'apps', 'api', 'drizzle', 'meta', '0999_snapshot.json'),
      '{}\n',
    );
    git(repo, ['add', '.']);

    const flags = runRouter(repo);
    expect(flags.classes).toContain('db-migrations');
    expect(flags.database).toBe('true');
  });

  it('emits eval=true when prompt builders are touched, including services/llm subdirectories', () => {
    mkdirSync(
      join(repo, 'apps', 'api', 'src', 'services', 'llm', 'providers'),
      { recursive: true },
    );
    writeFileSync(
      join(
        repo,
        'apps',
        'api',
        'src',
        'services',
        'llm',
        'providers',
        'cerebras.ts',
      ),
      'export const p = 1;\n',
    );
    git(repo, ['add', '.']);

    const flags = runRouter(repo);
    expect(flags.classes).toContain('llm-prompts');
    expect(flags.eval).toBe('true');
  });

  // ── llm-routing class command resolves to a real script (WI-1795) ───────
  // The llm-routing class emits a `pnpm <script>` command that gates the
  // premium-routing pass. A regression that names an unregistered script makes
  // --run fail/no-op and misleads a human reading the advisory output. Pin that
  // the emitted script name is actually registered in package.json.
  it('routes llm-routing changes to a registered package.json script', () => {
    mkdirSync(join(repo, 'apps', 'api', 'src', 'services'), {
      recursive: true,
    });
    writeFileSync(
      join(repo, 'apps', 'api', 'src', 'services', 'subscription.ts'),
      'export const s = 1;\n',
    );
    git(repo, ['add', '.']);

    const output = String(
      runChangeClass(repo, ['--branch'], { encoding: 'utf8' }),
    );
    expect(output).toContain('llm-routing');

    // Extract the `pnpm <script>` the class schedules and assert it resolves to
    // a real, invocable target in the repo's package.json.
    const match = output.match(/pnpm (test:llm:[\w-]+)/);
    expect(match).not.toBeNull();
    const scriptName = match![1];

    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
    );
    expect(pkg.scripts[scriptName]).toBeDefined();
  });

  it('emits integration=true for a lockfile-only change (dependencies class)', () => {
    writeFileSync(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    git(repo, ['add', '.']);

    const flags = runRouter(repo);
    expect(flags.classes).toContain('dependencies');
    expect(flags.integration).toBe('true');
  });

  // WI-1992: a service-only diff (apps/api/src/services/**, non-prompt) only
  // ever scheduled test:api:unit, so the CI change-class router's `integration`
  // output stayed false for exactly the class the audit's security-fix break
  // tests need (tests/integration/ + apps/api/src/**/*.integration.test.ts
  // never ran). Sibling classes (api-routes, api-middleware) already schedule
  // both; api-services was the gap.
  it('routes a service-only diff through the API integration suites (api-services class)', () => {
    mkdirSync(join(repo, 'apps', 'api', 'src', 'services'), {
      recursive: true,
    });
    writeFileSync(
      join(repo, 'apps', 'api', 'src', 'services', 'streak.ts'),
      'export const s = 1;\n',
    );
    git(repo, ['add', '.']);

    const output = runChangeClass(repo, ['--branch'], { encoding: 'utf8' });
    expect(output).toContain('api-services');
    expect(output).toContain('pnpm test:api:integration');

    const flags = runRouter(repo);
    expect(flags.classes).toContain('api-services');
    expect(flags.integration).toBe('true');
  });

  it('emits false flags for an unclassified-only change', () => {
    writeFileSync(join(repo, 'notes.txt'), 'hello\n');
    git(repo, ['add', '.']);

    const flags = runRouter(repo);
    expect(flags.integration).toBe('false');
    expect(flags.eval).toBe('false');
    expect(flags.database).toBe('false');
    expect(flags.docs_only).toBe('false');
    for (const flag of NARROW_ROUTER_FLAGS) {
      expect(flags[flag]).toBe('false');
    }
  });

  it('routes API TypeScript changes through the no-Gemini-runtime ratchet', () => {
    mkdirSync(join(repo, 'apps', 'api', 'src', 'services'), {
      recursive: true,
    });
    writeFileSync(
      join(repo, 'apps', 'api', 'src', 'services', 'provider-policy.ts'),
      'export const providerPolicy = true;\n',
    );
    git(repo, ['add', '.']);

    const output = runChangeClass(repo, ['--branch'], { encoding: 'utf8' });
    expect(output).toContain('no-gemini-runtime');
    expect(output).toContain('pnpm check:no-gemini-runtime');

    const flags = runRouter(repo);
    expect(flags.no_gemini_runtime).toBe('true');
  });

  it.each([
    'scripts/provider-tool.ts',
    'scripts/no-gemini-runtime-baseline.json',
  ])('routes %s through the no-Gemini-runtime ratchet', (file) => {
    const fullPath = join(repo, file);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, 'fixture\n');
    git(repo, ['add', '.']);

    const output = runChangeClass(repo, ['--branch'], { encoding: 'utf8' });
    expect(output).toContain('pnpm check:no-gemini-runtime');
    expect(runRouter(repo).no_gemini_runtime).toBe('true');
  });

  it('does not route unrelated mobile TypeScript through the no-Gemini-runtime ratchet', () => {
    mkdirSync(join(repo, 'apps', 'mobile', 'src', 'lib'), { recursive: true });
    writeFileSync(
      join(repo, 'apps', 'mobile', 'src', 'lib', 'theme.ts'),
      'export const theme = true;\n',
    );
    git(repo, ['add', '.']);

    const output = runChangeClass(repo, ['--branch'], { encoding: 'utf8' });
    expect(output).not.toContain('no-gemini-runtime');
    expect(output).not.toContain('pnpm check:no-gemini-runtime');
    expect(runRouter(repo).no_gemini_runtime).toBe('false');
  });

  it('routes deletion of the no-Gemini baseline through the ratchet', () => {
    const baseline = join(repo, 'scripts', 'no-gemini-runtime-baseline.json');
    writeFileSync(baseline, '[]\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'add baseline']);
    rmSync(baseline);

    const output = runChangeClass(repo, ['--branch'], { encoding: 'utf8' });
    expect(output).toContain('no-gemini-runtime');
    expect(runRouter(repo).no_gemini_runtime).toBe('true');
  });

  it('routes both sides of a no-Gemini baseline rename instead of treating the destination as docs-only', () => {
    const baseline = join(repo, 'scripts', 'no-gemini-runtime-baseline.json');
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(baseline, '[]\n');
    git(repo, ['add', '.']);
    git(repo, ['commit', '-m', 'add baseline']);
    git(repo, [
      'mv',
      'scripts/no-gemini-runtime-baseline.json',
      'docs/renamed-baseline.json',
    ]);

    const flags = runRouter(repo);
    expect(flags.no_gemini_runtime).toBe('true');
    expect(flags.docs_only).toBe('false');
  });

  it.each([
    {
      name: 'postinstall safety',
      file: 'package.json',
      className: 'postinstall-safety',
      command: 'pnpm verify:postinstall-safety',
      flag: 'postinstall_safety',
    },
    {
      name: 'root dependencies',
      file: 'package.json',
      className: 'root-deps',
      command: 'pnpm check:root-deps',
      flag: 'root_deps',
    },
    {
      name: 'hardcoded JSX literals',
      file: 'apps/mobile/src/components/Card.tsx',
      className: 'i18n-jsx-literals',
      command: 'pnpm check:i18n:jsx-literals',
      flag: 'i18n_jsx_literals',
    },
    {
      name: 'Inngest admin annotations',
      file: 'apps/api/src/inngest/functions/refresh.ts',
      className: 'inngest-admin',
      command: 'pnpm exec tsx scripts/check-inngest-admin.ts',
      flag: 'inngest_admin',
    },
    {
      name: 'prompt markers',
      file: 'apps/api/src/services/exchange-prompts.ts',
      className: 'prompt-markers',
      command: 'bash scripts/check-prompt-markers.sh',
      flag: 'prompt_markers',
    },
    {
      name: 'clinical copy',
      file: 'apps/mobile/src/i18n/locales/en.json',
      className: 'no-clinical-copy',
      command: 'pnpm check:no-clinical-copy',
      flag: 'no_clinical_copy',
    },
    {
      name: 'MODE_NAV flag combinations',
      file: 'apps/mobile/eas.json',
      className: 'mode-nav-flag-combo',
      command: 'pnpm check:mode-nav-flag-combo',
      flag: 'mode_nav_flag_combo',
    },
    {
      name: 'test-only exports',
      file: 'packages/example/src/index.ts',
      className: 'test-only-exports',
      command:
        'pnpm exec jest --config scripts/jest.config.cjs scripts/check-test-only-exports.test.ts --no-coverage',
      flag: 'test_only_exports',
    },
    {
      name: 'workflow security',
      file: '.github/actions/local/action.yml',
      className: 'workflow-security',
      command: 'pnpm check:github-workflow-security',
      flag: 'workflow_security',
    },
    {
      name: 'API script guards',
      file: 'apps/api/scripts/verify-wrangler-kv-binding.mjs',
      className: 'api-script-guards',
      command:
        'node --test apps/api/scripts/verify-wrangler-kv-binding.test.mjs',
      flag: 'api_script_guards',
    },
    {
      name: 'database script guards',
      file: 'packages/database/scripts/check-db-push-target.mjs',
      className: 'database-script-guards',
      command:
        'node --test packages/database/scripts/check-db-push-target.test.mjs',
      flag: 'database_script_guards',
    },
    {
      name: 'identity FK script guards',
      file: 'packages/database/scripts/check-identity-fk-drift.mjs',
      className: 'database-script-guards',
      command:
        'node --test packages/database/scripts/check-identity-fk-drift.test.mjs',
      flag: 'database_script_guards',
    },
  ])(
    'routes the narrow $name check through its bounded input surface',
    ({ file, className, command, flag }) => {
      const fullPath = join(repo, file);
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, 'fixture\n');
      git(repo, ['add', '.']);

      const output = runChangeClass(repo, ['--branch'], { encoding: 'utf8' });
      expect(output).toContain(className);
      expect(output).toContain(command);
      expect(runRouter(repo)[flag]).toBe('true');
    },
  );

  it('routes root package script wiring through every package-script-backed ratchet', () => {
    writeFileSync(join(repo, 'package.json'), '{"scripts":{}}\n');
    git(repo, ['add', 'package.json']);

    const flags = runRouter(repo);
    expect(flags.i18n_jsx_literals).toBe('true');
    expect(flags.no_clinical_copy).toBe('true');
    expect(flags.no_gemini_runtime).toBe('true');
    expect(flags.mode_nav_flag_combo).toBe('true');
    expect(flags.workflow_security).toBe('true');
  });

  it('routes the CI workflow bootstrap through every narrow guard', () => {
    const workflow = join(repo, '.github', 'workflows', 'ci.yml');
    mkdirSync(join(workflow, '..'), { recursive: true });
    writeFileSync(workflow, 'name: CI\n');
    git(repo, ['add', '.github/workflows/ci.yml']);

    const flags = runRouter(repo);
    for (const flag of NARROW_ROUTER_FLAGS) {
      expect(flags[flag]).toBe('true');
    }
  });

  it.each([
    ['scripts/verify-no-secret-postinstall.cjs', 'postinstall_safety'],
    ['scripts/check-no-mobile-deps-at-root.cjs', 'root_deps'],
    ['scripts/i18n-jsx-literals-baseline.json', 'i18n_jsx_literals'],
    ['scripts/check-inngest-admin.ts', 'inngest_admin'],
    ['scripts/check-prompt-markers.sh', 'prompt_markers'],
    ['scripts/no-clinical-copy-baseline.json', 'no_clinical_copy'],
    ['scripts/mode-nav-flag-combo-baseline.json', 'mode_nav_flag_combo'],
    ['scripts/check-test-only-exports.test.ts', 'test_only_exports'],
    ['scripts/jest.config.cjs', 'test_only_exports'],
    ['scripts/check-github-workflow-security.ts', 'workflow_security'],
    [
      'apps/api/scripts/verify-wrangler-kv-binding.test.mjs',
      'api_script_guards',
    ],
    [
      'packages/database/scripts/verify-db-target-lib.mjs',
      'database_script_guards',
    ],
  ])('routes narrow-check maintenance input %s', (file, flag) => {
    const fullPath = join(repo, file);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, 'fixture\n');
    git(repo, ['add', '.']);

    expect(runRouter(repo)[flag]).toBe('true');
  });

  it('gates every narrow PR check on the early scope output while preserving push behavior', () => {
    const workflow = parseYaml(
      readFileSync(
        join(__dirname, '..', '.github', 'workflows', 'ci.yml'),
        'utf8',
      ),
    ) as {
      jobs?: { main?: { steps?: Array<{ name?: string; if?: string }> } };
    };
    const steps = workflow.jobs?.main?.steps ?? [];
    const gates: Record<string, string> = {
      'Verify postinstall safety': 'postinstall_safety',
      'Root package.json — no mobile-only deps': 'root_deps',
      'i18n hardcoded-JSX-literal check': 'i18n_jsx_literals',
      'Inngest @inngest-admin annotation guard (WI-1075)': 'inngest_admin',
      'Prompt marker-token check': 'prompt_markers',
      'No-clinical-copy ratchet (G11)': 'no_clinical_copy',
      'No-Gemini-runtime ratchet (Phase A)': 'no_gemini_runtime',
      'MODE_NAV flag-combo ratchet (R9)': 'mode_nav_flag_combo',
      'Test-only-exports ratchet (G11)': 'test_only_exports',
      'GitHub workflow supply-chain check': 'workflow_security',
      'apps/api/scripts node:test guards (KV-binding verifier)':
        'api_script_guards',
      'packages/database/scripts node:test guards': 'database_script_guards',
    };

    expect(Object.keys(gates)).toHaveLength(NARROW_ROUTER_FLAGS.length);
    for (const [name, flag] of Object.entries(gates)) {
      const step = steps.find((candidate) => candidate.name === name);
      expect(step).toBeDefined();
      expect(step?.if).toBe(
        `github.event_name == 'push' || (github.event_name == 'pull_request' && steps.scope.outputs.${flag} == 'true')`,
      );
      expect(step?.if).not.toContain('steps.change-class.outputs');
    }
  });

  it('emits docs_only=true for docs and editor metadata changes', () => {
    mkdirSync(join(repo, 'docs'), { recursive: true });
    mkdirSync(join(repo, '_wip'), { recursive: true });
    mkdirSync(join(repo, '.claude'), { recursive: true });
    mkdirSync(join(repo, '.vscode'), { recursive: true });
    mkdirSync(join(repo, '.idea'), { recursive: true });
    writeFileSync(join(repo, 'README.md'), '# Hello\n');
    writeFileSync(join(repo, 'docs', 'guide.md'), '# Guide\n');
    writeFileSync(join(repo, '_wip', 'note.md'), '# Note\n');
    writeFileSync(join(repo, '.claude', 'settings.json'), '{}\n');
    writeFileSync(join(repo, '.vscode', 'settings.json'), '{}\n');
    writeFileSync(join(repo, '.idea', 'workspace.xml'), '<xml />\n');
    git(repo, ['add', '.']);

    const flags = runRouter(repo);
    expect(flags.integration).toBe('false');
    expect(flags.eval).toBe('false');
    expect(flags.unit).toBe('false');
    for (const flag of NARROW_ROUTER_FLAGS) {
      expect(flags[flag]).toBe('false');
    }
    expect(flags.docs_only).toBe('true');
  });

  it('fails OPEN (all flags true) when no diff base resolves', () => {
    // A repo with no `main` branch and no BASE_REF: the router cannot prove
    // any slow suite unaffected, so it must demand them all.
    const orphan = mkdtempSync(join(tmpdir(), 'check-change-class-orphan-'));
    try {
      mkdirSync(join(orphan, 'scripts', 'lib'), { recursive: true });
      cpSync(
        join(__dirname, 'check-change-class.sh'),
        join(orphan, 'scripts', 'check-change-class.sh'),
      );
      cpSync(
        join(__dirname, 'lib', 'i18n-change-detection.sh'),
        join(orphan, 'scripts', 'lib', 'i18n-change-detection.sh'),
      );
      chmodSync(join(orphan, 'scripts', 'check-change-class.sh'), 0o755);
      git(orphan, ['init', '-b', 'feature']);
      git(orphan, ['config', 'user.email', 'test@example.com']);
      git(orphan, ['config', 'user.name', 'Test User']);
      git(orphan, ['commit', '--allow-empty', '-m', 'init']);

      const flags = runRouter(orphan);
      expect(flags.classes).toBe('unresolved');
      expect(flags.integration).toBe('true');
      expect(flags.eval).toBe('true');
      expect(flags.unit).toBe('true');
      expect(flags.database).toBe('true');
      for (const flag of NARROW_ROUTER_FLAGS) {
        expect(flags[flag]).toBe('true');
      }
      expect(flags.docs_only).toBe('false');
    } finally {
      removeTempRepo(orphan);
    }
  });

  // ── i18n cross-package routing (WI-886) ─────────────────────────────────
  // app-help-map.test.ts reads en.json via readFileSync — invisible to nx
  // affected. Pins that the router (a) schedules pnpm test:api:unit in the
  // advisory output AND (b) emits the github-output unit=true flag that gates
  // the dedicated ci.yml api-unit step. Both directions matter: the advisory
  // alone never runs in CI, so the flag is the load-bearing half.

  it('routes en.json changes to API unit tests (cross-package read in app-help-map.test.ts)', () => {
    mkdirSync(join(repo, 'apps', 'mobile', 'src', 'i18n', 'locales'), {
      recursive: true,
    });
    writeFileSync(
      join(repo, 'apps', 'mobile', 'src', 'i18n', 'locales', 'en.json'),
      '{ "home": {} }\n',
    );
    git(repo, ['add', '.']);

    const output = runChangeClass(repo, ['--branch'], { encoding: 'utf8' });
    expect(output).toContain('i18n-cross-package');
    expect(output).toContain('pnpm test:api:unit');

    const flags = runRouter(repo);
    expect(flags.classes).toContain('i18n-cross-package');
    expect(flags.unit).toBe('true');
  });

  it('does NOT route other locale files to API unit tests', () => {
    mkdirSync(join(repo, 'apps', 'mobile', 'src', 'i18n', 'locales'), {
      recursive: true,
    });
    writeFileSync(
      join(repo, 'apps', 'mobile', 'src', 'i18n', 'locales', 'de.json'),
      '{ "home": {} }\n',
    );
    git(repo, ['add', '.']);

    const output = runChangeClass(repo, ['--branch'], { encoding: 'utf8' });
    expect(output).not.toContain('i18n-cross-package');
    // de.json still triggers the i18n class (path matches i18n_delta_needs_checks)
    // but must NOT schedule the API unit tests
    expect(output).not.toContain('pnpm test:api:unit');

    const flags = runRouter(repo);
    expect(flags.classes).toContain('i18n');
    expect(flags.unit).toBe('false');
  });

  it('declares a database package test target for RLS coverage', () => {
    const project = JSON.parse(
      readFileSync(
        join(__dirname, '..', 'packages', 'database', 'project.json'),
        'utf8',
      ),
    );

    const command = project.targets.test.options.command;
    expect(command).toContain('jest --config jest.config.cjs');
    expect(command).toContain('**/src/**/*.test.ts');
    expect(command).toContain('\\.integration\\.test\\.ts$');
  });

  // WI-1345 sweep: this file's git()/runChangeClass() spawn real git/bash
  // processes against a mkdtemp fixture repo. Confirm an ambient GIT_DIR
  // leak (as husky exports during pre-push -> nx -> jest) does not redirect
  // those writes at the ambient repo. Uses only disposable mkdtemp fixtures,
  // never the real worktree or shared checkout.
  it('does not mutate an ambient repo when GIT_DIR leaks into the env', () => {
    const ambientRepo = mkdtempSync(join(tmpdir(), 'wi1345-ambient-ccc-'));
    try {
      git(ambientRepo, ['init', '-q', '-b', 'main']);
      git(ambientRepo, ['config', 'user.email', 'ambient@example.com']);
      git(ambientRepo, ['config', 'user.name', 'Ambient']);
      writeFileSync(join(ambientRepo, 'ambient.txt'), 'ambient content\n');
      git(ambientRepo, ['add', '.']);
      git(ambientRepo, ['commit', '-q', '-m', 'ambient initial commit']);

      const ambientConfigPath = join(ambientRepo, '.git', 'config');
      const headBefore = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: ambientRepo,
        encoding: 'utf8',
        env: childGitEnv(),
      }).trim();
      const configBefore = readFileSync(ambientConfigPath, 'utf8');

      const savedGitDir = process.env.GIT_DIR;
      process.env.GIT_DIR = join(ambientRepo, '.git');
      try {
        writeFileSync(
          join(repo, 'src', 'unclassified.ts'),
          'export const a = 4;\n',
        );
        const output = runChangeClass(repo, ['--branch'], {
          encoding: 'utf8',
        });
        // The check must still resolve against `repo` (cwd), not the
        // poisoned ambient GIT_DIR.
        expect(output).toContain('typescript');
      } finally {
        if (savedGitDir === undefined) {
          delete process.env.GIT_DIR;
        } else {
          process.env.GIT_DIR = savedGitDir;
        }
      }

      const headAfter = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: ambientRepo,
        encoding: 'utf8',
        env: childGitEnv(),
      }).trim();
      const configAfter = readFileSync(ambientConfigPath, 'utf8');

      expect(headAfter).toBe(headBefore);
      expect(configAfter).toBe(configBefore);
    } finally {
      rmSync(ambientRepo, { recursive: true, force: true });
    }
  });
});
