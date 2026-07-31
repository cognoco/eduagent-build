#!/usr/bin/env zsh

set -eu

raw_json=${1:?raw Playwright JSON path required}
raw_console=${2:?raw Playwright console path required}

setup_results='[]'
top_level_error_count=0
json_state=missing

if [[ -f "$raw_json" ]]; then
  if jq -e 'type == "object"' "$raw_json" >/dev/null 2>&1; then
    json_state=valid
    top_level_error_count=$(jq -r '[.errors[]?] | length' "$raw_json")
    setup_results=$(jq -c '
      [.. | objects
        | select((.tests? | type) == "array" and (.file? | type) == "string")
        | select(any(.tests[]?; .projectName == "setup"))
        | {
            title,
            outcome: (.tests[0].results[-1].status // "not-run"),
            attempts: (.tests[0].results | length),
            retryIndexes: [.tests[0].results[].retry]
          }
      ]
    ' "$raw_json")
  else
    json_state=invalid
  fi
fi

setup_scenario_count=$(print -r -- "$setup_results" | jq -r 'length')
printf 'PLAYWRIGHT_TOP_LEVEL_ERROR_COUNT=%s\n' "$top_level_error_count"
printf 'SETUP_SCENARIO_COUNT=%s\n' "$setup_scenario_count"
print -r -- "$setup_results"

failure_classes=()
if [[ "$setup_scenario_count" == "0" ]]; then
  failure_classes+=(early-run-before-setup)
fi
if [[ "$json_state" == "missing" ]]; then
  failure_classes+=(reporter-output-missing)
elif [[ "$json_state" == "invalid" ]]; then
  failure_classes+=(reporter-output-invalid)
fi

if [[ -f "$raw_console" ]]; then
  rg -q 'failed \(403\)' "$raw_console" && failure_classes+=(http-403)
  rg -q 'failed \(429\)' "$raw_console" && failure_classes+=(http-429)
  rg -q 'failed \(5[0-9][0-9]\)' "$raw_console" && failure_classes+=(http-5xx)
  rg -qi 'timeout|timed out' "$raw_console" && failure_classes+=(timeout)
  rg -q 'Could not find Clerk email address' "$raw_console" && failure_classes+=(clerk-email-lookup)
  rg -q 'Verifying Clerk seed email' "$raw_console" && failure_classes+=(clerk-email-verification)
  rg -qi 'sign.?in' "$raw_console" && failure_classes+=(sign-in)
  rg -qi 'browser.*(launch|closed|crash)' "$raw_console" && failure_classes+=(browser-runtime)
fi

if (( ${#failure_classes[@]} == 0 )); then
  failure_classes+=(unclassified)
fi
printf 'FAILURE_CLASSES=%s\n' "${(j:,:)failure_classes}"
