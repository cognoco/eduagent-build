#!/usr/bin/env bash

# Shared detection for changes that can introduce stale or missing i18n keys.
# Accepts a newline-delimited file list as the first argument.
i18n_delta_needs_checks() {
  local files="${1:-}"

  [[ -n "$files" ]] || return 1

  echo "$files" | grep -Eq '^apps/mobile/src/(i18n/|.*\.(ts|tsx)$)'
}
