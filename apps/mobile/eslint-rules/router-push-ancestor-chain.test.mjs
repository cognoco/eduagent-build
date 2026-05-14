import { RuleTester } from 'eslint';
import rule from './router-push-ancestor-chain.mjs';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

// Helper — produce a synthetic filename that maps to a known route. The rule
// reads context.filename. Use a path that ends inside src/app/.
const fileUnderLibrary = {
  filename: '/repo/apps/mobile/src/app/(app)/library.tsx',
};
const fileInsideChildStack = {
  filename:
    '/repo/apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx',
};
const fileInsideShelfStack = {
  filename:
    '/repo/apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx',
};
// Looks similar to a child of `shelf/[subjectId]` but is actually a SIBLING
// route. `startsWith` without a `/` boundary would falsely accept this.
const fileSiblingWithSuffix = {
  filename:
    '/repo/apps/mobile/src/app/(app)/shelf/[subjectId]-detail/topic/[topicId].tsx',
};

ruleTester.run('router-push-ancestor-chain', rule, {
  valid: [
    // 0 params — fine
    { code: "router.push('/(app)/library');", ...fileUnderLibrary },
    // 1 param — fine
    { code: "router.push('/session-summary/[sessionId]');", ...fileUnderLibrary },
    // 2 params with parent pushed first in the same function body (case a)
    {
      code: `function f() {
        router.push({ pathname: '/(app)/shelf/[subjectId]', params: { subjectId } });
        router.push({ pathname: '/(app)/shelf/[subjectId]/book/[bookId]', params: { subjectId, bookId } });
      }`,
      ...fileUnderLibrary,
    },
    // String-literal form, parent pushed first
    {
      code: `function f() {
        router.push('/(app)/shelf/[subjectId]');
        router.push('/(app)/shelf/[subjectId]/book/[bookId]');
      }`,
      ...fileUnderLibrary,
    },
    // 2 params, file already inside the parent stack (case b) — child/[profileId]/subjects/[subjectId].tsx
    // pushing to /(app)/child/[profileId]/topic/[topicId] is safe.
    {
      code: "router.push({ pathname: '/(app)/child/[profileId]/topic/[topicId]', params: { profileId, topicId } });",
      ...fileInsideChildStack,
    },
    // 2 params, file inside shelf/[subjectId]/book/[bookId] pushing to a sibling under shelf/[subjectId]/...
    {
      code: "router.push({ pathname: '/(app)/shelf/[subjectId]/note/[noteId]', params: { subjectId, noteId } });",
      ...fileInsideShelfStack,
    },
    // gc4-allow annotation (case c) — trailing form
    {
      code: "router.push('/(app)/shelf/[subjectId]/book/[bookId]'); // gc4-allow: parent already on stack via app state",
      ...fileUnderLibrary,
    },
    // gc4-allow annotation — leading-line form (developer writes the
    // annotation ABOVE the call). Locks behavior so a future ESLint upgrade
    // that changes comment attachment cannot silently break this path.
    {
      code: `// gc4-allow: parent already on stack
router.push('/(app)/shelf/[subjectId]/book/[bookId]');`,
      ...fileUnderLibrary,
    },
    // Non-router callees ignored
    { code: "navigation.push('/(app)/shelf/[subjectId]/book/[bookId]');", ...fileUnderLibrary },
    // Object expression with dynamic pathname — can't analyze, skip
    {
      code: "router.push({ pathname: someVariable, params: {} });",
      ...fileUnderLibrary,
    },
  ],
  invalid: [
    // Cross-stack push, no parent push, file not under the parent prefix
    {
      code: "router.push({ pathname: '/(app)/shelf/[subjectId]/book/[bookId]', params: { subjectId, bookId } });",
      ...fileUnderLibrary,
      errors: [{ messageId: 'missingParentPush' }],
    },
    // String-literal form, same problem
    {
      code: "router.push('/(app)/shelf/[subjectId]/book/[bookId]');",
      ...fileUnderLibrary,
      errors: [{ messageId: 'missingParentPush' }],
    },
    // Two pushes but the FIRST is the deep one — order matters; the second is not a parent
    {
      code: `function f() {
        router.push({ pathname: '/(app)/shelf/[subjectId]/book/[bookId]', params: { subjectId, bookId } });
        router.push({ pathname: '/(app)/shelf/[subjectId]', params: { subjectId } });
      }`,
      ...fileUnderLibrary,
      errors: [{ messageId: 'missingParentPush' }],
    },
    // Parent push to a DIFFERENT parent — does not satisfy
    {
      code: `function f() {
        router.push({ pathname: '/(app)/library', params: {} });
        router.push({ pathname: '/(app)/shelf/[subjectId]/book/[bookId]', params: { subjectId, bookId } });
      }`,
      ...fileUnderLibrary,
      errors: [{ messageId: 'missingParentPush' }],
    },
    // Regression: a sibling route whose path PREFIX-matches the parent but
    // belongs to a different stack (e.g. `[subjectId]-detail`) must still
    // be flagged. The old `startsWith` check silently passed this.
    {
      code: "router.push({ pathname: '/(app)/shelf/[subjectId]/book/[bookId]', params: { subjectId, bookId } });",
      ...fileSiblingWithSuffix,
      errors: [{ messageId: 'missingParentPush' }],
    },
    // Same prefix-match hazard for the in-function parent push: a prior
    // push to `/(app)/shelf/[subjectId]-detail` must NOT satisfy parent
    // `/(app)/shelf/[subjectId]`.
    {
      code: `function f() {
        router.push({ pathname: '/(app)/shelf/[subjectId]-detail', params: { subjectId } });
        router.push({ pathname: '/(app)/shelf/[subjectId]/book/[bookId]', params: { subjectId, bookId } });
      }`,
      ...fileUnderLibrary,
      errors: [{ messageId: 'missingParentPush' }],
    },
  ],
});
