/**
 * ESLint rule: no-raw-error-to-sentry
 *
 * Flags a `captureException`/`captureMessage` call whose first argument is
 * a `catch`-clause binding — passed directly, or via `.message` — when the
 * enclosing try/catch also contains a `JSON.parse(...)` call, a Zod-style
 * `<expr>.parse(...)` call, or a raw DB-driver call (`db.select/insert/
 * update/delete/query/execute/transaction(...)`).
 *
 * Those three call shapes throw errors whose `.message` can embed a literal
 * slice of the value being parsed/queried — for a minors product that risks
 * leaking learner-authored content (homework, quiz answers) into Sentry, a
 * US processor. See `services/llm/providers/errors.ts`'s content-free error
 * pattern and `services/sentry.ts`'s doc comment on the 5 sites this rule
 * generalizes (dictation/{prepare-homework,review,generate}.ts,
 * quiz/generate-round.ts x2, fixed under WI-1990/WI-2339).
 *
 * The fix is to synthesize a content-free `new Error(label, { cause: {...} })`
 * (never interpolating the parsed/queried value) and pass THAT instead — see
 * `createProviderHttpError`/`createProviderApiError` in
 * services/llm/providers/errors.ts. A call site that does this is NOT
 * flagged: its argument is a `NewExpression`, not the catch binding (or
 * `.message` off it), so the shape check below never matches it.
 *
 * Matches both call forms: the bare identifier (`captureException(err)`, the
 * convention at every call site outside services/sentry.ts, which imports
 * the wrapper functions by name) and the namespaced SDK form
 * (`Sentry.captureException(err)`, used inside services/sentry.ts itself —
 * see sentry.ts:45,77). AC-1 says "ANY captureException/captureMessage call
 * site," and the namespaced form is real, not hypothetical.
 *
 * HEURISTIC (bounded, not full data-flow/taint analysis — see AC-2):
 * "flags a catch-block variable passed directly or via `.message` to
 * captureException/captureMessage when the SAME try/catch statement also
 * contains a JSON.parse/.parse(/DB-driver call." The bound is structural
 * (the enclosing try/catch pair), not a literal line count — a fixed N-line
 * window is fragile to reformatting and drifts as code around a call site
 * changes, whereas "same try/catch" is exactly the shape every real
 * violation and every fixed sibling site takes in this codebase (parse in
 * `try`, capture in the paired `catch`). This is deliberately narrow: it
 * does not follow the error through a wrapper function call, a
 * reassignment, or a rethrow into an outer catch. Because the structural
 * bound is the FULL TryStatement text (try block + catch block, not just
 * the try block), a `.parse(`/DB call written inside the catch body itself
 * (not just the try) also counts — silence a genuine false positive there
 * the same way as anywhere else: wrap in the content-free `new Error(...)`
 * pattern rather than passing the catch binding.
 *
 * Severity is `warn` (see the rule's registration in root eslint.config.mjs):
 * a pre-existing backlog of 20 call sites across 17 files was found when
 * this rule was authored (including namespaced call sites like
 * `Sentry.captureException` and `deps.captureException`), tracked in
 * WI-2527 (burn down the backlog + promote to `error`). This rule's job
 * today is to stop NEW violations.
 *
 * See AGENTS.md > Non-Negotiable Engineering Rules; WI-2352, WI-2527.
 */

const SENTRY_CALL_NAMES = new Set(['captureException', 'captureMessage']);

// Matches JSON.parse(...) and any <expr>.parse(...) (Zod schemas call
// .parse() the same way) — both throw messages that can embed the parsed
// text. A single `.parse(` regex covers JSON.parse too.
const PARSE_CALL_RE = /\.parse\s*\(/;

// Raw DB-driver calls (drizzle `db.<method>(...)` convention used
// throughout this repo — see AGENTS.md > Non-Negotiable Engineering Rules).
const DB_CALL_RE =
  /\bdb\.(select|insert|update|delete|query|execute|transaction)\s*\(/;

function findEnclosingCatchClause(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'CatchClause') return current;
    current = current.parent;
  }
  return null;
}

// Resolves the captured Sentry call name for both the bare-identifier form
// (`captureException(...)`) and the namespaced SDK form
// (`Sentry.captureException(...)`, used in services/sentry.ts itself).
// Returns undefined for anything else so the caller can bail out uniformly.
function sentryCalleeName(callee) {
  if (callee.type === 'Identifier' && SENTRY_CALL_NAMES.has(callee.name)) {
    return callee.name;
  }
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    SENTRY_CALL_NAMES.has(callee.property.name)
  ) {
    return callee.property.name;
  }
  return undefined;
}

function argMatchesCatchBinding(arg, catchParamName) {
  if (!catchParamName) return false;
  if (arg.type === 'Identifier' && arg.name === catchParamName) {
    return true;
  }
  if (
    arg.type === 'MemberExpression' &&
    !arg.computed &&
    arg.object.type === 'Identifier' &&
    arg.object.name === catchParamName &&
    arg.property.type === 'Identifier' &&
    arg.property.name === 'message'
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
        'Forbid raw parse/DB errors reaching captureException/captureMessage; require the content-free new Error(label, {cause}) pattern.',
    },
    schema: [],
    messages: {
      rawErrorToSentry:
        "Do not pass the raw catch-clause error{{ viaMessage }} to {{ calleeName }} — a JSON.parse/.parse()/DB-driver error's message can embed the parsed/queried content. Synthesize a content-free `new Error(label, { cause: {...} })` instead (see services/llm/providers/errors.ts) and pass that. See AGENTS.md.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const calleeName = sentryCalleeName(node.callee);
        if (!calleeName) return;

        const arg = node.arguments[0];
        if (!arg) return;

        const catchClause = findEnclosingCatchClause(node);
        if (!catchClause || catchClause.param?.type !== 'Identifier') return;

        const catchParamName = catchClause.param.name;
        if (!argMatchesCatchBinding(arg, catchParamName)) return;

        const tryStatement = catchClause.parent;
        const tryCatchText = sourceCode.getText(tryStatement);
        if (!PARSE_CALL_RE.test(tryCatchText) && !DB_CALL_RE.test(tryCatchText)) {
          return;
        }

        context.report({
          node: arg,
          messageId: 'rawErrorToSentry',
          data: {
            calleeName,
            viaMessage: arg.type === 'MemberExpression' ? ' (via .message)' : '',
          },
        });
      },
    };
  },
};

export default rule;
