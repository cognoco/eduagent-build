import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

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

  it('has no local credential materializer contract', () => {
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
    expect(gitignore).not.toContain('apps/mobile/.eas-submit/');
    expect(packageJson.scripts['mobile:submit:prepare']).toBeUndefined();
    expect(packageJson.scripts['mobile:submit:preflight']).toBe(
      'node scripts/verify-eas-managed-submit-credential.js',
    );
    expect(runbook).toContain('pnpm mobile:submit:preflight');
    expect(runbook).not.toContain('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
    expect(runbook).toContain('OPQ-37');
    expect(runbook).toContain('OPQ-155');
    expect(runbook).toContain('does not itself build, upload, or release');
    expect(runbook).toContain('production Doppler flag triple');
    expect(runbook).toContain('V0-retirement ruling');
    expect(runbook).toContain('spec section 13 S6');
    expect(runbook).toContain('Play internal');
    expect(runbook).toContain('TestFlight');
    expect(runbook).toContain('--id <android-build-id>');
    expect(runbook).toContain('--id <ios-build-id>');
    expect(runbook).not.toContain('--latest');
  });
});
