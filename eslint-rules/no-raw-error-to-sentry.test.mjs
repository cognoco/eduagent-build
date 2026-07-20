import { RuleTester } from 'eslint';
import rule from './no-raw-error-to-sentry.mjs';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-raw-error-to-sentry', rule, {
  valid: [
    // Compliant pattern (AC-5): the catch binding is never passed — a
    // content-free new Error(label, {cause}) is constructed and captured
    // instead. Mirrors the fixed sibling sites (dictation/*, quiz/*).
    `async function f() {
      try {
        const parsed = JSON.parse(jsonStr);
        return schema.parse(parsed);
      } catch {
        captureException(
          new Error('Prepare-homework parse failed', {
            cause: { jsonStrLength: jsonStr.length },
          }),
          { requestPath: 'services/dictation/prepare-homework' },
        );
      }
    }`,
    // Compliant — DB-driver call in the try, but capture still wraps.
    `async function f() {
      try {
        const row = await db.select().from(table).where(eq(table.id, id));
        return row;
      } catch (err) {
        captureException(new Error('lookup failed', { cause: { code: err.code } }));
      }
    }`,
    // catch binding used for logic (not passed to Sentry) is out of scope.
    `function f() {
      try {
        JSON.parse(raw);
      } catch (err) {
        throw new UpstreamLlmError('bad json');
      }
    }`,
    // captureException call with no enclosing catch at all.
    `function report(err) { captureException(err); }`,
    // No parse/DB call in the try/catch — passing the raw error is fine
    // for this rule's scope (nothing content-bearing to leak).
    `function f() {
      try {
        doSomethingUnrelated();
      } catch (err) {
        captureException(err);
      }
    }`,
    // Namespaced SDK form (Sentry.captureException), content-free wrapper —
    // mirrors the compliant sentry.ts:45 shape.
    `async function f() {
      try {
        return JSON.parse(jsonStr);
      } catch (err) {
        Sentry.captureException(new Error('parse failed', { cause: { len: jsonStr.length } }));
      }
    }`,
  ],
  invalid: [
    // Direct pass-through of a JSON.parse-derived catch binding.
    {
      code: `async function f() {
        try {
          const parsed = JSON.parse(jsonStr);
          return schema.parse(parsed);
        } catch (err) {
          captureException(err);
        }
      }`,
      errors: [{ messageId: 'rawErrorToSentry' }],
    },
    // Via .message.
    {
      code: `function f() {
        try {
          JSON.parse(jsonStr);
        } catch (err) {
          captureMessage(err.message);
        }
      }`,
      errors: [{ messageId: 'rawErrorToSentry' }],
    },
    // Zod-style .parse() without JSON.parse.
    {
      code: `function f() {
        try {
          return quizOutputSchema.parse(raw);
        } catch (err) {
          captureException(err);
        }
      }`,
      errors: [{ messageId: 'rawErrorToSentry' }],
    },
    // Raw DB-driver call.
    {
      code: `async function f() {
        try {
          await db.insert(sessions).values(row);
        } catch (err) {
          captureException(err, { tags: { surface: 'sessions' } });
        }
      }`,
      errors: [{ messageId: 'rawErrorToSentry' }],
    },
    // Namespaced SDK form (Sentry.captureException) — the form used inside
    // services/sentry.ts itself (sentry.ts:45). AC-1 covers "ANY" call site.
    {
      code: `function f() {
        try {
          JSON.parse(jsonStr);
        } catch (err) {
          Sentry.captureException(err);
        }
      }`,
      errors: [{ messageId: 'rawErrorToSentry' }],
    },
    // Namespaced SDK form of captureMessage, via .message.
    {
      code: `function f() {
        try {
          return quizOutputSchema.parse(raw);
        } catch (err) {
          Sentry.captureMessage(err.message);
        }
      }`,
      errors: [{ messageId: 'rawErrorToSentry' }],
    },
    // DI-wrapper namespaced form (deps.captureException) — the shape that
    // found the real session-stream-response.ts backlog sites. Locks the
    // MemberExpression/DI-wrapper path against regression if
    // sentryCalleeName is ever narrowed back to Identifier-only.
    {
      code: `function f() {
        try {
          JSON.parse(raw);
        } catch (err) {
          deps.captureException(err);
        }
      }`,
      errors: [{ messageId: 'rawErrorToSentry' }],
    },
  ],
});
