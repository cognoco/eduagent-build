'use strict';

// Run-smoke lane resolver + quarantine-with-expiry (WI-2452).
//
// Declares the full current e2e-web smoke set as the required-stable CORE
// lane — no stability judgment is made here; everything is provisionally
// core until a PM-approved quarantine says otherwise. A project moves to the
// non-gating ADVISORY lane only via an unexpired entry in
// run-smoke-quarantine.json; an expired (or absent) entry is ignored and the
// project auto-reverts to core — no permanent mutes.
//
// This is a DIFFERENT mechanism from tools/quarantine/quarantine.json
// (registry.cjs / WI-536): that registry fully SKIPS a test FILE from the PR
// gate. This one DEMOTES a Playwright smoke PROJECT from the required-stable
// core lane to the advisory lane — the project still runs, it just stops
// being part of the set a future required check (WI-2458) would gate on.
// Kept as a sibling file/registry rather than folded into registry.cjs
// because the two answer different questions and conflating them risks
// silently changing one mechanism's semantics while editing the other.

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, 'run-smoke-quarantine.json');

// The full project set `pnpm run test:e2e:web:smoke` (package.json) invokes
// today. Keep this list in lockstep with that script's --project flags —
// apps/mobile/playwright.config.ts is the source of truth for what each
// project matches.
const DECLARED_CORE_PROJECTS = Object.freeze([
  'smoke-auth',
  'smoke-learner',
  'smoke-parent',
  'smoke-accessibility',
]);

const WI_RE = /^WI-\d+$/;

function loadRegistry() {
  let raw;
  try {
    raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(
      `run-smoke-lanes: cannot read ${REGISTRY_PATH}: ${err.message}`,
    );
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `run-smoke-lanes: ${REGISTRY_PATH} is not valid JSON: ${err.message}`,
    );
  }
  return Array.isArray(data.entries) ? data.entries : [];
}

// An entry is active (still quarantining, i.e. demoting its project to
// advisory) only when `expires` parses to a valid date strictly after `now`.
// Anything else — missing, unparsable, or already past — is NOT active, so
// the failure mode is always "fall back to core" (required-stable), never
// "silently stay advisory".
function isActive(entry, now) {
  if (!entry || typeof entry.expires !== 'string') return false;
  const expiresAt = Date.parse(entry.expires);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt > now.getTime();
}

function resolveLanes(now = new Date()) {
  const entries = loadRegistry();
  const activeAdvisory = new Set(
    entries
      .filter(
        (e) => isActive(e, now) && DECLARED_CORE_PROJECTS.includes(e.project),
      )
      .map((e) => e.project),
  );
  const core = DECLARED_CORE_PROJECTS.filter((p) => !activeAdvisory.has(p));
  const advisory = DECLARED_CORE_PROJECTS.filter((p) =>
    activeAdvisory.has(p),
  );
  return { core, advisory };
}

function playwrightProjectFlags(projects) {
  return projects.map((p) => `--project=${p}`).join(' ');
}

// Deterministic registry-shape validator (WI-2452), mirrors
// tools/quarantine/validate.cjs's checks (WI-536): fails on a missing
// owner/wi/reason/expires, an unknown project name, an unparsable expires,
// or a duplicate project entry. Does NOT require expires to be in the
// future — an already-expired entry is inert, not invalid, and removing it
// is a cleanup courtesy, not a correctness requirement.
function validate(entries) {
  const problems = [];
  const seen = new Map();

  entries.forEach((e, i) => {
    const where = `entry[${i}]${e && e.id ? ` "${e.id}"` : ''}`;
    if (!e || typeof e !== 'object') {
      problems.push(`${where}: not an object`);
      return;
    }
    if (!e.project || !DECLARED_CORE_PROJECTS.includes(e.project)) {
      problems.push(
        `${where}: "project" must be one of ${DECLARED_CORE_PROJECTS.join(', ')} (got ${JSON.stringify(e.project)})`,
      );
    }
    if (!e.owner) {
      problems.push(
        `${where}: missing "owner" — every quarantine entry needs an owner so it does not rot`,
      );
    }
    if (!e.wi || !WI_RE.test(e.wi)) {
      problems.push(
        `${where}: missing/invalid "wi" tracking id (expected WI-NNN, got ${JSON.stringify(e.wi)})`,
      );
    }
    if (!e.reason) {
      problems.push(`${where}: missing "reason"`);
    }
    if (typeof e.expires !== 'string' || Number.isNaN(Date.parse(e.expires))) {
      problems.push(
        `${where}: missing/invalid "expires" (expected an ISO 8601 date, got ${JSON.stringify(e.expires)})`,
      );
    }
    if (e.project) {
      if (seen.has(e.project)) {
        problems.push(
          `${where}: duplicate of entry[${seen.get(e.project)}] (project "${e.project}")`,
        );
      } else {
        seen.set(e.project, i);
      }
    }
  });

  return problems;
}

module.exports = {
  REGISTRY_PATH,
  DECLARED_CORE_PROJECTS,
  loadRegistry,
  isActive,
  resolveLanes,
  playwrightProjectFlags,
  validate,
};

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === 'core' || mode === 'advisory') {
    const { core, advisory } = resolveLanes();
    process.stdout.write(
      playwrightProjectFlags(mode === 'core' ? core : advisory) + '\n',
    );
  } else if (mode === 'validate') {
    let entries;
    try {
      entries = loadRegistry();
    } catch (err) {
      console.error(`✖ ${err.message}`);
      process.exit(1);
    }
    const problems = validate(entries);
    if (problems.length) {
      console.error(
        `✖ run-smoke lane quarantine registry INVALID (${problems.length} problem(s)) — ${REGISTRY_PATH}`,
      );
      problems.forEach((p) => console.error(`  - ${p}`));
      process.exit(1);
    }
    console.log(
      `✓ run-smoke lane quarantine registry OK — ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} (${REGISTRY_PATH})`,
    );
  } else {
    process.stderr.write(
      'usage: node run-smoke-lanes.cjs <core|advisory|validate>\n',
    );
    process.exit(2);
  }
}
