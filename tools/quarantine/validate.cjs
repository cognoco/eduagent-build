'use strict';

// Quarantine registry validator (WI-536). DETERMINISTIC — safe to gate the PR.
// Fails (exit 1) when an entry is missing an owner or a Cosmo WI-NN, when its
// path no longer exists (a stale entry that would rot silently), or on a
// duplicate. Run: `node tools/quarantine/validate.cjs`.

const fs = require('fs');
const path = require('path');
const { loadRegistry, REGISTRY_PATH } = require('./registry.cjs');

const REPO_ROOT = path.join(__dirname, '..', '..');
const WI_RE = /^WI-\d+$/;
const RUNNERS = new Set(['jest', 'playwright']);

function main() {
  let entries;
  try {
    entries = loadRegistry();
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }

  const problems = [];
  const seen = new Map();

  entries.forEach((e, i) => {
    const where = `entry[${i}]${e && e.id ? ` "${e.id}"` : ''}`;
    if (!e || typeof e !== 'object') {
      problems.push(`${where}: not an object`);
      return;
    }
    if (!RUNNERS.has(e.runner)) {
      problems.push(`${where}: runner must be "jest" or "playwright" (got ${JSON.stringify(e.runner)})`);
    }
    if (!e.path) {
      problems.push(`${where}: missing "path"`);
    } else if (!fs.existsSync(path.join(REPO_ROOT, e.path))) {
      problems.push(`${where}: STALE — quarantined path not found, un-quarantine or fix: ${e.path}`);
    }
    if (!e.owner) {
      problems.push(`${where}: missing "owner" — every quarantine entry needs an owner so it does not rot`);
    }
    if (!e.wi || !WI_RE.test(e.wi)) {
      problems.push(`${where}: missing/invalid "wi" tracking id (expected WI-NNN, got ${JSON.stringify(e.wi)})`);
    }
    if (!e.reason) {
      problems.push(`${where}: missing "reason"`);
    }
    if (e.path && e.runner) {
      const key = `${e.runner}:${e.path}`;
      if (seen.has(key)) problems.push(`${where}: duplicate of entry[${seen.get(key)}] (${key})`);
      else seen.set(key, i);
    }
  });

  if (problems.length) {
    console.error(`✖ quarantine registry INVALID (${problems.length} problem(s)) — ${REGISTRY_PATH}`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  console.log(`✓ quarantine registry OK — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} (${REGISTRY_PATH})`);
}

main();
