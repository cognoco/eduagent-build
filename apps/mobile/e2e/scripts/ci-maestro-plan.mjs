#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const e2eRoot = resolve(scriptDir, '..');
const repoRoot = resolve(e2eRoot, '../../..');
const manifest = JSON.parse(
  readFileSync(join(e2eRoot, 'ci-maestro-manifest.json'), 'utf8'),
);
const scheduledTags = new Set(['smoke', 'nightly', 'pr-blocking']);
const nonExecutableTags = new Set(['blocked', 'manual']);

function fail(message) {
  process.stderr.write(`[ci-maestro-plan] ${message}\n`);
  process.exit(1);
}

function walkYaml(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkYaml(path);
    return /\.ya?ml$/.test(entry.name) ? [path] : [];
  });
}

function flowMetadata(path) {
  const source = readFileSync(path, 'utf8');
  const header = parseAllDocuments(source)[0]?.toJSON() ?? {};
  return {
    flow: relative(e2eRoot, path).replaceAll('\\', '/'),
    source,
    tags: Array.isArray(header.tags) ? header.tags.map(String) : [],
  };
}

function validSeedScenarios() {
  const source = readFileSync(
    join(repoRoot, 'apps/api/src/services/test-seed.ts'),
    'utf8',
  );
  const typeBlock = source.match(
    /export type SeedScenario\s*=([\s\S]*?);\n/,
  )?.[1];
  if (!typeBlock) fail('could not read SeedScenario from test-seed.ts');
  return new Set(
    [...typeBlock.matchAll(/\|\s*'([^']+)'/g)].map((match) => match[1]),
  );
}

function resolveScenario(metadata, validScenarios) {
  if (Object.hasOwn(manifest.scenarioOverrides, metadata.flow)) {
    return manifest.scenarioOverrides[metadata.flow];
  }

  const scenarios = [
    ...new Set(
      [...metadata.source.matchAll(/SEED_SCENARIO:\s*["']?([a-z0-9-]+)/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  if (scenarios.length !== 1) {
    fail(
      `${metadata.flow} must declare one SEED_SCENARIO or an explicit scenarioOverrides entry`,
    );
  }
  if (!validScenarios.has(scenarios[0])) {
    fail(`${metadata.flow} names unknown seed scenario ${scenarios[0]}`);
  }
  return scenarios[0];
}

function assignScenarioShards(entries, shardCount) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.scenario ?? 'unseeded';
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const loads = Array.from({ length: shardCount }, (_, index) => ({
    shard: index + 1,
    count: 0,
  }));
  const scenarioShard = new Map();
  const orderedGroups = [...groups.entries()].sort(
    ([leftKey, left], [rightKey, right]) =>
      right.length - left.length || leftKey.localeCompare(rightKey),
  );
  for (const [scenario, group] of orderedGroups) {
    loads.sort(
      (left, right) => left.count - right.count || left.shard - right.shard,
    );
    scenarioShard.set(scenario, loads[0].shard);
    loads[0].count += group.length;
  }

  return entries.map((entry) => ({
    ...entry,
    shard: scenarioShard.get(entry.scenario ?? 'unseeded'),
  }));
}

function validateManifest(allFlows, validScenarios) {
  const byPath = new Map(allFlows.map((flow) => [flow.flow, flow]));
  const taggedPr = new Set(
    allFlows
      .filter(({ tags }) => tags.includes('pr-blocking'))
      .map(({ flow }) => flow),
  );
  const manifestPr = new Set(manifest.pr.map(({ flow }) => flow));

  for (const [flow, scenario] of Object.entries(manifest.scenarioOverrides)) {
    if (!byPath.has(flow))
      fail(`scenario override flow does not exist: ${flow}`);
    if (scenario !== null && !validScenarios.has(scenario)) {
      fail(
        `scenario override for ${flow} names unknown seed scenario ${scenario}`,
      );
    }
  }

  if (manifestPr.size !== manifest.pr.length)
    fail('PR manifest contains duplicate flows');
  for (const flow of taggedPr) {
    if (!manifestPr.has(flow))
      fail(`pr-blocking flow missing from PR manifest: ${flow}`);
  }
  for (const { flow, scenario } of manifest.pr) {
    const metadata = byPath.get(flow);
    if (!metadata) fail(`PR manifest flow does not exist: ${flow}`);
    if (!taggedPr.has(flow))
      fail(`PR manifest flow lacks pr-blocking tag: ${flow}`);
    if (scenario !== null && !validScenarios.has(scenario)) {
      fail(`PR manifest flow ${flow} names unknown seed scenario ${scenario}`);
    }
    const resolved = resolveScenario(metadata, validScenarios);
    if (resolved !== scenario) {
      fail(
        `PR manifest scenario mismatch for ${flow}: ${scenario} != ${resolved}`,
      );
    }
  }
}

function buildPlan(suite) {
  const validScenarios = validSeedScenarios();
  const allFlows = walkYaml(join(e2eRoot, 'flows')).map(flowMetadata);
  validateManifest(allFlows, validScenarios);

  const selected =
    suite === 'pr'
      ? manifest.pr
      : allFlows
          .filter(
            ({ tags }) =>
              tags.some((tag) => scheduledTags.has(tag)) &&
              !tags.some((tag) => nonExecutableTags.has(tag)),
          )
          .map((metadata) => ({
            flow: metadata.flow,
            scenario: resolveScenario(metadata, validScenarios),
          }));
  const shardCount = suite === 'pr' ? 4 : 8;

  return assignScenarioShards(selected, shardCount).sort((left, right) =>
    left.flow.localeCompare(right.flow),
  );
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const suite = option('--suite');
if (suite !== 'pr' && suite !== 'nightly')
  fail('--suite must be pr or nightly');
const format = option('--format') ?? 'tsv';
const all = process.argv.includes('--all');
const shardOption = option('--shard');
if (!all && !shardOption) fail('provide --all or --shard N');

let plan = buildPlan(suite);
if (!all) {
  const shard = Number(shardOption);
  if (!Number.isInteger(shard) || shard < 1)
    fail('--shard must be a positive integer');
  plan = plan.filter((entry) => entry.shard === shard);
}

if (format === 'json') {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else if (format === 'tsv') {
  for (const { flow, scenario } of plan) {
    process.stdout.write(`${scenario ?? '-'}\t${flow}\n`);
  }
} else {
  fail('--format must be json or tsv');
}
