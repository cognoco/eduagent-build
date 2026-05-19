import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  _clearProviders,
  _resetCircuits,
  registerProvider,
  routeAndCall,
  type ChatMessage,
  type ChatResult,
  type ChatStreamResult,
  type LLMProvider,
  type ModelConfig,
  type PreferredLlmProvider,
} from '../apps/api/src/services/llm/index';
import { makeChatStreamResult } from '../apps/api/src/services/llm/types';

type FailureKind = 'timeout' | '503' | 'malformed-json' | 'rate-limit';
type IssueSeverity = 'fail' | 'warn';

interface DegradationCase {
  id: string;
  label: string;
  primaryProvider: PreferredLlmProvider;
  failureKind: FailureKind;
  rung: 1 | 2 | 3 | 4 | 5;
  llmTier?: 'flash' | 'standard' | 'premium';
  preferredProvider?: PreferredLlmProvider;
  providerPolicy?: 'default' | 'gemini_only';
  expectedProvider?: PreferredLlmProvider;
  expectError?: boolean;
}

interface QualityIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  caseId: string;
  snippet?: string;
}

interface ProviderCall {
  provider: string;
  model: string;
}

interface CaseResult {
  case: DegradationCase;
  calls: ProviderCall[];
  responseProvider?: string;
  responseModel?: string;
  error?: string;
  issues: QualityIssue[];
  durationMs: number;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getArg(prefix: string): string | undefined {
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
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

const cases: DegradationCase[] = [
  {
    id: 'gemini-timeout-standard-fallback',
    label: 'Gemini timeout falls back for standard learner flow',
    primaryProvider: 'gemini',
    failureKind: 'timeout',
    rung: 3,
    expectedProvider: 'openai',
  },
  {
    id: 'family-gemini-only-503-no-leak',
    label: 'Family standard Gemini-only does not leak to forbidden providers',
    primaryProvider: 'gemini',
    failureKind: '503',
    rung: 4,
    providerPolicy: 'gemini_only',
    expectError: true,
  },
  {
    id: 'plus-claude-rate-limit-degrades',
    label: 'Plus Claude rate-limit degrades to Gemini fallback',
    primaryProvider: 'anthropic',
    failureKind: 'rate-limit',
    rung: 4,
    llmTier: 'premium',
    preferredProvider: 'anthropic',
    expectedProvider: 'gemini',
  },
  {
    id: 'plus-openai-malformed-json-degrades',
    label: 'Plus OpenAI malformed JSON failure degrades to Gemini fallback',
    primaryProvider: 'openai',
    failureKind: 'malformed-json',
    rung: 5,
    llmTier: 'premium',
    preferredProvider: 'openai',
    expectedProvider: 'gemini',
  },
];

function selectCases(): DegradationCase[] {
  const requested = getArg('--cases=');
  if (!requested) return cases;
  const ids = requested
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const byId = new Map(cases.map((testCase) => [testCase.id, testCase]));
  return ids.map((id) => {
    const testCase = byId.get(id);
    if (!testCase) throw new Error(`Unknown provider-degradation case: ${id}`);
    return testCase;
  });
}

function makeFailure(kind: FailureKind): Error & {
  status?: number;
  statusCode?: number;
} {
  switch (kind) {
    case 'timeout': {
      const error = new Error('Provider request timed out');
      error.name = 'AbortError';
      return error;
    }
    case '503': {
      const error = new Error('503 Service Unavailable') as Error & {
        status?: number;
      };
      error.status = 503;
      return error;
    }
    case 'rate-limit': {
      const error = new Error('429 rate limit') as Error & {
        status?: number;
      };
      error.status = 429;
      return error;
    }
    case 'malformed-json':
      return new SyntaxError('Malformed JSON returned by provider');
  }
}

function createProvider(
  id: PreferredLlmProvider,
  calls: ProviderCall[],
  failing?: FailureKind,
): LLMProvider {
  return {
    id,
    async chat(
      _messages: ChatMessage[],
      config: ModelConfig,
    ): Promise<ChatResult> {
      calls.push({ provider: id, model: config.model });
      if (failing) throw makeFailure(failing);
      return {
        content: JSON.stringify({
          reply: `Recovered through ${id}`,
          signals: {},
          ui_hints: {},
          private_sources: { relied_on: ['deterministic_reasoning'] },
        }),
        stopReason: 'stop',
      };
    },
    chatStream(): ChatStreamResult {
      return makeChatStreamResult(
        (async function* () {
          yield `Recovered through ${id}`;
        })(),
        Promise.resolve('stop'),
      );
    },
  };
}

function registerCaseProviders(testCase: DegradationCase): ProviderCall[] {
  const calls: ProviderCall[] = [];
  _clearProviders();
  _resetCircuits();
  for (const provider of ['gemini', 'openai', 'anthropic'] as const) {
    registerProvider(
      createProvider(
        provider,
        calls,
        provider === testCase.primaryProvider
          ? testCase.failureKind
          : undefined,
      ),
    );
  }
  return calls;
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

async function runCase(testCase: DegradationCase): Promise<CaseResult> {
  const calls = registerCaseProviders(testCase);
  const start = Date.now();
  const issues: QualityIssue[] = [];
  try {
    const options: Parameters<typeof routeAndCall>[2] = {
      flow: 'provider-degradation',
    };
    if (testCase.llmTier) options.llmTier = testCase.llmTier;
    if (testCase.preferredProvider) {
      options.preferredProvider = testCase.preferredProvider;
    }
    if (testCase.providerPolicy)
      options.providerPolicy = testCase.providerPolicy;
    if (testCase.failureKind === 'malformed-json') {
      options.responseFormat = 'json';
    }

    const result = await routeAndCall(
      [
        {
          role: 'user',
          content:
            'Explain the next study step. This runner only checks provider degradation.',
        },
      ],
      testCase.rung,
      options,
    );

    if (testCase.expectError) {
      issues.push(
        makeIssue(
          'fail',
          'expected_error_not_thrown',
          'Case expected a provider-policy failure, but routeAndCall returned a response.',
          testCase.id,
          `${result.provider}/${result.model}`,
        ),
      );
    }
    if (
      testCase.expectedProvider &&
      result.provider !== testCase.expectedProvider
    ) {
      issues.push(
        makeIssue(
          'fail',
          'unexpected_provider',
          `Expected fallback provider ${testCase.expectedProvider}, got ${result.provider}.`,
          testCase.id,
          calls.map((call) => `${call.provider}:${call.model}`).join(', '),
        ),
      );
    }

    return {
      case: testCase,
      calls,
      responseProvider: result.provider,
      responseModel: result.model,
      issues,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!testCase.expectError) {
      issues.push(
        makeIssue(
          'fail',
          'unexpected_error',
          'Case expected graceful degradation, but routeAndCall threw.',
          testCase.id,
          message,
        ),
      );
    }
    if (
      testCase.providerPolicy === 'gemini_only' &&
      calls.some((call) => call.provider !== 'gemini')
    ) {
      issues.push(
        makeIssue(
          'fail',
          'forbidden_provider_leak',
          'Gemini-only policy attempted a non-Gemini provider.',
          testCase.id,
          calls.map((call) => `${call.provider}:${call.model}`).join(', '),
        ),
      );
    }
    return {
      case: testCase,
      calls,
      error: message,
      issues,
      durationMs: Date.now() - start,
    };
  } finally {
    _clearProviders();
    _resetCircuits();
  }
}

function renderMarkdown(results: CaseResult[]): string {
  const issues = results.flatMap((result) => result.issues);
  const failures = issues.filter((issue) => issue.severity === 'fail');
  const lines = [
    '# Provider Degradation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Cases: ${results.length}`,
    `Failures: ${failures.length}`,
    '',
    '| Case | Outcome | Calls | Issues |',
    '| --- | --- | --- | --- |',
  ];

  for (const result of results) {
    const outcome = result.error
      ? `error: ${result.error}`
      : `${result.responseProvider}/${result.responseModel}`;
    lines.push(
      `| ${result.case.id} | ${outcome.replace(/\|/g, '/')} | ${result.calls
        .map((call) => `${call.provider}:${call.model}`)
        .join('<br>')} | ${
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
    'Covers timeout, 503, malformed JSON, and rate-limit failures with router-level fallback and Gemini-only provider-policy protection.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  if (hasFlag('--help')) {
    console.log(
      [
        'Usage: pnpm test:llm:provider-degradation -- [options]',
        '',
        'Options:',
        '  --list-cases',
        '  --cases=gemini-timeout-standard-fallback,plus-claude-rate-limit-degrades',
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
        'provider-degradation',
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

  const allJsonPath = path.join(resultsDir, `${runId}-all.json`);
  const reportPath = path.join(resultsDir, `${runId}-report.md`);
  await writeFile(allJsonPath, JSON.stringify(results, null, 2));
  await writeFile(reportPath, renderMarkdown(results));
  console.log(`[done] wrote ${allJsonPath}`);
  console.log(`[done] wrote ${reportPath}`);

  const failures = results
    .flatMap((result) => result.issues)
    .filter((issue) => issue.severity === 'fail');
  if (failures.length > 0) {
    throw new Error(
      `Provider degradation gate failed with ${failures.length} issue(s). See ${reportPath}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
