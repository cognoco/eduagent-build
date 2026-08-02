import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

type Concurrency = {
  group?: unknown;
  'cancel-in-progress'?: unknown;
};

type Workflow = {
  concurrency?: Concurrency;
  jobs?: Record<
    string,
    { concurrency?: Concurrency; steps?: Array<Record<string, unknown>> }
  >;
};

type Run = { group: string; cancelInProgress: boolean; sha: string };

const MAIN_GROUP =
  "${{ github.event_name == 'pull_request' && format('ci-pr-{0}', github.event.pull_request.number) || format('ci-main-{0}', github.sha) }}";
const PR_CANCEL = "${{ github.event_name == 'pull_request' }}";

// The pre-fix group: pull requests keyed by PR number, everything else keyed by
// the ref — so every main push shares one `ci-refs/heads/main` group. Kept here
// so the baseline defect and the current workflow are scored by the *same*
// evaluator; a separately hand-written baseline would prove nothing.
const BASELINE_GROUP =
  'ci-${{ github.event.pull_request.number || github.ref }}';

function readWorkflow(): Workflow {
  return parse(
    readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8'),
  ) as Workflow;
}

/* ------------------------------------------------------------------ *
 * Minimal GitHub Actions expression evaluator.
 *
 * Supports exactly what workflow concurrency keys use: context paths,
 * single-quoted strings, `format()`, `==`/`!=`, `!`, and operand-returning
 * `&&`/`||` with GitHub's falsy set (false, 0, '', null, undefined).
 * Deliberately dependency-free.
 * ------------------------------------------------------------------ */

type Token = { kind: 'op' | 'string' | 'number' | 'path'; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "'") {
      let value = '';
      index += 1;
      while (index < source.length) {
        if (source[index] === "'") {
          if (source[index + 1] === "'") {
            value += "'";
            index += 2;
            continue;
          }
          break;
        }
        value += source[index];
        index += 1;
      }
      index += 1;
      tokens.push({ kind: 'string', value });
      continue;
    }

    const twoChar = source.slice(index, index + 2);
    if (['==', '!=', '&&', '||'].includes(twoChar)) {
      tokens.push({ kind: 'op', value: twoChar });
      index += 2;
      continue;
    }

    if ('()!,'.includes(char)) {
      tokens.push({ kind: 'op', value: char });
      index += 1;
      continue;
    }

    const rest = source.slice(index);
    const number = /^\d+(\.\d+)?/.exec(rest);
    if (number) {
      tokens.push({ kind: 'number', value: number[0] });
      index += number[0].length;
      continue;
    }

    const path = /^[A-Za-z_][A-Za-z0-9_.\-*]*/.exec(rest);
    if (path) {
      tokens.push({ kind: 'path', value: path[0] });
      index += path[0].length;
      continue;
    }

    throw new Error(`Unsupported character in expression: ${char}`);
  }

  return tokens;
}

function isTruthy(value: unknown): boolean {
  return !(
    value === false ||
    value === 0 ||
    value === '' ||
    value === null ||
    value === undefined
  );
}

function resolvePath(path: string, context: Record<string, unknown>): unknown {
  if (path === 'true') return true;
  if (path === 'false') return false;
  if (path === 'null') return null;

  return path
    .split('.')
    .reduce<unknown>(
      (scope, segment) =>
        scope && typeof scope === 'object'
          ? (scope as Record<string, unknown>)[segment]
          : undefined,
      context,
    );
}

function evaluateExpression(
  source: string,
  context: Record<string, unknown>,
): unknown {
  const tokens = tokenize(source);
  let position = 0;

  const peek = (): Token | undefined => tokens[position];
  const eat = (value: string): void => {
    const token = tokens[position];
    if (!token || token.value !== value) {
      throw new Error(`Expected ${value} in expression: ${source}`);
    }
    position += 1;
  };

  function parsePrimary(): unknown {
    const token = tokens[position];
    if (!token) throw new Error(`Unexpected end of expression: ${source}`);

    if (token.value === '!') {
      position += 1;
      return !isTruthy(parsePrimary());
    }

    if (token.value === '(') {
      position += 1;
      const value = parseOr();
      eat(')');
      return value;
    }

    position += 1;

    if (token.kind === 'string') return token.value;
    if (token.kind === 'number') return Number(token.value);

    if (peek()?.value === '(') {
      if (token.value !== 'format') {
        throw new Error(`Unsupported function: ${token.value}`);
      }
      position += 1;
      const args: unknown[] = [];
      while (peek() && peek()?.value !== ')') {
        args.push(parseOr());
        if (peek()?.value === ',') position += 1;
      }
      eat(')');
      const [template, ...rest] = args;
      return String(template).replace(/\{(\d+)\}/g, (_match, slot: string) =>
        String(rest[Number(slot)]),
      );
    }

    return resolvePath(token.value, context);
  }

  function parseEquality(): unknown {
    let left = parsePrimary();
    while (peek()?.value === '==' || peek()?.value === '!=') {
      const operator = tokens[position].value;
      position += 1;
      const right = parsePrimary();
      left = operator === '==' ? left === right : left !== right;
    }
    return left;
  }

  function parseAnd(): unknown {
    let left = parseEquality();
    while (peek()?.value === '&&') {
      position += 1;
      const right = parseEquality();
      left = isTruthy(left) ? right : left;
    }
    return left;
  }

  function parseOr(): unknown {
    let left = parseAnd();
    while (peek()?.value === '||') {
      position += 1;
      const right = parseAnd();
      left = isTruthy(left) ? left : right;
    }
    return left;
  }

  const result = parseOr();
  if (position !== tokens.length) {
    throw new Error(`Trailing tokens in expression: ${source}`);
  }
  return result;
}

