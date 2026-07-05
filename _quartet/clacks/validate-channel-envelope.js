#!/usr/bin/env node
// WI-1230 Clacks channel envelope validator — checks a lane's outbox.jsonl / inbox.jsonl
// against the split schema in _quartet/library/clacks-channel.md so a hand-authored line
// can't silently drift from the shape the orchestrator/shepherd depend on. Read-only:
// never rewrites the channel file.
//
// usage: node validate-channel-envelope.js <outbox.jsonl|inbox.jsonl>
// exit 0 = every line valid, 1 = at least one violation (details on stderr), 2 = usage error
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error(
    'usage: validate-channel-envelope.js <outbox.jsonl|inbox.jsonl>',
  );
  process.exit(2);
}

const name = path.basename(file);
const direction = /outbox/.test(name)
  ? 'outbox'
  : /inbox/.test(name)
    ? 'inbox'
    : null;
if (!direction) {
  console.error(
    `cannot infer direction from filename "${name}" — expected outbox.jsonl or inbox.jsonl`,
  );
  process.exit(2);
}

const OUTBOX_FIELDS = ['id', 'ts', 'lane', 'wi', 'level', 'ref', 'msg'];
const OUTBOX_LEVELS = [
  'needs-operator',
  'needs-orchestrator',
  'blocked',
  'decision',
];
const INBOX_FIELDS = ['id', 'ts', 'from', 'type', 'ref', 'msg'];
const INBOX_TYPES = ['ruling', 'answer', 'directive', 'ack'];

function validateLine(obj, lineNo, errors) {
  const ownFields = direction === 'outbox' ? OUTBOX_FIELDS : INBOX_FIELDS;
  for (const f of ownFields) {
    if (!(f in obj)) errors.push(`line ${lineNo}: missing field "${f}"`);
  }
  if (
    direction === 'outbox' &&
    'level' in obj &&
    !OUTBOX_LEVELS.includes(obj.level)
  ) {
    errors.push(
      `line ${lineNo}: level "${obj.level}" not one of ${OUTBOX_LEVELS.join(', ')}`,
    );
  }
  if (
    direction === 'inbox' &&
    'type' in obj &&
    !INBOX_TYPES.includes(obj.type)
  ) {
    errors.push(
      `line ${lineNo}: type "${obj.type}" not one of ${INBOX_TYPES.join(', ')}`,
    );
  }
  if (direction === 'inbox' && 'from' in obj && obj.from !== 'orchestrator') {
    errors.push(
      `line ${lineNo}: from "${obj.from}" — inbox is orchestrator-authored only`,
    );
  }
  // Cross-schema drift: a field that belongs to the *other* direction's envelope only
  // (e.g. an inbox line carrying outbox-only "lane"/"level") means the two schemas leaked
  // into each other, which is the failure mode the split envelope exists to prevent.
  const foreignFields =
    direction === 'outbox'
      ? INBOX_FIELDS.filter((f) => !OUTBOX_FIELDS.includes(f))
      : OUTBOX_FIELDS.filter((f) => !INBOX_FIELDS.includes(f));
  for (const f of foreignFields) {
    if (f in obj) {
      const other = direction === 'outbox' ? 'inbox' : 'outbox';
      errors.push(
        `line ${lineNo}: field "${f}" belongs to the ${other} envelope — schema drift`,
      );
    }
  }
}

const errors = [];
const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const lines = raw.split('\n');
let validCount = 0;
lines.forEach((line, i) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let obj;
  try {
    obj = JSON.parse(trimmed);
  } catch (e) {
    errors.push(`line ${i + 1}: invalid JSON — ${e.message}`);
    return;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    const kind =
      obj === null ? 'null' : Array.isArray(obj) ? 'array' : typeof obj;
    errors.push(`line ${i + 1}: expected a JSON object, got ${kind}`);
    return;
  }
  validateLine(obj, i + 1, errors);
  validCount++;
});

if (errors.length) {
  console.error(`${direction} envelope violations in ${file}:`);
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log(`${direction} envelope OK — ${validCount} line(s) checked`);
process.exit(0);
