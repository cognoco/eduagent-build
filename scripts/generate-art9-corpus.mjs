// ---------------------------------------------------------------------------
// [WI-3142] Reproducible generator for the NON-ENGLISH Article 9 corpora in
// apps/api/src/services/learning-text-safety/corpus.ts.
//
// Operator ruling 2026-08-08: persistent memory is ENGLISH-ONLY at unlock. The
// nine non-English corpora are prepared BEST-EFFORT so that native-speaker
// review has something to review — they are marked `confidence:
// 'model-generated'`, are explicitly NOT load-bearing as a compliance control,
// and native-speaker review is a precondition for enabling memory in any
// non-English conversation language. The English set is authored by hand and is
// the only 'reviewed' one.
//
// VENDOR NOTE. MMT-ADR-0014 excludes Gemini from serving learners under 18.
// That ban governs the PRODUCT's learner-facing inference path. This script is
// offline corpus authoring: it sends no learner data, no profile, no transcript
// — only a lexicographic prompt naming an Article 9 domain and a target
// language. The operator chose Gemini for this task on 2026-08-08. Do NOT
// silently substitute another model; if Gemini is unavailable, stop and report.
//
// Run (never inline the key — Doppler injects it):
//   C:/Tools/doppler/doppler.exe run -p mentomate -c dev -- \
//     node scripts/generate-art9-corpus.mjs
//
// Writes one dated evidence file per language under
// docs/compliance/memory-unlock-package/evidence/, carrying the model id, the
// exact prompts, the raw model responses, and the accept/reject decision for
// every term — so the DPO can see the provenance of a corpus nobody has
// reviewed yet.
//
// Flags:
//   --languages=cs,de       restrict the run (default: all nine)
//   --model=<id>            override the model id (recorded in the evidence file)
//   --dry-run               print the plan and exit without calling the API
//   --apply-from-evidence   no API calls: rewrite the `unnamed-attribution-only`
//                           arrays in corpus.ts from the evidence files already
//                           on disk. Keeps integration reproducible and
//                           reviewable instead of hand-transcribed. Run
//                           `pnpm exec prettier --write` on corpus.ts after.
// ---------------------------------------------------------------------------

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_PATH = resolve(
  REPO_ROOT,
  'apps/api/src/services/learning-text-safety/corpus.ts',
);
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  'docs/compliance/memory-unlock-package/evidence',
);

/**
 * Strongest NON-PREVIEW Gemini `pro` model on OpenRouter as of 2026-08-08.
 * Checked against https://openrouter.ai/api/v1/models on that date; the only
 * newer pro tier (`google/gemini-3.1-pro-preview`) is a preview and is excluded
 * by the brief.
 */
const DEFAULT_MODEL = 'google/gemini-2.5-pro';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** The nine non-English Conversation Languages. English is authored by hand. */
const LANGUAGES = {
  cs: 'Czech',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  nb: 'Norwegian Bokmål',
  pl: 'Polish',
  pt: 'Portuguese',
};

/**
 * Per-language morphology instruction. Generic "list inflected forms" produces
 * nominative-only output for the Slavic languages, which is precisely the
 * under-firing the corpus header's no-bare-stem rule exists to prevent.
 */
