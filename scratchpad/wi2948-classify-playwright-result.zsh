#!/usr/bin/env zsh

set -eu

raw_json=${1:?raw Playwright JSON path required}
phase_events=${2:?Playwright preload phase path required}

setup_results='[]'
top_level_error_count=0
reporter_output_valid=0

if [[ -f "$raw_json" ]] && jq -e 'type == "object"' "$raw_json" >/dev/null 2>&1; then
  reporter_output_valid=1
  top_level_error_count=$(jq -r '[.errors[]?] | length' "$raw_json")
  setup_results=$(jq -c '
    [.. | objects
      | select((.tests? | type) == "array" and (.file? | type) == "string")
      | select(any(.tests[]?; .projectName == "setup"))
      | {
          outcome: (.tests[0].results[-1].status // "not-run"),
          attempts: (.tests[0].results | length),
          retryIndexes: [.tests[0].results[].retry]
        }
    ]
  ' "$raw_json")
fi

phase_events_valid=0
if [[ -f "$phase_events" ]]; then
  phase_events_valid=1
  if rg -q -v '^(reporter-ready|global-setup-started|global-setup-completed|global-setup-failed|tests-discovered|setup-test-begin|setup-test-body-entered)$' "$phase_events"; then
    phase_events_valid=0
  fi
fi

count_phase() {
  local phase=$1
  local count=0
  if [[ "$phase_events_valid" == "1" ]]; then
    count=$(rg -c -x "$phase" "$phase_events" 2>/dev/null || true)
    count=${count:-0}
  fi
  print -r -- "$count"
}

reporter_ready_count=$(count_phase reporter-ready)
global_setup_started_count=$(count_phase global-setup-started)
global_setup_completed_count=$(count_phase global-setup-completed)
global_setup_failed_count=$(count_phase global-setup-failed)
discovery_completed_count=$(count_phase tests-discovered)
setup_test_begin_count=$(count_phase setup-test-begin)
setup_body_entered_count=$(count_phase setup-test-body-entered)
setup_scenario_count=$(print -r -- "$setup_results" | jq -r 'length')
setup_passed_count=$(print -r -- "$setup_results" | jq -r '[.[] | select(.outcome == "passed")] | length')
setup_failed_count=$(print -r -- "$setup_results" | jq -r '[.[] | select(.outcome == "failed")] | length')
setup_skipped_count=$(print -r -- "$setup_results" | jq -r '[.[] | select(.outcome == "skipped")] | length')
setup_other_count=$(print -r -- "$setup_results" | jq -r '[.[] | select(.outcome != "passed" and .outcome != "failed" and .outcome != "skipped")] | length')
setup_attempt_count=$(print -r -- "$setup_results" | jq -r '[.[].attempts] | add // 0')
setup_retry_count=$(print -r -- "$setup_results" | jq -r '[.[].retryIndexes[] | select(. > 0)] | length')

printf 'PLAYWRIGHT_REPORTER_OUTPUT_VALID=%s\n' "$reporter_output_valid"
printf 'PLAYWRIGHT_TOP_LEVEL_ERROR_COUNT=%s\n' "$top_level_error_count"
printf 'SETUP_SCENARIO_COUNT=%s\n' "$setup_scenario_count"
printf 'SETUP_PASSED_COUNT=%s\n' "$setup_passed_count"
printf 'SETUP_FAILED_COUNT=%s\n' "$setup_failed_count"
printf 'SETUP_SKIPPED_COUNT=%s\n' "$setup_skipped_count"
printf 'SETUP_OTHER_COUNT=%s\n' "$setup_other_count"
printf 'SETUP_ATTEMPT_COUNT=%s\n' "$setup_attempt_count"
printf 'SETUP_RETRY_COUNT=%s\n' "$setup_retry_count"
printf 'PHASE_EVENTS_VALID=%s\n' "$phase_events_valid"
printf 'PHASE_REPORTER_READY_COUNT=%s\n' "$reporter_ready_count"
printf 'PHASE_GLOBAL_SETUP_STARTED_COUNT=%s\n' "$global_setup_started_count"
printf 'PHASE_GLOBAL_SETUP_COMPLETED_COUNT=%s\n' "$global_setup_completed_count"
printf 'PHASE_GLOBAL_SETUP_FAILED_COUNT=%s\n' "$global_setup_failed_count"
printf 'PHASE_DISCOVERY_COMPLETED_COUNT=%s\n' "$discovery_completed_count"
printf 'PHASE_SETUP_TEST_BEGIN_COUNT=%s\n' "$setup_test_begin_count"
printf 'PHASE_SETUP_BODY_ENTERED_COUNT=%s\n' "$setup_body_entered_count"

failure_class=unclassified-preload
if [[ "$phase_events_valid" == "1" ]]; then
  if ((
    reporter_ready_count == 0 &&
    global_setup_started_count == 0 &&
    global_setup_completed_count == 0 &&
    global_setup_failed_count == 0 &&
    discovery_completed_count == 0 &&
    setup_test_begin_count == 0 &&
    setup_body_entered_count == 0
  )); then
    failure_class=configuration-test-discovery
  elif ((
    reporter_ready_count == 1 &&
    global_setup_started_count == 0 &&
    global_setup_completed_count == 0 &&
    global_setup_failed_count == 0 &&
    discovery_completed_count == 0 &&
    setup_test_begin_count == 0 &&
    setup_body_entered_count == 0
  )); then
    failure_class=web-server-startup-timeout
  elif ((
    reporter_ready_count == 1 &&
    global_setup_started_count == 1 &&
    global_setup_completed_count == 0 &&
    global_setup_failed_count <= 1 &&
    discovery_completed_count == 0 &&
    setup_test_begin_count == 0 &&
    setup_body_entered_count == 0
  )); then
    failure_class=global-setup-failure
  elif ((
    reporter_ready_count == 1 &&
    global_setup_started_count == 1 &&
    global_setup_completed_count == 1 &&
    global_setup_failed_count == 0 &&
    discovery_completed_count == 0 &&
    setup_test_begin_count == 0 &&
    setup_body_entered_count == 0
  )); then
    failure_class=configuration-test-discovery
  elif ((
    reporter_ready_count == 1 &&
    global_setup_started_count == 1 &&
    global_setup_completed_count == 1 &&
    global_setup_failed_count == 0 &&
    discovery_completed_count == 1 &&
    setup_body_entered_count < setup_test_begin_count
  )); then
    failure_class=browser-worker-or-fixture-pre-body
  elif ((
    reporter_ready_count == 1 &&
    global_setup_started_count == 1 &&
    global_setup_completed_count == 1 &&
    global_setup_failed_count == 0 &&
    discovery_completed_count == 1 &&
    setup_test_begin_count == 0 &&
    setup_body_entered_count == 0 &&
    setup_scenario_count == 0
  )); then
    failure_class=browser-worker-or-fixture-pre-body
  elif (( setup_scenario_count > 0 && setup_body_entered_count > 0 )); then
    failure_class=setup-scenario-failure
  fi
fi

printf 'FAILURE_CLASSES=%s\n' "$failure_class"
