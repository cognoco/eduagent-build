// jest.text-input-mock.js
//
// Replaces react-native's TextInput with a minimal forwardRef stub that:
// 1. Renders a stable 'TextInput' host element (works in RNTL queries)
// 2. Forwards testID so screen.getByTestId(...) works
// 3. Has a .displayName so react-native-css-interop's wrapJSX / maybeHijackSafeAreaProvider
//    never reads undefined.displayName regardless of Platform.OS override
// 4. Exposes Commands (focus/blur/setTextAndSelection) for imperative ref tests
//
// Why this file exists:
//   react-native/jest/setup.js mocks TextInput via the haste `m#` module system.
//   In the jest-expo 54 / Jest 30 setup used by this project, those haste mocks
//   are not applied — the real TextInput.js evaluates. TextInput.js conditionally
//   requires native components based on Platform.OS at MODULE-EVAL time. With the
//   iOS-defaulted haste resolver (defaultPlatform: 'ios'), Platform.OS === 'ios',
//   so the android branch is never executed, leaving AndroidTextInput = undefined.
//   Tests that override Platform.OS to 'android' at test-run time then render
//   <AndroidTextInput />, crashing react-native-css-interop's wrapJSX.

const React = require('react');

const TextInputStub = React.forwardRef(function TextInput(props, ref) {
  const { children, testID, onChangeText, value, defaultValue, ...rest } = props;
  return React.createElement(
    'TextInput',
    {
      testID,
      ref,
      value,
      defaultValue,
      onChange: props.onChange,
      onChangeText,
      onFocus: props.onFocus,
      onBlur: props.onBlur,
      onSubmitEditing: props.onSubmitEditing,
      onKeyPress: props.onKeyPress,
      secureTextEntry: props.secureTextEntry,
      placeholder: props.placeholder,
      editable: props.editable,
      multiline: props.multiline,
      keyboardType: props.keyboardType,
      returnKeyType: props.returnKeyType,
      autoCapitalize: props.autoCapitalize,
      autoCorrect: props.autoCorrect,
      autoFocus: props.autoFocus,
      maxLength: props.maxLength,
      ...rest,
    },
    children
  );
});
TextInputStub.displayName = 'TextInput';
TextInputStub.State = { currentlyFocusedInput: () => null, currentlyFocusedField: () => null };

module.exports = {
  __esModule: true,
  default: TextInputStub,
};
