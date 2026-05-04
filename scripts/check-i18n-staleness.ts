import * as fs from 'node:fs';
import * as path from 'node:path';

const LOCALES_DIR = path.resolve(__dirname, '../apps/mobile/src/i18n/locales');

// Languages the project commits to shipping. Must mirror
// `TARGET_LANGUAGES` in scripts/translate.ts. Listed explicitly here so
// CI hard-fails if any of these locale files are absent — earlier the
// script discovered locales from the filesystem only, which meant a CI
// checkout that somehow lacked the expected files would silently pass
// with "All translation files are up to date" (vacuously true: no
// targets to check). That made the staleness check effectively
// dependent on what was on the runner's disk rather than on the
// project's stated locale set.
const EXPECTED_TARGET_LANGUAGES = ['nb', 'de', 'es', 'pt', 'pl', 'ja'] as const;

// Dynamically discover target locales from the filesystem so this script
// keeps working as locales are added/removed. Returns every `<code>.json`
// in the locales dir except `en.json` (the source of truth).
function discoverTargetLanguages(): string[] {
  if (!fs.existsSync(LOCALES_DIR)) return [];
  return fs
    .readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'en.json')
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

// Throws (via process.exit(1)) if any of the EXPECTED_TARGET_LANGUAGES
// locale files are missing on disk. Returns the verified discovered set.
//
// Why this guard exists: a CI lane (or contributor) running this script
// against a tree where one or more expected locale JSONs are absent would
// otherwise see "All translation files are up to date" — vacuously true,
// because the missing locales aren't checked against. Hard-failing here
// turns "silently skip" into "fail loudly", which is what the staleness
// check is supposed to do.
export function assertExpectedLocalesPresent(
  discovered: string[],
  expected: readonly string[] = EXPECTED_TARGET_LANGUAGES
): { ok: true } | { ok: false; missing: string[] } {
  const discoveredSet = new Set(discovered);
  const missing = expected.filter((lang) => !discoveredSet.has(lang));
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

type NestedStrings = { [k: string]: string | NestedStrings };

interface StalenessError {
  lang: string;
  type: 'missing_key' | 'orphaned_key' | 'missing_variable' | 'extra_variable';
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
      // Forward: source variables that the translation dropped.
      for (const v of sourceVars) {
        if (!targetVars.includes(v)) {
          errors.push({ lang, type: 'missing_variable', key, variable: v });
        }
      }
      // Reverse: variables the translator hallucinated that don't exist in
      // the source. translate.ts validates this on write, but check:i18n is
      // the runtime contract used by Husky and CI — without the reverse
      // check, a hand-edited or upstream-mangled translation can ship a
      // {{name}} the runtime never interpolates and renders the literal
      // `{{name}}` to users.
      for (const v of targetVars) {
        if (!sourceVars.includes(v)) {
          errors.push({ lang, type: 'extra_variable', key, variable: v });
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

  const targetLanguages = discoverTargetLanguages();

  // Hard-fail if any of the expected target locales are missing from disk.
  // Without this guard the script's "discover from filesystem" approach
  // silently skips missing locales and reports green when there is nothing
  // to check.
  const presence = assertExpectedLocalesPresent(targetLanguages);
  if (!presence.ok) {
    console.error(
      `Missing expected locale files in ${LOCALES_DIR}:\n` +
        presence.missing.map((l) => `  - ${l}.json`).join('\n') +
        '\n\nExpected target languages are pinned in scripts/check-i18n-staleness.ts ' +
        '(must mirror scripts/translate.ts → TARGET_LANGUAGES).\n' +
        'Run `pnpm translate` and commit the result.'
    );
    process.exit(1);
  }

  if (targetLanguages.length === 0) {
    console.log(
      'No target locales present (en-only); staleness check is a no-op.'
    );
    return;
  }

  for (const lang of targetLanguages) {
    const targetPath = path.join(LOCALES_DIR, `${lang}.json`);
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
      case 'extra_variable':
        console.error(
          `  [${err.lang}] Extra variable ${err.variable} not in source: ${err.key}`
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
