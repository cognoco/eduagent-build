// ---------------------------------------------------------------------------
// Meta-test: sign-out callsite enforcement (cross-account leak guard)
//
// The cross-account state leak (2026-05-10) was caused by 8 of 9 sign-out
// call sites invoking Clerk's `signOut()` directly without clearing the
// TanStack Query cache + per-profile SecureStore keys. `signOutWithCleanup`
// (apps/mobile/src/lib/sign-out.ts) is the single source of truth for the
// cleanup sequence.
//
// This test scans the mobile sources for direct `signOut()` / `clerkSignOut()`
// invocations and fails if any appear outside the helper itself. New sign-out
// paths must import and call `signOutWithCleanup` — drift here re-opens the
// leak path that surfaces as the "We could not load your profile" error
// fallback in (app)/_layout.tsx and lets a previous user's profileId attach
// to the next signed-in user's requests as X-Profile-Id.
//
// Adding a legitimate exception? Document it in CALLSITE_EXCEPTIONS below
// with a justification. Don't disable this test.
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';

const MOBILE_SRC = path.resolve(__dirname, '..');

// File-scoped exceptions. Path is relative to apps/mobile/src.
const CALLSITE_EXCEPTIONS: ReadonlyArray<{ file: string; reason: string }> = [
  {
    file: 'lib/sign-out.ts',
    reason:
      'The centralized helper itself — this is the sole authorized site that calls Clerk signOut directly.',
  },
];

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(full, out);
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      out.push(full);
    }
  }
  return out;
}

interface Callsite {
  relPath: string;
  line: number;
  text: string;
}

// Match an invocation of an identifier `signOut` or `clerkSignOut`.
// Accepts: `await signOut(`, `void signOut(`, `signOut().catch(`,
// `signOut: clerkSignOut,` in an object literal is NOT a call and is skipped.
// We deliberately match the bare `<name>(` form so destructuring (`{ signOut }`)
// and prop passing (`clerkSignOut={signOut}`) are unaffected.
const CALL_RE = /\b(clerkSignOut|signOut)\s*\(/g;

// Skip clearly non-code occurrences:
//   - JSDoc continuation lines (`^\s*\*`)
//   - Single-line comments where `//` precedes the match
//   - The match sits inside a quoted string on the same line
function isCommentOrStringContext(line: string, matchIndex: number): boolean {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) return true;
  const upTo = line.slice(0, matchIndex);
  const slashSlashIdx = upTo.indexOf('//');
  if (slashSlashIdx !== -1) return true;
  // Count unescaped single and double quotes before the match. An odd count
  // means the match is inside a quoted string. Backticks (template literals)
  // can span lines, so use a simpler heuristic: any backtick on this line
  // before the match also suggests string context.
  const beforeMatch = upTo.replace(/\\./g, '');
  const singles = (beforeMatch.match(/'/g) ?? []).length;
  const doubles = (beforeMatch.match(/"/g) ?? []).length;
  const backticks = (beforeMatch.match(/`/g) ?? []).length;
  return singles % 2 === 1 || doubles % 2 === 1 || backticks % 2 === 1;
}

function findCallsites(filePath: string, source: string): Callsite[] {
  const callsites: Callsite[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    if (!lineText) continue;
    CALL_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CALL_RE.exec(lineText)) !== null) {
      if (isCommentOrStringContext(lineText, match.index)) continue;
      callsites.push({
        relPath: path.relative(MOBILE_SRC, filePath).replace(/\\/g, '/'),
        line: i + 1,
        text: lineText.trim(),
      });
    }
  }
  return callsites;
}

describe('sign-out call-site registry', () => {
  it('every signOut()/clerkSignOut() invocation is inside the centralized helper', () => {
    const files = walkSourceFiles(MOBILE_SRC);
    const exceptionPaths = new Set(CALLSITE_EXCEPTIONS.map((e) => e.file));
    const violations: Callsite[] = [];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      const callsites = findCallsites(file, source);
      for (const callsite of callsites) {
        if (exceptionPaths.has(callsite.relPath)) continue;
        violations.push(callsite);
      }
    }

    if (violations.length > 0) {
      const message =
        `Direct Clerk signOut() invocations found outside ` +
        `apps/mobile/src/lib/sign-out.ts. Replace with ` +
        `signOutWithCleanup({...}) so SecureStore + queryClient ` +
        `state is cleared. See CLAUDE.md > Code Quality Guards.\n\n` +
        violations
          .map((v) => `  ${v.relPath}:${v.line}\n    ${v.text}`)
          .join('\n');
      throw new Error(message);
    }
  });
});
