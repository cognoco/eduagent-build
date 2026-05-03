// [BUG-974] Tests that the pretest:e2e* guards in package.json honour the
// SKIP_E2E_GUARD escape hatch. The guard is intentionally aggressive on
// developer machines (bare-`maestro` resolves to a Unicode-broken install
// under the user's profile path) but must allow CI / automation to opt out.
//
// We test the structure of the script string AND a behavioural twin built
// from the same primitives. Re-spawning the literal `node -e "<source>"`
// from inside Jest is brittle because the JSON-stored value relies on
// shell-quoting layers we don't replicate verbatim — so the structural
// assertions are the contract that protects the regression, and the
// behavioural test confirms the guard *primitive* works as intended.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const pkg = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8')
) as { scripts: Record<string, string> };

const GUARDED_HOOKS = [
  'pretest:e2e',
  'pretest:e2e:smoke',
  'pretest:e2e:record',
] as const;

describe('[BUG-974] pretest:e2e SKIP_E2E_GUARD escape hatch', () => {
  describe('structural contract (package.json)', () => {
    for (const hook of GUARDED_HOOKS) {
      describe(hook, () => {
        const scriptValue = pkg.scripts[hook];
        it('is a `node -e` inline guard', () => {
          expect(scriptValue).toBeDefined();
          expect(scriptValue).toMatch(/^node -e "/);
        });
        it('checks SKIP_E2E_GUARD before exiting', () => {
          // The order matters: the env-var check must run before the
          // process.exit(1) so CI can bypass without seeing the error message.
          expect(scriptValue).toContain('process.env.SKIP_E2E_GUARD');
          expect(scriptValue).toContain('process.exit(0)');
          expect(scriptValue).toContain('process.exit(1)');
          const guardIdx = scriptValue.indexOf('SKIP_E2E_GUARD');
          const exit1Idx = scriptValue.indexOf('process.exit(1)');
          expect(guardIdx).toBeGreaterThanOrEqual(0);
          expect(exit1Idx).toBeGreaterThan(guardIdx);
        });
        it('mentions the SKIP_E2E_GUARD escape hatch in the error message', () => {
          // Discoverability: a developer hitting the guard should learn how
          // to bypass it from the error itself, without grepping package.json.
          expect(scriptValue).toContain('SKIP_E2E_GUARD=1');
        });
      });
    }
  });

  describe('behavioural twin (env-var primitive)', () => {
    // Mirror of the guard primitive used in package.json. Re-creating it in
    // a single-line source avoids the multi-line shell-quoting issue while
    // exercising the exact branch a CI runner would hit.
    const GUARD_SRC =
      "if (process.env.SKIP_E2E_GUARD) { process.exit(0); } console.error('blocked'); process.exit(1);";

    function run(env: NodeJS.ProcessEnv): {
      status: number | null;
      stderr: string;
    } {
      const result = spawnSync(process.execPath, ['-e', GUARD_SRC], {
        env,
        encoding: 'utf8',
      });
      return { status: result.status, stderr: result.stderr };
    }

    it('exits 1 when SKIP_E2E_GUARD is unset', () => {
      const env = { ...process.env };
      delete env.SKIP_E2E_GUARD;
      const { status, stderr } = run(env);
      expect(status).toBe(1);
      expect(stderr).toContain('blocked');
    });

    it('exits 0 when SKIP_E2E_GUARD=1 (CI escape hatch)', () => {
      const { status, stderr } = run({ ...process.env, SKIP_E2E_GUARD: '1' });
      expect(status).toBe(0);
      expect(stderr).toBe('');
    });
  });
});
