/**
 * Expo config plugin: remove android.permission.ACTIVITY_RECOGNITION.
 *
 * `expo-sensors` declares ACTIVITY_RECOGNITION in its bundled
 * AndroidManifest.xml because the package supports Pedometer (step counting).
 * We only use the Accelerometer (for shake-to-feedback in
 * src/hooks/use-shake-detector.ts), which does NOT require the permission.
 *
 * Without this plugin the merged manifest pulls in ACTIVITY_RECOGNITION,
 * which surfaces in Android App info as "Physical activity" and causes
 * users to question why a tutoring app needs activity tracking.
 *
 * The `tools:node="remove"` rule tells the Android manifest merger to drop
 * the library's declaration so the final APK doesn't request it.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const PERMISSION = 'android.permission.ACTIVITY_RECOGNITION';
const TOOLS_NS = 'http://schemas.android.com/tools';

function withRemoveActivityRecognition(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    manifest.$ = manifest.$ ?? {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = TOOLS_NS;
    }

    manifest['uses-permission'] = manifest['uses-permission'] ?? [];
    const existing = manifest['uses-permission'].find(
      (p) => p.$?.['android:name'] === PERMISSION
    );

    if (existing) {
      existing.$['tools:node'] = 'remove';
    } else {
      manifest['uses-permission'].push({
        $: {
          'android:name': PERMISSION,
          'tools:node': 'remove',
        },
      });
    }

    return modConfig;
  });
}

module.exports = withRemoveActivityRecognition;
