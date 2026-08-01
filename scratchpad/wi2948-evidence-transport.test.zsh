#!/usr/bin/env zsh

set -eu

target=${0:A:h}/wi2948-ramtop-receipt.zsh
classifier=${0:A:h}/wi2948-classify-playwright-result.zsh
discriminator=${0:A:h}/wi2948-preload-discriminator.test.mjs
playwright_config=apps/mobile/playwright.config.ts
evidence_readme=docs/evidence/WI-2948/README.md
success_receipt=docs/evidence/WI-2948/ramtop-node22-seeded-signin-receipt.json
classification_literal='.workitem-artifacts/WI-2948/ramtop-node22-seeded-signin-classification.txt'

validate_wrapper_contract() {
  local wrapper=$1

  [[ "$(rg -c -F -- '--only-secrets="TEST_SEED_SECRET,CLERK_PUBLISHABLE_KEY,CLERK_SECRET_KEY"' "$wrapper")" == "2" ]] &&
    rg -q -F '[[ -n "${CLERK_SECRET_KEY:-}" ]]' "$wrapper" &&
    rg -q -F '[[ -z "${CLERK_TESTING_TOKEN:-}" ]]' "$wrapper"
}

classification_line=$(rg -n -F "$classification_literal" "$target" | cut -d: -f1 || true)
redirect_line=$(rg -n -F 'exec >"$classification_file"' "$target" | cut -d: -f1 || true)
temporary_line=$(rg -n -F 'evidence_tmp=$(mktemp -d' "$target" | cut -d: -f1)

[[ -n "$classification_line" ]] || {
  print -u2 'missing durable WI-2948 classification path'
  exit 1
}
[[ -n "$redirect_line" ]] || {
  print -u2 'missing durable stdout redirection'
  exit 1
}
[[ "$classification_line" -lt "$temporary_line" ]] || {
  print -u2 'classification path must be established before raw temporary output'
  exit 1
}
[[ "$redirect_line" -lt "$temporary_line" ]] || {
  print -u2 'stdout must be redirected before raw temporary output is created'
  exit 1
}

rg -q -F 'chmod 600 "$classification_file"' "$target" || {
  print -u2 'classification file mode is not pinned to 0600'
  exit 1
}

rg -q -F 'chmod 600 "$phase_events"' "$target" || {
  print -u2 'preload phase file mode is not pinned to 0600'
  exit 1
}

rg -q -F "process.env.PLAYWRIGHT_PRELOAD_PHASE_FILE" "$playwright_config" &&
  rg -q -F "['json']" "$playwright_config" &&
  rg -q -F '[preloadPhaseReporter]' "$playwright_config" || {
  print -u2 'Playwright config does not compose the bounded JSON and phase reporters on the proof path'
  exit 1
}

if rg -q -F -- '--reporter=' "$target"; then
  print -u2 'proof wrapper overrides the configured line reporter'
  exit 1
fi

validate_wrapper_contract "$target" || {
  print -u2 'proof wrapper does not preserve the exact fail-closed Clerk credential boundary'
  exit 1
}
print 'transport canonical pass: exact allowlist and both refusal guards present'

if rg -q -F 'CLERK_SECRET_KEY crossed the allowlisted boundary' "$target"; then
  print -u2 'proof wrapper still rejects the Clerk backend key that clerkSetup requires'
  exit 1
fi

rg -q -F 'PLAYWRIGHT_JSON_OUTPUT_FILE=<mode-0700-temporary-directory>' \
  "$target" || {
  print -u2 'durable command shape omits the private JSON reporter destination'
  exit 1
}

rg -q -F 'if (!mutant.ok)' "$discriminator" &&
  rg -q -F 'mutation-classifier-error' "$discriminator" || {
  print -u2 'mutation harness does not separate classifier failure from a killed mutant'
  exit 1
}

rg -q -F '[ramtop-node22-seeded-signin-receipt.json](ramtop-node22-seeded-signin-receipt.json)' \
  "$evidence_readme" || {
  print -u2 'evidence README does not link the tracked success receipt'
  exit 1
}
[[ -f "$success_receipt" ]] || {
  print -u2 'evidence README success-receipt link is dead'
  exit 1
}
jq -e \
  --arg pointer "$success_receipt" \
  '.schema == "wi-2948.ramtop-seeded-signin-receipt.v1"
    and .artifactPointer == $pointer
    and .configuredRetries == 0
    and .configuredWorkers == 1
    and .globalTeardownReset == "passed"
    and .summary == {passed: 3, failed: 0, retriesObserved: 0}
    and (.scenarios | length) == 3
    and ([.scenarios[] | {seedScenario, storageState}] == [
      {seedScenario: "onboarding-complete", storageState: "solo-learner"},
      {seedScenario: "parent-multi-child", storageState: "owner-with-children"},
      {seedScenario: "v2-account-non-owner-child", storageState: "non-owner-child"}
    ])
    and all(.scenarios[]; .outcome == "passed" and .attempts == 1 and .retryIndexes == [0])' \
  "$success_receipt" >/dev/null || {
  print -u2 'tracked success receipt does not validate its identity and successful outcomes'
  exit 1
}
[[ "$(shasum -a 256 "$success_receipt" | cut -d' ' -f1)" == \
  'eca82eb14a1edb2709477d99bc5067557ac83d4b6a8bc7730f05b07715bbc231' ]] || {
  print -u2 'tracked success receipt hash differs from the reviewed durable evidence'
  exit 1
}
rg -q -F 'exactly `TEST_SEED_SECRET`, `CLERK_PUBLISHABLE_KEY`, and the aligned staging `CLERK_SECRET_KEY`' \
  "$evidence_readme" || {
  print -u2 'evidence README does not state the current three-secret proof boundary'
  exit 1
}

