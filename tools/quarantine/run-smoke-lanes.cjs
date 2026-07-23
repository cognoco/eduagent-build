'use strict';

// Run-smoke lane resolver + quarantine-with-expiry (WI-2452).
//
// Declares the full current e2e-web smoke set as the required-stable CORE
// lane — no stability judgment is made here; everything is provisionally
// core until a PM-approved quarantine says otherwise. A project moves to the
// non-gating ADVISORY lane only via an unexpired entry in
// run-smoke-quarantine.json; an expired (or absent) entry is ignored and the
// project auto-reverts to core — no permanent mutes. The existing run-smoke
// job consumes both lanes; its core result is required and advisory remains
// visible without gating.
//
// This is a DIFFERENT mechanism from tools/quarantine/quarantine.json
// (registry.cjs / WI-536): that registry fully SKIPS a test FILE from the PR
// gate. This one DEMOTES a Playwright smoke PROJECT from the required-stable
// core lane to the advisory lane — the project still runs, it just stops being
// part of the required-stable set wired by WI-2458.
// Kept as a sibling file/registry rather than folded into registry.cjs
// because the two answer different questions and conflating them risks
// silently changing one mechanism's semantics while editing the other.

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, 'run-smoke-quarantine.json');

// The full legacy project set. The package runner and workflow consume this
// declaration; neither repeats the project list. The Playwright config is
// the source of truth for what each named project matches.
const DECLARED_CORE_PROJECTS = Object.freeze([
  'smoke-auth',
  'smoke-learner',
  'smoke-parent',
  'smoke-accessibility',
  'smoke-transport-recovery',
]);

const WI_RE = /^WI-\d+$/;

// Date.parse silently NORMALIZES an impossible calendar date instead of
// rejecting it — e.g. 2026-02-30T00:00:00.000Z parses to
// 2026-03-02T00:00:00.000Z — so a malformed "expires" could otherwise
// silently EXTEND a mute past its declared calendar expiry. This re-derives
// the UTC year/month/day Date.parse actually landed on and compares it
// against the Y-M-D the string literally asked for; a mismatch means the
// input's calendar date was impossible and must be rejected outright.
function isValidExpiresTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return false;
  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) return false;
  const parsed = new Date(parsedMs);
  const roundTrip = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
  return roundTrip === `${match[1]}-${match[2]}-${match[3]}`;
}

// registryPath defaults to REGISTRY_PATH but is injectable so tests can point
// this at a temp fixture instead of mutating the real committed registry.
function loadRegistry(registryPath = REGISTRY_PATH) {
  let raw;
  try {
    raw = fs.readFileSync(registryPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(
      `run-smoke-lanes: cannot read ${registryPath}: ${err.message}`,
    );
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `run-smoke-lanes: ${registryPath} is not valid JSON: ${err.message}`,
    );
  }
  // A missing file is fine (no registry yet — entries is empty). A file that
  // parses as JSON but whose "entries" is absent or not an array is a
  // DIFFERENT, malformed condition — distinct from a genuinely valid empty
  // ledger ({ "entries": [] }) — and must fail loud rather than silently
  // resolve to the same empty-array result.
  if (!Array.isArray(data.entries)) {
    throw new Error(
      `run-smoke-lanes: ${registryPath} is malformed — "entries" must be an array (got ${JSON.stringify(data.entries)}). A valid empty ledger is { "entries": [] }.`,
    );
  }
  return data.entries;
}

// An entry is active (still quarantining, i.e. demoting its project to
// advisory) only when `expires` parses to a valid date strictly after `now`.
// Anything else — missing, unparsable, or already past — is NOT active, so
// the failure mode is always "fall back to core" (required-stable), never
// "silently stay advisory".
function isActive(entry, now) {
  if (!entry || typeof entry.expires !== 'string') return false;
  if (!isValidExpiresTimestamp(entry.expires)) return false;
  const expiresAt = Date.parse(entry.expires);
  return expiresAt > now.getTime();
}

function resolveLanes(now = new Date(), entries = loadRegistry()) {
  const activeAdvisory = new Set(
    entries
      .filter(
        (e) => isActive(e, now) && DECLARED_CORE_PROJECTS.includes(e.project),
      )
      .map((e) => e.project),
  );
  const core = DECLARED_CORE_PROJECTS.filter((p) => !activeAdvisory.has(p));
  const advisory = DECLARED_CORE_PROJECTS.filter((p) => activeAdvisory.has(p));
  return { core, advisory };
}

function playwrightProjectFlags(projects) {
  return projects.map((p) => `--project=${p}`).join(' ');
}

// Deterministic registry-shape validator (WI-2452), mirrors
// tools/quarantine/validate.cjs's checks (WI-536): fails on a missing
// id/owner/wi/reason/expires, an unknown project name, an unparsable expires,
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
    if (!e.id) {
      problems.push(`${where}: missing "id"`);
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
    if (typeof e.expires !== 'string' || !isValidExpiresTimestamp(e.expires)) {
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
    let lanes;
    try {
      lanes = resolveLanes();
    } catch (err) {
      console.error(`✖ ${err.message}`);
      process.exit(1);
    }
    process.stdout.write(
      playwrightProjectFlags(mode === 'core' ? lanes.core : lanes.advisory) +
        '\n',
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
