import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';

const repoRoot = join(__dirname, '..');
const deployYaml = readFileSync(
  join(repoRoot, '.github/workflows/deploy.yml'),
  'utf8',
);
const deployWorkflow = parse(deployYaml) as {
  jobs: Record<string, { if?: string; needs?: string | string[] }>;
};

const ROUTE_PROBES = [
  {
    route: '/v1/consent-page',
    acceptedStatuses: ['400'],
    rejectedStatuses: ['000', '200', '401', '403', '404', '500', '502', '503'],
  },
  {
    route: '/v1/sessions/resume-nudge',
    acceptedStatuses: ['401'],
    rejectedStatuses: ['000', '200', '400', '403', '404', '500', '502', '503'],
  },
] as const;
type RouteProbe = (typeof ROUTE_PROBES)[number];
type SmokeRoute = RouteProbe['route'];

function toBashPath(
  nativePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'win32') return nativePath;

  const normalized = nativePath.replaceAll('\\', '/');
  const drivePath = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!drivePath) {
    throw new Error(
      `Cannot convert Windows path to Bash syntax: ${nativePath}`,
    );
  }
  return `/mnt/${drivePath[1]!.toLowerCase()}/${drivePath[2]}`;
}

function quoteBashWord(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

test('converts a Windows drive path to the Bash mount before composing PATH', () => {
  expect(toBashPath('C:\\Temp\\fake curl\\bin', 'win32')).toBe(
    '/mnt/c/Temp/fake curl/bin',
  );
});

test('leaves a POSIX fake-tool path unchanged', () => {
  expect(toBashPath('/tmp/fake-curl/bin', 'linux')).toBe('/tmp/fake-curl/bin');
});

test('does not use nonexistent or bare auth-short-circuited paths as mounted-route smoke probes', () => {
  expect(deployYaml).not.toContain('/v1/auth/me');
  expect(deployYaml).not.toContain('${STAGING_API_URL}/v1/sessions"');
});

test('api-smoke-test overrides skipped-ancestor handling while requiring a successful staging deploy', () => {
  expect(deployWorkflow.jobs['api-smoke-test']).toMatchObject({
    needs: 'api-deploy',
    if: [
      'always() &&',
      "needs.api-deploy.result == 'success' &&",
      "(github.event_name == 'push' || inputs.api_environment == 'staging')",
      '',
    ].join('\n'),
  });
});

function extractRunScriptForRoute(route: SmokeRoute): string {
  const lines = deployYaml.split('\n');
  const routeLineIdx = lines.findIndex((line) => line.includes(route));
  if (routeLineIdx < 0) {
    throw new Error(`Could not find ${route} in deploy.yml`);
  }

  let stepStartIdx = -1;
  for (let i = routeLineIdx; i >= 0; i--) {
    if (/^\s+- name:/.test(lines[i])) {
      stepStartIdx = i;
      break;
    }
  }
  if (stepStartIdx < 0) {
    throw new Error(`Could not find step name for ${route}`);
  }

  const runIdx = lines.findIndex(
    (line, i) =>
      i > stepStartIdx && i < routeLineIdx && /^\s+run:\s*\|/.test(line),
  );
  if (runIdx < 0) {
    throw new Error(`Could not find run block for ${route}`);
  }

  const out: string[] = [];
  for (let i = runIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0) {
      out.push('');
      continue;
    }
    if (line.startsWith('          ')) {
      out.push(line.slice(10));
      continue;
    }
    break;
  }
  return out.join('\n');
}

function runSmokeScript(
  script: string,
  httpCode: string,
): { code: number; output: string } {
  const tempDir = mkdtempSync(join(tmpdir(), 'deploy-smoke-routes-'));
  const binDir = join(tempDir, 'bin');
  const bashBinDir = toBashPath(binDir);
  mkdirSync(binDir);
  const curlPath = join(binDir, 'curl');
  writeFileSync(
    curlPath,
    '#!/usr/bin/env bash\nprintf "%s" "${SIMULATED_HTTP_CODE:-000}"\n',
    'utf8',
  );
  chmodSync(curlPath, 0o755);

  const bashScript = [
    `export PATH=${quoteBashWord(bashBinDir)}:"$PATH"`,
    `export SIMULATED_HTTP_CODE=${quoteBashWord(httpCode)}`,
    `export STAGING_API_URL=${quoteBashWord('https://api-stg.example.test')}`,
    script,
  ].join('\n');

  try {
    const stdout = execFileSync('bash', [], {
      env: process.env,
      input: bashScript,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      output: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test('removes the temporary fake-curl directory after success and failure', () => {
  const prefix = 'deploy-smoke-routes-';
  const before = readdirSync(tmpdir()).filter((entry) =>
    entry.startsWith(prefix),
  );
  const script = extractRunScriptForRoute('/v1/consent-page');

  runSmokeScript(script, '400');
  runSmokeScript(script, '500');

  expect(
    readdirSync(tmpdir()).filter((entry) => entry.startsWith(prefix)),
  ).toEqual(before);
});

describe.each(ROUTE_PROBES)(
  'deploy.yml staging route smoke for $route',
  ({ route, acceptedStatuses, rejectedStatuses }) => {
    const script = extractRunScriptForRoute(route);

    test('executes the expected route probe', () => {
      expect(script).toContain(route);
      expect(script).toContain('curl');
      expect(script).toContain('HTTP_CODE');
    });

    test.each([...acceptedStatuses])(
      'accepts expected route status %s',
      (httpCode) => {
        const result = runSmokeScript(script, httpCode);
        expect(result).toEqual({
          code: 0,
          output: expect.stringContaining(`HTTP status: ${httpCode}`),
        });
      },
    );

    test.each([...rejectedStatuses, '504'])(
      'rejects unexpected status %s',
      (httpCode) => {
        const result = runSmokeScript(script, httpCode);
        expect(result.code).not.toBe(0);
        expect(result.output).toContain(`HTTP status: ${httpCode}`);
      },
    );
  },
);
