import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  learnerRecapLlmOutputSchema,
  llmSummarySchema,
  sessionAnalysisOutputSchema,
  type KnowledgeInventory,
} from '@eduagent/schemas';

import { callLlm } from '../apps/api/eval-llm/runner/llm-bootstrap';
import { parseFirstJsonObject } from '../apps/api/eval-llm/runner/quality';
import { buildAssessmentEvaluationMessages } from '../apps/api/src/services/assessments';
import {
  filterUnsupportedResolvedTopics,
  SESSION_ANALYSIS_PROMPT,
} from '../apps/api/src/services/learner-profile';
import type { ChatMessage } from '../apps/api/src/services/llm';
import { buildProgressSummaryPrompt } from '../apps/api/src/services/progress-summary';
import {
  buildRecapPrompt,
  getAgeVoiceTierLabel,
} from '../apps/api/src/services/session-recap';
import { buildSessionSummaryPrompt } from '../apps/api/src/services/session-llm-summary';

type IssueSeverity = 'fail' | 'warn';

interface QualityIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  caseId: string;
  snippet?: string;
}

interface CaseValidation {
  textForVariation: string;
  issues: QualityIssue[];
}

interface ArtifactCase {
  id: string;
  label: string;
  artifactType: string;
  messages: ChatMessage[];
  responseFormat?: 'json';
  validate(raw: string): CaseValidation;
}

interface CaseResult {
  case: Pick<ArtifactCase, 'id' | 'label' | 'artifactType'>;
  rawResponse: string;
  textForVariation: string;
  issues: QualityIssue[];
  durationMs: number;
}

const GENERIC_PHRASES = [
  /\bgreat job\b/i,
  /\bwell done\b/i,
  /\bkeep practicing\b/i,
  /\bcontinue learning\b/i,
  /\bworked on the topic\b/i,
  /\bpick up where (?:they|you) left off\b/i,
];

const OVERHEATED_PRAISE = [
  /\bsuper helpful\b/i,
  /\bgreat observation\b/i,
  /\bgreat work\b/i,
  /\bnice work\b/i,
  /\bexcellent\b/i,
];

const NEXT_ACTION_PATTERNS = [
  /\btry\b/i,
  /\bwrite\b/i,
  /\bchoose\b/i,
  /\bcomplete\b/i,
  /\banswer\b/i,
  /\bnext\b/i,
  /\bwhat does\b/i,
  /\bwhich\b/i,
  /\btranslate\b/i,
  /\bsay\b/i,
  /\btell me\b/i,
  /\bfill in\b/i,
  /\?\s*$/m,
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

function makeIssue(
  severity: IssueSeverity,
  code: string,
  message: string,
  caseId: string,
  snippet?: string,
): QualityIssue {
  return {
    severity,
    code,
    message,
    caseId,
    ...(snippet ? { snippet } : {}),
  };
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function openingKey(text: string): string {
  return normalize(text).split(' ').slice(0, 5).join(' ');
}

function parseJson<T>(raw: string): T | null {
  return parseFirstJsonObject<T>(raw);
}

function formatZodIssues(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as { issues?: unknown[] }).issues)
  ) {
    return (
      error as { issues: Array<{ path?: unknown[]; message?: string }> }
    ).issues
      .map((issue) => {
        const path =
          Array.isArray(issue.path) && issue.path.length > 0
            ? issue.path.join('.')
            : 'root';
        return `${path}: ${issue.message ?? 'invalid value'}`;
      })
      .join('; ');
  }

  return 'unknown schema error';
}

