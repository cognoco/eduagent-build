/**
 * ESLint rule: router-push-ancestor-chain (GC4)
 *
 * Expo Router's `router.push` does not synthesise intermediate stack
 * entries. Pushing a path with two `[param]` segments from a different
 * stack — e.g. `router.push('/(app)/shelf/[subjectId]/book/[bookId]')`
 * from `library.tsx` — creates a 1-deep stack containing only the leaf.
 * `router.back()` from that leaf then falls through to the Tabs first
 * route (Home), not the parent screen the user expects.
 *
 * The rule of thumb (see CLAUDE.md → Repo-Specific Guardrails):
 *   - Push the full ancestor chain (parent first, then child), OR
 *   - Ensure the call originates from a file already inside the
 *     parent stack (no synthesis needed), OR
 *   - Annotate with `// gc4-allow: <reason>` if neither applies.
 *
 * The rule flags `router.push(...)` calls whose target has 2+
 * `[param]` segments UNLESS one of the three conditions is satisfied.
 * The parent prefix of the target is the substring before the
 * path-segment containing the SECOND `[param]`.
 *
 * Targets recognised:
 *   - String literal:   router.push('/(app)/shelf/[subjectId]/book/[bookId]')
 *   - Object literal:   router.push({ pathname: '...', params: {...} })
 *
 * Dynamic Hrefs (`router.push(href)`) and template literals with
 * concrete values are not analysed — there is no `[param]` text to
 * match. See also H7 in the governance audit for the broader
 * typed-navigate effort.
 *
 * See docs/_archive/plans/done/2026-05-03-governance-audit.md (item GC4).
 */

const PARAM_RE = /\[[^/\]]+\]/g;

function getStringLiteralValue(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}

/** Pull the pathname string out of the first arg of router.push */
function extractPathname(arg) {
  if (!arg) return null;
  const direct = getStringLiteralValue(arg);
  if (direct !== null) return direct;
  if (arg.type === 'ObjectExpression') {
    for (const prop of arg.properties) {
      if (
        prop.type === 'Property' &&
        !prop.computed &&
        ((prop.key.type === 'Identifier' && prop.key.name === 'pathname') ||
          (prop.key.type === 'Literal' && prop.key.value === 'pathname'))
      ) {
        return getStringLiteralValue(prop.value);
      }
    }
  }
  return null;
}

/**
 * Given a pathname with 2+ [param] segments, return the prefix ending
 * exactly at the FIRST [param] — that's the natural parent route in
 * Expo Router (the file `shelf/[subjectId].tsx` or `[subjectId]/index.tsx`
 * is the ancestor of `shelf/[subjectId]/book/[bookId].tsx`).
 * Returns null if fewer than 2 params present.
 *
 *   "/(app)/shelf/[subjectId]/book/[bookId]" -> "/(app)/shelf/[subjectId]"
 *   "/(app)/child/[profileId]/topic/[topicId]" -> "/(app)/child/[profileId]"
 *   "/(app)/shelf/[subjectId]/[bookId]"       -> "/(app)/shelf/[subjectId]"
 *   "/(app)/dictation/index" -> null (0 params)
 *   "/session-summary/[sessionId]" -> null (1 param)
 */
function parentPrefix(pathname) {
  const matches = [...pathname.matchAll(PARAM_RE)];
  if (matches.length < 2) return null;
  const first = matches[0];
  return pathname.slice(0, first.index + first[0].length);
}

/**
 * Derive an Expo Router route path from a filename.
 *   ".../apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx"
 *     -> "/(app)/child/[profileId]/subjects/[subjectId]"
 *   ".../apps/mobile/src/app/(app)/library.tsx"
 *     -> "/(app)/library"
 *   ".../apps/mobile/src/app/(app)/shelf/[subjectId]/index.tsx"
 *     -> "/(app)/shelf/[subjectId]"
 * Returns null if the file is not under src/app/.
 */
