/**
 * react-native-css-interop JSX runtime mock for Jest.
 *
 * Keep this as .cjs so babel-jest does not transform it with NativeWind's
 * Babel plugin. Tests only need ordinary React rendering, so delegate directly
 * to React's JSX runtime instead of loading css-interop's native styling
 * runtime.
 */

const React = require('react');
const jsxRuntime = require('react/jsx-runtime');
const jsxDevRuntime = require('react/jsx-dev-runtime');

module.exports = {
  Fragment: jsxRuntime.Fragment,
  jsx: jsxRuntime.jsx,
  jsxs: jsxRuntime.jsxs,
  jsxDEV: jsxDevRuntime.jsxDEV,
  createInteropElement: React.createElement,
  createElement: React.createElement,
  cssInterop: (component) => component,
  remapProps: (component) => component,
  vars: () => ({}),
  useColorScheme: () => ({ colorScheme: 'dark' }),
  useSafeAreaEnv: () => undefined,
  useUnstableNativeVariable: () => undefined,
  rem: (value) => value,
  colorScheme: {
    get: () => 'dark',
    set: () => undefined,
    toggle: () => undefined,
  },
  StyleSheet: {
    create: (styles) => styles,
    flatten: (style) => style,
  },
};