function makeSummaryCase(): ArtifactCase {
  const prompt = buildSessionSummaryPrompt({
    subjectName: 'Spanish',
    topicTitle: 'Present tense verb endings',
    transcriptText: [
      'Learner: I remember `yo hablo` for hablar.',
      'Mentor: Yes. That uses the -ar verb pattern in the present tense.',
      'Learner: I keep mixing up -er and -ir endings.',
      'Mentor: We made a side-by-side contrast table: `como` and `vivo`.',
      'Learner: Next time I want three quick sentences where I choose the -o ending.',
    ].join('\n\n'),
  });

  return {
    id: 'summary-specific-reentry',
    label: 'Internal summary stays specific and gives a fresh re-entry step',
    artifactType: 'session-summary',
    responseFormat: 'json',
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    validate(raw) {
      const issues: QualityIssue[] = [];
      const parsed = parseJson(raw);
      const validated = llmSummarySchema.safeParse(parsed);
      if (!validated.success) {
        return {
          textForVariation: raw,
          issues: [
            makeIssue(
              'fail',
              'summary.parse',
              `Summary response did not match llmSummarySchema: ${formatZodIssues(
                validated.error,
              )}.`,
              'summary-specific-reentry',
              raw.slice(0, 300),
            ),
          ],
        };
      }

      const summary = validated.data;
      const text = `${summary.narrative} ${summary.reEntryRecommendation}`;
      if (
        !includesAny(text, [
          /yo hablo/i,
          /-ar/i,
          /-er/i,
          /-ir/i,
          /\bcomo\b/i,
          /\bvivo\b/i,
        ])
      ) {
        issues.push(
          makeIssue(
            'fail',
            'summary.missing-current-detail',
            'Summary should preserve at least one concrete current-session detail.',
            'summary-specific-reentry',
            text,
          ),
        );
      }
      if (
        !includesAny(summary.reEntryRecommendation, [
          /sentence/i,
          /choose/i,
          /ending/i,
          /-o/i,
          /drill/i,
          /practice/i,
        ])
      ) {
        issues.push(
          makeIssue(
            'fail',
            'summary.vague-reentry',
            'Re-entry recommendation should give the next mentor a concrete next action.',
            'summary-specific-reentry',
            summary.reEntryRecommendation,
          ),
        );
      }
      return { textForVariation: text, issues };
    },
  };
}

function makeRecapCase(): ArtifactCase {
  const system = buildRecapPrompt(
    getAgeVoiceTierLabel(2013),
    'Spanish everyday questions',
  );
  const user = [
    'Student: Can we review present tense endings?',
    'Mentor: Let us compare the endings side by side.',
    'Student: The horse analogy is distracting today. The side-by-side examples help more.',
    'Mentor: Then we will use short worked examples.',
    'Student: I can see that `hablo`, `como`, and `vivo` all use the -o ending for `I`.',
    'Mentor: Yes, that pattern is the useful one to carry into questions.',
  ].join('\n\n');

  return {
    id: 'learner-recap-varied-next-step',
    label: 'Learner recap has distinct takeaways and a concrete next step',
    artifactType: 'session-recap',
    responseFormat: 'json',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    validate(raw) {
      const parsed = parseJson(raw);
      const validated = learnerRecapLlmOutputSchema.safeParse(parsed);
      if (!validated.success) {
        return {
          textForVariation: raw,
          issues: [
            makeIssue(
              'fail',
              'recap.parse',
              'Recap response did not match learnerRecapLlmOutputSchema.',
              'learner-recap-varied-next-step',
              raw.slice(0, 300),
            ),
          ],
        };
      }

      const recap = validated.data;
      const takeaways = recap.takeaways ?? [];
      const issues: QualityIssue[] = [];
      const text = [
        recap.closingLine,
        ...takeaways,
        recap.nextTopicReason ?? '',
      ].join(' ');
      const uniqueTakeaways = new Set(takeaways.map(normalize));
      if (takeaways.length > 1 && uniqueTakeaways.size !== takeaways.length) {
        issues.push(
          makeIssue(
            'fail',
            'recap.repeated-takeaways',
            'Recap takeaways should not be duplicates with different wording.',
            'learner-recap-varied-next-step',
            takeaways.join(' | '),
          ),
        );
      }
      if (!includesAny(text, [/\bhablo\b/i, /\bcomo\b/i, /\bvivo\b/i, /-o/i])) {
        issues.push(
          makeIssue(
            'fail',
            'recap.missing-specific-work',
            'Recap should name the actual pattern the learner practiced.',
            'learner-recap-varied-next-step',
            text,
          ),
        );
      }
      if (
        !recap.nextTopicReason ||
        !includesAny(recap.nextTopicReason, [
          /question/i,
          /ask/i,
          /answer/i,
          /Spanish everyday questions/i,
        ])
      ) {
        issues.push(
          makeIssue(
            'fail',
            'recap.vague-next-topic',
            'Next-topic reason should connect the next topic to the current work.',
            'learner-recap-varied-next-step',
            recap.nextTopicReason ?? '',
          ),
        );
      }
      return { textForVariation: text, issues };
    },
  };
}