/** Evaluate a workflow value that may mix literal text with `${{ }}` segments. */
function evaluateTemplate(
  template: unknown,
  context: Record<string, unknown>,
): unknown {
  const source = String(template);
  const single = /^\$\{\{([\s\S]*)\}\}$/.exec(source.trim());
  if (single) return evaluateExpression(single[1], context);

  return source.replace(/\$\{\{([\s\S]*?)\}\}/g, (_match, expression: string) =>
    String(evaluateExpression(expression, context)),
  );
}

function mainPushContext(sha: string): Record<string, unknown> {
  return {
    github: {
      event_name: 'push',
      ref: 'refs/heads/main',
      sha,
      event: {},
    },
  };
}

function pullRequestContext(
  number: number,
  sha: string,
): Record<string, unknown> {
  return {
    github: {
      event_name: 'pull_request',
      ref: `refs/pull/${number}/merge`,
      sha,
      event: { pull_request: { number } },
    },
  };
}

/** Build the run GitHub would queue, using the given group expression. */
function runFor(
  groupTemplate: unknown,
  cancelTemplate: unknown,
  context: Record<string, unknown>,
): Run {
  return {
    group: String(evaluateTemplate(groupTemplate, context)),
    cancelInProgress: isTruthy(evaluateTemplate(cancelTemplate, context)),
    sha: String((context.github as { sha: string }).sha),
  };
}

/**
 * GitHub's queue: at most one running + one pending run per group. A new run
 * with cancel-in-progress replaces everything in its group; otherwise it
 * *displaces the pending run* once the group already holds two.
 */
function schedule(runs: Run[], next: Run): Run[] {
  if (next.cancelInProgress) {
    return [...runs.filter((run) => run.group !== next.group), next];
  }
  const sameGroup = runs.filter((run) => run.group === next.group);
  return sameGroup.length >= 2
    ? [...runs.filter((run) => run.group !== next.group), sameGroup[0], next]
    : [...runs, next];
}

function scheduleAll(runs: Run[]): Run[] {
  return runs.reduce<Run[]>((queue, run) => schedule(queue, run), []);
}

