/**
 * Expo config plugin: disable Android force-dark.
 *
 * The app manages its own dark mode via NativeWind + ThemeContext.
 * Android's automatic force-dark (API 29+) interferes with
 * StyleSheet.create() colors in react-native-markdown-display,
 * causing coach bubble text to become invisible in dark mode.
 *
 * Sets android:forceDarkAllowed="false" on the <application> tag.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

function withForceDarkDisabled(config) {
  return withAndroidManifest(config, (modConfig) => {
    const app = modConfig.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:forceDarkAllowed'] = 'false';
    }
    return modConfig;
  });
}

module.exports = withForceDarkDisabled;
