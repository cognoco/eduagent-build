/**
 * ESLint rule: securestore-safe-key (GC2)
 *
 * Flags string-literal SecureStore keys containing characters outside
 * `[a-zA-Z0-9._-]`. iOS Keychain rejects keys with `+`, `/`, `=`, `:`,
 * space, and non-ASCII characters at runtime, but the failure only
 * surfaces on iOS device — unit tests under jsdom/Node pass cleanly.
 *
 * The wrapper at `apps/mobile/src/lib/secure-storage.ts` exports
 * `getItemAsync`, `setItemAsync`, `deleteItemAsync`, and the helper
 * `sanitizeSecureStoreKey`. Callers must either pass a literal that
 * matches the safe set, or wrap the key in `sanitizeSecureStoreKey()`.
 * Anything in between (unsanitized `:` separators, template strings
 * with static `:` chars) crashes on iOS.
 *
 * What we flag:
 *   - `setItemAsync('bookmark-nudge:foo', '1')`   — literal contains ':'
 *   - `setItemAsync(`key:${id}`, '1')`            — static part contains ':'
 *
 * What we don't flag:
 *   - `setItemAsync(sanitizeSecureStoreKey(raw), '1')` — wrapped
 *   - `setItemAsync('safe.key_v2-final', '1')`         — safe charset
 *   - `setItemAsync(`safe-${id}`, '1')`                — static parts are safe;
 *     the `${id}` may still be unsafe at runtime (caller responsibility)
 *
 * See CLAUDE.md > Repo-Specific Guardrails > "SecureStore keys must use
 * Expo-safe characters only" and the governance audit
 * docs/_archive/plans/done/2026-05-03-governance-audit.md (item GC2).
 */

const SAFE_KEY_RE = /^[a-zA-Z0-9._-]+$/;
const SAFE_STATIC_PART_RE = /^[a-zA-Z0-9._-]*$/;
const WRAPPER_FUNCTIONS = new Set([
  'getItemAsync',
  'setItemAsync',
  'deleteItemAsync',
]);

// Intentional scope: we match on function NAME only (`getItemAsync`,
// `setItemAsync`, `deleteItemAsync`) regardless of import source. This is
// safe in practice because the mobile config bans direct `expo-secure-store`
// imports outside `lib/secure-storage` (see G2 in apps/mobile/eslint.config.mjs),
// so any call with these names in mobile source code is a SecureStore
// wrapper call. A third-party library that exposed an object with one of
// these method names could create a false positive, but no such library is
// currently in scope — accept that trade-off for rule simplicity.
function isWrapperCall(node) {
  const callee = node.callee;
  if (!callee) return false;
  if (callee.type === 'Identifier' && WRAPPER_FUNCTIONS.has(callee.name)) {
    return true;
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.property &&
    callee.property.type === 'Identifier' &&
    WRAPPER_FUNCTIONS.has(callee.property.name)
  ) {
    return true;
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Flag SecureStore keys containing characters outside [a-zA-Z0-9._-]. iOS Keychain rejects unsafe chars at runtime.',
    },
    schema: [],
    messages: {
      unsafeLiteral:
        "SecureStore key '{{ key }}' contains character(s) outside [a-zA-Z0-9._-]. iOS Keychain rejects this at runtime. Use safe chars only, or wrap with sanitizeSecureStoreKey().",
      unsafeTemplate:
        "SecureStore key template static part '{{ part }}' contains character(s) outside [a-zA-Z0-9._-]. iOS Keychain rejects this at runtime. Use safe separators (`_`, `-`, `.`) or wrap with sanitizeSecureStoreKey().",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (!isWrapperCall(node)) return;
        const firstArg = node.arguments[0];
        if (!firstArg) return;

        if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
          if (!SAFE_KEY_RE.test(firstArg.value)) {
            context.report({
              node: firstArg,
              messageId: 'unsafeLiteral',
              data: { key: firstArg.value },
            });
          }
          return;
        }

        if (firstArg.type === 'TemplateLiteral') {
          for (const quasi of firstArg.quasis) {
            const cooked = quasi.value.cooked ?? '';
            if (!SAFE_STATIC_PART_RE.test(cooked)) {
              context.report({
                node: quasi,
                messageId: 'unsafeTemplate',
                data: { part: cooked },
              });
            }
          }
        }
      },
    };
  },
};

export default rule;
