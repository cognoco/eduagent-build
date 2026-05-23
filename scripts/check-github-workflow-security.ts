import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';

export interface Violation {
  file: string;
  message: string;
}

const SHA_REF = /^[a-f0-9]{40}$/;
const YAML_FILE = /\.ya?ml$/;

function listYamlFiles(rootDir: string, relativeDir: string): string[] {
  const absDir = join(rootDir, relativeDir);
  if (!existsSync(absDir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(absDir)) {
    const absPath = join(absDir, entry);
    const relPath = relative(rootDir, absPath);
    const stat = statSync(absPath);
    if (stat.isDirectory()) {
      files.push(...listYamlFiles(rootDir, relPath));
      continue;
    }
    if (YAML_FILE.test(entry)) {
      files.push(relPath);
    }
  }
  return files;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value ?? '');
}

function containsSecretReference(value: unknown): boolean {
  return stringify(value).includes('secrets.');
}

function getWorkflowOn(parsed: Record<string, unknown>): unknown {
  // The `yaml` package uses YAML 1.2 by default where `on` remains a string.
  // Keep the boolean fallback for portability if parser options change.
  return parsed.on ?? parsed.true;
}

function hasEvent(workflowOn: unknown, eventName: string): boolean {
  if (typeof workflowOn === 'string') return workflowOn === eventName;
  if (Array.isArray(workflowOn)) return workflowOn.includes(eventName);
  if (isRecord(workflowOn)) return Object.hasOwn(workflowOn, eventName);
  return false;
}

function getSteps(container: unknown): Record<string, unknown>[] {
  if (!isRecord(container)) return [];
  const steps = container.steps;
  if (!Array.isArray(steps)) return [];
  return steps.filter(isRecord);
}

function getJobEntries(parsed: Record<string, unknown>) {
  if (!isRecord(parsed.jobs)) return [];
  return Object.entries(parsed.jobs).filter(
    (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]),
  );
}

function collectPullRequestSkipOutputs(
  jobs: [string, Record<string, unknown>][],
): Set<string> {
  const outputs = new Set<string>();

  for (const [jobId, job] of jobs) {
    if (!isRecord(job.outputs)) continue;
    const jobText = stringify(job);
    if (
      !jobText.includes('github.event.workflow_run.event') ||
      !jobText.includes('pull_request') ||
      !jobText.includes('GITHUB_OUTPUT')
    ) {
      continue;
    }

    for (const outputName of Object.keys(job.outputs)) {
      if (jobText.includes(`${outputName}=false`)) {
        outputs.add(`needs.${jobId}.outputs.${outputName}`);
      }
    }
  }

  return outputs;
}

function isLocalAction(uses: string): boolean {
  return uses.startsWith('./') || uses.startsWith('../');
}

function isTrustedBaseAction(uses: string): boolean {
  return uses.startsWith('./.trusted-actions/');
}

function isExternalAction(uses: string): boolean {
  return !isLocalAction(uses) && !uses.startsWith('docker://');
}

function validateActionRef(file: string, step: Record<string, unknown>) {
  const uses = step.uses;
  if (typeof uses !== 'string' || !isExternalAction(uses)) return null;

  const atIndex = uses.lastIndexOf('@');
  if (atIndex === -1) {
    return {
      file,
      message: `${uses} must be pinned to a 40-character SHA`,
    };
  }

  const ref = uses.slice(atIndex + 1);
  if (!SHA_REF.test(ref)) {
    return {
      file,
      message: `${uses} must be pinned to a 40-character SHA`,
    };
  }

  return null;
}

function validatePipeToShell(file: string, step: Record<string, unknown>) {
  const run = step.run;
  if (typeof run !== 'string') return null;

  const pipesToShell = /\b(curl|wget)\b[\s\S]*\|\s*(sudo\s+)?(ba)?sh\b/.test(
    run,
  );
  if (!pipesToShell) return null;

  return {
    file,
    message: 'pipe-to-shell installer must be replaced or checksum-verified',
  };
}