function makeAnalysisCase(): ArtifactCase {
  const transcriptText = [
    'Learner: I still mix up -er and -ir endings.',
    'Mentor: Want a horse analogy or short examples?',
    'Learner: The horse analogy actually distracts me today.',
    'Mentor: No problem. I will switch to short side-by-side examples.',
    'Learner: Yes, the side-by-side examples are clearer. I still need practice choosing the ending.',
  ].join('\n\n');
  const system = SESSION_ANALYSIS_PROMPT.replace('{subject}', 'Languages')
    .replace('{topic}', 'Spanish present tense endings')
    .replace('{rawInput}', 'I want help with Spanish verb endings.')
    .replaceAll('{knownStruggles}', '-er and -ir endings (Spanish)')
    .replaceAll('{suppressedTopics}', '(none)');

  return {
    id: 'analysis-updated-communication-note',
    label: 'Session analysis records updated communication preference',
    artifactType: 'session-analysis',
    responseFormat: 'json',
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `<transcript>\n${transcriptText}\n</transcript>`,
      },
    ],
    validate(raw) {
      const parsed = parseJson(raw);
      const validated = sessionAnalysisOutputSchema.safeParse(parsed);
      if (!validated.success) {
        return {
          textForVariation: raw,
          issues: [
            makeIssue(
              'fail',
              'analysis.parse',
              'Session analysis response did not match sessionAnalysisOutputSchema.',
              'analysis-updated-communication-note',
              raw.slice(0, 300),
            ),
          ],
        };
      }

      const analysis = filterUnsupportedResolvedTopics(
        validated.data,
        transcriptText,
      );
      const notes = analysis.communicationNotes ?? [];
      const struggles = analysis.struggles ?? [];
      const interests = analysis.interests ?? [];
      const text = [
        ...notes,
        ...struggles.map((entry) => entry.topic),
        ...interests,
      ].join(' ');
      const issues: QualityIssue[] = [];

      if (
        !includesAny(notes.join(' '), [/side-by-side/i, /example/i, /short/i])
      ) {
        issues.push(
          makeIssue(
            'fail',
            'analysis.missing-updated-note',
            'Communication notes should capture the updated preference for short side-by-side examples.',
            'analysis-updated-communication-note',
            notes.join(' | '),
          ),
        );
      }
      if (
        !includesAny(struggles.map((entry) => entry.topic).join(' '), [
          /-er/i,
          /-ir/i,
          /ending/i,
        ])
      ) {
        issues.push(
          makeIssue(
            'fail',
            'analysis.missing-current-struggle',
            'Analysis should preserve the current struggle with endings.',
            'analysis-updated-communication-note',
            struggles.map((entry) => entry.topic).join(' | '),
          ),
        );
      }
      if (includesAny(interests.join(' '), [/horse/i])) {
        issues.push(
          makeIssue(
            'fail',
            'analysis-stale-interest',
            'A rejected analogy should not be saved as a current interest signal.',
            'analysis-updated-communication-note',
            interests.join(' | '),
          ),
        );
      }
      if (analysis.resolvedTopics?.length || analysis.strengths?.length) {
        issues.push(
          makeIssue(
            'fail',
            'analysis.overclaims-resolution',
            'This transcript updates preference and struggle, but does not demonstrate mastery.',
            'analysis-updated-communication-note',
            raw.slice(0, 300),
          ),
        );
      }

      return { textForVariation: text || raw, issues };
    },
  };
}

