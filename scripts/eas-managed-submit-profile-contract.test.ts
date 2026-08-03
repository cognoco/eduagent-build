import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

const androidOnlyRunbookProhibitions = [
  'App Store Connect',
  'TestFlight',
  'eas build:list --platform ios',
  'eas build --platform all',
  'eas submit -p ios',
  '--id $iosBuildId',
];

function expectAndroidOnlyRunbook(runbook: string) {
  expect(runbook).toContain(
    'eas build --platform android --profile production',
  );
  expect(runbook).toContain('eas submit -p android --profile production');
  expect(runbook).toContain('--id $androidBuildId');

  for (const prohibition of androidOnlyRunbookProhibitions) {
    expect(runbook).not.toContain(prohibition);
  }
}

describe('WI-2937 production EAS submit contract', () => {
  it('pins Config T, Play internal, and EAS-managed Android submission', () => {
    const eas = JSON.parse(
      readFileSync(join(repoRoot, 'apps/mobile/eas.json'), 'utf8'),
    );

    expect(eas.build.production.env).toMatchObject({
      EXPO_PUBLIC_ENABLE_MODE_NAV: 'false',
      EXPO_PUBLIC_ENABLE_MODE_NAV_V1: 'true',
      EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true',
    });
    expect(eas.submit.production.android).toEqual({ track: 'internal' });
    expect(eas.submit.production.ios).toEqual({});
  });

  it('has no local credential materializer and only documents Android submission', () => {
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
    const runbook = readFileSync(
      join(repoRoot, 'docs/runbooks/store-submission.md'),
      'utf8',
    );
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    );

    expect(
      existsSync(join(repoRoot, 'scripts/prepare-eas-submit-credentials.js')),
    ).toBe(false);
    expect(gitignore).toContain('apps/mobile/.eas-submit/');
    expect(packageJson.scripts['mobile:submit:prepare']).toBeUndefined();
    expect(packageJson.scripts['mobile:submit:preflight']).toBe(
      'node scripts/verify-eas-managed-submit-credential.js',
    );
    expect(runbook).toContain(
      'doppler run -c prd -- pnpm mobile:submit:preflight',
    );
    expect(runbook).toContain('stale local credential');
    expect(runbook).toContain(
      'Remove-Item -LiteralPath $credentialPath -Force -ErrorAction SilentlyContinue',
    );
    expect(runbook).toContain('if (Test-Path -LiteralPath $credentialPath) {');
    expect(runbook).not.toContain(
      'test ! -e apps/mobile/.eas-submit/google-play-service-account.json',
    );
    expect(runbook).not.toContain('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
    expect(runbook).toContain('OPQ-37');
    expect(runbook).toContain('OPQ-155');
    expect(runbook).toContain('does not itself build, upload, or release');
    expect(runbook).toContain('production Doppler flag triple');
    expect(runbook).toContain('V0-retirement ruling');
    expect(runbook).toContain('spec section 13 S6');
    expect(runbook).toContain('Play internal');
    expect(runbook).not.toContain('--latest');
    expectAndroidOnlyRunbook(runbook);
  });

  it('rejects reintroduced iOS or TestFlight runbook instructions', () => {
    const runbook = readFileSync(
      join(repoRoot, 'docs/runbooks/store-submission.md'),
      'utf8',
    );

    for (const prohibition of androidOnlyRunbookProhibitions) {
      expect(() =>
        expectAndroidOnlyRunbook(`${runbook}\n${prohibition}`),
      ).toThrow(prohibition);
    }
  });

  it('rejects removal of the required Android build instruction', () => {
    const runbook = readFileSync(
      join(repoRoot, 'docs/runbooks/store-submission.md'),
      'utf8',
    );
    const withoutAndroidBuild = runbook.replace(
      'eas build --platform android --profile production',
      '',
    );

    expect(withoutAndroidBuild).not.toBe(runbook);
    expect(() => expectAndroidOnlyRunbook(withoutAndroidBuild)).toThrow(
      'eas build --platform android --profile production',
    );
  });
});