const MORPHOLOGY = {
  cs: 'Czech declines. Give nominative, genitive, accusative, dative and instrumental singular AND the masculine/feminine pair for every person noun (e.g. katolík / katolíka / katolíkem / katolička).',
  de: 'German declines and forms compounds. Give nominative and genitive, the masculine/feminine pair (Katholik / Katholikin), and the adjectival forms actually used predicatively (katholisch, jüdisch).',
  es: 'Spanish inflects for gender and number. Give masculine and feminine, singular and plural (católico / católica / católicos / católicas).',
  fr: 'French inflects for gender and number. Give masculine and feminine, singular and plural (catholique / catholiques, juif / juive / juifs / juives).',
  it: 'Italian inflects for gender and number. Give masculine and feminine, singular and plural (cattolico / cattolica / cattolici / cattoliche).',
  ja: 'Japanese has no case endings but DOES have script variation that Unicode NFKC does not bridge. Give the kanji form, the katakana form and the common romaji/English loan form as SEPARATE entries where each is genuinely used (自閉症 / 発達障害 / カトリック).',
  nb: 'Norwegian Bokmål inflects for definiteness and number. Give indefinite and definite singular and the plural (katolikk / katolikken / katolikker), plus adjectival forms used predicatively.',
  pl: 'Polish declines. Give nominative, genitive, accusative and instrumental singular AND the masculine/feminine pair (katolik / katolika / katolikiem / katoliczka).',
  pt: 'Portuguese inflects for gender and number. Give masculine and feminine, singular and plural (católico / católica / católicos / católicas).',
};

const DOMAINS = [
  {
    id: 'racial-or-ethnic-origin',
    label: 'racial or ethnic origin',
    guidance:
      'Ethnic-group and origin nouns/adjectives that describe a PERSON (Roma, Sinti, Kurdish, indigenous, "of mixed heritage", "ethnic minority", "immigrant background", "ethnicity"). EXCLUDE bare colour words and bare continent/region adjectives — their attributed forms ("my black cat", "their African elephant") are ordinary prose far more often than an origin disclosure.',
  },
  {
    id: 'political-opinions',
    label: 'political opinions or affiliation',
    guidance:
      'Political-affiliation and opinion nouns/adjectives applied to a person (communist, socialist, anarchist, nationalist, feminist, far-right, "party member", "political views"). EXCLUDE words whose ordinary sense dominates in schoolwork — the local equivalents of English "conservative" (a conservative estimate), "liberal" (a liberal amount), "green", "independent", "radical", "progressive".',
  },
  {
    id: 'religious-or-philosophical-beliefs',
    label: 'religious or philosophical beliefs',
    guidance:
      'Religious/denominational/philosophical affiliation applied to a person (Catholic, Protestant, Muslim, Jewish, Hindu, Buddhist, atheist, agnostic, devout, "converted to Islam", "religious belief"), plus belief-marking dress where it is unambiguous (hijab, kippah). EXCLUDE the local equivalent of bare "orthodox" (an orthodox method) and bare "religious"/"religion" (religious education is a school subject).',
  },
  {
    id: 'trade-union-membership',
    label: 'trade-union membership',
    guidance:
      'Membership of, or office in, a trade union (union member, trade unionist, shop steward, union dues, unionised, "member of a union"). EXCLUDE the bare word for "union" on its own — it also names the European Union and, in mathematics, the union of sets.',
  },
  {
    id: 'sex-life-or-sexual-orientation',
    label: 'sex life or sexual orientation',
    guidance:
      'Sexual orientation and sex-life status applied to a person (gay, lesbian, bisexual, pansexual, queer, homosexual, heterosexual, LGBTQ, transgender, intersex, "sexual orientation", "sexually active"). EXCLUDE the local equivalent of "straight" (a straight line), of "asexual" (asexual reproduction is core biology), and of "coming out" (he is coming out of the room). EXCLUDE "boyfriend"/"girlfriend" — far too common to be a disclosure signal.',
  },
  {
    id: 'genetic-data',
    label: 'genetic data',
    guidance:
      'ONLY multi-word, inherently disclosure-shaped phrases about genetic testing or hereditary status ("DNA test result", "genetic test", "genetic screening", "hereditary condition"). Do NOT return bare "DNA", "gene" or "chromosome" — those are biology-curriculum vocabulary. Biometric data is deliberately out of scope: Article 9 defines it by the identification PURPOSE, not by any word a learner types, so return no biometric terms.',
  },
];

