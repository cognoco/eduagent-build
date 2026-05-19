#!/usr/bin/env bash
# Thin wrapper around scripts/validate-maestro-flows/index.ts.
# See docs/audit/e2e/validator-spec.md for the check definitions (C1-C7) and
# docs/audit/e2e/m1b-execution-brief.md for the rollout context.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

if [ ! -d node_modules ]; then
  echo "Maestro validator requires 'pnpm install' to have been run." >&2
  exit 2
fi

exec node_modules/.bin/tsx scripts/validate-maestro-flows/index.ts "$@"
