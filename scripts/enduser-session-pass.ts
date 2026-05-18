import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeDatabase,
  createDatabase,
  curriculumTopics,
  profiles,
  retentionCards,
  sessionEvents,
  subjects,
} from '@eduagent/database';
import { eq } from 'drizzle-orm';

import {
  processMessage,
  startSession,
} from '../apps/api/src/services/session/index';
import type { ExchangeSourceAudit } from '../apps/api/src/services/exchanges';
import {
  _clearProviders,
  createAnthropicProvider,
  createGeminiProvider,
  createOpenAIProvider,
  registerProvider,
} from '../apps/api/src/services/llm/index';
import {
  resetDatabase,
  seedScenario,
  type SeedScenario,
} from '../apps/api/src/services/test-seed';

type Mode = 'freeform' | 'learning' | 'homework' | 'review' | 'recitation';

interface TopicOverride {
  title: string;
  description: string;
}

type QualitySeverity = 'fail' | 'warn';

interface QualityIssue {
  severity: QualitySeverity;
  code: string;
  message: string;
  mode: Mode;
  turnIndex?: number;
  snippet?: string;
}

interface TurnPlan {
  message: string;
  homeworkMode?: 'help_me' | 'check_answer';
}

interface RunDefinition {
  mode: Mode;
  scenario: SeedScenario;
  learnerName: string;
  sessionType: 'learning' | 'homework';
  useTopic: boolean;
  topicOverride?: TopicOverride;
  rawInput?: string;
  turns: (ctx: { subjectName: string; topicTitle?: string }) => TurnPlan[];
}

interface TurnResult {
  index: number;
  user: string;
  assistant: string;
  exchangeCount: number;
  escalationRung: number;
  isUnderstandingCheck: boolean;
  expectedResponseMinutes: number;
  aiEventId?: string;
  homeworkMode?: 'help_me' | 'check_answer';
  envelopeParseFailed?: boolean;
  envelopeParseFailureReason?: string;
  sourceAudit?: ExchangeSourceAudit;
  qualityIssues: QualityIssue[];
  durationMs: number;
}

interface ModeResult {
  mode: Mode;
  scenario: SeedScenario;
  learnerName: string;
  email: string;
  profileId: string;
  subjectId: string;
  subjectName: string;
  topicId?: string;
  topicTitle?: string;
  sessionId: string;
  sessionType: 'learning' | 'homework';
  rawInput?: string;
  startedAt: string;
  completedAt: string;
  turns: TurnResult[];
  qualityIssues: QualityIssue[];
  persistedEvents: Array<{
    eventType: string;
    content: string;
    metadata: unknown;
    createdAt: string;
  }>;
}

