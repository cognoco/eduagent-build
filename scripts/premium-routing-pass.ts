import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeDatabase,
  createDatabase,
  curriculumTopics,
  learningProfiles,
  learningSessions,
  profiles,
  retentionCards,
  sessionEvents,
  subjects,
  teachingPreferences,
  type Database,
} from '@eduagent/database';
import { and, desc, eq } from 'drizzle-orm';

import type { ExchangeSourceAudit } from '../apps/api/src/services/exchanges';
import {
  _clearProviders,
  _setOpenAIAdvancedModelForTesting,
  createAnthropicProvider,
  createGeminiProvider,
  createOpenAIProvider,
  OPENAI_ADVANCED_MODEL,
  OPENAI_ADVANCED_MODEL_CANDIDATES,
  registerProvider,
  setLlmRoutingV2Enabled,
  type OpenAIAdvancedModel,
  type PreferredLlmProvider,
} from '../apps/api/src/services/llm/index';
import { isLlmRoutingV2Enabled } from '../apps/api/src/config';
import {
  processMessage,
  startSession,
} from '../apps/api/src/services/session/index';
import {
  resetDatabase,
  seedScenario,
} from '../apps/api/src/services/test-seed';
import type {
  LLMTier,
  SubscriptionState,
} from '../apps/api/src/services/subscription';

type SubscriptionTier = SubscriptionState['tier'];
type AdvancedProvider = Extract<PreferredLlmProvider, 'openai' | 'anthropic'>;
type IssueSeverity = 'fail' | 'warn';
type IssueCategory = 'routing' | 'source' | 'quality';

interface PremiumRoutingCase {
  id: string;
  label: string;
  subscriptionTier: SubscriptionTier;
  requestedLlmTier: LLMTier;
  advancedProvider?: AdvancedProvider;
  targetRung: 4 | 5;
  expectedProvider: PreferredLlmProvider;
  expectedModel: string;
  expectedTier: LLMTier;
  expectedReason: string;
  expectedPolicy?: 'gemini_only';
}

interface QualityIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  code: string;
  message: string;
  caseId: string;
  snippet?: string;
}

