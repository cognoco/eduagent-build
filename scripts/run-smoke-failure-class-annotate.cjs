#!/usr/bin/env node
'use strict';

// Run-smoke failure-class PR annotation (WI-2452 / AC-3).
//
// e2e-web.yml's run-smoke lanes already compute a failure class via
// scripts/playwright-staging-gate.cjs's `--classify` mode (FAILURE_CLASS=
// <kind> written to a state file) — today that classification is consumed
// only internally by `--decide` and never surfaced. This script reads that
// same state file and posts a human-readable "which bucket did this red
// belong to" annotation: a GitHub Actions `::notice::` (visible on the PR's
// Checks tab and the job's Job Summary) plus a $GITHUB_STEP_SUMMARY block.
// Chosen over a PR *comment* to avoid adding `pull-requests: write` scope to
// e2e-web.yml and the fork-PR degradation handling a comment would need
// (this workflow already runs the real smoke only for trusted same-repo PRs
// or a manual dispatch, so annotations are never attempted for forks either,
// but the annotation approach needs no new permissions to be correct there).
//
// Never fails the job: a missing/unreadable state file (suite never ran —
// zero projects in this lane today, or a canary preflight bail) prints a
// neutral line and exits 0. This is an informational sidecar, not a gate.

const fs = require('fs');

const STATE_LINE = /^FAILURE_CLASS=(.+)$/m;

const BUCKETS = Object.freeze({
  success: {
    label: 'Success',
    meaning: 'The suite passed — nothing to classify.',
  },
  cancellation: {
    label: 'Cancelled',
    meaning:
      'The run was cancelled mid-suite (e.g. a newer push superseded it). No action.',
  },
  product: {
    label: 'Product bug',
    meaning:
      'A real assertion, config, or test-discovery failure — investigate the code, not staging.',
  },
  'infra-signalled': {
    label: 'Ambient staging infra',
    meaning:
      'A transient network/5xx signal to the staging API was found in the Playwright trace — usually not caused by this PR.',
  },
  unknown: {
    label: 'Unknown',
    meaning:
      'Could not confidently classify the failure — treat as signal until proven otherwise.',
  },
  'not-run': {
    label: 'Suite not run',
    meaning:
      'The staging canary preflight bailed before the suite started — see the canary state, not the test code.',
  },
});

function bucketFor(kind) {
  return (
    BUCKETS[kind] ?? {
      label: 'Unrecognized',
      meaning: `Classifier returned an unrecognized value (${JSON.stringify(kind)}) — treat as signal.`,
    }
  );
}

function formatAnnotation({ lane, kind }) {
  const bucket = bucketFor(kind);
  const noticeLine = `::notice title=Run-smoke failure class (${lane} lane)::${bucket.label} — ${bucket.meaning}`;
  const summaryMarkdown = [
    `### Run-smoke failure class — ${lane} lane`,
    '',
    `**Class:** ${bucket.label} (\`${kind}\`)`,
    '',
    bucket.meaning,
    '',
  ].join('\n');
  return { noticeLine, summaryMarkdown };
}

function readFailureClass(stateFilePath) {
  let raw;
  try {
    raw = fs.readFileSync(stateFilePath, 'utf8');
  } catch {
    return null;
  }
  const match = STATE_LINE.exec(raw);
  return match ? match[1].trim() : null;
}

module.exports = { BUCKETS, bucketFor, formatAnnotation, readFailureClass };

if (require.main === module) {
  const [lane, stateFilePath] = process.argv.slice(2);
  if (!lane || !stateFilePath) {
    process.stderr.write(
      'usage: node run-smoke-failure-class-annotate.cjs <lane> <classify-state-file>\n',
    );
    process.exit(2);
  }

  const kind = readFailureClass(stateFilePath);
  if (kind === null) {
    console.log(
      `Run-smoke failure class (${lane} lane): not classified — no classification state file at ${stateFilePath} (suite likely did not run in this lane).`,
    );
    process.exit(0);
  }

  const { noticeLine, summaryMarkdown } = formatAnnotation({ lane, kind });
  console.log(noticeLine);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    fs.appendFileSync(summaryPath, summaryMarkdown + '\n');
  }
  process.exit(0);
}
