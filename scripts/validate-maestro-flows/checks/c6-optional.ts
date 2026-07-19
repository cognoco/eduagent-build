import type {
  CheckResult,
  FlowFile,
  ValidatorInputs,
  Violation,
} from '../shared';
import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseAllDocuments,
  type Document,
  type Node,
} from 'yaml';

const OPTIONAL_TRUE_RE = /^(\s*)optional:\s*true\b(.*)$/;
const INLINE_MAP_COMMAND_RE =
  /^\s*-\s*([A-Za-z][A-Za-z0-9]*):\s*\{([^}\n]*)\}\s*(.*)$/;
const INLINE_MAP_OPTIONAL_TRUE_RE = /(?:^|,)\s*optional\s*:\s*true\b/;
const JUSTIFIED_INLINE_RE = /#\s*justified:/i;
const JUSTIFIED_PRECEDING_RE = /^\s*#\s*justified:/i;

function scanOptional(flow: FlowFile): {
  total: number;
  unjustified: Array<{ line: number }>;
} {
  const unjustified: Array<{ line: number }> = [];
  let total = 0;
  for (let i = 0; i < flow.lines.length; i++) {
    const blockOptional = flow.lines[i].match(OPTIONAL_TRUE_RE);
    const inlineMap = flow.lines[i].match(INLINE_MAP_COMMAND_RE);
    const inlineOptional =
      inlineMap && INLINE_MAP_OPTIONAL_TRUE_RE.test(inlineMap[2]);
    if (!blockOptional && !inlineOptional) continue;
    total++;
    const trailing = inlineOptional
      ? inlineMap[3] || ''
      : blockOptional?.[2] || '';
    if (JUSTIFIED_INLINE_RE.test(trailing)) continue;
    if (i > 0 && JUSTIFIED_PRECEDING_RE.test(flow.lines[i - 1])) continue;
    unjustified.push({ line: i + 1 });
  }
  return { total, unjustified };
}

function scanV2Semantics(flow: FlowFile): {
  optionals: Array<{ command: string; assertion: boolean; line?: number }>;
  parseError?: string;
} {
  try {
    const lineCounter = new LineCounter();
    const documents = parseAllDocuments(flow.contents, {
      lineCounter,
      prettyErrors: false,
    });
    const parseError = documents.flatMap((document) => document.errors)[0];
    if (parseError) {
      return {
        optionals: [],
        parseError: parseError.message.split('\n')[0],
      };
    }

    const optionals: Array<{
      command: string;
      assertion: boolean;
      line?: number;
    }> = [];
    const keyText = (key: unknown): string | undefined =>
      isScalar(key) ? String(key.value).trim() : undefined;
    const optionalLine = (key: unknown, value: unknown): number | undefined => {
      const offset =
        (isScalar(key) ? key.range?.[0] : undefined) ??
        (isScalar(value) ? value.range?.[0] : undefined);
      return offset === undefined
        ? undefined
        : lineCounter.linePos(offset).line;
    };
    const inspectOptions = (
      node: unknown,
      command: string,
      document: Document,
      aliases: Set<string>,
    ): void => {
      if (isAlias(node)) {
        if (aliases.has(node.source)) return;
        const resolved = node.resolve(document);
        if (!resolved) return;
        aliases.add(node.source);
        inspectOptions(resolved, command, document, aliases);
        aliases.delete(node.source);
        return;
      }
      if (!isMap(node)) return;
      const optionalPair = node.items.find(
        (pair) =>
          keyText(pair.key) === 'optional' &&
          isScalar(pair.value) &&
          pair.value.value === true,
      );
      if (!optionalPair) return;
      optionals.push({
        command,
        assertion: /^assert[A-Za-z0-9_]*$/.test(command),
        line: optionalLine(optionalPair.key, optionalPair.value),
      });
    };
    const walk = (
      node: unknown,
      document: Document,
      sequenceItem: boolean,
      aliases: Set<string>,
    ): void => {
      if (isAlias(node)) {
        if (aliases.has(node.source)) return;
        const resolved = node.resolve(document);
        if (!resolved) return;
        aliases.add(node.source);
        walk(resolved, document, sequenceItem, aliases);
        aliases.delete(node.source);
        return;
      }
      if (isSeq(node)) {
        for (const item of node.items) {
          walk(item, document, true, new Set(aliases));
        }
        return;
      }
      if (!isMap(node)) return;
      if (sequenceItem) {
        for (const pair of node.items) {
          const command = keyText(pair.key);
          if (command) inspectOptions(pair.value, command, document, aliases);
        }
      }
      for (const pair of node.items) {
        walk(pair.value, document, false, new Set(aliases));
      }
    };

    for (const document of documents) {
      walk(document.contents, document as Document<Node>, false, new Set());
    }
    return { optionals };
  } catch (error) {
    return {
      optionals: [],
      parseError:
        error instanceof Error ? error.message.split('\n')[0] : String(error),
    };
  }
}

const GATED_TAGS = new Set(['pr-blocking', 'smoke', 'v2']);

export function runC6(inputs: ValidatorInputs): CheckResult {
  const violations: Violation[] = [];
  let checked = 0;
  const allowedFiles = new Set(
    inputs.optionalAllowlist.map((entry) =>
      entry.replace(/^apps\/mobile\/e2e\//, ''),
    ),
  );
  const all = [...inputs.flows, ...inputs.setupFlows];
  for (const flow of all) {
    const relPath = flow.repoPath.replace(/^apps\/mobile\/e2e\//, '');
    if (!flow.tags.some((t) => GATED_TAGS.has(t))) continue;
    const isV2 = flow.tags.includes('v2');
    if (isV2) {
      const semantic = scanV2Semantics(flow);
      if (semantic.parseError) {
        violations.push({
          file: flow.repoPath,
          reason: `Malformed YAML prevents V2 hard-assert validation: ${semantic.parseError}`,
        });
        continue;
      }
      checked += semantic.optionals.length;
      for (const optional of semantic.optionals) {
        if (optional.assertion) {
          violations.push({
            file: flow.repoPath,
            line: optional.line,
            reason: `V2 hard assertion ${optional.command} cannot use optional: true; # justified and optional allowlist do not apply`,
          });
          continue;
        }
        if (allowedFiles.has(relPath)) continue;
        const currentLine = optional.line
          ? (flow.lines[optional.line - 1] ?? '')
          : '';
        const precedingLine =
          optional.line && optional.line > 1
            ? (flow.lines[optional.line - 2] ?? '')
            : '';
        if (
          JUSTIFIED_INLINE_RE.test(currentLine) ||
          JUSTIFIED_PRECEDING_RE.test(precedingLine)
        ) {
          continue;
        }
        violations.push({
          file: flow.repoPath,
          line: optional.line,
          reason:
            'optional: true in v2 flow without # justified: annotation or allowlist match',
        });
      }
      continue;
    }
    if (allowedFiles.has(relPath)) continue;
    const { total, unjustified } = scanOptional(flow);
    checked += total;
    for (const { line } of unjustified) {
      violations.push({
        file: flow.repoPath,
        line,
        reason: `optional: true in ${flow.tags.filter((t) => GATED_TAGS.has(t)).join('/')} flow without # justified: annotation or allowlist match`,
      });
    }
  }
  return {
    code: 'C6',
    title: 'Unjustified optional: true',
    passed: violations.length === 0,
    checkedCount: checked,
    violations,
  };
}

export const _internals = { scanOptional };
