#!/usr/bin/env node
// WI-1313 L1 liveness checker — the armed, scheduled, time-based check described in
// _quartet/library/liveness-checker.md §L1 steps 2-3. Reads a lane's recorded
// expected_activity_by deadline + margin from its monitor-manifest, reads the lane's
// ACTUAL last activity (outbox.jsonl last-line ts, else file mtime), and disposition:
//   activity within deadline           -> QUIET (no false alarm)
//   idle past deadline+margin          -> WAKE (emit orchestrator 'directive' with msg "wake: ...")
//   wake unacked past escalate window  -> ESCALATE (needs-operator)
// Pure read of real files; emits the directive to stdout as evidence, does NOT inject into
// any production inbox (demo-safe). Deterministic: "now" is injected so runs are reproducible.
//
// usage: node l1-liveness-check.js <lane-state-dir> --now <ISO> [--decision-seen 0|1]
const fs = require('fs');
const path = require('path');

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : def;
}
const stateDir = process.argv[2];
const now = new Date(arg('--now'));
const decisionSeen = arg('--decision-seen', '0') === '1';

const manifest = JSON.parse(
  fs.readFileSync(path.join(stateDir, 'monitor-manifest.json'), 'utf8'),
);
const liveness = (manifest.monitors || []).find((m) =>
  /liveness/.test(m.target || ''),
);
if (!liveness || !liveness.expected_activity_by) {
  console.log(
    JSON.stringify({
      disposition: 'NO-DEADLINE',
      note: 'no armed liveness deadline in manifest',
    }),
  );
  process.exit(0);
}
const deadline = new Date(liveness.expected_activity_by);
const marginMin = liveness.margin_minutes ?? 30;
const probeAt = new Date(deadline.getTime() + marginMin * 60000);

// actual last activity: last outbox.jsonl line ts, else file mtime
const outbox = path.join(stateDir, 'outbox.jsonl');
let lastActivity = null,
  source = null;
if (fs.existsSync(outbox)) {
  const lines = fs
    .readFileSync(outbox, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean);
  if (lines.length) {
    try {
      lastActivity = new Date(JSON.parse(lines[lines.length - 1]).ts);
      source = 'outbox last-line ts';
    } catch {
      /* malformed last line — fall through to mtime */
    }
  }
  if (!lastActivity) {
    lastActivity = new Date(fs.statSync(outbox).mtime);
    source = 'outbox mtime';
  }
}

const idlePastDeadline =
  lastActivity && lastActivity < deadline && now >= probeAt;
const result = {
  lane: manifest.lane,
  now: now.toISOString(),
  expected_activity_by: deadline.toISOString(),
  margin_minutes: marginMin,
  probe_fires_at: probeAt.toISOString(),
  last_activity: lastActivity ? lastActivity.toISOString() : null,
  last_activity_source: source,
};
if (!idlePastDeadline) {
  result.disposition =
    now < probeAt
      ? 'NOT-YET-PROBED'
      : 'QUIET (activity within deadline — no false alarm)';
} else if (!decisionSeen) {
  result.disposition = 'IDLE-PAST-DEADLINE -> WAKE';
  result.wake_directive = {
    from: 'orchestrator',
    type: 'directive',
    ref: manifest.lane,
    msg: `wake: no lane activity since ${lastActivity.toISOString()}, past expected_activity_by ${deadline.toISOString()} + ${marginMin}m margin — confirm liveness`,
  };
} else {
  result.disposition = 'WAKE UNACKED PAST WINDOW -> ESCALATE needs-operator';
}
console.log(JSON.stringify(result, null, 2));
