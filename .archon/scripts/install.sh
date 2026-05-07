#!/usr/bin/env bash
set -euo pipefail

echo "Installing dependencies..."
if ! pnpm install --frozen-lockfile; then
    echo "Frozen lockfile failed, retrying with pnpm install..."
    pnpm install
fi

if [[ -d node_modules ]]; then
    echo "OK — node_modules exists"
else
    echo "MISSING — node_modules not found" >&2
    exit 1
fi
