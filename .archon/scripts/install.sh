#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=./_env.sh
source "$(dirname "${BASH_SOURCE[0]}")/_env.sh"

# Resolve a working pnpm invocation.
#
# Order of preference:
#   1. `pnpm` on PATH (typical install via `corepack prepare pnpm@<v> --activate`
#      with the corepack shim on PATH, or a global pnpm binary).
#   2. `corepack pnpm` (no shim on PATH but corepack is available — common when
#      the repo's pnpm version is enabled but corepack hasn't been rehashed).
#   3. `corepack enable` once, then retry. This handles fresh worktrees on
#      machines where corepack is installed with Node but never enabled.
#
# Why this matters: Archon worktrees are checked out via Claude Code which runs
# bash nodes through `bash -c`, so the user's shell rc files don't run and PATH
# is whatever Archon's parent inherited. _env.sh prepends common pnpm install
# dirs but doesn't help when pnpm is only reachable through `corepack pnpm`.

resolve_pnpm() {
    if command -v pnpm >/dev/null 2>&1; then
        echo "pnpm"
        return 0
    fi
    if command -v corepack >/dev/null 2>&1 && corepack pnpm --version >/dev/null 2>&1; then
        echo "corepack pnpm"
        return 0
    fi
    if command -v corepack >/dev/null 2>&1; then
        echo "Enabling corepack..." >&2
        if corepack enable 2>/dev/null && corepack pnpm --version >/dev/null 2>&1; then
            echo "corepack pnpm"
            return 0
        fi
    fi
    return 1
}

if ! pnpm_cmd="$(resolve_pnpm)"; then
    echo "ERROR: pnpm not available — neither on PATH nor via corepack." >&2
    echo "Install corepack (bundled with Node ≥16) or pnpm globally." >&2
    exit 1
fi

echo "Using: ${pnpm_cmd}"
echo "Installing dependencies..."
# shellcheck disable=SC2086  # we want word-splitting on $pnpm_cmd to expand "corepack pnpm"
if ! $pnpm_cmd install --frozen-lockfile; then
    echo "Frozen lockfile failed, retrying without --frozen-lockfile..."
    # shellcheck disable=SC2086
    $pnpm_cmd install
fi

if [[ -d node_modules ]]; then
    echo "OK — node_modules exists"
else
    echo "MISSING — node_modules not found" >&2
    exit 1
fi
