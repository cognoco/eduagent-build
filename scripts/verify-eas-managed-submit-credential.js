#!/usr/bin/env node

const EXPO_GRAPHQL_URL = 'https://api.expo.dev/graphql';
const PROJECT_FULL_NAME = '@zuzanka14/mentomate';
const ANDROID_APPLICATION_IDENTIFIER = 'com.mentomate.app';

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
      (credentials) => credentials?.googleServiceAccountKeyForSubmissions,
    ),
  );
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
          projectFullName: PROJECT_FULL_NAME,
          applicationIdentifier: ANDROID_APPLICATION_IDENTIFIER,
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
    projectFullName: PROJECT_FULL_NAME,
    applicationIdentifier: ANDROID_APPLICATION_IDENTIFIER,
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
  ANDROID_APPLICATION_IDENTIFIER,
  PROJECT_FULL_NAME,
  assignedSubmissionCredential,
  verifyEasManagedSubmitCredential,
};
