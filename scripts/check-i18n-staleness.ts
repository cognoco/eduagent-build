import * as fs from 'node:fs';
import * as path from 'node:path';

const TARGET_LANGUAGES = ['nb', 'de', 'es', 'pt', 'pl', 'ja'] as const;
const LOCALES_DIR = path.resolve(__dirname, '../apps/mobile/src/i18n/locales');

type NestedStrings = { [k: string]: string | NestedStrings };

interface StalenessError {
  lang: string;
  type: 'missing_key' | 'orphaned_key' | 'missing_variable';
  key: string;
  variable?: string;
}

export interface StalenessResult {
  pass: boolean;
  errors: StalenessError[];
}

function flattenKeys(obj: NestedStrings, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else {
      Object.assign(result, flattenKeys(value, fullKey));
    }
  }
  return result;
}

function extractVariables(str: string): string[] {
  return str.match(/\{\{[^}]+\}\}/g) ?? [];
}

export function checkStaleness(
  source: NestedStrings,
  targets: Record<string, NestedStrings>
): StalenessResult {
  const sourceFlat = flattenKeys(source);
  const errors: StalenessError[] = [];

  for (const [lang, target] of Object.entries(targets)) {
    const targetFlat = flattenKeys(target);

    for (const key of Object.keys(sourceFlat)) {
      if (!(key in targetFlat)) {
        errors.push({ lang, type: 'missing_key', key });
        continue;
      }

      const sourceVars = extractVariables(sourceFlat[key]);
      const targetVars = extractVariables(targetFlat[key]);
      for (const v of sourceVars) {
        if (!targetVars.includes(v)) {
          errors.push({ lang, type: 'missing_variable', key, variable: v });
        }
      }
    }

    for (const key of Object.keys(targetFlat)) {
      if (!(key in sourceFlat)) {
        errors.push({ lang, type: 'orphaned_key', key });
      }
    }
  }

  return { pass: errors.length === 0, errors };
}

function main(): void {
  const enPath = path.join(LOCALES_DIR, 'en.json');
  if (!fs.existsSync(enPath)) {
    console.error(`Source file not found: ${enPath}`);
    process.exit(1);
  }

  const source: NestedStrings = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
  const targets: Record<string, NestedStrings> = {};

  for (const lang of TARGET_LANGUAGES) {
    const targetPath = path.join(LOCALES_DIR, `${lang}.json`);
    if (!fs.existsSync(targetPath)) {
      console.error(`Missing translation file: ${targetPath}`);
      process.exit(1);
    }
    targets[lang] = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
  }

  const result = checkStaleness(source, targets);

  if (result.pass) {
    console.log('All translation files are up to date');
    return;
  }

  console.error('Translation files are stale:\n');
  for (const err of result.errors) {
    switch (err.type) {
      case 'missing_key':
        console.error(`  [${err.lang}] Missing key: ${err.key}`);
        break;
      case 'orphaned_key':
        console.error(`  [${err.lang}] Orphaned key: ${err.key}`);
        break;
      case 'missing_variable':
        console.error(
          `  [${err.lang}] Missing variable ${err.variable} in: ${err.key}`
        );
        break;
    }
  }

  console.error('\nRun `pnpm translate` and commit the result.');
  process.exit(1);
}

if (require.main === module) {
  main();
}
