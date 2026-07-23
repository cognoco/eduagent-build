#!/usr/bin/env node

const response = process.argv[2];
if (!response) {
  throw new Error('seed response JSON is required');
}

const data = JSON.parse(response);
const values = {
  EMAIL: data.email,
  PASSWORD: data.password,
  ACCOUNT_ID: data.accountId,
  PROFILE_ID: data.profileId,
};
const idMappings = [];

for (const [key, value] of Object.entries(data.ids ?? {})) {
  const envKey = key.replace(/([A-Z])/g, '_$1').toUpperCase();
  values[envKey] = value;
  idMappings.push(`${key}->${envKey}`);
}

const entries = Object.entries(values).filter(
  ([, value]) => value !== undefined && value !== null,
);

console.error(
  `[ci-maestro] Seed env keys: ${entries.map(([key]) => key).join(',')}`,
);
console.error(`[ci-maestro] Seed ID mappings: ${idMappings.join(',')}`);
for (const [key, value] of entries) {
  console.log(`${key}=${value}`);
}
