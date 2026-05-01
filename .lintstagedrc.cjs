// node --stack-size=65536 works around a Windows stack overflow in eslint's
// AST traversal on this codebase. Required on Windows; harmless elsewhere.
// Background: see memory note project_nx_expo_plugin_bug.md.
module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'node --stack-size=65536 node_modules/eslint/bin/eslint.js --fix',
    'prettier --write',
  ],
  '*.{json,css,scss,md}': ['prettier --write'],
};
