#!/usr/bin/env node
// Cross-platform Doppler CLI resolver (WI-1247). CI installs `doppler` to
// /usr/local/bin and invokes it bare (see .github/workflows/deploy.yml,
// e2e-web.yml, eval-live.yml), and most macOS/Linux dev installs (Homebrew,
// curl) put it on PATH too — so PATH is tried first and is a no-op change for
// everyone already working. Only a Windows dev whose doppler is NOT on PATH
// (installed at C:/Tools/doppler/doppler.exe) needs the fallback.
//
// Usage: node scripts/doppler-run.mjs <doppler args...>
// All args are forwarded to doppler verbatim (no reparsing) via {stdio:
// 'inherit'}, and this process exits with doppler's own exit code.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const WINDOWS_FALLBACK = 'C:/Tools/doppler/doppler.exe';

function isOnPath(bin) {
  const result = spawnSync(bin, ['--version'], { stdio: 'ignore' });
  return !result.error;
}

function resolveDopplerBinary({
  platform = process.platform,
  pathLookup = isOnPath,
  fileExists = existsSync,
} = {}) {
  if (pathLookup('doppler')) return 'doppler';
  if (platform === 'win32' && fileExists(WINDOWS_FALLBACK)) return WINDOWS_FALLBACK;
  throw new Error(
    `doppler not found on PATH or at ${WINDOWS_FALLBACK}. Install the Doppler CLI: https://docs.doppler.com/docs/install-cli`,
  );
}

// Test-only entry point (WI-1247): scripts/doppler-run.test.ts exercises
// resolveDopplerBinary's full decision matrix (incl. the win32 fallback,
// which can't occur naturally on the Linux/macOS machines this runs the
// rest of the suite on) via injected env vars, run as a subprocess. Jest's
// CJS test runner can't import this ESM file directly (no repo precedent —
// see scripts/sync-skills.test.ts, which drives sync-skills.mjs the same
// subprocess way), so this mirrors that convention instead of adding one.
function selfTest() {
  const platform = process.env.DOPPLER_RUN_SELF_TEST_PLATFORM || process.platform;
  const pathHit = process.env.DOPPLER_RUN_SELF_TEST_PATH_HIT === '1';
  const fallbackExists = process.env.DOPPLER_RUN_SELF_TEST_FALLBACK_EXISTS === '1';
  try {
    const binary = resolveDopplerBinary({
      platform,
      pathLookup: () => pathHit,
      fileExists: () => fallbackExists,
    });
    console.log(binary);
    process.exit(0);
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function main() {
  if (process.env.DOPPLER_RUN_SELF_TEST === '1') {
    selfTest();
    return;
  }
  let binary;
  try {
    binary = resolveDopplerBinary();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
  if (result.error) {
    console.error(`Failed to run ${binary}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
