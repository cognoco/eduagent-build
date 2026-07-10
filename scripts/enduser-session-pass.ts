import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeDatabase,
  createDatabase,
  curriculumTopics,
  learningProfiles,
  profiles,
  retentionCards,
  sessionEvents,
  subjects,
  teachingPreferences,
} from '@eduagent/database';
import { eq } from 'drizzle-orm';

import {
  processMessage,
  startSession,
} from '../apps/api/src/services/session/index';
import type {
  ExchangeSourceAudit,
  FluencyDrillAnnotation,
} from '../apps/api/src/services/exchanges';
import {
  _clearProviders,
  createAnthropicProvider,
  createGeminiProvider,
  createOpenAIProvider,
  registerProvider,
  setLlmRoutingV2Enabled,
} from '../apps/api/src/services/llm/index';
import { isLlmRoutingV2Enabled } from '../apps/api/src/config';
import {
  resetDatabase,
  seedScenario,
  type SeedScenario,
} from '../apps/api/src/services/test-seed';

type Mode =
  | 'freeform'
  | 'learning'
  | 'homework'
  | 'review'
  | 'recitation'
  | 'four-strands';
type IssueMode = Mode | 'run';
type AccommodationMode = 'none' | 'short-burst' | 'audio-first' | 'predictable';
type TeachingMethod =
  | 'visual_diagrams'
  | 'step_by_step'
  | 'real_world_examples'
  | 'practice_problems';

interface TopicOverride {
  title: string;
  description: string;
}

type QualitySeverity = 'fail' | 'warn';

interface QualityIssue {
  severity: QualitySeverity;
  code: string;
  message: string;
  mode: IssueMode;
  turnIndex?: number;
  snippet?: string;
}

interface LearnerProfileVariant {
  id: string;
  label: string;
  age: number;
  supportProfile: string;
  accommodationMode: AccommodationMode;
  teachingPreference?: TeachingMethod;
  nativeLanguage?: string;
  analogyDomain?:
    | 'cooking'
    | 'sports'
    | 'building'
    | 'music'
    | 'nature'
    | 'gaming';
  communicationNotes: string[];
  learningStyle?: Record<string, unknown>;
}

interface TurnPlan {
  message: string;
  homeworkMode?: 'help_me' | 'check_answer';
}

interface RunDefinition {
  mode: Mode;
  scenario: SeedScenario;
  learnerName: string;
  learnerProfile: LearnerProfileVariant;
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
  fluencyDrill?: FluencyDrillAnnotation;
  qualityIssues: QualityIssue[];
  durationMs: number;
}