function makeProgressInventory(): KnowledgeInventory {
  return {
    profileId: '33333333-3333-7333-8333-333333333333',
    snapshotDate: '2026-05-19',
    currentlyWorkingOn: [
      'Spanish -er and -ir endings',
      'Short side-by-side example drills',
    ],
    thisWeekMini: {
      sessions: 3,
      wordsLearned: 12,
      topicsTouched: 4,
    },
    global: {
      topicsAttempted: 8,
      topicsMastered: 4,
      vocabularyTotal: 42,
      vocabularyMastered: 18,
      weeklyDeltaTopicsMastered: 2,
      weeklyDeltaVocabularyTotal: 12,
      weeklyDeltaTopicsExplored: 3,
      totalSessions: 6,
      totalActiveMinutes: 140,
      totalWallClockMinutes: 165,
      currentStreak: 3,
      longestStreak: 5,
    },
    subjects: [
      {
        subjectId: '11111111-1111-7111-8111-111111111111',
        subjectName: 'Spanish',
        pedagogyMode: 'four_strands',
        topics: {
          total: 7,
          explored: 5,
          mastered: 3,
          inProgress: 2,
          notStarted: 2,
        },
        vocabulary: {
          total: 42,
          mastered: 18,
          learning: 16,
          new: 8,
          byCefrLevel: {},
        },
        estimatedProficiency: null,
        estimatedProficiencyLabel: null,
        lastSessionAt: '2026-05-19T09:00:00Z',
        activeMinutes: 95,
        wallClockMinutes: 110,
        sessionsCount: 4,
      },
    ],
  };
}

function makeProgressCase(): ArtifactCase {
  const prompt = buildProgressSummaryPrompt({
    childName: 'Emma',
    inventory: makeProgressInventory(),
    latestSessionAt: new Date('2026-05-19T09:00:00Z'),
  });
  return {
    id: 'progress-summary-current-state',
    label: 'Parent progress summary names current activity without inferring',
    artifactType: 'progress-summary',
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
    validate(raw) {
      const text = raw.trim();
      const issues: QualityIssue[] = [];
      if (!/\bEmma\b/.test(text)) {
        issues.push(
          makeIssue(
            'fail',
            'progress.missing-child-name',
            'Progress summary should mention the child by name.',
            'progress-summary-current-state',
            text,
          ),
        );
      }
      if (!includesAny(text, [/Spanish/i, /session/i, /minute/i, /topic/i])) {
        issues.push(
          makeIssue(
            'fail',
            'progress.missing-inventory-detail',
            'Progress summary should be grounded in the current inventory.',
            'progress-summary-current-state',
            text,
          ),
        );
      }
      if (
        includesAny(text, [
          /understood/i,
          /enjoyed/i,
          /struggled/i,
          /mastered beyond/i,
        ])
      ) {
        issues.push(
          makeIssue(
            'fail',
            'progress.unsupported-inference',
            'Progress summary should not infer inner state from inventory counts.',
            'progress-summary-current-state',
            text,
          ),
        );
      }
      return { textForVariation: text, issues };
    },
  };
}