/**
 * POST-GENERATION CURATION — terms the model returned that must not reach the
 * corpus, with the reason each one is wrong. Applied both when generating (so a
 * re-run rejects them again) and when integrating from evidence (so corpus.ts is
 * a deterministic function of the evidence files plus this list).
 *
 * Every entry so far is Japanese, and that is not a coincidence: CJK terms are
 * matched WITHOUT word boundaries (`scan.ts` → `buildLexemeMatchers`; CJK has no
 * boundary to anchor to), and the Japanese attribution pattern spans up to 24
 * characters after the topic particle. Together those turn a generic category
 * noun into a substring trap. Each removal below was verified against a real
 * scan, not guessed.
 *
 * The Latin-script languages need no such list: word boundaries plus the tight
 * possessive/verb adjacency kept even the model's own flagged risks clear
 * (Spanish `judías` = green beans stays clear in "mi madre cocina judías
 * verdes").
 */
const CURATION_EXCLUSIONS = {
  ja: [
    ['民族', 'category noun — fires inside 民族音楽 / 民族衣装 (folk music, folk dress)'],
    ['人種', 'category noun — ordinary social-studies vocabulary, not a person status'],
    ['外国人', 'ordinary vocabulary ("a foreign friend"); not an Article 9 category alone'],
    ['移民', 'topic noun — 移民問題 (the immigration question) is a civics subject'],
    ['難民', 'topic noun — 難民問題 (the refugee question) is a civics subject'],
    ['部族', 'topic noun — tribes as a history subject'],
    ['ハーフ', 'substring of ハーフタイム / ハーフパイプ'],
    ['バイ', 'substring of バイオリン (violin), バイク, バイト'],
    ['ホモ', 'substring of ホモサピエンス — biology curriculum'],
    ['ヘテロ', 'substring of ヘテロ接合 (heterozygous) — biology curriculum'],
    ['ロマ', 'substring of ロマンス / ロマンチック — a plausible learner interest'],
    ['右翼', 'also "right field" in baseball'],
    ['左翼', 'also "left field" in baseball'],
  ],
};

/** True when a generated term is on the curation list for its language. */
function isCurationExcluded(code, term) {
  return (CURATION_EXCLUSIONS[code] ?? []).some(([excluded]) => excluded === term);
}

function curationReason(code, term) {
  return (CURATION_EXCLUSIONS[code] ?? []).find(([e]) => e === term)?.[1] ?? '';
}

const MIN_TERMS_PER_DOMAIN = 8;
const MAX_TERMS_PER_DOMAIN = 45;
/**
 * Generous, and it has to be: Gemini spends reasoning tokens from the same
 * budget, and a per-term homograph analysis for 45 terms overran an 8k cap
 * mid-string, which surfaces as a JSON parse error rather than as a truncation
 * flag. The prompt caps the ANALYSIS length for the same reason.
 */
const MAX_OUTPUT_TOKENS = 32000;

// --- CLI -------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const DRY_RUN = args.includes('--dry-run');
const APPLY_FROM_EVIDENCE = args.includes('--apply-from-evidence');
const MODEL = flag('model') ?? DEFAULT_MODEL;
const SELECTED = (flag('languages')?.split(',') ?? Object.keys(LANGUAGES)).map(
  (code) => code.trim(),
);

for (const code of SELECTED) {
  if (!LANGUAGES[code]) {
    console.error(`Unknown language code: ${code}`);
    process.exit(1);
  }
}

// --- dedupe corpus ----------------------------------------------------------

/**
 * The exact source line fragment that identifies a corpus block's language.
 *
 * A PLAIN STRING, matched with `includes`, deliberately not a RegExp. Both call
 * sites used to build `new RegExp(\`language: '${code}',\`)` from the
 * `--languages` CLI value, which CodeQL flags as `js/regex-injection` — a
 * command-line argument reaching a regex constructor. The match is purely
 * literal, so dropping the regex is both the simpler fix and a strictly exact
 * one: no escaping to get wrong, and no metacharacter in a supplied value can
 * change what matches. (`code` is separately validated against `LANGUAGES` at
 * CLI parse time; this does not rely on that.)
 */
