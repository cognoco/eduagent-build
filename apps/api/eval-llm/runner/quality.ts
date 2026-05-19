import type { QualityIssue } from './types';

export function qualityError(code: string, message: string): QualityIssue {
  return { severity: 'error', code, message };
}

export function qualityWarning(code: string, message: string): QualityIssue {
  return { severity: 'warning', code, message };
}

export function parseFirstJsonObject<T = unknown>(raw: string): T | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) {
      try {
        return JSON.parse(raw.slice(start, i + 1)) as T;
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

export function containsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function uniqueLower(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()))].filter(
    Boolean,
  );
}