interface ModeResult {
  mode: Mode;
  scenario: SeedScenario;
  learnerName: string;
  learnerProfile: LearnerProfileVariant;
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

function birthYearForAge(age: number): number {
  return new Date().getFullYear() - age;
}

const learnerProfiles = {
  youngerTypical: {
    id: 'younger-typical',
    label: 'younger learner / typical support',
    age: 11,
    supportProfile: 'typical',
    accommodationMode: 'none',
    teachingPreference: 'step_by_step',
    communicationNotes: [
      'Use plain language and keep each turn focused on one idea',
    ],
  },
  shortBurst: {
    id: 'short-burst-support',
    label: 'short-burst support / attention-friendly',
    age: 13,
    supportProfile: 'short-burst',
    accommodationMode: 'short-burst',
    teachingPreference: 'step_by_step',
    communicationNotes: ['Prefers concise steps and one question at a time'],
  },
  olderTypical: {
    id: 'older-typical',
    label: 'older teen / typical support',
    age: 15,
    supportProfile: 'typical',
    accommodationMode: 'none',
    teachingPreference: 'practice_problems',
    communicationNotes: [
      'Likes direct correction and a clear next practice step',
    ],
  },
  predictable: {
    id: 'predictable-support',
    label: 'predictable support / structure-first',
    age: 12,
    supportProfile: 'predictable',
    accommodationMode: 'predictable',
    teachingPreference: 'step_by_step',
    communicationNotes: [
      'Benefits from literal wording and predictable structure',
    ],
  },
  olderConcise: {
    id: 'older-concise',
    label: 'older teen / concise spoken practice',
    age: 17,
    supportProfile: 'concise',
    accommodationMode: 'none',
    teachingPreference: 'practice_problems',
    communicationNotes: [
      'Prefers concise feedback and a model answer to practice',
    ],
  },
  languageFourStrands: {
    id: 'language-four-strands',
    label: 'older teen / four-strands language learner',
    age: 17,
    supportProfile: 'language-four-strands',
    accommodationMode: 'none',
    teachingPreference: 'practice_problems',
    nativeLanguage: 'English',
    communicationNotes: [
      'Wants direct correction, useful input, target-language output, and brisk fluency practice',
    ],
  },
} satisfies Record<string, LearnerProfileVariant>;

const runDefinitions: RunDefinition[] = [
  {
    mode: 'freeform',
    scenario: 'learning-active',
    learnerName: 'Maya',
    learnerProfile: learnerProfiles.youngerTypical,
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
    learnerProfile: learnerProfiles.shortBurst,
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
    learnerProfile: learnerProfiles.olderTypical,
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
    learnerProfile: learnerProfiles.predictable,
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
    learnerProfile: learnerProfiles.olderConcise,
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
  {
    mode: 'four-strands',
    scenario: 'language-subject-active',
    learnerName: 'Maya',
    learnerProfile: learnerProfiles.languageFourStrands,
    sessionType: 'learning',
    useTopic: true,
    topicOverride: {
      title: 'Spanish connectors for opinions',
      description:
        'Practice Spanish connectors for opinions: "en mi opinión" means "in my opinion", "porque" means "because", "pero" means "but", "y" means "and", and "entonces" means "then/so". Use them to build short connected sentences about studying.',
    },
    rawInput:
      'Spanish practice using Four Strands: I need useful input, output practice, direct grammar correction, and a short fluency drill with connectors.',
    turns: () => [
      {
        message:
          'I want to practice Spanish connectors for giving opinions. Start with a tiny example I can understand.',
      },
      {
        message: 'Mi opinión, estudiar es útil porque ayuda, pero es difícil.',
      },
      {
        message:
          'Can you explain the mistake quickly in English, then give me one retry sentence?',
      },
      {
        message:
          'En mi opinión, estudiar es útil porque ayuda, pero es difícil.',
      },
      {
        message:
          'Can we do a 30 second fluency drill with porque, pero, and entonces?',
      },
    ],
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// WI-1685: thread the V2 routing cutover flag into the pure router module the
// same way production does (apps/api/src/middleware/llm.ts), so a staging
// gate run with LLM_ROUTING_V2_ENABLED=true actually exercises V2 routing
// instead of silently validating the legacy path. Logged so a run's output
// is self-evidencing about which path it validated.
function logLlmRoutingMode(): void {
  const v2Enabled = isLlmRoutingV2Enabled(
    process.env['LLM_ROUTING_V2_ENABLED'],
  );
  setLlmRoutingV2Enabled(v2Enabled);
  console.log(`LLM routing: ${v2Enabled ? 'v2' : 'legacy'}`);
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

function seedEmailPrefix(runId: string): string {
  return `codex-llm-pass-${runId}-`;
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
  subjectId: string,
  learnerName: string,
  learnerProfile: LearnerProfileVariant,
): Promise<void> {
  await db
    .update(profiles)
    .set({
      displayName: learnerName,
      birthYear: birthYearForAge(learnerProfile.age),
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, profileId));

  await db
    .insert(learningProfiles)
    .values({
      profileId,
      learningStyle: learnerProfile.learningStyle ?? null,
      communicationNotes: learnerProfile.communicationNotes,
      accommodationMode: learnerProfile.accommodationMode,
      memoryConsentStatus: 'granted',
      memoryEnabled: true,
      memoryInjectionEnabled: true,
      memoryCollectionEnabled: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: learningProfiles.profileId,
      set: {
        learningStyle: learnerProfile.learningStyle ?? null,
        communicationNotes: learnerProfile.communicationNotes,
        accommodationMode: learnerProfile.accommodationMode,
        memoryConsentStatus: 'granted',
        memoryEnabled: true,
        memoryInjectionEnabled: true,
        memoryCollectionEnabled: false,
        updatedAt: new Date(),
      },
    });

  if (learnerProfile.teachingPreference) {
    await db
      .insert(teachingPreferences)
      .values({
        profileId,
        subjectId,
        method: learnerProfile.teachingPreference,
        analogyDomain: learnerProfile.analogyDomain ?? null,
        nativeLanguage: learnerProfile.nativeLanguage ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [teachingPreferences.profileId, teachingPreferences.subjectId],
        set: {
          method: learnerProfile.teachingPreference,
          analogyDomain: learnerProfile.analogyDomain ?? null,
          nativeLanguage: learnerProfile.nativeLanguage ?? null,
          updatedAt: new Date(),
        },
      });
  }
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
  /(?:\b(great job|nice work|nice one|great question|(?:really )?good question|great topic|great idea|great observation|great summary|good start|good grasp|nice,\s+[A-Z][a-z]+|bien hecho,\s+[A-Z][a-z]+|you did a great job|you'?re (?:doing )?(?:amazing|awesome|fantastic|excellent)|(?:amazing|awesome|fantastic|excellent|great|nice) (?:work|job|answer|effort|reasoning|connection|observation|summary)|(?:your|that'?s|this is) (?:amazing|awesome|fantastic|excellent|great|nice))\b|\b(?:nice|perfecto|perfect|bien hecho)[!,])/i;
const MALFORMED_CLEANUP_RE =
  /\bthat'?s a the\b|\bthat'?s\s+(?:there'?s|here'?s|so\b)|(?:^|\n)\s*that'?s\s*(?=\n|$)/i;
const RECITATION_SETUP_PREMATURE_MODEL_RE =
  /\b(?:you could say|to actually recite|polished version|final version|model answer)\b/i;
const OVERHEATED_STYLE_RE =
  /\b(super important|super useful|incredibly|definitely|absolutely|crucial|very important|really important)\b/i;
const CHILDISH_TONE_RE = /\b(yummy|kiddo)\b/i;
const RECITATION_NO_WEAKNESS_RE =
  /\b(nothing (?:that )?sounded weak|wasn'?t anything (?:that )?sounded weak|there (?:was|is)n'?t anything weak|very clear and complete|all the way through)\b/i;
const RECITATION_UNSUPPORTED_POLISH_RE =
  /\b(?:armies|army)\s+(?:could\s+)?travel(?:ed|ing)?\s+quickly\b|\btrade\b[^.?!]*\bfaster\b|\bfaster\b[^.?!]*\btrade\b/i;
const LEARNING_UNSUPPORTED_CONQUEST_CONFIRM_RE =
  /\b(?:it'?s true[^.?!]*(?:empires?|conquer|conquering|expand)|you'?re right[^.?!]*conquer|(?:good observation|interesting (?:idea|thought))[^.?!]*empires? (?:can )?(?:grow|expand)|that'?s an idea about how empires? might grow|conquering (?:new )?land (?:can|might|may|could) be part|the idea of empires growing by conquering land is a part|empires? (?:can |could |might |may |often )?(?:grow|expand)[^.?!]*conquer|empires? often expand by conquering|conquer(?:ing|ed)? new (?:areas|land)|defend(?:ing)? (?:land|the land)|conquering land was (?:definitely|a big part|the main))\b/i;
const LEARNING_UNSUPPORTED_SPEED_OR_TERRAIN_RE =
  /\b(?:(?:arm(?:y|ies)|soldiers?|military)[^.?!]*(?:quickly|faster|efficiently|more effectively|effectively)|(?:quickly|faster|efficiently|more effectively|effectively)[^.?!]*(?:arm(?:y|ies)|soldiers?|military)|move(?: around)? quickly|quickly helped|faster|efficiently|more effectively|effectively|muddy?|paved path|forests?)\b/i;
const LEARNING_UNSUPPORTED_BROAD_EASE_RE =
  /\b(?:made|make|makes|making)\s+(?:things|everything|life|it)\s+easier\s+for\s+(?:the\s+)?empire\b|\b(?:things|everything|life|it)\s+(?:easier)\s+for\s+(?:the\s+)?empire\b/i;
const LEARNING_UNSUPPORTED_EMPIRE_GROWTH_RE =
  /\b(?:empires? (?:can |could |might |may |often )?(?:grow|expand)|empires? expand[^.?!]*(?:often|armies?|army|conquer)|often involves armies?|help(?:ed|s|ing)? the empire (?:grow|stay strong)|empire (?:can |could |might |may |often )?(?:grow|stay strong)|stay strong)\b/i;
const CELL_AUTONOMY_SOURCE_BOUND_RE =
  /\b(?:cells?|cell)\b[^.?!]{0,120}\b(?:can do on its own|what a cell can do|all by itself)\b|\b(?:can do on its own|what a cell can do|all by itself)\b[^.?!]{0,120}\b(?:cells?|cell)\b/i;
const REVIEW_OFF_ANCHOR_RE =
  /\b(lego|brick|building blocks?|fundamental piece|important function|what a cell is|size and status|wall|organs?|virus(?:es)?|eat|breathe|reproduc\w*|grow\w*|respond(?:ing)? to its environment|outer boundary|cell membrane|outer layer|stomach|lung|molecules?|atoms?|proteins?|processes of life|function on its own|can do on its own|all by itself|what a cell can do|main jobs?)\b/i;
const REVIEW_CHALLENGE_MODE_RE =
  /\b(?:quick check[^.?!]*try to trip you up|some scientists claim|devil'?s advocate)\b/i;
const CONCRETE_NEXT_PRACTICE_RE =
  /\b(try|practice|explain in one sentence|one-sentence|compare|write|say|answer this|task)\b/i;
const FUTURE_TOPIC_TITLE_RE =
  /\b(?:World History|Biology|Algebra) Topic \d+\b/i;
const SELF_CHECK_RE = /\b(check|substitut|plug|back into|reverse|undo)\b/i;
const FOUR_STRANDS_TARGET_LANGUAGE_RE =
  /\b(?:en mi opini[oó]n|porque|pero|entonces|estudiar|[uú]til|dif[ií]cil)\b/i;
const FOUR_STRANDS_SPANISH_EXAMPLE_RE =
  /\b(?:en mi opini[oó]n|estudiar)\b[^.?!]*(?:porque|pero|entonces)|(?:porque|pero|entonces)[^.?!]*\b(?:en mi opini[oó]n|estudiar)\b/i;
const FOUR_STRANDS_OUTPUT_PROMPT_RE =
  /\b(?:try|retry|write|say|make|give me|your turn|repeat|answer)\b[^.?!]*(?:Spanish|sentence|frase|oraci[oó]n|porque|pero|entonces|en mi opini[oó]n)/i;
const FOUR_STRANDS_CORRECTION_RE = /\ben mi opini[oó]n\b/i;
const FOUR_STRANDS_EXPLAINS_EN_RE =
  /\b(?:missing|need|needs|use|uses|add|adds)\b[^.?!]*\ben\b|\ben\b[^.?!]*(?:before|in front of|with)\s+(?:mi opini[oó]n|opini[oó]n)/i;
const FOUR_STRANDS_FLUENCY_RE =
  /\b(?:fluency|30\s*(?:second|s|sec)|timer|timed|as many|quick)\b/i;
const LEARNING_SOURCE_POINT_RE = [
  /\barm(?:y|ies)\b[^.?!]*\bmove\b|\bmove\b[^.?!]*\barm(?:y|ies)\b/i,
  /\bconnect(?:ed|s|ing)?\b[^.?!]*\btowns?\b|\btowns?\b[^.?!]*\bconnect(?:ed|s|ing)?\b/i,
  /\btrade\b[^.?!]*\beasier\b|\beasier\b[^.?!]*\btrade\b/i,
] as const;
const SOURCE_AUDIT_FAIL_STATUSES = new Set([
  'parse_failed',
  'missing_private_sources',
  'unsupported_sources',
  'missing_reliable_source',
]);
const SOURCE_BOUND_TRIPWIRE_TERMS: Array<{
  response: RegExp;
  source: RegExp;
  label: string;
}> = [
  {
    response:
      /\b(?:arm(?:y|ies)|soldiers?|military)\b[^,.;?!]*(?:easy|easily|more easily|easier|effective(?:ly)?|efficient(?:ly)?|faster|quickly)|(?:easy|easily|more easily|easier|effective(?:ly)?|efficient(?:ly)?|faster|quickly)[^,.;?!]*\b(?:arm(?:y|ies)|soldiers?|military)\b/i,
    source:
      /\b(?:arm(?:y|ies)|soldiers?|military)\b[^,.;?!]*(?:easy|easily|more easily|easier|effective(?:ly)?|efficient(?:ly)?|faster|quickly)|(?:easy|easily|more easily|easier|effective(?:ly)?|efficient(?:ly)?|faster|quickly)[^,.;?!]*\b(?:arm(?:y|ies)|soldiers?|military)\b/i,
    label: 'army speed/ease/effectiveness',
  },
  {
    response:
      /\bconquer(?:ing|ed)?\b|\bconquest\b|\bempires?\s+(?:(?:can|could|might|may|often)\s+)?(?:grow|grew|expand|expanded|stay strong)\b|\bempire\s+(?:(?:can|could|might|may|often)\s+)?(?:grow|grew|expand|expanded|stay strong)\b/i,
    source:
      /\bconquer(?:ing|ed)?\b|\bconquest\b|\bempires?\s+(?:(?:can|could|might|may|often)\s+)?(?:grow|grew|expand|expanded|stay strong)\b|\bempire\s+(?:(?:can|could|might|may|often)\s+)?(?:grow|grew|expand|expanded|stay strong)\b/i,
    label: 'conquest/empire growth',
  },
  {
    response:
      /\bbricks?\b|\bhouse\b|\bbuilding blocks?\b|\bfundamental piece\b/i,
    source: /\bbricks?\b|\bhouse\b|\bbuilding blocks?\b|\bfundamental piece\b/i,
    label: 'unsupported analogy',
  },
  {
    response: CELL_AUTONOMY_SOURCE_BOUND_RE,
    source: CELL_AUTONOMY_SOURCE_BOUND_RE,
    label: 'cell autonomy phrase',
  },
  {
    response: /\bbaskets?\b/i,
    source: /\bbaskets?\b/i,
    label: 'unsupported concrete example',
  },
  {
    response:
      /\bspecial pathways?\b|\bbuilt long ago\b|\b(?:was|were) built\b|\bbuilt to\b|\bancient times\b|\bvillages?\b/i,
    source:
      /\bspecial pathways?\b|\bbuilt long ago\b|\b(?:was|were) built\b|\bbuilt to\b|\bancient times\b|\bvillages?\b/i,
    label: 'unsupported historical framing',
  },
  {
    response: /\brich soil\b|\bsoil\b/i,
    source: /\brich soil\b|\bsoil\b/i,
    label: 'unsupported land/soil detail',
  },
];
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
  {
    response: /\bbricks?\b|\bhouse\b/i,
    source: /\bbricks?\b|\bhouse\b/i,
    label: 'brick/house analogy',
  },
  { response: /\bbaskets?\b/i, source: /\bbaskets?\b/i, label: 'baskets' },
];

function snippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function qualityPatternText(text: string): string {
  return text.replace(/[*_`]/g, '');
}

function trustedSourceTextForDefinition(definition: RunDefinition): string {
  return [
    definition.topicOverride?.title,
    definition.topicOverride?.description,
    definition.rawInput,
  ]
    .filter(Boolean)
    .join(' ');
}

function unsupportedSourceBoundFact(
  definition: RunDefinition,
  response: string,
): string | undefined {
  const sourceText = trustedSourceTextForDefinition(definition);
  if (!sourceText) return undefined;

  return SOURCE_BOUND_TRIPWIRE_TERMS.find(
    (term) => term.response.test(response) && !term.source.test(sourceText),
  )?.label;
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
  fluencyDrill?: FluencyDrillAnnotation;
}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const { definition, turnIndex, response } = input;
  const patternResponse = qualityPatternText(response);

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

  const unsupportedSourceBound = unsupportedSourceBoundFact(
    definition,
    response,
  );
  if (unsupportedSourceBound) {
    issues.push({
      severity: 'fail',
      code: 'unsupported_source_bound_fact',
      message: `The reply introduced source-bound factual detail (${unsupportedSourceBound}) that is not present in the trusted source text for this scenario.`,
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

  if (GENERIC_LEARNER_PRAISE_RE.test(response)) {
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

  if (MALFORMED_CLEANUP_RE.test(response)) {
    issues.push({
      severity: 'fail',
      code: 'malformed_cleanup_text',
      message:
        'The learner-visible reply contains malformed cleanup text that reads like a broken sentence.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (OVERHEATED_STYLE_RE.test(response)) {
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

  if (CHILDISH_TONE_RE.test(response)) {
    issues.push({
      severity: 'fail',
      code: 'childish_tone',
      message:
        'The reply used cute/childish wording; the mentor should stay warm without sounding babyish.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'learning' &&
    turnIndex === 1 &&
    LEARNING_SOURCE_POINT_RE.filter((pattern) => pattern.test(response))
      .length < 2
  ) {
    issues.push({
      severity: 'fail',
      code: 'learning_opening_too_thin',
      message:
        'The first learning turn should teach at least two source-supported points before checking understanding.',
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
    turnIndex === 5 &&
    FUTURE_TOPIC_TITLE_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'learning_next_practice_future_topic',
      message:
        'The learner asked what to practice next, but the reply sent them to a future topic instead of giving a current-topic practice task.',
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
    (LEARNING_UNSUPPORTED_SPEED_OR_TERRAIN_RE.test(response) ||
      LEARNING_UNSUPPORTED_BROAD_EASE_RE.test(response))
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

  if (
    definition.mode === 'learning' &&
    LEARNING_UNSUPPORTED_EMPIRE_GROWTH_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'learning_unsupported_empire_growth',
      message:
        'The reply added empire-growth, strength, or army-expansion wording that was not present in the trusted topic source.',
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

  if (definition.mode === 'review' && REVIEW_CHALLENGE_MODE_RE.test(response)) {
    issues.push({
      severity: 'fail',
      code: 'review_challenge_mode_leak',
      message:
        "The review flow leaked Devil's Advocate/challenge-mode behavior instead of staying in calibrated recall and relearning.",
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'recitation' &&
    turnIndex === 1 &&
    RECITATION_SETUP_PREMATURE_MODEL_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'recitation_setup_gave_model_answer',
      message:
        'The recitation setup turn should invite the learner to recite first, not provide the answer before hearing them.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'recitation' &&
    turnIndex >= 4 &&
    RECITATION_UNSUPPORTED_POLISH_RE.test(response)
  ) {
    issues.push({
      severity: 'fail',
      code: 'recitation_polish_added_fact',
      message:
        'The recitation feedback or polished version carried an unsupported speed claim instead of staying within source-supported wording.',
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

  if (
    definition.mode === 'four-strands' &&
    turnIndex === 2 &&
    (!FOUR_STRANDS_CORRECTION_RE.test(patternResponse) ||
      !FOUR_STRANDS_EXPLAINS_EN_RE.test(patternResponse))
  ) {
    issues.push({
      severity: 'fail',
      code: 'four_strands_missing_direct_correction',
      message:
        'The learner made a connector error, but the reply did not clearly correct it to "en mi opinión" and explain the missing "en".',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'four-strands' &&
    turnIndex === 5 &&
    input.fluencyDrill?.active !== true
  ) {
    issues.push({
      severity: 'fail',
      code: 'four_strands_missing_fluency_drill_signal',
      message:
        'The learner asked for a timed fluency drill, but the response envelope did not activate ui_hints.fluency_drill.',
      mode: definition.mode,
      turnIndex,
      snippet: snippet(response),
    });
  }

  if (
    definition.mode === 'four-strands' &&
    turnIndex === 5 &&
    !FOUR_STRANDS_FLUENCY_RE.test(patternResponse)
  ) {
    issues.push({
      severity: 'fail',
      code: 'four_strands_fluency_reply_not_timed',
      message:
        'The fluency turn should be visibly framed as a short timed fluency activity.',
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
  const email = `${seedEmailPrefix(runId)}${definition.mode}@example.com`;
  console.log(`[${definition.mode}] seeding ${definition.scenario}`);
  const seed = await seedScenario(db, definition.scenario, email, seedEnv());

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

  await updateSeedProfile(
    db,
    seed.profileId,
    subjectId,
    definition.learnerName,
    definition.learnerProfile,
  );
  await applyTopicOverride(db, resolvedTopicId, definition.topicOverride);

  const subjectName = await getSubjectName(db, subjectId);
  const topicTitle = await getTopicTitle(db, resolvedTopicId);
  console.log(
    `[${definition.mode}] starting ${definition.sessionType} session for ${subjectName}${topicTitle ? ` / ${topicTitle}` : ''} (${definition.learnerProfile.label}, age ${definition.learnerProfile.age})`,
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

  for (const [index, planned] of plannedTurns.entries()) {
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
      fluencyDrill: result.fluencyDrill,
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
      fluencyDrill: result.fluencyDrill,
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
    learnerProfile: definition.learnerProfile,
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
      `- Learner profile: ${result.learnerProfile.label} (age ${result.learnerProfile.age}, support ${result.learnerProfile.supportProfile}, accommodation ${result.learnerProfile.accommodationMode})`,
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
        `Fluency drill: ${
          turn.fluencyDrill ? JSON.stringify(turn.fluencyDrill) : '(not active)'
        }`,
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

function analyzeRunProfileCoverage(results: ModeResult[]): QualityIssue[] {
  if (results.length < runDefinitions.length) return [];

  const ages = new Set(results.map((result) => result.learnerProfile.age));
  const accommodations = new Set(
    results.map((result) => result.learnerProfile.accommodationMode),
  );
  const supportProfiles = new Set(
    results.map((result) => result.learnerProfile.supportProfile),
  );
  const issues: QualityIssue[] = [];

  if (ages.size < 3) {
    issues.push({
      severity: 'fail',
      code: 'learner_age_rotation_missing',
      message:
        'The full end-user pass should rotate learner ages instead of exercising one age voice only.',
      mode: 'run',
      snippet: [...ages].join(', '),
    });
  }

  for (const required of ['none', 'short-burst', 'predictable'] as const) {
    if (!accommodations.has(required)) {
      issues.push({
        severity: 'fail',
        code: 'learner_accommodation_rotation_missing',
        message: `The full end-user pass should include the ${required} support profile.`,
        mode: 'run',
        snippet: [...accommodations].join(', '),
      });
    }
  }

  if (supportProfiles.size < 3) {
    issues.push({
      severity: 'fail',
      code: 'learner_support_rotation_missing',
      message:
        'The full end-user pass should cover typical, short-burst, and predictable learner-support profiles.',
      mode: 'run',
      snippet: [...supportProfiles].join(', '),
    });
  }

  return issues;
}

function analyzeFourStrandsCoverage(results: ModeResult[]): QualityIssue[] {
  const result = results.find((item) => item.mode === 'four-strands');
  if (!result) return [];

  const issues: QualityIssue[] = [];
  const replies = result.turns.map((turn) =>
    qualityPatternText(turn.assistant),
  );
  const targetLanguageTurns = replies.filter((reply) =>
    FOUR_STRANDS_TARGET_LANGUAGE_RE.test(reply),
  ).length;
  const hasMeaningFocusedInput = replies.some((reply) =>
    FOUR_STRANDS_SPANISH_EXAMPLE_RE.test(reply),
  );
  const hasMeaningFocusedOutput = replies.some((reply) =>
    FOUR_STRANDS_OUTPUT_PROMPT_RE.test(reply),
  );
  const hasLanguageFocusedLearning = result.turns.some(
    (turn) =>
      turn.index >= 2 &&
      FOUR_STRANDS_CORRECTION_RE.test(qualityPatternText(turn.assistant)) &&
      FOUR_STRANDS_EXPLAINS_EN_RE.test(qualityPatternText(turn.assistant)),
  );
  const hasFluencyDevelopment = result.turns.some(
    (turn) => turn.fluencyDrill?.active === true,
  );

  if (targetLanguageTurns < 3) {
    issues.push({
      severity: 'fail',
      code: 'four_strands_target_language_too_sparse',
      message:
        'The Four Strands session should keep Spanish visible across the conversation, not turn into English-only coaching.',
      mode: 'four-strands',
      snippet: `Spanish-visible turns: ${targetLanguageTurns}`,
    });
  }

  if (!hasMeaningFocusedInput) {
    issues.push({
      severity: 'fail',
      code: 'four_strands_missing_meaning_input',
      message:
        'The Four Strands session did not include a comprehensible target-language example for meaning-focused input.',
      mode: 'four-strands',
    });
  }

  if (!hasMeaningFocusedOutput) {
    issues.push({
      severity: 'fail',
      code: 'four_strands_missing_meaning_output',
      message:
        'The Four Strands session did not prompt the learner to produce a target-language sentence or retry.',
      mode: 'four-strands',
    });
  }

  if (!hasLanguageFocusedLearning) {
    issues.push({
      severity: 'fail',
      code: 'four_strands_missing_language_focus',
      message:
        'The Four Strands session did not clearly explain the connector form after the learner error.',
      mode: 'four-strands',
    });
  }

  if (!hasFluencyDevelopment) {
    issues.push({
      severity: 'fail',
      code: 'four_strands_missing_fluency_development',
      message:
        'The Four Strands session did not activate a fluency drill during the timed-practice turn.',
      mode: 'four-strands',
    });
  }

  return issues;
}

function renderQualityMarkdown(
  results: ModeResult[],
  extraIssues: QualityIssue[] = [],
): string {
  const issues = [
    ...results.flatMap((result) => result.qualityIssues),
    ...extraIssues,
  ];
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
  logLlmRoutingMode();
  if (
    process.argv.includes('--list-modes') ||
    process.argv.includes('--help')
  ) {
    console.log(runDefinitions.map((definition) => definition.mode).join('\n'));
    return;
  }
  if (process.argv.includes('--list-learner-profiles')) {
    console.log(
      Object.values(learnerProfiles)
        .map(
          (profile) =>
            `${profile.id}: age ${profile.age}, support ${profile.supportProfile}, accommodation ${profile.accommodationMode}`,
        )
        .join('\n'),
    );
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
        prefix: seedEmailPrefix(runId),
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
    const runQualityIssues = [
      ...analyzeRunProfileCoverage(results),
      ...analyzeFourStrandsCoverage(results),
    ];
    const qualityIssues = [
      ...results.flatMap((result) => result.qualityIssues),
      ...runQualityIssues,
    ];
    const failures = qualityIssues.filter((issue) => issue.severity === 'fail');
    await writeFile(allJsonPath, JSON.stringify(results, null, 2));
    await writeFile(allMdPath, renderMarkdown(results));
    await writeFile(qualityJsonPath, JSON.stringify(qualityIssues, null, 2));
    await writeFile(
      qualityMdPath,
      renderQualityMarkdown(results, runQualityIssues),
    );
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
