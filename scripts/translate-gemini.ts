import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateTranslation, type ValidationResult } from './translate';

type NestedStrings = { [k: string]: string | NestedStrings };
type SourceBaseline = Record<string, string>;
type SourceBaselineFile = Record<string, SourceBaseline>;
type CompactSourceBaselineLocale =
  | 'allSourceKeys'
  | string[]
  | {
      keys: 'allSourceKeys' | string[];
      sourceHashes?: SourceBaseline;
    };
interface CompactSourceBaselineFile {
  version: 1;
  sourceHashes: SourceBaseline;
  locales: Record<string, CompactSourceBaselineLocale>;
}

const TARGET_LANGUAGES = ['nb', 'de', 'es', 'pt', 'pl', 'ja'] as const;
const LOCALES_DIR = path.resolve(__dirname, '../apps/mobile/src/i18n/locales');
const GLOSSARY_PATH = path.resolve(__dirname, 'i18n-glossary.json');
const EN_PATH = path.join(LOCALES_DIR, 'en.json');
const SOURCE_BASELINE_PATH = path.resolve(
  __dirname,
  '../apps/mobile/src/i18n/source-baseline.json',
);
const MAX_CONCURRENCY = 3;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 4000, 16000];
const DEFAULT_TRANSLATION_KEYS_PER_REQUEST = 80;

const GEMINI_MODEL = process.env.TRANSLATE_GEMINI_MODEL ?? 'gemini-2.5-pro';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TRANSLATION_KEYS_PER_REQUEST = parsePositiveInteger(
  process.env.TRANSLATE_GEMINI_KEY_BATCH_SIZE,
  DEFAULT_TRANSLATION_KEYS_PER_REQUEST,
);

export function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value || !/^\d+$/.test(value.trim())) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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

function pickSourceKeys(
  source: NestedStrings,
  keys: readonly string[],
): NestedStrings {
  const sourceFlat = flattenKeys(source);
  const picked: Record<string, string> = {};
  for (const key of keys) {
    if (key in sourceFlat) picked[key] = sourceFlat[key];
  }
  return unflattenKeys(picked);
}

export function chunkSourceForTranslation(
  source: NestedStrings,
  maxKeysPerChunk = MAX_TRANSLATION_KEYS_PER_REQUEST,
): NestedStrings[] {
  if (maxKeysPerChunk <= 0) {
    throw new Error('maxKeysPerChunk must be positive');
  }

  const sourceFlat = flattenKeys(source);
  const keys = Object.keys(sourceFlat);
  const chunks: NestedStrings[] = [];
  for (let i = 0; i < keys.length; i += maxKeysPerChunk) {
    chunks.push(pickSourceKeys(source, keys.slice(i, i + maxKeysPerChunk)));
  }
  return chunks;
}

export function filterTranslatedFlatToSourceKeys(
  translatedFlat: Record<string, string>,
  sourceFlat: Record<string, string>,
): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const key of Object.keys(sourceFlat)) {
    if (key in translatedFlat) {
      filtered[key] = translatedFlat[key];
    }
  }
  return filtered;
}

export function filterTranslatedToSourceKeys(
  translated: NestedStrings,
  source: NestedStrings,
): NestedStrings {
  return unflattenKeys(
    filterTranslatedFlatToSourceKeys(
      flattenKeys(translated),
      flattenKeys(source),
    ),
  );
}

export function hashSourceString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function normalizeSourceBaseline(input: unknown): SourceBaseline {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const baseline: SourceBaseline = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') baseline[key] = value;
  }
  return baseline;
}

export function expandSourceBaselineFile(input: unknown): SourceBaselineFile {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const compact = input as {
    sourceHashes?: unknown;
    locales?: unknown;
  };
  const sourceHashes = normalizeSourceBaseline(compact.sourceHashes);
  if (
    Object.keys(sourceHashes).length > 0 &&
    compact.locales &&
    typeof compact.locales === 'object' &&
    !Array.isArray(compact.locales)
  ) {
    const allSourceKeys = Object.keys(sourceHashes);
    const baselineFile: SourceBaselineFile = {};
    for (const [lang, localeSpec] of Object.entries(compact.locales)) {
      const localeOverrides =
        localeSpec &&
        typeof localeSpec === 'object' &&
        !Array.isArray(localeSpec)
          ? normalizeSourceBaseline(
              (localeSpec as { sourceHashes?: unknown }).sourceHashes,
            )
          : {};
      const keys =
        localeSpec &&
        typeof localeSpec === 'object' &&
        !Array.isArray(localeSpec)
          ? (localeSpec as { keys?: unknown }).keys
          : localeSpec;
      const localeKeys = keys === 'allSourceKeys' ? allSourceKeys : keys;
      if (!Array.isArray(localeKeys)) continue;
      baselineFile[lang] = {};
      for (const key of localeKeys) {
        if (typeof key !== 'string') continue;
        const hash = localeOverrides[key] ?? sourceHashes[key];
        if (typeof hash === 'string') {
          baselineFile[lang][key] = hash;
        }
      }
    }
    return baselineFile;
  }

  const baselineFile: SourceBaselineFile = {};
  for (const [lang, baseline] of Object.entries(input)) {
    baselineFile[lang] = normalizeSourceBaseline(baseline);
  }
  return baselineFile;
}

