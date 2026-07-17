// ---------------------------------------------------------------------------
// EAS Build Post-Install Script
// ---------------------------------------------------------------------------
// Runs after `pnpm install` during EAS cloud builds to ensure workspace
// package symlinks are correctly resolved in the monorepo.
//
// Usage (from apps/mobile/package.json):
//   node tools/scripts/eas-build-post-install.mjs . apps/mobile
//
// EAS builds run `eas-build-post-install` from the project directory after
// installing dependencies. In an Nx + pnpm workspace, the `workspace:*`
// protocol links (e.g., @eduagent/schemas) must resolve to built artifacts.
// The pre-build step (`nx run-many -t build -p @eduagent/schemas`) in the
// eas-build-post-install script in package.json handles building deps before
// this script runs.
//
// This script verifies that workspace dependencies are accessible from the
// mobile app's node_modules and logs diagnostic info for debugging EAS builds.
// ---------------------------------------------------------------------------

import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [, , monorepoRoot = '.', appDir = 'apps/mobile'] = process.argv;

const root = resolve(monorepoRoot);
const appPath = resolve(root, appDir);

console.log('[eas-build-post-install] Monorepo root:', root);
console.log('[eas-build-post-install] App directory:', appPath);

// Workspace packages that the mobile app depends on
const workspaceDeps = ['@eduagent/schemas'];

let hasErrors = false;

for (const dep of workspaceDeps) {
  // Check hoisted node_modules (shamefully-hoist=true)
  const hoistedPath = join(root, 'node_modules', dep);
  // Check local node_modules
  const localPath = join(appPath, 'node_modules', dep);

  if (existsSync(hoistedPath)) {
    console.log(`[eas-build-post-install] OK: ${dep} found at ${hoistedPath}`);
  } else if (existsSync(localPath)) {
    console.log(`[eas-build-post-install] OK: ${dep} found at ${localPath}`);
  } else {
    console.error(
      `[eas-build-post-install] ERROR: ${dep} not found in node_modules. ` +
        `Checked:\n  - ${hoistedPath}\n  - ${localPath}`
    );
    hasErrors = true;
  }
}

// Verify .npmrc is present (shamefully-hoist=true is required)
const npmrcPath = join(root, '.npmrc');
if (existsSync(npmrcPath)) {
  console.log('[eas-build-post-install] OK: .npmrc found');
} else {
  console.warn(
    '[eas-build-post-install] WARN: .npmrc not found at root. ' +
      'shamefully-hoist=true may be missing.'
  );
}

// Preflight (WI-2120): EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is an EAS Environment
// Variable (Sink 2, docs/deployment-and-secrets.md), not a committed eas.json
// value — a missing per-environment entry silently ships a build where Clerk
// auth can't initialize. Fail the build here, before any artifact exists,
// rather than after upload.
if (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  console.log('[eas-build-post-install] OK: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is set');
} else {
  console.error(
    '[eas-build-post-install] ERROR: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is empty. ' +
      'Set it via `eas env:create --environment <env> --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ' +
      "--value '<pk_...>' --visibility plaintext` (see docs/deployment-and-secrets.md " +
      '"Sink 2 — EAS Environment Variables").'
  );
  hasErrors = true;
}

if (hasErrors) {
  console.error(
    '[eas-build-post-install] Some workspace dependencies are missing. ' +
      'The build may fail.'
  );
  process.exit(1);
}

console.log('[eas-build-post-install] Post-install checks passed.');