function step(workflow: Workflow, name: string): Record<string, unknown> {
  const steps = workflow.jobs?.['ota-update']?.steps ?? [];
  const found = steps.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing ota-update step: ${name}`);
  return found;
}

function liveTipResult(expectedSha: string, currentSha: string) {
  return currentSha === expectedSha
    ? { matches: 'true', exitCode: 0 }
    : { matches: 'false', exitCode: 0 };
}

describe('CI concurrency contract', () => {
  const workflowGroup = () => readWorkflow().concurrency?.group;
  const workflowCancel = () =>
    readWorkflow().concurrency?.['cancel-in-progress'];

  it('pins the exact PR/main concurrency group and PR-only cancellation policy', () => {
    const concurrency = readWorkflow().concurrency;

    expect(concurrency?.group).toBe(MAIN_GROUP);
    expect(concurrency?.['cancel-in-progress']).toBe(PR_CANCEL);
  });

  describe('baseline defect — a shared main-ref group drops an intermediate SHA', () => {
    it('collapses every main push onto one ci-refs/heads/main group', () => {
      const groups = ['sha-1', 'sha-2', 'sha-3'].map((sha) =>
        runFor(BASELINE_GROUP, PR_CANCEL, mainPushContext(sha)),
      );

      for (const run of groups) {
        expect(run.group).toBe('ci-refs/heads/main');
        expect(run.cancelInProgress).toBe(false);
      }
    });

    it('displaces the pending middle SHA when a third main push arrives', () => {
      const retained = scheduleAll(
        ['sha-1', 'sha-2', 'sha-3'].map((sha) =>
          runFor(BASELINE_GROUP, PR_CANCEL, mainPushContext(sha)),
        ),
      );

      // sha-1 runs, sha-2 waits, sha-3 evicts sha-2 — sha-2 never gets CI.
      expect(retained.map((run) => run.sha)).toEqual(['sha-1', 'sha-3']);
      expect(retained.map((run) => run.sha)).not.toContain('sha-2');
    });
  });

  describe('current workflow — groups derived from .github/workflows/ci.yml', () => {
    it('gives each main push its own SHA-scoped group', () => {
      const runs = ['sha-1', 'sha-2', 'sha-3'].map((sha) =>
        runFor(workflowGroup(), workflowCancel(), mainPushContext(sha)),
      );

      expect(runs.map((run) => run.group)).toEqual([
        'ci-main-sha-1',
        'ci-main-sha-2',
        'ci-main-sha-3',
      ]);
      expect(runs.map((run) => run.cancelInProgress)).toEqual([
        false,
        false,
        false,
      ]);
    });

    it('retains running, pending, and third main SHAs independently', () => {
      const retained = scheduleAll(
        ['sha-1', 'sha-2', 'sha-3'].map((sha) =>
          runFor(workflowGroup(), workflowCancel(), mainPushContext(sha)),
        ),
      );

      // Mutation guard: swapping github.sha back to github.ref collapses these
      // into one group and this expectation drops to ['sha-1', 'sha-3'].
      expect(retained.map((run) => run.sha)).toEqual([
        'sha-1',
        'sha-2',
        'sha-3',
      ]);
    });

    it('A — an idle main push simply queues', () => {
      const next = runFor(
        workflowGroup(),
        workflowCancel(),
        mainPushContext('sha-1'),
      );

      expect(schedule([], next)).toEqual([next]);
    });

    it('D — a historical main rerun stays isolated from newer main evidence', () => {
      const retained = scheduleAll(
        ['sha-new', 'sha-old'].map((sha) =>
          runFor(workflowGroup(), workflowCancel(), mainPushContext(sha)),
        ),
      );

      expect(retained.map((run) => run.sha)).toEqual(['sha-new', 'sha-old']);
      expect(retained.map((run) => run.group)).toEqual([
        'ci-main-sha-new',
        'ci-main-sha-old',
      ]);
    });

    it('C — a stale pull-request head cancels the prior run in the same group', () => {
      const runs = ['pr-head-1', 'pr-head-2'].map((sha) =>
        runFor(workflowGroup(), workflowCancel(), pullRequestContext(42, sha)),
      );

      // Group-name agnostic on purpose: both heads share one PR group under any
      // PR-number-keyed expression, so this asserts cancellation behavior only.
      expect(runs[0].group).toBe(runs[1].group);
      expect(runs.map((run) => run.cancelInProgress)).toEqual([true, true]);
      expect(scheduleAll(runs).map((run) => run.sha)).toEqual(['pr-head-2']);
    });

    it('keeps pull-request and main groups from ever colliding', () => {
      const pr = runFor(
        workflowGroup(),
        workflowCancel(),
        pullRequestContext(42, 'pr-head-1'),
      );
      const main = runFor(
        workflowGroup(),
        workflowCancel(),
        mainPushContext('sha-1'),
      );

      expect(pr.group).toBe('ci-pr-42');
      expect(pr.group).not.toBe(main.group);
    });
  });

  it('serializes preview publication and requires a live main-tip proof immediately before it', () => {
    const ota = readWorkflow().jobs?.['ota-update'];
    const concurrency = ota?.concurrency;
    const liveTip = step(
      readWorkflow(),
      'Verify live main tip before OTA publish',
    );
    const publish = step(
      readWorkflow(),
      'Publish OTA update to preview channel',
    );

    expect(concurrency?.group).toBe('ota-preview');
    expect(concurrency?.['cancel-in-progress']).toBe(true);
    expect(liveTip.id).toBe('live-main-tip');
    expect(JSON.stringify(liveTip.env)).toContain('github.sha');
    expect(String(publish.if)).toContain(
      "steps.live-main-tip.outputs.matches == 'true'",
    );
  });

  it.each([
    ['stale SHA', 'sha-old', 'sha-new', { matches: 'false', exitCode: 0 }],
    [
      'current SHA',
      'sha-current',
      'sha-current',
      { matches: 'true', exitCode: 0 },
    ],
  ])(
    '%s cleanly models live-tip gating without stale publication',
    (_name, expected, current, result) => {
      expect(liveTipResult(expected, current)).toEqual(result);

      const publishAllowed = result.matches === 'true' && result.exitCode === 0;
      expect(publishAllowed).toBe(current === expected);
    },
  );

  it('skips the publish step without failing the guard when main has advanced', () => {
    const liveTip = step(
      readWorkflow(),
      'Verify live main tip before OTA publish',
    );
    const run = String(liveTip.run);

    // The guard itself exits 0 and reports matches=false; whether the job it
    // belongs to survives is decided by ota-preview's cancel-in-progress.
    expect(run).toContain('echo "matches=false" >> "$GITHUB_OUTPUT"');
    expect(run).toContain('exit 0');
    expect(run).not.toContain('exit 1');
  });
});
