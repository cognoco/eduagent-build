#!/usr/bin/env node

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const EXPO_GRAPHQL_URL = 'https://api.expo.dev/graphql';
const APP_CONFIG_PATH = join(__dirname, '..', 'apps', 'mobile', 'app.json');

const submissionCredentialQuery = `
  query AndroidSubmissionCredential($projectFullName: String!, $applicationIdentifier: String!) {
    app {
      byFullName(fullName: $projectFullName) {
        androidAppCredentials(filter: { applicationIdentifier: $applicationIdentifier, legacyOnly: false }) {
          googleServiceAccountKeyForSubmissions { id }
        }
      }
    }
  }
`;

function assignedSubmissionCredential(response) {
  return Boolean(
    response?.data?.app?.byFullName?.androidAppCredentials?.some(
      (credentials) => {
        const key = credentials?.googleServiceAccountKeyForSubmissions;
        return typeof key?.id === 'string' && key.id.trim() !== '';
      },
    ),
  );
}

function readAndroidAppIdentity(readFile = readFileSync) {
  let expo;
  try {
    expo = JSON.parse(readFile(APP_CONFIG_PATH, 'utf8')).expo;
  } catch {
    throw new Error(
      'EAS credential metadata preflight cannot read Android app identity',
    );
  }

  if (
    typeof expo?.owner !== 'string' ||
    typeof expo?.slug !== 'string' ||
    typeof expo?.android?.package !== 'string' ||
    expo.owner.trim() === '' ||
    expo.slug.trim() === '' ||
    expo.android.package.trim() === ''
  ) {
    throw new Error(
      'EAS credential metadata preflight has invalid Android app identity',
    );
  }

  return {
    projectFullName: `@${expo.owner}/${expo.slug}`,
    applicationIdentifier: expo.android.package,
  };
}

async function verifyEasManagedSubmitCredential({
  accessToken = process.env.EXPO_TOKEN,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    throw new Error(
      'EXPO_TOKEN is required for EAS credential metadata preflight',
    );
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'EAS credential metadata preflight cannot make its request',
    );
  }

  const identity = readAndroidAppIdentity();

  let response;
  try {
    response = await fetchImpl(EXPO_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: submissionCredentialQuery,
        variables: {
          projectFullName: identity.projectFullName,
          applicationIdentifier: identity.applicationIdentifier,
        },
      }),
    });
  } catch {
    throw new Error('EAS credential metadata preflight could not reach Expo');
  }

  if (!response?.ok) {
    throw new Error('EAS credential metadata preflight was rejected by Expo');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(
      'EAS credential metadata preflight returned invalid metadata',
    );
  }

  if (payload?.errors?.length || !assignedSubmissionCredential(payload)) {
    throw new Error(
      'No EAS-managed Google Play submission credential is assigned to this Android app',
    );
  }

  return {
    applicationIdentifier: identity.applicationIdentifier,
    submissionCredentialAssigned: true,
  };
}

async function main() {
  const result = await verifyEasManagedSubmitCredential();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `EAS managed credential preflight failed: ${error.message}\n`,
    );
    process.exit(1);
  });
}

module.exports = {
  assignedSubmissionCredential,
  readAndroidAppIdentity,
  verifyEasManagedSubmitCredential,
};
