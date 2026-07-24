import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(__dirname, '../../..');
const scratchDirectories: string[] = [];
const bashExecutable =
  process.platform === 'win32'
    ? 'C:\\Program Files\\Git\\bin\\bash.exe'
    : 'bash';

function bashPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function writeExecutable(path: string, lines: string[]): void {
  writeFileSync(path, `${lines.join('\n')}\n`);
  chmodSync(path, 0o755);
}

function runReleasePreflight(marker: string) {
  const root = mkdtempSync(join(tmpdir(), 'wi2176-release-preflight-'));
  scratchDirectories.push(root);

  const binDir = join(root, 'bin');
  const adbPath = join(binDir, 'adb');
  const maestroPath = join(binDir, 'maestro');
  const maestroMarker = join(root, 'maestro-ran');
  const bashEnv = join(root, 'bash-env');
  mkdirSync(binDir, { recursive: true });

  writeExecutable(adbPath, [
    '#!/usr/bin/env bash',
    'case "$*" in',
    '  "get-state") printf "device\\n" ;;',
    '  "exec-out cat /sdcard/ui_dump.xml")',
    '    printf \'<hierarchy><node resource-id="%s"/></hierarchy>\' "$FAKE_RELEASE_MARKER"',
    '    ;;',
    'esac',
    'exit 0',
  ]);
  writeExecutable(maestroPath, [
    '#!/usr/bin/env bash',
    'printf "ran\\n" > "$FAKE_MAESTRO_MARKER"',
    'exit 0',
  ]);
  writeFileSync(bashEnv, 'sleep() { :; }\n');

  const result = spawnSync(
    bashExecutable,
    [
      bashPath(
        join(repoRoot, 'apps/mobile/e2e/scripts/seed-and-run-release.sh'),
      ),
      '--no-seed',
      'apps/mobile/e2e/flows/quick-check.yaml',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        ADB_PATH: bashPath(adbPath),
        APP_TIMEOUT: '4',
        BASH_ENV: bashPath(bashEnv),
        FAKE_MAESTRO_MARKER: bashPath(maestroMarker),
        FAKE_RELEASE_MARKER: marker,
        MAESTRO_PATH: bashPath(maestroPath),
      },
    },
  );

  return { maestroMarker, result };
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('[WI-2176] release-APK app-shell preflight', () => {
  it('hands the current welcome chooser to Maestro setup', () => {
    const { maestroMarker, result } = runReleasePreflight('welcome-chooser');

    expect({
      signal: result.signal,
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    }).toEqual(
      expect.objectContaining({
        signal: null,
        status: 0,
      }),
    );
    expect(existsSync(maestroMarker)).toBe(true);
  });
});
