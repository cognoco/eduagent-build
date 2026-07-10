import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  BookGenerationResult,
  BookTopicGenerationResult,
  GeneratedBook,
  GeneratedBookTopic,
  GeneratedConnection,
  GeneratedTopic,
} from '@eduagent/schemas';

import {
  detectSubjectType,
  generateBookTopics,
} from '../apps/api/src/services/book-generation';
import { areEquivalentBookTitles } from '../apps/api/src/services/curriculum';
import {
  _clearProviders,
  createAnthropicProvider,
  createGeminiProvider,
  createOpenAIProvider,
  registerProvider,
  setLlmRoutingV2Enabled,
} from '../apps/api/src/services/llm/index';
import { isLlmRoutingV2Enabled } from '../apps/api/src/config';
import { buildCurrentTopicMapContext } from '../apps/api/src/services/session/session-context-builders';

type IssueSeverity = 'fail' | 'warn';
type IssueCategory =
  | 'schema'
  | 'quality'
  | 'topic-map'
  | 'source-safety'
  | 'routing';

interface QualityIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  code: string;
  message: string;
  caseId: string;
  snippet?: string;
}

interface SubjectStructureCase {
  kind: 'subject-structure';
  id: string;
  label: string;
  subjectName: string;
  learnerAge: number;
  expectedType: BookGenerationResult['type'];
}

interface BookTopicsCase {
  kind: 'book-topics';
  id: string;
  label: string;
  subjectName: string;
  bookTitle: string;
  bookDescription: string;
  learnerAge: number;
  priorKnowledge?: string;
  requiredAnyTerms?: Array<{
    label: string;
    terms: string[];
    severity?: IssueSeverity;
  }>;
}

type RunnerCase = SubjectStructureCase | BookTopicsCase;

interface RegisteredKeys {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
}

interface BaseCaseResult {
  case: RunnerCase;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  issues: QualityIssue[];
  error?: string;
}

interface SubjectStructureResult extends BaseCaseResult {
  kind: 'subject-structure';
  result?: BookGenerationResult;
}

interface BookTopicsResult extends BaseCaseResult {
  kind: 'book-topics';
  result?: BookTopicGenerationResult;
  topicMapPreview?: string;
}

type CaseResult = SubjectStructureResult | BookTopicsResult;

const cases: RunnerCase[] = [
  {
    kind: 'subject-structure',
    id: 'broad-history-age-12',
    label: 'Broad school subject creates book-level curriculum',
    subjectName: 'History',
    learnerAge: 12,
    expectedType: 'broad',
  },
  {
    kind: 'subject-structure',
    id: 'narrow-fractions-age-11',
    label: 'Narrow math subject creates a direct topic path',
    subjectName: 'Fractions',
    learnerAge: 11,
    expectedType: 'narrow',
  },
  {
    kind: 'book-topics',
    id: 'spanish-connectors-age-17',
    label: 'Language book produces usable Four Strands-adjacent topic map',
    subjectName: 'Spanish',
    bookTitle: 'Spanish Connectors for Opinions',
    bookDescription:
      'Use porque, pero, entonces, and en mi opinion in short spoken answers.',
    learnerAge: 17,
    priorKnowledge:
      'I can say simple sentences like estudiar es util, but I need connectors and correction.',
    requiredAnyTerms: [
      {
        label: 'Spanish connector coverage',
        terms: ['porque', 'pero', 'entonces', 'opinion', 'opinión'],
      },
      {
        label: 'language practice framing',
        terms: ['speak', 'spoken', 'sentence', 'sentences', 'practice'],
        severity: 'warn',
      },
    ],
  },
  {
    kind: 'book-topics',
    id: 'world-war-one-causes-age-15',
    label: 'Serious history book stays sequenced and cautious',
    subjectName: 'History',
    bookTitle: 'Causes of World War I',
    bookDescription:
      'A careful study path for understanding alliance systems, nationalism, imperialism, militarism, and the July Crisis.',
    learnerAge: 15,
  },
  {
    kind: 'book-topics',
    id: 'human-biology-age-18',
    label: 'Adult learner biology book avoids childish naming',
    subjectName: 'Biology',
    bookTitle: 'Human Biology',
    bookDescription:
      'Body systems, homeostasis, health, and evidence-based biological reasoning.',
    learnerAge: 18,
  },
  {
    kind: 'book-topics',
    id: 'photosynthesis-age-12',
    label: 'Middle-school science book builds a coherent topic map',
    subjectName: 'Biology',
    bookTitle: 'Photosynthesis',
    bookDescription:
      'How plants use light, water, and carbon dioxide to make sugars and release oxygen.',
    learnerAge: 12,
    priorKnowledge: 'I know plants need sunlight, but I do not know why.',
  },
];

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