function fileRouteFromFilename(filename) {
  if (!filename) return null;
  const normalized = filename.replace(/\\/g, '/');
  const marker = '/src/app/';
  const idx = normalized.indexOf(marker);
  if (idx === -1) return null;
  let rest = normalized.slice(idx + marker.length);
  rest = rest.replace(/\.(tsx|ts|jsx|js)$/, '');
  rest = rest.replace(/\/index$/, '');
  return '/' + rest;
}

/** Locate the nearest enclosing function-body or program scope. */
function enclosingBody(node) {
  let n = node;
  while (n) {
    if (
      n.type === 'FunctionDeclaration' ||
      n.type === 'FunctionExpression' ||
      n.type === 'ArrowFunctionExpression'
    ) {
      return n.body && n.body.type === 'BlockStatement' ? n.body : null;
    }
    if (n.type === 'Program') return n;
    n = n.parent;
  }
  return null;
}

function commentHasGc4Allow(sourceCode, node) {
  // Same-line annotation: `router.push(...); // gc4-allow: <reason>`
  // Also covers the case where the annotation sits on the call's first
  // line via a leading comment on the argument.
  const before = sourceCode.getCommentsBefore(node);
  const after = sourceCode.getCommentsAfter(node);
  const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
  if (line.includes('gc4-allow')) return true;
  for (const c of [...before, ...after]) {
    if ((c.value ?? '').includes('gc4-allow')) return true;
  }
  return false;
}

function isRouterPush(callee) {
  return (
    callee &&
    callee.type === 'MemberExpression' &&
    callee.property &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'push' &&
    callee.object &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'router'
  );
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Flag router.push() to a 2+ [param] route without a preceding parent push or matching file route — prevents the cross-stack ancestor-chain bug.',
    },
    schema: [],
    messages: {
      missingParentPush:
        "router.push('{{ target }}') goes 2+ params deep without an intermediate parent push. Either push '{{ parent }}' first in the same function, rely on the file already being inside that parent stack, or annotate with `// gc4-allow: <reason>`. See CLAUDE.md > Repo-Specific Guardrails.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const fileRoute = fileRouteFromFilename(
      context.filename ?? context.getFilename?.(),
    );

    /** Collect every router.push pathname in a given body, preserving range order. */
    function collectPushPathnamesUpTo(bodyNode, beforeRange) {
      const results = [];
      function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (
          n.type === 'CallExpression' &&
          isRouterPush(n.callee) &&
          n.range &&
          n.range[1] <= beforeRange[0]
        ) {
          const p = extractPathname(n.arguments[0]);
          if (p) results.push(p);
        }
        for (const key of Object.keys(n)) {
          if (key === 'parent' || key === 'loc' || key === 'range') continue;
          const child = n[key];
          if (Array.isArray(child)) {
            for (const c of child) walk(c);
          } else if (child && typeof child === 'object' && child.type) {
            walk(child);
          }
        }
      }
      walk(bodyNode);
      return results;
    }

    return {
      CallExpression(node) {
        if (!isRouterPush(node.callee)) return;
        const target = extractPathname(node.arguments[0]);
        if (!target) return;
        const parent = parentPrefix(target);
        if (!parent) return; // fewer than 2 [param] segments — fine

        // (b) file's own route is already inside the parent stack
        if (fileRoute && fileRoute.startsWith(parent)) return;

        // (c) explicit allow annotation
        if (commentHasGc4Allow(sourceCode, node)) return;

        // (a) preceding sibling push in the same enclosing body
        const body = enclosingBody(node);
        if (body) {
          const priorPushes = collectPushPathnamesUpTo(body, node.range);
          for (const p of priorPushes) {
            if (p.startsWith(parent)) return;
          }
        }

        context.report({
          node: node.arguments[0] ?? node,
          messageId: 'missingParentPush',
          data: { target, parent },
        });
      },
    };
  },
};

export default rule;
