import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  migrationTag,
  parseNameStatus,
  resolveRange,
} from './check-migration-immutability';

const REPO_ROOT = path.resolve(__dirname, '..');

export interface EnumAddValueViolation {
  path: string;
  statement: string;
}

export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, '');
}

export function addedNumberedMigrationPaths(rawNameStatus: string): string[] {
  return parseNameStatus(rawNameStatus)
    .filter(
      (change) =>
        change.status === 'A' && migrationTag(change.oldPath) !== null,
    )
    .map((change) => change.oldPath);
}

export function findEnumAddValueViolations(
  filePath: string,
  sql: string,
): EnumAddValueViolation[] {
  return stripSqlComments(sql)
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) =>
      /\balter\s+type\b[\s\S]*?\badd\s+value\b(?!\s+if\s+not\s+exists\b)/i.test(
        statement,
      ),
    )
    .map((statement) => ({ path: filePath, statement }));
}

function runCli(): void {
  const diff = spawnSync(
    'git',
    [
      'diff',
      ...resolveRange(),
      '--name-status',
      '--diff-filter=A',
      '--',
      'apps/api/drizzle',
    ],
    { encoding: 'utf8', cwd: REPO_ROOT },
  );

  if (diff.status !== 0) {
    console.error(
      'Migration enum idempotency guard could not read the git diff.',
    );
    console.error(diff.stderr.trim());
    process.exit(1);
  }

  const violations = addedNumberedMigrationPaths(diff.stdout).flatMap(
    (filePath) =>
      findEnumAddValueViolations(
        filePath,
        fs.readFileSync(path.join(REPO_ROOT, filePath), 'utf8'),
      ),
  );

  if (violations.length === 0) {
    process.exit(0);
  }

  console.error('');
  console.error(
    'Migration enum idempotency: ALTER TYPE ... ADD VALUE must include IF NOT EXISTS.',
  );
  console.error('');
  console.error('Offending statements in newly added migrations:');
  for (const violation of violations) {
    console.error(`  ${violation.path}: ${violation.statement}`);
  }
  console.error('');
  console.error(
    'Fix: use ALTER TYPE ... ADD VALUE IF NOT EXISTS so migration replay is safe.',
  );
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] &&
  /check-migration-enum-idempotency(\.ts)?$/.test(
    process.argv[1].replace(/\\/g, '/'),
  );
if (invokedDirectly) {
  runCli();
}
