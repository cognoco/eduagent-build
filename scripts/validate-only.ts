import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateTranslation } from './translate';

const LOCALES = path.resolve(__dirname, '../apps/mobile/src/i18n/locales');
const GLOSSARY = path.resolve(__dirname, 'i18n-glossary.json');
const en = JSON.parse(fs.readFileSync(path.join(LOCALES, 'en.json'), 'utf-8'));
const glossary = JSON.parse(fs.readFileSync(GLOSSARY, 'utf-8'));
delete glossary._meta;

let allClean = true;
for (const lang of ['de', 'es', 'pt', 'pl', 'nb', 'ja']) {
  const tgt = JSON.parse(
    fs.readFileSync(path.join(LOCALES, `${lang}.json`), 'utf-8')
  );
  const r = validateTranslation(en, tgt, lang, glossary);
  console.log(
    `[${lang}] valid=${r.valid} errors=${r.errors.length} warnings=${r.warnings.length}`
  );
  if (!r.valid) {
    allClean = false;
    for (const e of r.errors)
      console.log(`  ${e.type}: ${e.key} — ${e.detail ?? ''}`);
  }
}
process.exit(allClean ? 0 : 1);