const runDefinitions: RunDefinition[] = [
  {
    mode: 'freeform',
    scenario: 'learning-active',
    learnerName: 'Maya',
    sessionType: 'learning',
    useTopic: true,
    topicOverride: {
      title: 'Ancient trade and Rome',
      description:
        'Ancient civilizations traded to get goods they lacked, exchange surplus goods, and build connections with other places. For example, surplus grain or pottery could be traded for metal tools. Rome is an example of an ancient civilization connected to trade across the Mediterranean.',
    },
    rawInput: 'I want help understanding why ancient civilizations traded.',
    turns: () => [
      { message: 'I am curious why ancient civilizations traded so much.' },
      {
        message: 'Can you explain it like I am building the idea from scratch?',
      },
      { message: 'So was trade mostly about things they lacked?' },
      { message: 'Give me a quick example with Rome.' },
      { message: 'What should I remember from this?' },
    ],
  },
  {
    mode: 'learning',
    scenario: 'learning-active',
    learnerName: 'Maya',
    sessionType: 'learning',
    useTopic: true,
    topicOverride: {
      title: 'Roman roads and empire trade',
      description:
        'Roman roads helped armies move between places, connected towns, and made trade easier across the empire.',
    },
    turns: ({ topicTitle }) => [
      {
        message: `I'm ready. Please start teaching me "${topicTitle ?? 'this topic'}" from the beginning.`,
      },
      {
        message:
          'I think empires grow mostly by conquering land. Is that the main idea?',
      },
      { message: 'Can you quiz me with one question?' },
      {
        message:
          'My answer: roads helped move armies and trade, so the empire stayed connected.',
      },
      { message: 'What is the next thing I should practice?' },
    ],
  },
  {
    mode: 'homework',
    scenario: 'homework-ready',
    learnerName: 'Maya',
    sessionType: 'homework',
    useTopic: true,
    topicOverride: {
      title: 'Solving one-variable linear equations',
      description:
        'Use inverse operations to isolate x while keeping both sides balanced.',
    },
    rawInput: 'Algebra homework: linear equations with one variable.',
    turns: () => [
      {
        message: 'I need help solving 3x + 5 = 20.',
        homeworkMode: 'help_me',
      },
      {
        message: 'I think I should subtract 5 first. Is that right?',
        homeworkMode: 'help_me',
      },
      {
        message: 'Then I divide by 3 and get x = 5.',
        homeworkMode: 'check_answer',
      },
      {
        message: 'Can you check this similar one: 2x - 4 = 10, x = 7?',
        homeworkMode: 'check_answer',
      },
      {
        message: 'What mistake should I watch for on these?',
        homeworkMode: 'help_me',
      },
    ],
  },
  {
    mode: 'review',
    scenario: 'retention-due',
    learnerName: 'Maya',
    sessionType: 'learning',
    useTopic: true,
    topicOverride: {
      title: 'Cells as the basic unit of life',
      description:
        'Cells are the basic unit of life: they are the smallest living unit in this review and use inputs to make usable energy for living systems.',
    },
    rawInput: 'Review the due Biology topic with recall first.',
    turns: ({ topicTitle }) => [
      {
        message: `I am ready to review ${topicTitle ?? 'this topic'}. Ask me something first.`,
      },
      { message: 'I remember it has something to do with cells and energy.' },
      { message: 'Can you give me a hint instead of the answer?' },
      {
        message:
          'My answer is that the cell uses a process to turn inputs into usable energy.',
      },
      { message: 'Did I get the important part, or am I missing something?' },
    ],
  },
  {
    mode: 'recitation',
    scenario: 'learning-active',
    learnerName: 'Maya',
    sessionType: 'learning',
    useTopic: true,
    topicOverride: {
      title: 'Roman roads and empire trade',
      description:
        'Roman roads helped armies travel, connected towns, and allowed trade to move faster across the empire.',
    },
    rawInput: 'I want to practice reciting a short history explanation aloud.',
    turns: () => [
      {
        message:
          'I want to recite a short explanation of why Roman roads mattered.',
      },
      {
        message:
          'Roman roads mattered because they connected towns and helped armies travel.',
      },
      { message: 'Can you tell me what was clear and what sounded weak?' },
      {
        message: 'Roman roads also helped trade move faster across the empire.',
      },
      { message: 'Give me one final polished version to try reciting.' },
    ],
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function registerLiveProviders(): void {
  _clearProviders();

  const geminiKey = process.env['GEMINI_API_KEY'];
  const openaiKey = process.env['OPENAI_API_KEY'];
  const anthropicKey = process.env['ANTHROPIC_API_KEY'];

  if (geminiKey) registerProvider(createGeminiProvider(geminiKey));
  if (openaiKey) registerProvider(createOpenAIProvider(openaiKey));
  if (anthropicKey) registerProvider(createAnthropicProvider(anthropicKey));

  if (!geminiKey && !openaiKey && !anthropicKey) {
    throw new Error('At least one LLM provider key is required');
  }
}

function getRunId(): string {
  const fromArg = process.argv.find((arg) => arg.startsWith('--run-id='));
  if (fromArg) return fromArg.slice('--run-id='.length);
  return new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
}

function getRequestedModes(): Mode[] {
  if (
    process.argv.includes('--list-modes') ||
    process.argv.includes('--help')
  ) {
    return [];
  }

  const modeArg = process.argv.find((arg) => arg.startsWith('--modes='));
  if (!modeArg) return runDefinitions.map((definition) => definition.mode);
  const modes = modeArg
    .slice('--modes='.length)
    .split(',')
    .map((mode) => mode.trim())
    .filter(Boolean) as Mode[];
  const knownModes = new Set(
    runDefinitions.map((definition) => definition.mode),
  );
  for (const mode of modes) {
    if (!knownModes.has(mode)) throw new Error(`Unknown mode: ${mode}`);
  }
  return modes;
}

function allowsQualityFailures(): boolean {
  return process.argv.includes('--allow-quality-failures');
}

function usesClerkUsers(): boolean {
  return process.argv.includes('--with-clerk-users');
}

function seedEnv(): { CLERK_SECRET_KEY?: string; SEED_PASSWORD?: string } {
  return {
    CLERK_SECRET_KEY: usesClerkUsers()
      ? process.env['CLERK_SECRET_KEY']
      : undefined,
    SEED_PASSWORD: process.env['SEED_PASSWORD'],
  };
}

function usesMemoryEmbeddings(): boolean {
  return process.argv.includes('--with-memory-embeddings');
}

async function getSubjectName(
  db: ReturnType<typeof createDatabase>,
  subjectId: string,
): Promise<string> {
  const [row] = await db
    .select({ name: subjects.name })
    .from(subjects)
    .where(eq(subjects.id, subjectId))
    .limit(1);
  return row?.name ?? 'Unknown subject';
}

async function resolveTopicId(
  db: ReturnType<typeof createDatabase>,
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

async function updateSeedProfile(
  db: ReturnType<typeof createDatabase>,
  profileId: string,
  learnerName: string,
): Promise<void> {
  await db
    .update(profiles)
    .set({ displayName: learnerName, updatedAt: new Date() })
    .where(eq(profiles.id, profileId));
}

async function applyTopicOverride(
  db: ReturnType<typeof createDatabase>,
  topicId: string | undefined,
  override: TopicOverride | undefined,
): Promise<void> {
  if (!topicId || !override) return;
  await db
    .update(curriculumTopics)
    .set({
      title: override.title,
      description: override.description,
      updatedAt: new Date(),
    })
    .where(eq(curriculumTopics.id, topicId));
}

async function getTopicTitle(
  db: ReturnType<typeof createDatabase>,
  topicId: string | undefined,
): Promise<string | undefined> {
  if (!topicId) return undefined;
  const [row] = await db
    .select({ title: curriculumTopics.title })
    .from(curriculumTopics)
    .where(eq(curriculumTopics.id, topicId))
    .limit(1);
  return row?.title ?? undefined;
}

async function getPersistedEvents(
  db: ReturnType<typeof createDatabase>,
  sessionId: string,
): Promise<ModeResult['persistedEvents']> {
  const rows = await db
    .select({
      eventType: sessionEvents.eventType,
      content: sessionEvents.content,
      metadata: sessionEvents.metadata,
      createdAt: sessionEvents.createdAt,
    })
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, sessionId))
    .orderBy(sessionEvents.createdAt);

  return rows.map((row) => ({
    eventType: row.eventType,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  }));
}

const VISIBLE_ENVELOPE_RE =
  /["']?(signals|ui_hints|private_sources|partial_progress|needs_deepening|understanding_check|note_prompt|post_session|fluency_drill|relied_on|insufficient)["']?\s*:/i;
const SEED_PLACEHOLDER_NAME_RE =
  /\b(?:Active|Homework|Review|Struggling|Test|Transcript) Learner\b/i;
const RECITATION_TEXT_DELIVERY_RE =
  /\b(delivery|pace|confidence|confident|expression|pronunciation)\b/i;
const GENERIC_LEARNER_PRAISE_RE =
  /\b(great job|nice work|great question|(?:really )?good question|great topic|nice,\s+[A-Z][a-z]+|you did a great job|you'?re (?:doing )?(?:amazing|awesome|fantastic|excellent)|(?:amazing|awesome|fantastic|excellent|great|nice) (?:work|job|answer|effort|reasoning|connection)|(?:your|that'?s|this is) (?:amazing|awesome|fantastic|excellent|great|nice))\b/i;
const OVERHEATED_STYLE_RE =
  /\b(super important|incredibly|definitely|absolutely|crucial|very important)\b/i;
const RECITATION_NO_WEAKNESS_RE =
  /\b(nothing (?:that )?sounded weak|wasn'?t anything (?:that )?sounded weak|there (?:was|is)n'?t anything weak|very clear and complete|all the way through)\b/i;
const RECITATION_UNSUPPORTED_POLISH_RE =
  /\b(?:armies|army)\s+(?:could\s+)?travel(?:ed|ing)?\s+quickly\b/i;
const LEARNING_UNSUPPORTED_CONQUEST_CONFIRM_RE =
  /\b(?:you'?re right[^.?!]*conquer|conquering (?:new )?land (?:can|might|may|could) be part|the idea of empires growing by conquering land is a part|empires? grow[^.?!]*conquer|conquer(?:ing|ed)? new (?:areas|land)|defend(?:ing)? (?:land|the land)|conquering land was (?:definitely|a big part|the main))\b/i;
const LEARNING_UNSUPPORTED_SPEED_OR_TERRAIN_RE =
  /\b(?:move(?: around)? quickly|quickly helped|faster|efficiently|more effectively|effectively|muddy?|paved path|forests?)\b/i;
const REVIEW_OFF_ANCHOR_RE =
  /\b(lego|brick|building blocks?|wall|organs?|virus(?:es)?|eat|breathe|reproduc\w*|grow\w*|respond(?:ing)? to its environment|outer boundary|cell membrane|outer layer|stomach|lung|molecules?|atoms?|proteins?|processes of life|function on its own|all by itself|what a cell can do|main jobs?)\b/i;
const CONCRETE_NEXT_PRACTICE_RE =
  /\b(try|practice|explain in one sentence|one-sentence|compare|write|say|answer this|task)\b/i;
const SELF_CHECK_RE = /\b(check|substitut|plug|back into|reverse|undo)\b/i;
const SOURCE_AUDIT_FAIL_STATUSES = new Set([
  'parse_failed',
  'missing_private_sources',
  'unsupported_sources',
  'missing_reliable_source',
]);
const FREEFORM_EXAMPLE_TERMS: Array<{
  response: RegExp;
  source: RegExp;
  label: string;
}> = [
  {
    response: /\bclay\b|\bpots?\b|\bpottery\b/i,
    source: /\bclay\b|\bpots?\b|\bpottery\b/i,
    label: 'pottery/clay',
  },
  {
    response: /\bmetal\b|\btools?\b/i,
    source: /\bmetal\b|\btools?\b/i,
    label: 'metal/tools',
  },
  {
    response: /\bwheat\b|\bgrain\b/i,
    source: /\bwheat\b|\bgrain\b/i,
    label: 'wheat/grain',
  },
  { response: /\bsalt\b/i, source: /\bsalt\b/i, label: 'salt' },
  { response: /\bspices?\b/i, source: /\bspices?\b/i, label: 'spices' },
  { response: /\bsilk\b/i, source: /\bsilk\b/i, label: 'silk' },
  {
    response: /\bolive oil\b|\boil\b/i,
    source: /\bolive oil\b|\boil\b/i,
    label: 'oil',
  },
  { response: /\bwine\b/i, source: /\bwine\b/i, label: 'wine' },
];

function snippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function unsupportedFreeformExample(
  definition: RunDefinition,
  response: string,
): string | undefined {
  const sourceText = [
    definition.topicOverride?.title,
    definition.topicOverride?.description,
  ]
    .filter(Boolean)
    .join(' ');

  return FREEFORM_EXAMPLE_TERMS.find(
    (term) => term.response.test(response) && !term.source.test(sourceText),
  )?.label;
}

function analyzeTurn(input: {
  definition: RunDefinition;
  turnIndex: number;
  response: string;
  envelopeParseFailed?: boolean;
  envelopeParseFailureReason?: string;
  sourceAudit?: ExchangeSourceAudit;
}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const { definition, turnIndex, response } = input;

  if (input.envelopeParseFailed === true) {
    issues.push({
      severity: 'fail',
      code: 'envelope_parse_failed',
      message: `The LLM response did not satisfy the required response envelope (${input.envelopeParseFailureReason ?? 'unknown reason'}).`,
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (!input.sourceAudit) {
    issues.push({
      severity: 'fail',
      code: 'source_audit_missing',
      message:
        'The exchange did not persist a private source audit for complaint review.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  } else if (SOURCE_AUDIT_FAIL_STATUSES.has(input.sourceAudit.status)) {
    issues.push({
      severity: 'fail',
      code: `source_audit_${input.sourceAudit.status}`,
      message:
        'The reply was not backed by a valid private reliable-source trail.',
      mode: definition.mode,
      turnIndex,
      snippet: JSON.stringify({
        status: input.sourceAudit.status,
        reliedOn: input.sourceAudit.reliedOnSourceIds,
        availableReliable: input.sourceAudit.availableReliableSourceIds,
        unsupported: input.sourceAudit.unsupportedSourceIds,
      }),
    });
  } else if (input.sourceAudit.status === 'insufficient_reliable_sources') {
    issues.push({
      severity: 'warn',
      code: 'source_audit_insufficient',
      message:
        'The model marked the turn as lacking enough reliable source support; the reply should ask for source material or stay narrowly grounded.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (VISIBLE_ENVELOPE_RE.test(response)) {
    issues.push({
      severity: 'fail',
      code: 'visible_envelope_leak',
      message:
        'The learner-visible reply appears to contain internal envelope fields.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'recitation' &&
    RECITATION_TEXT_DELIVERY_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'recitation_text_delivery_claim',
      message:
        'Text-only recitation feedback mentioned delivery-style qualities that require voice input.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (SEED_PLACEHOLDER_NAME_RE.test(response)) {
    issues.push({
      severity: 'fail',
      code: 'seed_placeholder_name',
      message:
        'The reply used a seed fixture name instead of the realistic runner profile name.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode !== 'freeform' &&
    GENERIC_LEARNER_PRAISE_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'generic_praise',
      message:
        "The reply used generic praise instead of naming the learner's specific reasoning or next move.",
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (definition.mode !== 'freeform' && OVERHEATED_STYLE_RE.test(response)) {
    issues.push({
      severity: 'fail',
      code: 'overheated_style',
      message:
        'The reply used inflated wording; stronger mentor turns usually explain why the idea matters in concrete terms.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'learning' &&
    turnIndex === 5 &&
    !CONCRETE_NEXT_PRACTICE_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'learning_next_practice_vague',
      message:
        'The learner asked what to practice next, but the reply did not give a concrete practice task.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'learning' &&
    turnIndex === 2 &&
    LEARNING_UNSUPPORTED_CONQUEST_CONFIRM_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'learning_confirmed_unsupported_claim',
      message:
        'The learner made an outside-world claim that was not in the source pack, and the reply confirmed it instead of redirecting to supported topic content.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'learning' &&
    turnIndex <= 2 &&
    LEARNING_UNSUPPORTED_SPEED_OR_TERRAIN_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'learning_unsupported_source_expansion',
      message:
        'The reply added speed, terrain, or historical-detail wording that was not present in the trusted topic source.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (definition.mode === 'freeform') {
    const unsupportedExample = unsupportedFreeformExample(definition, response);
    if (unsupportedExample) {
      issues.push({
        severity: 'fail',
        code: 'freeform_unsupported_example',
        message: `The freeform reply introduced a concrete example (${unsupportedExample}) that was not present in the trusted topic source.`,
        mode: definition.mode,
        turnIndex,
        snippet: snippet(response),
      });
    }
  }

  if (
    definition.mode === 'homework' &&
    turnIndex === 5 &&
    !SELF_CHECK_RE.test(response)
  ) {
    issues.push({
      severity: 'warn',
      code: 'homework_missing_self_check',
      message:
        'The homework mistake-watch reply should include a concrete way to self-check the answer.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'review' &&
    turnIndex >= 2 &&
    REVIEW_OFF_ANCHOR_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'review_off_anchor',
      message:
        "The review reply drifted away from the learner's energy answer into a nearby but different cell subtopic.",
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'recitation' &&
    turnIndex === 5 &&
    RECITATION_UNSUPPORTED_POLISH_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'recitation_polish_added_fact',
      message:
        'The polished recitation added a speed claim to the army point that the learner did not say.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'recitation' &&
    turnIndex === 3 &&
    RECITATION_NO_WEAKNESS_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'recitation_no_concrete_improvement',
      message:
        'The learner asked what sounded weak, but the feedback did not give a concrete improvement to try next.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (response.split(/\s+/).filter(Boolean).length > 180) {
    issues.push({
      severity: 'warn',
      code: 'long_reply',
      message:
        'The reply is long for an in-session mentor turn and may feel heavy in chat.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  return issues;
}

async function runMode(
  db: ReturnType<typeof createDatabase>,
  definition: RunDefinition,
  runId: string,
): Promise<ModeResult> {
  const startedAt = new Date().toISOString();
  const email = `codex-enduser-${definition.mode}-${runId}@example.com`;
  console.log(`[${definition.mode}] seeding ${definition.scenario}`);
  const seed = await seedScenario(db, definition.scenario, email, {
    CLERK_SECRET_KEY: process.env['CLERK_SECRET_KEY'],
    SEED_PASSWORD: process.env['SEED_PASSWORD'],
  });

  const subjectId = seed.ids['subjectId'];
  if (!subjectId) {
    throw new Error(`${definition.scenario} did not return subjectId`);
  }

  const resolvedTopicId = definition.useTopic
    ? await resolveTopicId(db, seed.ids)
    : undefined;
  if (definition.useTopic && !resolvedTopicId) {
    throw new Error(`${definition.scenario} did not resolve a topicId`);
  }

  await updateSeedProfile(db, seed.profileId, definition.learnerName);
  await applyTopicOverride(db, resolvedTopicId, definition.topicOverride);

  const subjectName = await getSubjectName(db, subjectId);
  const topicTitle = await getTopicTitle(db, resolvedTopicId);
  console.log(
    `[${definition.mode}] starting ${definition.sessionType} session for ${subjectName}${topicTitle ? ` / ${topicTitle}` : ''}`,
  );

  const session = await startSession(db, seed.profileId, subjectId, {
    subjectId,
    topicId: resolvedTopicId,
    sessionType: definition.sessionType,
    inputMode: 'text',
    rawInput: definition.rawInput,
    metadata: {
      inputMode: 'text',
      effectiveMode: definition.mode,
      ...(definition.mode === 'homework'
        ? {
            homework: {
              problemCount: 2,
              currentProblemIndex: 0,
              problems: [
                {
                  id: 'p1',
                  text: '3x + 5 = 20',
                  source: 'manual',
                  status: 'active',
                  selectedMode: 'help_me',
                },
                {
                  id: 'p2',
                  text: '2x - 4 = 10',
                  source: 'manual',
                  status: 'pending',
                },
              ],
              ocrText: '3x + 5 = 20\n2x - 4 = 10',
            },
          }
        : {}),
    },
  });

  const turns: TurnResult[] = [];
  const plannedTurns = definition.turns({ subjectName, topicTitle });

  for (let index = 0; index < plannedTurns.length; index += 1) {
    const planned = plannedTurns[index]!;
    console.log(`[${definition.mode}] turn ${index + 1}: ${planned.message}`);
    const turnStarted = Date.now();
    const result = await processMessage(
      db,
      seed.profileId,
      session.id,
      {
        message: planned.message,
        sessionType: definition.sessionType,
        ...(planned.homeworkMode ? { homeworkMode: planned.homeworkMode } : {}),
      },
      {
        llmTier: 'standard',
        subscriptionTier: 'free',
        voyageApiKey: usesMemoryEmbeddings()
          ? process.env['VOYAGE_API_KEY']
          : undefined,
        clientId: `${definition.mode}-${runId}-${index + 1}`,
        memoryFactsReadEnabled: false,
        memoryFactsRelevanceEnabled: false,
        semanticMemoryRetrievalEnabled: usesMemoryEmbeddings(),
      },
    );

    const qualityIssues = analyzeTurn({
      definition,
      turnIndex: index + 1,
      response: result.response,
      envelopeParseFailed: result.envelopeParseFailed,
      envelopeParseFailureReason: result.envelopeParseFailureReason,
      sourceAudit: result.sourceAudit,
    });

    turns.push({
      index: index + 1,
      user: planned.message,
      assistant: result.response,
      exchangeCount: result.exchangeCount,
      escalationRung: result.escalationRung,
      isUnderstandingCheck: result.isUnderstandingCheck,
      expectedResponseMinutes: result.expectedResponseMinutes,
      aiEventId: result.aiEventId,
      homeworkMode: planned.homeworkMode,
      envelopeParseFailed: result.envelopeParseFailed,
      envelopeParseFailureReason: result.envelopeParseFailureReason,
      sourceAudit: result.sourceAudit,
      qualityIssues,
      durationMs: Date.now() - turnStarted,
    });
    for (const issue of qualityIssues) {
      console.log(
        `[${definition.mode}] quality ${issue.severity}/${issue.code} on turn ${index + 1}: ${issue.message}`,
      );
    }
    console.log(
      `[${definition.mode}] turn ${index + 1} reply: ${result.response.replace(/\s+/g, ' ').slice(0, 220)}`,
    );
  }

  const persistedEvents = await getPersistedEvents(db, session.id);
  const qualityIssues = turns.flatMap((turn) => turn.qualityIssues);

  return {
    mode: definition.mode,
    scenario: definition.scenario,
    learnerName: definition.learnerName,
    email,
    profileId: seed.profileId,
    subjectId,
    subjectName,
    topicId: resolvedTopicId,
    topicTitle,
    sessionId: session.id,
    sessionType: definition.sessionType,
    rawInput: definition.rawInput,
    startedAt,
    completedAt: new Date().toISOString(),
    turns,
    qualityIssues,
    persistedEvents,
  };
}

function renderMarkdown(results: ModeResult[]): string {
  const lines: string[] = [
    '# Direct End-User Session Transcripts',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'These runs use seeded users and the API session services directly, without the emulator.',
    '',
  ];

  for (const result of results) {
    lines.push(
      `## ${result.mode}`,
      '',
      `- Seed: ${result.scenario}`,
      `- Learner: ${result.learnerName}`,
      `- Subject: ${result.subjectName}`,
      `- Topic: ${result.topicTitle ?? '(none)'}`,
      `- Session: ${result.sessionId}`,
      '',
    );

    for (const turn of result.turns) {
      lines.push(
        `### Turn ${turn.index}`,
        '',
        `User: ${turn.user}`,
        '',
        `Assistant: ${turn.assistant}`,
        '',
        `Source audit: ${turn.sourceAudit?.status ?? '(missing)'}`,
        '',
      );

      if (turn.qualityIssues.length > 0) {
        lines.push(
          `Quality: ${turn.qualityIssues
            .map((issue) => `${issue.severity}/${issue.code}`)
            .join(', ')}`,
          '',
        );
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

function renderQualityMarkdown(results: ModeResult[]): string {
  const issues = results.flatMap((result) => result.qualityIssues);
  const failures = issues.filter((issue) => issue.severity === 'fail');
  const warnings = issues.filter((issue) => issue.severity === 'warn');
  const lines: string[] = [
    '# End-User Session Quality Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Modes: ${results.map((result) => result.mode).join(', ')}`,
    `Turns: ${results.reduce((sum, result) => sum + result.turns.length, 0)}`,
    `Failures: ${failures.length}`,
    `Warnings: ${warnings.length}`,
    '',
  ];

  if (issues.length === 0) {
    lines.push('No quality issues found.', '');
    return `${lines.join('\n')}\n`;
  }

  for (const issue of issues) {
    lines.push(
      `## ${issue.severity.toUpperCase()} ${issue.code}`,
      '',
      `- Mode: ${issue.mode}`,
      `- Turn: ${issue.turnIndex ?? '(session)'}`,
      `- Message: ${issue.message}`,
    );
    if (issue.snippet) {
      lines.push(`- Snippet: ${issue.snippet}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  if (
    process.argv.includes('--list-modes') ||
    process.argv.includes('--help')
  ) {
    console.log(runDefinitions.map((definition) => definition.mode).join('\n'));
    return;
  }

  registerLiveProviders();
  const db = createDatabase(requireEnv('DATABASE_URL'), {
    cacheNeonPool: false,
  });
  const runId = getRunId();
  const requestedModes = new Set(getRequestedModes());
  const definitions = runDefinitions.filter((definition) =>
    requestedModes.has(definition.mode),
  );

  const resultsDirArg = process.argv.find((arg) =>
    arg.startsWith('--results-dir='),
  );
  const resultsDir = resultsDirArg
    ? path.resolve(resultsDirArg.slice('--results-dir='.length))
    : path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'tmp',
        'enduser-flows',
        'results',
      );
  await mkdir(resultsDir, { recursive: true });

  const results: ModeResult[] = [];
  try {
    if (!process.argv.includes('--skip-seed-cleanup')) {
      const cleanup = await resetDatabase(db, seedEnv(), {
        prefix: 'codex-enduser-',
      });
      console.log(
        `[cleanup] removed ${cleanup.deletedCount} end-user seed account(s) and ${cleanup.clerkUsersDeleted} Clerk user(s)`,
      );
    }

    for (const definition of definitions) {
      const result = await runMode(db, definition, runId);
      results.push(result);
      const modePath = path.join(
        resultsDir,
        `${runId}-${definition.mode}.json`,
      );
      await writeFile(modePath, JSON.stringify(result, null, 2));
      console.log(`[${definition.mode}] wrote ${modePath}`);
    }

    const allJsonPath = path.join(resultsDir, `${runId}-all.json`);
    const allMdPath = path.join(resultsDir, `${runId}-transcripts.md`);
    const qualityJsonPath = path.join(resultsDir, `${runId}-quality.json`);
    const qualityMdPath = path.join(resultsDir, `${runId}-quality.md`);
    const qualityIssues = results.flatMap((result) => result.qualityIssues);
    const failures = qualityIssues.filter((issue) => issue.severity === 'fail');
    await writeFile(allJsonPath, JSON.stringify(results, null, 2));
    await writeFile(allMdPath, renderMarkdown(results));
    await writeFile(qualityJsonPath, JSON.stringify(qualityIssues, null, 2));
    await writeFile(qualityMdPath, renderQualityMarkdown(results));
    console.log(`[done] wrote ${allJsonPath}`);
    console.log(`[done] wrote ${allMdPath}`);
    console.log(`[done] wrote ${qualityJsonPath}`);
    console.log(`[done] wrote ${qualityMdPath}`);

    if (failures.length > 0 && !allowsQualityFailures()) {
      throw new Error(
        `End-user session quality gate failed with ${failures.length} failing issue(s). See ${qualityMdPath}`,
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
