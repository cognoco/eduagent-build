import { RuleTester } from 'eslint';
import rule from './inngest-admin-tag.mjs';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

const inngestFile = {
  filename: '/repo/apps/api/src/inngest/functions/my-function.ts',
};
const nestedInngestFile = {
  filename: '/repo/apps/api/src/inngest/functions/billing/cron.ts',
};
const inngestTestFile = {
  filename: '/repo/apps/api/src/inngest/functions/my-function.test.ts',
};
const nonInngestFile = {
  filename: '/repo/apps/api/src/services/foo.ts',
};

ruleTester.run('inngest-admin-tag', rule, {
  valid: [
    // Not an Inngest function file — rule does not apply.
    {
      code: "const x = await db.query.profiles.findFirst({ where: eq(profiles.id, id) });",
      ...nonInngestFile,
    },
    // Test files — rule does not apply.
    {
      code: "const x = await db.query.profiles.findFirst({ where: eq(profiles.id, id) });",
      ...inngestTestFile,
    },
    // Inngest file with @inngest-admin: tag at top
    {
      code: `// @inngest-admin: cross-profile
const fn = async () => {
  const x = await db.query.profiles.findFirst({});
};`,
      ...inngestFile,
    },
    // Inngest file with different reason value
    {
      code: `// @inngest-admin: parent-chain (subjects.profileId enforced)
const fn = async () => {
  const x = await db.select().from(table);
};`,
      ...inngestFile,
    },
    // Inngest file that imports createScopedRepository (uses scoped pattern)
    {
      code: `import { createScopedRepository } from '../../services/scope';
const fn = async (profileId) => {
  const repo = createScopedRepository(profileId);
  await repo.profiles.findFirst();
};`,
      ...inngestFile,
    },
    // Inngest file with no raw db access — rule does not flag
    {
      code: `import { someService } from '../../services/x';
const fn = async () => { await someService(); };`,
      ...inngestFile,
    },
    // Member access on something other than `db` (e.g., dbClient.query) — not flagged
    {
      code: `const fn = async () => { await dbClient.query.foo.findFirst({}); };`,
      ...inngestFile,
    },
  ],
  invalid: [
    // Raw db.query, no tag, no scoped import
    {
      code: `const fn = async () => {
  const x = await db.query.profiles.findFirst({});
};`,
      ...inngestFile,
      errors: [{ messageId: 'missingAdminTag' }],
    },
    // Raw db.select
    {
      code: `const fn = async () => {
  const rows = await db.select().from(profiles);
};`,
      ...inngestFile,
      errors: [{ messageId: 'missingAdminTag' }],
    },
    // Raw db.insert
    {
      code: `const fn = async () => {
  await db.insert(profiles).values({ id: 'x' });
};`,
      ...inngestFile,
      errors: [{ messageId: 'missingAdminTag' }],
    },
    // Tag exists but with empty value — must have a non-empty reason after the colon
    {
      code: `// @inngest-admin:
const fn = async () => {
  const x = await db.query.profiles.findFirst({});
};`,
      ...inngestFile,
      errors: [{ messageId: 'missingAdminTag' }],
    },
    // Reports only ONCE per file even if multiple raw-db sites exist
    {
      code: `const fn = async () => {
  const a = await db.query.profiles.findFirst({});
  const b = await db.select().from(profiles);
  await db.insert(profiles).values({});
};`,
      ...inngestFile,
      errors: [{ messageId: 'missingAdminTag' }],
    },
    // Regression: createScopedRepository in a comment must NOT count as a
    // real import — the rule used to use a textual regex and would bypass.
    {
      code: `// note: this function used to use createScopedRepository before refactor
const fn = async () => {
  const x = await db.query.profiles.findFirst({});
};`,
      ...inngestFile,
      errors: [{ messageId: 'missingAdminTag' }],
    },
    // Regression: createScopedRepository inside a string literal also must
    // not count — same false-negative class as the comment case.
    {
      code: `const helper = 'createScopedRepository';
const fn = async () => {
  const x = await db.select().from(profiles);
};`,
      ...inngestFile,
      errors: [{ messageId: 'missingAdminTag' }],
    },
    // Regression: nested function file under functions/ — the path regex
    // used to require a flat layout and silently skip nested files.
    {
      code: `const fn = async () => {
  const x = await db.query.profiles.findFirst({});
};`,
      ...nestedInngestFile,
      errors: [{ messageId: 'missingAdminTag' }],
    },
    // Regression: a tag buried inside a function body must NOT count as
    // a file-level declaration. The annotation has to be a visible
    // preamble — anything inside top-level statement bodies is too hidden
    // to act as documentation for the scoping decision.
    {
      code: `const fn = async () => {
  // @inngest-admin: cross-profile
  const x = await db.query.profiles.findFirst({});
};`,
      ...inngestFile,
      errors: [{ messageId: 'missingAdminTag' }],
    },
    // Regression: raw-db call lives inside a NESTED function body, not the
    // top-level arrow. The rule walks MemberExpression nodes globally, so
    // depth must not change the verdict.
    {
      code: `const outer = async () => {
  const inner = async () => {
    const x = await db.query.profiles.findFirst({});
  };
  await inner();
};`,
      ...inngestFile,
      errors: [{ messageId: 'missingAdminTag' }],
    },
  ],
});
