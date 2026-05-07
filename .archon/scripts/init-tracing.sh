#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

# Delegates to the global init-tracing script.
# Repo-local wrapper so execute-cleanup-pr.yaml's
#   bash: ./.archon/scripts/init-tracing.sh "$ARGUMENTS"
# continues to work after the canonical script moved to ~/.archon/scripts/.
target="$HOME/.archon/scripts/init-tracing.sh"
if [[ ! -f "$target" ]]; then
    echo "ERROR: $target not found." >&2
    echo "This wrapper delegates to the global Archon config repo." >&2
    echo "Set up via: git clone <archon-config-repo> ~/.archon" >&2
    exit 1
fi
exec "$target" "$@"
