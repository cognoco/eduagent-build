import {
  buildExchangeSourceEvidence,
  buildSystemPrompt,
  type ExchangeContext,
} from '../../src/services/exchanges';
import { llmResponseEnvelopeSchema } from '@eduagent/schemas';
import { resolveAgeBracket } from '../../src/services/exchange-prompts';
import type { EvalProfile } from '../fixtures/profiles';
import type {
  FlowDefinition,
  PromptMessages,
  QualityIssue,
  Scenario,
} from '../runner/types';
import { runHarnessLlm } from '../runner/llm-client';
import { callLlm } from '../runner/llm-bootstrap';
import {
  parseFirstJsonObject,
  qualityError,
  qualityWarning,
} from '../runner/quality';

// ---------------------------------------------------------------------------
// Flow adapter — Conversation-Language Quality (model-selection memo §6.2)
//
// Judges the LINGUISTIC quality of tutor replies in the under-served
// conversation locales (cs, nb, pl) — wrong-language replies, broken grammar,
// unnatural register. The shape gates (envelope schema, safety probes) say
// nothing about whether the Czech an 11-year-old receives is actually good
// Czech; this flow closes that gap.
//
// Two-model architecture:
//   - The TUTOR reply under test goes through `runHarnessLlm`, so a
//     `--openrouter-model` candidate override applies — this is part of the
//     §6 candidate gate.
//   - The JUDGE goes through `callLlm` (production routing — currently
//     Gemini), which the candidate override deliberately does NOT touch.
//     The judge is therefore always a model independent of all five
//     candidates, and a candidate can never grade its own homework.
//
// Judge failures (timeout, unparseable verdict) are WARNINGS, not errors —
// the candidate must never fail the gate because the judge hiccuped.
// ---------------------------------------------------------------------------

type TargetLanguage = 'cs' | 'nb' | 'pl';

const LANGUAGE_NAMES: Record<TargetLanguage, string> = {
  cs: 'Czech',
  nb: 'Norwegian Bokmål',
  pl: 'Polish',
};

interface LanguageQualitySpec {
  id: string;
  language: TargetLanguage;
  /** Profile this scenario runs against (one per scenario, age-matched). */
  profileId: string;
  description: string;
  userMessage: string;
}

// Learner messages are deliberately ordinary tutoring turns — the point is
// to sample everyday prose in the target language, not edge cases (the
// safety battery covers adversarial input in cs/nb separately).
const LANGUAGE_QUALITY_SCENARIOS: LanguageQualitySpec[] = [
  {
    id: 'LQ-CS01',
    language: 'cs',
    profileId: '11yo-czech-animals',
    description: 'Czech, age 11 — explain fractions from scratch.',
    userMessage:
      'Můžeš mi vysvětlit zlomky? Vůbec nechápu, co znamenají ta čísla nad a pod čárou.',
  },
  {
    id: 'LQ-CS02',
    language: 'cs',
    profileId: '11yo-czech-animals',
    description: 'Czech, age 11 — curiosity question matching interests.',
    userMessage:
      'Proč některá zvířata v zimě spí? Jak medvěd vydrží tak dlouho bez jídla?',
  },
  {
    id: 'LQ-NB01',
    language: 'nb',
    profileId: '15yo-football-gaming',
    description: 'Norwegian, age 15 — explain moon phases.',
    userMessage:
      'Kan du forklare hvorfor månen har faser? Jeg skjønner det ikke helt.',
  },
  {
    id: 'LQ-NB02',
    language: 'nb',
    profileId: '15yo-football-gaming',
    description: 'Norwegian, age 15 — photosynthesis re-explanation.',
    userMessage:
      'Hva er egentlig fotosyntese? Læreren forklarte det i dag, men jeg henger ikke med.',
  },
  {
    id: 'LQ-PL01',
    language: 'pl',
    profileId: '13yo-spanish-beginner',
    description: 'Polish, age 13 — explain fractions notation.',
    userMessage:
      'Możesz mi wytłumaczyć, czym są ułamki? Nie rozumiem, co oznaczają liczby nad i pod kreską.',
  },
  {
    id: 'LQ-PL02',
    language: 'pl',
    profileId: '13yo-spanish-beginner',
    description: 'Polish, age 13 — everyday why-question.',
    userMessage: 'Dlaczego niebo jest niebieskie? Zawsze chciałem to wiedzieć.',
  },
];

