/**
 * react-native-fit-image jest mock — pnpm haste-map resolution fix.
 *
 * react-native-markdown-display depends on react-native-fit-image, which
 * pnpm places under a hashed path. Jest's resolver cannot find 'react' from
 * that path without native transforms, yielding:
 *   Cannot find module 'react' from
 *   '.../react-native-fit-image@1.5.5/.../dist/FitImage.js'
 *
 * Mapping the package to this shim prevents the resolution failure. The
 * project's session tests that use react-native-markdown-display mock the
 * markdown component entirely, so FitImage is never actually rendered in tests.
 */

const React = require('react');
const { View } = require('react-native');

function FitImage(props) {
  return React.createElement(View, props);
}

module.exports = FitImage;
module.exports.default = FitImage;
