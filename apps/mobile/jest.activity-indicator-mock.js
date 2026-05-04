// jest.activity-indicator-mock.js
//
// Replaces react-native's ActivityIndicator with a minimal forwardRef stub
// for the same reason as jest.text-input-mock.js: ActivityIndicator.js
// captures `PlatformActivityIndicator` at MODULE-EVAL time based on
// Platform.OS. With the iOS-defaulted polyfill, the iOS variant is captured;
// tests that flip Platform.OS to 'android' at runtime then render
// <PlatformActivityIndicator /> via the conditional in the JSX, but the
// captured constant points at the iOS native component (or the Android branch
// stays undefined if android was the module-eval default). Either way,
// react-native-css-interop's wrapJSX may receive an undefined `type` and
// crash on `type.displayName`.

const React = require('react');

const ActivityIndicatorStub = React.forwardRef(function ActivityIndicator(
  props,
  ref
) {
  const { children, testID, ...rest } = props;
  return React.createElement(
    'ActivityIndicator',
    { testID, ref, ...rest },
    children
  );
});
ActivityIndicatorStub.displayName = 'ActivityIndicator';

module.exports = {
  __esModule: true,
  default: ActivityIndicatorStub,
};
