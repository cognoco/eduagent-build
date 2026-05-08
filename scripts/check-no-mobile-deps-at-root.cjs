#!/usr/bin/env node
// Forbid mobile-only runtime dependencies in the workspace root package.json.
//
// Background: pnpm materializes a separate physical copy of a package per
// peer-dep context. When the root and apps/mobile both declare the same
// mobile dep, pnpm produces multiple copies under node_modules/.pnpm/ —
// the patched react-native-css-interop transformer injects styles into
// one copy while app components import from another. Every className=
// silently produces zero styles. See:
//   .claude/memory/feedback_nativewind_root_pkg_split.md

const fs = require('fs');
const path = require('path');

const FORBIDDEN = [
  '@expo/metro-config',
  '@expo/metro-runtime',
  'expo',
  'expo-font',
  'expo-linking',
  'expo-router',
  'expo-splash-screen',
  'expo-status-bar',
  'expo-system-ui',
  'nativewind',
  'react-native',
  'react-native-css-interop',
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-safe-area-context',
  'react-native-screens',
  'react-native-svg',
  'react-native-svg-transformer',
  'react-native-web',
];

const rootPkgPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));

const offenders = [];
for (const section of ['dependencies', 'devDependencies']) {
  const block = pkg[section] || {};
  for (const dep of FORBIDDEN) {
    if (Object.prototype.hasOwnProperty.call(block, dep)) {
      offenders.push(`${section}.${dep}`);
    }
  }
}

if (offenders.length > 0) {
  const lines = [
    '',
    'ERROR: mobile-only dependencies found in root package.json.',
    '',
    'These packages must live ONLY in apps/mobile/package.json. Declaring',
    'them at root creates parallel pnpm peer-dep contexts that silently',
    'break NativeWind className styling on native bundles.',
    '',
    'Offenders:',
    ...offenders.map((o) => `  - ${o}`),
    '',
    'Fix: remove these entries from package.json (root) and run `pnpm install`.',
    'Background: .claude/memory/feedback_nativewind_root_pkg_split.md',
    '',
  ];
  console.error(lines.join('\n'));
  process.exit(1);
}

console.log('OK: no mobile-only dependencies in root package.json');