function makeAssessmentCase(): ArtifactCase {
  const messages = buildAssessmentEvaluationMessages(
    {
      topicTitle: 'Spanish present tense endings',
      topicDescription:
        'Use present-tense endings to say simple first-person Spanish sentences.',
      currentDepth: 'explain',
      exchangeHistory: [
        {
          role: 'assistant',
          content:
            'We compared `hablo`, `como`, and `vivo` as first-person present forms.',
        },
      ],
      subjectName: 'Spanish',
      pedagogyMode: 'four_strands',
      languageCode: 'es',
    },
    'I think hablo and vivo both use o, but I am not sure about comes.',
  );

  return {
    id: 'assessment-feedback-concrete-next-action',
    label: 'Assessment feedback gives a concrete next action',
    artifactType: 'challenge-feedback',
    responseFormat: 'json',
    messages,
    validate(raw) {
      const parsed = parseJson<{
        feedback?: unknown;
        weakAreas?: unknown;
      }>(raw);
      const feedback =
        parsed && typeof parsed.feedback === 'string' ? parsed.feedback : '';
      const weakAreas = Array.isArray(parsed?.weakAreas)
        ? parsed.weakAreas.filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      const issues: QualityIssue[] = [];

      if (!feedback) {
        return {
          textForVariation: raw,
          issues: [
            makeIssue(
              'fail',
              'assessment.parse',
              'Assessment response did not contain feedback text.',
              'assessment-feedback-concrete-next-action',
              raw.slice(0, 300),
            ),
          ],
        };
      }
      if (!includesAny(feedback, NEXT_ACTION_PATTERNS)) {
        issues.push(
          makeIssue(
            'fail',
            'assessment.no-next-action',
            'Assessment feedback should tell the learner exactly what to do next.',
            'assessment-feedback-concrete-next-action',
            feedback,
          ),
        );
      }
      if (countMatches(feedback, OVERHEATED_PRAISE) >= 2) {
        issues.push(
          makeIssue(
            'fail',
            'assessment.overheated-praise',
            'Assessment feedback should acknowledge the exact useful answer part without stacking generic praise.',
            'assessment-feedback-concrete-next-action',
            feedback,
          ),
        );
      }
      if (
        !includesAny(feedback, [
          /hablo/i,
          /vivo/i,
          /comes/i,
          /ending/i,
          /-er/i,
          /-ir/i,
        ])
      ) {
        issues.push(
          makeIssue(
            'fail',
            'assessment.not-specific',
            'Assessment feedback should refer to the actual answer or weak area.',
            'assessment-feedback-concrete-next-action',
            feedback,
          ),
        );
      }
      if (
        weakAreas.length > 0 &&
        !includesAny(weakAreas.join(' '), [
          /ending/i,
          /-er/i,
          /-ir/i,
          /present/i,
        ])
      ) {
        issues.push(
          makeIssue(
            'fail',
            'assessment.generic-weak-area',
            'Weak areas should be specific enough to guide the next attempt.',
            'assessment-feedback-concrete-next-action',
            weakAreas.join(' | '),
          ),
        );
      }
      return { textForVariation: `${feedback} ${weakAreas.join(' ')}`, issues };
    },
  };
}

const cases: ArtifactCase[] = [
  makeSummaryCase(),
  makeRecapCase(),
  makeAnalysisCase(),
  makeProgressCase(),
  makeAssessmentCase(),
];

function selectCases(): ArtifactCase[] {
  const requested = getArg('--cases=');
  if (!requested) return cases;
  const ids = requested
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
  return ids.map((id) => {
    const testCase = byId.get(id);
    if (!testCase) {
      throw new Error(`Unknown artifact-personalization case: ${id}`);
    }
    return testCase;
  });
}

