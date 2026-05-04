import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationError {
  type:
    | 'missing_key'
    | 'extra_key'
    | 'missing_variable'
    | 'length_exceeded'
    | 'glossary_violation';
  key: string;
  variable?: string;
  detail?: string;
}

interface ValidationWarning {
  type: 'length_warning';
  key: string;
  detail: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

type NestedStrings = { [k: string]: string | NestedStrings };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TARGET_LANGUAGES = ['nb', 'de', 'es', 'pt', 'pl', 'ja'] as const;
const LOCALES_DIR = path.resolve(__dirname, '../apps/mobile/src/i18n/locales');
const GLOSSARY_PATH = path.resolve(__dirname, 'i18n-glossary.json');
const EN_PATH = path.join(LOCALES_DIR, 'en.json');
const MAX_CONCURRENCY = 3;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 4000, 16000];
const LENGTH_WARN_RATIO = 1.5;
const LENGTH_FAIL_RATIO = 2.0;

const TRANSLATE_MODEL = process.env.TRANSLATE_MODEL ?? 'claude-sonnet-4-6';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function unflattenKeys(flat: Record<string, string>): NestedStrings {
  const result: NestedStrings = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let current: NestedStrings = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current) || typeof current[parts[i]] === 'string') {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as NestedStrings;
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

function extractVariables(str: string): string[] {
  const matches = str.match(/\{\{[^}]+\}\}/g);
  return matches ?? [];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Strip diacritics (NFD decomposition + remove combining marks). Lets the
// glossary check accept "sesion" as equivalent to "sesión" and "sessao" as
// equivalent to "sessão", which matters because Portuguese/Spanish plurals
// often shift accents (sessão → sessões).
function stripDiacritics(s: string): string {
  // Combining diacritical marks block: U+0300..U+036F.
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Compute a stem from a glossary term to allow inflected forms to satisfy
// the check. Polish, Czech, Russian etc. heavily inflect nouns by case
// (sesja → sesji/sesję/sesją/sesjach), and Spanish/Portuguese pluralise
// (sesión → sesiones, sessão → sessões). A bare substring check on the
// nominative-singular form rejects all of these as glossary violations.
//
// Stem length: max(4, term.length - 2). Forms shorter than 4 chars are
// matched exactly. The stem is computed on the diacritic-stripped form so
// "sesion" matches "sesión".
function glossaryStem(expected: string): string {
  const normalised = stripDiacritics(expected).toLowerCase();
  if (normalised.length < 4) return normalised;
  return normalised.slice(0, Math.max(4, normalised.length - 2));
}

export function computeChangedKeys(
  current: NestedStrings,
  previous: NestedStrings | null
): string[] {
  const currentFlat = flattenKeys(current);
  if (!previous) return Object.keys(currentFlat);

  const previousFlat = flattenKeys(previous);
  const changed: string[] = [];

  for (const key of Object.keys(currentFlat)) {
    if (!(key in previousFlat) || currentFlat[key] !== previousFlat[key]) {
      changed.push(key);
    }
  }
  for (const key of Object.keys(previousFlat)) {
    if (!(key in currentFlat)) {
      changed.push(key);
    }
  }

  return changed;
}

export function validateTranslation(
  source: NestedStrings,
  translated: NestedStrings,
  lang: string,
  glossary?: Record<string, Record<string, string>>
): ValidationResult {
  const sourceFlat = flattenKeys(source);
  const translatedFlat = flattenKeys(translated);
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Glossary post-validation: when an English source string contains a glossary
  // term as a whole word, the translated string MUST contain the glossary's
  // locked translation for that language.
  const glossaryEntries = glossary
    ? Object.entries(glossary).filter(
        ([term, translations]) => term !== '_meta' && lang in translations
      )
    : [];

  for (const [term, translations] of glossaryEntries) {
    const expected = translations[lang];
    const stem = glossaryStem(expected);
    const sourceWordRe = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
    for (const key of Object.keys(sourceFlat)) {
      if (!sourceWordRe.test(sourceFlat[key])) continue;
      if (!(key in translatedFlat)) continue;
      // Stem match on diacritic-stripped target. Substring (not word-boundary)
      // because Japanese and other non-space scripts have no reliable \b. The
      // stem accepts inflected forms (Polish sesja → sesji/sesję/sesją;
      // Spanish sesión → sesiones; Portuguese sessão → sessões). False
      // positives (validator passes a translation that lacks the term but
      // happens to share a 4-letter prefix) are preferred to false negatives,
      // which block correct translations.
      const targetNormalised = stripDiacritics(
        translatedFlat[key]
      ).toLowerCase();
      if (!targetNormalised.includes(stem)) {
        errors.push({
          type: 'glossary_violation',
          key,
          detail: `source contains "${term}" but translation is missing locked term "${expected}" (or any stem-matching inflection)`,
        });
      }
    }
  }

  for (const key of Object.keys(sourceFlat)) {
    if (!(key in translatedFlat)) {
      errors.push({ type: 'missing_key', key });
      continue;
    }

    const sourceVars = extractVariables(sourceFlat[key]);
    const translatedVars = extractVariables(translatedFlat[key]);
    for (const v of sourceVars) {
      if (!translatedVars.includes(v)) {
        errors.push({ type: 'missing_variable', key, variable: v });
      }
    }

    const sourceLen = sourceFlat[key].length;
    const translatedLen = translatedFlat[key].length;
    // Sub-6-char source strings ("OK", "Done", "Save", "Edit") get false-flagged
    // by ratio caps even with the absolute floor below — "OK" → "D'accord"
    // (2 → 8 chars = 400%) reads as a fail despite being correct French.
    // Skip the length check entirely for tiny source strings; the absolute
    // floor still guards 6–10 char strings where ratios start to be useful.
    if (sourceLen > 0 && sourceLen >= 6) {
      // For 6–10 char source strings (button labels like "Cancel", "Submit"),
      // ratio-based caps still misfire — Norwegian "Hopp over" (9 chars) for
      // English "Skip" (4 chars) would read as 225%. Use an absolute floor
      // (sourceLen + 12) for sources <= 10 chars.
      const absoluteFloor = sourceLen <= 10 ? sourceLen + 12 : 0;
      const ratio = translatedLen / sourceLen;
      const overFail =
        ratio > LENGTH_FAIL_RATIO && translatedLen > absoluteFloor;
      const overWarn =
        ratio > LENGTH_WARN_RATIO && translatedLen > absoluteFloor;
      if (overFail) {
        errors.push({
          type: 'length_exceeded',
          key,
          detail: `${translatedLen} chars is ${Math.round(
            ratio * 100
          )}% of source (${sourceLen}). Max: ${LENGTH_FAIL_RATIO * 100}%`,
        });
      } else if (overWarn) {
        warnings.push({
          type: 'length_warning',
          key,
          detail: `${translatedLen} chars is ${Math.round(
            ratio * 100
          )}% of source (${sourceLen})`,
        });
      }
    }
  }

  for (const key of Object.keys(translatedFlat)) {
    if (!(key in sourceFlat)) {
      errors.push({ type: 'extra_key', key });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// LLM Translation
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  lang: string,
  glossary: Record<string, Record<string, string>>
): string {
  const glossaryEntries = Object.entries(glossary)
    .filter(([_, translations]) => lang in translations)
    .map(([term, translations]) => `- "${term}" → "${translations[lang]}"`)
    .join('\n');

  return `You are a professional translator for a mobile educational app for ages 11+.

RULES:
- Translate JSON values only, never modify keys
- Preserve all {{interpolation}} markers exactly as they appear
- Use age-appropriate language (11+ audience)
- Return ONLY valid JSON — no markdown fences, no commentary
- Maintain the exact JSON structure (nested objects with same keys)
- Preserve plural-suffixed keys exactly (e.g. _one, _other, _zero) — translate the value but keep both keys

LENGTH BUDGET (HARD CONSTRAINTS — translations breaking these will be rejected):
- Source ≤ 12 chars (button labels like "Try Again", "Tap to retry", "Go home"):
  target MUST be ≤ source_length + 12 chars. If the natural translation is too long, choose a SHORTER imperative form. Example: "Tap to retry" (12) → German "Erneut tippen" (13), NOT "Tippen Sie zum erneuten Versuchen" (33).
- Source 13–30 chars (titles, short messages): target ≤ 1.7× source length.
- Source > 30 chars: target ≤ 1.5× source length.
- For all UI labels: prefer the shortest natural phrasing. Drop politeness particles ("bitte", "por favor"), articles, and pronouns when the meaning is clear.

GLOSSARY — use these translations for domain-specific terms (inflected forms are accepted):
${glossaryEntries || '(no glossary entries for this language)'}

Target language: ${lang}`;
}

async function translateWithRetry(
  client: Anthropic,
  systemPrompt: string,
  sourceJson: string,
  lang: string
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: TRANSLATE_MODEL,
        max_tokens: 8192,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Translate the following English JSON to ${lang}. Return only the translated JSON:\n\n${sourceJson}`,
          },
        ],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      JSON.parse(text);
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const delay =
          RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.warn(
          `[${lang}] Attempt ${attempt + 1} failed: ${
            lastError.message
          }. Retrying in ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw new Error(
    `[${lang}] All ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
  lang?: string;
  full?: boolean;
  dryRun?: boolean;
  review?: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang' && args[i + 1]) {
      opts.lang = args[++i];
    } else if (args[i] === '--full') {
      opts.full = true;
    } else if (args[i] === '--dry-run') {
      opts.dryRun = true;
    } else if (args[i] === '--review') {
      opts.review = true;
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const languages = opts.lang
    ? [opts.lang].filter((l) =>
        (TARGET_LANGUAGES as readonly string[]).includes(l)
      )
    : [...TARGET_LANGUAGES];

  if (languages.length === 0) {
    console.error(
      `Unknown language: ${opts.lang}. Supported: ${TARGET_LANGUAGES.join(
        ', '
      )}`
    );
    process.exit(1);
  }

  const source: NestedStrings = JSON.parse(fs.readFileSync(EN_PATH, 'utf-8'));
  const glossary = JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf-8'));
  delete glossary._meta;

  const client = new Anthropic();
  const failed: string[] = [];
  const succeeded: string[] = [];

  function createLimiter(maxConcurrency: number) {
    let active = 0;
    const queue: Array<() => void> = [];
    const acquire = (): Promise<void> =>
      new Promise((resolve) => {
        const tryRun = () => {
          if (active < maxConcurrency) {
            active++;
            resolve();
          } else {
            queue.push(tryRun);
          }
        };
        tryRun();
      });
    const release = () => {
      active--;
      const next = queue.shift();
      if (next) next();
    };
    return { acquire, release };
  }
  const limiter = createLimiter(MAX_CONCURRENCY);

  const tasks = languages.map(async (lang) => {
    await limiter.acquire();
    try {
      const targetPath = path.join(LOCALES_DIR, `${lang}.json`);
      const previousExists = fs.existsSync(targetPath);
      const previous: NestedStrings | null = previousExists
        ? JSON.parse(fs.readFileSync(targetPath, 'utf-8'))
        : null;

      let toTranslate: NestedStrings;
      let previousFlat: Record<string, string> | null = null;

      if (opts.full || !previous) {
        toTranslate = source;
        console.log(
          `[${lang}] Full translation (${
            Object.keys(flattenKeys(source)).length
          } keys)`
        );
      } else {
        const changedKeys = computeChangedKeys(source, previous);
        if (changedKeys.length === 0) {
          console.log(`[${lang}] No changes detected, skipping`);
          succeeded.push(lang);
          return;
        }
        const sourceFlat = flattenKeys(source);
        const changedFlat: Record<string, string> = {};
        for (const key of changedKeys) {
          if (key in sourceFlat) {
            changedFlat[key] = sourceFlat[key];
          }
        }
        toTranslate = unflattenKeys(changedFlat);
        previousFlat = flattenKeys(previous);
        console.log(`[${lang}] Diff-mode: ${changedKeys.length} changed keys`);
      }

      const systemPrompt = buildSystemPrompt(lang, glossary);
      const sourceJson = JSON.stringify(toTranslate, null, 2);

      if (opts.dryRun) {
        console.log(
          `[${lang}] Dry run — would translate ${
            Object.keys(flattenKeys(toTranslate)).length
          } keys`
        );
        succeeded.push(lang);
        return;
      }

      const translatedJson = await translateWithRetry(
        client,
        systemPrompt,
        sourceJson,
        lang
      );
      let translated: NestedStrings = JSON.parse(translatedJson);

      if (previousFlat) {
        const translatedFlat = flattenKeys(translated);
        const merged = { ...previousFlat };
        for (const [key, value] of Object.entries(translatedFlat)) {
          merged[key] = value;
        }
        const sourceFlat = flattenKeys(source);
        for (const key of Object.keys(merged)) {
          if (!(key in sourceFlat)) {
            delete merged[key];
          }
        }
        translated = unflattenKeys(merged);
      }

      const validation = validateTranslation(
        source,
        translated,
        lang,
        glossary
      );

      if (validation.warnings.length > 0) {
        for (const w of validation.warnings) {
          console.warn(`[${lang}] WARNING: ${w.key} — ${w.detail}`);
        }
      }

      if (!validation.valid) {
        console.error(`[${lang}] Validation FAILED:`);
        for (const e of validation.errors) {
          console.error(
            `  ${e.type}: ${e.key}${e.variable ? ` (${e.variable})` : ''}${
              e.detail ? ` — ${e.detail}` : ''
            }`
          );
        }
        console.error(`[${lang}] Skipping — previous file preserved`);
        failed.push(lang);
        return;
      }

      if (opts.review) {
        console.log(`\n=== ${lang} Review ===`);
        const prevFlat = previous ? flattenKeys(previous) : {};
        const newFlat = flattenKeys(translated);
        for (const key of Object.keys(newFlat)) {
          if (prevFlat[key] !== newFlat[key]) {
            console.log(`  ${key}:`);
            if (prevFlat[key]) console.log(`    - ${prevFlat[key]}`);
            console.log(`    + ${newFlat[key]}`);
          }
        }
      }

      // Atomic write: render to a sibling .tmp file then rename. A crash or
      // process kill mid-`writeFileSync` would otherwise leave a half-written
      // JSON file that breaks every subsequent run (and would be silently
      // committed if the killed run was inside a husky hook).
      const tmpPath = `${targetPath}.tmp`;
      fs.writeFileSync(
        tmpPath,
        JSON.stringify(translated, null, 2) + '\n',
        'utf-8'
      );
      fs.renameSync(tmpPath, targetPath);
      console.log(`[${lang}] Written to ${targetPath}`);
      succeeded.push(lang);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${lang}] FAILED: ${msg}`);
      failed.push(lang);
    } finally {
      limiter.release();
    }
  });

  await Promise.all(tasks);

  console.log(
    `\nResults: ${succeeded.length} succeeded, ${failed.length} failed`
  );
  if (failed.length > 0) {
    console.error(`Failed languages: ${failed.join(', ')}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