export interface LanguageQualityScenarioInput {
  scenarioId: string;
  language: TargetLanguage;
  description: string;
  context: ExchangeContext;
  userMessage: string;
  learnerAge: number;
}

function buildLanguageContext(
  profile: EvalProfile,
  spec: LanguageQualitySpec,
): ExchangeContext {
  return {
    sessionId: `eval-langq-${spec.id}`,
    profileId: `eval-profile-${profile.id}`,
    subjectName: 'Freeform',
    topicTitle: profile.libraryTopics[0] ?? 'a new topic',
    topicDescription: undefined,
    sessionType: 'learning',
    escalationRung: 1,
    exchangeHistory: [],
    birthYear: profile.birthYear,
    exchangeCount: 0,
    inputMode: 'text',
    llmTier: 'standard',
    conversationLanguage: spec.language,
  };
}

// ---------------------------------------------------------------------------
// LLM judge
// ---------------------------------------------------------------------------

interface JudgeVerdict {
  is_target_language?: unknown;
  grammar?: unknown;
  naturalness?: unknown;
  age_appropriate?: unknown;
  issues?: unknown;
}

function judgeSystemPrompt(languageName: string): string {
  return (
    `You are an exacting native-speaker examiner of ${languageName}. ` +
    'You judge ONLY the linguistic quality of a tutor reply written for a young learner — grammar, idiomatic naturalness, register, and whether it is in the right language at all. ' +
    'You do NOT judge pedagogy, factual accuracy, or length.\n' +
    'Scoring rubric:\n' +
    '- grammar: 1 = pervasive errors, 2 = several clear errors, 3 = a few noticeable slips, 4 = minor imperfections, 5 = flawless.\n' +
    '- naturalness: 1 = machine-translated/calqued throughout, 2 = stilted, 3 = understandable but foreign-sounding in places, 4 = mostly idiomatic, 5 = indistinguishable from a native tutor.\n' +
    `- is_target_language: false if any substantial part of the reply (more than a loanword or proper noun) is NOT in ${languageName}.\n` +
    '- age_appropriate: false if vocabulary or register is clearly wrong for the stated learner age (academic jargon for a child, or condescending baby-talk for a teenager).\n' +
    'Reply with ONLY a JSON object, no prose before or after:\n' +
    '{"is_target_language": <bool>, "grammar": <1-5>, "naturalness": <1-5>, "age_appropriate": <bool>, "issues": ["<short concrete note, quote the offending phrase>", ...]}'
  );
}

function judgeUserPrompt(
  input: LanguageQualityScenarioInput,
  reply: string,
): string {
  return (
    `Target language: ${LANGUAGE_NAMES[input.language]} (${input.language})\n` +
    `Learner age: ${input.learnerAge}\n` +
    `Learner message:\n"""\n${input.userMessage}\n"""\n\n` +
    `Tutor reply to judge:\n"""\n${reply}\n"""`
  );
}

function clampScore(value: unknown): number | null {
  return typeof value === 'number' && value >= 1 && value <= 5 ? value : null;
}

