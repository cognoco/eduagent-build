import {
  buildExchangeSourceEvidence,
  buildSystemPrompt,
  type ExchangeContext,
} from '../../src/services/exchanges';
import {
  buildReviewContinuityOpener,
  hasContinuityMaterial,
} from '../../src/services/review-continuity/opener';
import type { ReviewContinuityContext } from '../../src/services/review-continuity/opener-context';
import { resolveAgeBracket } from '../../src/services/exchange-prompts';
import { llmResponseEnvelopeSchema } from '@eduagent/schemas';
import type { EvalProfile } from '../fixtures/profiles';
import { reviewContinuityContexts } from '../fixtures/review-continuity';
import type {
  DeterministicCheckContext,
  FlowDefinition,
  PromptMessages,
  QualityIssue,
  Scenario,
} from '../runner/types';
import {
  runHarnessLlm,
  getOpenRouterModelOverride,
} from '../runner/llm-client';
import { assertTwoModelGuard } from '../runner/simulated-conversation';
import {
  judgeOpenerFaithfulness,
  type OpenerJudgeVerdict,
} from '../runner/opener-faithfulness-judge';
import {
  parseFirstJsonObject,
  qualityError,
  qualityWarning,
} from '../runner/quality';

// ---------------------------------------------------------------------------
// Flow adapter — Review-Continuity Opener faithfulness (plan 2026-06-27)
//
// Tier 1 (deterministic): assembles the real system prompt for each fixtured
// ReviewContinuityContext through buildSystemPrompt (review-mode, first turn,
// continuity context supplied) and snapshots it. evaluateDeterministic proves
// the builder block reached the prompt (or correctly degraded) and that no
// learner verbatim escaped sanitisation — all without an LLM call.
//
// Tier 2 (--live): the mentor opener turn is produced by the model pinned via
// `--openrouter-model` (model A), then an INDEPENDENT judge (model B, an
// explicit OpenRouter slug from OPENER_JUDGE_MODEL) scores faithfulness. The
// two models are guarded by the repo's assertTwoModelGuard (rejects same slug
// or same base family). Judge flags are recorded as WARNINGS until the judge is
// calibrated against the known-bad corpus (opener-faithfulness-corpus.ts); see
// the plan's severity note before promoting any flag to qualityError.
//
// Model slugs are recorded per run: mentor = the --openrouter-model value,
// judge = OPENER_JUDGE_MODEL (default below).
// ---------------------------------------------------------------------------

const DEFAULT_JUDGE_MODEL = 'openai/gpt-oss-120b';

function judgeModelSlug(): string {
  return process.env['OPENER_JUDGE_MODEL'] ?? DEFAULT_JUDGE_MODEL;
}

export interface ReviewContinuityOpenerInput {
  scenarioId: string;
  description: string;
  context: ReviewContinuityContext;
  /** The review-mode, first-turn ExchangeContext the opener is assembled into. */
  exchangeContext: ExchangeContext;
  /** Neutral learner return message that triggers the opener turn. */
  userMessage: string;
}

/** A review-mode, first-visible-turn context anchored on the fixture topic. */
function buildOpenerExchangeContext(
  profile: EvalProfile,
  context: ReviewContinuityContext,
  scenarioId: string,
): ExchangeContext {
  return {
    sessionId: `eval-review-opener-${scenarioId}`,
    profileId: `eval-profile-${profile.id}`,
    subjectName: 'Freeform',
    topicTitle: context.topicTitle,
    topicDescription: undefined,
    sessionType: 'learning',
    effectiveMode: 'review',
    escalationRung: 1,
    exchangeHistory: [],
    birthYear: profile.birthYear,
    exchangeCount: 0,
    inputMode: 'text',
    llmTier: 'standard',
    conversationLanguage:
      profile.conversationLanguage as ExchangeContext['conversationLanguage'],
  };
}

interface EnvelopeLike {
  reply?: unknown;
}

