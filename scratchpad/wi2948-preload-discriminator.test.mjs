#!/usr/bin/env node

import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const classifier = path.join(
  repoRoot,
  'scratchpad',
  'wi2948-classify-playwright-result.zsh',
);
const phaseReporter = path.join(
  repoRoot,
  'scratchpad',
  'wi2948-preload-phase-reporter.cjs',
);
const playwrightCli = path.join(
  repoRoot,
  'node_modules',
  'playwright',
  'cli.js',
);
const playwrightTestModule = path.join(
  repoRoot,
  'node_modules',
  '@playwright',
  'test',
  'index.js',
);
const secretSentinel = 'SECRET_SENTINEL_WI2948';
const piiSentinel = 'PII_SENTINEL_PERSON_NAME_WI2948';
const expectedCases = new Map([
  ['configuration', 'configuration-test-discovery'],
  ['web-server', 'web-server-startup-timeout'],
  ['global-setup', 'global-setup-failure'],
  ['test-discovery', 'configuration-test-discovery'],
  ['browser-launch', 'browser-worker-or-fixture-pre-body'],
]);

const probeRoot = await mkdtemp(path.join(tmpdir(), 'wi2948-preload-probes.'));
await chmod(probeRoot, 0o700);

function fail(code) {
  process.stderr.write(`WI-2948 preload discriminator probe failed: ${code}\n`);
  process.exitCode = 1;
}

async function writePrivate(filePath, contents) {
  await writeFile(filePath, contents, { encoding: 'utf8', mode: 0o600 });
}

function run(command, args, env) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30_000,
  });
}

async function classify(rawJson, phaseFile) {
  const result = run('zsh', [classifier, rawJson, phaseFile], process.env);
  if (result.status !== 0) return { ok: false, output: '' };
  const output = result.stdout;
  const match = /^FAILURE_CLASSES=([a-z0-9-]+)$/m.exec(output);
  return {
    ok:
      Boolean(match) &&
      !output.includes(secretSentinel) &&
      !output.includes(piiSentinel),
    output,
    failureClass: match?.[1],
  };
}

function globalSetupSource(fails) {
  return `
const fs = require('node:fs');
function mark(value) {
  fs.appendFileSync(process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE, value + '\\n');
}
module.exports = async () => {
  mark('global-setup-started');
  ${
    fails
      ? `mark('global-setup-failed'); throw new Error('${secretSentinel}');`
      : `mark('global-setup-completed');`
  }
};
`;
}

async function createProbe(name) {
  const dir = path.join(probeRoot, name);
  const testsDir = path.join(dir, 'tests');
  await mkdir(testsDir, { recursive: true, mode: 0o700 });
  const rawJson = path.join(dir, 'raw.json');
  const phaseFile = path.join(dir, 'phases.txt');
  await writePrivate(phaseFile, '');
  await writePrivate(
    path.join(dir, 'global-setup.cjs'),
    globalSetupSource(name === 'global-setup'),
  );

  const commonConfig = `
const path = require('node:path');
module.exports = {
  testDir: path.join(__dirname, 'tests'),
  outputDir: path.join(__dirname, 'test-results'),
  globalSetup: path.join(__dirname, 'global-setup.cjs'),
  retries: 0,
  workers: 1,
  projects: [{ name: 'setup' }],
  use: { screenshot: 'off', trace: 'off', video: 'off' },
};
`;
  let config = commonConfig;
  let spec = `
const { test } = require(${JSON.stringify(playwrightTestModule)});
test('synthetic preload probe', async () => {});
`;

  if (name === 'configuration') {
    config = `throw new Error('${secretSentinel}');\n`;
  } else if (name === 'web-server') {
    const failingServer = path.join(dir, 'failing-server.cjs');
    await writePrivate(
      failingServer,
      `
const fs = require('node:fs');
fs.appendFileSync(process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE, 'web-server-command-started\\n');
process.exit(19);
`,
    );
    config = `
const path = require('node:path');
module.exports = {
  testDir: path.join(__dirname, 'tests'),
  outputDir: path.join(__dirname, 'test-results'),
  globalSetup: path.join(__dirname, 'global-setup.cjs'),
  retries: 0,
  workers: 1,
  projects: [{ name: 'setup' }],
  webServer: {
    command: ${JSON.stringify(`${process.execPath} ${failingServer}`)},
    url: 'http://127.0.0.1:65534',
    reuseExistingServer: false,
    timeout: 1_000,
  },
};
`;
  } else if (name === 'test-discovery') {
    spec = `throw new Error('${piiSentinel}');\n`;
  } else if (name === 'browser-launch') {
    const missingBrowser = path.join(dir, secretSentinel);
    config = `
const path = require('node:path');
module.exports = {
  testDir: path.join(__dirname, 'tests'),
  outputDir: path.join(__dirname, 'test-results'),
  globalSetup: path.join(__dirname, 'global-setup.cjs'),
  retries: 0,
  workers: 1,
  projects: [{ name: 'setup' }],
  use: {
    launchOptions: { executablePath: ${JSON.stringify(missingBrowser)} },
    screenshot: 'off', trace: 'off', video: 'off',
  },
};
`;
    spec = `
const fs = require('node:fs');
const { test } = require(${JSON.stringify(playwrightTestModule)});
test('synthetic browser launch probe', async ({ page }) => {
  fs.appendFileSync(process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE, 'setup-test-body-entered\\n');
  await page.goto('about:blank');
});
`;
  }

  const configPath = path.join(dir, 'playwright.config.cjs');
  await writePrivate(configPath, config);
  await writePrivate(path.join(testsDir, 'probe.spec.cjs'), spec);

  const env = {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_FILE: rawJson,
    PLAYWRIGHT_PRELOAD_PHASE_FILE: phaseFile,
  };
  const result = run(
    process.execPath,
    [
      playwrightCli,
      'test',
      `--config=${configPath}`,
      `--reporter=json,${phaseReporter}`,
    ],
    env,
  );
  if (result.status === null) fail(`${name}-runner-timeout`);
  if (result.status === 0) fail(`${name}-unexpected-pass`);
  return { rawJson, phaseFile };
}