function allowsQualityFailures(): boolean {
  return hasFlag('--allow-quality-failures');
}

function getCaseRetries(): number {
  const raw = getArg('--case-retries=');
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGenerationError(message: string | undefined): boolean {
  if (!message) return false;
  return /timeout|timed out|503|unavailable|high demand|temporar/i.test(
    message,
  );
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

function registerLiveProviders(): RegisteredKeys {
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
  if (!geminiKey && !hasFlag('--allow-missing-gemini')) {
    throw new Error(
      'GEMINI_API_KEY is required for the production book-generation path. Use --allow-missing-gemini only for provider outage diagnosis.',
    );
  }

  return {
    gemini: Boolean(geminiKey),
    openai: Boolean(openaiKey),
    anthropic: Boolean(anthropicKey),
  };
}

function selectCases(): RunnerCase[] {
  const requested = getArg('--cases=');
  if (!requested) return cases;

  const ids = requested
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
  return ids.map((id) => {
    const testCase = byId.get(id);
    if (!testCase) throw new Error(`Unknown book-generation case: ${id}`);
    return testCase;
  });
}

function makeIssue(
  severity: IssueSeverity,
  category: IssueCategory,
  code: string,
  message: string,
  caseId: string,
  snippet?: string,
): QualityIssue {
  return {
    severity,
    category,
    code,
    message,
    caseId,
    ...(snippet ? { snippet: snippet.slice(0, 500) } : {}),
  };
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function words(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

function distinctNormalized(values: string[]): Set<string> {
  return new Set(values.map(normalizeText).filter(Boolean));
}

function hasCutesyRegister(value: string): boolean {
  return /\b(amazing|awesome|cute|fun facts|magical|super|little|wonders?|wow|yay)\b|!|[★☆]/i.test(
    value,
  );
}

function hasPreciseUnsupportedClaim(value: string): boolean {
  return /\b(?:1[0-9]{3}|20[0-9]{2})s?\b|\b\d+(?:\.\d+)?\s?%/.test(value);
}

function hasOverconfidentClaim(value: string): boolean {
  return /\b(the only reason|caused solely|always|never|everyone|no one|proves?)\b/i.test(
    value,
  );
}

function isVagueDescription(value: string): boolean {
  const text = normalizeText(value);
  const wordList = words(text);
  if (wordList.length < 5) return true;
  if (wordList.length > 9) return false;
  return /^(learn|explore|understand|discover) (about )?(the )?[\w\s-]+\.?$/.test(
    text,
  );
}

function isSortOrderStrict(values: Array<{ sortOrder: number }>): boolean {
  const seen = new Set<number>();
  let previous = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (seen.has(value.sortOrder)) return false;
    if (value.sortOrder <= previous) return false;
    seen.add(value.sortOrder);
    previous = value.sortOrder;
  }
  return true;
}

function validateTitlesAndDescriptions(
  testCase: RunnerCase,
  items: Array<{ title: string; description: string; sortOrder?: number }>,
  noun: string,
  options: { requireSortOrder?: boolean } = {},
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const titleSet = distinctNormalized(items.map((item) => item.title));
  if (titleSet.size !== items.length) {
    issues.push(
      makeIssue(
        'fail',
        'quality',
        'duplicate_titles',
        `Generated ${noun}s need distinct titles.`,
        testCase.id,
        items.map((item) => item.title).join(', '),
      ),
    );
  }

  const sortableItems = items.filter(
    (item): item is { title: string; description: string; sortOrder: number } =>
      typeof item.sortOrder === 'number',
  );
  if (
    options.requireSortOrder &&
    (sortableItems.length !== items.length || !isSortOrderStrict(sortableItems))
  ) {
    issues.push(
      makeIssue(
        'fail',
        'schema',
        'bad_sort_order',
        `Generated ${noun}s need unique increasing sortOrder values.`,
        testCase.id,
        items.map((item) => `${item.sortOrder}:${item.title}`).join(', '),
      ),
    );
  }

  for (const item of items) {
    const combined = `${item.title} ${item.description}`;
    if (isVagueDescription(item.description)) {
      issues.push(
        makeIssue(
          'warn',
          'quality',
          'vague_description',
          `Generated ${noun} "${item.title}" has a vague description.`,
          testCase.id,
          item.description,
        ),
      );
    }
    if (hasCutesyRegister(combined)) {
      issues.push(
        makeIssue(
          testCase.learnerAge >= 18 ? 'fail' : 'warn',
          'quality',
          'cutesy_register',
          `Generated ${noun} "${item.title}" uses register that may feel childish or gimmicky.`,
          testCase.id,
          combined,
        ),
      );
    }
    if (hasPreciseUnsupportedClaim(item.description)) {
      issues.push(
        makeIssue(
          'fail',
          'source-safety',
          'precise_unsourced_claim',
          `Generated ${noun} "${item.title}" includes a precise factual claim without retrieval/source grounding.`,
          testCase.id,
          item.description,
        ),
      );
    }
    if (hasOverconfidentClaim(item.description)) {
      issues.push(
        makeIssue(
          'warn',
          'source-safety',
          'overconfident_claim',
          `Generated ${noun} "${item.title}" may overstate a factual claim.`,
          testCase.id,
          item.description,
        ),
      );
    }
  }

  return issues;
}

function analyzeSubjectStructure(
  testCase: SubjectStructureCase,
  result: BookGenerationResult,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (result.type !== testCase.expectedType) {
    issues.push(
      makeIssue(
        'fail',
        'quality',
        'unexpected_subject_type',
        `Expected ${testCase.subjectName} to be ${testCase.expectedType}, but the LLM returned ${result.type}.`,
        testCase.id,
      ),
    );
    return issues;
  }

  if (result.type === 'broad') {
    if (result.books.length < 5 || result.books.length > 20) {
      issues.push(
        makeIssue(
          'fail',
          'schema',
          'book_count_out_of_prompt_range',
          'Broad subject generation should return 5-20 books.',
          testCase.id,
          `Count: ${result.books.length}`,
        ),
      );
    }
    issues.push(
      ...validateTitlesAndDescriptions(testCase, result.books, 'book', {
        requireSortOrder: true,
      }),
    );
    for (const book of result.books) {
      if (!book.emoji.trim()) {
        issues.push(
          makeIssue(
            'fail',
            'schema',
            'missing_book_emoji',
            `Book "${book.title}" needs an emoji for library display.`,
            testCase.id,
          ),
        );
      }
    }
    return issues;
  }

  if (result.topics.length < 8 || result.topics.length > 15) {
    issues.push(
      makeIssue(
        'fail',
        'schema',
        'narrow_topic_count_out_of_prompt_range',
        'Narrow subject generation should return 8-15 direct topics.',
        testCase.id,
        `Count: ${result.topics.length}`,
      ),
    );
  }
  issues.push(
    ...validateTitlesAndDescriptions(testCase, result.topics, 'topic'),
  );
  return issues;
}

function analyzeRequiredTerms(
  testCase: BookTopicsCase,
  result: BookTopicGenerationResult,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!testCase.requiredAnyTerms) return issues;

  const text = normalizeText(
    result.topics
      .flatMap((topic) => [topic.title, topic.description, topic.chapter])
      .join(' '),
  );
  for (const requirement of testCase.requiredAnyTerms) {
    const found = requirement.terms.some((term) =>
      text.includes(normalizeText(term)),
    );
    if (!found) {
      issues.push(
        makeIssue(
          requirement.severity ?? 'fail',
          'quality',
          'missing_required_topic_language',
          `Generated topic map does not visibly cover ${requirement.label}.`,
          testCase.id,
          requirement.terms.join(', '),
        ),
      );
    }
  }
  return issues;
}

function analyzeConnections(
  testCase: BookTopicsCase,
  topics: GeneratedBookTopic[],
  connections: GeneratedConnection[],
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const titleSet = distinctNormalized(topics.map((topic) => topic.title));
  const seenPairs = new Set<string>();
  const degrees = new Map<string, number>();

  if (connections.length === 0) {
    issues.push(
      makeIssue(
        'warn',
        'topic-map',
        'no_visual_connections',
        'Generated book topic map has no visual connections.',
        testCase.id,
      ),
    );
  }

  for (const connection of connections) {
    const a = normalizeText(connection.topicA);
    const b = normalizeText(connection.topicB);
    if (!titleSet.has(a) || !titleSet.has(b)) {
      issues.push(
        makeIssue(
          'fail',
          'topic-map',
          'connection_unknown_topic',
          'Generated connection references a topic title that does not exist in the generated topic list.',
          testCase.id,
          `${connection.topicA} -> ${connection.topicB}`,
        ),
      );
      continue;
    }
    if (a === b) {
      issues.push(
        makeIssue(
          'fail',
          'topic-map',
          'self_connection',
          'Generated topic map connects a topic to itself.',
          testCase.id,
          connection.topicA,
        ),
      );
      continue;
    }

    const pair = [a, b].sort().join('::');
    if (seenPairs.has(pair)) {
      issues.push(
        makeIssue(
          'warn',
          'topic-map',
          'duplicate_connection',
          'Generated topic map repeats the same visual connection.',
          testCase.id,
          `${connection.topicA} -> ${connection.topicB}`,
        ),
      );
    }
    seenPairs.add(pair);
    degrees.set(a, (degrees.get(a) ?? 0) + 1);
    degrees.set(b, (degrees.get(b) ?? 0) + 1);
  }

  for (const [title, degree] of degrees) {
    if (degree > 3) {
      issues.push(
        makeIssue(
          'warn',
          'topic-map',
          'too_many_connections',
          'Generated topic map should stay sparse, about two connections per topic.',
          testCase.id,
          `${title}: ${degree}`,
        ),
      );
    }
  }

  return issues;
}

function analyzeChapterContinuity(
  testCase: BookTopicsCase,
  topics: GeneratedBookTopic[],
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const positionsByChapter = new Map<string, number[]>();
  topics.forEach((topic, index) => {
    const chapter = normalizeText(topic.chapter);
    const positions = positionsByChapter.get(chapter) ?? [];
    positions.push(index);
    positionsByChapter.set(chapter, positions);
  });

  for (const [chapter, positions] of positionsByChapter) {
    const min = Math.min(...positions);
    const max = Math.max(...positions);
    if (positions.length !== max - min + 1) {
      issues.push(
        makeIssue(
          'warn',
          'topic-map',
          'non_contiguous_chapter',
          'Generated chapter topics should usually stay together so the book map is easier to scan.',
          testCase.id,
          chapter,
        ),
      );
    }
  }

  return issues;
}

function buildTopicMapPreview(
  testCase: BookTopicsCase,
  topics: GeneratedBookTopic[],
): { preview?: string; issues: QualityIssue[] } {
  const issues: QualityIssue[] = [];
  if (topics.length < 3) {
    return {
      issues: [
        makeIssue(
          'fail',
          'topic-map',
          'too_few_topics_for_map',
          'Generated book needs enough topics for previous/current/next topic-map context.',
          testCase.id,
        ),
      ],
    };
  }

  const now = new Date();
  const mapTopics = topics.map((topic, index) => ({
    id: `runner-topic-${index + 1}`,
    curriculumId: 'runner-curriculum',
    title: topic.title,
    description: topic.description,
    sortOrder: topic.sortOrder,
    relevance: 'core',
    source: 'generated',
    estimatedMinutes: topic.estimatedMinutes,
    bookId: 'runner-book',
    chapter: topic.chapter,
    skipped: false,
    cefrLevel: null,
    cefrSublevel: null,
    targetWordCount: null,
    targetChunkCount: null,
    filedFrom: 'pre_generated',
    sessionId: null,
    createdAt: now,
    updatedAt: now,
  })) as Parameters<typeof buildCurrentTopicMapContext>[0]['topics'];

  const currentIndex = Math.min(
    Math.max(1, Math.floor(mapTopics.length / 2)),
    mapTopics.length - 2,
  );
  const currentTopic = mapTopics[currentIndex];
  if (!currentTopic) {
    return {
      issues: [
        makeIssue(
          'fail',
          'topic-map',
          'topic_map_current_missing',
          'Could not select a middle topic for topic-map preview.',
          testCase.id,
        ),
      ],
    };
  }

  const preview = buildCurrentTopicMapContext({
    subjectName: testCase.subjectName,
    bookTitle: testCase.bookTitle,
    bookDescription: testCase.bookDescription,
    topics: mapTopics,
    currentTopicId: currentTopic.id,
  });

  if (!preview) {
    issues.push(
      makeIssue(
        'fail',
        'topic-map',
        'topic_map_not_rendered',
        'Generated topics could not be rendered into session topic-map context.',
        testCase.id,
      ),
    );
    return { issues };
  }

  if (!preview.includes('Earlier in the book')) {
    issues.push(
      makeIssue(
        'fail',
        'topic-map',
        'topic_map_missing_previous',
        'Topic-map context did not include previous topics for the tutor.',
        testCase.id,
      ),
    );
  }
  if (!preview.includes('Coming next in the book')) {
    issues.push(
      makeIssue(
        'fail',
        'topic-map',
        'topic_map_missing_next',
        'Topic-map context did not include upcoming topics for the tutor.',
        testCase.id,
      ),
    );
  }

  return { preview, issues };
}

function analyzeBookTopics(
  testCase: BookTopicsCase,
  result: BookTopicGenerationResult,
): { issues: QualityIssue[]; topicMapPreview?: string } {
  const issues: QualityIssue[] = [
    ...validateTitlesAndDescriptions(testCase, result.topics, 'topic', {
      requireSortOrder: true,
    }),
    ...analyzeRequiredTerms(testCase, result),
    ...analyzeConnections(testCase, result.topics, result.connections),
    ...analyzeChapterContinuity(testCase, result.topics),
  ];

  // Orphan topic: a topic whose title merely restates the book it belongs to.
  // Uses the same equivalence matcher as the persistBookTopics backstop, so the
  // eval flags exactly what production would strip.
  const orphanTopics = result.topics.filter((topic) =>
    areEquivalentBookTitles(topic.title, testCase.bookTitle),
  );
  if (orphanTopics.length > 0) {
    issues.push(
      makeIssue(
        'fail',
        'quality',
        'orphan_topic_restates_book',
        'A generated topic merely restates the book title instead of covering a distinct sub-part of it.',
        testCase.id,
        orphanTopics.map((topic) => topic.title).join(', '),
      ),
    );
  }

  const totalMinutes = result.topics.reduce(
    (sum, topic) => sum + topic.estimatedMinutes,
    0,
  );
  if (totalMinutes > 600) {
    issues.push(
      makeIssue(
        'warn',
        'quality',
        'overloaded_book',
        'Generated book may overload the learner; total estimated time is over 10 hours.',
        testCase.id,
        `${totalMinutes} minutes`,
      ),
    );
  }

  const lastTopic = [...result.topics].sort(
    (a, b) => b.sortOrder - a.sortOrder,
  )[0];
  if (
    lastTopic &&
    /\b(introduction|intro|basics|overview)\b/i.test(lastTopic.title)
  ) {
    issues.push(
      makeIssue(
        'warn',
        'topic-map',
        'late_intro_topic',
        'The final generated topic looks introductory, which may signal a weak sequence.',
        testCase.id,
        lastTopic.title,
      ),
    );
  }

  const topicMap = buildTopicMapPreview(testCase, result.topics);
  issues.push(...topicMap.issues);

  return {
    issues,
    ...(topicMap.preview ? { topicMapPreview: topicMap.preview } : {}),
  };
}

async function runSubjectStructureCase(
  testCase: SubjectStructureCase,
): Promise<SubjectStructureResult> {
  const startedAt = new Date();
  const start = Date.now();
  try {
    const result = await detectSubjectType(
      testCase.subjectName,
      testCase.learnerAge,
    );
    return {
      kind: 'subject-structure',
      case: testCase,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      result,
      issues: analyzeSubjectStructure(testCase, result),
    };
  } catch (error) {
    return {
      kind: 'subject-structure',
      case: testCase,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      issues: [
        makeIssue(
          'fail',
          'schema',
          'generation_error',
          'Book subject-structure generation failed before quality checks could run.',
          testCase.id,
          error instanceof Error ? error.message : String(error),
        ),
      ],
    };
  }
}

async function runBookTopicsCase(
  testCase: BookTopicsCase,
): Promise<BookTopicsResult> {
  const startedAt = new Date();
  const start = Date.now();
  try {
    const result = await generateBookTopics(
      testCase.bookTitle,
      testCase.bookDescription,
      testCase.learnerAge,
      testCase.priorKnowledge,
    );
    const analysis = analyzeBookTopics(testCase, result);
    return {
      kind: 'book-topics',
      case: testCase,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      result,
      issues: analysis.issues,
      ...(analysis.topicMapPreview
        ? { topicMapPreview: analysis.topicMapPreview }
        : {}),
    };
  } catch (error) {
    return {
      kind: 'book-topics',
      case: testCase,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      issues: [
        makeIssue(
          'fail',
          'schema',
          'generation_error',
          'Book topic generation failed before quality checks could run.',
          testCase.id,
          error instanceof Error ? error.message : String(error),
        ),
      ],
    };
  }
}

async function runCase(testCase: RunnerCase): Promise<CaseResult> {
  if (testCase.kind === 'subject-structure') {
    return runSubjectStructureCase(testCase);
  }
  return runBookTopicsCase(testCase);
}

async function runCaseWithTransientRetries(
  testCase: RunnerCase,
): Promise<CaseResult> {
  const maxRetries = getCaseRetries();
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await runCase(testCase);
    const isRetryable =
      result.issues.some(
        (issue) =>
          issue.severity === 'fail' && issue.code === 'generation_error',
      ) && isTransientGenerationError(result.error);
    if (!isRetryable || attempt >= maxRetries) return result;

    const delayMs = 5_000 * (attempt + 1);
    console.warn(
      `[${testCase.id}] transient generation error (${result.error}); retrying case in ${delayMs}ms`,
    );
    await sleep(delayMs);
  }

  return runCase(testCase);
}

function summarizeSubjectResult(result: SubjectStructureResult): string {
  if (!result.result) return '(no result)';
  if (result.result.type === 'broad') {
    return `${result.result.books.length} books: ${result.result.books
      .slice(0, 4)
      .map((book: GeneratedBook) => book.title)
      .join(', ')}`;
  }
  return `${result.result.topics.length} topics: ${result.result.topics
    .slice(0, 4)
    .map((topic: GeneratedTopic) => topic.title)
    .join(', ')}`;
}

function summarizeBookTopicsResult(result: BookTopicsResult): string {
  if (!result.result) return '(no result)';
  const chapters = distinctNormalized(
    result.result.topics.map((topic) => topic.chapter),
  ).size;
  return `${result.result.topics.length} topics, ${chapters} chapters, ${result.result.connections.length} connections`;
}

function renderMarkdown(results: CaseResult[], keys: RegisteredKeys): string {
  const issues = results.flatMap((result) => result.issues);
  const failures = issues.filter((issue) => issue.severity === 'fail');
  const warnings = issues.filter((issue) => issue.severity === 'warn');
  const lines: string[] = [
    '# Book Generation Quality Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Cases: ${results.length}`,
    `Failures: ${failures.length}`,
    `Warnings: ${warnings.length}`,
    `Providers configured: Gemini ${keys.gemini ? 'yes' : 'no'}, OpenAI ${
      keys.openai ? 'yes' : 'no'
    }, Anthropic ${keys.anthropic ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    '| Case | Kind | Result | Issues |',
    '| --- | --- | --- | --- |',
  ];

  for (const result of results) {
    const summary =
      result.kind === 'subject-structure'
        ? summarizeSubjectResult(result)
        : summarizeBookTopicsResult(result);
    lines.push(
      `| ${result.case.id} | ${result.kind} | ${summary.replace(/\|/g, '/')} | ${
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
      `- Kind: ${result.kind}`,
      `- Age: ${result.case.learnerAge}`,
      `- Duration: ${result.durationMs}ms`,
    );
    if (result.kind === 'subject-structure') {
      lines.push(`- Subject: ${result.case.subjectName}`);
      lines.push(`- Expected type: ${result.case.expectedType}`);
      if (result.result) lines.push(`- Actual type: ${result.result.type}`);
    } else {
      lines.push(`- Subject: ${result.case.subjectName}`);
      lines.push(`- Book: ${result.case.bookTitle}`);
    }
    if (result.error) lines.push(`- Error: ${result.error}`);
    lines.push('');

    if (result.result) {
      lines.push('Generated shape:', '', '```json');
      lines.push(JSON.stringify(result.result, null, 2).slice(0, 6000));
      lines.push('```', '');
    }

    if (result.kind === 'book-topics' && result.topicMapPreview) {
      lines.push('Topic-map preview:', '', '```text');
      lines.push(result.topicMapPreview);
      lines.push('```', '');
    }

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

  if (issues.length === 0) {
    lines.push('No quality issues found.', '');
  }

  lines.push(
    '## Reading This Gate',
    '',
    'This runner checks the generated curriculum skeleton before the tutor starts teaching. It uses the existing topic-map builder as a bridge: generated book topics must render into previous/current/next session context, not merely pass JSON schema validation.',
    '',
    'Precise factual claims are failures because book generation currently has no source-retrieval step. Generated curriculum should stay source-neutral until a tutoring turn has reliable source support.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  logLlmRoutingMode();
  if (hasFlag('--help')) {
    console.log(
      [
        'Usage: pnpm test:llm:book-generation -- [options]',
        '',
        'Options:',
        '  --list-cases',
        '  --cases=broad-history-age-12,photosynthesis-age-12',
        '  --run-id=<id>',
        '  --results-dir=<path>',
        '  --allow-missing-gemini',
        '  --allow-quality-failures',
        '  --case-retries=<n>     default: 1 retry for transient provider errors',
      ].join('\n'),
    );
    return;
  }

  if (hasFlag('--list-cases')) {
    console.log(
      cases
        .map(
          (testCase) =>
            `${testCase.id}: ${testCase.label} (${testCase.kind}, age ${testCase.learnerAge})`,
        )
        .join('\n'),
    );
    return;
  }

  const selected = selectCases();
  const keys = registerLiveProviders();
  const runId = getRunId();
  const resultsDirArg = getArg('--results-dir=');
  const resultsDir = resultsDirArg
    ? path.resolve(resultsDirArg)
    : path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'tmp',
        'book-generation',
        'results',
      );
  await mkdir(resultsDir, { recursive: true });

  const results: CaseResult[] = [];
  for (const testCase of selected) {
    const result = await runCaseWithTransientRetries(testCase);
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
  await writeFile(allMdPath, renderMarkdown(results, keys));
  await writeFile(issuesPath, JSON.stringify(issues, null, 2));
  console.log(`[done] wrote ${allJsonPath}`);
  console.log(`[done] wrote ${allMdPath}`);
  console.log(`[done] wrote ${issuesPath}`);

  const blockingFailures = issues.filter(
    (issue) =>
      issue.severity === 'fail' &&
      (issue.category !== 'quality' || !allowsQualityFailures()),
  );
  if (blockingFailures.length > 0) {
    throw new Error(
      `Book generation quality gate failed with ${blockingFailures.length} blocking issue(s). See ${allMdPath}`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
