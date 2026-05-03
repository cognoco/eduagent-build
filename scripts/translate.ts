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
    const expectedLower = expected.toLowerCase();
    const sourceWordRe = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
    for (const key of Object.keys(sourceFlat)) {
      if (!sourceWordRe.test(sourceFlat[key])) continue;
      if (!(key in translatedFlat)) continue;
      // Case-insensitive containment: handles sentence-initial capitalization
      // and inflected forms via substring. Word-boundary matching is NOT used
      // on the target — Japanese and other non-space-delimited scripts have
      // no reliable \b semantics.
      if (!translatedFlat[key].toLowerCase().includes(expectedLower)) {
        errors.push({
          type: 'glossary_violation',
          key,
          detail: `source contains "${term}" but translation is missing locked term "${expected}"`,
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
    if (sourceLen > 0) {
      const ratio = translatedLen / sourceLen;
      if (ratio > LENGTH_FAIL_RATIO) {
        errors.push({
          type: 'length_exceeded',
          key,
          detail: `${translatedLen} chars is ${Math.round(
            ratio * 100
          )}% of source (${sourceLen}). Max: ${LENGTH_FAIL_RATIO * 100}%`,
        });
      } else if (ratio > LENGTH_WARN_RATIO) {
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
- Keep translations concise — mobile UI has limited space. Aim for ≤130% of the English character length
- Use age-appropriate language (11+ audience)
- Return ONLY valid JSON — no markdown fences, no commentary
- Maintain the exact JSON structure (nested objects with same keys)

GLOSSARY — use these translations for domain-specific terms:
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

      fs.writeFileSync(
        targetPath,
        JSON.stringify(translated, null, 2) + '\n',
        'utf-8'
      );
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
