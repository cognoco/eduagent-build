#!/usr/bin/env zsh

set -u
umask 077

classification_file='.workitem-artifacts/WI-2948/ramtop-node22-seeded-signin-classification.txt'
classifier=${0:A:h}/wi2948-classify-playwright-result.zsh
mkdir -p "${classification_file:h}"
: >"$classification_file"
chmod 600 "$classification_file"
exec >"$classification_file"

evidence_tmp=$(mktemp -d "${TMPDIR:-/tmp}/wi2948-ramtop.XXXXXX")
trap 'rm -rf -- "$evidence_tmp"' EXIT

raw_json="$evidence_tmp/playwright.json"
raw_console="$evidence_tmp/console.log"
phase_events="$evidence_tmp/preload-phases.txt"
: >"$phase_events"
chmod 600 "$phase_events"
started_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
run_id="wi2948-ramtop-$(date -u +%Y%m%dT%H%M%SZ)"
machine=$(hostname)
node_version=$(mise exec node@22 -- node --version)
head_sha=$(git rev-parse HEAD)
workflow_candidate_blob=$(git hash-object .github/workflows/e2e-web.yml)
contract_candidate_blob=$(git hash-object scripts/e2e-ci-injection-and-smoke-gate.test.ts)

set +e
CI=1 \
PLAYWRIGHT_SKIP_LOCAL_API=1 \
E2E_ENV=staging \
PLAYWRIGHT_API_URL=https://api-stg.mentomate.com \
EXPO_PUBLIC_API_URL=https://api-stg.mentomate.com \
EXPO_PUBLIC_ENABLE_MODE_NAV=true \
EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true \
EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true \
PLAYWRIGHT_RUN_ID="$run_id" \
PLAYWRIGHT_PRELOAD_PHASE_FILE="$phase_events" \
PLAYWRIGHT_JSON_OUTPUT_FILE="$raw_json" \
env -u CLERK_SECRET_KEY -u CLERK_TESTING_TOKEN -u DOPPLER_TOKEN \
mise exec node@22 -- doppler run --project mentomate --config stg \
  --no-cache --no-fallback \
  --only-secrets="TEST_SEED_SECRET,CLERK_PUBLISHABLE_KEY,CLERK_SECRET_KEY" -- \
  zsh -f -c 'set -eu; [[ -n "${CLERK_SECRET_KEY:-}" ]] || { print -u2 "Refusing setup proof: aligned staging CLERK_SECRET_KEY is absent"; exit 4; }; [[ -z "${CLERK_TESTING_TOKEN:-}" ]] || { print -u2 "Refusing setup proof: ambient CLERK_TESTING_TOKEN crossed the boundary"; exit 4; }; export EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY"; export PLAYWRIGHT_TEST_SEED_SECRET="$TEST_SEED_SECRET"; pnpm exec playwright test -c apps/mobile/playwright.config.ts --project=setup --workers=1 --retries=0' \
  >"$raw_console" 2>&1
run_status=$?
set -e

finished_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
teardown_failure_count=$(rg -c '\[global-teardown\] resetSeededAccounts failed' "$raw_console" 2>/dev/null || true)
teardown_failure_count=${teardown_failure_count:-0}

if [[ "$run_status" -ne 0 || "$teardown_failure_count" != "0" ]]; then
  printf 'PLAYWRIGHT_EXIT=%s\n' "$run_status"
  printf 'GLOBAL_TEARDOWN_FAILURE_COUNT=%s\n' "$teardown_failure_count"
  zsh "$classifier" "$raw_json" "$phase_events"
  exit 3
fi

if ! jq -e '
  [.. | objects
    | select((.tests? | type) == "array" and (.file? | type) == "string")
    | select(any(.tests[]?; .projectName == "setup"))
    | {
        project: .tests[0].projectName,
        expectedStatus: .tests[0].expectedStatus,
        outcome: .tests[0].results[-1].status,
        attempts: (.tests[0].results | length),
        retryIndexes: [.tests[0].results[].retry]
      }
  ]
  | length == 3
    and all(.[]; .project == "setup" and .expectedStatus == "passed" and .outcome == "passed" and .attempts == 1 and .retryIndexes == [0])
