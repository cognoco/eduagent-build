// Maestro seed helper — runs in GraalJS (Maestro's embedded JS engine).
// No require/import — uses Maestro's built-in http module and __maestro env.
//
// Usage in YAML:
//   - runScript:
//       file: ../../scripts/seed.js
//       env:
//         API_URL: ${API_URL}
//         SCENARIO: with-subject
//       outputVariable: seedResult
//
// After execution, access via: ${output.seedResult.email}, etc.

const scenario = __maestro.env['SCENARIO'] || 'onboarding-complete';
const apiUrl = __maestro.env['API_URL'] || 'http://10.0.2.2:8787';
// Default to a fixed email so Clerk reuses the same test user across runs
// (avoids creating a new Clerk user every time the seed runs).
// The `+clerk_test` infix puts this address into Clerk's test-mode bucket:
// forgot-password and verification flows accept the fixed code 424242 and
// do NOT consume Clerk dev's monthly email quota. Only valid on Clerk dev
// instances (pk_test_); production rejects it.
const email = __maestro.env['EMAIL'] || 'test-e2e+clerk_test@example.com';

const response = http.post(apiUrl + '/v1/__test/seed', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ scenario: scenario, email: email }),
});

if (response.status !== 201) {
  throw new Error(
    'Seed failed: HTTP ' + response.status + ' — ' + response.body,
  );
}

const data = JSON.parse(response.body);

// Expose seed result fields as output variables for Maestro flows
output.accountId = data.accountId;
output.profileId = data.profileId;
output.email = data.email;
output.password = data.password;
output.scenario = scenario;

// Spread scenario-specific IDs (subjectId, topicId, sessionIds, etc.)
if (data.ids) {
  for (const key in data.ids) {
    output[key] = data.ids[key];
  }
}