function languageDeclaration(code) {
  return `language: '${code}',`;
}

/**
 * String literals already present in ONE language's corpus block, lowercased.
 *
 * PER-LANGUAGE, and that is load-bearing rather than tidy. Deduping against the
 * whole file drops `gay`, `muslim`, `queer` from the Czech set because English
 * already declares them — but the lexeme slot is compiled PER CORPUS, so a term
 * that lives only in the English set is reachable only through English
 * attribution grammar. `Žák je gay.` would then classify clear: `žák` is not an
 * English person reference and `je` is not an English attribution phrase. Every
 * language needs its own copy of a shared spelling.
 *
 * Within a block it is deliberately every literal, not the lexeme arrays alone:
 * a generated term colliding with that language's own person reference,
 * possessive determiner or attribution phrase is a term its grammar can never
 * see attributed, so rejecting it is correct.
 */
function existingCorpusLiterals(code) {
  const source = readFileSync(CORPUS_PATH, 'utf8');
  const blocks = source.matchAll(
    /const \w+: LanguageCorpus = \{\n([\s\S]*?)\n\};/g,
  );
  const literals = new Set();
  for (const block of blocks) {
    const body = block[1];
    if (!body.includes(languageDeclaration(code))) continue;
    for (const match of body.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
      literals.add(match[1].toLowerCase());
    }
    for (const match of body.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
      literals.add(match[1].toLowerCase());
    }
  }
  if (literals.size === 0) {
    throw new Error(`No corpus block found for language '${code}'`);
  }
  return literals;
}

// --- prompting --------------------------------------------------------------

const SYSTEM_PROMPT = [
  'You are a native-speaker lexicographer working with a data-protection engineer.',
  'You are building a DETECTION corpus for a deterministic text scanner, not an encyclopedia.',
  'The scanner matches literal lowercase phrases inside person-attribution constructions only.',
  'A bare mention of a term never fires; only "<person reference> <verb> <term>" and "<possessive> <term>" do.',
  'Your job is therefore to maximise recall of PERSON-ATTRIBUTED STATUS ASSERTIONS while keeping ordinary schoolwork prose out.',
  'Answer with strict JSON only. No markdown, no code fences, no commentary.',
].join(' ');

function userPrompt(code, domain) {
  return `Target language: ${LANGUAGES[code]} (${code}).
Article 9 special-category domain: ${domain.label}.

WHAT TO RETURN
${domain.guidance}

MORPHOLOGY — this is the part generic answers get wrong.
${MORPHOLOGY[code]}
List every form as its OWN entry. Never return a bare stem: the scanner matches literal strings with word boundaries, so a stem both over-fires on unrelated words and under-fires on the case endings it does not carry.

CONSTRAINTS
- Between ${MIN_TERMS_PER_DOMAIN} and ${MAX_TERMS_PER_DOMAIN} included terms.
- Each term is a literal phrase, lowercase (Japanese excepted, which has no case), no regex, no wildcards, no punctuation beyond internal spaces, hyphens and apostrophes.
- The corpus already covers health, disability and diagnostic terms. Do not return those.
- The scanner runs all ten supported languages' term lists against every text (English, Czech, German, Spanish, French, Italian, Japanese, Norwegian, Polish, Portuguese). A term that is an ordinary word in ANOTHER of those languages is a cross-language false positive.

PER-TERM ANALYSIS — required for every entry.
For each term state whether the string means something else in ordinary ${LANGUAGES[code]} prose, or in any of the other nine languages, and whether "<possessive> <term>" or "<the learner> is <term>" would plausibly appear in schoolwork that is NOT a disclosure. If the term is too ambiguous to include at all, put it in "excluded" with the reason instead of in "terms".
Keep every "homographRisk" and "justification" value under 15 words. They are audit notes, not essays, and a long answer will be truncated mid-JSON.

SCOPE
Recommend "unnamed-attribution-only" for essentially every term — that is the ruled default for this domain set. Recommend "broad" (matched on bare mention, in any language) ONLY if the term is near-exclusively disclosure-shaped in all ten languages; expect to recommend it for none.

OUTPUT — strict JSON, exactly this shape:
{
  "terms": [
    {
      "term": "<literal phrase>",
      "form": "<which inflected/variant form this is>",
      "recommendedScope": "unnamed-attribution-only" | "broad",
      "homographRisk": "<other meanings in this or another supported language, or 'none'>",
      "justification": "<why an attributed use of this string is a status disclosure>"
    }
  ],
  "excluded": [
    { "term": "<phrase considered>", "reason": "<why it is too ambiguous to include>" }
  ]
}`;
}

