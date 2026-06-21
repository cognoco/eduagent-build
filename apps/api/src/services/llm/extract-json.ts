/**
 * Shared JSON extraction utility for LLM responses.
 *
 * LLM providers sometimes wrap JSON output in markdown code fences or
 * prefix it with prose even when the prompt forbids it. This module
 * provides a robust extractor that handles both cases with a
 * brace-depth walker that correctly skips string literals.
 */

/**
 * Extract the first balanced JSON object substring from free text.
 *
 * 1. Strips markdown ```json ... ``` fences when they wrap the whole response.
 * 2. Walks brace depth (handling string escapes) to find `{ … }`.
 * 3. Returns the matched substring, or `null` if no object is found.
 */
export function extractFirstJsonObject(text: string): string | null {
  const trimmed = text.trim();
  // Strip markdown code-fence wrappers only when they wrap the whole response.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const body = (fenceMatch?.[1] ?? trimmed).trim();

  const firstCandidate = extractFirstBalancedObject(body);
  if (!firstCandidate) return null;

  if (isJsonObject(firstCandidate.value)) {
    return firstCandidate.value;
  }

  const fencedCandidate = extractFencedJsonObjectAfter(
    body,
    firstCandidate.end,
  );
  return fencedCandidate ?? firstCandidate.value;
}

function extractFirstBalancedObject(
  body: string,
): { value: string; end: number } | null {
  const start = body.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < body.length; i++) {
    const ch = body[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { value: body.slice(start, i + 1), end: i + 1 };
    }
  }

  return null;
}

function extractFencedJsonObjectAfter(
  body: string,
  afterIndex: number,
): string | null {
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(body)) !== null) {
    if (match.index < afterIndex) continue;
    const candidate = extractFirstBalancedObject(match[1] ?? '');
    if (candidate && isJsonObject(candidate.value)) return candidate.value;
  }

  return null;
}

function isJsonObject(candidate: string): boolean {
  try {
    const parsed: unknown = JSON.parse(candidate);
    return (
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}

/**
 * Extract the first balanced JSON array substring from free text.
 *
 * Mirror of `extractFirstJsonObject` for prompts that ask the LLM to return a
 * bare array (e.g. `[{...}, {...}]`). Strips markdown ```json fences and
 * walks bracket depth while respecting string literals. Returns the matched
 * substring, or `null` if no top-level array is found.
 *
 * Replaces fragile `.match(/\[[\s\S]*\]/)` sites that could grab past the
 * array end when the LLM appends prose after the JSON, or fail entirely
 * inside markdown fences.
 */
export function extractFirstJsonArray(text: string): string | null {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const body = (fenceMatch?.[1] ?? trimmed).trim();

  let searchFrom = 0;
  while (searchFrom < body.length) {
    const candidate = extractFirstBalancedArray(body, searchFrom);
    if (!candidate) return null;
    if (isJsonArray(candidate.value)) return candidate.value;
    searchFrom = candidate.end;
  }

  return null;
}

function extractFirstBalancedArray(
  body: string,
  fromIndex: number,
): { value: string; end: number } | null {
  const start = body.indexOf('[', fromIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < body.length; i++) {
    const ch = body[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return { value: body.slice(start, i + 1), end: i + 1 };
    }
  }

  return null;
}

function isJsonArray(candidate: string): boolean {
  try {
    return Array.isArray(JSON.parse(candidate));
  } catch {
    return false;
  }
}