function readSourceBaselineFile(filePath: string): SourceBaselineFile {
  if (!fs.existsSync(filePath)) return {};
  try {
    return expandSourceBaselineFile(
      JSON.parse(fs.readFileSync(filePath, 'utf-8')),
    );
  } catch {
    return {};
  }
}

export function compactSourceBaselineFile(
  baselineFile: SourceBaselineFile,
): CompactSourceBaselineFile {
  const hashCountsByKey = new Map<string, Map<string, number>>();
  for (const lang of Object.keys(baselineFile).sort()) {
    const keys = Object.keys(baselineFile[lang]).sort();
    for (const key of keys) {
      const hashCounts = hashCountsByKey.get(key) ?? new Map<string, number>();
      const hash = baselineFile[lang][key];
      hashCounts.set(hash, (hashCounts.get(hash) ?? 0) + 1);
      hashCountsByKey.set(key, hashCounts);
    }
  }

  const sourceHashes = Object.fromEntries(
    [...hashCountsByKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, hashCounts]) => {
        const [hash] = [...hashCounts.entries()].sort(
          ([leftHash, leftCount], [rightHash, rightCount]) =>
            rightCount - leftCount || leftHash.localeCompare(rightHash),
        )[0];
        return [key, hash];
      }),
  );
  const sourceKeys = Object.keys(sourceHashes);
  const locales: Record<string, CompactSourceBaselineLocale> = {};
  for (const lang of Object.keys(baselineFile).sort()) {
    const keys = Object.keys(baselineFile[lang]).sort();
    const keySpec: 'allSourceKeys' | string[] =
      keys.length === sourceKeys.length &&
      keys.every((key, index) => key === sourceKeys[index])
        ? 'allSourceKeys'
        : keys;
    const sourceHashOverrides = Object.fromEntries(
      keys
        .filter((key) => baselineFile[lang][key] !== sourceHashes[key])
        .map((key) => [key, baselineFile[lang][key]]),
    );
    locales[lang] =
      Object.keys(sourceHashOverrides).length === 0
        ? keySpec
        : {
            keys: keySpec,
            sourceHashes: sourceHashOverrides,
          };
  }
  return {
    version: 1,
    sourceHashes,
    locales,
  };
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function buildBaselineForKeys(
  source: NestedStrings,
  keys: readonly string[],
): SourceBaseline {
  const sourceFlat = flattenKeys(source);
  const baseline: SourceBaseline = {};
  for (const key of keys) {
    if (key in sourceFlat) {
      baseline[key] = hashSourceString(sourceFlat[key]);
    }
  }
  return baseline;
}

// CLDR plural categories: target locales may legitimately carry plural
// variants the English source does not (e.g. Polish `_few`/`_many` next to
// en's `_one`/`_other`). Those forms are hand-maintained — they must never be
// pruned (diff-mode removedKeys) NOR dropped by the merge-write path, as long
// as the English source still carries ANY member of the same plural family.
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];

export function isLocalePluralVariant(
  key: string,
  sourceFlat: Record<string, string>,
): boolean {
  const m = /^(.*)_(zero|one|two|few|many|other)$/.exec(key);
  if (!m) return false;
  return PLURAL_SUFFIXES.some((sfx) => `${m[1]}_${sfx}` in sourceFlat);
}

// Merge freshly-translated keys over the previous locale file, dropping keys
// that no longer exist in the English source — EXCEPT locale-specific plural
// variants of a still-live plural family. This is the single write-path merge
// used after every Gemini call; the same family rule guards diff-mode's
// removedKeys above. (Regression: hand-authored pl _few/_many were silently
// deleted by this loop before the guard existed — WI-621 PR #985.)
export function mergeTranslatedIntoPrevious(
  previousFlat: Record<string, string>,
  translatedFlat: Record<string, string>,
  sourceFlat: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...previousFlat };
  for (const [key, value] of Object.entries(translatedFlat)) {
    merged[key] = value;
  }
  for (const key of Object.keys(merged)) {
    if (!(key in sourceFlat) && !isLocalePluralVariant(key, sourceFlat)) {
      delete merged[key];
    }
  }
  return merged;
}

