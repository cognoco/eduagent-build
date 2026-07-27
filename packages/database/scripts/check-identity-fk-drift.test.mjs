import assert from 'node:assert/strict';
import { test } from 'node:test';

async function loadChecker() {
  try {
    return await import('./check-identity-fk-drift.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

async function runChecker({ databaseUrl, rows = [], queryError }) {
  const checker = await loadChecker();
  assert.ok(checker, 'identity FK checker module must exist');

  const stdout = [];
  const stderr = [];
  let queryCalls = 0;

  const exitCode = await checker.runIdentityFkCheck({
    databaseUrl,
    queryCatalog: async () => {
      queryCalls += 1;
      if (queryError) throw queryError;
      return rows;
    },
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });

  return { checker, exitCode, queryCalls, stdout, stderr };
}

test('catalog query exactly guards the migration 0129 profiles boundary', async () => {
  const checker = await loadChecker();
  assert.ok(checker, 'identity FK checker module must exist');

  const normalized = checker.LEGACY_PROFILE_FK_QUERY.replace(/\s+/g, ' ');
  assert.match(normalized, /WHERE c\.contype = 'f'/);
  assert.match(normalized, /c\.confrelid = to_regclass\('public\.profiles'\)/);
  assert.match(normalized, /c\.conrelid NOT IN \( SELECT relation/);
  assert.match(normalized, /WHERE relation IS NOT NULL/);

  for (const relation of [
    'profiles',
    'accounts',
    'family_links',
    'consent_states',
  ]) {
    assert.match(
      normalized,
      new RegExp(`to_regclass\\('public\\.${relation}'\\)`),
    );
  }
});

test('missing credential fails closed without querying', async () => {
  const result = await runChecker({ databaseUrl: '' });

  assert.equal(result.exitCode, 1);
  assert.equal(result.queryCalls, 0);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'identity FK freshness unavailable: DATABASE_URL is not set; provide the environment-scoped evidence credential',
  ]);
});

test('clean catalog returns success', async () => {
  const result = await runChecker({
    databaseUrl: 'postgresql://example.invalid/database',
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.queryCalls, 1);
  assert.deepEqual(result.stderr, []);
  assert.deepEqual(result.stdout, [
    'identity FK freshness passed: no non-legacy child targets profiles.id',
  ]);
});

test('drift returns exit 2 with stable constraint diagnostics', async () => {
  const result = await runChecker({
    databaseUrl: 'postgresql://example.invalid/database',
    rows: [
      {
        constraintName: 'notification_preferences_profile_id_profiles_id_fk',
        childTable: 'notification_preferences',
        childColumns: ['profile_id'],
        parentTable: 'profiles',
        parentColumns: ['id'],
      },
      {
        constraintName: 'learning_profiles_profile_id_profiles_id_fk',
        childTable: 'learning_profiles',
        childColumns: ['profile_id'],
        parentTable: 'profiles',
        parentColumns: ['id'],
      },
    ],
  });

  assert.equal(result.exitCode, 2);
  assert.equal(result.queryCalls, 1);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'identity FK freshness failed: 2 non-legacy child constraint(s) still target profiles.id',
    '- learning_profiles.learning_profiles_profile_id_profiles_id_fk: (profile_id) -> profiles(id)',
    '- notification_preferences.notification_preferences_profile_id_profiles_id_fk: (profile_id) -> profiles(id)',
  ]);
});

test('query rejection fails unavailable without exposing a credential', async () => {
  const marker = 'WI2487_DUMMY_SECRET';
  const result = await runChecker({
    databaseUrl: `postgresql://user:${marker}@example.invalid/database`,
    queryError: new Error(
      `invalid URL: postgresql://user:${marker}@example.invalid/database`,
    ),
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.queryCalls, 1);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    'identity FK freshness unavailable: catalog query failed',
  ]);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(marker));
});