function validateLocalSecretAction(
  file: string,
  step: Record<string, unknown>,
  pullRequestWorkflow: boolean,
  inheritedSecrets: boolean,
) {
  if (!pullRequestWorkflow) return null;
  const uses = step.uses;
  if (typeof uses !== 'string' || !isLocalAction(uses)) return null;
  if (isTrustedBaseAction(uses)) return null;
  if (
    !inheritedSecrets &&
    !containsSecretReference(step.with) &&
    !containsSecretReference(step.env)
  ) {
    return null;
  }

  return {
    file,
    message: 'local action receives secrets in a pull_request workflow',
  };
}

function validateWorkflowRunJob(
  file: string,
  workflowRun: boolean,
  job: Record<string, unknown>,
  pullRequestSkipOutputs: Set<string>,
) {
  if (!workflowRun) return null;
  const jobText = stringify(job);
  if (
    jobText.includes('github.event.workflow_run.head_sha') &&
    jobText.includes('secrets.')
  ) {
    const jobIf = stringify(job.if);
    if ([...pullRequestSkipOutputs].some((output) => jobIf.includes(output))) {
      return null;
    }

    return {
      file,
      message: 'workflow_run exposes secrets while checking out head_sha',
    };
  }
  return null;
}

function collectFileViolations(rootDir: string, file: string): Violation[] {
  const raw = readFileSync(join(rootDir, file), 'utf8');
  const violations: Violation[] = [];
  let parsed: unknown;

  try {
    parsed = parse(raw);
  } catch (error) {
    return [
      {
        file,
        message: `failed to parse YAML: ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    ];
  }

  if (!isRecord(parsed)) return violations;

  const workflowOn = getWorkflowOn(parsed);
  const pullRequestWorkflow = hasEvent(workflowOn, 'pull_request');
  const workflowRun = hasEvent(workflowOn, 'workflow_run');
  const jobs = getJobEntries(parsed);
  const pullRequestSkipOutputs = collectPullRequestSkipOutputs(jobs);
  const workflowEnvHasSecrets = containsSecretReference(parsed.env);

  for (const step of getSteps((parsed.runs as Record<string, unknown>) ?? {})) {
    const actionViolation = validateActionRef(file, step);
    if (actionViolation) violations.push(actionViolation);
    const pipeViolation = validatePipeToShell(file, step);
    if (pipeViolation) violations.push(pipeViolation);
  }

  for (const [, job] of jobs) {
    const inheritedSecrets =
      workflowEnvHasSecrets || containsSecretReference(job.env);
    const workflowRunViolation = validateWorkflowRunJob(
      file,
      workflowRun,
      job,
      pullRequestSkipOutputs,
    );
    if (workflowRunViolation) violations.push(workflowRunViolation);

    for (const step of getSteps(job)) {
      const actionViolation = validateActionRef(file, step);
      if (actionViolation) violations.push(actionViolation);

      const localSecretViolation = validateLocalSecretAction(
        file,
        step,
        pullRequestWorkflow,
        inheritedSecrets,
      );
      if (localSecretViolation) violations.push(localSecretViolation);

      const pipeViolation = validatePipeToShell(file, step);
      if (pipeViolation) violations.push(pipeViolation);
    }
  }

  return violations;
}

export function checkGithubWorkflowSecurity(rootDir: string): Violation[] {
  const files = [
    ...listYamlFiles(rootDir, '.github/workflows'),
    ...listYamlFiles(rootDir, '.github/actions'),
  ];

  return files.flatMap((file) => collectFileViolations(rootDir, file));
}

if (require.main === module) {
  const violations = checkGithubWorkflowSecurity(process.cwd());
  if (violations.length > 0) {
    console.error('GitHub workflow security check failed:');
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.message}`);
    }
    process.exit(1);
  }
  console.log('GitHub workflow security check passed.');
}
