module.exports = function (api) {
  const isTest = api.env('test');
  return {
    presets: [
      ['babel-preset-expo', isTest ? {} : { jsxImportSource: 'nativewind' }],
    ],
    plugins: [
      // Jest screen tests assert behavior, not NativeWind style extraction.
      // Skipping the NativeWind Babel plugin in test mode avoids loading
      // react-native-css-interop's native styling runtime in worker processes.
      !isTest && 'nativewind/babel',
      'react-native-reanimated/plugin',
    ].filter(Boolean),
  };
};