export const reviewContinuityOpenerFlow: FlowDefinition<ReviewContinuityOpenerInput> =
  {
    id: 'review-continuity-opener',
    name: 'Review-Continuity Opener faithfulness (EU-1/EU-2/EU-4 — LLM judge)',
    sourceFile:
      'apps/api/src/services/review-continuity/opener.ts:buildReviewContinuityOpener',
    emitsEnvelope: true,
    expectedResponseSchema: llmResponseEnvelopeSchema,

    buildPromptInput(): ReviewContinuityOpenerInput | null {
      // Not used — enumerateScenarios fans out the fixtures instead.
      return null;
    },

    enumerateScenarios(
      profile: EvalProfile,
    ): Array<Scenario<ReviewContinuityOpenerInput>> | null {
      const scenarios: Array<Scenario<ReviewContinuityOpenerInput>> = [];
      for (const fixture of reviewContinuityContexts) {
        if (fixture.profileRef !== profile.id) continue;
        scenarios.push({
          scenarioId: fixture.id,
          input: {
            scenarioId: fixture.id,
            description: fixture.description,
            context: fixture.context,
            exchangeContext: buildOpenerExchangeContext(
              profile,
              fixture.context,
              fixture.id,
            ),
            userMessage: 'I am ready when you are.',
          },
        });
      }
      return scenarios.length > 0 ? scenarios : null;
    },

    buildPrompt(input: ReviewContinuityOpenerInput): PromptMessages {
      const sourceEvidence = buildExchangeSourceEvidence(
        input.exchangeContext,
        input.userMessage,
      );
      const system = buildSystemPrompt(
        { ...input.exchangeContext, sourceEvidence },
        { reviewContinuityContext: input.context },
      );
      return {
        system,
        user: input.userMessage,
        notes: [
          `Review-continuity opener scenario: ${input.scenarioId} — ${input.description}`,
          'Tier 2 pins the mentor via --openrouter-model (model A) and judges the ' +
            `opener with an independent OpenRouter judge (model B = ${judgeModelSlug()}); ` +
            'assertTwoModelGuard rejects same slug / same base family.',
          'Judge flags are recorded as WARNINGS until the known-bad calibration ' +
            'corpus passes (see opener-faithfulness-corpus.ts).',
          '--- deterministic builder block ---',
          buildReviewContinuityOpener(input.context),
        ],
      };
    },

    evaluateDeterministic(
      ctx: DeterministicCheckContext<ReviewContinuityOpenerInput>,
    ): QualityIssue[] {
      const { input, messages } = ctx;
      const sys = messages.system;
      const issues: QualityIssue[] = [];

      // Use the builder's own material predicate so this check can never
      // diverge from what the builder actually emits (a whitespace/strip-only
      // recap degrades there, so it must be treated as "no material" here too).
      const shouldDegrade =
        !input.context.consentGranted || !hasContinuityMaterial(input.context);

      if (shouldDegrade) {
        if (sys.includes('CONTINUITY OPENER:')) {
          issues.push(
            qualityError(
              `${input.scenarioId}.degrade`,
              'Expected the generic block (declined consent / no material) but the ' +
                'continuity opener was emitted — EU-2 / fabrication risk.',
            ),
          );
        }
      } else if (!sys.includes('CONTINUITY OPENER:')) {
        issues.push(
          qualityError(
            `${input.scenarioId}.opener-missing`,
            'Continuity opener did not reach the assembled system prompt.',
          ),
        );
      }

      // Sanitisation regression: a learner verbatim carrying tag markup must
      // never survive verbatim in the prompt ([PROMPT-INJECT-4]).
      const raw = input.context.priorRetrieval?.learnerAnswerVerbatim ?? '';
      if (/[<>\n]/.test(raw) && sys.includes(raw)) {
        issues.push(
          qualityError(
            `${input.scenarioId}.sanitize`,
            'Raw learner verbatim (with tag markup / newline) reached the prompt ' +
              'unsanitised — prompt-injection egress regression.',
          ),
        );
      }

      return issues;
    },

    async runLive(
      input: ReviewContinuityOpenerInput,
      messages: PromptMessages,
    ): Promise<string> {
      return runHarnessLlm(
        [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user ?? '' },
        ],
        1,
        {
          llmTier: input.exchangeContext.llmTier,
          ageBracket: resolveAgeBracket(input.exchangeContext.birthYear),
          conversationLanguage: input.exchangeContext.conversationLanguage,
          responseFormat: 'json',
          sessionId: 'eval-review-continuity-opener',
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

      const mentorModel = getOpenRouterModelOverride();
      const judgeModel = judgeModelSlug();
      if (!mentorModel) {
        return [
          qualityWarning(
            `${input.scenarioId}.mentor-not-pinned`,
            'Mentor was not pinned via --openrouter-model, so model-A/model-B ' +
              'independence cannot be verified — the judge was NOT run. Re-run with ' +
              '--openrouter-model <mentor-slug> to judge faithfulness.',
          ),
        ];
      }
      // Independence guard — throws on same slug or same base family.
      assertTwoModelGuard(mentorModel, judgeModel, false);

      let verdict: OpenerJudgeVerdict;
      try {
        verdict = await judgeOpenerFaithfulness({
          context: input.context,
          openerOutput: parsed.reply,
          judgeModel,
        });
      } catch (err) {
        return [
          qualityWarning(
            `${input.scenarioId}.judge-call-failed`,
            `Opener judge call failed (${
              err instanceof Error ? err.message : String(err)
            }) — opener NOT judged; rerun before drawing conclusions.`,
          ),
        ];
      }

      // Severity: WARNINGS until the judge is calibrated against the known-bad
      // corpus (plan severity note). Promote to qualityError only after T6.
      const flagged: Array<[keyof OpenerJudgeVerdict, string]> = [
        ['quotedNonVerbatim', 'EU-1: quoted words the learner did not say'],
        [
          'fabricatedMemory',
          'invariant-6: asserted a memory absent from context',
        ],
        ['falseRecency', 'EU-4a: temporal claim unsupported by daysSince'],
        ['anchoredOnWeakPrior', 'EU-4b: re-asserted a weak/missing prior'],
        [
          'leakedUnderDeclinedConsent',
          'EU-2: referenced memory under declined consent',
        ],
        ['negativeFraming', 'product: struggle/failure framing'],
      ];
      const issues: QualityIssue[] = [];
      const suffix = verdict.rationale ? ` Judge: ${verdict.rationale}` : '';
      for (const [flag, label] of flagged) {
        if (verdict[flag] === true) {
          issues.push(
            qualityWarning(`${input.scenarioId}.${flag}`, `${label}.${suffix}`),
          );
        }
      }
      return issues;
    },
  };
