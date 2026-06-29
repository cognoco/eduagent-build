// @inngest-admin annotation completeness guard — WI-1075.
//
// Every non-test Inngest function file under apps/api/src/inngest/functions/
// must begin with an access-classification comment that admin operators use to
// safely re-run or cancel functions without corrupting profile-owned data.
//
// Format (first line of file):
//   // @inngest-admin: <scope>[ (optional description)]
//
// Valid scopes (see AGENTS.md → "Non-Negotiable Engineering Rules"):
//   parent-chain  — DB queries scoped by profileId via a parent-chain join
//   event-profile — profileId (or equivalent) comes from the triggering event
//   cross-profile — admin/cron/system; no single profile scope
//   no-db         — pure notification or observe; no DB access
//
// CLI usage:
//   pnpm exec tsx scripts/check-inngest-admin.ts
// Exit codes: 0 clean, 1 one or more violations.

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'apps/api/src/inngest/functions');

const VALID_SCOPES = new Set([
  'parent-chain',
  'event-profile',
  'cross-profile',
  'no-db',
]);

const ANNOTATION_RE = /^\/\/ @inngest-admin:\s+(\S+)/;

function getFiles(): string[] {
  const entries = fs.readdirSync(FUNCTIONS_DIR);
  return entries
    .filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.startsWith('_'), // underscore-prefixed files are utility helpers, not functions
    )
    .map((f) => path.join(FUNCTIONS_DIR, f));
}

type Violation = { file: string; reason: string };

function check(): Violation[] {
  const files = getFiles();
  const violations: Violation[] = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const firstLine = content.split('\n')[0] ?? '';
    const match = ANNOTATION_RE.exec(firstLine);

    if (!match) {
      violations.push({
        file: path.relative(REPO_ROOT, filePath),
        reason: 'missing @inngest-admin annotation on first line',
      });
      continue;
    }

    const scope = match[1];
    if (!VALID_SCOPES.has(scope)) {
      violations.push({
        file: path.relative(REPO_ROOT, filePath),
        reason: `invalid scope "${scope}" — must be one of: ${[...VALID_SCOPES].join(', ')}`,
      });
    }
  }

  return violations;
}

const violations = check();

if (violations.length > 0) {
  console.error('');
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.reason}`);
  }
  console.error('');
  console.error(
    `✗ ${violations.length} Inngest function(s) lack a valid @inngest-admin annotation.`,
  );
  console.error(
    '  Add "// @inngest-admin: <scope>" as the first line of each file.',
  );
  console.error(
    '  Valid scopes: parent-chain | event-profile | cross-profile | no-db',
  );
  console.error('  See AGENTS.md → Non-Negotiable Engineering Rules.');
  process.exit(1);
}

console.log(
  `✓ All ${getFiles().length} Inngest functions have valid @inngest-admin annotations`,
);
