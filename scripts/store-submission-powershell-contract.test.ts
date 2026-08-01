import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..');
const runbookPath = join(repoRoot, 'docs/runbooks/store-submission.md');
const verifierPath = join(
  repoRoot,
  'scripts/verify-store-submission-powershell.ps1',
);

function verifyRunbook(path: string) {
  return spawnSync(
    'pwsh',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-File',
      verifierPath,
      '-RunbookPath',
      path,
    ],
    { encoding: 'utf8' },
  );
}

describe('WI-2937 store-submission PowerShell contract', () => {
  it('parses every documented PowerShell block with the PowerShell parser', () => {
    const result = verifyRunbook(runbookPath);

    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Parsed \d+ PowerShell block\(s\)/);
  });

  it('rejects the malformed credentialPath assignment from the review finding', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'wi2937-powershell-'));
    const mutatedRunbookPath = join(tempDir, 'store-submission.md');

    try {
      const source = readFileSync(runbookPath, 'utf8');
      const mutated = source.replace(
        "$credentialPath = 'apps/mobile/.eas-submit/google-play-service-account.json'",
        "$credentialPath ??? 'apps/mobile/.eas-submit/google-play-service-account.json'",
      );
      expect(mutated).not.toBe(source);
      writeFileSync(mutatedRunbookPath, mutated);

      const result = verifyRunbook(mutatedRunbookPath);
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(output).toContain('PowerShell parse error');
      expect(output).toContain("the '??' operator");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
