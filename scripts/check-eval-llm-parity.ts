import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'apps/api/eval-llm/snapshots';
const FACTS = 'apps/api/eval-llm/snapshots-facts';
const MAX_CHAR_DELTA = 50;
const SECTION_HEADERS = [
  'mentor memory',
  'memory:',
  'recent struggles',
  'strengths',
  'interests',
  'communication notes',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSections(md: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const headerRe = new RegExp(
    `(^|\\n)(#{1,4}\\s*)?(${SECTION_HEADERS.map(escapeRegExp).join(
      '|'
    )})\\b[^\\n]*`,
    'gi'
  );
  const positions: Array<{ header: string; start: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(md)) !== null) {
    const header = match[3];
    if (!header) continue;
    positions.push({
      header: header.toLowerCase(),
      start: match.index + (match[1] === '\n' ? 1 : 0),
    });
  }

  for (let i = 0; i < positions.length; i += 1) {
    const current = positions[i];
    if (!current) continue;
    const next = positions[i + 1];
    const end = next ? next.start : md.length;
    const bullets = md
      .slice(current.start, end)
      .split('\n')
      .filter((line) => /^\s*[-*]\s/.test(line))
      .map((line) => line.trim().replace(/\s+/g, ' '));
    const existing = out.get(current.header) ?? new Set<string>();
    for (const bullet of bullets) existing.add(bullet);
    out.set(current.header, existing);
  }
  return out;
}

function walk(rel = ''): string[] {
  const dir = join(BASE, rel);
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(join(rel, entry)));
    } else if (entry.endsWith('.md')) {
      files.push(join(rel, entry));
    }
  }
  return files;
}

function compareSets(a: Set<string>, b: Set<string>) {
  return {
    onlyA: [...a].filter((value) => !b.has(value)),
    onlyB: [...b].filter((value) => !a.has(value)),
  };
}

if (!existsSync(BASE) || !existsSync(FACTS)) {
  console.error(`Missing snapshot directories: ${BASE} and/or ${FACTS}`);
  process.exit(1);
}

let failed = 0;
for (const relPath of walk()) {
  const basePath = join(BASE, relPath);
  const factsPath = join(FACTS, relPath);
  if (!existsSync(factsPath)) {
    console.error(`MISSING PAIR: ${relPath}`);
    failed += 1;
    continue;
  }

  const base = readFileSync(basePath, 'utf8');
  const facts = readFileSync(factsPath, 'utf8');
  const baseSections = extractSections(base);
  const factsSections = extractSections(facts);
  const headers = new Set([...baseSections.keys(), ...factsSections.keys()]);

  for (const header of headers) {
    const { onlyA, onlyB } = compareSets(
      baseSections.get(header) ?? new Set(),
      factsSections.get(header) ?? new Set()
    );
    if (onlyA.length || onlyB.length) {
      console.error(`PARITY FAIL: ${relPath} [${header}]`);
      onlyA.forEach((value) => console.error(`  JSONB only: ${value}`));
      onlyB.forEach((value) => console.error(`  facts only: ${value}`));
      failed += 1;
    }
  }

  const charDelta = Math.abs(base.length - facts.length);
  if (charDelta > MAX_CHAR_DELTA) {
    console.error(`LENGTH PARITY FAIL: ${relPath} (delta=${charDelta})`);
    failed += 1;
  }
}

process.exit(failed > 0 ? 1 : 0);
