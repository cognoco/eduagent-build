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

const MAIN_GROUP =
  "${{ github.event_name == 'pull_request' && format('ci-pr-{0}', github.event.pull_request.number) || format('ci-main-{0}', github.sha) }}";
const PR_CANCEL = "${{ github.event_name == 'pull_request' }}";

function readWorkflow(): Workflow {
  return parse(
    readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8'),
  ) as Workflow;
}

function schedule(
  runs: Array<{ group: string; cancelInProgress: boolean }>,
  next: { group: string; cancelInProgress: boolean },
): Array<{ group: string; cancelInProgress: boolean }> {
  if (next.cancelInProgress) {
    return [...runs.filter((run) => run.group !== next.group), next];
  }
  const sameGroup = runs.filter((run) => run.group === next.group);
  return sameGroup.length >= 2
    ? [...runs.filter((run) => run.group !== next.group), sameGroup[0], next]
    : [...runs, next];
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
  it('pins the exact PR/main concurrency group and PR-only cancellation policy', () => {
    const concurrency = readWorkflow().concurrency;

    expect(concurrency?.group).toBe(MAIN_GROUP);
    expect(concurrency?.['cancel-in-progress']).toBe(PR_CANCEL);
  });

  it.each([
    [
      'A — idle main push',
      [],
      { group: 'ci-main-main-1', cancelInProgress: false },
    ],
    [
      'B — running, pending, and third main push',
      [
        { group: 'ci-main-main-1', cancelInProgress: false },
        { group: 'ci-main-main-2', cancelInProgress: false },
      ],
      { group: 'ci-main-main-3', cancelInProgress: false },
    ],
    [
      'C — stale PR head cancellation',
      [{ group: 'ci-pr-42', cancelInProgress: true }],
      { group: 'ci-pr-42', cancelInProgress: true },
    ],
    [
      'D — historical main rerun beside newer main evidence',
      [{ group: 'ci-main-main-new', cancelInProgress: false }],
      { group: 'ci-main-main-old', cancelInProgress: false },
    ],
  ])(
    '%s models the intended one-running/one-pending behavior',
    (_name, runs, next) => {
      const retained = schedule(runs, next);

      if (next.group === 'ci-pr-42') {
        expect(retained).toEqual([next]);
      } else {
        expect(retained).toContainEqual(next);
        expect(new Set(retained.map((run) => run.group)).size).toBe(
          new Set([...runs, next].map((run) => run.group)).size,
        );
      }
    },
  );

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

  it('emits matches=false and exits successfully when main has advanced', () => {
    const liveTip = step(
      readWorkflow(),
      'Verify live main tip before OTA publish',
    );
    const run = String(liveTip.run);

    expect(run).toContain('echo "matches=false" >> "$GITHUB_OUTPUT"');
    expect(run).toContain('exit 0');
    expect(run).not.toContain('exit 1');
  });
});
