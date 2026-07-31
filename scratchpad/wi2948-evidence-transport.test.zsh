#!/usr/bin/env zsh

set -eu

target=${0:A:h}/wi2948-ramtop-receipt.zsh
classifier=${0:A:h}/wi2948-classify-playwright-result.zsh
classification_literal='.workitem-artifacts/WI-2948/ramtop-node22-seeded-signin-classification.txt'

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

if rg -q 'trap .*classification_file|rm .*classification_file' "$target"; then
  print -u2 'classification file appears in a cleanup path'
  exit 1
fi

rg -q -F "printf 'RECEIPT_VALIDATION=failed\\n'" "$target" || {
  print -u2 'receipt-shape failure has no durable sanitized classification'
  exit 1
}

fixture_tmp=$(mktemp -d "${TMPDIR:-/tmp}/wi2948-classifier-test.XXXXXX")
trap 'rm -rf -- "$fixture_tmp"' EXIT
fixture_json="$fixture_tmp/early-run.json"
fixture_console="$fixture_tmp/early-run.log"
print -r -- '{"suites":[],"errors":[{"message":"SENSITIVE_ERROR_SENTINEL"}],"stats":{"unexpected":0}}' >"$fixture_json"
print -r -- 'SENSITIVE_CONSOLE_SENTINEL' >"$fixture_console"

classification=$(zsh "$classifier" "$fixture_json" "$fixture_console")
expected_classification=$'PLAYWRIGHT_TOP_LEVEL_ERROR_COUNT=1\nSETUP_SCENARIO_COUNT=0\n[]\nFAILURE_CLASSES=early-run-before-setup'
[[ "$classification" == "$expected_classification" ]] || {
  print -u2 'early-run classification did not preserve the safe allowlisted contract'
  exit 1
}
if [[ "$classification" == *SENSITIVE* ]]; then
  print -u2 'early-run classification leaked raw error or console material'
  exit 1
fi

print 'WI-2948 evidence transport contract OK'
