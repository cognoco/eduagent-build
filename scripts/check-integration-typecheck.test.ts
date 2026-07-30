import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const fixturePath = join(
  repoRoot,
  'tests/integration/wi2578-deliberate-type-error.integration.test.ts',
);

function disposableIndex() {
  const indexPath = join(tmpdir(), `wi2578-index-${process.pid}-${Date.now()}`);
  return { ...process.env, GIT_INDEX_FILE: indexPath };
}

describe('integration typecheck contract', () => {
  afterEach(() => {
    rmSync(fixturePath, { force: true });
  });

  it('rejects a tracked Jest-selected integration type error', () => {
    writeFileSync(fixturePath, "const x: number = 'deliberate type error';\n");
    const env = disposableIndex();

    try {
      execFileSync('git', ['read-tree', 'HEAD'], { cwd: repoRoot, env });
      execFileSync('git', ['add', fixturePath], { cwd: repoRoot, env });
      const result = spawnSync(
        'pnpm',
        ['exec', 'tsx', 'scripts/check-integration-typecheck.ts'],
        { cwd: repoRoot, env, encoding: 'utf8' },
      );

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "Type 'string' is not assignable to type 'number'",
      );
    } finally {
      if (env.GIT_INDEX_FILE && existsSync(env.GIT_INDEX_FILE)) {
        rmSync(env.GIT_INDEX_FILE, { force: true });
      }
    }
  });

  it('derives filesystem paths from the module URL without encoded pathnames', () => {
    const source = readFileSync(
      join(repoRoot, 'scripts/check-integration-typecheck.ts'),
      'utf8',
    );

    expect(source).toContain('dirname(fileURLToPath(import.meta.url))');
  });
});