async function judgeReply(
  input: LanguageQualityScenarioInput,
  reply: string,
): Promise<QualityIssue[]> {
  let raw: string;
  try {
    raw = await callLlm(
      [
        {
          role: 'system',
          content: judgeSystemPrompt(LANGUAGE_NAMES[input.language]),
        },
        { role: 'user', content: judgeUserPrompt(input, reply) },
      ],
      { flow: 'eval-language-judge', rung: 2, responseFormat: 'json' },
    );
  } catch (err) {
    return [
      qualityWarning(
        `${input.scenarioId}.judge-call-failed`,
        `Language judge call failed (${
          err instanceof Error ? err.message : String(err)
        }) — reply NOT judged; rerun before drawing conclusions.`,
      ),
    ];
  }

  const verdict = parseFirstJsonObject<JudgeVerdict>(raw);
  if (!verdict) {
    return [
      qualityWarning(
        `${input.scenarioId}.judge-unparseable`,
        'Language judge returned an unparseable verdict — reply NOT judged; rerun before drawing conclusions.',
      ),
    ];
  }

  const issues: QualityIssue[] = [];
  const notes = Array.isArray(verdict.issues)
    ? verdict.issues.filter((n): n is string => typeof n === 'string')
    : [];
  const noteSuffix =
    notes.length > 0 ? ` Judge notes: ${notes.join(' | ')}` : '';

  if (verdict.is_target_language === false) {
    issues.push(
      qualityError(
        `${input.scenarioId}.wrong-language`,
        `Reply is not (fully) in ${LANGUAGE_NAMES[input.language]}.${noteSuffix}`,
      ),
    );
  }

  const grammar = clampScore(verdict.grammar);
  if (grammar !== null && grammar <= 2) {
    issues.push(
      qualityError(
        `${input.scenarioId}.grammar`,
        `Judge scored grammar ${grammar}/5 — clear errors in learner-facing prose.${noteSuffix}`,
      ),
    );
  } else if (grammar === 3) {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.grammar`,
        `Judge scored grammar 3/5 — noticeable slips.${noteSuffix}`,
      ),
    );
  }

  const naturalness = clampScore(verdict.naturalness);
  if (naturalness !== null && naturalness <= 3) {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.naturalness`,
        `Judge scored naturalness ${naturalness}/5 — stilted or calqued phrasing.${noteSuffix}`,
      ),
    );
  }

  if (verdict.age_appropriate === false) {
    issues.push(
      qualityWarning(
        `${input.scenarioId}.register`,
        `Judge flagged register as wrong for a ${input.learnerAge}-year-old.${noteSuffix}`,
      ),
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Flow definition
// ---------------------------------------------------------------------------

interface EnvelopeLike {
  reply?: unknown;
}

export const languageQualityFlow: FlowDefinition<LanguageQualityScenarioInput> =
  {
    id: 'language-quality',
    name: 'Conversation-Language Quality (cs/nb/pl — LLM judge)',
    sourceFile: 'apps/api/src/services/exchange-prompts.ts:buildSystemPrompt',
    emitsEnvelope: true,
    expectedResponseSchema: llmResponseEnvelopeSchema,

    buildPromptInput(): LanguageQualityScenarioInput | null {
      // Not used — enumerateScenarios fans out instead.
      return null;
    },

    enumerateScenarios(
      profile: EvalProfile,
    ): Array<Scenario<LanguageQualityScenarioInput>> | null {
      const scenarios: Array<Scenario<LanguageQualityScenarioInput>> = [];

      for (const spec of LANGUAGE_QUALITY_SCENARIOS) {
        if (spec.profileId !== profile.id) continue;

        scenarios.push({
          scenarioId: spec.id,
          input: {
            scenarioId: spec.id,
            language: spec.language,
            description: spec.description,
            context: buildLanguageContext(profile, spec),
            userMessage: spec.userMessage,
            learnerAge: profile.ageYears,
          },
        });
      }

      return scenarios.length > 0 ? scenarios : null;
    },

    buildPrompt(input: LanguageQualityScenarioInput): PromptMessages {
      const sourceEvidence = buildExchangeSourceEvidence(
        input.context,
        input.userMessage,
      );
      const system = buildSystemPrompt({
        ...input.context,
        sourceEvidence,
      });

      return {
        system,
        user: input.userMessage,
        notes: [
          `Language-quality scenario: ${input.scenarioId} — ${input.description}`,
          `conversationLanguage: ${input.language} (${LANGUAGE_NAMES[input.language]})`,
          'Tier 2 judges the reply prose with an LLM judge on production routing (independent of any --openrouter-model candidate override).',
        ],
      };
    },

    async runLive(
      input: LanguageQualityScenarioInput,
      messages: PromptMessages,
    ): Promise<string> {
      return runHarnessLlm(
        [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user ?? '' },
        ],
        1,
        {
          llmTier: input.context.llmTier,
          ageBracket: resolveAgeBracket(input.context.birthYear),
          conversationLanguage: input.context.conversationLanguage,
          responseFormat: 'json',
          sessionId: 'eval-language-quality',
        },
      );
    },

    async evaluateQuality({ input, liveResponse }): Promise<QualityIssue[]> {
      const parsed = parseFirstJsonObject<EnvelopeLike>(liveResponse);
      if (!parsed || typeof parsed.reply !== 'string') {
        return [
          qualityError(
            `${input.scenarioId}.envelope.parse`,
            'Live response did not contain a parseable envelope with a string reply — nothing to judge.',
          ),
        ];
      }
      return judgeReply(input, parsed.reply);
    },
  };