' "$raw_json" >/dev/null
then
  printf 'RECEIPT_VALIDATION=failed\n'
  zsh "$classifier" "$raw_json" "$phase_events"
  exit 5
fi

source_sha=$(shasum -a 256 "$raw_json" | cut -d ' ' -f1)
command_shape='CI=1 PLAYWRIGHT_SKIP_LOCAL_API=1 E2E_ENV=staging PLAYWRIGHT_API_URL=https://api-stg.mentomate.com EXPO_PUBLIC_API_URL=https://api-stg.mentomate.com EXPO_PUBLIC_ENABLE_MODE_NAV=true EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true EXPO_PUBLIC_ENABLE_MODE_NAV_V2=true PLAYWRIGHT_RUN_ID=<recorded-run-id> PLAYWRIGHT_PRELOAD_PHASE_FILE=<mode-0600-temporary-file> PLAYWRIGHT_JSON_OUTPUT_FILE=<mode-0700-temporary-directory> env -u CLERK_SECRET_KEY -u CLERK_TESTING_TOKEN -u DOPPLER_TOKEN mise exec node@22 -- doppler run --project mentomate --config stg --no-cache --no-fallback --only-secrets="TEST_SEED_SECRET,CLERK_PUBLISHABLE_KEY,CLERK_SECRET_KEY" -- zsh -f -c '\''require aligned staging CLERK_SECRET_KEY present and ambient CLERK_TESTING_TOKEN absent; export EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY"; export PLAYWRIGHT_TEST_SEED_SECRET="$TEST_SEED_SECRET"; pnpm exec playwright test -c apps/mobile/playwright.config.ts --project=setup --workers=1 --retries=0'\'''

jq \
  --arg schema 'wi-2948.ramtop-seeded-signin-receipt.v1' \
  --arg startedUtc "$started_utc" \
  --arg finishedUtc "$finished_utc" \
  --arg machine "$machine" \
  --arg os "$(uname -s)" \
  --arg nodeVersion "$node_version" \
  --arg headSha "$head_sha" \
  --arg workflowCandidateBlob "$workflow_candidate_blob" \
  --arg contractCandidateBlob "$contract_candidate_blob" \
  --arg runId "$run_id" \
  --arg sourceSha256 "$source_sha" \
  --arg artifactPointer 'docs/evidence/WI-2948/ramtop-node22-seeded-signin-receipt.json' \
  --arg commandShape "$command_shape" \
  '
  {
    schema: $schema,
    startedUtc: $startedUtc,
    finishedUtc: $finishedUtc,
    machine: $machine,
    os: $os,
    nodeVersion: $nodeVersion,
    gitHead: $headSha,
    candidateBlobs: {
      workflow: $workflowCandidateBlob,
      contractTest: $contractCandidateBlob
    },
    runId: $runId,
    target: "https://api-stg.mentomate.com",
    credentialBoundary: "Doppler stg live read; only TEST_SEED_SECRET, CLERK_PUBLISHABLE_KEY, and the aligned CLERK_SECRET_KEY injected; ambient CLERK_TESTING_TOKEN explicitly unset",
    commandShape: $commandShape,
    configuredRetries: 0,
    configuredWorkers: 1,
    globalTeardownReset: "passed",
    sourceResultSha256: $sourceSha256,
    artifactPointer: $artifactPointer,
    scenarios: [.. | objects
      | select((.tests? | type) == "array" and (.file? | type) == "string")
      | select(any(.tests[]?; .projectName == "setup"))
      | {
          title,
          seedScenario: (.title | capture("^seed (?<scenario>.+) and capture ").scenario),
          storageState: (.title | capture(" and capture (?<state>.+) storage state$").state),
          outcome: .tests[0].results[-1].status,
          attempts: (.tests[0].results | length),
          retryIndexes: [.tests[0].results[].retry],
          durationMs: ([.tests[0].results[].duration] | add)
        }
    ],
    summary: {passed: 3, failed: 0, retriesObserved: 0}
  }
  ' "$raw_json"
