import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GOOGLE_PLAY_SERVICE_ACCOUNT_ENV,
  materializeGooglePlayServiceAccount,
  parseGooglePlayServiceAccount,
  warnIfPosixPermissionsUnsupported,
} from './prepare-eas-submit-credentials';

const repoRoot = process.cwd();

describe('WI-1341 production EAS submit contract', () => {
  it('pins production to Config T and Play internal submission', () => {
    const eas = JSON.parse(
      readFileSync(join(repoRoot, 'apps/mobile/eas.json'), 'utf8'),
    );

    expect(eas.build.production.env).toMatchObject({
      EXPO_PUBLIC_ENABLE_MODE_NAV: 'false',
      EXPO_PUBLIC_ENABLE_MODE_NAV_V1: 'true',
      EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true',
    });
    expect(eas.submit.production.android).toEqual({
      serviceAccountKeyPath: './.eas-submit/google-play-service-account.json',
      track: 'internal',
    });
    expect(eas.submit.production.ios).toEqual({});
  });

  it('keeps materialized credentials ignored and operator-gated', () => {
    const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
    const runbook = readFileSync(
      join(repoRoot, 'docs/runbooks/store-submission.md'),
      'utf8',
    );
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    );

    expect(gitignore).toContain('apps/mobile/.eas-submit/');
    expect(packageJson.scripts['mobile:submit:prepare']).toBe(
      'node scripts/prepare-eas-submit-credentials.js',
    );
    expect(runbook).toContain(
      'doppler run -c prd -- pnpm mobile:submit:prepare',
    );
    expect(runbook).toContain('OPQ-37');
    expect(runbook).toContain('V0-retirement ruling');
    expect(runbook).toContain('spec section 13 S6');
    expect(runbook).toContain('Play internal');
    expect(runbook).toContain('TestFlight');
    expect(runbook).toContain('--id <android-build-id>');
    expect(runbook).toContain('--id <ios-build-id>');
    expect(runbook).not.toContain('--latest');
  });
});

describe('Google Play service-account materialization', () => {
  const validCredential = {
    type: 'service_account',
    project_id: 'test-project',
    client_email: 'submitter@test-project.iam.gserviceaccount.com',
    private_key:
      '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
  };

  it('rejects missing, malformed, and incomplete values without echoing them', () => {
    expect(() => parseGooglePlayServiceAccount('')).toThrow(
      GOOGLE_PLAY_SERVICE_ACCOUNT_ENV,
    );
    expect(() => parseGooglePlayServiceAccount('TOP-SECRET-NOT-JSON')).toThrow(
      'valid JSON',
    );
    expect(() =>
      parseGooglePlayServiceAccount(
        JSON.stringify({ type: 'service_account' }),
      ),
    ).toThrow('required service-account fields');

    for (const errorCase of [
      () => parseGooglePlayServiceAccount('TOP-SECRET-NOT-JSON'),
      () =>
        parseGooglePlayServiceAccount(
          JSON.stringify({ type: 'service_account' }),
        ),
    ]) {
      try {
        errorCase();
      } catch (error) {
        expect(String(error)).not.toContain('TOP-SECRET-NOT-JSON');
        expect(String(error)).not.toContain('private_key');
      }
    }
  });

  it('writes normalized JSON with restrictive creation options', () => {
    const calls: unknown[][] = [];
    const fsImpl = {
      mkdirSync: (...args: unknown[]) => calls.push(['mkdirSync', ...args]),
      writeFileSync: (...args: unknown[]) =>
        calls.push(['writeFileSync', ...args]),
      chmodSync: (...args: unknown[]) => calls.push(['chmodSync', ...args]),
    };

    const outputPath = materializeGooglePlayServiceAccount({
      raw: JSON.stringify(validCredential),
      outputPath: 'C:/tmp/google-play-service-account.json',
      fsImpl,
    });

    expect(outputPath).toBe('C:/tmp/google-play-service-account.json');
    expect(calls).toEqual([
      ['mkdirSync', 'C:/tmp', { recursive: true }],
      [
        'writeFileSync',
        'C:/tmp/google-play-service-account.json',
        `${JSON.stringify(validCredential, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      ],
      ['chmodSync', 'C:/tmp/google-play-service-account.json', 0o600],
    ]);
  });

  it('warns Windows operators that POSIX mode bits do not enforce the ACL', () => {
    const writes: string[] = [];
    const stderr = { write: (message: string) => writes.push(message) };

    expect(
      warnIfPosixPermissionsUnsupported({ platform: 'win32', stderr }),
    ).toBe(true);
    expect(writes.join('')).toContain('Windows');
    expect(writes.join('')).toContain('ACL');

    writes.length = 0;
    expect(
      warnIfPosixPermissionsUnsupported({ platform: 'linux', stderr }),
    ).toBe(false);
    expect(writes).toEqual([]);
  });
});
