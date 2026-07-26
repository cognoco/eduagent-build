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

function maskSqlNonCode(sql: string): string {
  const masked = sql.split('');
  const blank = (index: number): void => {
    if (masked[index] !== '\n' && masked[index] !== '\r') masked[index] = ' ';
  };

  let index = 0;
  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      while (index < sql.length && sql[index] !== '\n') blank(index++);
      continue;
    }

    if (sql.startsWith('/*', index)) {
      let depth = 0;
      while (index < sql.length) {
        if (sql.startsWith('/*', index)) {
          depth += 1;
          blank(index++);
          blank(index++);
        } else if (sql.startsWith('*/', index)) {
          depth -= 1;
          blank(index++);
          blank(index++);
          if (depth === 0) break;
        } else {
          blank(index++);
        }
      }
      continue;
    }

    if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index];
      blank(index++);
      while (index < sql.length) {
        if (sql[index] === '\\' && index + 1 < sql.length) {
          blank(index++);
          blank(index++);
        } else if (sql[index] === quote) {
          blank(index++);
          if (sql[index] === quote) {
            blank(index++);
          } else {
            break;
          }
        } else {
          blank(index++);
        }
      }
      continue;
    }

    if (sql[index] === '$') {
      const delimiter = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(
        sql.slice(index),
      )?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, index + delimiter.length);
        const quotedEnd = end === -1 ? sql.length : end + delimiter.length;
        while (index < quotedEnd) blank(index++);
        continue;
      }
    }

    index += 1;
  }

  return masked.join('');
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
  const masked = maskSqlNonCode(sql);
  const violations: EnumAddValueViolation[] = [];
  let statementStart = 0;

  for (let index = 0; index <= masked.length; index += 1) {
    if (index !== masked.length && masked[index] !== ';') continue;

    const code = masked.slice(statementStart, index);
    if (
      /\balter\s+type\b[\s\S]*?\badd\s+value\b(?!\s+if\s+not\s+exists\b)/i.test(
        code,
      )
    ) {
      violations.push({
        path: filePath,
        statement: sql.slice(statementStart, index).trim(),
      });
    }
    statementStart = index + 1;
  }

  return violations;
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