// --- API --------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(apiKey, messages) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/cognoco/eduagent-build',
          'X-Title': 'MentoMate WI-3142 Art 9 corpus generation',
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.2,
          max_tokens: MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) {
        // Read the body ONCE — a Response body is single-use (PRIN-14).
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 400)}`);
      }
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new Error(
          `Empty completion (finish_reason=${payload?.choices?.[0]?.finish_reason ?? 'unknown'})`,
        );
      }
      return { content, usage: payload.usage ?? null };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 4000);
    }
  }
  throw lastError;
}

/** Tolerate a fenced block even though the prompt forbids one. */
function parseJsonResponse(content) {
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(unfenced);
}

// --- validation -------------------------------------------------------------

const TERM_RE = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '’+\u2010-\u2015-]{1,47}$/u;

/**
 * Structural validation of one domain payload. Returns accepted terms plus a
 * rejection record for every entry that did not make it, so the evidence file
 * shows what was thrown away and why — a corpus nobody has reviewed needs its
 * rejects visible as much as its accepts.
 */
function validateDomainPayload(payload, { seen, language, domainId }) {
  const accepted = [];
  const rejected = [];

  if (!payload || !Array.isArray(payload.terms)) {
    throw new Error(
      `${language}/${domainId}: response has no "terms" array (got ${Object.keys(payload ?? {}).join(',') || 'nothing'})`,
    );
  }

  for (const entry of payload.terms) {
    const raw = typeof entry?.term === 'string' ? entry.term.trim() : '';
    const term = language === 'ja' ? raw : raw.toLowerCase();
    const reject = (reason) => rejected.push({ term: raw, reason });

    if (term.length === 0) {
      reject('empty term');
    } else if (!TERM_RE.test(term)) {
      reject('term contains characters the literal matcher cannot carry');
    } else if (seen.has(term)) {
      reject('duplicate — already present in corpus.ts or earlier in this run');
    } else if (isCurationExcluded(language, term)) {
      reject(`curation exclusion — ${curationReason(language, term)}`);
    } else {
      seen.add(term);
      accepted.push({
        term,
        form: typeof entry.form === 'string' ? entry.form : null,
        domain: domainId,
        // The model's recommendation is RECORDED, never applied. Promotion to
        // `broad` is a human decision: a broad term fires on bare mention in all
        // ten languages, which is exactly the schoolwork-flooding outcome the
        // scope policy exists to prevent.
        recommendedScope:
          typeof entry.recommendedScope === 'string'
            ? entry.recommendedScope
            : null,
        appliedScope: 'unnamed-attribution-only',
        homographRisk:
          typeof entry.homographRisk === 'string' ? entry.homographRisk : null,
        justification:
          typeof entry.justification === 'string' ? entry.justification : null,
      });
    }
  }

  if (accepted.length === 0) {
    throw new Error(`${language}/${domainId}: no term survived validation`);
  }
  return {
    accepted,
    rejected,
    modelExcluded: Array.isArray(payload.excluded) ? payload.excluded : [],
  };
}

// --- integration ------------------------------------------------------------

/** Newest evidence file for a language, by the date prefix in the filename. */
function latestEvidenceFile(code) {
  const suffix = `-art9-corpus-generation-${code}.json`;
  const matches = readdirSync(EVIDENCE_DIR)
    .filter((name) => name.endsWith(suffix))
    .sort();
  const newest = matches.at(-1);
  if (!newest) throw new Error(`No evidence file for '${code}' in ${EVIDENCE_DIR}`);
  return resolve(EVIDENCE_DIR, newest);
}

/**
 * Move curation-excluded terms out of `accepted` and into an explicit
 * `curationExcluded` list, in the evidence file itself.
 *
 * Curation may be added AFTER a language was generated (Japanese was), which
 * would otherwise leave the evidence claiming 128 accepted terms while the
 * corpus carries 115 — a reader could not reconcile the two, which is the one
 * thing an evidence file must never make hard. `rawResponse` is never touched:
 * that is the actual raw provenance, and it stays byte-for-byte as the model
 * returned it. Idempotent, so re-running `--apply-from-evidence` is safe.
 */
function reconcileCurationIntoEvidence(evidence, file, code) {
  let moved = 0;
  for (const domain of evidence.domains) {
    const excluded = domain.accepted.filter((e) =>
      isCurationExcluded(code, e.term),
    );
    if (excluded.length === 0) continue;
    domain.accepted = domain.accepted.filter(
      (e) => !isCurationExcluded(code, e.term),
    );
    domain.curationExcluded = [
      ...(domain.curationExcluded ?? []),
      ...excluded.map((e) => ({
        term: e.term,
        reason: curationReason(code, e.term),
      })),
    ];
    moved += excluded.length;
  }
  if (moved === 0) return;
  evidence.termCount = evidence.domains.reduce(
    (n, d) => n + d.accepted.length,
    0,
  );
  evidence.curationNote =
    'Terms listed under domains[].curationExcluded were returned by the model, then removed by the generator\'s post-generation curation list before reaching corpus.ts. rawResponse is unmodified.';
  writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

function renderScopeArray(evidence) {
  const lines = [`'unnamed-attribution-only': [`];
  for (const domain of evidence.domains) {
    lines.push(`  // --- ${domain.label} ---`);
    for (const entry of domain.accepted.filter(
      (e) => !isCurationExcluded(evidence.language, e.term),
    )) {
      // JSON.stringify, NOT a hand-rolled single-quoted literal: several terms
      // carry an apostrophe (`convertiti all'islam`, `jehovah's witness`) and
      // naive quote substitution emits an unterminated string. Prettier
      // normalises the quote style afterwards.
      lines.push(`  ${JSON.stringify(entry.term)},`);
    }
  }
  lines.push(`],`);
  return lines.map((line) => `    ${line}`).join('\n').trimStart();
}

