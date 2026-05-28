import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const deployYaml = readFileSync(
  join(repoRoot, '.github/workflows/deploy.yml'),
  'utf8',
);

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

test('does not use nonexistent or bare auth-short-circuited paths as mounted-route smoke probes', () => {
  expect(deployYaml).not.toContain('/v1/auth/me');
  expect(deployYaml).not.toContain('${STAGING_API_URL}/v1/sessions"');
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
  mkdirSync(binDir);
  const curlPath = join(binDir, 'curl');
  writeFileSync(
    curlPath,
    '#!/usr/bin/env bash\nprintf "%s" "${SIMULATED_HTTP_CODE:-000}"\n',
    'utf8',
  );
  chmodSync(curlPath, 0o755);

  try {
    const stdout = execFileSync('bash', ['-c', script], {
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        SIMULATED_HTTP_CODE: httpCode,
        STAGING_API_URL: 'https://api-stg.example.test',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      output: `${e.stdout ?? ''}${e.stderr ?? ''}`,
    };
  }
}

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
