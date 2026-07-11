/**
 * Expo config plugin: allow the trusted native E2E release APK to call the
 * runner-local API over http://10.0.2.2. Normal production builds are left
 * unchanged and retain Android's default cleartext-deny policy.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

function applyE2ECleartextPolicy(manifest, isE2EBuild) {
  const application = manifest.application?.[0];
  if (!application) {
    throw new Error('Android manifest is missing its application element');
  }

  application.$ = application.$ ?? {};
  if (isE2EBuild) {
    application.$['android:usesCleartextTraffic'] = 'true';
  } else {
    delete application.$['android:usesCleartextTraffic'];
  }
  return manifest;
}

function withE2ECleartextForTests(config) {
  return withAndroidManifest(config, (modConfig) => {
    applyE2ECleartextPolicy(
      modConfig.modResults.manifest,
      process.env.EXPO_PUBLIC_E2E === 'true',
    );
    return modConfig;
  });
}

module.exports = withE2ECleartextForTests;
module.exports.applyE2ECleartextPolicy = applyE2ECleartextPolicy;