/**
 * Rewrite one language's array in place. Scoped to that language's corpus block
 * so a shared spelling in another block is never touched, and it refuses rather
 * than guesses if the anchor is missing.
 */
function applyEvidence(code) {
  const evidenceFile = latestEvidenceFile(code);
  const evidence = JSON.parse(readFileSync(evidenceFile, 'utf8'));
  if (evidence.language !== code) {
    throw new Error(`Evidence file for '${code}' declares language '${evidence.language}'`);
  }
  reconcileCurationIntoEvidence(evidence, evidenceFile, code);
  const source = readFileSync(CORPUS_PATH, 'utf8');
  const block = [
    ...source.matchAll(/const \w+: LanguageCorpus = \{\n([\s\S]*?)\n\};/g),
  ].find((m) => m[1].includes(languageDeclaration(code)));
  if (!block) throw new Error(`No corpus block for '${code}'`);

  const anchor = /\n {4}'unnamed-attribution-only': \[[^\]]*\],/;
  if (!anchor.test(block[1])) {
    throw new Error(`No 'unnamed-attribution-only' array in the '${code}' block`);
  }
  const updatedBody = block[1].replace(
    anchor,
    `\n    ${renderScopeArray(evidence)}`,
  );
  writeFileSync(CORPUS_PATH, source.replace(block[1], updatedBody), 'utf8');
  // The APPLIED count, which is the generated count minus curation exclusions —
  // reporting evidence.termCount here would overstate what is in the corpus.
  return evidence.domains.reduce(
    (n, d) =>
      n + d.accepted.filter((e) => !isCurationExcluded(code, e.term)).length,
    0,
  );
}