function aggregateVariationIssues(results: CaseResult[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const openingCounts = new Map<string, string[]>();

  for (const result of results) {
    const key = openingKey(result.textForVariation);
    if (!key) continue;
    const bucket = openingCounts.get(key) ?? [];
    bucket.push(result.case.id);
    openingCounts.set(key, bucket);
  }

  for (const [key, ids] of openingCounts) {
    if (ids.length >= 3) {
      issues.push(
        makeIssue(
          'fail',
          'variation.repeated-opening',
          'Three or more artifact outputs started with the same wording.',
          'aggregate',
          `${key}: ${ids.join(', ')}`,
        ),
      );
    }
  }

  const genericHits = results.filter((result) =>
    includesAny(result.textForVariation, GENERIC_PHRASES),
  );
  if (genericHits.length >= 2) {
    issues.push(
      makeIssue(
        'fail',
        'variation.generic-artifacts',
        'Multiple artifacts used generic progress language instead of current-session details.',
        'aggregate',
        genericHits.map((result) => result.case.id).join(', '),
      ),
    );
  }

  return issues;
}

async function runCase(testCase: ArtifactCase): Promise<CaseResult> {
  const start = Date.now();
  const rawResponse = await callLlm(testCase.messages, {
    flow: 'artifact-personalization',
    rung: 2,
    ...(testCase.responseFormat
      ? { responseFormat: testCase.responseFormat }
      : {}),
  });
  const validation = testCase.validate(rawResponse);
  return {
    case: {
      id: testCase.id,
      label: testCase.label,
      artifactType: testCase.artifactType,
    },
    rawResponse,
    textForVariation: validation.textForVariation,
    issues: validation.issues,
    durationMs: Date.now() - start,
  };
}

function renderMarkdown(
  results: CaseResult[],
  aggregateIssues: QualityIssue[],
): string {
  const issues = [
    ...results.flatMap((result) => result.issues),
    ...aggregateIssues,
  ];
  const failures = issues.filter((issue) => issue.severity === 'fail');
  const lines = [
    '# Artifact Personalization Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Cases: ${results.length}`,
    `Failures: ${failures.length}`,
    '',
    '| Case | Artifact | Duration | Issues |',
    '| --- | --- | ---: | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| ${result.case.id} | ${result.case.artifactType} | ${result.durationMs}ms | ${
        result.issues.length === 0
          ? 'none'
          : result.issues.map((issue) => issue.code).join(', ')
      } |`,
    );
  }

  if (issues.length > 0) {
    lines.push('', '## Issues', '');
    for (const issue of issues) {
      lines.push(
        `- ${issue.severity}/${issue.code}/${issue.caseId}: ${issue.message}`,
      );
      if (issue.snippet) lines.push(`  Snippet: ${issue.snippet}`);
    }
  }

  lines.push(
    '',
    '## Coverage',
    '',
    'Covers internal summaries, learner recaps, learner-memory analysis, parent progress summaries, and challenge feedback for freshness, specificity, next-action quality, and cross-artifact variation.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  if (hasFlag('--help')) {
    console.log(
      [
        'Usage: pnpm test:llm:artifact-personalization -- [options]',
        '',
        'Options:',
        '  --list-cases',
        '  --cases=summary-specific-reentry,progress-summary-current-state',
        '  --run-id=<id>',
        '  --results-dir=<path>',
      ].join('\n'),
    );
    return;
  }

  if (hasFlag('--list-cases')) {
    console.log(
      cases.map((testCase) => `${testCase.id}: ${testCase.label}`).join('\n'),
    );
    return;
  }

  const selected = selectCases();
  const runId = getRunId();
  const resultsDirArg = getArg('--results-dir=');
  const resultsDir = resultsDirArg
    ? path.resolve(resultsDirArg)
    : path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'tmp',
        'artifact-personalization',
        'results',
      );
  await mkdir(resultsDir, { recursive: true });

  const results: CaseResult[] = [];
  for (const testCase of selected) {
    const result = await runCase(testCase);
    results.push(result);
    const casePath = path.join(resultsDir, `${runId}-${testCase.id}.json`);
    await writeFile(casePath, JSON.stringify(result, null, 2));
    console.log(`[${testCase.id}] wrote ${casePath}`);
  }

  const aggregateIssues = aggregateVariationIssues(results);
  const allJsonPath = path.join(resultsDir, `${runId}-all.json`);
  const reportPath = path.join(resultsDir, `${runId}-report.md`);
  await writeFile(
    allJsonPath,
    JSON.stringify({ results, aggregateIssues }, null, 2),
  );
  await writeFile(reportPath, renderMarkdown(results, aggregateIssues));
  console.log(`[done] wrote ${allJsonPath}`);
  console.log(`[done] wrote ${reportPath}`);

  const failures = [
    ...results.flatMap((result) => result.issues),
    ...aggregateIssues,
  ].filter((issue) => issue.severity === 'fail');
  if (failures.length > 0) {
    throw new Error(
      `Artifact personalization gate failed with ${failures.length} issue(s). See ${reportPath}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
