import { createHash } from 'node:crypto';

const PROTECTED_LABEL =
  /(^|[._-])(dev|development|stg|staging|prd|prod|production)([._-]|$)/i;
const TARGET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{7,63}$/;

export class BootstrapRefusal extends Error {}

export function refuseDisposableIntegrationTarget(reason) {
  throw new BootstrapRefusal(
    `Disposable API integration schema bootstrap refused: ${reason}`,
  );
}

function requiredEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    refuseDisposableIntegrationTarget(`${name} is required.`);
  }
  return value;
}

function normalizedHost(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/:\d+$/, '');
  }
}

function endpointFingerprint(host, databaseName) {
  return createHash('sha256')
    .update(host)
    .update('\0')
    .update(databaseName)
    .digest('hex');
}

/** Validate operator-supplied target identity without loading database clients. */
export function validateDisposableApiIntegrationTarget(env) {
  if (requiredEnv(env, 'DOPPLER_PROJECT') !== 'mentomate') {
    refuseDisposableIntegrationTarget('DOPPLER_PROJECT must be mentomate.');
  }
  if (requiredEnv(env, 'DOPPLER_CONFIG') !== 'dev_integration') {
    refuseDisposableIntegrationTarget(
      'DOPPLER_CONFIG must be dev_integration.',
    );
  }
  if (requiredEnv(env, 'DOPPLER_ENVIRONMENT') !== 'dev') {
    refuseDisposableIntegrationTarget('DOPPLER_ENVIRONMENT must be dev.');
  }
  if (requiredEnv(env, 'INTEGRATION_DATABASE_DISPOSABLE') !== 'true') {
    refuseDisposableIntegrationTarget(
      'INTEGRATION_DATABASE_DISPOSABLE=true is required.',
    );
  }

  const databaseUrl = requiredEnv(env, 'DATABASE_URL');
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    refuseDisposableIntegrationTarget('DATABASE_URL is not a parseable URL.');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    refuseDisposableIntegrationTarget(
      'DATABASE_URL must use the postgres or postgresql protocol.',
    );
  }

  const host = parsed.hostname.toLowerCase();
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!host || !databaseName) {
    refuseDisposableIntegrationTarget(
      'DATABASE_URL must identify a host and database name.',
    );
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    refuseDisposableIntegrationTarget(
      'this path is only for the dedicated remote disposable target.',
    );
  }

  const expectedHost = requiredEnv(
    env,
    'INTEGRATION_DATABASE_HOST',
  ).toLowerCase();
  const expectedName = requiredEnv(env, 'INTEGRATION_DATABASE_NAME');
  if (host !== expectedHost) {
    refuseDisposableIntegrationTarget(
      'DATABASE_URL does not match INTEGRATION_DATABASE_HOST.',
    );
  }
  if (databaseName !== expectedName) {
    refuseDisposableIntegrationTarget(
      'DATABASE_URL does not match INTEGRATION_DATABASE_NAME.',
    );
  }

  const targetId = requiredEnv(env, 'INTEGRATION_DATABASE_TARGET_ID');
  if (!TARGET_ID_PATTERN.test(targetId)) {
    refuseDisposableIntegrationTarget(
      'INTEGRATION_DATABASE_TARGET_ID must be a unique 8-64 character lowercase identifier.',
    );
  }
  if (!databaseName.toLowerCase().includes(targetId.toLowerCase())) {
    refuseDisposableIntegrationTarget(
      'database name must contain the unique integration target id.',
    );
  }

  if (PROTECTED_LABEL.test(host) || PROTECTED_LABEL.test(databaseName)) {
    refuseDisposableIntegrationTarget(
      'endpoint identity contains a protected environment label.',
    );
  }

  for (const [environment, key] of [
    ['development', 'DATABASE_URL_DEVELOPMENT_HOST'],
    ['staging', 'DATABASE_URL_STAGING_HOST'],
    ['production', 'DATABASE_URL_PRODUCTION_HOST'],
  ]) {
    const protectedHost = normalizedHost(requiredEnv(env, key));
    if (host === protectedHost) {
      refuseDisposableIntegrationTarget(
        `endpoint matches the protected ${environment} database.`,
      );
    }
  }

  return {
    databaseUrl,
    host,
    databaseName,
    targetId,
    endpointFingerprint: endpointFingerprint(host, databaseName),
  };
}
