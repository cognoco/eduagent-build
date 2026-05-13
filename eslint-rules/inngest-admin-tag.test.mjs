import { RuleTester } from 'eslint';
import rule from './inngest-admin-tag.mjs';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

const inngestFile = {
  filename: '/repo/apps/api/src/inngest/functions/my-function.ts',
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
  ],
});
