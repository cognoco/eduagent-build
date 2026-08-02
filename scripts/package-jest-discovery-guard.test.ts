import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

import { globsToMatcher } from 'jest-util';

const repoRoot = join(__dirname, '..');
const jestBin = join(repoRoot, 'node_modules', 'jest', 'bin', 'jest.js');

const packageCases = [
  {
    name: 'schemas',
    config: 'packages/schemas/jest.config.cjs',
    anchor: 'packages/schemas/src/account.test.ts',
  },
  {
    name: 'database',
    config: 'packages/database/jest.config.cjs',
    anchor: 'packages/database/src/schema/identity.test.ts',
  },
  {
    name: 'retention',
    config: 'packages/retention/jest.config.cjs',
    anchor: 'packages/retention/src/sm2.test.ts',
  },
] as const;

const toGlobPath = (value: string) => value.replaceAll('\\', '/');

describe.each(packageCases)('$name Jest discovery', ({ config, anchor }) => {
  const configPath = join(repoRoot, config);

  it('discovers an existing test suite through the package config', () => {
    const result = spawnSync(
      process.execPath,
      [jestBin, '--config', configPath, '--listTests', '--runInBand'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: process.env,
      },
    );

    expect(result.status).toBe(0);
    expect(toGlobPath(result.stdout)).toContain(anchor);
  });

  it('matches both conventional TypeScript suite suffixes', () => {
    const packageConfig = require(configPath) as {
      passWithNoTests?: boolean;
      testMatch: string[];
    };
    const packageRoot = toGlobPath(dirname(configPath));
    const matcher = globsToMatcher(
      packageConfig.testMatch.map((pattern) =>
        pattern.replace('<rootDir>', packageRoot),
      ),
    );

    expect(matcher(`${packageRoot}/src/discovery.test.ts`)).toBe(true);
    expect(matcher(`${packageRoot}/src/discovery.spec.ts`)).toBe(true);
  });

  it('fails closed when no suites are discovered', () => {
    const packageConfig = require(configPath) as {
      passWithNoTests?: boolean;
    };

    expect(packageConfig.passWithNoTests).not.toBe(true);
  });
});
