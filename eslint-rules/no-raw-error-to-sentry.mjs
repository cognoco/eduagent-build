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
 * WRAPPER VALIDATION (bounded — Gate-2 rework, closes an AC-1/AC-5 gap):
 * the rule used to treat ANY `new Error(...)` as compliant, without
 * inspecting it — so `captureException(new Error(err.message))` or
 * `captureException(new Error('label', { cause: err }))` passed silently,
 * shipping the raw parse-error content the rule exists to stop (errors.ts's
 * header, ~L23/L80: the label "MUST be a content-free constant … never"
 * content-bearing). A `new Error(...)` wrapper is now flagged too when EITHER:
 *   1. its first arg (the label) is the catch binding itself, a member of
 *      it (`err.message`/`.stack`), or a template/string-concat that
 *      interpolates it (`` `...${err}...` ``, `'x' + err.message`) — the
 *      label must be a static constant, per errors.ts's own contract; or
 *   2. it passes the raw catch binding directly as `cause`
 *      (`{ cause: err }`) — the content-free shape is a STRUCTURED cause
 *      object (`{ cause: { statusLength, jsonStrLength, ... } }`), not the
 *      raw error.
 * Deliberately bounded to those two named bypasses, not full taint analysis
 * of the cause object's contents (e.g. `{ cause: { text: err.message } }`
 * buried a level deeper is not walked) — the genuine errors.ts shape
 * (static label + structured cause) stays recognized as compliant so the
 * existing AC-5 fixtures (dictation/prepare-homework.ts's real pattern)
 * keep passing.
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

function isErrorWrapperCall(node) {
  return (
    node.type === 'NewExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'Error'
  );
}

// True iff `node` is, or (through a template/string-concat) interpolates,
// the catch binding — any member access off it (`.message`, `.stack`, …)
// counts too. Bounded: only direct references, TemplateLiteral expressions,
// and `+`-concat operands are walked; a reference nested inside a function
// call or another expression shape is not followed (see file header).
function referencesCatchBinding(node, catchParamName) {
  if (!node) return false;
  if (node.type === 'Identifier' && node.name === catchParamName) return true;
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    node.object.name === catchParamName
  ) {
    return true;
  }
  if (node.type === 'TemplateLiteral') {
    return node.expressions.some((expr) =>
      referencesCatchBinding(expr, catchParamName),
    );
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return (
      referencesCatchBinding(node.left, catchParamName) ||
      referencesCatchBinding(node.right, catchParamName)
    );
  }
  return false;
}

// Bounded compliance check for a `new Error(...)` wrapper — see the file
// header's WRAPPER VALIDATION note. Returns a human-readable bypass reason,
// or null when the wrapper is recognized as content-free.
function wrapperContentLeakReason(newExprNode, catchParamName) {
  const label = newExprNode.arguments[0];
  if (referencesCatchBinding(label, catchParamName)) {
    return 'its label references the catch binding — the label must be a static, content-free constant';
  }

  const options = newExprNode.arguments[1];
  if (options && options.type === 'ObjectExpression') {
    for (const prop of options.properties) {
      if (
        prop.type === 'Property' &&
        !prop.computed &&
        ((prop.key.type === 'Identifier' && prop.key.name === 'cause') ||
          (prop.key.type === 'Literal' && prop.key.value === 'cause')) &&
        prop.value.type === 'Identifier' &&
        prop.value.name === catchParamName
      ) {
        return 'its cause is the raw catch-clause error — cause must be a structured, content-free object, not the raw error';
      }
    }
  }

  return null;
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
      nonContentFreeWrapper:
        'The `new Error(...)` wrapper passed to {{ calleeName }} is not content-free: {{ reason }}. See services/llm/providers/errors.ts for the compliant pattern. See AGENTS.md.',
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

        const tryStatement = catchClause.parent;
        const tryCatchText = sourceCode.getText(tryStatement);
        if (!PARSE_CALL_RE.test(tryCatchText) && !DB_CALL_RE.test(tryCatchText)) {
          return;
        }

        if (argMatchesCatchBinding(arg, catchParamName)) {
          context.report({
            node: arg,
            messageId: 'rawErrorToSentry',
            data: {
              calleeName,
              viaMessage: arg.type === 'MemberExpression' ? ' (via .message)' : '',
            },
          });
          return;
        }

        if (isErrorWrapperCall(arg)) {
          const reason = wrapperContentLeakReason(arg, catchParamName);
          if (reason) {
            context.report({
              node: arg,
              messageId: 'nonContentFreeWrapper',
              data: { calleeName, reason },
            });
          }
        }
      },
    };
  },
};

export default rule;
