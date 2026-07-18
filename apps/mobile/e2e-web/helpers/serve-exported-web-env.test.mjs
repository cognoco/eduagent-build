import assert from 'node:assert/strict';
import test from 'node:test';

import { applyExpoPublicEnvOverrides } from './serve-exported-web-env.mjs';

test('applyExpoPublicEnvOverrides writes API URL and explicit mode-nav flags', () => {
  const result = applyExpoPublicEnvOverrides(
    [
      'EXPO_PUBLIC_API_URL="http://old.example"',
      'EXPO_PUBLIC_ENABLE_MODE_NAV="false"',
      'EXPO_PUBLIC_ENABLE_MODE_NAV_V1="false"',
      'EXPO_PUBLIC_ENABLE_MODE_NAV_V2="false"',
      'EXPO_PUBLIC_OTHER="keep-me"',
      '',
    ].join('\n'),
    {
      EXPO_PUBLIC_API_URL: 'https://api-stg.mentomate.com',
      EXPO_PUBLIC_E2E: 'true',
      EXPO_PUBLIC_ENABLE_MODE_NAV: 'true',
      EXPO_PUBLIC_ENABLE_MODE_NAV_V1: 'true',
      EXPO_PUBLIC_ENABLE_MODE_NAV_V2: 'true',
    },
  );

  assert.match(
    result,
    /^EXPO_PUBLIC_API_URL="https:\/\/api-stg\.mentomate\.com"$/m,
  );
  assert.match(result, /^EXPO_PUBLIC_E2E="true"$/m);
  assert.match(result, /^EXPO_PUBLIC_ENABLE_MODE_NAV="true"$/m);
  assert.match(result, /^EXPO_PUBLIC_ENABLE_MODE_NAV_V1="true"$/m);
  assert.match(result, /^EXPO_PUBLIC_ENABLE_MODE_NAV_V2="true"$/m);
  assert.match(result, /^EXPO_PUBLIC_OTHER="keep-me"$/m);
});

test('applyExpoPublicEnvOverrides only writes mode-nav flags explicitly provided by the run', () => {
  const result = applyExpoPublicEnvOverrides('', {
    EXPO_PUBLIC_API_URL: 'http://127.0.0.1:8787',
  });

  assert.match(result, /^EXPO_PUBLIC_API_URL="http:\/\/127\.0\.0\.1:8787"$/m);
  assert.doesNotMatch(result, /EXPO_PUBLIC_ENABLE_MODE_NAV/);
  assert.doesNotMatch(result, /EXPO_PUBLIC_E2E/);
});
