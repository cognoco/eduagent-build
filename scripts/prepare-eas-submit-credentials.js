#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const GOOGLE_PLAY_SERVICE_ACCOUNT_ENV = 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON';
const DEFAULT_OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'apps',
  'mobile',
  '.eas-submit',
  'google-play-service-account.json',
);

function parseGooglePlayServiceAccount(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(
      `${GOOGLE_PLAY_SERVICE_ACCOUNT_ENV} is required and must be injected by the approved secret provider`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `${GOOGLE_PLAY_SERVICE_ACCOUNT_ENV} must contain valid JSON`,
    );
  }

  const requiredFields = ['project_id', 'client_email', 'private_key'];
  if (
    parsed === null ||
    Array.isArray(parsed) ||
    typeof parsed !== 'object' ||
    parsed.type !== 'service_account' ||
    requiredFields.some(
      (field) =>
        typeof parsed[field] !== 'string' || parsed[field].trim() === '',
    )
  ) {
    throw new Error(
      `${GOOGLE_PLAY_SERVICE_ACCOUNT_ENV} is missing required service-account fields`,
    );
  }

  return parsed;
}

function materializeGooglePlayServiceAccount({
  raw = process.env[GOOGLE_PLAY_SERVICE_ACCOUNT_ENV],
  outputPath = DEFAULT_OUTPUT_PATH,
  fsImpl = fs,
} = {}) {
  const credential = parseGooglePlayServiceAccount(raw);
  fsImpl.mkdirSync(path.dirname(outputPath), { recursive: true });
  fsImpl.writeFileSync(outputPath, `${JSON.stringify(credential, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  // The write mode only applies on creation; enforce it for existing files too.
  fsImpl.chmodSync(outputPath, 0o600);
  return outputPath;
}

function warnIfPosixPermissionsUnsupported({
  platform = process.platform,
  stderr = process.stderr,
} = {}) {
  if (platform !== 'win32') {
    return false;
  }

  stderr.write(
    'Warning: Windows does not enforce POSIX mode 0600; apply and verify the credential file ACL per docs/runbooks/store-submission.md before submission.\n',
  );
  return true;
}

function main() {
  const outputPath = materializeGooglePlayServiceAccount();
  warnIfPosixPermissionsUnsupported();
  process.stdout.write(
    `Prepared ignored Google Play submit credential at ${path.relative(
      process.cwd(),
      outputPath,
    )}\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `EAS submit credential preparation failed: ${error.message}\n`,
    );
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_OUTPUT_PATH,
  GOOGLE_PLAY_SERVICE_ACCOUNT_ENV,
  materializeGooglePlayServiceAccount,
  parseGooglePlayServiceAccount,
  warnIfPosixPermissionsUnsupported,
};
