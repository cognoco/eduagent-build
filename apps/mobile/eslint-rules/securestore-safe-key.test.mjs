import { RuleTester } from 'eslint';
import rule from './securestore-safe-key.mjs';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('securestore-safe-key', rule, {
  valid: [
    // Safe charset — alphanumeric, ._-
    "setItemAsync('safe.key_v2-final', '1');",
    "getItemAsync('postApprovalSeen_abc');",
    "deleteItemAsync('rating-last-prompt-uuid');",
    // Member expression call — same safe charset
    "SecureStore.setItemAsync('safe-key', '1');",
    "store.getItemAsync('a.b_c-d');",
    // Template literals where every static part is safe
    'setItemAsync(`safe-${id}`, "1");',
    'getItemAsync(`prefix.${id}.suffix`);',
    'setItemAsync(`${a}${b}`, "1");',
    // Non-literal first arg — caller responsibility (often wrapped in sanitize)
    'setItemAsync(sanitizeSecureStoreKey(raw), "1");',
    'setItemAsync(computeKey(profileId), "1");',
    'setItemAsync(key, "1");',
    // Non-wrapper functions with the same look
    "myStore.put('unsafe:key', '1');",
    "fetch('https://example.com/v1');",
    // Edge: empty arg list
    'setItemAsync();',
  ],
  invalid: [
    // The C4 violation — colon separator
    {
      code: "setItemAsync('bookmark-nudge:foo', '1');",
      errors: [{ messageId: 'unsafeLiteral' }],
    },
    // Other unsafe chars
    {
      code: "getItemAsync('child-paywall-notified-at:abc');",
      errors: [{ messageId: 'unsafeLiteral' }],
    },
    {
      code: "deleteItemAsync('key/with/slash');",
      errors: [{ messageId: 'unsafeLiteral' }],
    },
    {
      code: "setItemAsync('has space', '1');",
      errors: [{ messageId: 'unsafeLiteral' }],
    },
    {
      code: "setItemAsync('plus+sign', '1');",
      errors: [{ messageId: 'unsafeLiteral' }],
    },
    // MemberExpression call form
    {
      code: "SecureStore.setItemAsync('bad:key', '1');",
      errors: [{ messageId: 'unsafeLiteral' }],
    },
    // Template literal with unsafe static part
    {
      code: 'setItemAsync(`bookmark-nudge-shown:${id}`, "1");',
      errors: [{ messageId: 'unsafeTemplate' }],
    },
    {
      code: 'getItemAsync(`prefix:${a}:suffix`);',
      // Two unsafe static parts: "prefix:" and ":suffix"
      errors: [{ messageId: 'unsafeTemplate' }, { messageId: 'unsafeTemplate' }],
    },
  ],
});