function mutateEvents(name, events) {
  const lines = events.split('\n').filter(Boolean);
  if (name === 'configuration') return 'global-setup-completed\n';
  const decisive = {
    'web-server': 'web-server-command-started',
    'global-setup': 'global-setup-started',
    'test-discovery': 'global-setup-completed',
    'browser-launch': 'tests-discovered',
  }[name];
  return `${lines.filter((line) => line !== decisive).join('\n')}\n`;
}

try {
  let caseCount = 0;
  let mutationCount = 0;
  for (const [name, expected] of expectedCases) {
    const { rawJson, phaseFile } = await createProbe(name);
    const classified = await classify(rawJson, phaseFile);
    if (!classified.ok || classified.failureClass !== expected) {
      const fixedEvents = (await readFile(phaseFile, 'utf8'))
        .split('\n')
        .filter(Boolean)
        .join('+');
      fail(
        `${name}-classification-${classified.failureClass ?? 'missing-fixed-code'}-${fixedEvents || 'no-events'}`,
      );
      continue;
    }
    caseCount += 1;

    const mutantFile = path.join(path.dirname(phaseFile), 'mutant-phases.txt');
    const events = await readFile(phaseFile, 'utf8');
    await writePrivate(mutantFile, mutateEvents(name, events));
    const mutant = await classify(rawJson, mutantFile);
    if (!mutant.ok || mutant.failureClass === expected) {
      fail(`${name}-mutation-survived`);
      continue;
    }
    mutationCount += 1;
  }

  const unknownDir = path.join(probeRoot, 'unknown');
  await mkdir(unknownDir, { recursive: true, mode: 0o700 });
  const unknownJson = path.join(unknownDir, 'raw.json');
  const unknownPhases = path.join(unknownDir, 'phases.txt');
  await writePrivate(
    unknownJson,
    JSON.stringify({
      suites: [],
      errors: [{ message: `${secretSentinel}:${piiSentinel}` }],
    }),
  );
  await writePrivate(unknownPhases, 'setup-test-body-entered\n');
  const unknown = await classify(unknownJson, unknownPhases);
  if (!unknown.ok || unknown.failureClass !== 'unclassified-preload') {
    fail('unknown-shape-fail-closed');
  }

  const preGlobalUnknownPhases = path.join(
    unknownDir,
    'pre-global-unknown-phases.txt',
  );
  await writePrivate(preGlobalUnknownPhases, 'reporter-ready\n');
  const preGlobalUnknown = await classify(unknownJson, preGlobalUnknownPhases);
  if (
    !preGlobalUnknown.ok ||
    preGlobalUnknown.failureClass !== 'unclassified-preload'
  ) {
    fail('pre-global-without-web-command-marker-fail-closed');
  }

  if (!process.exitCode) {
    process.stdout.write(
      `WI-2948 preload discriminator probes OK cases=${caseCount} mutations=${mutationCount} pre_global_unknowns=1 sentinel_leaks=0\n`,
    );
  }
} finally {
  await rm(probeRoot, { recursive: true, force: true });
}
