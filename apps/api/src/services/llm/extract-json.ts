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
 * 1. Strips markdown ```json ... ``` fences if present.
 * 2. Walks brace depth (handling string escapes) to find `{ … }`.
 * 3. Returns the matched substring, or `null` if no object is found.
 */
export function extractFirstJsonObject(text: string): string | null {
  // Strip markdown code-fence wrappers if present.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenceMatch?.[1] ?? text).trim();

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
      if (depth === 0) return body.slice(start, i + 1);
    }
  }

  return null;
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
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenceMatch?.[1] ?? text).trim();

  const start = body.indexOf('[');
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
      if (depth === 0) return body.slice(start, i + 1);
    }
  }

  return null;
}
