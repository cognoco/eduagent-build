import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeChangedKeys, validateTranslation } from './translate';

type NestedStrings = { [k: string]: string | NestedStrings };

const TARGET_LANGUAGES = ['nb', 'de', 'es', 'pt', 'pl', 'ja'] as const;
const LOCALES_DIR = path.resolve(__dirname, '../apps/mobile/src/i18n/locales');
const GLOSSARY_PATH = path.resolve(__dirname, 'i18n-glossary.json');
const EN_PATH = path.join(LOCALES_DIR, 'en.json');
const MAX_CONCURRENCY = 3;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 4000, 16000];

const GEMINI_MODEL = process.env.TRANSLATE_GEMINI_MODEL ?? 'gemini-2.5-pro';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function flattenKeys(obj: NestedStrings, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') result[fullKey] = value;
    else Object.assign(result, flattenKeys(value, fullKey));
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

function buildSystemPrompt(
  lang: string,
  glossary: Record<string, Record<string, string>>
): string {
  const glossaryEntries = Object.entries(glossary)
    .filter(([term, translations]) => term !== '_meta' && lang in translations)
    .map(([term, translations]) => `- "${term}" → "${translations[lang]}"`)
    .join('\n');

  return `You are a professional translator for a mobile educational app for ages 11+.

RULES:
- Translate JSON values only, never modify keys
- Preserve all {{interpolation}} markers exactly as they appear
- Use age-appropriate language (11+ audience)
- Return ONLY valid JSON — no markdown fences, no commentary, no preamble
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

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

async function translateWithRetry(
  apiKey: string,
  systemPrompt: string,
  sourceJson: string,
  lang: string
): Promise<string> {
  let lastError: Error | null = null;
  // SECURITY NOTE: Gemini's documented auth pattern is `?key=<API_KEY>` in the
  // URL — there is no header-based equivalent for generateContent. This means
  // the key WILL surface in any layer that logs URLs (shell history of the
  // operator running this script, HTTP-level proxy/ALB access logs, network
  // traces, error reports that include request URL, etc.). To contain blast
  // radius:
  //   1. Use a dedicated GEMINI_API_KEY scoped to translation only — no
  //      production data, no other Google Cloud APIs.
  //   2. Rotate the key after each translation run, or set a short-lived
  //      service-account binding.
  //   3. Never run this script against a CI environment that ships request
  //      logs to a shared sink.
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Translate the following English JSON to ${lang}. Return only the translated JSON object, no markdown:\n\n${sourceJson}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 65536,
          responseMimeType: 'application/json',
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 500)}`);
      }

      const data = (await res.json()) as GeminiResponse;
      if (data.error) throw new Error(`Gemini error: ${data.error.message}`);
      const block = data.promptFeedback?.blockReason;
      if (block) throw new Error(`Gemini blocked prompt: ${block}`);
      const cand = data.candidates?.[0];
      if (!cand) throw new Error('Gemini returned no candidates');
      if (cand.finishReason && cand.finishReason !== 'STOP') {
        throw new Error(`Gemini finishReason=${cand.finishReason}`);
      }
      const text = cand.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new Error('Gemini returned empty text');

      const cleaned = stripFence(text);
      JSON.parse(cleaned);
      return cleaned;
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

interface CliOptions {
  lang?: string;
  full?: boolean;
  dryRun?: boolean;
  review?: boolean;
  writeAnyway?: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang' && args[i + 1]) opts.lang = args[++i];
    else if (args[i] === '--full') opts.full = true;
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--review') opts.review = true;
    else if (args[i] === '--write-anyway') opts.writeAnyway = true;
  }
  return opts;
}

async function main(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set in environment');
    process.exit(1);
  }

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
          if (key in sourceFlat) changedFlat[key] = sourceFlat[key];
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
          } keys (model=${GEMINI_MODEL})`
        );
        succeeded.push(lang);
        return;
      }

      const translatedJson = await translateWithRetry(
        apiKey,
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
          if (!(key in sourceFlat)) delete merged[key];
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
        // --write-anyway downgrades length_exceeded to a non-blocking warning
        // (writes the file, but logs the offending keys so a human can patch
        // them). Other error types (missing_key, missing_variable, extra_key,
        // glossary_violation) ALWAYS hard-skip — those represent contract
        // breaks, not UX-quality issues that a human can fix in 5 minutes.
        const blocking = validation.errors.filter(
          (e) => !(opts.writeAnyway && e.type === 'length_exceeded')
        );
        const downgraded = validation.errors.filter(
          (e) => opts.writeAnyway && e.type === 'length_exceeded'
        );
        if (blocking.length > 0) {
          console.error(`[${lang}] Validation FAILED:`);
          for (const e of blocking) {
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
        if (downgraded.length > 0) {
          console.warn(
            `[${lang}] Writing despite ${downgraded.length} length issue(s) — patch these manually:`
          );
          for (const e of downgraded) {
            console.warn(`  NEEDS_PATCH ${e.key} — ${e.detail}`);
          }
        }
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
