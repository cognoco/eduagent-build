import fs from 'node:fs';
import path from 'node:path';
import { buildBaselineForKeys } from './translate-gemini';

const REAL_I18N_DIR = path.resolve(__dirname, '../apps/mobile/src/i18n');
const LOCALES_DIR = path.join(REAL_I18N_DIR, 'locales');
const BASELINE_PATH = path.join(REAL_I18N_DIR, 'source-baseline.json');
const LANGS = ['nb', 'de', 'es', 'pt', 'pl', 'ja'] as const;

type NestedStrings = { [k: string]: string | NestedStrings };

function flattenKeys(
  value: NestedStrings,
  prefix = '',
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flattenKeys(v, key));
  }
  return out;
}

function readJson(p: string): NestedStrings {
  return JSON.parse(fs.readFileSync(p, 'utf-8')) as NestedStrings;
}

const source = readJson(path.join(LOCALES_DIR, 'en.json'));
const baseline: Record<string, Record<string, string>> = {};

for (const lang of [...LANGS].sort()) {
  const target = readJson(path.join(LOCALES_DIR, `${lang}.json`));
  const keys = Object.keys(flattenKeys(target));
  baseline[lang] = buildBaselineForKeys(source, keys);
}

fs.writeFileSync(
  BASELINE_PATH,
  JSON.stringify(baseline, null, 2) + '\n',
  'utf-8',
);
console.log(`Wrote ${BASELINE_PATH}`);
for (const lang of LANGS) {
  console.log(`  ${lang}: ${Object.keys(baseline[lang]).length} keys`);
}
