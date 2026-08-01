import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PRE_PUSH_SCRIPT = join(__dirname, 'pre-push-tests.sh');

function evaluateJestMaxWorkersFlag(value: string | undefined): string[] {
  const script = readFileSync(PRE_PUSH_SCRIPT, 'utf8');
  const assignment = script
    .split('\n')
    .find((line) => line.trimStart().startsWith('JEST_MAX_WORKERS_FLAG='))
    ?.trim();

  if (!assignment) {
    throw new Error('JEST_MAX_WORKERS_FLAG assignment is missing');
  }

  const env =
    value === undefined
      ? { PATH: process.env.PATH ?? '/usr/bin:/bin' }
      : { JEST_MAX_WORKERS: value, PATH: process.env.PATH ?? '/usr/bin:/bin' };
  const stdout = execFileSync(
    'bash',
    [
      '--noprofile',
      '--norc',
      '-c',
      [
        'set -euo pipefail',
        assignment,
        'set -- jest $JEST_MAX_WORKERS_FLAG sentinel',
        `printf '%s\\n' "$@"`,
      ].join('\n'),
    ],
    { encoding: 'utf8', env },
  );

  return stdout.trimEnd().split('\n');
}

describe('pre-push Jest launcher', () => {
  it('invokes Jest through Node instead of a Windows command shim', () => {
    const script = readFileSync(PRE_PUSH_SCRIPT, 'utf8');

    expect(script).toContain(
      'node "$WORKSPACE_ROOT/node_modules/jest/bin/jest.js"',
    );
    expect(script).not.toContain('pnpm exec jest --findRelatedTests');
  });

  it.each([
    ['unset', undefined, ['jest', 'sentinel']],
    ['empty', '', ['jest', 'sentinel']],
    ['an integer', '2', ['jest', '--maxWorkers=2', 'sentinel']],
    ['a percentage', '50%', ['jest', '--maxWorkers=50%', 'sentinel']],
  ] as const)(
    'forwards the exact max-workers argv when JEST_MAX_WORKERS is %s',
    (_label, value, expectedArgv) => {
      expect(evaluateJestMaxWorkersFlag(value)).toEqual(expectedArgv);
    },
  );

  it('passes the derived max-workers flag to both direct Jest call sites', () => {
    const script = readFileSync(PRE_PUSH_SCRIPT, 'utf8');
    const directJestCalls = script
      .split('\n')
      .filter(
        (line) =>
          line.includes(
            'node "$WORKSPACE_ROOT/node_modules/jest/bin/jest.js"',
          ) && line.includes('--findRelatedTests'),
      );

    expect(directJestCalls).toHaveLength(2);
    for (const directJestCall of directJestCalls) {
      expect(directJestCall).toContain('$JEST_MAX_WORKERS_FLAG');
    }
  });
});