// --- main -------------------------------------------------------------------

async function main() {
  if (APPLY_FROM_EVIDENCE) {
    for (const code of SELECTED) {
      console.log(`${code}: ${applyEvidence(code)} terms → corpus.ts`);
    }
    console.log('Run `pnpm exec prettier --write` on corpus.ts.');
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    console.error(
      'OPENROUTER_API_KEY is not set. Run through Doppler:\n' +
        '  C:/Tools/doppler/doppler.exe run -p mentomate -c dev -- node scripts/generate-art9-corpus.mjs',
    );
    process.exit(1);
  }

  const runDate = new Date().toISOString().slice(0, 10);
  console.log(`model:     ${MODEL}`);
  console.log(`languages: ${SELECTED.join(', ')}`);
  console.log(`domains:   ${DOMAINS.map((d) => d.id).join(', ')}`);
  console.log(`evidence:  ${EVIDENCE_DIR}`);
  if (DRY_RUN) {
    console.log('--dry-run: no API calls made.');
    return;
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });

  for (const code of SELECTED) {
    const seen = existingCorpusLiterals(code);
    const domains = [];

    for (const domain of DOMAINS) {
      const prompt = userPrompt(code, domain);
      process.stdout.write(`${code}/${domain.id} … `);
      const { content, usage } = await callGemini(apiKey, [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ]);
      const payload = parseJsonResponse(content);
      const { accepted, rejected, modelExcluded } = validateDomainPayload(
        payload,
        { seen, language: code, domainId: domain.id },
      );
      console.log(`${accepted.length} accepted, ${rejected.length} rejected`);
      domains.push({
        domain: domain.id,
        label: domain.label,
        prompt,
        rawResponse: content,
        usage,
        accepted,
        rejected,
        modelExcluded,
      });
      await sleep(1200);
    }

    const evidence = {
      workItem: 'WI-3142',
      purpose:
        'Best-effort LLM-prepared Article 9 protected-lexeme corpus for a non-English conversation language. UNREVIEWED: not load-bearing as a compliance control. Native-speaker review is a precondition for enabling persistent memory in this language.',
      operatorRuling:
        '2026-08-08 — persistent memory is English-only at unlock; non-English corpora are prepared best-effort via LLM generation and marked model-generated.',
      language: code,
      languageName: LANGUAGES[code],
      generatedAt: new Date().toISOString(),
      provider: 'openrouter',
      model: MODEL,
      systemPrompt: SYSTEM_PROMPT,
      appliedScope: 'unnamed-attribution-only',
      appliedScopeNote:
        'Every accepted term is applied at unnamed-attribution-only regardless of the model recommendation. Promotion to broad is a human decision.',
      termCount: domains.reduce((n, d) => n + d.accepted.length, 0),
      domains,
    };
    const file = resolve(
      EVIDENCE_DIR,
      `${runDate}-art9-corpus-generation-${code}.json`,
    );
    writeFileSync(file, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(`  → ${file} (${evidence.termCount} terms)`);
  }
}

main().catch((error) => {
  // Never surface the key: report the message only, never the request headers.
  console.error(`\nGeneration failed: ${error?.message ?? error}`);
  console.error(
    'The operator chose Gemini for this task — do not substitute another model. Stop and report.',
  );
  process.exit(1);
});