interface AiEventRecord {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface CaseResult {
  case: PremiumRoutingCase;
  email: string;
  profileId: string;
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicTitle: string;
  sessionId: string;
  userMessage: string;
  assistant: string;
  exchangeCount: number;
  escalationRung: number;
  aiEventId?: string;
  aiEvent: AiEventRecord;
  sourceAudit?: ExchangeSourceAudit;
  envelopeParseFailed?: boolean;
  envelopeParseFailureReason?: string;
  durationMs: number;
  issues: QualityIssue[];
}

interface RegisteredKeys {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
}

const HARD_TOPIC = {
  title: 'Bayes theorem and false positives',
  description:
    'A condition affects 1% of people. A test detects 99% of people who have it. It also gives a false positive for 5% of people who do not have it. Using 10,000 people: about 100 have the condition, 99 of them test positive, 9,900 do not have it, and about 495 of those still test positive. A positive result means about 99 out of 594 positives have the condition, roughly 16-17%, not near certainty.',
};

const HARD_PROMPT =
  "This is the confusing part: if the test is 99% accurate for people who have the condition, why isn't a positive result almost certain? Walk me through it with the 10,000 people idea, and please keep it useful for studying.";

const cases: PremiumRoutingCase[] = [
  {
    id: 'plus-hard-anthropic',
    label: 'Plus hard turn -> Claude candidate',
    subscriptionTier: 'plus',
    requestedLlmTier: 'standard',
    advancedProvider: 'anthropic',
    targetRung: 4,
    expectedProvider: 'anthropic',
    expectedModel: 'claude-sonnet-4-6',
    expectedTier: 'premium',
    expectedReason: 'plus_included_advanced_rung',
  },
  {
    id: 'plus-rung4-openai-deferred',
    label: 'Plus rung 4 with GPT preference -> Claude candidate',
    subscriptionTier: 'plus',
    requestedLlmTier: 'standard',
    advancedProvider: 'openai',
    targetRung: 4,
    expectedProvider: 'anthropic',
    expectedModel: 'claude-sonnet-4-6',
    expectedTier: 'premium',
    expectedReason: 'plus_included_advanced_rung',
  },
  {
    id: 'plus-hard-openai',
    label: 'Plus rung 5 turn -> GPT candidate',
    subscriptionTier: 'plus',
    requestedLlmTier: 'standard',
    advancedProvider: 'openai',
    targetRung: 5,
    expectedProvider: 'openai',
    expectedModel: 'gpt-5.4',
    expectedTier: 'premium',
    expectedReason: 'plus_included_advanced_rung',
  },
  {
    id: 'family-standard-hard',
    label: 'Family standard hard turn -> Gemini only',
    subscriptionTier: 'family',
    requestedLlmTier: 'standard',
    targetRung: 4,
    expectedProvider: 'gemini',
    expectedModel: 'gemini-2.5-pro',
    expectedTier: 'standard',
    expectedReason: 'family_standard_gemini_only',
    expectedPolicy: 'gemini_only',
  },
  {
    id: 'family-upgrade-anthropic',
    label: 'Family advanced add-on -> Claude candidate',
    subscriptionTier: 'family',
    requestedLlmTier: 'premium',
    advancedProvider: 'anthropic',
    targetRung: 4,
    expectedProvider: 'anthropic',
    expectedModel: 'claude-sonnet-4-6',
    expectedTier: 'premium',
    expectedReason: 'premium_profile_or_addon_advanced_rung',
  },
  {
    id: 'family-upgrade-openai',
    label: 'Family advanced add-on -> GPT candidate',
    subscriptionTier: 'family',
    requestedLlmTier: 'premium',
    advancedProvider: 'openai',
    targetRung: 5,
    expectedProvider: 'openai',
    expectedModel: 'gpt-5.4',
    expectedTier: 'premium',
    expectedReason: 'premium_profile_or_addon_advanced_rung',
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function getArg(prefix: string): string | undefined {
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getRunId(): string {
  return (
    getArg('--run-id=') ??
    new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14)
  );
}

function getOpenAIModelOverride(): OpenAIAdvancedModel | undefined {
  const model = getArg('--openai-model=');
  if (!model) return undefined;

  const allowed = new Set<string>(OPENAI_ADVANCED_MODEL_CANDIDATES);
  if (!allowed.has(model)) {
    throw new Error(
      `Unknown OpenAI advanced model: ${model}. Allowed: ${OPENAI_ADVANCED_MODEL_CANDIDATES.join(
        ', ',
      )}`,
    );
  }

  return model as OpenAIAdvancedModel;
}

function seedEmailPrefix(runId: string): string {
  return `codex-premium-routing-${runId}-`;
}

function seedEnv(): { CLERK_SECRET_KEY?: string; SEED_PASSWORD?: string } {
  return {
    SEED_PASSWORD: process.env['SEED_PASSWORD'],
  };
}

// Thread the V2 routing cutover flag into the pure router module the same
// way production does (apps/api/src/middleware/llm.ts) — there is no HTTP
// middleware in script context to do this per-request, so a staging gate run
// with LLM_ROUTING_V2_ENABLED=true actually exercises V2 routing instead of
// silently validating the legacy path. Logged so a run's output is
// self-evidencing about which path it validated.
function logLlmRoutingMode(): void {
  const v2Enabled = isLlmRoutingV2Enabled(
    process.env['LLM_ROUTING_V2_ENABLED'],
  );
  setLlmRoutingV2Enabled(v2Enabled);
  console.log(`LLM routing: ${v2Enabled ? 'v2' : 'legacy'}`);
}

function registerLiveProviders(): RegisteredKeys {
  _clearProviders();

  const geminiKey = process.env['GEMINI_API_KEY'];
  const openaiKey = process.env['OPENAI_API_KEY'];
  const anthropicKey = process.env['ANTHROPIC_API_KEY'];

  if (geminiKey) registerProvider(createGeminiProvider(geminiKey));
  if (openaiKey) registerProvider(createOpenAIProvider(openaiKey));
  if (anthropicKey) registerProvider(createAnthropicProvider(anthropicKey));

  return {
    gemini: Boolean(geminiKey),
    openai: Boolean(openaiKey),
    anthropic: Boolean(anthropicKey),
  };
}

function selectCases(): PremiumRoutingCase[] {
  const caseArg = getArg('--cases=');
  const providerArg = getArg('--providers=');

  let selected = cases;
  if (caseArg) {
    const requested = new Set(
      caseArg
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );
    const known = new Set(cases.map((item) => item.id));
    for (const id of requested) {
      if (!known.has(id))
        throw new Error(`Unknown premium-routing case: ${id}`);
    }
    selected = selected.filter((item) => requested.has(item.id));
  }

  if (providerArg) {
    const providers = new Set(
      providerArg
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );
    for (const provider of providers) {
      if (provider !== 'openai' && provider !== 'anthropic') {
        throw new Error(`Unknown advanced provider: ${provider}`);
      }
    }
    selected = selected.filter(
      (item) => !item.advancedProvider || providers.has(item.advancedProvider),
    );
  }

  if (selected.length === 0) {
    throw new Error('No premium-routing cases selected');
  }
  return selected;
}

function withOpenAIExpectedModel(
  selected: PremiumRoutingCase[],
  openAIModel: OpenAIAdvancedModel,
): PremiumRoutingCase[] {
  return selected.map((item) =>
    item.expectedProvider === 'openai'
      ? { ...item, expectedModel: openAIModel }
      : item,
  );
}

function providerIsRegistered(
  keys: RegisteredKeys,
  provider: PreferredLlmProvider,
): boolean {
  return keys[provider] === true;
}

function requireProviders(
  selected: PremiumRoutingCase[],
  keys: RegisteredKeys,
): PremiumRoutingCase[] {
  if (!hasFlag('--allow-missing-provider')) {
    const missing = selected
      .filter((item) => !providerIsRegistered(keys, item.expectedProvider))
      .map((item) => `${item.id}:${item.expectedProvider}`);
    if (missing.length > 0) {
      throw new Error(
        `Missing provider key(s) for premium-routing pass: ${missing.join(', ')}`,
      );
    }
    return selected;
  }

  const runnable = selected.filter((item) =>
    providerIsRegistered(keys, item.expectedProvider),
  );
  for (const skipped of selected.filter(
    (item) => !providerIsRegistered(keys, item.expectedProvider),
  )) {
    console.warn(
      `[skip] ${skipped.id} needs ${skipped.expectedProvider}; key not configured`,
    );
  }
  if (runnable.length === 0) {
    throw new Error('No premium-routing cases can run with configured keys');
  }
  return runnable;
}

async function resolveTopicId(
  db: Database,
  seedIds: Record<string, string>,
): Promise<string | undefined> {
  if (seedIds['topicId']) return seedIds['topicId'];
  const retentionCardId = seedIds['retentionCardId'];
  if (!retentionCardId) return undefined;
  const [row] = await db
    .select({ topicId: retentionCards.topicId })
    .from(retentionCards)
    .where(eq(retentionCards.id, retentionCardId))
    .limit(1);
  return row?.topicId ?? undefined;
}

async function getSubjectName(
  db: Database,
  subjectId: string,
): Promise<string> {
  const [row] = await db
    .select({ name: subjects.name })
    .from(subjects)
    .where(eq(subjects.id, subjectId))
    .limit(1);
  return row?.name ?? 'Unknown subject';
}

async function getTopicTitle(db: Database, topicId: string): Promise<string> {
  const [row] = await db
    .select({ title: curriculumTopics.title })
    .from(curriculumTopics)
    .where(eq(curriculumTopics.id, topicId))
    .limit(1);
  return row?.title ?? 'Unknown topic';
}

async function updateSeedProfile(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<void> {
  await db
    .update(profiles)
    .set({
      displayName: 'Maya',
      birthYear: new Date().getFullYear() - 15,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, profileId));

  await db
    .insert(learningProfiles)
    .values({
      profileId,
      learningStyle: null,
      communicationNotes: [
        'Prefers serious studying, concise steps, and one check question.',
      ],
      accommodationMode: 'none',
      memoryConsentStatus: 'granted',
      memoryEnabled: true,
      memoryInjectionEnabled: true,
      memoryCollectionEnabled: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: learningProfiles.profileId,
      set: {
        learningStyle: null,
        communicationNotes: [
          'Prefers serious studying, concise steps, and one check question.',
        ],
        accommodationMode: 'none',
        memoryConsentStatus: 'granted',
        memoryEnabled: true,
        memoryInjectionEnabled: true,
        memoryCollectionEnabled: false,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(teachingPreferences)
    .values({
      profileId,
      subjectId,
      method: 'step_by_step',
      analogyDomain: null,
      nativeLanguage: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [teachingPreferences.profileId, teachingPreferences.subjectId],
      set: {
        method: 'step_by_step',
        analogyDomain: null,
        nativeLanguage: null,
        updatedAt: new Date(),
      },
    });
}

async function applyHardTopic(db: Database, topicId: string): Promise<void> {
  await db
    .update(curriculumTopics)
    .set({
      title: HARD_TOPIC.title,
      description: HARD_TOPIC.description,
      updatedAt: new Date(),
    })
    .where(eq(curriculumTopics.id, topicId));
}

async function forceEscalationRung(
  db: Database,
  profileId: string,
  sessionId: string,
  rung: 4 | 5,
): Promise<void> {
  await db
    .update(learningSessions)
    .set({
      escalationRung: rung,
      exchangeCount: 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningSessions.id, sessionId),
        eq(learningSessions.profileId, profileId),
      ),
    );
}

async function getAiEvent(
  db: Database,
  sessionId: string,
  aiEventId?: string,
): Promise<AiEventRecord> {
  const query = db
    .select({
      id: sessionEvents.id,
      content: sessionEvents.content,
      metadata: sessionEvents.metadata,
      createdAt: sessionEvents.createdAt,
    })
    .from(sessionEvents);

  const [row] = aiEventId
    ? await query.where(eq(sessionEvents.id, aiEventId)).limit(1)
    : await query
        .where(
          and(
            eq(sessionEvents.sessionId, sessionId),
            eq(sessionEvents.eventType, 'ai_response'),
          ),
        )
        .orderBy(desc(sessionEvents.createdAt))
        .limit(1);

  if (!row) {
    throw new Error(`No ai_response event found for session ${sessionId}`);
  }

  return {
    id: row.id,
    content: row.content,
    metadata: ((row.metadata as Record<string, unknown> | null) ??
      {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}

function snippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 260);
}

function hasUsefulBayesShape(response: string): boolean {
  const normalized = response.toLowerCase();
  const hasPopulation = /\b10,?000\b/.test(normalized);
  const hasAffected = /\b100\b/.test(normalized);
  const hasTruePositives = /\b99\b/.test(normalized);
  const hasFalsePositives =
    /\b495\b/.test(normalized) || /\babout 500\b/.test(normalized);
  const hasTotalPositives =
    /\b594\b/.test(normalized) ||
    /\b595\b/.test(normalized) ||
    /\babout 600\b/.test(normalized);
  const hasProbability =
    /\b16(?:\.\d+)?%/.test(normalized) ||
    /\b17(?:\.\d+)?%/.test(normalized) ||
    /\bone in six\b/.test(normalized) ||
    /\b1 in 6\b/.test(normalized);

  return (
    hasPopulation &&
    hasAffected &&
    hasTruePositives &&
    hasFalsePositives &&
    hasTotalPositives &&
    hasProbability
  );
}

function analyzeCase(
  testCase: PremiumRoutingCase,
  result: {
    response: string;
    exchangeCount: number;
    escalationRung: number;
    envelopeParseFailed?: boolean;
    envelopeParseFailureReason?: string;
    sourceAudit?: ExchangeSourceAudit;
  },
  aiEvent: AiEventRecord,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const meta = aiEvent.metadata;

  function issue(
    severity: IssueSeverity,
    category: IssueCategory,
    code: string,
    message: string,
    text?: string,
  ): void {
    issues.push({
      severity,
      category,
      code,
      message,
      caseId: testCase.id,
      ...(text ? { snippet: snippet(text) } : {}),
    });
  }

  if (meta['llmTier'] !== testCase.expectedTier) {
    issue(
      'fail',
      'routing',
      'wrong_llm_tier',
      `Expected ${testCase.expectedTier}, got ${String(meta['llmTier'])}.`,
    );
  }

  if (meta['llmProvider'] !== testCase.expectedProvider) {
    issue(
      'fail',
      'routing',
      'wrong_provider',
      `Expected ${testCase.expectedProvider}, got ${String(meta['llmProvider'])}.`,
    );
  }

  if (meta['llmModel'] !== testCase.expectedModel) {
    issue(
      'fail',
      'routing',
      'wrong_model',
      `Expected ${testCase.expectedModel}, got ${String(meta['llmModel'])}.`,
    );
  }

  if (meta['llmRoutingReason'] !== testCase.expectedReason) {
    issue(
      'fail',
      'routing',
      'wrong_routing_reason',
      `Expected ${testCase.expectedReason}, got ${String(
        meta['llmRoutingReason'],
      )}.`,
    );
  }

  if (testCase.expectedPolicy) {
    if (meta['llmProviderPolicy'] !== testCase.expectedPolicy) {
      issue(
        'fail',
        'routing',
        'wrong_provider_policy',
        `Expected ${testCase.expectedPolicy}, got ${String(
          meta['llmProviderPolicy'],
        )}.`,
      );
    }
  } else if (meta['llmProviderPolicy'] === 'gemini_only') {
    issue(
      'fail',
      'routing',
      'unexpected_gemini_only_policy',
      'Advanced-model case unexpectedly carried the Gemini-only policy.',
    );
  }

  const persistedRung = meta['escalationRung'];
  if (persistedRung !== testCase.targetRung) {
    issue(
      'fail',
      'routing',
      'wrong_escalation_rung',
      `Expected persisted rung ${testCase.targetRung}, got ${String(
        persistedRung,
      )}.`,
    );
  }

  if (result.envelopeParseFailed) {
    issue(
      'fail',
      'source',
      'envelope_parse_failed',
      `The response envelope failed to parse: ${
        result.envelopeParseFailureReason ?? 'unknown'
      }.`,
      result.response,
    );
  }

  if (!result.sourceAudit) {
    issue(
      'fail',
      'source',
      'source_audit_missing',
      'No source audit returned.',
    );
  } else if (result.sourceAudit.status !== 'ok') {
    issue(
      'fail',
      'source',
      'source_audit_not_ok',
      `Source audit status was ${result.sourceAudit.status}.`,
      result.sourceAudit.reason,
    );
  }

  if (!hasUsefulBayesShape(result.response)) {
    issue(
      'fail',
      'quality',
      'bayes_counts_missing',
      'The answer did not clearly use the 10,000-person base-rate calculation.',
      result.response,
    );
  }

  const wordCount = result.response.split(/\s+/).filter(Boolean).length;
  if (wordCount > 260) {
    issue(
      'warn',
      'quality',
      'long_reply',
      'The answer may be too long for one chat turn.',
      result.response,
    );
  }

  if (!result.response.includes('?')) {
    issue(
      'warn',
      'quality',
      'no_check_question',
      'The answer did not include a short learner check question.',
      result.response,
    );
  }

  return issues;
}

async function runCase(
  db: Database,
  testCase: PremiumRoutingCase,
  runId: string,
): Promise<CaseResult> {
  const email = `${seedEmailPrefix(runId)}${testCase.id}@example.com`;
  console.log(`[${testCase.id}] seeding learning-active`);
  const seed = await seedScenario(db, 'learning-active', email, seedEnv());

  const subjectId = seed.ids['subjectId'];
  if (!subjectId) throw new Error('learning-active did not return subjectId');
  const topicId = await resolveTopicId(db, seed.ids);
  if (!topicId) throw new Error('learning-active did not resolve topicId');

  await updateSeedProfile(db, seed.profileId, subjectId);
  await applyHardTopic(db, topicId);

  const subjectName = await getSubjectName(db, subjectId);
  const topicTitle = await getTopicTitle(db, topicId);
  const session = await startSession(db, seed.profileId, subjectId, {
    subjectId,
    topicId,
    sessionType: 'learning',
    inputMode: 'text',
    rawInput: 'I need serious study help with Bayes theorem.',
    metadata: {
      inputMode: 'text',
      effectiveMode: 'learning',
    },
  });
  await forceEscalationRung(
    db,
    seed.profileId,
    session.id,
    testCase.targetRung,
  );

  console.log(
    `[${testCase.id}] ${testCase.label} (${subjectName} / ${topicTitle})`,
  );
  const started = Date.now();
  const result = await processMessage(
    db,
    seed.profileId,
    session.id,
    {
      message: HARD_PROMPT,
      sessionType: 'learning',
    },
    {
      llmTier: testCase.requestedLlmTier,
      subscriptionTier: testCase.subscriptionTier,
      // [B71] advancedLlmProvider option removed — manual probe no longer
      // forces a provider preference. testCase.advancedProvider is kept on
      // the fixture only for analyzer assertions about expected providers.
      clientId: `${testCase.id}-${runId}`,
      memoryFactsReadEnabled: false,
      memoryFactsRelevanceEnabled: false,
      semanticMemoryRetrievalEnabled: false,
    },
  );
  const aiEvent = await getAiEvent(db, session.id, result.aiEventId);
  const durationMs = Date.now() - started;
  const issues = analyzeCase(testCase, result, aiEvent);

  console.log(
    `[${testCase.id}] ${String(aiEvent.metadata['llmProvider'])}/${String(
      aiEvent.metadata['llmModel'],
    )} tier=${String(aiEvent.metadata['llmTier'])} source=${
      result.sourceAudit?.status ?? 'missing'
    }`,
  );

  return {
    case: testCase,
    email,
    profileId: seed.profileId,
    subjectId,
    subjectName,
    topicId,
    topicTitle,
    sessionId: session.id,
    userMessage: HARD_PROMPT,
    assistant: result.response,
    exchangeCount: result.exchangeCount,
    escalationRung: result.escalationRung,
    aiEventId: result.aiEventId,
    aiEvent,
    sourceAudit: result.sourceAudit,
    envelopeParseFailed: result.envelopeParseFailed,
    envelopeParseFailureReason: result.envelopeParseFailureReason,
    durationMs,
    issues,
  };
}

function renderMarkdown(results: CaseResult[]): string {
  const failures = results.flatMap((result) =>
    result.issues.filter((issue) => issue.severity === 'fail'),
  );
  const warnings = results.flatMap((result) =>
    result.issues.filter((issue) => issue.severity === 'warn'),
  );
  const lines: string[] = [
    '# Premium Routing Pass',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Cases: ${results.length}`,
    `Failures: ${failures.length}`,
    `Warnings: ${warnings.length}`,
    '',
    'This pass uses seeded users and the API session services directly, without the emulator.',
    `OpenAI advanced candidate: ${String(
      results.find((result) => result.case.expectedProvider === 'openai')?.case
        .expectedModel ?? OPENAI_ADVANCED_MODEL,
    )}`,
    '',
    '## Summary',
    '',
    '| Case | Rung | Provider | Model | Tier | Reason | Source audit | Issues |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| ${result.case.id} | ${result.case.targetRung} | ${String(
        result.aiEvent.metadata['llmProvider'],
      )} | ${String(result.aiEvent.metadata['llmModel'])} | ${String(
        result.aiEvent.metadata['llmTier'],
      )} | ${String(result.aiEvent.metadata['llmRoutingReason'])} | ${
        result.sourceAudit?.status ?? 'missing'
      } | ${
        result.issues.length === 0
          ? 'none'
          : result.issues
              .map((issue) => `${issue.severity}/${issue.code}`)
              .join(', ')
      } |`,
    );
  }

  lines.push('', '## Case Details', '');
  for (const result of results) {
    lines.push(
      `### ${result.case.label}`,
      '',
      `- Case: ${result.case.id}`,
      `- Subscription: ${result.case.subscriptionTier}`,
      `- Requested tier: ${result.case.requestedLlmTier}`,
      `- Forced rung: ${result.case.targetRung}`,
      `- Advanced provider: ${result.case.advancedProvider ?? '(none)'}`,
      `- Actual provider/model: ${String(
        result.aiEvent.metadata['llmProvider'],
      )} / ${String(result.aiEvent.metadata['llmModel'])}`,
      `- Actual tier: ${String(result.aiEvent.metadata['llmTier'])}`,
      `- Routing reason: ${String(result.aiEvent.metadata['llmRoutingReason'])}`,
      `- Provider policy: ${String(
        result.aiEvent.metadata['llmProviderPolicy'] ?? '(none)',
      )}`,
      `- Source audit: ${result.sourceAudit?.status ?? '(missing)'}`,
      `- Duration: ${result.durationMs}ms`,
      '',
      `User: ${result.userMessage}`,
      '',
      `Assistant: ${result.assistant}`,
      '',
    );

    if (result.issues.length > 0) {
      lines.push('Issues:', '');
      for (const issue of result.issues) {
        lines.push(
          `- ${issue.severity}/${issue.category}/${issue.code}: ${issue.message}`,
        );
        if (issue.snippet) lines.push(`  Snippet: ${issue.snippet}`);
      }
      lines.push('');
    }
  }

  const plusOpenai = results.find(
    (result) => result.case.id === 'plus-hard-openai',
  );
  const plusAnthropic = results.find(
    (result) => result.case.id === 'plus-hard-anthropic',
  );
  const familyGemini = results.find(
    (result) => result.case.id === 'family-standard-hard',
  );
  if (plusOpenai && plusAnthropic) {
    lines.push(
      '## Premium Candidate Notes',
      '',
      `- GPT candidate: ${String(
        plusOpenai.aiEvent.metadata['llmModel'],
      )} at rung ${plusOpenai.case.targetRung} (${plusOpenai.issues.length} issue(s))`,
      `- Claude candidate: ${String(
        plusAnthropic.aiEvent.metadata['llmModel'],
      )} at rung ${plusAnthropic.case.targetRung} (${plusAnthropic.issues.length} issue(s))`,
      ...(familyGemini
        ? [
            `- Gemini control: ${String(
              familyGemini.aiEvent.metadata['llmModel'],
            )} at rung ${familyGemini.case.targetRung} (${familyGemini.issues.length} issue(s))`,
          ]
        : []),
      '',
      'Use the transcript quality, source audit, and routing metadata together before changing the production default. The OpenAI advanced candidate should remain rung-5-only unless this gate is deliberately updated.',
      '',
    );
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  logLlmRoutingMode();
  if (hasFlag('--help')) {
    console.log(
      [
        'Usage: pnpm test:llm:premium-routing -- [options]',
        '',
        'Options:',
        '  --list-cases',
        '  --cases=plus-hard-openai,family-standard-hard',
        '  --providers=openai,anthropic',
        '  --openai-model=gpt-5.5',
        '  --run-id=<id>',
        '  --results-dir=<path>',
        '  --allow-missing-provider',
        '  --allow-quality-failures',
        '  --skip-seed-cleanup',
      ].join('\n'),
    );
    return;
  }

  const openAIModelOverride = getOpenAIModelOverride();
  const openAIModel = openAIModelOverride ?? OPENAI_ADVANCED_MODEL;
  if (openAIModelOverride) {
    _setOpenAIAdvancedModelForTesting(openAIModelOverride);
  }

  if (hasFlag('--list-cases')) {
    console.log(
      withOpenAIExpectedModel(cases, openAIModel)
        .map(
          (item) =>
            `${item.id}: ${item.label} -> rung ${item.targetRung} ${item.expectedProvider}/${item.expectedModel}/${item.expectedTier}`,
        )
        .join('\n'),
    );
    return;
  }

  const selected = withOpenAIExpectedModel(selectCases(), openAIModel);
  const keys = registerLiveProviders();
  const runnable = requireProviders(selected, keys);
  const db = createDatabase(requireEnv('DATABASE_URL'), {
    cacheNeonPool: false,
  });
  const runId = getRunId();
  const resultsDirArg = getArg('--results-dir=');
  const resultsDir = resultsDirArg
    ? path.resolve(resultsDirArg)
    : path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'tmp',
        'premium-routing',
        'results',
      );
  await mkdir(resultsDir, { recursive: true });

  const results: CaseResult[] = [];
  try {
    if (!hasFlag('--skip-seed-cleanup')) {
      const cleanup = await resetDatabase(db, seedEnv(), {
        prefix: seedEmailPrefix(runId),
      });
      console.log(
        `[cleanup] removed ${cleanup.deletedCount} premium-routing seed account(s) and ${cleanup.clerkUsersDeleted} Clerk user(s)`,
      );
    }

    for (const testCase of runnable) {
      const result = await runCase(db, testCase, runId);
      results.push(result);
      const casePath = path.join(resultsDir, `${runId}-${testCase.id}.json`);
      await writeFile(casePath, JSON.stringify(result, null, 2));
      console.log(`[${testCase.id}] wrote ${casePath}`);
    }

    const allJsonPath = path.join(resultsDir, `${runId}-all.json`);
    const allMdPath = path.join(resultsDir, `${runId}-report.md`);
    const issuesPath = path.join(resultsDir, `${runId}-issues.json`);
    const issues = results.flatMap((result) => result.issues);
    await writeFile(allJsonPath, JSON.stringify(results, null, 2));
    await writeFile(allMdPath, renderMarkdown(results));
    await writeFile(issuesPath, JSON.stringify(issues, null, 2));
    console.log(`[done] wrote ${allJsonPath}`);
    console.log(`[done] wrote ${allMdPath}`);
    console.log(`[done] wrote ${issuesPath}`);

    const blockingFailures = issues.filter(
      (issue) =>
        issue.severity === 'fail' &&
        (issue.category !== 'quality' || !hasFlag('--allow-quality-failures')),
    );
    if (blockingFailures.length > 0) {
      throw new Error(
        `Premium routing pass failed with ${blockingFailures.length} blocking issue(s). See ${allMdPath}`,
      );
    }
  } finally {
    await closeDatabase(db);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
