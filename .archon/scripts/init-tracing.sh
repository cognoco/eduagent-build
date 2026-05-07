#!/usr/bin/env bash
# Delegates to the global init-tracing script.
# Repo-local wrapper so execute-cleanup-pr.yaml's
#   bash: ./.archon/scripts/init-tracing.sh "$ARGUMENTS"
# continues to work after the canonical script moved to ~/.archon/scripts/.
exec ~/.archon/scripts/init-tracing.sh "$@"
