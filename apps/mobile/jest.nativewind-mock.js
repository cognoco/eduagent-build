/**
 * Nativewind jest mock — pnpm haste-map resolution fix.
 *
 * pnpm's content-addressable store places nativewind under a hashed path
 * (node_modules/.pnpm/nativewind@4.2.1_.../node_modules/nativewind/dist).
 * Jest's haste-map resolves `import { vars } from 'nativewind'` to the pnpm
 * dist build, which in turn requires 'react' via a path Jest cannot resolve
 * without native Babel/Metro transforms. The result is:
 *   Cannot find module 'react' from '.../nativewind/dist/index.js'
 *
 * Mapping 'nativewind' to this shim replaces the whole package in the Jest
 * environment. The shim only exports what the project's source files actually
 * use; extend if more exports are needed.
 */

module.exports = {
  vars: () => ({}),
  useColorScheme: () => ({ colorScheme: 'dark' }),
  cssInterop: (component) => component,
  remapProps: (component) => component,
  StyleSheet: {
    create: (styles) => styles,
    flatten: (style) => style,
  },
};