if rg -q 'trap .*classification_file|rm .*classification_file' "$target"; then
  print -u2 'classification file appears in a cleanup path'
  exit 1
fi

rg -q -F "printf 'RECEIPT_VALIDATION=failed\\n'" "$target" || {
  print -u2 'receipt-shape failure has no durable sanitized classification'
  exit 1
}

rg -q -F "recordPreloadPhase('setup-test-body-entered')" \
  apps/mobile/e2e-web/helpers/auth.setup.ts || {
  print -u2 'setup test body has no bounded entry marker'
  exit 1
}

rg -q -F "recordPreloadPhase('web-server-command-started')" \
  apps/mobile/e2e-web/helpers/serve-exported-web.mjs || {
  print -u2 'configured web-server command has no bounded start marker'
  exit 1
}

fixture_tmp=$(mktemp -d "${TMPDIR:-/tmp}/wi2948-classifier-test.XXXXXX")
trap 'rm -rf -- "$fixture_tmp"' EXIT
fixture_json="$fixture_tmp/early-run.json"
fixture_console="$fixture_tmp/early-run.log"
fixture_phases="$fixture_tmp/preload-phases.txt"
print -r -- '{"suites":[],"errors":[{"message":"SENSITIVE_ERROR_SENTINEL"}],"stats":{"unexpected":0}}' >"$fixture_json"
print -r -- 'SENSITIVE_CONSOLE_SENTINEL' >"$fixture_console"
print -r -- $'reporter-ready\nweb-server-command-started' >"$fixture_phases"

classification=$(zsh "$classifier" "$fixture_json" "$fixture_phases")
expected_classification=$'PLAYWRIGHT_REPORTER_OUTPUT_VALID=1\nPLAYWRIGHT_TOP_LEVEL_ERROR_COUNT=1\nSETUP_SCENARIO_COUNT=0\nSETUP_PASSED_COUNT=0\nSETUP_FAILED_COUNT=0\nSETUP_SKIPPED_COUNT=0\nSETUP_OTHER_COUNT=0\nSETUP_ATTEMPT_COUNT=0\nSETUP_RETRY_COUNT=0\nPHASE_EVENTS_VALID=1\nPHASE_REPORTER_READY_COUNT=1\nPHASE_WEB_SERVER_COMMAND_STARTED_COUNT=1\nPHASE_GLOBAL_SETUP_STARTED_COUNT=0\nPHASE_GLOBAL_SETUP_COMPLETED_COUNT=0\nPHASE_GLOBAL_SETUP_FAILED_COUNT=0\nPHASE_DISCOVERY_COMPLETED_COUNT=0\nPHASE_SETUP_TEST_BEGIN_COUNT=0\nPHASE_SETUP_BODY_ENTERED_COUNT=0\nFAILURE_CLASSES=web-server-startup-timeout'
[[ "$classification" == "$expected_classification" ]] || {
  print -u2 'early-run classification did not preserve the safe allowlisted contract'
  exit 1
}
if [[ "$classification" == *SENSITIVE* ]]; then
  print -u2 'early-run classification leaked raw error or console material'
  exit 1
fi

mutant_dir="$fixture_tmp/transport-mutants"
mkdir -p "$mutant_dir"
node - "$target" "$mutant_dir" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [sourcePath, outputDir] = process.argv.slice(2);
const source = fs.readFileSync(sourcePath, 'utf8');
const mutations = [
  ['missing-allowlist', '--only-secrets="TEST_SEED_SECRET,CLERK_PUBLISHABLE_KEY,CLERK_SECRET_KEY"', '--only-secrets="TEST_SEED_SECRET,CLERK_PUBLISHABLE_KEY"'],
  ['missing-backend-guard', '[[ -n "${CLERK_SECRET_KEY:-}" ]]', 'true'],
  ['missing-testing-token-refusal', '[[ -z "${CLERK_TESTING_TOKEN:-}" ]]', 'true'],
];
for (const [name, before, after] of mutations) {
  if (!source.includes(before)) throw new Error(`mutation anchor missing: ${name}`);
  fs.writeFileSync(path.join(outputDir, `${name}.zsh`), source.replace(before, after));
}
NODE

for mutant in "$mutant_dir"/*.zsh; do
  if validate_wrapper_contract "$mutant"; then
    print -u2 -- "transport mutation survived: ${mutant:t:r}"
    exit 1
  fi
  print -- "transport mutation killed: ${mutant:t:r}"
done

validate_wrapper_contract "$target" || {
  print -u2 'proof wrapper was not restored after the transport mutation cycle'
  exit 1
}
print 'transport canonical restore pass: exact allowlist and both refusal guards present'

fixture_bin="$fixture_tmp/bin"
fixture_rg="$fixture_bin/rg"
mkdir -p "$fixture_bin"
{
  print -r -- '#!/usr/bin/env zsh'
  print -r -- 'exit 2'
} >"$fixture_rg"
chmod 700 "$fixture_rg"
rg_failure_classification=$(PATH="$fixture_bin:$PATH" /bin/zsh -f "$classifier" "$fixture_json" "$fixture_phases")
[[ "$rg_failure_classification" == *$'PHASE_EVENTS_VALID=0\n'* ]] &&
  [[ "$rg_failure_classification" == *$'FAILURE_CLASSES=unclassified-preload'* ]] || {
  print -u2 'phase counting command failure did not fail closed'
  print -u2 -- "$rg_failure_classification"
  exit 1
}

print 'WI-2948 evidence transport contract OK'