export function validatePruneOnlyLocale(args: {
  source: NestedStrings;
  pruned: NestedStrings;
  removedKeys: readonly string[];
  lang: string;
  glossary: Record<string, Record<string, string>>;
}): ValidationResult {
  const prunedFlat = flattenKeys(args.pruned);
  const errors: ValidationResult['errors'] = [];
  for (const key of args.removedKeys) {
    if (key in prunedFlat) {
      errors.push({ type: 'extra_key', key });
    }
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

export function selectGeminiDiffKeys(args: {
  source: NestedStrings;
  target: NestedStrings;
  baseline: unknown;
  full: boolean;
}): { translateKeys: string[]; removedKeys: string[] } {
  const sourceFlat = flattenKeys(args.source);
  const targetFlat = flattenKeys(args.target);
  const baseline = normalizeSourceBaseline(args.baseline);
  const removedKeys = Object.keys(targetFlat).filter(
    (key) => !(key in sourceFlat) && !isLocalePluralVariant(key, sourceFlat),
  );

  if (args.full) {
    return {
      translateKeys: Object.keys(sourceFlat),
      removedKeys,
    };
  }

  const translateKeys = Object.keys(sourceFlat).filter((key) => {
    if (!(key in targetFlat)) return true;
    return baseline[key] !== hashSourceString(sourceFlat[key]);
  });

  return { translateKeys, removedKeys };
}

function updateLocaleBaseline(
  baselineFile: SourceBaselineFile,
  lang: string,
  source: NestedStrings,
  translated: NestedStrings,
): void {
  baselineFile[lang] = buildBaselineForKeys(
    source,
    Object.keys(flattenKeys(translated)),
  );
}

export function commitTranslatedLocaleAndBaseline(args: {
  targetPath: string;
  baselinePath: string;
  baselineFile: SourceBaselineFile;
  lang: string;
  source: NestedStrings;
  translated: NestedStrings;
}): void {
  writeJsonAtomic(args.targetPath, args.translated);
  updateLocaleBaseline(
    args.baselineFile,
    args.lang,
    args.source,
    args.translated,
  );
  writeJsonAtomic(
    args.baselinePath,
    compactSourceBaselineFile(args.baselineFile),
  );
}

export function commitPrunedLocaleAndBaseline(args: {
  dryRun: boolean | undefined;
  targetPath: string;
  baselinePath: string;
  baselineFile: SourceBaselineFile;
  lang: string;
  source: NestedStrings;
  translated: NestedStrings;
}): boolean {
  if (args.dryRun) return false;
  commitTranslatedLocaleAndBaseline(args);
  return true;
}

function buildSystemPrompt(
  lang: string,
  glossary: Record<string, Record<string, string>>,
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
  lang: string,
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
    apiKey,
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
          }. Retrying in ${delay}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw new Error(
    `[${lang}] All ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`,
  );
}

async function translateNestedWithRetry(
  apiKey: string,
  systemPrompt: string,
  source: NestedStrings,
  lang: string,
): Promise<NestedStrings> {
  const chunks = chunkSourceForTranslation(source);
  if (chunks.length === 1) {
    return filterTranslatedToSourceKeys(
      JSON.parse(
        await translateWithRetry(
          apiKey,
          systemPrompt,
          JSON.stringify(source, null, 2),
          lang,
        ),
      ) as NestedStrings,
      source,
    );
  }

  const translatedFlat: Record<string, string> = {};
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    console.log(
      `[${lang}] Translating chunk ${index + 1}/${chunks.length} (${
        Object.keys(flattenKeys(chunk)).length
      } keys)`,
    );
    const translatedChunk = JSON.parse(
      await translateWithRetry(
        apiKey,
        systemPrompt,
        JSON.stringify(chunk, null, 2),
        lang,
      ),
    ) as NestedStrings;
    Object.assign(
      translatedFlat,
      filterTranslatedFlatToSourceKeys(
        flattenKeys(translatedChunk),
        flattenKeys(chunk),
      ),
    );
  }
  return unflattenKeys(translatedFlat);
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
        (TARGET_LANGUAGES as readonly string[]).includes(l),
      )
    : [...TARGET_LANGUAGES];

  if (languages.length === 0) {
    console.error(
      `Unknown language: ${opts.lang}. Supported: ${TARGET_LANGUAGES.join(
        ', ',
      )}`,
    );
    process.exit(1);
  }

  const source: NestedStrings = JSON.parse(fs.readFileSync(EN_PATH, 'utf-8'));
  const glossary = JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf-8'));
  delete glossary._meta;
  const sourceBaseline = readSourceBaselineFile(SOURCE_BASELINE_PATH);

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
      let validationSource: NestedStrings = source;

      if (opts.full || !previous) {
        toTranslate = source;
        console.log(
          `[${lang}] Full translation (${
            Object.keys(flattenKeys(source)).length
          } keys)`,
        );
      } else {
        const { translateKeys, removedKeys } = selectGeminiDiffKeys({
          source,
          target: previous,
          baseline: sourceBaseline[lang] ?? null,
          full: false,
        });
        if (translateKeys.length === 0 && removedKeys.length === 0) {
          console.log(`[${lang}] No changes detected, skipping`);
          succeeded.push(lang);
          return;
        }

        previousFlat = flattenKeys(previous);
        const sourceFlat = flattenKeys(source);
        for (const key of removedKeys) {
          delete previousFlat[key];
        }

        if (translateKeys.length === 0) {
          const pruned = unflattenKeys(previousFlat);
          const validation = validatePruneOnlyLocale({
            source,
            pruned,
            removedKeys,
            lang,
            glossary,
          });
          if (!validation.valid) {
            console.error(`[${lang}] Validation FAILED after pruning:`);
            for (const e of validation.errors) {
              console.error(
                `  ${e.type}: ${e.key}${
                  e.variable ? ` (${e.variable})` : ''
                }${e.detail ? ` — ${e.detail}` : ''}`,
              );
            }
            console.error(`[${lang}] Skipping — previous file preserved`);
            failed.push(lang);
            return;
          }
          const committed = commitPrunedLocaleAndBaseline({
            dryRun: opts.dryRun,
            targetPath,
            baselinePath: SOURCE_BASELINE_PATH,
            baselineFile: sourceBaseline,
            lang,
            source,
            translated: pruned,
          });
          const prefix = committed ? 'Pruned' : 'Dry run — would prune';
          console.log(
            `[${lang}] ${prefix} ${removedKeys.length} removed key(s), no translation needed`,
          );
          succeeded.push(lang);
          return;
        }

        const missingFlat: Record<string, string> = {};
        for (const key of translateKeys) {
          missingFlat[key] = sourceFlat[key];
        }
        toTranslate = unflattenKeys(missingFlat);
        validationSource = pickSourceKeys(source, translateKeys);
        console.log(
          `[${lang}] Diff-mode: ${translateKeys.length} changed/missing key(s), ${removedKeys.length} removed key(s)`,
        );
      }

      const systemPrompt = buildSystemPrompt(lang, glossary);

      if (opts.dryRun) {
        console.log(
          `[${lang}] Dry run — would translate ${
            Object.keys(flattenKeys(toTranslate)).length
          } keys (model=${GEMINI_MODEL})`,
        );
        succeeded.push(lang);
        return;
      }

      let translated = await translateNestedWithRetry(
        apiKey,
        systemPrompt,
        toTranslate,
        lang,
      );

      if (previousFlat) {
        const merged = mergeTranslatedIntoPrevious(
          previousFlat,
          flattenKeys(translated),
          flattenKeys(source),
        );
        translated = unflattenKeys(merged);
      }

      const validationTarget = previousFlat
        ? pickSourceKeys(translated, Object.keys(flattenKeys(validationSource)))
        : translated;
      const validation = validateTranslation(
        validationSource,
        validationTarget,
        lang,
        glossary,
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
          (e) => !(opts.writeAnyway && e.type === 'length_exceeded'),
        );
        const downgraded = validation.errors.filter(
          (e) => opts.writeAnyway && e.type === 'length_exceeded',
        );
        if (blocking.length > 0) {
          console.error(`[${lang}] Validation FAILED:`);
          for (const e of blocking) {
            console.error(
              `  ${e.type}: ${e.key}${e.variable ? ` (${e.variable})` : ''}${
                e.detail ? ` — ${e.detail}` : ''
              }`,
            );
          }
          console.error(`[${lang}] Skipping — previous file preserved`);
          failed.push(lang);
          return;
        }
        if (downgraded.length > 0) {
          console.warn(
            `[${lang}] Writing despite ${downgraded.length} length issue(s) — patch these manually:`,
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

      commitTranslatedLocaleAndBaseline({
        targetPath,
        baselinePath: SOURCE_BASELINE_PATH,
        baselineFile: sourceBaseline,
        lang,
        source,
        translated,
      });
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
    `\nResults: ${succeeded.length} succeeded, ${failed.length} failed`,
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
