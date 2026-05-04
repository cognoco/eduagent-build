// jest.text-input-native-mock.js
//
// Replaces all three TextInput native component modules (Android + iOS singleline
// + iOS multiline) via moduleNameMapper so they are always defined regardless of
// which Platform.OS branch react-native/Libraries/Components/TextInput/TextInput.js
// evaluated at module-load time.
//
// Background: jest.polyfills.js stubs __turboModuleProxy('PlatformConstants')
// with systemName: 'iOS', so Platform.OS === 'ios' at TextInput.js module-eval
// time. AndroidTextInput therefore stays undefined. Tests that override
// Platform.OS to 'android' at test-time then render <TextInput>, which tries to
// render undefined as a host component. react-native-css-interop's wrapJSX calls
// maybeHijackSafeAreaProvider(type) which reads type.displayName — crash.
//
// This file is a plain .js file (no Babel css-interop transform applied to it
// because it matches the allowedFileRegex exclusion in the babel-plugin, or is
// loaded via moduleNameMapper before Babel can inject the interop import).

const React = require('react');

const noop = () => undefined;
const Commands = { focus: noop, blur: noop, setTextAndSelection: noop };

function makeStub(displayName) {
  const Component = React.forwardRef(function TextInputNativeStub(
    props,
    ref
  ) {
    const { children, testID, ...rest } = props;
    return React.createElement('RCTTextInput', { testID, ref, ...rest }, children);
  });
  Component.displayName = displayName;
  return { __esModule: true, default: Component, Commands };
}

// All three paths export the same shape; moduleNameMapper chooses which displayName
// to use based on the import path regex group — but here we export a single object
// that covers all three use-cases since moduleNameMapper maps all paths to this file.
//
// TextInput.js only reads .default (the component) and .Commands from these modules.
// The displayName is only used by test assertions and error messages; 'RCTTextInput'
// is a safe generic name that won't break any existing testID-based assertions.
module.exports = makeStub('RCTTextInput');
